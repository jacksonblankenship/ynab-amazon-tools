// End to end on real (scrubbed) orders: read the order page, fetch its transactions, and match
// each card charge to the delivery it paid for, the way the order page does. The ground truth
// (which charge paid which delivery) is from test/fixtures/README.md.
import { afterEach, describe, expect, test, vi } from "vitest";
import giftCard from "../test/fixtures/amazon/order-gift-card.html?raw";
import refund from "../test/fixtures/amazon/order-refund.html?raw";
import refundTxns from "../test/fixtures/amazon/order-refund.transactions.html?raw";
import sharedOther from "../test/fixtures/amazon/order-shared-points-other.html?raw";
import shared from "../test/fixtures/amazon/order-shared-points.html?raw";
import sharedTxns from "../test/fixtures/amazon/order-shared-points.transactions.html?raw";
import threeDeliveries from "../test/fixtures/amazon/order-three-deliveries.html?raw";
import threeTxns from "../test/fixtures/amazon/order-three-deliveries.transactions.html?raw";
import listRows from "../test/fixtures/amazon/transactions-list.rows.html?raw";
import { loadPage } from "../test/html.ts";
import { solve } from "./matcher.ts";
import { parseOrder, priceItems } from "./order.ts";
import { creditRange } from "./order-page.ts";
import { fetchTransactions } from "./transactions.ts";
import type { Txn } from "./types.ts";

afterEach(() => {
  vi.unstubAllGlobals();
});

/**
 * The order page's pipeline: parse, price, fetch the order's transactions (served from
 * `txnsHtml`), then solve, with the order page's own credit range.
 */
async function matchOrder(orderHtml: string, txnsHtml: string) {
  const { order } = priceItems(parseOrder(loadPage(orderHtml)));
  const fetchMock = vi.fn(async () => new Response(txnsHtml));
  vi.stubGlobal("fetch", fetchMock);
  const txns = await fetchTransactions(order.orderId ?? "");
  const charges = txns.filter((t) => t.kind === "charge");
  const credits = txns.filter((t) => t.kind === "credit");
  const credit = creditRange(credits, order.summary.credits);
  const { solution, incomplete } = solve(order.shipments, charges, credit);
  /** Charge amount -> the deliveries (1-based, as the panel names them) it landed on. */
  const landed = Object.fromEntries(
    charges.map((c, j) => {
      const gi = solution?.assign[j] ?? -1;
      const members = gi < 0 ? null : (solution?.groups[gi]?.members ?? null);
      return [c.amount, members?.map((x) => x + 1) ?? null];
    }),
  );
  return { solution, incomplete, landed, requests: fetchMock.mock.calls.length };
}

describe("matching charges to deliveries on real orders", () => {
  test("shared points: each card charge lands on the delivery it paid for", async () => {
    // Amazon's summary says $23.24 of points; its transactions say $52.16 shared with
    // another order. By the charges, D2 took $236.52 and D1 $136.76, each topped up by
    // about $23.24 of points.
    const { solution, landed, incomplete, requests } = await matchOrder(shared, sharedTxns);
    expect(requests).toBe(1);
    expect(incomplete).toBe(false);
    expect(landed).toEqual({ 23652: [2], 13676: [1] });
    expect(solution?.ambiguous).toBe(false);
  });

  test("shared points, the other order: its card charge lands on its one delivery", async () => {
    // Its summary says Grand Total $0.00, yet the list shows a $23.24 card charge for it.
    const { landed } = await matchOrder(sharedOther, listRows);
    expect(landed).toEqual({ 2324: [1] });
  });

  test("item coupon: each charge lands on its own delivery", async () => {
    // The coupon was on D3 only: D1 = $22.71, D2 = $62.52, D3 = $42.93 + $26.40 points.
    const { solution, landed, incomplete } = await matchOrder(threeDeliveries, threeTxns);
    expect(incomplete).toBe(false);
    expect(landed).toEqual({ 2271: [1], 6252: [2], 4293: [3] });
    expect(solution?.ambiguous).toBe(false);
  });

  test("gift card plus card: the card charge lands on the one delivery", async () => {
    const { landed, solution } = await matchOrder(giftCard, listRows);
    expect(landed).toEqual({ 4196: [1] });
    // The gift card paid the rest of it.
    expect(solution?.absorbedBy).toEqual([9512]);
  });

  test("partial refund: the original charge lands on the delivery", async () => {
    const { landed, solution } = await matchOrder(refund, refundTxns);
    expect(landed).toEqual({ 8008: [1] });
    expect(solution?.absorbedBy).toEqual([0]);
  });
});

describe("how much points or gift cards paid toward an order", () => {
  const credit = (amount: number, orderIds: string[]): Txn => ({
    method: "Amazon Gift Card",
    date: "September 9, 2026",
    status: "Completed",
    el: null,
    orderId: orderIds[0] ?? "",
    orderIds,
    amount,
    kind: "credit",
  });

  test("a payment for this order alone is exactly its amount", () => {
    expect(creditRange([credit(9512, ["114-3317431-5179528"])], 9512)).toEqual([9512, 9512]);
  });

  test("a payment shared with another order may be anywhere from none to all of it", () => {
    const own = credit(1000, ["114-7767348-8987501"]);
    const shared = credit(5216, ["114-7767348-8987501", "114-4442968-2608428"]);
    expect(creditRange([own, shared], 2324)).toEqual([1000, 6216]);
  });

  test("without credit transactions, the Order Summary's figure", () => {
    expect(creditRange([], 2640)).toEqual([2640, 2640]);
  });
});
