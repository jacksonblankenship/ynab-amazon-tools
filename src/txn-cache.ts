// Every transaction seen on Amazon is kept (in Tampermonkey's storage), so later searches can
// find it without spending requests from Amazon's allowance. Posted transactions don't go away,
// so nothing expires; the oldest are dropped only to bound the size.
//
// A cache can only say what it has; to say what isn't there, it also keeps which days it has
// seen every transaction for ("covered"). A sweep down a list from the top, without gaps, covers
// the days below its newest row and above its oldest (that day may continue further down).
// Stored coverage stops short of the day it was swept, since a pending charge can post later
// under an earlier date; the current page's rows cover up to today.
import { GM_getValue, GM_setValue } from "$";
import { DAY, toDay } from "./dates.ts";
import type { Txn } from "./types.ts";

const CACHE_KEY = "acs-txns";
const MAX_ROWS = 4000;
const GRACE_DAYS = 7;
// Stored as JSON, which has no -Infinity: a day long before any transaction.
const BEGINNING = -1e9;

/** Which list a sweep went down: everything, or Amazon's refunds-only list. */
export type List = "all" | "refunds";
type Span = [number, number];
type Stored = Omit<Txn, "el">;
interface Cache {
  rows: Stored[];
  covered: Record<List, Span[]>;
}

const empty = (): Cache => ({ rows: [], covered: { all: [], refunds: [] } });

function load(): Cache {
  try {
    const v: unknown = GM_getValue(CACHE_KEY, null);
    if (!v || typeof v !== "object") return empty();
    const c: Partial<Cache> = v;
    return Array.isArray(c.rows) && c.covered ? { ...empty(), ...c } : empty();
  } catch {
    return empty();
  }
}

function store(c: Cache) {
  try {
    GM_setValue(CACHE_KEY, c);
  } catch {
    /* ignore */
  }
}

export const today = () => Math.round(new Date().setHours(0, 0, 0, 0) / DAY);

// Not the status: a pending charge seen again once charged replaces itself.
const key = (r: Stored) => [r.orderIds.join(","), r.amount, r.date, r.kind, r.method].join("|");

/** These rows, then every transaction seen so far that isn't one of them. */
export function withCached(rows: Txn[]): Txn[] {
  const have = new Set(rows.map(key));
  const more = load().rows.filter((r) => !have.has(key(r)));
  return [...rows, ...more.map((r) => ({ ...r, el: null }))];
}

export function remember(rows: Txn[]) {
  if (!rows.length) return;
  const c = load();
  const byKey = new Map(c.rows.map((r) => [key(r), r]));
  for (const { el: _, ...r } of rows) byKey.set(key(r), r);
  c.rows = [...byKey.values()]
    .sort((a, b) => (toDay(b.date) ?? 0) - (toDay(a.date) ?? 0))
    .slice(0, MAX_ROWS);
  // Days whose rows were dropped are no longer seen in full, so stop claiming them.
  if (byKey.size > MAX_ROWS) {
    const days = c.rows.map((r) => toDay(r.date)).filter((d) => d != null);
    const lo = days.length ? Math.min(...days) + 1 : today() + 1;
    for (const list of ["all", "refunds"] as const)
      c.covered[list] = c.covered[list]
        .map(([a, b]): Span => [Math.max(a, lo), b])
        .filter(([a, b]) => a <= b);
  }
  store(c);
}

function merge(spans: Span[]): Span[] {
  const out: Span[] = [];
  for (const [lo, hi] of [...spans].sort((a, b) => a[0] - b[0])) {
    const last = out.at(-1);
    if (last && lo <= last[1] + 1) last[1] = Math.max(last[1], hi);
    else if (lo <= hi) out.push([lo, hi]);
  }
  return out;
}

/** The days a sweep from the top of a list covered, up to today; null if it covered none. */
export function sweptSpan(rows: Txn[], reachedEnd: boolean): Span | null {
  const days = rows.map((r) => toDay(r.date)).filter((d) => d != null);
  if (reachedEnd) return [BEGINNING, today()];
  return days.length ? [Math.min(...days) + 1, today()] : null;
}

export function rememberSweep(list: List, span: Span | null) {
  if (!span) return;
  const hi = Math.min(span[1], today() - GRACE_DAYS);
  if (span[0] > hi) return;
  const c = load();
  c.covered[list] = merge([...c.covered[list], [span[0], hi]]);
  store(c);
}

/** Whether every day from `lo` to `hi` has been seen on `lists`, or on `fresh` (this page's rows). */
export function isCovered(lists: List[], lo: number, hi: number, fresh: Span | null): boolean {
  const c = load();
  const spans = merge([...lists.flatMap((l) => c.covered[l]), ...(fresh ? [fresh] : [])]);
  return spans.some(([a, b]) => a <= lo && b >= Math.min(hi, today()));
}

export function forgetTxns() {
  store(empty());
}
