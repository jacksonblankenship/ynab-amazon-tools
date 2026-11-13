// Reading Amazon's transactions pages from real (scrubbed) captures: one order's page, which
// the order page fetches, and the full list's rows, read when its startup data is missing.
// Expected values come from test/fixtures/README.md.
import { afterEach, describe, expect, test, vi } from "vitest";
import listRows from "../test/fixtures/amazon/transactions-list.rows.html?raw";
import refundTxns from "../test/fixtures/amazon/order-refund.transactions.html?raw";
import sharedTxns from "../test/fixtures/amazon/order-shared-points.transactions.html?raw";
import threeTxns from "../test/fixtures/amazon/order-three-deliveries.transactions.html?raw";
import { loadPage } from "../test/html.ts";
import { PageChanged } from "./lib/errors.ts";
import { fetchTransactions, parseTransactions, rowsUnreadable } from "./transactions.ts";
import type { Txn } from "./types.ts";

const A = "114-7767348-8987501";
const B = "114-4442968-2608428";
const THREE = "114-0890458-9035361";
const REFUND = "114-0271446-2821572";
const GIFT = "114-3317431-5179528";
const VISA = "Rewards Visa ****0257";

/** What a person reads off a row, without the page element. */
const shown = ({ el: _el, ...t }: Txn) => t;

/** Serve `html` as Amazon's transactions page; returns the fetch mock. */
function serve(html: string, status = 200) {
  const f = vi.fn(async (_url: string, _init?: RequestInit) => new Response(html, { status }));
  vi.stubGlobal("fetch", f);
  return f;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("one order's transactions page", () => {
  test("fetches it once, by order number", async () => {
    const f = serve(sharedTxns);
    await fetchTransactions(A);
    expect(f).toHaveBeenCalledTimes(1);
    expect(f.mock.calls[0]?.[0]).toBe(`/cpe/yourpayments/transactions?transactionTag=${A}`);
  });

  test("two card charges and a points payment shared with another order", async () => {
    serve(sharedTxns);
    expect((await fetchTransactions(A)).map(shown)).toEqual([
      {
        method: VISA,
        date: "September 10, 2026",
        status: "Completed",
        orderId: A,
        orderIds: [A],
        amount: 23652,
        kind: "charge",
      },
      {
        method: VISA,
        date: "September 9, 2026",
        status: "Completed",
        orderId: A,
        orderIds: [A],
        amount: 13676,
        kind: "charge",
      },
      {
        method: "Amazon Visa points",
        date: "September 9, 2026",
        status: "Completed",
        orderId: A,
        orderIds: [A, B],
        amount: 5216,
        kind: "credit",
      },
    ]);
  });

  test("three card charges and a points payment", async () => {
    serve(threeTxns);
    const rows = await fetchTransactions(THREE);
    expect(rows.map((t) => [t.kind, t.amount, t.date, t.method])).toEqual([
      ["charge", 2271, "September 9, 2026", VISA],
      ["charge", 4293, "September 8, 2026", VISA],
      ["charge", 6252, "September 8, 2026", VISA],
      ["credit", 2640, "September 6, 2026", "Amazon Visa points"],
    ]);
  });

  test("a refund and the charge it reverses", async () => {
    serve(refundTxns);
    const rows = await fetchTransactions(REFUND);
    expect(rows.map((t) => [t.kind, t.amount, t.date, t.method])).toEqual([
      ["refund", 6864, "September 10, 2026", VISA],
      ["charge", 8008, "August 20, 2026", VISA],
    ]);
  });

  test("an error page is reported, not read as no charges", async () => {
    serve("<p>Service unavailable</p>", 503);
    await expect(fetchTransactions(A)).rejects.toThrow(/503/);
  });

  test("a page that names the order but has no readable amounts means Amazon changed it", async () => {
    // Amounts written some new way: the order is there, but no row reads.
    serve(sharedTxns.replace(/\$(?=\d)/g, "USD "));
    await expect(fetchTransactions(A)).rejects.toThrow(PageChanged);
  });
});

describe("the transactions list, read from the page's rows", () => {
  const all = () => parseTransactions(loadPage(listRows), null);

  test("reads all 20 rows, newest first", () => {
    const rows = all();
    expect(rows).toHaveLength(20);
    expect(rows[0]?.date).toBe("Sep 13, 2026");
    expect(rows.at(-1)?.date).toBe("Sep 08, 2026");
  });

  test("tells charges, points, gift card and refunds apart", () => {
    const rows = all();
    const kinds = (k: Txn["kind"]) => rows.filter((t) => t.kind === k);
    expect(kinds("refund").map((t) => t.amount)).toEqual([6864, 7638, 58]);
    expect(kinds("credit").map((t) => [t.method, t.amount])).toEqual([
      ["Amazon Chase Co-Branded Credit Card Rewards", 1544],
      ["Amazon Chase Co-Branded Credit Card Rewards", 4089],
      ["Amazon Chase Co-Branded Credit Card Rewards", 5216],
      ["Amazon Gift Card", 9512],
    ]);
    // Every other row is the card, its mask and digits read from separate spans.
    expect(kinds("charge").every((t) => t.method === VISA)).toBe(true);
    expect(kinds("charge")).toHaveLength(13);
  });

  test("a points row covering two orders lists both", () => {
    const pts = all().find((t) => t.amount === 5216);
    expect(pts?.orderIds).toEqual([A, B]);
  });

  test("filtering to one order keeps a shared row and drops the rest", () => {
    expect(parseTransactions(loadPage(listRows), B).map((t) => [t.kind, t.amount])).toEqual([
      ["charge", 2324],
      ["credit", 5216],
    ]);
    expect(parseTransactions(loadPage(listRows), GIFT).map((t) => [t.kind, t.amount])).toEqual([
      ["charge", 4196],
      ["credit", 9512],
    ]);
  });

  test("when amounts stop reading, it says the rows are unreadable instead of showing none", () => {
    const doc = loadPage(listRows.replace(/\$(?=\d)/g, "USD "));
    expect(parseTransactions(doc, null)).toEqual([]);
    expect(rowsUnreadable(doc.body)).toBe(true);
  });
});
