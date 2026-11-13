// The Amazon transactions the script remembers, so a later search can answer from them instead
// of asking Amazon again (its allowance is small and answers 429 once spent).
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { gm } from "../test/gm.ts";
import { toDay } from "./dates.ts";
import {
  forgetTxns,
  isCovered,
  remember,
  rememberSweep,
  sweptSpan,
  withCached,
} from "./txn-cache.ts";
import type { Txn } from "./types.ts";

const CACHE_KEY = "acs-txns-v2";

// Importing main.ts registers the menu; its page handling isn't under test here.
vi.mock("./order-page.ts", () => ({ orderPage: () => {}, focusTarget: () => null }));

beforeEach(() => {
  vi.useFakeTimers({ now: new Date(2026, 10, 13, 12), toFake: ["Date"] });
});
afterEach(() => {
  vi.useRealTimers();
});

/** One transaction as the script reads it, with the page row it came from. */
function txn(init: Partial<Txn> = {}): Txn {
  const orderId = init.orderId ?? "112-1234567-1234567";
  return {
    method: "Visa ****1234",
    date: "Nov 05, 2026",
    status: "Completed",
    el: document.createElement("div"),
    orderId,
    orderIds: [orderId],
    amount: 34.19,
    kind: "charge",
    ...init,
  };
}

/** The page as signed in to this Amazon account (Amazon's hash of the customer id). */
function signIn(account: string) {
  document.body.innerHTML = `<a data-hashed-id="${account}">Account</a>`;
}

const cached = () => withCached([]);
const day = (s: string) => toDay(s) ?? NaN;

describe("remembering transactions", () => {
  test("a remembered transaction comes back for a later search, without its page row", () => {
    remember([txn({ amount: 12.5, date: "Nov 02, 2026" })]);
    expect(cached()).toEqual([
      {
        method: "Visa ****1234",
        date: "Nov 02, 2026",
        status: "Completed",
        el: null,
        orderId: "112-1234567-1234567",
        orderIds: ["112-1234567-1234567"],
        amount: 12.5,
        kind: "charge",
      },
    ]);
  });

  test("a transaction on the page isn't offered again from the cache", () => {
    const row = txn();
    remember([row, txn({ amount: 8 })]);
    const all = withCached([row]);
    expect(all.map((r) => r.amount)).toEqual([34.19, 8]);
    expect(all[0]).toBe(row);
  });

  test("the same charge seen twice is kept once", () => {
    remember([txn()]);
    remember([txn()]);
    expect(cached()).toHaveLength(1);
  });

  test("the same charge's date written two ways is kept once", () => {
    // The transactions list and an order's own list write the same day differently.
    remember([txn({ date: "Nov 05, 2026" })]);
    remember([txn({ date: "November 5, 2026" })]);
    expect(cached()).toHaveLength(1);
  });

  test("a pending charge seen again once charged is replaced, not added", () => {
    remember([txn({ status: "Pending" })]);
    remember([txn({ status: "Completed" })]);
    expect(cached().map((r) => r.status)).toEqual(["Completed"]);
  });

  test("charges that differ in amount, day, order, card or kind are all kept", () => {
    remember([
      txn(),
      txn({ amount: 34.2 }),
      txn({ date: "Nov 03, 2026" }),
      txn({ orderId: "112-7654321-7654321" }),
      txn({ method: "Mastercard ****9876" }),
      txn({ kind: "refund" }),
    ]);
    expect(cached()).toHaveLength(6);
  });

  // KNOWN BUG, not fixed: Amazon printed one $34.19 charge as "Nov 05, 2026" on the
  // transactions list and "November 4, 2026" on the order's own list, so it's kept twice.
  // Merging "same amount, order and card within a day" would also merge two real charges
  // a day apart (two deliveries of the same price), and the stored fields can't tell those
  // apart. Downstream the duplicate is mostly harmless: both copies point at the same order,
  // and the order page picks its charge by nearest date.
  test.todo("the same charge dated a day apart by two Amazon pages is kept once");

  test("only the amount, date, status, kind, orders and card are saved, not the page row", () => {
    remember([txn({ el: document.createElement("tr") })]);
    expect(gm.get(CACHE_KEY)).toMatchObject({
      rows: [
        {
          method: "Visa ****1234",
          date: "Nov 05, 2026",
          status: "Completed",
          orderId: "112-1234567-1234567",
          orderIds: ["112-1234567-1234567"],
          amount: 34.19,
          kind: "charge",
        },
      ],
    });
    const [row] = (gm.get(CACHE_KEY) as { rows: object[] }).rows;
    expect(Object.keys(row ?? {}).sort()).toEqual(
      ["amount", "date", "kind", "method", "orderId", "orderIds", "status"].sort(),
    );
  });

  test("keeps the newest 4000 and stops claiming days it dropped", () => {
    rememberSweep("all", [day("Oct 01, 2026"), day("Nov 01, 2026")]);
    const old = Array.from({ length: 2000 }, (_, i) =>
      txn({ amount: i + 1, date: "Oct 01, 2026" }),
    );
    const recent = Array.from({ length: 2000 }, (_, i) =>
      txn({ amount: i + 1, date: "Oct 20, 2026" }),
    );
    remember([...old, ...recent]);
    expect(cached()).toHaveLength(4000);
    remember([txn({ amount: 1, date: "Nov 01, 2026" })]);

    const rows = cached();
    expect(rows).toHaveLength(4000);
    expect(rows.filter((r) => r.date === "Oct 01, 2026")).toHaveLength(1999);
    expect(rows.some((r) => r.date === "Nov 01, 2026")).toBe(true);
    // Oct 1 lost a row, so it's no longer seen in full; Oct 2 onward still is.
    expect(isCovered(["all"], day("Oct 01, 2026"), day("Oct 05, 2026"), null)).toBe(false);
    expect(isCovered(["all"], day("Oct 02, 2026"), day("Oct 05, 2026"), null)).toBe(true);
  });
});

describe("one Amazon account at a time", () => {
  test("another account's transactions aren't offered", () => {
    signIn("ACCOUNT-A");
    remember([txn()]);
    signIn("ACCOUNT-B");
    expect(cached()).toEqual([]);
  });

  test("another account's transactions are cleared once this one's are saved", () => {
    signIn("ACCOUNT-A");
    remember([txn({ amount: 1 })]);
    rememberSweep("all", [day("Oct 01, 2026"), day("Nov 01, 2026")]);
    signIn("ACCOUNT-B");
    remember([txn({ amount: 2 })]);
    expect(cached().map((r) => r.amount)).toEqual([2]);
    expect(isCovered(["all"], day("Oct 10, 2026"), day("Oct 12, 2026"), null)).toBe(false);
    // Going back to the first account doesn't bring its rows back.
    signIn("ACCOUNT-A");
    expect(cached()).toEqual([]);
  });

  test("the same account's transactions stay", () => {
    signIn("ACCOUNT-A");
    remember([txn()]);
    document.body.innerHTML = "";
    signIn("ACCOUNT-A");
    expect(cached()).toHaveLength(1);
  });

  test("a page where the account can't be told uses the cache as it is", () => {
    signIn("ACCOUNT-A");
    remember([txn()]);
    document.body.innerHTML = "";
    expect(cached()).toHaveLength(1);
  });
});

describe("which days have been seen in full", () => {
  test("a sweep vouches for its days up to a week ago, not the latest week", () => {
    rememberSweep("all", [day("Oct 01, 2026"), day("Nov 13, 2026")]);
    expect(isCovered(["all"], day("Oct 01, 2026"), day("Nov 06, 2026"), null)).toBe(true);
    // A pending charge can still post under one of the last week's dates.
    expect(isCovered(["all"], day("Oct 01, 2026"), day("Nov 07, 2026"), null)).toBe(false);
  });

  test("the current page's rows vouch for the latest days", () => {
    rememberSweep("all", [day("Oct 01, 2026"), day("Nov 13, 2026")]);
    const fresh = sweptSpan([txn({ date: "Nov 03, 2026" })], false);
    expect(isCovered(["all"], day("Oct 01, 2026"), day("Nov 13, 2026"), fresh)).toBe(true);
  });

  test("days before a sweep's oldest row aren't vouched for", () => {
    rememberSweep("all", sweptSpan([txn({ date: "Oct 20, 2026" })], false));
    expect(isCovered(["all"], day("Oct 21, 2026"), day("Nov 01, 2026"), null)).toBe(true);
    // The oldest day may continue further down the list.
    expect(isCovered(["all"], day("Oct 20, 2026"), day("Nov 01, 2026"), null)).toBe(false);
  });

  test("the refunds-only list vouches only for refunds", () => {
    rememberSweep("refunds", [day("Oct 01, 2026"), day("Nov 01, 2026")]);
    expect(isCovered(["all", "refunds"], day("Oct 10, 2026"), day("Oct 12, 2026"), null)).toBe(
      true,
    );
    expect(isCovered(["all"], day("Oct 10, 2026"), day("Oct 12, 2026"), null)).toBe(false);
  });
});

describe("forgetting", () => {
  test("forgetting clears saved transactions and the days they vouched for", () => {
    remember([txn()]);
    rememberSweep("all", [day("Oct 01, 2026"), day("Nov 01, 2026")]);
    forgetTxns();
    expect(cached()).toEqual([]);
    expect(isCovered(["all"], day("Oct 10, 2026"), day("Oct 12, 2026"), null)).toBe(false);
  });
});

test('Tampermonkey\'s "Forget saved Amazon transactions" clears them', async () => {
  remember([txn()]);
  await import("./main.ts");
  gm.clickMenu("Forget saved Amazon transactions");
  expect(cached()).toEqual([]);
});

describe("a damaged saved value", () => {
  test.each([
    ["nothing saved", undefined],
    ["a string", "garbage"],
    ["rows that aren't a list", { rows: {}, covered: { all: [], refunds: [] } }],
    ["no coverage", { rows: [] }],
  ])("%s reads as an empty cache", (_, value) => {
    if (value !== undefined) gm.seed(CACHE_KEY, value);
    expect(cached()).toEqual([]);
    expect(isCovered(["all"], day("Oct 10, 2026"), day("Oct 12, 2026"), null)).toBe(false);
    remember([txn()]);
    expect(cached()).toHaveLength(1);
  });

  test("a damaged row is skipped, and the rest still answer", () => {
    gm.seed(CACHE_KEY, {
      rows: [null, { amount: "x" }, { ...txn(), el: undefined }],
      covered: { all: [], refunds: [] },
    });
    expect(cached()).toHaveLength(1);
    remember([txn({ amount: 8 })]);
    expect(cached()).toHaveLength(2);
  });

  test("coverage missing a list reads as none seen on it", () => {
    gm.seed(CACHE_KEY, {
      rows: [],
      covered: { all: [[day("Oct 01, 2026"), day("Nov 01, 2026")]] },
    });
    expect(isCovered(["all", "refunds"], day("Oct 10, 2026"), day("Oct 12, 2026"), null)).toBe(
      true,
    );
    rememberSweep("refunds", [day("Oct 01, 2026"), day("Nov 01, 2026")]);
    expect(isCovered(["refunds"], day("Oct 10, 2026"), day("Oct 12, 2026"), null)).toBe(true);
  });
});
