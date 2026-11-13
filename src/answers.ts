// Saved answers: what a YNAB Amazon line was, once the Amazon tab has worked it out, kept in
// Tampermonkey's storage so a later look at the same line costs no Amazon request. Each is
// small and ready to show in YNAB without Amazon's page: the items with amounts, and for a
// refund the category answer. Never a failure, and nothing from YNAB but the line's amount,
// date, kind and transaction id (no memos, payees, accounts or plans).
//
// Kept under the line as YNAB shows it, so the YNAB tab, which knows only its register, can
// find it. The YNAB tab leaves the line it opened (ynab-page.ts) for the Amazon tab here too,
// in Tampermonkey's storage rather than the link, so Amazon's page never sees it.
//
// Like the saved transactions (txn-cache.ts), they're for one Amazon account at a time:
// tagged with it, and cleared when an Amazon page is signed in to another.
import { GM_getValue, GM_setValue } from "$";
import { DAY, nearest } from "./dates.ts";
import { amazonAccount } from "./txn-cache.ts";
import type { AnswerBody, SavedAnswer, YnabRow } from "./types.ts";

export const ANSWERS_KEY = "acs-answers-v1";
const ROWS_KEY = "acs-rows";
const KEEP_MS = 90 * DAY;
const MAX_ANSWERS = 2000;
/** A line left longer ago than this is from an earlier lookup. */
const ROW_MS = 6e5;

interface Store {
  account?: string;
  answers: Record<string, SavedAnswer>;
}

const key = (r: YnabRow) => [r.kind, r.amount, r.date, r.id ?? ""].join("|");

// A damaged answer (hand-edited storage, say) is dropped, not shown.
const isAnswer = (v: unknown): v is SavedAnswer => {
  const a = v as Partial<SavedAnswer> | null;
  return (
    typeof a === "object" &&
    a !== null &&
    (a.kind === "charge" || a.kind === "refund") &&
    typeof a.amount === "number" &&
    typeof a.date === "string" &&
    typeof a.orderId === "string" &&
    Array.isArray(a.items) &&
    typeof a.exact === "boolean" &&
    Array.isArray(a.cautions) &&
    typeof a.at === "number"
  );
};

function read(): Store {
  try {
    const v: unknown = GM_getValue(ANSWERS_KEY, null);
    if (!v || typeof v !== "object" || !("answers" in v)) return { answers: {} };
    const s = v as Partial<Store>;
    const now = Date.now();
    const answers = Object.entries(s.answers ?? {}).filter(
      ([, a]) => isAnswer(a) && now - a.at < KEEP_MS,
    );
    return {
      ...(typeof s.account === "string" ? { account: s.account } : {}),
      answers: Object.fromEntries(answers),
    };
  } catch {
    return { answers: {} };
  }
}

function write(s: Store) {
  try {
    GM_setValue(ANSWERS_KEY, s);
  } catch {
    /* the line will just be looked up on Amazon again */
  }
}

/** Keep what the line `row` was. In an Amazon tab, tags the store with its account. */
export function saveAnswer(row: YnabRow, body: AnswerBody) {
  const s = read();
  const account = amazonAccount();
  if (account) {
    if (s.account && s.account !== account) s.answers = {};
    s.account = account;
  }
  const a: SavedAnswer = {
    kind: row.kind,
    amount: row.amount,
    date: row.date,
    ...(row.id ? { id: row.id } : {}),
    ...body,
    at: Date.now(),
  };
  // The newest, to bound the size.
  const all = Object.entries({ ...s.answers, [key(row)]: a })
    .sort(([, x], [, y]) => y.at - x.at)
    .slice(0, MAX_ANSWERS);
  write({ ...s, answers: Object.fromEntries(all) });
}

/** The saved answer for a YNAB line, under any reading of its date; null if there's none. */
export function savedAnswer(line: {
  amount: number;
  kind: "charge" | "refund";
  dates: string[];
  id?: string;
}): SavedAnswer | null {
  const { answers } = read();
  for (const date of line.dates) {
    const a =
      answers[
        key({ amount: line.amount, kind: line.kind, date, ...(line.id ? { id: line.id } : {}) })
      ];
    if (a) return a;
  }
  return null;
}

export function forgetAnswers() {
  write({ answers: {} });
}

/** On an Amazon page: drop answers saved under another Amazon account. */
export function checkAccount() {
  const account = amazonAccount();
  const s = read();
  if (account && s.account && s.account !== account) write({ account, answers: {} });
}

// ---- The line the YNAB tab opened, for the Amazon tab ----

type Pending = {
  amount: number;
  kind: "charge" | "refund";
  dates: string[];
  id?: string;
  at: number;
};

function pending(): Pending[] {
  try {
    const v: unknown = GM_getValue(ROWS_KEY, []);
    const now = Date.now();
    return Array.isArray(v)
      ? v.filter(
          (p: Partial<Pending> | null): p is Pending =>
            typeof p === "object" &&
            p !== null &&
            typeof p.amount === "number" &&
            typeof p.at === "number" &&
            Array.isArray(p.dates) &&
            now - p.at < ROW_MS,
        )
      : [];
  } catch {
    return [];
  }
}

/** In the YNAB tab: the line about to be looked up on Amazon. */
export function rememberRow(line: {
  amount: number;
  kind: "charge" | "refund";
  dates: string[];
  id?: string;
}) {
  const p: Pending = {
    amount: line.amount,
    kind: line.kind,
    dates: line.dates,
    ...(line.id ? { id: line.id } : {}),
    at: Date.now(),
  };
  const same = (x: Pending) =>
    x.amount === p.amount &&
    x.kind === p.kind &&
    x.id === p.id &&
    x.dates.join() === p.dates.join();
  try {
    GM_setValue(ROWS_KEY, [...pending().filter((x) => !same(x)), p]);
  } catch {
    /* the answer just won't be saved */
  }
}

/**
 * In the Amazon tab: the YNAB line a charge or refund Amazon dates `date` was opened from.
 * Several of the same amount: the one dated nearest, and of a date YNAB reads two ways, the
 * reading nearest.
 */
export function rowFor(
  amount: number,
  kind: "charge" | "refund",
  date: string,
): YnabRow | undefined {
  const lines = pending()
    .filter((p) => p.amount === amount && p.kind === kind)
    .flatMap((p) => p.dates.map((d) => ({ p, d })));
  const hit = nearest(lines, (x) => x.d, date);
  if (!hit) return undefined;
  return { amount, kind, date: hit.d, ...(hit.p.id ? { id: hit.p.id } : {}) };
}
