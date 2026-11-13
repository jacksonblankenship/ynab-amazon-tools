import { describe, expect, test } from "vitest";
import { nearest, readableDates, toDay } from "./dates.ts";

describe("reading dates", () => {
  test("the same day reads the same however Amazon or YNAB print it", () => {
    const days = [
      "November 5, 2026", // an order's own pages
      "Nov 05, 2026", // Amazon's transactions page
      "Nov 5, 2026",
      "11/05/2026",
    ].map(toDay);
    expect(new Set(days).size).toBe(1);
    expect(days[0]).not.toBeNull();
  });

  test("consecutive days are one apart, across a month and a year end", () => {
    const day = (s: string) => toDay(s) ?? NaN;
    expect(day("Nov 05, 2026") - day("November 4, 2026")).toBe(1);
    expect(day("December 1, 2026") - day("Nov 30, 2026")).toBe(1);
    expect(day("January 1, 2027") - day("Dec 31, 2026")).toBe(1);
  });

  test.each(["", "Pending", "not a date"])("%j isn't a date", (s) => {
    expect(toDay(s)).toBeNull();
  });
});

describe("the nearest-dated item", () => {
  const rows = [
    { id: "a", date: "October 28, 2026" },
    { id: "b", date: "November 3, 2026" },
    { id: "c", date: "November 20, 2026" },
  ];
  const near = (date: string, items = rows) => nearest(items, (r) => r.date, date)?.id;

  test("a charge YNAB dates a day after Amazon finds Amazon's row", () => {
    expect(near("Nov 04, 2026")).toBe("b");
  });

  // YNAB's ISO dates read as UTC and Amazon's as local time; rounding to the day keeps them
  // together everywhere but UTC+13 and beyond, where they land a day apart.
  test("works across date formats, including YNAB's ISO dates", () => {
    expect(near("2026-11-19")).toBe("c");
    expect(near("Oct 27, 2026")).toBe("a");
  });

  test("works across a year end", () => {
    const yearEnd = [
      { id: "dec", date: "December 31, 2026" },
      { id: "jan", date: "January 5, 2027" },
    ];
    expect(near("Jan 01, 2027", yearEnd)).toBe("dec");
    expect(near("Jan 04, 2027", yearEnd)).toBe("jan");
  });

  test("an even tie goes to the earlier-listed item", () => {
    expect(near("Oct 31, 2026")).toBe("a");
  });

  test("items with unreadable dates are passed over", () => {
    const items = [{ id: "x", date: "Pending" }, ...rows];
    expect(near("Nov 04, 2026", items)).toBe("b");
  });

  test("an unreadable date falls back to the first item, and no items to nothing", () => {
    expect(near("Pending")).toBe("a");
    expect(near("Nov 04, 2026", [])).toBeUndefined();
  });
});

describe("dates for people", () => {
  test.each([
    [["2026-11-02"], "November 2, 2026"],
    [["2026-10-28", "2026-11-02"], "October 28 or November 2, 2026"],
    [["2026-12-30", "2027-01-02"], "December 30, 2026 or January 2, 2027"],
    [[], ""],
    [["2026-11-02", "soon"], "2026-11-02 or soon"],
  ])("%j -> %j", (isos, expected) => {
    expect(readableDates(isos)).toBe(expected);
  });
});
