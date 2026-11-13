// Dollar amounts as integer cents, and splitting a total across weights to the cent.

/** "$1,234.56" / "-$4.78" -> integer cents (signed), or null */
export function cents(s: unknown): number | null {
  const m = String(s)
    .replace(/,/g, "")
    .match(/([-+−]?)\s*\$\s*(\d+(?:\.\d{1,2})?)/);
  const digits = m?.[2];
  if (!m || digits === undefined) return null;
  const v = Math.round(parseFloat(digits) * 100);
  return m[1] === "-" || m[1] === "−" ? -v : v;
}
export const fmt = (c: number) => `${c < 0 ? "-" : ""}$${(Math.abs(c) / 100).toFixed(2)}`;

/** Split `total` cents across `weights` proportionally; result sums exactly to total. */
export function allocate(total: number, weights: number[]): number[] {
  return allocateBy(total, weights, (w) => w).map(([, amount]) => amount);
}

/** allocate() over `things` weighted by `weight`, returning each thing paired with its share. */
export function allocateBy<T>(
  total: number,
  things: readonly T[],
  weight: (t: T) => number,
): [T, number][] {
  const n = things.length;
  if (!n) return [];
  const sign = total < 0 ? -1 : 1;
  const T = Math.abs(total);
  let w = things.map((thing) => ({ thing, x: Math.max(0, weight(thing)) }));
  let W = w.reduce((a, b) => a + b.x, 0);
  if (W <= 0) {
    w = things.map((thing) => ({ thing, x: 1 }));
    W = n;
  }
  const cells = w.map(({ thing, x }) => {
    const raw = (T * x) / W;
    return { thing, v: Math.floor(raw), frac: raw - Math.floor(raw) };
  });
  const rem = T - cells.reduce((a, c) => a + c.v, 0);
  // Largest remainders get the leftover cents (stable sort keeps ties in item order).
  const order = [...cells].sort((a, b) => b.frac - a.frac);
  for (let k = 0; k < rem; k++) {
    const c = order[k % n];
    if (c) c.v++;
  }
  return cells.map((c): [T, number] => [c.thing, c.v * sign]);
}
