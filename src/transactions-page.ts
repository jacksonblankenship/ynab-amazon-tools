// Amazon transactions page: find a charge or refund sent over from YNAB.
import { apiSearch, pace } from "./amazon-api.ts";
import { readableDates, toDay } from "./dates.ts";
import { $, $$, txt } from "./lib/dom.ts";
import { must } from "./lib/errors.ts";
import { fmt } from "./lib/money.ts";
import { sleep, until } from "./lib/spa.ts";
import { parseOrder } from "./order.ts";
import { FIND_KEY, overlay, overlayFound, overlayStop, signal } from "./overlay.ts";
import { logRequest, requestLog } from "./request-log.ts";
import { leaves } from "./scrape.ts";
import { parseTransactions, transactionRows } from "./transactions.ts";
import { isCovered, remember, rememberSweep, sweptSpan, withCached } from "./txn-cache.ts";
import type { FindQuery, Txn } from "./types.ts";

export function isFindQuery(v: unknown): v is FindQuery {
  if (typeof v !== "object" || v === null) return false;
  const q: Partial<Record<keyof FindQuery, unknown>> = v;
  return (
    typeof q.amount === "number" &&
    Number.isFinite(q.amount) &&
    typeof q.date === "string" &&
    typeof q.kind === "string" &&
    typeof q.pages === "number" &&
    typeof q.started === "number"
  );
}

/** What an order contained, for telling apart equally likely matches. Null if unreadable. */
async function orderContents(orderId: string): Promise<string | null> {
  try {
    const res = await fetch(`/your-orders/order-details?orderID=${encodeURIComponent(orderId)}`, {
      credentials: "include",
    });
    if (!res.ok) return null;
    const items = parseOrder(
      new DOMParser().parseFromString(await res.text(), "text/html"),
    ).shipments.flatMap((s) => s.items);
    const [first] = items;
    if (!first) return null;
    const title =
      first.title.length > 60 ? `${first.title.slice(0, 60).replace(/\s+\S*$/, "")}…` : first.title;
    const more = items.length - 1;
    return more ? `${title} and ${more} more item${more > 1 ? "s" : ""}` : title;
  } catch {
    return null;
  }
}

function nextPageButton() {
  const label = $$<HTMLElement & { value?: string }>(
    '.a-button-text, input[type="submit"], button, a',
  ).find((e) => /next page/i.test(txt(e) || e.value || ""));
  if (label) {
    const inner = label.closest(".a-button-inner");
    return (inner && $<HTMLElement>("input, button", inner)) || label;
  }
  return $<HTMLElement>('input[name*="NextPage"]');
}

type Loaded = "more" | "end" | "failed";

// The new transactions page loads older rows as its list scrolls, inside its own
// scrolling panel. Find that panel from a row (whatever it's called), scroll it to the
// end, and wait for more rows. A wheel event isn't needed; setting the position is enough.
async function loadMoreTransactions(rows: Element[], abort: AbortSignal): Promise<Loaded> {
  const last = rows.at(-1);
  if (!last) return "end";
  let box = last.parentElement;
  while (
    box &&
    !(
      box.scrollHeight > box.clientHeight + 5 &&
      /(auto|scroll)/.test(getComputedStyle(box).overflowY)
    )
  )
    box = box.parentElement;
  if (box) box.scrollTop = box.scrollHeight;
  else window.scrollTo(0, document.documentElement.scrollHeight);
  return settle(rows, abort);
}

// When Amazon refuses a load (usually a 429), the list ends in a visible "Something went
// wrong" with a "Try again" button. The page always carries a hidden copy, so only a
// visible one below the last row counts.
function loadError(last: Element) {
  return leaves(document.body).find(
    (e) =>
      /something went wrong|^try again$/i.test(txt(e)) &&
      last.compareDocumentPosition(e) & Node.DOCUMENT_POSITION_FOLLOWING &&
      e.getClientRects().length > 0,
  );
}

async function settle(rows: Element[], abort: AbortSignal): Promise<Loaded> {
  const last = must(rows.at(-1), "last row");
  let failed = false;
  const done = await until(
    () => (failed = !!loadError(last)) || transactionRows(document.body).length > rows.length,
    8000,
    abort,
  );
  return failed ? "failed" : done ? "more" : "end";
}

const MAX_PAGES = 25;
const THROTTLED = "Amazon may be limiting requests. Wait a few minutes and try again.";
// Asking again soon after a refusal can extend it, so hold off this long.
const COOLDOWN_MS = 30 * 60e3;

export async function transactionsPage() {
  let q: FindQuery | null = null;
  const h = new URLSearchParams(location.hash.slice(1));
  const find = h.get("acs-find");
  if (find) {
    if (!Number.isFinite(+find)) {
      history.replaceState(null, "", location.pathname + location.search);
      overlayStop(
        "Couldn't read the charge from YNAB",
        "The link didn't include a valid amount. Close this and look manually.",
      );
      return;
    }
    q = {
      amount: +find,
      date: h.get("acs-date") || "",
      kind: h.get("acs-kind") || "charge",
      pages: 0,
      started: Date.now(),
    };
    history.replaceState(null, "", location.pathname + location.search);
  } else {
    try {
      const saved: unknown = JSON.parse(sessionStorage.getItem(FIND_KEY) || "null");
      q = isFindQuery(saved) ? saved : null;
    } catch {
      q = null;
    }
    if (q && Date.now() - q.started > 5 * 60e3) q = null; // stale search
  }
  const save = (v: FindQuery | null) => {
    try {
      if (v) sessionStorage.setItem(FIND_KEY, JSON.stringify(v));
      else sessionStorage.removeItem(FIND_KEY);
    } catch {
      /* ignore */
    }
  };
  if (!q) {
    save(null);
    return;
  }
  const query = q;
  const search = signal();

  // Several comma-separated dates when YNAB's date order couldn't be determined.
  const dates = q.date ? q.date.split(",") : [];
  const targets = dates.map(toDay).filter((d) => d != null);
  const target = targets.length ? Math.min(...targets) : null;
  const distance = (day: number) => Math.min(...targets.map((t) => Math.abs(day - t)));
  const kindName = q.kind === "refund" ? "refund" : "charge";
  type Hit = Txn & { diff: number };
  // A charge covering several orders counts once per order, so each can be opened.
  const findHits = (rows: Txn[]): Hit[] =>
    rows
      .filter((r) => r.amount === query.amount && r.kind === query.kind)
      .flatMap((r) => r.orderIds.map((orderId) => ({ ...r, orderId })))
      .map((r) => {
        const day = toDay(r.date);
        // A row with no readable date can't be shown to be close, so it's left out.
        const diff = !targets.length ? 0 : day == null ? Infinity : distance(day);
        return { ...r, diff };
      })
      .filter((r) => r.diff <= 14)
      .sort((a, b) => a.diff - b.diff);
  const isPast = (rows: Txn[]) => {
    const days = rows.map((r) => toDay(r.date)).filter((d) => d != null);
    const oldest = days.length ? Math.min(...days) : null;
    return target != null && oldest != null && oldest < target - 14;
  };
  const stop = (title: string, sub: string, finished = false) => {
    save(null);
    overlayStop(title, sub, [], { finished });
  };
  const notFound = (why: string) =>
    stop(
      `No ${fmt(query.amount)} ${kindName} found`,
      dates.length
        ? `${why} Amazon usually posts a charge a day before YNAB does, so this looked within two weeks of ${readableDates(dates)}.`
        : why,
      true,
    );
  const refusedNow = (checked: number) =>
    stop(
      "Amazon is limiting how fast your transactions load",
      `It searched the ${checked} most recent transactions. Amazon's limit on loading older ones can last an hour or more, and trying again sooner can extend it.`,
    );
  const open = (hits: Hit[]) => {
    const closest = must(hits[0], "closest hit");
    save(null);
    const orderUrl = (r: Txn) =>
      `/your-orders/order-details?orderID=${r.orderId}#acs-charge=${r.amount}&acs-on=${encodeURIComponent(r.date)}`;
    const best = hits.filter((r) => r.diff === closest.diff && r.orderId);
    const orders = [...new Set(best.map((r) => r.orderId))];
    const [first] = best;
    if (orders.length === 1 && first) {
      overlayFound(`Found ${fmt(query.amount)}`, "Opening the order");
      location.replace(orderUrl(first));
      return;
    }
    // Same amount, same distance from the date, different orders: only the user can tell which.
    overlayStop(
      `${best.length} ${kindName}s of ${fmt(query.amount)}`,
      "They're equally close to the YNAB date. Which one?",
      best.map((r, i) => ({
        label: `${r.date} · Order #${r.orderId}`,
        href: orderUrl(r),
        // Staggered, so a long list doesn't fire every order fetch at once.
        detail: sleep(i * 1000).then(() => orderContents(r.orderId)),
      })),
      { finished: true },
    );
  };

  if (!(await until(() => parseTransactions(document, null).length > 0, 8000, search))) {
    if (search.aborted) return;
    stop("Amazon didn't show any transactions", THROTTLED);
    return;
  }
  let rows = parseTransactions(document, null);
  if (!rows.length && /order\s*#\s*\d{3}-\d{7}-\d{7}/i.test(document.body.textContent))
    return stop(
      "Couldn't read Amazon's transactions page",
      "Amazon may have changed its layout. Close this and look manually.",
    );
  // Without dates the two-week window can't work, and any old charge of the same amount would match.
  if (rows.length && rows.every((r) => !toDay(r.date)))
    return stop(
      "Couldn't read the dates on Amazon's transactions page",
      "Amazon may have changed its layout. Close this and look manually.",
    );

  // 1. The rows that come with the page cost nothing, nor do ones seen on earlier searches.
  // Later numbered pages (old layout) don't start from the top, so they don't count as a sweep.
  remember(rows);
  const fromTop = !query.pages;
  const fresh = fromTop ? sweptSpan(rows, false) : null;
  rememberSweep("all", fresh);
  // Together, so a closer match seen before beats a farther one on the page.
  let hits = findHits(withCached(rows));
  if (hits.length) return open(hits);
  if (isPast(rows)) return notFound("Searched back past that date.");
  // Every transaction within two weeks of the date was seen before, so asking again can't find it.
  const lists: ("all" | "refunds")[] = query.kind === "refund" ? ["all", "refunds"] : ["all"];
  if (
    targets.length &&
    isCovered(lists, Math.min(...targets) - 14, Math.max(...targets) + 14, fresh)
  )
    return notFound(
      "Your transactions around that date were already checked on an earlier search.",
    );

  // Older rows cost requests from the allowance; don't spend one inside a recent refusal.
  const refusedAt =
    requestLog()
      .filter((e) => e.status === 429)
      .at(-1)?.at ?? 0;
  if (Date.now() - refusedAt < COOLDOWN_MS) {
    const again = new Date(refusedAt + COOLDOWN_MS).toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    });
    return stop(
      "Amazon is still limiting your transactions",
      `It refused a request ${Math.max(1, Math.round((Date.now() - refusedAt) / 60e3))} min ago, so only the ${rows.length} most recent were searched. Asking again too soon can extend the limit; try after ${again}.`,
    );
  }

  // 2. Ask the transaction service directly.
  let apiSeen: Txn[] = [];
  const api = await apiSearch(
    query,
    (seen) => {
      apiSeen = seen;
      remember(seen);
      return { hits: findHits(seen), past: isPast(seen) };
    },
    search,
  );
  if (!("unusable" in api) && fromTop) {
    // The refunds-only list starts from its top; the full one carries on below the page's rows.
    const end = "done" in api && !api.past && !api.limit;
    if (query.kind === "refund") rememberSweep("refunds", sweptSpan(apiSeen, end));
    else rememberSweep("all", sweptSpan([...rows, ...apiSeen], end));
  }
  if (search.aborted || "aborted" in api) return;
  if ("hits" in api) return open(api.hits);
  if ("throttled" in api) return refusedNow(rows.length + api.checked);
  if ("done" in api)
    return notFound(
      api.past
        ? "Searched back past that date."
        : api.limit
          ? "Stopped before reaching that date."
          : "Reached the end of your transactions.",
    );

  // 3. The service didn't answer the way it did when this was written: fall back to scrolling the page.
  let past = false;
  let stalled = false;
  // Rows can finish arriving alongside a refusal, so keep them whatever the load's outcome.
  const keepRows = () => {
    rows = parseTransactions(document, null);
    remember(rows);
    if (fromTop) rememberSweep("all", sweptSpan(rows, false));
  };
  for (;;) {
    if (search.aborted) return;
    keepRows();
    hits = findHits(rows);
    if (hits.length) return open(hits);
    past = isPast(rows);
    if (past || query.pages >= MAX_PAGES) break;
    // Old layout: numbered pages, each a page load (the search resumes from sessionStorage).
    const next = nextPageButton();
    if (next) {
      query.pages++;
      save(query);
      overlay(
        `Finding ${fmt(query.amount)} on Amazon`,
        `Checking page ${query.pages + 1} of your transactions`,
      );
      next.click();
      return;
    }
    query.pages++;
    overlay(`Finding ${fmt(query.amount)} on Amazon`, "Loading older transactions");
    await pace();
    if (search.aborted) return;
    // No retry: Amazon's limit lasts an hour or more, and asking again inside it only extends it.
    const got = await loadMoreTransactions(transactionRows(document.body), search);
    if (got !== "end") logRequest("scroll", got === "failed" ? 429 : 200);
    if (got === "failed") {
      keepRows();
      return refusedNow(transactionRows(document.body).length);
    }
    if (got === "end") {
      stalled = true;
      break;
    }
  }
  if (search.aborted) return;
  // A list that stops growing is either the true end or a refused request; the page can't tell us which.
  notFound(
    past
      ? "Searched back past that date."
      : query.pages >= MAX_PAGES
        ? "Stopped before reaching that date."
        : stalled
          ? `Amazon stopped loading older transactions. That may be all of them, or ${THROTTLED.charAt(0).toLowerCase()}${THROTTLED.slice(1)}`
          : "Reached the end of your transactions.",
  );
}
