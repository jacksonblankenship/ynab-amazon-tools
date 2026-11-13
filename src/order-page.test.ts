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
import { gm } from "../test/gm.ts";
import { loadPage } from "../test/html.ts";
import { rememberRow, savedAnswer } from "./answers.ts";
import { solve } from "./matcher.ts";
import { parseOrder, priceItems } from "./order.ts";
import { creditRange, focusTarget, orderPage } from "./order-page.ts";
import { fetchTransactions } from "./transactions.ts";
import type { Txn } from "./types.ts";
import { rememberPlan } from "./ynab-lookup.ts";

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

describe("opened from YNAB", () => {
  const plan = "b49ec261-e368-45d9-8d7c-be85300bf1d4";

  test("a refund's YNAB plan comes from Tampermonkey's storage, by its amount, not the address", () => {
    rememberPlan(6864, plan);
    rememberPlan(1234, "5f4df66c-de7f-49de-9ccc-9dc222ec6379");
    history.replaceState(
      null,
      "",
      "/your-orders/order-details#acs-charge=6864&acs-on=September%2010%2C%202026&acs-kind=refund&acs-plan=5f4df66c-de7f-49de-9ccc-9dc222ec6379",
    );
    expect(focusTarget()).toEqual({
      amount: 6864,
      date: "September 10, 2026",
      kind: "refund",
      plan,
    });
  });

  test("a charge takes no plan", () => {
    rememberPlan(6864, plan);
    history.replaceState(null, "", "/your-orders/order-details#acs-charge=6864");
    expect(focusTarget()).not.toHaveProperty("plan");
  });

  test("the order page's address is cleaned once it's read", async () => {
    history.replaceState(
      null,
      "",
      "/your-orders/order-details?orderID=1#acs-charge=6864&acs-kind=refund",
    );
    await orderPage();
    expect(location.hash).toBe("");
    expect(location.search).toBe("?orderID=1");
  });
});

describe("saving what a YNAB line paid for", () => {
  const ID = "fb543ae8-82f4-4b74-81d9-1d72f989b083";
  /** The order page opened from YNAB's $236.52 line for the shared-points order. */
  async function openFromYnab(amount: number, ynabLine = true) {
    if (ynabLine) rememberRow({ amount, kind: "charge", dates: ["2026-09-11"], id: ID });
    loadPage(shared);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(sharedTxns)),
    );
    vi.stubGlobal("scrollTo", () => {});
    history.replaceState(
      null,
      "",
      `/your-orders/order-details?orderID=114-7767348-8987501#acs-charge=${amount}&acs-on=September%2010%2C%202026`,
    );
    await orderPage();
    return savedAnswer({ amount, kind: "charge", dates: ["2026-09-11"], id: ID });
  }

  test("the items a charge paid for are saved under the YNAB line, with their amounts", async () => {
    const a = await openFromYnab(23652);
    expect(a).toMatchObject({ kind: "charge", amount: 23652, date: "2026-09-11", id: ID });
    expect(a?.orderId).toBe("114-7767348-8987501");
    // D2's one item, topped up by points, so the card paid $236.52 of it.
    expect(a?.items).toEqual([{ title: expect.any(String), amount: 23652, qty: 1 }]);
    expect(a?.exact).toBe(true);
    // The points were shared with another order, so the split rests on a guess at its share.
    expect(a?.cautions.join(" ")).toMatch(/shared with another order/);
  });

  test("a charge that couldn't be tied to a delivery saves nothing", async () => {
    expect(await openFromYnab(99999)).toBeNull();
  });

  test("without the YNAB line it was opened from, nothing is saved", async () => {
    await openFromYnab(23652, false);
    expect(gm.get("acs-answers-v1")).toBeUndefined();
  });
});
