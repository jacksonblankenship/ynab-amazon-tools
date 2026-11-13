// Refund tracing, Amazon side: refund → refunded items → the charges that may have paid
// for them → their categories in YNAB (ynab-lookup.ts). The trace, with what YNAB said, goes
// to the YNAB tab (ynab-trace.ts), which shows the same answer.
import { GM_getValue, GM_setValue } from "$";
import { saveAnswer } from "./answers.ts";
import { readableDates } from "./dates.ts";
import { $, $$, el, esc, line } from "./lib/dom.ts";
import { errMsg, must } from "./lib/errors.ts";
import { fmt } from "./lib/money.ts";
import { resultPanel } from "./lib/result-panel.ts";
import { suite } from "./overlay.ts";
import { howItMatched, short } from "./render.ts";
import type { AnswerBody, Order, PricedItem, RefundLookup, Trace, Txn } from "./types.ts";
import {
  type LookupResult,
  lookUpRefund,
  refundAnswer,
  refundCategories,
  TOKEN_KEY,
} from "./ynab-lookup.ts";

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

/**
 * The refund's panel, floating over the order page. answerRefund fills in its answer. `date`
 * is the header's (render.ts panelDate); Amazon's refund date without it.
 */
export function refundPanel(t: Trace, date = "") {
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
    meta: date || t.refund.date,
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
    saveRefund(t, res.lookup);
    say(...answerLines(res.lookup, t.refund.amount));
    $(".acs-caution", panel)?.replaceChildren(...cautions(res.lookup));
    $(".acs-ynab", panel)?.replaceChildren(...amazonDetail(res.lookup));
  } else
    say(
      line("acs-warn", res.badToken ? `${res.error} Your YNAB tab asks for a new one.` : res.error),
    );
  handOver(res);
}

/** The answer line. A guess ("Probably …") is drawn quieter than a sure answer. */
export const putLine = (text: string, sure: boolean) =>
  line(sure ? "acs-put" : "acs-put acs-hedge", text);

/**
 * The answer, or the warning standing in for it; none when no charge was found (the cautions
 * say why). Amazon's page can read the panel, so only categories and amounts from YNAB go on
 * it: no memos, payees, accounts or plan names.
 */
export function answerLines(l: RefundLookup, amount: number): HTMLElement[] {
  const answer = refundAnswer(l, amount);
  if (!answer) return [];
  return ["put" in answer ? putLine(answer.put, answer.sure) : line("acs-warn", answer.warn)];
}

const notInYnabText = (c: Trace["charges"][number]) =>
  `No ${fmt(c.amount)} Amazon charge in YNAB within a week of ${c.date || "the Amazon date"}. It may be in another plan, or entered with a different amount.`;

/** A charge of the order's that YNAB doesn't have: shown in either tab, never left behind. */
export const notInYnab = (c: Trace["charges"][number]) => line("acs-warn", notInYnabText(c));

/** What makes the answer less sure, shown with it, and saved with it. */
function cautionTexts(l: RefundLookup): string[] {
  const texts = l.charges.flatMap(({ charge: c, found: x }) =>
    !x
      ? [notInYnabText(c)]
      : x.alt
        ? [
            `YNAB has another ${fmt(c.amount)} Amazon charge near this date, in ${x.alt.categories.join(", ") || "no category"}. Either may be this order's.`,
          ]
        : [],
  );
  if (l.limited) texts.push("YNAB is limiting requests, so other plans weren't checked.");
  return texts;
}
const cautions = (l: RefundLookup) => cautionTexts(l).map((t) => line("acs-warn", t));

/**
 * The refund's answer, to keep for the YNAB line it was opened from: the category (or the
 * categories it may be), and the items when only one set of them adds up to it. Null when
 * there's no category to give.
 */
export function refundRecord(t: Trace, l: RefundLookup): AnswerBody | null {
  const c = refundCategories(l);
  if (!c || c === "uncategorized" || !t.orderId) return null;
  const [only, ...more] = t.itemSets;
  return {
    orderId: t.orderId,
    items:
      only && !more.length
        ? only.map((x) => ({ title: x.title, amount: x.amount, qty: x.units }))
        : [],
    // Amazon doesn't say which items a refund was for.
    exact: false,
    category: c,
    cautions: cautionTexts(l),
  };
}

/** Keep the refund's answer under the YNAB line it was opened from, if it has one. */
export function saveRefund(t: Trace, l: RefundLookup) {
  const body = t.row && refundRecord(t, l);
  if (t.row && body) saveAnswer(t.row, body);
}

/**
 * What the answer rests on: each found charge's categories and amounts, and the other
 * same-amount charge when there's one it could as well be.
 */
function amazonDetail(l: RefundLookup): HTMLElement[] {
  return l.charges.flatMap(({ charge: c, found: x }) => {
    if (!x) return [];
    const box = el("div", "acs-split");
    const on = x.alt ? ` on ${esc(readableDates([x.date]))}` : "";
    box.appendChild(
      el("div", null, `<b>${fmt(c.amount)}</b> in YNAB${on}${x.split ? ", split" : ""}`),
    );
    const rows = x.lines
      .map(
        (s) =>
          `<tr${s.hit ? ' class="acs-hit"' : ""}><td>${esc(s.category || "Uncategorized")}</td><td class="acs-r">${fmt(s.amount)}</td></tr>`,
      )
      .join("");
    box.appendChild(el("table", null, rows));
    if (!x.alt) return [box];
    // Its categories, but not how much went to each: the lookup keeps only the names.
    const alt = el("div", "acs-split");
    alt.appendChild(
      el(
        "div",
        null,
        `Another <b>${fmt(c.amount)}</b> charge on ${esc(readableDates([x.alt.date]))} in YNAB`,
      ),
    );
    const altRows = (x.alt.categories.length ? x.alt.categories : ["Uncategorized"])
      .map((name) => `<tr><td>${esc(name)}</td></tr>`)
      .join("");
    alt.appendChild(el("table", null, altRows));
    return [box, alt];
  });
}
