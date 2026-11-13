import { describe, expect, test } from "vitest";
import { solve, splitGroup } from "./matcher.ts";
import type { Charge, PricedItem, Solution } from "./types.ts";

const item = (total: number, title = `item ${total}`): PricedItem => ({
  title,
  price: total,
  qty: 1,
  ext: total,
  shipment: 0,
  total,
});

/** A delivery estimated at `total` cents, made of `n` items. */
const delivery = (total: number, n = 1) => ({
  total,
  items: Array.from({ length: n }, (_, k) => item(k === 0 ? total - (n - 1) : 1)),
});

const charges = (...amounts: number[]): Charge[] => amounts.map((amount) => ({ amount }));

/** For each charge, the deliveries it landed on (by index), or null if unmatched. */
function landed(solution: Solution | null, count: number): (number[] | null)[] {
  return Array.from({ length: count }, (_, j) => {
    const gi = solution?.assign[j] ?? -1;
    return gi < 0 ? null : (solution?.groups[gi]?.members ?? null);
  });
}

/** Points/gift-card cents each charge's delivery absorbed, by charge. */
function absorbed(solution: Solution | null, count: number): (number | null)[] {
  return Array.from({ length: count }, (_, j) => {
    const gi = solution?.assign[j] ?? -1;
    return gi < 0 ? null : (solution?.absorbedBy[gi] ?? null);
  });
}

/** A small deterministic PRNG, so property checks are reproducible. */
function rng(seed: number) {
  let s = seed >>> 0;
  return (lo: number, hi: number) => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return lo + (s % (hi - lo + 1));
  };
}

describe("matching charges to deliveries", () => {
  test("each charge lands on the delivery with its total", () => {
    const { solution, incomplete } = solve(
      [delivery(2599), delivery(1049), delivery(7311)],
      charges(1049, 7311, 2599),
      0,
    );
    expect(incomplete).toBe(false);
    expect(landed(solution, 3)).toEqual([[1], [2], [0]]);
    expect(solution?.ambiguous).toBe(false);
  });

  test("a delivery's estimate a few cents off its charge still matches", () => {
    // Amazon's per-item tax rounding leaves estimates a cent or two off the real charge.
    const { solution } = solve([delivery(2000, 2), delivery(3001)], charges(2002, 3000), 0);
    expect(landed(solution, 2)).toEqual([[0], [1]]);
  });

  test("one charge covering two deliveries billed together lands on both", () => {
    const { solution } = solve(
      [delivery(1500), delivery(2500), delivery(999)],
      charges(4000, 999),
      0,
    );
    expect(landed(solution, 2)).toEqual([[0, 1], [2]]);
  });

  test("a delivery billed as two charges takes both", () => {
    const { solution } = solve([delivery(5000, 3), delivery(1200)], charges(3000, 2000, 1200), 0);
    expect(landed(solution, 3)).toEqual([[0], [0], [1]]);
  });

  test("a charge that fits no delivery is left unmatched and the rest still match", () => {
    const { solution } = solve([delivery(1500), delivery(2500)], charges(1500, 777, 2500), 0);
    expect(landed(solution, 3)).toEqual([[0], null, [1]]);
  });

  test("a delivery with no charge yet doesn't stop the others matching", () => {
    const { solution } = solve([delivery(1500), delivery(2500)], charges(2500), 0);
    expect(landed(solution, 1)).toEqual([[1]]);
  });

  test("a charge larger than any delivery or combination finds no match", () => {
    const { solution } = solve([delivery(1500)], charges(9999), 0);
    expect(landed(solution, 1)).toEqual([null]);
  });

  describe("points and gift-card credit", () => {
    test("a known credit is absorbed by the delivery whose charge is short", () => {
      const { solution } = solve([delivery(3000), delivery(2000)], charges(2000, 2500), 500);
      expect(landed(solution, 2)).toEqual([[1], [0]]);
      expect(absorbed(solution, 2)).toEqual([0, 500]);
    });

    test("a short charge doesn't match when no credit was paid", () => {
      const { solution } = solve([delivery(3000)], charges(2500), 0);
      expect(landed(solution, 1)).toEqual([null]);
    });

    test("a credit can be spread across several deliveries", () => {
      const { solution } = solve([delivery(3000), delivery(2000)], charges(2700, 1800), 500);
      expect(landed(solution, 2)).toEqual([[0], [1]]);
      expect(absorbed(solution, 2)).toEqual([300, 200]);
    });

    // Real order (amounts disguised): two deliveries, two card charges, and a points payment
    // Amazon lists against this order and another, so this order's share is unknown.
    const shared = {
      deliveries: [delivery(4001, 2), delivery(6493, 3)],
      charges: charges(5913, 3419),
    };

    test("a points payment shared with another order matches when its share is a range", () => {
      const { solution, incomplete } = solve(shared.deliveries, shared.charges, [0, 1304]);
      expect(incomplete).toBe(false);
      expect(landed(solution, 2)).toEqual([[1], [0]]);
      // $59.13 on the $64.93 delivery, $34.19 on the $40.01 one: $11.62 of the $13.04 was ours.
      expect(absorbed(solution, 2)).toEqual([580, 582]);
      expect(solution?.ambiguous).toBe(false);
    });

    test("taking the whole shared points payment as this order's finds no match", () => {
      // Why the range exists: the $13.04 also paid for another order.
      const { solution } = solve(shared.deliveries, shared.charges, 1304);
      expect(solution).toBeNull();
    });
  });

  test("two equally good matches are flagged as ambiguous", () => {
    // Either charge could be the one on either delivery, with credit making up the rest.
    const { solution } = solve([delivery(2000), delivery(3000)], charges(1800, 1900), [0, 2000]);
    expect(solution).not.toBeNull();
    expect(solution?.ambiguous).toBe(true);
  });

  test("deliveries with the same total aren't ambiguous: either way is the same split", () => {
    const { solution } = solve([delivery(1500), delivery(1500)], charges(1500, 1500), 0);
    expect(landed(solution, 2)).toEqual([[0], [1]]);
    expect(solution?.ambiguous).toBe(false);
  });

  test("too many charges to check every combination gives up as incomplete instead of hanging", () => {
    const r = rng(7);
    const deliveries = Array.from({ length: 12 }, () => delivery(r(5000, 20000)));
    const many = charges(...Array.from({ length: 30 }, () => r(100, 999)));
    const started = Date.now();
    const { incomplete } = solve(deliveries, many, 0);
    expect(incomplete).toBe(true);
    expect(Date.now() - started).toBeLessThan(10_000);
  });
});

describe("splitting a charge across items", () => {
  const sum = (xs: { amount: number }[]) => xs.reduce((a, x) => a + x.amount, 0);

  test("a single charge is divided by each item's share of the delivery", () => {
    const a = item(3000, "a");
    const b = item(1000, "b");
    const [split] = splitGroup([a, b], charges(4000), 0);
    expect(split?.exact).toBe(true);
    expect(split?.lines).toEqual([
      { item: a, amount: 3000 },
      { item: b, amount: 1000 },
    ]);
  });

  test("a charge short by credit is divided in proportion, still summing to the charge", () => {
    const [split] = splitGroup([item(3000), item(1000)], charges(3000), 1000);
    expect(split?.lines.map((l) => l.amount)).toEqual([2250, 750]);
  });

  test("a leftover cent goes to one item rather than being lost", () => {
    const [split] = splitGroup([item(100), item(100), item(100)], charges(100), 0);
    expect(split?.lines.map((l) => l.amount).sort()).toEqual([33, 33, 34]);
  });

  test("a delivery billed as two charges splits items across both", () => {
    const a = item(2500, "a");
    const b = item(1200, "b");
    const c = item(1300, "c");
    const splits = splitGroup([a, b, c], charges(2500, 2500), 0);
    expect(splits.every((s) => s.exact)).toBe(true);
    expect(splits.map((s) => s.lines.map((l) => l.item.title))).toEqual([["a"], ["b", "c"]]);
    expect(splits.map((s) => sum(s.lines))).toEqual([2500, 2500]);
  });

  test("with credit, one of a delivery's charges may be short by the credit", () => {
    const splits = splitGroup([item(2500, "a"), item(1200, "b")], charges(2500, 700), 500);
    expect(splits.every((s) => s.exact)).toBe(true);
    expect(splits.map((s) => s.lines.map((l) => l.item.title))).toEqual([["a"], ["b"]]);
    expect(splits.map((s) => sum(s.lines))).toEqual([2500, 700]);
  });

  test("charges that don't line up with items are each split across every item, marked inexact", () => {
    const a = item(3000, "a");
    const b = item(1000, "b");
    const splits = splitGroup([a, b], charges(2200, 1800), 0);
    expect(splits.map((s) => s.exact)).toEqual([false, false]);
    expect(splits.map((s) => s.lines.map((l) => l.amount))).toEqual([
      [1650, 550],
      [1350, 450],
    ]);
  });

  test("free items get nothing, and an all-free delivery is split evenly", () => {
    const [split] = splitGroup([item(1000), item(0)], charges(1000), 0);
    expect(split?.lines.map((l) => l.amount)).toEqual([1000, 0]);
    const [even] = splitGroup([item(0), item(0)], charges(1001), 0);
    expect(even?.lines.map((l) => l.amount).sort()).toEqual([500, 501]);
  });

  test("every charge's lines sum exactly to the charge, for any items and charges", () => {
    const r = rng(42);
    for (let run = 0; run < 500; run++) {
      const items = Array.from({ length: r(1, 9) }, () => item(r(0, 50000)));
      const amounts = Array.from({ length: r(1, 4) }, () => r(1, 60000));
      const splits = splitGroup(items, charges(...amounts), r(0, 1) ? 0 : r(1, 5000));
      expect(splits.map((s) => s.charge.amount)).toEqual(amounts);
      for (const s of splits) {
        expect(sum(s.lines)).toBe(s.charge.amount);
        for (const l of s.lines) {
          expect(Number.isInteger(l.amount)).toBe(true);
          expect(l.amount).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });
});
