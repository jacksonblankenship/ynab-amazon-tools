// Order details page: parse, fetch the order's charges, match them, and show the result.
import { GM_setValue } from "$";
import { nearest } from "./dates.ts";
import { $, el, line } from "./lib/dom.ts";
import { errMsg, PageChanged } from "./lib/errors.ts";
import { fmt } from "./lib/money.ts";
import { searchIcon } from "./lib/suite.ts";
import { solve } from "./matcher.ts";
import { parseOrder, priceItems } from "./order.ts";
import { overlayDone, overlayFound, overlayStop, signal } from "./overlay.ts";
import { refundPanel, TRACE_KEY, traceRefund } from "./refund.ts";
import { card, renderFocus, renderOrder, type Shown } from "./render.ts";
import { fetchTransactions } from "./transactions.ts";
import { remember } from "./txn-cache.ts";
import type { Focus, ParsedOrder, Txn } from "./types.ts";

const unreadable = () =>
  overlayStop("Couldn't read this order page", "Amazon may have changed its layout.", [], {
    report: true,
  });

export async function orderPage() {
  const focus = focusTarget();
  // parseOrder copes without the "shipments" wrapper, so only the items themselves are required.
  const parsed = $('[data-component="purchasedItems"]') ? parseOrder(document) : null;
  const items = parsed?.shipments.flatMap((s) => s.items) ?? [];
  // Deliveries but no items, or no prices: any match made from that would be nonsense.
  if (!parsed || !items.length || parsed.unpriced === items.length) {
    if (focus) unreadable();
    return;
  }
  // Visited on its own, not from YNAB: matching costs Amazon a request, so only on asking.
  if (!focus) return launcher(parsed);
  overlayFound(
    `Found ${fmt(focus.amount)}`,
    focus.kind === "refund" ? "Finding what it refunded" : "Finding the items it paid for",
  );
  const search = signal();
  const shown = await match(parsed, focus);
  // Cancelled while the charges loaded: leave the page as it is.
  if (search.aborted) {
    shown.panel.remove();
    launcher(parsed);
    return;
  }
  // Only now, so a cancelled lookup doesn't reach the YNAB tab.
  if (shown.trace)
    try {
      GM_setValue(TRACE_KEY, shown.trace);
    } catch {
      /* ignore */
    }
  const cards = shown.boxes.map(card);
  const top = Math.min(...cards.map((c) => c.getBoundingClientRect().top));
  if (Number.isFinite(top)) window.scrollTo({ top: window.scrollY + top - 16 });
  overlayDone(shown.panel, shown.landed);
  // Closed, it can still be looked at again, as the whole order.
  launcher(parsed, shown.panel);
}

/**
 * How much points or gift cards paid toward this order, as [least, most]. A payment can cover
 * several orders at once, and Amazon doesn't say how much went to which: this order took
 * anywhere from none to all of it. Without credit transactions, the Order Summary's figure.
 */
export function creditRange(credits: Txn[], summaryCredits: number): [number, number] {
  if (!credits.length) return [summaryCredits, summaryCredits];
  const sum = (xs: Txn[]) => xs.reduce((a, c) => a + c.amount, 0);
  const own = sum(credits.filter((c) => c.orderIds.length <= 1));
  const shared = sum(credits.filter((c) => c.orderIds.length > 1));
  return [own, own + shared];
}

/** Load the order's charges and show what they paid for: the one asked about, or all of them. */
async function match(parsed: ParsedOrder, focus: Focus | null): Promise<Shown> {
  const priced = priceItems(parsed);
  const { order, warnings } = priced;
  let { changed } = priced;
  let txns: Txn[] = [];
  let error: string | null = null;
  if (order.orderId) {
    try {
      txns = await fetchTransactions(order.orderId);
      remember(txns);
    } catch (e: unknown) {
      error = errMsg(e);
      if (e instanceof PageChanged) changed = true;
    }
  } else {
    // Without it the lookup would ask Amazon for order "null" and report a misleading result.
    error = "Couldn't find the order number on this page";
    changed = true;
  }
  const charges = txns.filter((t) => t.kind === "charge");
  const credits = txns.filter((t) => t.kind === "credit");
  const refunds = txns.filter((t) => t.kind === "refund");
  const credit = creditRange(credits, order.summary.credits);
  const shared = credit[1] - credit[0];
  const { solution, incomplete } = charges.length
    ? solve(order.shipments, charges, credit)
    : { solution: null, incomplete: false };
  // The match leaned on a guess at this order's share: say so, it could be off.
  if (shared && solution?.absorbedBy.some((a) => a > 0))
    warnings.push(
      "Part of this order was paid with points or a gift card shared with another order. Amazon doesn't say how much went to each, so the amounts below assume the share that fits.",
    );
  if (incomplete) {
    warnings.push(
      solution
        ? "This order has too many charges to check every combination. The match below is the best found, not guaranteed. Double-check it against your statement."
        : "This order has too many charges to check every combination, so no match was found. Match the charges to deliveries manually.",
    );
  } else if (charges.length && !solution) {
    // Partly matched orders list their unmatched charges with the reason instead.
    warnings.push(
      "The charges don't add up to the deliveries cleanly (item-specific coupons or a partial refund can cause this).",
    );
  }
  // A refund often equals one of the order's charges; it's still the refund being traced.
  const shown =
    focus?.kind === "charge" &&
    solution &&
    renderFocus(order, charges, solution, focus, warnings, changed);
  if (shown) return shown;
  // Opened from a YNAB refund: show it, and hand its trace to the YNAB tab.
  const sameRefunds =
    focus?.kind === "refund" && !error ? refunds.filter((r) => r.amount === focus.amount) : [];
  const refund = focus && nearest(sameRefunds, (r) => r.date, focus.date);
  if (refund) {
    const trace = traceRefund(order, charges, refund);
    return { panel: refundPanel(trace), boxes: [], landed: () => {}, trace };
  }
  // The one asked about couldn't be pinned down: say so above the whole order.
  const lead = focus
    ? [
        line(
          "acs-warn",
          error
            ? "Couldn't read Amazon's charges for this order."
            : focus.kind === "refund"
              ? `Couldn't find the ${fmt(focus.amount)} refund on this order. Here's the whole order instead.`
              : `Couldn't tie ${fmt(focus.amount)} to a delivery. Here's the whole order instead.`,
        ),
      ]
    : [];
  return renderOrder(
    order,
    { charges, credits, refunds, solution, warnings, error, changed },
    lead,
  );
}

/**
 * A small button floating over the page that matches the order's charges when pressed.
 * Kept out of sight while `panel` is open.
 */
function launcher(parsed: ParsedOrder, panel?: HTMLElement) {
  const b = el("button", "acs-launch", `${searchIcon(14)}<span>Match charges to items</span>`);
  b.type = "button";
  document.body.appendChild(b);
  const hideWhile = (p: HTMLElement) => {
    b.hidden = true;
    new MutationObserver((_, mo) => {
      if (p.isConnected) return;
      mo.disconnect();
      b.hidden = false;
    }).observe(document.body, { childList: true });
  };
  if (panel) hideWhile(panel);
  b.addEventListener("click", async () => {
    b.disabled = true;
    b.classList.add("acs-busy");
    try {
      const shown = await match(parsed, null);
      hideWhile(shown.panel);
      shown.landed();
    } catch (e) {
      overlayStop("Something went wrong", errMsg(e), [], { report: true });
    } finally {
      b.disabled = false;
      b.classList.remove("acs-busy");
    }
  });
}

/** Order page opened from YNAB: #acs-charge=1999&acs-on=January%205%2C%202026[&acs-kind=refund] */
export function focusTarget(): Focus | null {
  const h = new URLSearchParams(location.hash.slice(1));
  const amount = Number(h.get("acs-charge"));
  const kind = h.get("acs-kind") === "refund" ? "refund" : "charge";
  return amount ? { amount, date: h.get("acs-on") || "", kind } : null;
}
