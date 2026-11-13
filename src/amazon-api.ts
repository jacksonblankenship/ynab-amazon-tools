// ---- Amazon's transaction service, called directly ----
// The page loads older transactions 20 at a time from this service, out of a small allowance
// that answers 429 once spent. Asking it directly allows far bigger pages, and a refunds-only
// list when the search is for a refund, so one request usually does what many scrolls did.
// Every field the request needs is in the page's own startup data (__NEXT_DATA__).
import { errMsg, must } from "./lib/errors.ts";
import { cents, fmt } from "./lib/money.ts";
import { sleep } from "./lib/spa.ts";
import { overlay } from "./overlay.ts";
import { logRequest } from "./request-log.ts";
import { ORDER_RE } from "./scrape.ts";
import type { FindQuery, Txn } from "./types.ts";

const API_PATH =
  "/payments-portal/data/iris/live/v1/data/manage/get-transactions";
const API_PAGE = 100;
const API_MAX = 10;

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
    [...document.scripts].find(
      (x) => !x.src && x.textContent.trimStart().startsWith('{"props"'),
    );
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
              filterItemInputs: [
                { category: "TransactionType", values: ["REFUND"] },
              ],
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
  /** Refused (429) after `checked` transactions. */
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
  if (typeof token !== "string" || !props || !ctx) return { unusable: true };
  const refundsOnly = q.kind === "refund";
  // A refunds-only list starts from the top; otherwise carry on below the rows the page came with.
  let cursor: unknown = refundsOnly
    ? undefined
    : props.state?.transactionResponseState?.lastEvaluatedPageKey;
  if (!refundsOnly && !cursor) return { done: true, checked: 0 };
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
    if (res.status === 429) {
      logRequest("api", 429);
      return { throttled: true, checked: seen.length };
    }
    const json: unknown = res.ok ? await res.json().catch(() => null) : null;
    const list = findKey(json, /^transactionList$/);
    logRequest(
      "api",
      Array.isArray(list) ? res.status : `${res.status}, unreadable answer`,
    );
    if (!Array.isArray(list)) return { unusable: true };
    seen.push(
      ...list.flatMap((t: ApiTxn) => {
        const row = apiRow(t);
        return row ? [row] : [];
      }),
    );
    const { hits, past } = check(seen);
    if (hits.length) return { hits };
    if (past) return { done: true, past: true, checked: seen.length };
    cursor = findKey(json, /^lastEvaluated/);
    if (
      typeof cursor !== "string" ||
      !cursor ||
      findKey(json, /^hasMore$/) === false
    )
      return { done: true, checked: seen.length };
  }
  return { done: true, limit: true, checked: seen.length };
}
