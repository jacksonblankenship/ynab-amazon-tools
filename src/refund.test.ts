// Refund tracing, Amazon side: from the refunded order and its transactions to the trace the
// YNAB tab looks up. Built on the real partial refund (see test/fixtures/README.md).
import { describe, expect, test } from "vitest";
import { loadPage } from "../test/html.ts";
import orderHtml from "../test/fixtures/amazon/order-refund.html?raw";
import transactionsHtml from "../test/fixtures/amazon/order-refund.transactions.html?raw";
import { parseOrder, priceItems } from "./order.ts";
import { answerRefund, refundPanel, traceRefund } from "./refund.ts";
import { parseTransactions } from "./transactions.ts";
import type { Txn } from "./types.ts";

function refundedOrder() {
  const { order } = priceItems(parseOrder(loadPage(orderHtml)));
  const txns = parseTransactions(loadPage(transactionsHtml), order.orderId);
  const refund = txns.find((t) => t.kind === "refund");
  if (!refund) throw new Error("fixture has no refund");
  document.body.innerHTML = "";
  return { order, charges: txns.filter((t) => t.kind === "charge"), refund };
}

describe("tracing a refund", () => {
  test("the partial refund carries the order's one card charge, and no item guess", () => {
    const { order, charges, refund } = refundedOrder();
    const t = traceRefund(order, charges, refund);
    expect(t).toMatchObject({
      orderId: "114-0271446-2821572",
      refund: { amount: 6864, date: "September 10, 2026", method: "Rewards Visa ****0257" },
      // $68.64 is less than the one item's $80.08, so no set of items adds up to it.
      itemSets: [],
      charges: [{ amount: 8008, date: "August 20, 2026", method: "Rewards Visa ****0257" }],
    });
  });

  test("a refund of the whole item names it", () => {
    const { order, charges, refund } = refundedOrder();
    const t = traceRefund(order, charges, { ...refund, amount: 8008 });
    expect(t.itemSets).toEqual([
      [{ title: expect.stringMatching(/^Packable Rain Jacket/), units: 1, amount: 8008 }],
    ]);
  });

  test("without a YNAB token, the panel lists the charges and says the YNAB tab has the category", async () => {
    const { order, charges, refund } = refundedOrder();
    const t = traceRefund(order, charges, refund);
    const panel = refundPanel(t);
    await answerRefund(panel, t, "b49ec261-e368-45d9-8d7c-be85300bf1d4");
    expect(panel.textContent).toMatch(/\$68\.64/);
    expect(panel.textContent).toMatch(/\$80\.08 on August 20, 2026/);
    expect(panel.textContent).toMatch(/YNAB tab/);
    // No item adds up to the refund, so none is named.
    expect(panel.textContent).not.toMatch(/Rain Jacket/);
  });

  test("with no card charge, the panel says there's nothing to trace", () => {
    const { order, refund } = refundedOrder();
    const panel = refundPanel(traceRefund(order, [] as Txn[], refund));
    expect(panel.textContent).toMatch(/card charge/);
    expect(panel.textContent).not.toMatch(/YNAB tab/);
  });
});
