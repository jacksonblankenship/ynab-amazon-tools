// Refund tracing, Amazon side: refund → refunded items → the charges that may have paid
// for them. The trace goes to the YNAB tab (ynab-trace.ts), which finds their categories.
import { $, line } from "./lib/dom.ts";
import { must } from "./lib/errors.ts";
import { fmt } from "./lib/money.ts";
import { resultPanel } from "./lib/result-panel.ts";
import { suite } from "./overlay.ts";
import { short } from "./render.ts";
import type { Order, PricedItem, Trace, Txn } from "./types.ts";

/** Where the Amazon tab leaves a trace for the YNAB tab, in Tampermonkey's storage. */
export const TRACE_KEY = "acs-trace";

export const itemNames = (set: Trace["itemSets"][number]) =>
  set.map((x) => `${x.title}${x.units > 1 ? ` ×${x.units}` : ""}`).join(", ");

// Amazon doesn't say which items a refund was for, so find the item units whose
// estimated price (with tax) adds up to it. Returns every fit, so the caller can tell
// a sure answer from a guess.
function refundedItems(
  order: Order,
  amount: number,
): { item: PricedItem; units: number }[][] {
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
  return only && !more.length
    ? [line("acs-muted", `Probably for: ${itemNames(only)}`)]
    : [];
}

/** The refund's panel on the order page, pointing back to YNAB for the categories. */
export function refundPanel(t: Trace) {
  const body: Node[] = [...refundHint(t)];
  if (t.charges.length)
    body.push(
      line(
        "acs-muted",
        `This order's card charges: ${t.charges.map((c) => `${fmt(c.amount)} on ${c.date || "an unknown date"}`).join(", ")}.`,
      ),
      line(
        "acs-put",
        "Switch back to your YNAB tab to see the categories they were in.",
      ),
    );
  else
    body.push(
      line(
        "acs-warn",
        "Amazon didn't show a card charge for this order, so there's no original charge to trace.",
      ),
    );
  const panel = resultPanel(suite, {
    label: "This refund",
    amount: fmt(t.refund.amount),
    meta: [t.refund.date, t.refund.method].filter(Boolean).join(" · "),
    body,
  });
  const anchor = $('[data-component="shipments"]');
  const before = $(".acs-panel") ?? anchor;
  before?.parentNode?.insertBefore(panel, before);
  return panel;
}
