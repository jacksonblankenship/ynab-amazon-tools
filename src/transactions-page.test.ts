// The transactions page's own requests to Amazon: scrolling the list for older rows when the
// transaction service can't be used, and the order previews offered when several charges are
// equally likely. Amazon answers fast loading with 429s, so these are spaced out.
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import listRows from "../test/fixtures/amazon/transactions-list.rows.html?raw";
import { loadPage } from "../test/html.ts";
import { transactionsPage } from "./transactions-page.ts";
import { transactionRows } from "./transactions.ts";

beforeEach(() => {
  vi.useFakeTimers({ now: new Date(2026, 8, 14, 12) });
  // The shortest pause the jitter allows.
  vi.spyOn(Math, "random").mockReturnValue(0);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  sessionStorage.clear();
});

/** Arrive on the transactions page from YNAB, looking for `amount` cents near `date`. */
function arriveFromYnab(amount: number, date: string, extra = "") {
  history.replaceState(
    null,
    "",
    `/cpe/yourpayments/transactions#acs-find=${amount}&acs-date=${date}${extra}`,
  );
}

/** A $12.34 card charge for order `id`, as the page's startup data lists it. */
const row = (id: string) => ({
  formattedAmount: "-$12.34",
  formattedDate: "Sep 10, 2026",
  statusInfo: { label: "Charged" },
  orderData: [{ orderDisplayString: `Order #${id}` }],
  paymentMethodDisplayStringData: {
    paymentMethodName: "Visa",
    paymentMethodNumber: { lastDigits: "1234" },
  },
});
/** The page's startup data, listing `rows`. */
function nextData(rows: unknown[]) {
  const s = document.createElement("script");
  s.id = "__NEXT_DATA__";
  s.type = "application/json";
  s.textContent = JSON.stringify({
    props: { pageProps: { state: { transactionResponseState: { transactionsList: rows } } } },
  });
  document.body.append(s);
}

/** Gaps in ms between consecutive times. */
const gaps = (times: number[]) => times.slice(1).map((t, i) => t - (times[i] ?? 0));

describe("scrolling for older transactions", () => {
  test("loads each batch no sooner than 1.5 seconds after the last", async () => {
    // The page's rows only (no startup data), so the service can't be asked and the list is scrolled.
    loadPage(listRows);
    const row = transactionRows(document.body).at(-1);
    if (!row) throw new Error("fixture has no rows");
    const start = Date.now();
    const scrolledAt: number[] = [];
    // Each scroll loads one more row (the page does it a batch at a time); after three, no more.
    vi.spyOn(window, "scrollTo").mockImplementation(() => {
      scrolledAt.push(Date.now());
      if (scrolledAt.length <= 3) row.after(row.cloneNode(true));
    });
    arriveFromYnab(99999, "2026-09-07");
    const page = transactionsPage();
    await vi.runAllTimersAsync();
    await page;
    // Three loads, then the one that found nothing more.
    expect(scrolledAt).toHaveLength(4);
    expect(scrolledAt[0]! - start).toBeGreaterThanOrEqual(1500);
    for (const gap of gaps(scrolledAt)) expect(gap).toBeGreaterThanOrEqual(1500);
  });
});

describe("previewing equally likely orders", () => {
  test("a YNAB plan in an old link goes no further: not in the order links, not in sessionStorage", async () => {
    const plan = "b49ec261-e368-45d9-8d7c-be85300bf1d4";
    nextData(
      ["114-1111111-1111111", "114-2222222-2222222"].map((id) => ({
        ...row(id),
        formattedAmount: "+$12.34",
        statusInfo: { label: "Refunded" },
      })),
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("<html></html>")),
    );
    const stored: string[] = [];
    vi.spyOn(Storage.prototype, "setItem").mockImplementation((_k, v) => void stored.push(v));
    arriveFromYnab(1234, "2026-09-11", `&acs-kind=refund&acs-plan=${plan}`);
    await transactionsPage();
    await vi.runAllTimersAsync();
    const links = [...document.querySelectorAll<HTMLAnchorElement>("a[href*='order-details']")];
    expect(links).toHaveLength(2);
    for (const a of links) {
      expect(new URLSearchParams(new URL(a.href).hash.slice(1)).get("acs-kind")).toBe("refund");
      expect(a.href).not.toContain(plan);
    }
    expect(stored.join(" ")).not.toContain(plan);
    expect(location.hash).toBe("");
  });

  test("fetches each order's contents a second apart, not all at once", async () => {
    const orders = ["114-1111111-1111111", "114-2222222-2222222", "114-3333333-3333333"];
    nextData(orders.map(row));
    const fetchedAt: number[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        fetchedAt.push(Date.now());
        return new Response("<html></html>");
      }),
    );
    arriveFromYnab(1234, "2026-09-11");
    await transactionsPage();
    await vi.runAllTimersAsync();
    expect(document.body.textContent).toMatch(/3 charges of \$12\.34/);
    expect(fetchedAt).toHaveLength(3);
    for (const gap of gaps(fetchedAt)) expect(gap).toBeGreaterThanOrEqual(1000);
  });
});
