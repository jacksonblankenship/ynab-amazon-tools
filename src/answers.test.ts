// Saved answers: once a YNAB line has been worked out on Amazon, what it was is kept, so a
// later look at the same line needs no Amazon request.
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { gm } from "../test/gm.ts";
import {
  ANSWERS_KEY,
  checkAccount,
  forgetAnswers,
  rememberRow,
  rowFor,
  saveAnswer,
  savedAnswer,
} from "./answers.ts";
import type { AnswerBody, YnabRow } from "./types.ts";

// Importing main.ts registers the menu; its page handling isn't under test here.
vi.mock("./order-page.ts", () => ({ orderPage: () => {}, focusTarget: () => null }));

const NOW = new Date(2026, 10, 13, 12);
beforeEach(() => {
  vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
});
afterEach(() => {
  vi.useRealTimers();
});

const ID = "fb543ae8-82f4-4b74-81d9-1d72f989b083";
const row = (init: Partial<YnabRow> = {}): YnabRow => ({
  amount: 23652,
  kind: "charge",
  date: "2026-09-11",
  id: ID,
  ...init,
});
const charge: AnswerBody = {
  orderId: "114-7767348-8987501",
  items: [{ title: "Cordless Drill", amount: 23652, qty: 1 }],
  exact: true,
  cautions: [],
};
const lookUp = (
  init: Partial<{ amount: number; kind: "charge" | "refund"; dates: string[] }> = {},
) => savedAnswer({ amount: 23652, kind: "charge", dates: ["2026-09-11"], id: ID, ...init });
const later = (days: number) => vi.setSystemTime(NOW.getTime() + days * 864e5);
const signIn = (account: string) => {
  document.body.innerHTML = `<a data-hashed-id="${account}">Account</a>`;
};

describe("a saved answer", () => {
  test("comes back for the same YNAB line, with what it paid for", () => {
    saveAnswer(row(), charge);
    expect(lookUp()).toEqual({
      kind: "charge",
      amount: 23652,
      date: "2026-09-11",
      id: ID,
      ...charge,
      at: NOW.getTime(),
    });
  });

  test("doesn't answer for another line: other amount, date, kind or YNAB transaction", () => {
    saveAnswer(row(), charge);
    expect(lookUp({ amount: 23653 })).toBeNull();
    expect(lookUp({ dates: ["2026-09-12"] })).toBeNull();
    expect(lookUp({ kind: "refund" })).toBeNull();
    expect(
      savedAnswer({ amount: 23652, kind: "charge", dates: ["2026-09-11"], id: "other" }),
    ).toBeNull();
  });

  test("a line with no YNAB transaction id is told by amount, date and kind", () => {
    saveAnswer({ amount: 23652, kind: "charge", date: "2026-09-11" }, charge);
    expect(savedAnswer({ amount: 23652, kind: "charge", dates: ["2026-09-11"] })?.items).toEqual(
      charge.items,
    );
  });

  test("a date YNAB can read two ways finds the answer under either reading", () => {
    saveAnswer(row({ date: "2026-07-09" }), charge);
    expect(lookUp({ dates: ["2026-09-07", "2026-07-09"] })?.orderId).toBe(charge.orderId);
  });

  test("keeps a refund's category answer", () => {
    const refund: AnswerBody = {
      orderId: "114-0271446-2821572",
      items: [],
      exact: false,
      category: { names: [{ name: "Fun Money", amount: 8008 }], confident: true },
      cautions: ["YNAB is limiting requests, so other plans weren't checked."],
    };
    saveAnswer(row({ kind: "refund", amount: 6864 }), refund);
    expect(lookUp({ kind: "refund", amount: 6864 })).toMatchObject(refund);
  });

  test("a newer answer for the same line replaces the older one", () => {
    saveAnswer(row(), charge);
    saveAnswer(row(), { ...charge, exact: false });
    expect(lookUp()?.exact).toBe(false);
  });

  test("expires after 90 days", () => {
    saveAnswer(row(), charge);
    later(89);
    expect(lookUp()).not.toBeNull();
    later(91);
    expect(lookUp()).toBeNull();
  });
});

describe("clearing saved answers", () => {
  test("forgetting clears them", () => {
    saveAnswer(row(), charge);
    forgetAnswers();
    expect(lookUp()).toBeNull();
  });

  test('Tampermonkey\'s "Forget saved Amazon transactions" clears them too', async () => {
    saveAnswer(row(), charge);
    await import("./main.ts");
    gm.clickMenu("Forget saved Amazon transactions");
    expect(lookUp()).toBeNull();
  });

  test("an Amazon page signed in to another account clears them", () => {
    signIn("A1");
    saveAnswer(row(), charge);
    checkAccount();
    expect(lookUp()).not.toBeNull();
    signIn("B2");
    checkAccount();
    expect(lookUp()).toBeNull();
  });

  test("a page where the account can't be told leaves them", () => {
    signIn("A1");
    saveAnswer(row(), charge);
    document.body.innerHTML = "";
    checkAccount();
    expect(lookUp()).not.toBeNull();
  });

  test("a damaged saved value reads as none saved", () => {
    for (const v of ["garbage", { records: [] }, { records: { x: { kind: "charge" } } }]) {
      gm.seed(ANSWERS_KEY, v);
      expect(lookUp()).toBeNull();
      saveAnswer(row(), charge);
      expect(lookUp()).not.toBeNull();
    }
  });
});

describe("the YNAB line, handed to the Amazon tab", () => {
  test("is found by amount and kind, nearest the date Amazon gives the charge", () => {
    rememberRow({ amount: 23652, kind: "charge", dates: ["2026-09-01"], id: "a" });
    rememberRow({ amount: 23652, kind: "charge", dates: ["2026-09-11"], id: "b" });
    rememberRow({ amount: 23652, kind: "refund", dates: ["2026-09-10"], id: "c" });
    expect(rowFor(23652, "charge", "September 10, 2026")).toEqual({
      amount: 23652,
      kind: "charge",
      date: "2026-09-11",
      id: "b",
    });
    expect(rowFor(999, "charge", "September 10, 2026")).toBeUndefined();
  });

  test("a date YNAB reads two ways settles on the reading nearest Amazon's", () => {
    rememberRow({ amount: 4308, kind: "charge", dates: ["2026-09-07", "2026-07-09"] });
    expect(rowFor(4308, "charge", "July 8, 2026")?.date).toBe("2026-07-09");
  });

  test("is forgotten after ten minutes", () => {
    rememberRow({ amount: 23652, kind: "charge", dates: ["2026-09-11"], id: ID });
    later(1 / 144 + 1e-4);
    expect(rowFor(23652, "charge", "September 10, 2026")).toBeUndefined();
  });

  test("keeps nothing but the amount, kind, date and transaction id", () => {
    rememberRow({ amount: 23652, kind: "charge", dates: ["2026-09-11"], id: ID });
    saveAnswer(row(), charge);
    const stored = JSON.stringify([gm.get("acs-rows"), gm.get(ANSWERS_KEY)]);
    expect(stored).not.toMatch(/memo|payee|account_?name|plan/i);
  });
});
