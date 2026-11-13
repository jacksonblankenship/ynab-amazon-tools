import { describe, expect, test } from "vitest";
import { cents, fmt } from "./money.ts";

describe("cents", () => {
  test.each([
    ["$1,234.56", 123456],
    ["-$1,234.56", -123456],
    ["−$4.78", -478], // U+2212, the minus sign some pages print
    ["+$4.78", 478],
    ["- $ 4.78", -478],
    ["$0.00", 0],
    ["$12", 1200],
    ["$4.5", 450],
    ["Order total: $1,001.10 (2 items)", 100110],
  ])("%j -> %d", (input, expected) => {
    expect(cents(input)).toBe(expected);
  });

  test("takes the first amount in the text", () => {
    expect(cents("$5.00 of $20.00")).toBe(500);
  });

  test.each(["", "4.78", "USD 4.78", "$", "free"])("%j has no amount", (input) => {
    expect(cents(input)).toBeNull();
  });

  test("accepts non-strings", () => {
    expect(cents(null)).toBeNull();
    expect(cents(undefined)).toBeNull();
    expect(cents(12.34)).toBeNull();
  });
});

describe("fmt", () => {
  test.each([
    [123456, "$1,234.56"],
    [-123456, "-$1,234.56"],
    [0, "$0.00"],
    [5, "$0.05"],
    [-478, "-$4.78"],
    [123456789, "$1,234,567.89"],
  ])("%d -> %j", (input, expected) => {
    expect(fmt(input)).toBe(expected);
  });

  test("round-trips through cents", () => {
    for (const c of [0, 1, -1, 99, 100, -478, 123456, -9876543]) expect(cents(fmt(c))).toBe(c);
  });
});
