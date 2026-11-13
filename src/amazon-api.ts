// ---- Amazon's transaction service, called directly ----
// The page loads older transactions 20 at a time from this service, out of a small allowance
// that answers 429 once spent. Asking it directly allows far bigger pages, and a refunds-only
// list when the search is for a refund, so one request usually does what many scrolls did.
// Every field the request needs is in the page's own startup data (__NEXT_DATA__).
import { GM_getValue, GM_setValue } from "$";
import { errMsg, must } from "./lib/errors.ts";
import { cents, fmt } from "./lib/money.ts";
import { sleep } from "./lib/spa.ts";
import { overlay } from "./overlay.ts";
import { logRequest } from "./request-log.ts";
import { ORDER_RE } from "./scrape.ts";
import type { FindQuery, Txn } from "./types.ts";

const API_PATH = "/payments-portal/data/iris/live/v1/data/manage/get-transactions";
const API_PAGE = 100;
const API_MAX = 10;
// When the service answers in a shape this can't read, asking again soon only wastes a request.
// The key carries the shape's version, so a script that reads a new shape tries again at once.
const UNUSABLE_KEY = "acs-api-unusable-v2";
const UNUSABLE_MS = 864e5;

const unusableRecently = () => {
  try {
    const at: unknown = GM_getValue(UNUSABLE_KEY, 0);
    return typeof at === "number" && Date.now() - at < UNUSABLE_MS;
  } catch {
    return false;
  }
};
function markUnusable(why: string, status: number): { unusable: true } {
  logRequest("api", `${status}, ${why}`);
  try {
    GM_setValue(UNUSABLE_KEY, Date.now());
  } catch {
    /* ignore */
  }
  return { unusable: true };
}

// Amazon answers fast loading with 429s, so ask for more no faster than a person scrolls.
export const pace = () => sleep(1500 + Math.random() * 1000);

// The parts of the page's startup data the request needs. Amazon's to change, so all optional.
interface RequestContext {
  localeInfo?: { locale?: string };
  traceInfo?: { requestId?: string };
}
interface PageProps {
  token?: unknown;
  manageWalletRequest?: { requestContext?: RequestContext; tabName?: string };
  request?: { applicationInstanceTraceId?: string };
  state?: { transactionResponseState?: { lastEvaluatedPageKey?: unknown } };
}

// One transaction in the service's answer, as far as this script reads it.
interface ApiTxn {
  formattedAmount?: string;
  formattedDate?: string;
  statusInfo?: { label?: string };
  orderData?: { orderDisplayString?: string; orderDetailsUrl?: string }[];
  paymentMethodDisplayStringData?: {
    paymentMethodName?: string;
    paymentMethodNumber?: { lastDigits?: string };
  };
}

function pageProps(): PageProps | null {
  const s =
    document.getElementById("__NEXT_DATA__") ??
    [...document.scripts].find((x) => !x.src && x.textContent.trimStart().startsWith('{"props"'));
  try {
    return JSON.parse(s?.textContent ?? "null")?.props?.pageProps ?? null;
  } catch {
    return null;
  }
}

// The first value under a key matching `re`, however deep: the response's nesting is Amazon's to change.
function findKey(v: unknown, re: RegExp, depth = 0): unknown {
  if (depth > 8 || !v || typeof v !== "object") return undefined;
  for (const [k, x] of Object.entries(v)) if (re.test(k)) return x;
  for (const x of Object.values(v)) {
    const f = findKey(x, re, depth + 1);
    if (f !== undefined) return f;
  }
  return undefined;
}

function apiRow(t: ApiTxn): Txn | null {
  const amt = cents(t.formattedAmount ?? "");
  const ids = [
    ...new Set(
      (t.orderData ?? []).flatMap(
        (o) =>
          `${o.orderDisplayString ?? ""} ${o.orderDetailsUrl ?? ""}`.match(
            new RegExp(ORDER_RE.source, "g"),
          ) ?? [],
      ),
    ),
  ];
  if (!amt || !ids.length) return null;
  const pm = t.paymentMethodDisplayStringData ?? {};
  const digits = pm.paymentMethodNumber?.lastDigits;
  return {
    method: digits
      ? `${pm.paymentMethodName ?? "Card"} ****${digits}`
      : (pm.paymentMethodName ?? ""),
    date: t.formattedDate ?? "",
    status: t.statusInfo?.label ?? "",
    el: null,
    orderId: must(ids[0], "order id"),
    orderIds: ids,
    amount: Math.abs(amt),
    kind: amt > 0 ? "refund" : digits ? "charge" : "credit",
  };
}

function apiBody(
  props: PageProps,
  ctx: RequestContext,
  // Passed back as Amazon gave it: its shape is Amazon's to choose.
  cursor: unknown,
  refundsOnly: boolean,
) {
  return {
    type: "GetTransactions",
    locale: ctx.localeInfo?.locale ?? "en_US",
    surfaceInfo: {
      clientApplicationType: "browser",
      surfaceFeatures: [],
      surfaceType: "desktop",
      userAgent: navigator.userAgent,
    },
    requestTraceId: ctx.traceInfo?.requestId,
    applicationInstanceTraceId: props.request?.applicationInstanceTraceId,
    transactionsViewRequest: {
      pageSize: API_PAGE,
      filtersControls: { includeFilters: true },
      ...(refundsOnly
        ? {
            dataControls: {
              filterItemInputs: [{ category: "TransactionType", values: ["REFUND"] }],
            },
          }
        : {}),
    },
    ...(cursor ? { exclusiveStartKey: cursor } : {}),
    widgetName: props.manageWalletRequest?.tabName ?? "ViewTransactions",
  };
}

export type ApiResult<H> =
  /** The service isn't there, or didn't answer the way it did when this was written. */
  | { unusable: true }
  | { aborted: true }
  | { hits: H[] }
  /** Refused (429, 503) after `checked` transactions. */
  | { throttled: true; checked: number }
  /** No hit: reached the end, went `past` the date, or hit the request `limit`. */
  | { done: true; checked: number; past?: true; limit?: true };

/** Page through the service until `check` finds hits or says the search went past the date. */
export async function apiSearch<H>(
  q: FindQuery,
  check: (seen: Txn[]) => { hits: H[]; past: boolean },
  abort: AbortSignal,
): Promise<ApiResult<H>> {
  const props = pageProps();
  const token = props?.token;
  const ctx = props?.manageWalletRequest?.requestContext;
  if (typeof token !== "string" || !props || !ctx || unusableRecently()) return { unusable: true };
  const refundsOnly = q.kind === "refund";
  // A refunds-only list starts from the top; otherwise carry on below the rows the page came with.
  let cursor: unknown = refundsOnly
    ? undefined
    : props.state?.transactionResponseState?.lastEvaluatedPageKey;
  // Without a bookmark there's no telling where the page's rows stop: not the end, just unknown.
  if (!refundsOnly && (typeof cursor !== "string" || !cursor)) return { unusable: true };
  const seen: Txn[] = [];
  for (let n = 0; n < API_MAX; n++) {
    if (n) await pace();
    if (abort.aborted) return { aborted: true };
    overlay(
      `Finding ${fmt(q.amount)} on Amazon`,
      refundsOnly ? "Checking your refunds" : "Loading older transactions",
    );
    let res: Response;
    try {
      res = await fetch(API_PATH, {
        method: "POST",
        credentials: "include",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "x-amzn-upx-token": token,
        },
        body: JSON.stringify(apiBody(props, ctx, cursor, refundsOnly)),
      });
    } catch (e) {
      // Never reached Amazon, so it costs nothing; the log still says why.
      logRequest("api", `not sent: ${errMsg(e)}`);
      return { unusable: true };
    }
    // A 429 or 503 (or other server error) is Amazon holding back; scrolling would only add to it.
    if (res.status === 429 || res.status >= 500) {
      logRequest("api", res.status);
      return { throttled: true, checked: seen.length };
    }
    // Turned away (401/403, or sent to sign in) isn't a limit. The page came signed in, so its own
    // scrolling may still work; the next search tries the service again.
    if (res.status === 401 || res.status === 403 || res.redirected) {
      logRequest("api", `${res.status}, not accepted`);
      return { unusable: true };
    }
    // Any other error (400, 404) is this request no longer fitting the service.
    if (!res.ok) return markUnusable("request not accepted", res.status);
    const json: unknown = await res.json().catch(() => null);
    // "transactionsList" since late 2026; "transactionList" before.
    const list = findKey(json, /^transactions?List$/);
    if (!Array.isArray(list)) return markUnusable("unreadable answer", res.status);
    const rows = list.flatMap((t: ApiTxn) => {
      const row = apiRow(t);
      return row ? [row] : [];
    });
    if (list.length && !rows.length) return markUnusable("unreadable rows", res.status);
    // Without card digits every charge would read as a gift card or points payment.
    if (
      list.length &&
      !list.some((t: ApiTxn) => t.paymentMethodDisplayStringData?.paymentMethodNumber?.lastDigits)
    )
      return markUnusable("unreadable cards", res.status);
    logRequest("api", res.status);
    seen.push(...rows);
    const { hits, past } = check(seen);
    if (hits.length) return { hits };
    if (past) return { done: true, past: true, checked: seen.length };
    // The last page comes without a bookmark; one of another kind is a shape this can't follow.
    cursor = findKey(json, /^lastEvaluated/);
    if (
      cursor === undefined ||
      cursor === null ||
      cursor === "" ||
      findKey(json, /^hasMore$/) === false
    )
      return { done: true, checked: seen.length };
    if (typeof cursor !== "string") return markUnusable("unreadable bookmark", res.status);
  }
  return { done: true, limit: true, checked: seen.length };
}
