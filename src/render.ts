// Order page UI, floating over Amazon's page rather than written into it: the single-charge
// view, and the whole order's breakdown. Amazon's own deliveries are only outlined from above.
import { nearest } from "./dates.ts";
import { $$, el, esc, line } from "./lib/dom.ts";
import { must } from "./lib/errors.ts";
import { type Highlight, highlight } from "./lib/highlight.ts";
import { fmt } from "./lib/money.ts";
import { resultPanel } from "./lib/result-panel.ts";
import { reportLine } from "./lib/suite.ts";
import { splitGroup } from "./matcher.ts";
import { suite } from "./overlay.ts";
import type { Focus, Order, RenderResult, Solution, Split, Trace, Txn } from "./types.ts";

const CHANGED = "Amazon may have changed this page.";

export const short = (t: string) =>
  t.length > 70 ? `${t.slice(0, 70).replace(/\s+\S*$/, "")}…` : t;
const chargeLabel = (c: Txn) =>
  `${fmt(c.amount)} on ${c.date || "unknown date"}${c.status && !/completed|charged|refunded/i.test(c.status) ? ` (${esc(c.status)})` : ""}`;

/** What paid the part of a delivery its card charges fell short by, when the matcher can tell. */
function shortBy(solution: Solution, gi: number): string {
  const absorbed = must(solution.absorbedBy[gi], `credit for group ${gi}`);
  const coupon = solution.couponBy ? (solution.couponBy[gi] ?? 0) : null;
  if (coupon == null) return `${fmt(absorbed)} was paid with points, a gift card or a coupon`;
  if (!coupon) return `${fmt(absorbed)} was paid with points or a gift card`;
  // The coupon was spread over every delivery in the estimates, but Amazon gave it to this one.
  const byCoupon = `${fmt(coupon)} more came off with a coupon than estimated`;
  const credit = absorbed - coupon;
  return credit ? `${fmt(credit)} was paid with points or a gift card, and ${byCoupon}` : byCoupon;
}

/** The delivery's whole card on the page, to outline; the box itself if it has none of its own. */
export const card = (box: Element) => {
  const c = box.closest(".a-box");
  return c && $$('[data-component="shipmentStatus"]', c).length === 1 ? c : box;
};

/** The amounts each item came to; `head`, if any, says which charge they're for. */
function splitTable(split: Split, head: string | null) {
  const box = el("div", "acs-split");
  if (head) box.appendChild(el("div", null, head));
  const rows = split.lines
    .map(
      (l) =>
        `<tr><td>${esc(short(l.item.title))}${l.item.qty > 1 ? ` <span class="acs-muted">×${l.item.qty}</span>` : ""}</td><td class="acs-r">${fmt(l.amount)}</td></tr>`,
    )
    .join("");
  box.appendChild(
    el(
      "table",
      null,
      `${rows}<tr class="acs-tot"><td>Total</td><td class="acs-r">${fmt(split.charge.amount)}</td></tr>`,
    ),
  );
  return box;
}

/** The breakdown's header for a split: the charge it's for, and whether it's an estimate. */
const splitHead = (split: Split, multi: boolean) =>
  `${multi ? `<b>${fmt(split.charge.amount)}</b> charge` : "Items"}` +
  `${split.exact ? "" : ' <span class="acs-muted">(Amazon didn\'t say which items, so each item gets its share of this charge)</span>'}`;

/** One line on what made the card pay less than the items' price, for under the amounts. */
function paidLess(solution: Solution, gi: number): string {
  const absorbed = must(solution.absorbedBy[gi], `credit for group ${gi}`);
  const coupon = solution.couponBy ? (solution.couponBy[gi] ?? 0) : null;
  const from =
    coupon == null
      ? "points, a gift card or a coupon"
      : coupon === absorbed
        ? "a coupon"
        : coupon
          ? "points or a gift card, and a coupon"
          : "points or a gift card";
  return `Amounts are after ${fmt(absorbed)} from ${from}.`;
}

/** Supporting detail, closed until asked for: what the answer above rests on. */
function howItMatched(nodes: Node[]) {
  const d = el("details", "acs-how");
  d.append(el("summary", null, "How it matched"), ...nodes);
  return d;
}

/** Shows a panel over the page, and outlines `boxes` once it has `landed`. */
export interface Shown {
  panel: HTMLElement;
  boxes: Element[];
  landed: () => void;
  /** A refund's trace, for the YNAB tab. */
  trace?: Trace;
}

/** A floating panel whose outline on the page goes away with it. */
function floating(o: Parameters<typeof resultPanel>[1], boxes: Element[]): Shown {
  $$(".acs-result").forEach((e) => {
    e.remove();
  });
  let ring: Highlight | null = null;
  const panel = resultPanel(suite, {
    ...o,
    floating: true,
    onDismiss: () => ring?.remove(),
  });
  document.body.appendChild(panel);
  return {
    panel,
    boxes,
    landed: () => {
      // Closed before it finished landing: nothing to point from.
      if (!panel.isConnected) return;
      ring?.remove();
      if (boxes.length) ring = highlight(suite.prefix, boxes.map(card));
    },
  };
}

/** One delivery (or deliveries billed together) in the breakdown; points at them on hover. */
function section(boxes: Element[], title: string, nodes: Node[]) {
  const s = el("div", "acs-del");
  const head = el("button", "acs-del-h");
  head.type = "button";
  head.textContent = title;
  head.title = "Show on the page";
  const cards = boxes.map(card);
  head.addEventListener("click", () => cards[0]?.scrollIntoView({ block: "center" }));
  let ring: Highlight | null = null;
  s.addEventListener("mouseenter", () => {
    ring = highlight(suite.prefix, cards);
  });
  s.addEventListener("mouseleave", () => {
    ring?.remove();
    ring = null;
  });
  s.append(head, ...nodes);
  return s;
}

/**
 * The whole order: each delivery with the charge(s) that paid for it and its items. `lead`
 * goes first, to say why this is shown instead of the one charge asked about.
 */
export function renderOrder(order: Order, result: RenderResult, lead: Node[] = []): Shown {
  const { shipments } = order;
  const { charges, credits, refunds, solution, warnings, error, changed } = result;
  const dn = (xs: number[]) =>
    `${xs.length > 1 ? "Deliveries" : "Delivery"} ${xs.map((x) => x + 1).join(" + ")}`;
  const body: Node[] = [...lead];
  if (error)
    body.push(
      el(
        "div",
        "acs-warn",
        `Couldn't load this order's charges (${esc(error)}). Showing estimates only.`,
      ),
    );

  const unmatched = charges.filter((_, j) => (solution?.assign[j] ?? -1) < 0);
  if (unmatched.length)
    body.push(
      el(
        "div",
        "acs-warn",
        `Not matched to a delivery: ${unmatched.map((c) => `${chargeLabel(c)} · ${esc(c.method)}`).join(", ")}. Item-specific coupons or a partial refund can cause this.`,
      ),
    );
  const charged = new Set<number>();
  const sections: { first: number; node: HTMLElement }[] = [];
  solution?.groups.forEach((g, gi) => {
    const groupCharges = charges.filter((_, j) => solution.assign[j] === gi);
    if (!groupCharges.length) return;
    for (const x of g.members) charged.add(x);
    const absorbed = must(solution.absorbedBy[gi], `credit for group ${gi}`);
    const items = g.members.flatMap((x) => must(shipments[x], `delivery ${x + 1}`).items);
    const nodes: Node[] = [
      el(
        "div",
        "acs-muted",
        groupCharges.map((c) => `${chargeLabel(c)} · ${esc(c.method)}`).join("<br>"),
      ),
    ];
    if (absorbed > 0)
      nodes.push(
        el(
          "div",
          "acs-muted",
          `${shortBy(solution, gi)}, so the card paid less than the items' price.`,
        ),
      );
    for (const s of splitGroup(items, groupCharges, absorbed))
      nodes.push(splitTable(s, splitHead(s, groupCharges.length > 1)));
    const boxes = g.members.map((x) => must(shipments[x], `delivery ${x + 1}`).box);
    sections.push({ first: Math.min(...g.members), node: section(boxes, dn(g.members), nodes) });
  });
  shipments.forEach((sh, i) => {
    if (charged.has(i)) return;
    const nodes: Node[] = [
      el(
        "div",
        "acs-muted",
        `No card charge yet${charges.length ? ", or paid with points or a gift card" : ""}. Estimated ${fmt(sh.total)} with tax.`,
      ),
    ];
    for (const split of splitGroup(sh.items, [{ amount: sh.total }], 0))
      nodes.push(splitTable(split, splitHead(split, false)));
    sections.push({ first: i, node: section([sh.box], dn([i]), nodes) });
  });
  if (solution?.ambiguous)
    warnings.push(
      "More than one way to match these charges fits the totals. Double-check the deliveries with similar amounts.",
    );
  for (const w of warnings) body.push(el("div", "acs-warn", esc(w)));
  if (changed) body.push(reportLine(suite, "acs-warn", CHANGED));
  body.push(...sections.sort((a, b) => a.first - b.first).map((s) => s.node));
  if (!charges.length && !error)
    body.push(
      el("div", "acs-muted", "No card charges yet. Amazon charges when each delivery ships."),
    );
  if (credits.length)
    body.push(
      el(
        "div",
        "acs-muted",
        `Also paid with: ${credits.map((c) => `${esc(c.method)} ${fmt(c.amount)}`).join(", ")}`,
      ),
    );
  if (refunds.length)
    body.push(
      el(
        "div",
        "acs-muted",
        `Refunds: ${refunds.map((c) => `${fmt(c.amount)} on ${esc(c.date)} to ${esc(c.method)}`).join(", ")}`,
      ),
    );

  if (order.orderId)
    body.push(
      el(
        "div",
        "acs-muted acs-more",
        `<a href="/cpe/yourpayments/transactions?transactionTag=${encodeURIComponent(order.orderId)}">This order's transactions on Amazon</a>`,
      ),
    );
  return floating(
    {
      label: "This order",
      amount: order.summary.grand == null ? "" : fmt(order.summary.grand),
      meta: order.orderId ? `Order #${order.orderId}` : "",
      body,
    },
    [],
  );
}

/**
 * Show only the items behind one charge, outlining the delivery it paid for. Null if the
 * charge isn't among the matched ones.
 */
export function renderFocus(
  order: Order,
  charges: Txn[],
  solution: Solution,
  focus: Focus,
  warnings: string[] = [],
  changed = false,
): Shown | null {
  const matched = charges.flatMap((c, j) => {
    const gi = solution.assign[j];
    return gi !== undefined && gi >= 0 && c.amount === focus.amount ? [{ c, gi }] : [];
  });
  const hit = nearest(matched, (x) => x.c.date, focus.date);
  if (!hit) return null;
  const { c, gi } = hit;
  const g = must(solution.groups[gi], `group ${gi}`);
  const absorbed = must(solution.absorbedBy[gi], `credit for group ${gi}`);
  const groupCharges = charges.filter((_, k) => solution.assign[k] === gi);
  const items = g.members.flatMap((x) => must(order.shipments[x], `delivery ${x + 1}`).items);
  const split = splitGroup(items, groupCharges, absorbed).find((sp) => sp.charge === c);
  // splitGroup returns one split per charge, so this shouldn't happen; fall back to the full view.
  if (!split) return null;
  const boxes = g.members.map((x) => must(order.shipments[x], `delivery ${x + 1}`).box);
  const dn = g.members.map((x) => `Delivery ${x + 1}`).join(" + ");
  const these = g.members.length > 1 ? "these deliveries" : "this delivery";

  // The answer first: the items this charge paid for, with amounts to split by.
  const [only, ...more] = split.lines;
  const one = only && !more.length ? only : null;
  const answer =
    groupCharges.length > 1
      ? `This ${fmt(c.amount)} is 1 of ${groupCharges.length} charges for ${g.members.length > 1 ? `${g.members.length} deliveries billed together` : "one delivery"}. It paid for${one ? "" : ":"}`
      : one
        ? ""
        : `This paid for ${split.lines.length} items:`;
  const body: Node[] = [];
  if (answer) body.push(line("acs-answer", answer));
  if (one)
    body.push(
      line("acs-answer", `${short(one.item.title)}${one.item.qty > 1 ? ` ×${one.item.qty}` : ""}`),
    );
  else body.push(splitTable(split, null));
  if (absorbed > 0) body.push(line("acs-muted", paidLess(solution, gi)));
  if (!split.exact)
    body.push(
      line(
        "acs-warn",
        "Amazon doesn't say which items each charge covered, so these amounts are each item's share.",
      ),
    );
  for (const w of warnings) body.push(el("div", "acs-warn", esc(w)));
  if (changed) body.push(reportLine(suite, "acs-warn", CHANGED));

  // How it got there, for when the answer looks wrong.
  const how: Node[] = [
    line(null, `${c.method}, charged ${c.date || "on an unknown date"} · ${dn}`),
  ];
  if (groupCharges.length > 1)
    how.push(
      el(
        "div",
        null,
        `Amazon billed ${these} in ${groupCharges.length} charges: ${groupCharges.map(chargeLabel).join(", ")}. This is the ${fmt(c.amount)} one.`,
      ),
    );
  if (absorbed > 0) how.push(line(null, `On ${these}, ${shortBy(solution, gi)}.`));
  body.push(howItMatched(how));
  return floating({ amount: fmt(c.amount), meta: focus.date || c.date, body }, boxes);
}
