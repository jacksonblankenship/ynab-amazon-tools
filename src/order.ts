// Order details page: read deliveries, items and the Order Summary, then price each item.
import { $, $$, txt } from "./lib/dom.ts";
import { allocateBy, cents, fmt } from "./lib/money.ts";
import { IS_MONEY, leaves, moneyIn } from "./scrape.ts";
import type { Order, ParsedOrder, Shipment, Summary } from "./types.ts";

export function parseOrder(doc: Document): ParsedOrder {
  const orderId =
    (txt($('[data-component="orderId"]', doc)).match(/\d{3}-\d{7}-\d{7}/) || [])[0] ||
    new URLSearchParams(location.search).get("orderID");

  let blocks = $$('[data-component="shipments"] [data-component="purchasedItems"]', doc);
  if (!blocks.length) blocks = $$('[data-component="purchasedItems"]', doc);
  const shipments = blocks.map((pi, idx) => {
    // The shipment's box: nearest ancestor holding a status, but only this one shipment.
    let box = pi;
    while (box.parentElement && !box.querySelector('[data-component="shipmentStatus"]'))
      box = box.parentElement;
    if ($$('[data-component="purchasedItems"]', box).length > 1) box = pi;
    const status = txt($('[data-component="shipmentStatus"]', box)).split(/(?<=\d)\s+(?=[A-Z])/)[0];

    let titles = $$('[data-component="itemTitle"]', pi);
    if (!titles.length)
      titles = $$('a[href*="/dp/"], a[href*="/gp/product/"]', pi).filter(
        (a) => txt(a) && !$("img", a),
      );
    const items = titles.map((t) => {
      let root = t;
      // Climb toward pi (an ancestor of t, so the loop ends there at the latest).
      while (root !== pi && !root.querySelector('[data-component="itemImage"], img')) {
        const up = root.parentElement;
        if (!up) break;
        root = up;
      }
      const priceBox = $('[data-component="unitPrice"]', root);
      const price =
        cents(txt($(".a-offscreen", priceBox || root)) || moneyIn(priceBox || root)[0] || "") || 0;
      const qty = itemQty(root);
      return { title: txt(t), price, qty, ext: price * qty, shipment: idx };
    });
    return { idx, box, status, items };
  });

  const summary: Summary = {
    subtotal: null,
    beforeTax: null,
    tax: 0,
    preTaxAdj: 0,
    credits: 0,
    grand: null,
    lines: [],
  };
  for (const [label, val] of summaryRows(doc)) {
    summary.lines.push([label, val]);
    if (/grand total/i.test(label)) {
      summary.grand = val;
      break;
    } // rows after this are informational (e.g. FSA/HSA eligible)
    else if (/total before tax/i.test(label)) summary.beforeTax = val;
    else if (/subtotal/i.test(label)) summary.subtotal = val;
    else if (/tax/i.test(label)) summary.tax += val;
    else if (/points|gift card|reward/i.test(label)) summary.credits += -val; // paid by non-card balance
    else if (/eligible|refund/i.test(label)) continue;
    else summary.preTaxAdj += val; // shipping, fees (+) and promotions/coupons (-)
  }
  // Amazon's own pre-tax total is the most reliable source for shipping/fees/discounts combined.
  if (summary.beforeTax != null && summary.subtotal != null)
    summary.preTaxAdj = summary.beforeTax - summary.subtotal;
  return { orderId, shipments, summary };
}

/** Quantity: Amazon overlays it as a bare number on the product image; otherwise "Qty: N" text. */
function itemQty(root: Element): number {
  const pic = $('[data-component="itemImage"]', root) || $("img", root)?.parentElement;
  const scope = pic?.closest('[data-component="itemImage"]') ? pic : pic?.parentElement;
  const badge =
    scope &&
    leaves(scope)
      .map(txt)
      .find((t) => /^\d{1,3}$/.test(t));
  if (badge) return +badge || 1;
  const field = txt($('[data-component="quantity"]', root)).match(/\d+/);
  if (field) return +field[0] || 1;
  const label = txt(root).match(/\b(?:qty|quantity)\s*:?\s*(\d+)/i);
  const n = label?.[1];
  return n ? +n || 1 : 1;
}

/** Order Summary as [label, cents] pairs, read from the text rather than the row markup. */
function summaryRows(doc: Document): [string, number][] {
  let box: Element | null | undefined = $('[data-component="chargeSummary"]', doc);
  if (!box) {
    // Fallback: the smallest block that holds both "Grand Total" and "Subtotal".
    box = leaves(doc.body || doc).find((e) => /grand total/i.test(txt(e)));
    while (box && !/subtotal/i.test(box.textContent)) box = box.parentElement;
  }
  const rows: [string, number][] = [];
  let colonLabel: string | null = null;
  let lastText: string | null = null;
  for (const e of box ? leaves(box) : []) {
    const t = txt(e);
    if (IS_MONEY.test(t)) {
      const label = colonLabel || lastText;
      // IS_MONEY admits a few strings cents() rejects (e.g. "$,.50"); skip those rather than add null.
      const val = cents(t);
      if (label && val != null) rows.push([label, val]);
      colonLabel = lastText = null;
    } else if (/:\s*$/.test(t)) {
      colonLabel = t.replace(/:\s*$/, "");
    } else {
      lastText = t;
    }
  }
  return rows;
}

/** Give every item a tax-in amount by spreading shipping, discounts and tax by price. */
export function priceItems(order: ParsedOrder): {
  order: Order;
  warnings: string[];
} {
  const items = order.shipments.flatMap((s) => s.items);
  const sumExt = items.reduce((a, i) => a + i.ext, 0);
  const s = order.summary;
  const warnings: string[] = [];
  const unpriced = items.filter((i) => !i.price).length;
  if (unpriced)
    warnings.push(
      `Couldn't read the price of ${unpriced} item${unpriced > 1 ? "s" : ""}. Amazon may have changed this page.`,
    );
  if (s.subtotal == null || s.grand == null)
    warnings.push(
      "Couldn't read the Order Summary, so tax and shipping aren't included in the estimates.",
    );
  let scale = 1;
  if (s.subtotal != null && s.subtotal !== sumExt && s.subtotal > 0) {
    warnings.push(
      `Items on the page add to ${fmt(sumExt)} but the order subtotal is ${fmt(s.subtotal)} (cancelled or hidden items?). Estimates are scaled to the visible items.`,
    );
    scale = sumExt / s.subtotal;
  }
  const adj = allocateBy(Math.round(s.preTaxAdj * scale), items, (i) => i.ext);
  const tax = allocateBy(Math.round(s.tax * scale), adj, ([i, a]) => i.ext + a);
  // Keep each priced item with the shipment it came from.
  const priced = tax.map(([[i, a], t]) => ({
    from: i,
    item: { ...i, total: i.ext + a + t },
  }));
  const shipments = order.shipments.map((sh): Shipment => {
    const its = sh.items.flatMap((i) => priced.filter((p) => p.from === i).map((p) => p.item));
    return { ...sh, items: its, total: its.reduce((a, i) => a + i.total, 0) };
  });
  return { order: { ...order, shipments }, warnings };
}
