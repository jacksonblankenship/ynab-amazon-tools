// Matching card charges to deliveries, and dividing each charge among items.
import { allocateBy } from "./lib/money.ts";
import type { Charge, Group, PricedItem, Shipment, Solution, Split, SplitLine } from "./types.ts";

/** Set partitions of `xs`, bucketed by number of groups (most groups first). */
export function partitionsByLevel<T>(xs: readonly T[]): T[][][][] {
  const n = xs.length;
  const all: T[][][] = [];
  const rgs = Array.from({ length: n }, () => 0);
  (function rec(i: number, max: number) {
    if (i === n) {
      all.push(Array.from({ length: max + 1 }, (_, g) => xs.filter((_x, k) => rgs[k] === g)));
      return;
    }
    for (let g = 0; g <= max + 1; g++) {
      rgs[i] = g;
      rec(i + 1, Math.max(max, g));
    }
  })(0, -1);
  return Array.from({ length: n }, (_, l) => all.filter((p) => p.length === n - l));
}

/**
 * Assign each card charge to a delivery (or a group of deliveries Amazon billed together)
 * so that charges + points/gift-card credit reproduce each delivery's estimated total.
 */
export function solve(
  // Only the totals and item counts matter here, so tests can pass plain objects.
  shipments: readonly Pick<Shipment, "total" | "items">[],
  charges: readonly Charge[],
  /**
   * Points/gift-card money paid toward the order: an amount, or a range when part of it was
   * shared with other orders and this order's share isn't known.
   */
  credit: number | readonly [number, number],
): {
  solution: Solution | null;
  /** The search hit its step limit, so a better match (or any match) may exist. */
  incomplete: boolean;
} {
  const m = charges.length;
  const [lo, hi] = typeof credit === "number" ? [credit, credit] : credit;
  const order = charges
    .map((c, j) => ({ j, amount: c.amount }))
    .sort((a, b) => b.amount - a.amount);
  const indexed = shipments.map((s, i) => ({ s, i }));
  const levels = indexed.length <= 8 ? partitionsByLevel(indexed) : [[indexed.map((x) => [x])]];
  let budget = 3e6;
  // In an object so TS doesn't narrow `best` to null: it is only assigned inside the closures below.
  const found: { best: Solution | null } = { best: null };

  for (const parts of levels) {
    for (const members of parts) {
      // One working slot per group: the Group itself plus the running sums for the search.
      const slots = members.map((g, gi) => ({
        gi,
        group: {
          members: g.map((x) => x.i),
          total: g.reduce((s, x) => s + x.s.total, 0),
          tol: 2 + g.reduce((s, x) => s + x.s.items.length, 0),
        },
        sig: g.map((x) => x.s.total).join("+"),
        sum: 0,
        count: 0,
      }));
      const G: Group[] = slots.map((w) => w.group);
      type Slot = (typeof slots)[number];
      /** The slot each charge is currently assigned to (null = unmatched). */
      const picked = Array.from({ length: m }, (): Slot | null => null);

      const evaluate = (unmatched: number) => {
        let score = unmatched * 1000;
        let err = 0,
          absorbed = 0,
          absorbing = 0;
        const absorbedBy = Array.from({ length: G.length }, () => 0);
        for (const w of slots) {
          if (w.count === 0) {
            score += 1000;
            continue;
          } // no charge yet
          const r = w.group.total - w.sum;
          if (Math.abs(r) <= w.group.tol) err += Math.abs(r);
          else if (r > 0) {
            absorbed += r;
            absorbedBy[w.gi] = r;
            absorbing++;
          } else return;
        }
        const aErr = absorbed < lo ? lo - absorbed : absorbed > hi ? absorbed - hi : 0;
        if (aErr > 3 + 2 * absorbing) return;
        score += err + aErr + absorbing * 0.5;
        const sig = picked.map((w) => (w ? w.sig : "x")).join("|");
        const best = found.best;
        if (!best || score < best.score - 1e-9) {
          found.best = {
            score,
            groups: G,
            assign: picked.map((w) => (w ? w.gi : -1)),
            absorbedBy,
            sig,
            ambiguous: false,
          };
        } else if (Math.abs(score - best.score) < 1e-9 && sig !== best.sig && best.groups === G) {
          best.ambiguous = true;
        }
      };

      const rec = (k: number, unmatched: number): void => {
        if (--budget < 0) return;
        if (found.best && unmatched * 1000 > found.best.score) return;
        const next = order[k];
        if (!next) {
          evaluate(unmatched); // every charge has been placed
          return;
        }
        const { j, amount: a } = next;
        for (const w of slots) {
          if (w.sum + a > w.group.total + w.group.tol) continue;
          w.sum += a;
          w.count++;
          picked[j] = w;
          rec(k + 1, unmatched);
          w.sum -= a;
          w.count--;
        }
        picked[j] = null;
        rec(k + 1, unmatched + 1);
      };
      rec(0, 0);
      if (budget < 0) break;
    }
    if ((found.best && found.best.score < 1000) || budget < 0) break; // finest clean match wins
  }
  return { solution: found.best, incomplete: budget < 0 };
}

/** Decide which items each charge paid for, with amounts that sum exactly to the charge. */
export function splitGroup(items: PricedItem[], groupCharges: Charge[], absorbed: number): Split[] {
  const toLines = (c: Charge, its: PricedItem[]): SplitLine[] =>
    allocateBy(c.amount, its, (i) => i.total).map(([item, amount]) => ({
      item,
      amount,
    }));
  const [only, ...rest] = groupCharges;
  if (only && !rest.length) {
    return [{ charge: only, exact: true, lines: toLines(only, items) }];
  }
  // Several charges for one delivery: look for a clean item-to-charge partition.
  if (items.length <= 14) {
    const slots = groupCharges.map((charge) => ({ charge, sum: 0, cnt: 0 }));
    const pick = Array.from({ length: items.length }, () => 0);
    /** Depth-first over item placements; returns the first clean one (charge index per item). */
    const search = (i: number): number[] | null => {
      const item = items[i];
      if (!item) {
        // Every item placed: each charge must match its items, one of them may be short by `absorbed`.
        let usedCredit = absorbed === 0;
        for (const s of slots) {
          if (!s.cnt) return null;
          const r = s.sum - s.charge.amount;
          if (Math.abs(r) <= 1 + s.cnt) continue;
          if (!usedCredit && Math.abs(r - absorbed) <= 2 + s.cnt) {
            usedCredit = true;
            continue;
          }
          return null;
        }
        return usedCredit ? pick.slice() : null;
      }
      for (const [c, s] of slots.entries()) {
        pick[i] = c;
        s.sum += item.total;
        s.cnt++;
        const hit = search(i + 1);
        s.sum -= item.total;
        s.cnt--;
        if (hit) return hit;
      }
      return null;
    };
    const found = search(0);
    if (found) {
      return groupCharges.map((c, ci) => ({
        charge: c,
        exact: true,
        lines: toLines(
          c,
          items.filter((_, i) => found[i] === ci),
        ),
      }));
    }
  }
  // No clean split: Amazon divided this delivery's bill arbitrarily. Split each charge by item share.
  return groupCharges.map((c) => ({
    charge: c,
    exact: false,
    lines: toLines(c, items),
  }));
}
