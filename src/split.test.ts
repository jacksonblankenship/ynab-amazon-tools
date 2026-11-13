// Several charges for one delivery: how close a charge must come to its items' estimates for
// the split to count as clean (each item paid by one charge) rather than shared by item value.
// Estimates are tax-in and rounded per item, so a cent or so per item is expected; a gap of
// dollars means the items didn't go that way.
import { describe, expect, test } from "vitest";
import { splitGroup } from "./matcher.ts";
import type { Charge, PricedItem } from "./types.ts";

const item = (total: number): PricedItem => ({
  title: `item ${total}`,
  price: total,
  qty: 1,
  ext: total,
  shipment: 0,
  total,
});

const charges = (...amounts: number[]): Charge[] => amounts.map((amount) => ({ amount }));

/** Whether each charge was tied to its own items. */
const clean = (items: PricedItem[], amounts: number[], absorbed = 0) =>
  splitGroup(items, charges(...amounts), absorbed).map((s) => s.exact);

describe("splitting one delivery between its charges", () => {
  test("charges a cent off each item's estimate still split cleanly", () => {
    expect(clean([item(2000), item(3001)], [2001, 3000])).toEqual([true, true]);
  });

  test("a charge $10 off its items doesn't split cleanly", () => {
    expect(clean([item(2000), item(4000)], [2000, 5000])).toEqual([false, false]);
  });

  test("a charge short by the points the delivery absorbed, give or take cents, splits cleanly", () => {
    expect(clean([item(2000), item(4000)], [2000, 2998], 1000)).toEqual([true, true]);
  });

  test("a charge short by $10 more than the points absorbed doesn't split cleanly", () => {
    expect(clean([item(2000), item(4000)], [2000, 2000], 1000)).toEqual([false, false]);
  });
});
