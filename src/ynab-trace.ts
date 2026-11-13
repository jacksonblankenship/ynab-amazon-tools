// Refund tracing, YNAB side: take the trace the Amazon tab left, find the order's
// original charges in YNAB, and say which category the refund belongs in.
import {
  GM_addValueChangeListener,
  GM_getValue,
  GM_registerMenuCommand,
  GM_setValue,
  GM_xmlhttpRequest,
} from "$";
import { DAY, toDay } from "./dates.ts";
import { $$, el, esc, line } from "./lib/dom.ts";
import { errMsg } from "./lib/errors.ts";
import { fmt } from "./lib/money.ts";
import { resultPanel } from "./lib/result-panel.ts";
import { reportLine } from "./lib/suite.ts";
import { suite } from "./overlay.ts";
import { refundHint, TRACE_KEY } from "./refund.ts";
import { short } from "./render.ts";
import type { Trace } from "./types.ts";

const TOKEN_KEY = "ynab-token";
/** A trace older than this is from an earlier refund lookup; don't show it. */
const TRACE_MS = 6e5;

// The parts of YNAB's API transaction this script reads. Amounts are milliunits (cents × 10).
interface YnabSub {
  amount: number;
  deleted: boolean;
  category_name?: string | null;
  memo?: string | null;
}
interface YnabTxn extends YnabSub {
  date: string;
  payee_name?: string | null;
  account_id?: string;
  account_name?: string;
  transfer_account_id?: string | null;
  subtransactions?: YnabSub[];
}

function isTrace(v: unknown): v is Trace {
  if (typeof v !== "object" || v === null) return false;
  const t: Partial<Record<keyof Trace, unknown>> = v;
  return (
    typeof t.at === "number" &&
    typeof t.refund === "object" &&
    t.refund !== null &&
    "amount" in t.refund &&
    typeof t.refund.amount === "number" &&
    Array.isArray(t.charges) &&
    Array.isArray(t.itemSets)
  );
}

// The token lives in Tampermonkey's own storage (never the page's) and only goes to api.ynab.com.
function ynabGet(path: string, token: string): Promise<{ status: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    GM_xmlhttpRequest({
      method: "GET",
      url: `https://api.ynab.com/v1${path}`,
      headers: { Authorization: `Bearer ${token}` },
      timeout: 20000,
      onload: (r) => {
        let body: unknown = null;
        try {
          body = JSON.parse(r.responseText);
        } catch {
          /* not JSON; the status says what happened */
        }
        resolve({ status: r.status, body });
      },
      onerror: () => reject(new Error("Couldn't reach YNAB.")),
      ontimeout: () => reject(new Error("YNAB took too long to answer.")),
    });
  });
}

const ynabDay = (iso: string) => Math.round(Date.parse(`${iso}T00:00:00Z`) / DAY);

// YNAB usually dates a card charge a day or two after Amazon does.
function findCharges(txns: YnabTxn[], c: Trace["charges"][number]) {
  const day = toDay(c.date);
  const amazonish = (x: YnabTxn) => (/amazon|amzn/i.test(x.payee_name || "") ? 0 : 1);
  // A transfer (say, a payment to an Amazon card) is never the order's charge.
  return txns
    .filter((x) => !x.deleted && !x.transfer_account_id && x.amount === -c.amount * 10)
    .map((x) => ({ x, d: day == null ? 0 : ynabDay(x.date) - day }))
    .filter((m) => m.d >= -3 && m.d <= 7)
    .sort((a, b) => amazonish(a.x) - amazonish(b.x) || Math.abs(a.d) - Math.abs(b.d))
    .map((m) => m.x);
}

// The split line(s) of the original charge that hold the refunded items: a line whose
// amount is one item's share, or all the refunded items' shares together.
function refundLines(subs: YnabSub[], t: Trace) {
  const shares = t.itemSets.flatMap((set) => [
    ...set.map((x) => x.amount),
    set.reduce((a, x) => a + x.amount, 0),
  ]);
  return subs.filter((s) => shares.some((v) => Math.abs(-s.amount / 10 - v) <= 3));
}

const realCategory = (n: string | null | undefined) =>
  n && !/^(uncategorized|split)/i.test(n) ? n : "";

// One original charge as a small table: its category, or each split line, with a link
// to its account. A split line matching the refunded items' share is emphasized as a hint.
function describeMatch(
  c: Trace["charges"][number],
  matches: YnabTxn[],
  t: Trace,
  plan: string | undefined,
): { nodes: HTMLElement[]; cats: string[] } {
  const [x, alt] = matches;
  if (!x)
    return {
      nodes: [
        line(
          "acs-warn",
          `No ${fmt(c.amount)} charge in YNAB within a week of ${c.date || "the Amazon date"}. It may be in another plan, or entered with a different amount.`,
        ),
      ],
      cats: [],
    };
  const subs = (x.subtransactions || []).filter((s) => !s.deleted);
  const lines: YnabSub[] = subs.length ? subs : [x];
  const hits = subs.length ? refundLines(subs, t) : [];
  const box = el("div", "acs-split");
  const account =
    plan && x.account_id
      ? `<a href="/${esc(plan)}/accounts/${esc(x.account_id)}">${esc(x.account_name || "account")}</a>`
      : esc(x.account_name || "");
  box.appendChild(
    el(
      "div",
      null,
      `<b>${fmt(c.amount)}</b> on ${esc(x.date)} · ${account}${subs.length ? " · split" : ""}`,
    ),
  );
  const rows = lines
    .map(
      (s) =>
        `<tr${hits.includes(s) ? ' class="acs-hit"' : ""}><td>${esc(realCategory(s.category_name) || "Uncategorized")}${s.memo ? ` <span class="acs-muted">${esc(short(s.memo))}</span>` : ""}</td><td class="acs-r">${fmt(-s.amount / 10)}</td></tr>`,
    )
    .join("");
  box.appendChild(el("table", null, rows));
  const nodes: HTMLElement[] = [box];
  if (alt && alt.category_name !== x.category_name)
    nodes.push(
      line(
        "acs-warn",
        `There's also a ${fmt(c.amount)} charge on ${alt.date} in ${alt.category_name || "no category"}. If that's the one, use it instead.`,
      ),
    );
  return {
    nodes,
    cats: lines.map((s) => realCategory(s.category_name)).filter(Boolean),
  };
}

function categorySummary(cats: string[], t: Trace) {
  const all = [...new Set(cats)];
  const [one] = all;
  if (!one) return [line("acs-warn", "None of these charges are categorized in YNAB yet.")];
  if (all.length === 1) return [line("acs-put", `Put ${fmt(t.refund.amount)} back in ${one}`)];
  return [
    line(
      "acs-put",
      `This order was in: ${all.join(", ")}. The ${fmt(t.refund.amount)} belongs in one (or more) of these.`,
    ),
  ];
}

function tokenForm(done: () => void): HTMLElement[] {
  const form = el("form", "acs-token");
  const input = el("input");
  input.type = "password";
  input.placeholder = "Paste a YNAB personal access token";
  input.autocomplete = "off";
  const save = el("button", null, "Save");
  save.type = "submit";
  form.append(input, save);
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const v = input.value.trim();
    if (!v) return;
    GM_setValue(TOKEN_KEY, v);
    done();
  });
  return [
    line(
      null,
      "To look up the category, this needs a YNAB personal access token. It's stored in Tampermonkey, not on the page, and only sent to api.ynab.com.",
    ),
    el(
      "div",
      "acs-muted",
      'Create one under <a href="https://app.ynab.com/settings/developer" target="_blank" rel="noopener">Developer Settings</a> in YNAB.',
    ),
    form,
  ];
}

async function fillTrace(body: HTMLElement, t: Trace): Promise<void> {
  const say = (...nodes: Node[]) => body.replaceChildren(...refundHint(t), ...nodes);
  if (!t.charges.length)
    return say(
      line(
        "acs-warn",
        "Amazon didn't show a card charge for this order, so there's nothing to trace.",
      ),
    );
  const token = GM_getValue(TOKEN_KEY, "");
  if (!token) return say(...tokenForm(() => fillTrace(body, t)));
  say(line("acs-muted", "Looking up the original charge in YNAB…"));
  // From a few days before the earliest charge (or 90 days back, without a date).
  const days = t.charges.map((c) => toDay(c.date)).filter((d) => d != null);
  const since = new Date(
    ((days.length ? Math.min(...days) : Math.round(t.at / DAY) - 90) - 5) * DAY,
  )
    .toISOString()
    .slice(0, 10);
  const plan = location.pathname.match(/[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}/i)?.[0];
  let res: { status: number; body: unknown };
  try {
    res = await ynabGet(`/plans/${plan ?? "last-used"}/transactions?since_date=${since}`, token);
  } catch (e) {
    return say(line("acs-warn", errMsg(e)));
  }
  if (res.status === 401) {
    GM_setValue(TOKEN_KEY, "");
    return say(
      line("acs-warn", "YNAB didn't accept the saved token."),
      ...tokenForm(() => fillTrace(body, t)),
    );
  }
  if (res.status === 429)
    return say(
      line("acs-warn", "YNAB is limiting requests (it allows 200 an hour). Try again later."),
    );
  const txns = transactionsIn(res.body);
  if (res.status !== 200)
    return say(line("acs-warn", `YNAB answered with an error (${res.status}).`));
  // A good answer in a shape this script doesn't know: YNAB changed its API.
  if (!txns) return say(reportLine(suite, "acs-warn", "Couldn't read YNAB's answer."));
  const found = t.charges.map((c) => {
    const matches = findCharges(txns, c);
    return { matched: matches.length > 0, ...describeMatch(c, matches, t, plan) };
  });
  say(
    line(
      "acs-muted",
      `The original order's ${found.length > 1 ? `${found.length} charges` : "charge"} in YNAB:`,
    ),
    ...found.flatMap((f) => f.nodes),
    // With no charge found, "not categorized yet" would be wrong; the warning above says why.
    ...(found.some((f) => f.matched)
      ? categorySummary(
          found.flatMap((f) => f.cats),
          t,
        )
      : []),
  );
}

/** `data.transactions` from a YNAB answer, trusted to be YNAB's documented shape. */
function transactionsIn(body: unknown): YnabTxn[] | null {
  if (typeof body !== "object" || body === null || !("data" in body)) return null;
  const { data } = body;
  if (typeof data !== "object" || data === null || !("transactions" in data)) return null;
  return Array.isArray(data.transactions) ? data.transactions : null;
}

function showTrace(t: Trace) {
  $$(".acs-result").forEach((e) => {
    e.remove();
  });
  GM_setValue(TRACE_KEY, { ...t, shown: true });
  const body = el("div", null);
  const panel = resultPanel(suite, {
    floating: true,
    label: "Refund",
    amount: fmt(t.refund.amount),
    meta: `Amazon order #${t.orderId}`,
    body: [body],
  });
  document.body.appendChild(panel);
  fillTrace(body, t).catch((e) => body.replaceChildren(line("acs-warn", errMsg(e))));
}

// The Amazon tab hands the trace over through Tampermonkey's storage; this YNAB tab shows it.
export function ynabTrace() {
  if (typeof GM_addValueChangeListener !== "function") return;
  GM_addValueChangeListener(TRACE_KEY, (_k, _old, t: unknown, remote) => {
    if (remote && isTrace(t) && !t.shown) showTrace(t);
  });
  const t: unknown = GM_getValue(TRACE_KEY, null);
  if (isTrace(t) && !t.shown && Date.now() - t.at < TRACE_MS) showTrace(t);
  GM_registerMenuCommand("Set YNAB token", () => {
    $$(".acs-result").forEach((e) => {
      e.remove();
    });
    const body = el("div", null);
    const panel = resultPanel(suite, {
      floating: true,
      label: "YNAB token",
      amount: "",
      meta: GM_getValue(TOKEN_KEY, "")
        ? "A token is saved. Saving a new one replaces it."
        : "No token saved yet.",
      body: [body],
    });
    body.replaceChildren(
      ...tokenForm(() =>
        body.replaceChildren(line("acs-put", "Saved. Refund traces will use it.")),
      ),
    );
    document.body.appendChild(panel);
  });
  GM_registerMenuCommand("Forget YNAB token", () => GM_setValue(TOKEN_KEY, ""));
}
