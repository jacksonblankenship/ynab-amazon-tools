// Order page UI, floating over Amazon's page rather than written into it: the single-charge
// view, and the whole order's breakdown. Amazon's own deliveries are only outlined from above.
import { nearest } from "./dates.ts";
import { $$, el, esc } from "./lib/dom.ts";
import { must } from "./lib/errors.ts";
import { type Highlight, highlight } from "./lib/highlight.ts";
import { fmt } from "./lib/money.ts";
import { resultPanel } from "./lib/result-panel.ts";
import { reportLine } from "./lib/suite.ts";
import { splitGroup } from "./matcher.ts";
import { suite } from "./overlay.ts";
import type { Focus, Order, RenderResult, Solution, Split, Txn } from "./types.ts";

const CHANGED = "Amazon may have changed this page.";

export const short = (t: string) =>
  t.length > 70 ? `${t.slice(0, 70).replace(/\s+\S*$/, "")}…` : t;
const chargeLabel = (c: Txn) =>
  `${fmt(c.amount)} on ${c.date || "unknown date"}${c.status && !/completed|charged|refunded/i.test(c.status) ? ` (${esc(c.status)})` : ""}`;

/** The delivery's whole card on the page, to outline; the box itself if it has none of its own. */
export const card = (box: Element) => {
  const c = box.closest(".a-box");
  return c && $$('[data-component="shipmentStatus"]', c).length === 1 ? c : box;
};

function splitTable(split: Split, multi: boolean) {
  const box = el("div", "acs-split");
  const head = el(
    "div",
    null,
    `${multi ? `<b>${fmt(split.charge.amount)}</b> charge` : "Items"}` +
      `${split.exact ? "" : ' <span class="acs-muted">(Amazon didn\'t say which items, so each item gets its share of this charge)</span>'}`,
  );
  box.appendChild(head);
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

/** Shows a panel over the page, and outlines `boxes` once it has `landed`. */
export interface Shown {
  panel: HTMLElement;
  boxes: Element[];
  landed: () => void;
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
          `${fmt(absorbed)} was paid with points or a gift card, so the card paid less than the items' price.`,
        ),
      );
    for (const s of splitGroup(items, groupCharges, absorbed))
      nodes.push(splitTable(s, groupCharges.length > 1));
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
      nodes.push(splitTable(split, false));
    sections.push({ first: i, node: section([sh.box], dn([i]), nodes) });
  });
  body.push(...sections.sort((a, b) => a.first - b.first).map((s) => s.node));

  const unmatched = charges.filter((_, j) => (solution?.assign[j] ?? -1) < 0);
  if (unmatched.length)
    body.push(
      el(
        "div",
        "acs-warn",
        `Not matched to a delivery: ${unmatched.map((c) => `${chargeLabel(c)} · ${esc(c.method)}`).join(", ")}`,
      ),
    );
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
  if (solution?.ambiguous)
    warnings.push(
      "More than one way to match these charges fits the totals. Double-check the deliveries with similar amounts.",
    );
  for (const w of warnings) body.push(el("div", "acs-warn", esc(w)));
  if (changed) body.push(reportLine(suite, "acs-warn", CHANGED));
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

  const body: Node[] = [];
  if (groupCharges.length > 1) {
    body.push(
      el(
        "div",
        "acs-muted",
        `Amazon billed this delivery in ${groupCharges.length} charges (${groupCharges.map((x) => fmt(x.amount)).join(" + ")}). This is the ${fmt(c.amount)} one.`,
      ),
    );
  }
  if (absorbed > 0) {
    body.push(
      el(
        "div",
        "acs-muted",
        `${fmt(absorbed)} of this delivery was paid with points or a gift card.`,
      ),
    );
  }
  body.push(splitTable(split, false));
  for (const w of warnings) body.push(el("div", "acs-warn", esc(w)));
  if (changed) body.push(reportLine(suite, "acs-warn", CHANGED));
  return floating({ amount: fmt(c.amount), meta: `${c.date} · ${c.method} · ${dn}`, body }, boxes);
}
