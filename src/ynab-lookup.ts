// Refund tracing, the YNAB API side: find the order's original charges in YNAB and say which
// category the refund goes back to. Runs in either tab: it reads no page, only Tampermonkey's
// storage, and talks only to api.ynab.com.
import { GM_getValue, GM_setValue, GM_xmlhttpRequest } from "$";
import { DAY, toDay } from "./dates.ts";
import { errMsg } from "./lib/errors.ts";
import { fmt } from "./lib/money.ts";
import type { LookupError, RefundLookup, Trace } from "./types.ts";

export const TOKEN_KEY = "ynab-token";

/**
 * Amazon payees, however the bank wrote them ("Amazon.com", "AMZN Mktp US", "Amazon Prime").
 * Amazon Web Services bills aren't Amazon orders.
 */
export const AMAZON_PAYEE = /^(?!.*(web services|\baws\b)).*(amazon|amzn)/i;

/** The YNAB plan id (a UUID) in a YNAB path or stored value; nothing else goes in a request. */
export const planIn = (s: string) => s.match(/[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}/i)?.[0];

/**
 * Where the YNAB tab leaves a refund's plan for the Amazon tab, by the refund's amount in cents,
 * in Tampermonkey's storage: Amazon's page can't read it, so the plan id never reaches Amazon.
 * Keyed by amount so two refunds opened in quick succession each find their own.
 */
const PLANS_KEY = "acs-plans";
/** A plan left longer ago than this is from an earlier lookup. */
const PLAN_MS = 6e5;

type Plans = Record<string, { plan: string; at: number }>;
function storedPlans(): Plans {
  try {
    const v: unknown = GM_getValue(PLANS_KEY, {});
    return typeof v === "object" && v !== null ? (v as Plans) : {};
  } catch {
    return {};
  }
}

export function rememberPlan(amount: number, plan: string) {
  const now = Date.now();
  const fresh = Object.entries(storedPlans()).filter(([, p]) => now - p?.at < PLAN_MS);
  try {
    GM_setValue(PLANS_KEY, { ...Object.fromEntries(fresh), [amount]: { plan, at: now } });
  } catch {
    /* the Amazon tab will leave the lookup to the YNAB tab */
  }
}

/** The plan the YNAB tab left for a refund of `amount` cents, if it's recent. */
export function planFor(amount: number): string | undefined {
  const p = storedPlans()[amount];
  return p && typeof p.plan === "string" && Date.now() - p.at < PLAN_MS
    ? planIn(p.plan)
    : undefined;
}

// The parts of YNAB's API transaction this script reads. Amounts are milliunits (cents × 10).
interface YnabSub {
  amount: number;
  deleted: boolean;
  category_name?: string | null;
  memo?: string | null;
}
interface YnabTxn extends YnabSub {
  date: string;
  payee_name?: string | null;
  account_id?: string;
  account_name?: string;
  transfer_account_id?: string | null;
  subtransactions?: YnabSub[];
}
interface YnabPlan {
  id: string;
  name: string;
  first_month?: string | null;
  last_month?: string | null;
  last_modified_on?: string | null;
}
/** Where a charge was found, when it wasn't the plan asked about. */
interface Elsewhere {
  id: string;
  name: string;
}

// The token lives in Tampermonkey's own storage (never the page's) and only goes to api.ynab.com.
function ynabGet(path: string, token: string): Promise<{ status: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    GM_xmlhttpRequest({
      method: "GET",
      url: `https://api.ynab.com/v1${path}`,
      headers: { Authorization: `Bearer ${token}` },
      timeout: 20000,
      onload: (r) => {
        let body: unknown = null;
        try {
          body = JSON.parse(r.responseText);
        } catch {
          /* not JSON; the status says what happened */
        }
        resolve({ status: r.status, body });
      },
      onerror: () => reject(new Error("Couldn't reach YNAB.")),
      ontimeout: () => reject(new Error("YNAB took too long to answer.")),
    });
  });
}

const ynabDay = (iso: string) => Math.round(Date.parse(`${iso}T00:00:00Z`) / DAY);

// YNAB usually dates a card charge a day or two after Amazon does.
function findCharges(txns: YnabTxn[], c: Trace["charges"][number]) {
  const day = toDay(c.date);
  // Only Amazon's own charges: another store's charge of the same amount is a coincidence,
  // and a transfer (say, a payment to an Amazon card) is never the order's charge.
  return txns
    .filter(
      (x) =>
        !x.deleted &&
        !x.transfer_account_id &&
        x.amount === -c.amount * 10 &&
        AMAZON_PAYEE.test(x.payee_name || ""),
    )
    .map((x) => ({ x, d: day == null ? 0 : ynabDay(x.date) - day }))
    .filter((m) => m.d >= -3 && m.d <= 7)
    .sort((a, b) => Math.abs(a.d) - Math.abs(b.d))
    .map((m) => m.x);
}

// The split line(s) of the original charge that hold the refunded items: a line whose
// amount is one item's share, all the refunded items' shares together, or the refund itself.
function refundLines(subs: YnabSub[], t: Trace) {
  const shares = [
    t.refund.amount,
    ...t.itemSets.flatMap((set) => [
      ...set.map((x) => x.amount),
      set.reduce((a, x) => a + x.amount, 0),
    ]),
  ];
  return subs.filter((s) => shares.some((v) => Math.abs(-s.amount / 10 - v) <= 3));
}

const realCategory = (n: string | null | undefined) =>
  n && !/^(uncategorized|split)/i.test(n) ? n : "";

/** A charge's categories: its own, or each split line's. */
function categoriesOf(x: YnabTxn) {
  const subs = (x.subtransactions || []).filter((s) => !s.deleted);
  return (subs.length ? subs : [x]).map((s) => realCategory(s.category_name)).filter(Boolean);
}

// One original charge as plain data: its category, or each split line, marking a split line
// that matches the refund.
function foundCharge(
  matches: YnabTxn[],
  t: Trace,
  plan: string | undefined,
  other?: Elsewhere,
): RefundLookup["charges"][number]["found"] {
  const [x, alt] = matches;
  if (!x) return null;
  const subs = (x.subtransactions || []).filter((s) => !s.deleted);
  const hits = subs.length ? refundLines(subs, t) : [];
  const cats = categoriesOf(x);
  const altCats = alt ? categoriesOf(alt) : [];
  return {
    date: x.date,
    plan: other?.id ?? plan ?? null,
    planName: other?.name ?? null,
    accountId: x.account_id ?? null,
    accountName: x.account_name ?? "",
    split: subs.length > 0,
    lines: (subs.length ? subs : [x]).map((s) => ({
      category: realCategory(s.category_name),
      memo: s.memo ?? "",
      amount: Math.round(-s.amount / 10),
      hit: hits.includes(s),
    })),
    // Two same-amount charges in different categories: either may be the order's.
    alt:
      alt && altCats.join("\n") !== cats.join("\n")
        ? { date: alt.date, categories: altCats }
        : null,
  };
}

export type LookupResult = { lookup: RefundLookup } | LookupError;

/**
 * Find the trace's charges in YNAB: in `plan`, or the last-used one without it, and in other
 * plans only when a charge is missing. One request, four at most.
 */
export async function lookUpRefund(
  t: Trace,
  plan: string | undefined,
  token: string,
): Promise<LookupResult> {
  // From a few days before the earliest charge (or 90 days back, without a date).
  const days = t.charges.map((c) => toDay(c.date)).filter((d) => d != null);
  const since = new Date(
    ((days.length ? Math.min(...days) : Math.round(t.at / DAY) - 90) - 5) * DAY,
  )
    .toISOString()
    .slice(0, 10);
  let res: { status: number; body: unknown };
  try {
    res = await ynabGet(`/plans/${plan ?? "last-used"}/transactions?since_date=${since}`, token);
  } catch (e) {
    return { error: errMsg(e) };
  }
  if (res.status === 401) return { error: "YNAB didn't accept the saved token.", badToken: true };
  if (res.status === 429)
    return { error: "YNAB is limiting requests (it allows 200 an hour). Try again later." };
  const txns = transactionsIn(res.body);
  if (res.status !== 200) return { error: `YNAB answered with an error (${res.status}).` };
  // A good answer in a shape this script doesn't know: YNAB changed its API.
  if (!txns) return { error: "Couldn't read YNAB's answer.", report: true };
  const matches = t.charges.map((c) => findCharges(txns, c));
  // After a fresh start the order's charges can be in the old plan; only then look there.
  const missing = t.charges.filter((_, i) => !matches[i]?.length);
  const other = await searchOtherPlans(missing, plan, since, token);
  return {
    lookup: {
      charges: t.charges.map((c, i) => {
        const elsewhere = other.found.get(c);
        return {
          charge: c,
          found: foundCharge(elsewhere?.m ?? matches[i] ?? [], t, plan, elsewhere?.p),
        };
      }),
      limited: other.limited,
    },
  };
}

/**
 * The category the refund goes back to, or the categories it may go back to, each with the
 * amount the original charges put there. Null when no charge was found, since then there's
 * nothing to answer from; "uncategorized" when none of them has a category. Only confident
 * with one category and every one of the order's charges found: the refund may be for one
 * that wasn't.
 */
export function refundCategories(
  l: RefundLookup,
): { names: { name: string; amount: number }[]; confident: boolean } | "uncategorized" | null {
  const found = l.charges.flatMap((c) =>
    c.found ? [{ ...c.found, amount: c.charge.amount }] : [],
  );
  if (!found.length) return null;
  const cats = found.flatMap((f) => [
    ...f.lines.map((x) => x.category),
    ...(f.alt?.categories ?? []),
  ]);
  // A split line that matches the refund is the answer, unless lines in different categories
  // do, or a second same-amount charge leaves the original in doubt. An uncategorized line
  // names nothing, so it doesn't count.
  const hits = found.some((f) => f.alt)
    ? []
    : [
        ...new Set(
          found.flatMap((f) => f.lines.filter((x) => x.hit && x.category).map((x) => x.category)),
        ),
      ];
  const all = hits.length === 1 ? hits : [...new Set(cats.filter(Boolean))];
  if (!all.length) return "uncategorized";
  const lines = found.flatMap((f) => (hits.length === 1 ? f.lines.filter((x) => x.hit) : f.lines));
  // A category only on the other same-amount charge: that whole charge was put there.
  const altAmount = (name: string) =>
    found.find((f) => f.alt?.categories.includes(name))?.amount ?? 0;
  const names = all.map((name) => {
    const own = lines.filter((x) => x.category === name).reduce((a, x) => a + x.amount, 0);
    return { name, amount: own || altAmount(name) };
  });
  return { names, confident: all.length === 1 && !l.charges.some((c) => !c.found) };
}

/** The answer as said to the user: "Put $X back in A.", or "Probably A or B." */
export function categorySentence(names: string[], confident: boolean, amount: number) {
  const [one] = names;
  if (confident && one) return `Put ${fmt(amount)} back in ${one}.`;
  // Said once, in the answer: which of these is for the user to tell.
  return names.length > 1
    ? `Probably ${names.slice(0, -1).join(", ")} or ${names.at(-1)}.`
    : `Probably ${one}.`;
}

/** The answer line, or a warning standing in for it; null when no charge was found. */
export function refundAnswer(
  l: RefundLookup,
  amount: number,
): { put: string } | { warn: string } | null {
  const c = refundCategories(l);
  if (!c) return null;
  if (c === "uncategorized") return { warn: "None of these charges are categorized in YNAB yet." };
  return {
    put: categorySentence(
      c.names.map((n) => n.name),
      c.confident,
      amount,
    ),
  };
}

// The user's other plans that could hold these charges, newest first: a plan that began after
// a charge can't have it. At most two, to keep a miss from costing many requests.
async function searchOtherPlans(
  charges: Trace["charges"],
  current: string | undefined,
  since: string,
  token: string,
) {
  const found = new Map<Trace["charges"][number], { m: YnabTxn[]; p: Elsewhere }>();
  if (!charges.length) return { found, limited: false };
  try {
    const res = await ynabGet("/plans", token);
    if (res.status === 429) return { found, limited: true };
    const months = charges.map((c) => toDay(c.date)).filter((d) => d != null);
    const first = months.length
      ? new Date(Math.min(...months) * DAY).toISOString().slice(0, 7)
      : null;
    const last = months.length
      ? new Date(Math.max(...months) * DAY).toISOString().slice(0, 7)
      : null;
    const plans = (plansIn(res.body) ?? [])
      .filter(
        (p) =>
          p.id !== current &&
          (!first || !p.last_month || p.last_month.slice(0, 7) >= first) &&
          (!last || !p.first_month || p.first_month.slice(0, 7) <= last),
      )
      .sort((a, b) => (b.last_modified_on ?? "").localeCompare(a.last_modified_on ?? ""))
      .slice(0, 2);
    for (const p of plans) {
      if (charges.every((c) => found.has(c))) break;
      const r = await ynabGet(`/plans/${p.id}/transactions?since_date=${since}`, token);
      if (r.status === 429) return { found, limited: true };
      const txns = r.status === 200 ? transactionsIn(r.body) : null;
      for (const c of charges) {
        const m = txns && !found.has(c) ? findCharges(txns, c) : [];
        if (m.length) found.set(c, { m, p: { id: p.id, name: p.name } });
      }
    }
  } catch {
    /* another plan is a bonus; the charge just stays "not found" */
  }
  return { found, limited: false };
}

function plansIn(body: unknown): YnabPlan[] | null {
  if (typeof body !== "object" || body === null || !("data" in body)) return null;
  const { data } = body;
  if (typeof data !== "object" || data === null || !("plans" in data)) return null;
  return Array.isArray(data.plans) ? data.plans : null;
}

/** `data.transactions` from a YNAB answer, trusted to be YNAB's documented shape. */
function transactionsIn(body: unknown): YnabTxn[] | null {
  if (typeof body !== "object" || body === null || !("data" in body)) return null;
  const { data } = body;
  if (typeof data !== "object" || data === null || !("transactions" in data)) return null;
  return Array.isArray(data.transactions) ? data.transactions : null;
}
