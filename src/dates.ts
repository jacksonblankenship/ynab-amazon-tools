// Dates as days, for comparing Amazon's and YNAB's dates for the same charge.

export const DAY = 864e5;

/** Day number of a date Amazon shows ("November 2, 2026"), or null if unreadable. */
export const toDay = (s: string) => {
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : Math.round(t / DAY);
};

const LONG = new Intl.DateTimeFormat("en-US", {
  month: "long",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});
const NO_YEAR = new Intl.DateTimeFormat("en-US", {
  month: "long",
  day: "numeric",
  timeZone: "UTC",
});
const parse = (iso: string) => {
  const t = Date.parse(`${iso}T00:00:00Z`);
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) && !Number.isNaN(t) ? t : null;
};

/** ISO dates for people: "November 2, 2026", or "October 28 or November 2, 2026" for two. */
export function readableDates(isos: string[]): string {
  const ts = isos.flatMap((iso) => {
    const t = parse(iso);
    return t == null ? [] : [t];
  });
  if (ts.length !== isos.length) return isos.join(" or ");
  const [a, b] = ts;
  if (a === undefined) return "";
  if (b === undefined) return LONG.format(a);
  const year = (t: number) => new Date(t).getUTCFullYear();
  return `${(year(a) === year(b) ? NO_YEAR : LONG).format(a)} or ${LONG.format(b)}`;
}
