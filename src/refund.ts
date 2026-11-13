// Refund tracing, Amazon side: refund → refunded items → the charges that may have paid
// for them → their categories in YNAB (ynab-lookup.ts). The trace, with what YNAB said, goes
// to the YNAB tab (ynab-trace.ts), which shows the same answer.
import { GM_getValue, GM_setValue } from "$";
import { $, $$, el, esc, line } from "./lib/dom.ts";
import { errMsg, must } from "./lib/errors.ts";
import { fmt } from "./lib/money.ts";
import { resultPanel } from "./lib/result-panel.ts";
import { suite } from "./overlay.ts";
import { short } from "./render.ts";
import type { Order, PricedItem, RefundLookup, Trace, Txn } from "./types.ts";
import { type LookupResult, lookUpRefund, refundAnswer, TOKEN_KEY } from "./ynab-lookup.ts";

/** Where the Amazon tab leaves a trace for the YNAB tab, in Tampermonkey's storage. */
export const TRACE_KEY = "acs-trace";

export const itemNames = (set: Trace["itemSets"][number]) =>
  set.map((x) => `${x.title}${x.units > 1 ? ` ×${x.units}` : ""}`).join(", ");

// Amazon doesn't say which items a refund was for, so find the item units whose
// estimated price (with tax) adds up to it. Returns every fit, so the caller can tell
// a sure answer from a guess.
function refundedItems(order: Order, amount: number): { item: PricedItem; units: number }[][] {
  const items = order.shipments.flatMap((sh) => sh.items);
  const pieces = items.flatMap((item, idx) =>
    item.total > 0
      ? Array.from({ length: Math.min(item.qty, 4) }, () => ({
          idx,
          v: Math.round(item.total / item.qty),
        }))
      : [],
  );
  if (!pieces.length || pieces.length > 18) return [];
  type Piece = (typeof pieces)[number];
  const sets = new Map<string, { item: PricedItem; units: number }[]>();
  const rec = (i: number, sum: number, picked: Piece[]): void => {
    if (sets.size > 3) return;
    if (picked.length && Math.abs(sum - amount) <= 2 + picked.length) {
      const units = new Map<number, number>();
      for (const p of picked) units.set(p.idx, (units.get(p.idx) ?? 0) + 1);
      const key = [...units]
        .map(([k, n]) => `${k}x${n}`)
        .sort()
        .join(",");
      if (!sets.has(key))
        sets.set(
          key,
          [...units].map(([k, n]) => ({
            item: must(items[k], `item ${k}`),
            units: n,
          })),
        );
    }
    const next = pieces[i];
    if (!next || sum > amount + 2 + picked.length) return;
    rec(i + 1, sum + next.v, [...picked, next]);
    rec(i + 1, sum, picked);
  };
  rec(0, 0, []);
  // More than a few fits says nothing useful about which items it was.
  return sets.size > 3 ? [] : [...sets.values()];
}

// Every card charge on the order goes along, not just the one the item guess points at:
// a wrong guess must never hide the charge the refund actually belongs to.
export function traceRefund(order: Order, charges: Txn[], refund: Txn): Trace {
  const sets = refundedItems(order, refund.amount);
  return {
    at: Date.now(),
    orderId: order.orderId,
    refund: { amount: refund.amount, date: refund.date, method: refund.method },
    itemSets: sets.map((set) =>
      set.map(({ item, units }) => ({
        title: short(item.title),
        units,
        amount: Math.round(item.total / item.qty) * units,
      })),
    ),
    charges: charges.map((c) => ({
      amount: c.amount,
      date: c.date,
      method: c.method,
    })),
  };
}

// A hint only: Amazon doesn't say which items a refund was for.
export function refundHint(t: Trace): HTMLElement[] {
  const [only, ...more] = t.itemSets;
  return only && !more.length ? [line("acs-muted", `Probably for: ${itemNames(only)}`)] : [];
}

/** What an answer rests on, collapsed: users only need it when the answer looks wrong. */
export function howItMatched(nodes: Node[]) {
  const how = el("details", "acs-how");
  how.append(el("summary", null, "How it matched"), ...nodes);
  return how;
}

/** The refund's panel, floating over the order page. answerRefund fills in its answer. */
export function refundPanel(t: Trace) {
  const body: Node[] = t.charges.length
    ? [
        el("div", "acs-answer"),
        ...refundHint(t),
        el("div", "acs-caution"),
        howItMatched([
          line(
            "acs-muted",
            `This order's card charges: ${t.charges.map((c) => `${fmt(c.amount)} on ${c.date || "an unknown date"}`).join(", ")}.`,
          ),
          ...(t.refund.method ? [line("acs-muted", `Refunded to ${t.refund.method}.`)] : []),
          el("div", "acs-ynab"),
        ]),
      ]
    : [
        line(
          "acs-warn",
          "Amazon didn't show a card charge for this order, so there's no original charge to trace.",
        ),
        ...refundHint(t),
      ];
  $$(".acs-result").forEach((e) => {
    e.remove();
  });
  const panel = resultPanel(suite, {
    floating: true,
    label: "This refund",
    amount: fmt(t.refund.amount),
    meta: t.refund.date,
    body,
  });
  document.body.appendChild(panel);
  return panel;
}

/**
 * Ask YNAB where the refund goes back to, show it on the panel, and hand the trace (with
 * YNAB's answer, or why there's none, so it isn't asked twice) to the YNAB tab. Without a token
 * or the YNAB plan, the YNAB tab does the asking. The token form is never put on Amazon's page.
 */
export async function answerRefund(panel: HTMLElement, t: Trace, plan: string | undefined) {
  const answer = $(".acs-answer", panel);
  const say = (...nodes: Node[]) => answer?.replaceChildren(...nodes);
  const handOver = (res?: LookupResult) => {
    try {
      GM_setValue(
        TRACE_KEY,
        !res ? t : "lookup" in res ? { ...t, lookup: res.lookup } : { ...t, lookupError: res },
      );
    } catch {
      /* ignore */
    }
  };
  if (!t.charges.length) return handOver();
  const token = GM_getValue(TOKEN_KEY, "");
  if (!token || !plan) {
    say(line("acs-muted", "Your YNAB tab shows which category this goes back to."));
    return handOver();
  }
  say(line("acs-muted", "Looking up the original charge in YNAB…"));
  const res = await lookUpRefund(t, plan, token).catch((e: unknown): LookupResult => ({
    error: errMsg(e),
  }));
  if ("lookup" in res) {
    say(...amazonAnswer(res.lookup, t));
    $(".acs-caution", panel)?.replaceChildren(...cautions(res.lookup));
    $(".acs-ynab", panel)?.replaceChildren(...amazonDetail(res.lookup));
  } else
    say(
      line("acs-warn", res.badToken ? `${res.error} Your YNAB tab asks for a new one.` : res.error),
    );
  handOver(res);
}

// Amazon's page can read the panel, so only categories and amounts from YNAB go on it: no
// memos, payees, accounts or plan names.
function amazonAnswer(l: RefundLookup, t: Trace): HTMLElement[] {
  const answer = refundAnswer(l, t.refund.amount);
  // With no charge found, the cautions say why.
  if (!answer) return [];
  return ["put" in answer ? line("acs-put", answer.put) : line("acs-warn", answer.warn)];
}

/** A charge of the order's that YNAB doesn't have: shown in either tab, never left behind. */
export const notInYnab = (c: Trace["charges"][number]) =>
  line(
    "acs-warn",
    `No ${fmt(c.amount)} Amazon charge in YNAB within a week of ${c.date || "the Amazon date"}. It may be in another plan, or entered with a different amount.`,
  );

/** What makes the answer less sure, shown with it. */
function cautions(l: RefundLookup): HTMLElement[] {
  const nodes = l.charges.flatMap(({ charge: c, found: x }) =>
    !x
      ? [notInYnab(c)]
      : x.alt
        ? [
            line(
              "acs-warn",
              `YNAB has another ${fmt(c.amount)} Amazon charge near this date, in ${x.alt.categories.join(", ") || "no category"}. Either may be this order's.`,
            ),
          ]
        : [],
  );
  if (l.limited)
    nodes.push(line("acs-warn", "YNAB is limiting requests, so other plans weren't checked."));
  return nodes;
}

/** What the answer rests on: each found charge's categories and amounts. */
function amazonDetail(l: RefundLookup): HTMLElement[] {
  return l.charges.flatMap(({ charge: c, found: x }) => {
    if (!x) return [];
    const box = el("div", "acs-split");
    box.appendChild(el("div", null, `<b>${fmt(c.amount)}</b> in YNAB${x.split ? ", split" : ""}`));
    const rows = x.lines
      .map(
        (s) =>
          `<tr${s.hit ? ' class="acs-hit"' : ""}><td>${esc(s.category || "Uncategorized")}</td><td class="acs-r">${fmt(s.amount)}</td></tr>`,
      )
      .join("");
    box.appendChild(el("table", null, rows));
    return [box];
  });
}
