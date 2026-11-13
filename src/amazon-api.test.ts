// How the script reads Amazon's transaction data: the page's own startup data (__NEXT_DATA__)
// first, then Amazon's transaction service, called directly. The service's allowance is small
// and answers 429 once spent, so every request a search makes is counted here.
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { gm } from "../test/gm.ts";
import { apiSearch, pageRows } from "./amazon-api.ts";
import type { FindQuery, Txn } from "./types.ts";

// Pacing between pages is a real wait in the browser; here it's instant, except where a test
// turns it back on to check the pacing itself.
const waits = vi.hoisted(() => ({ real: false }));
vi.mock("./lib/spa.ts", async (orig) => {
  const spa = await orig<typeof import("./lib/spa.ts")>();
  return { ...spa, sleep: (ms: number) => (waits.real ? spa.sleep(ms) : Promise.resolve()) };
});

const UNUSABLE_KEY = "acs-api-unusable-v2";

// ---- Building Amazon's data ----

interface ApiTxnInit {
  amount: string;
  date?: string;
  orders?: string[];
  card?: { name: string; digits?: string };
  status?: string;
}

/** One transaction as Amazon's data has it. */
function txn({
  amount,
  date = "Nov 5, 2026",
  orders = ["112-1234567-1234567"],
  card = { name: "Visa", digits: "1234" },
  status = "Completed",
}: ApiTxnInit) {
  return {
    formattedAmount: amount,
    formattedDate: date,
    statusInfo: { label: status },
    orderData: orders.map((id) => ({
      orderDisplayString: `Order #${id}`,
      orderDetailsUrl: `https://www.amazon.com/gp/css/summary/edit.html?orderID=${id}`,
    })),
    paymentMethodDisplayStringData: {
      paymentMethodName: card.name,
      ...(card.digits ? { paymentMethodNumber: { lastDigits: card.digits } } : {}),
    },
  };
}

interface PageInit {
  list?: unknown[];
  listKey?: string;
  cursor?: unknown;
  token?: unknown;
}

/** Put a transactions page's startup data into the document, as Amazon serves it. */
function loadNextData(init: PageInit = {}) {
  const { list = [], listKey = "transactionsList" } = init;
  const cursor = "cursor" in init ? init.cursor : "page-1-key";
  const token = "token" in init ? init.token : "upx-token";
  const data = {
    props: {
      pageProps: {
        token,
        manageWalletRequest: {
          requestContext: { localeInfo: { locale: "en_US" }, traceInfo: { requestId: "req-1" } },
          tabName: "ViewTransactions",
        },
        request: { applicationInstanceTraceId: "trace-1" },
        state: {
          transactionResponseState: {
            [listKey]: list,
            ...(cursor === undefined ? {} : { lastEvaluatedPageKey: cursor }),
          },
        },
      },
    },
  };
  setNextDataText(JSON.stringify(data));
}

function setNextDataText(text: string) {
  const s = document.createElement("script");
  s.id = "__NEXT_DATA__";
  s.type = "application/json";
  s.textContent = text;
  document.body.append(s);
}

// ---- pageRows ----

describe("reading the rows the page arrived with", () => {
  test("reads a card charge", () => {
    loadNextData({ list: [txn({ amount: "-$34.19" })] });
    expect(pageRows()).toEqual<Txn[]>([
      {
        method: "Visa ****1234",
        date: "Nov 5, 2026",
        status: "Completed",
        el: null,
        orderId: "112-1234567-1234567",
        orderIds: ["112-1234567-1234567"],
        amount: 3419,
        kind: "charge",
      },
    ]);
  });

  test("reads the older 'transactionList' key as well as 'transactionsList'", () => {
    loadNextData({ listKey: "transactionList", list: [txn({ amount: "-$34.19" })] });
    expect(pageRows()?.map((r) => r.amount)).toEqual([3419]);
  });

  test("a payment without card digits is a points or gift card credit", () => {
    loadNextData({
      list: [txn({ amount: "-$5.00", card: { name: "Amazon Gift Card" } })],
    });
    const [row] = pageRows() ?? [];
    expect(row).toMatchObject({ kind: "credit", method: "Amazon Gift Card", amount: 500 });
  });

  test("a positive amount is a refund, read as a positive number", () => {
    loadNextData({ list: [txn({ amount: "+$12.00" })] });
    const [row] = pageRows() ?? [];
    expect(row).toMatchObject({ kind: "refund", amount: 1200 });
  });

  test("a charge covering several orders keeps every order id", () => {
    loadNextData({
      list: [txn({ amount: "-$80.00", orders: ["112-1111111-1111111", "113-2222222-2222222"] })],
    });
    const [row] = pageRows() ?? [];
    expect(row?.orderId).toBe("112-1111111-1111111");
    expect(row?.orderIds).toEqual(["112-1111111-1111111", "113-2222222-2222222"]);
  });

  test("skips rows without an order id or an amount", () => {
    loadNextData({
      list: [
        txn({ amount: "-$1.00", orders: [] }),
        txn({ amount: "" }),
        txn({ amount: "-$34.19" }),
      ],
    });
    expect(pageRows()?.map((r) => r.amount)).toEqual([3419]);
  });

  test("is null when the page has no startup data, so the caller reads the screen", () => {
    expect(pageRows()).toBeNull();
  });

  test("is null when the startup data can't be parsed", () => {
    setNextDataText("{not json");
    expect(pageRows()).toBeNull();
  });

  test("is null when the list is empty or none of its rows can be read", () => {
    loadNextData({ list: [] });
    expect(pageRows()).toBeNull();
    document.body.innerHTML = "";
    loadNextData({ list: [{ something: "else" }] });
    expect(pageRows()).toBeNull();
  });
});

// ---- apiSearch ----

type Reply = { status: number; body?: unknown; redirected?: boolean } | "network-error";

/**
 * Stand in for fetch, answering each request with the next reply. Returns the request bodies
 * and when each was sent.
 */
function serve(...replies: Reply[]) {
  const bodies: Record<string, unknown>[] = [];
  const sentAt: number[] = [];
  const fetch = vi.fn(async (_url: string, init: RequestInit) => {
    bodies.push(JSON.parse(String(init.body)));
    sentAt.push(Date.now());
    const r = replies.shift();
    if (!r) throw new Error("unexpected extra request");
    if (r === "network-error") throw new TypeError("Failed to fetch");
    const text = typeof r.body === "string" ? r.body : JSON.stringify(r.body ?? null);
    const res = new Response(text, { status: r.status });
    if (r.redirected) Object.defineProperty(res, "redirected", { value: true });
    return res;
  });
  vi.stubGlobal("fetch", fetch);
  return { fetch, bodies, sentAt };
}

/** A page of the service's answer. */
const answer = (list: unknown[], next?: unknown, extra: Record<string, unknown> = {}) => ({
  status: 200,
  body: {
    transactionsViewResponse: {
      transactionsList: list,
      ...(next === undefined ? {} : { lastEvaluatedPageKey: next }),
      ...extra,
    },
  },
});

const query = (kind: "charge" | "refund", amount = 3419): FindQuery => ({
  amount,
  date: "Nov 5, 2026",
  kind,
  pages: 0,
  started: Date.now(),
});

/** Finds rows of `amount` cents; never says the search went past the date. */
const lookFor = (amount: number) => (seen: Txn[]) => ({
  hits: seen.filter((t) => t.amount === amount),
  past: false,
});

const never = () => new AbortController().signal;

describe("searching Amazon's transaction service", () => {
  beforeEach(() => {
    loadNextData({ list: [txn({ amount: "-$1.00" })] });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("stops at the first page with a hit", async () => {
    const { fetch } = serve(
      answer([txn({ amount: "-$9.99" })], "page-2-key"),
      answer([txn({ amount: "-$34.19" })], "page-3-key"),
    );
    const result = await apiSearch(query("charge"), lookFor(3419), never());
    expect(result).toMatchObject({ hits: [{ amount: 3419, kind: "charge" }] });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  test("a charge search carries on below the rows the page came with", async () => {
    const { bodies } = serve(answer([txn({ amount: "-$34.19" })], "page-2-key"));
    await apiSearch(query("charge"), lookFor(3419), never());
    expect(bodies[0]).toMatchObject({ exclusiveStartKey: "page-1-key" });
    expect(JSON.stringify(bodies[0])).not.toContain("REFUND");
  });

  test("a refund search asks for refunds only, from the top", async () => {
    const { bodies } = serve(answer([txn({ amount: "+$12.00" })], "page-2-key"));
    const result = await apiSearch(query("refund", 1200), lookFor(1200), never());
    expect(result).toMatchObject({ hits: [{ amount: 1200, kind: "refund" }] });
    expect(bodies[0]).not.toHaveProperty("exclusiveStartKey");
    expect(bodies[0]).toMatchObject({
      transactionsViewRequest: {
        dataControls: { filterItemInputs: [{ category: "TransactionType", values: ["REFUND"] }] },
      },
    });
  });

  test("a refund search doesn't need the page's bookmark", async () => {
    document.body.innerHTML = "";
    loadNextData({ cursor: undefined });
    const { fetch } = serve(answer([txn({ amount: "+$12.00" })]));
    await apiSearch(query("refund", 1200), lookFor(1200), never());
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  test("a charge search without the page's bookmark is unusable and asks nothing", async () => {
    document.body.innerHTML = "";
    loadNextData({ cursor: undefined });
    const { fetch } = serve();
    expect(await apiSearch(query("charge"), lookFor(3419), never())).toEqual({ unusable: true });
    expect(fetch).not.toHaveBeenCalled();
  });

  test("is unusable without the page's startup data or token, asking nothing", async () => {
    const { fetch } = serve();
    document.body.innerHTML = "";
    expect(await apiSearch(query("charge"), lookFor(3419), never())).toEqual({ unusable: true });
    loadNextData({ token: undefined });
    expect(await apiSearch(query("charge"), lookFor(3419), never())).toEqual({ unusable: true });
    expect(fetch).not.toHaveBeenCalled();
  });

  test("follows each page's bookmark to the next", async () => {
    const { bodies } = serve(
      answer([txn({ amount: "-$9.99" })], "page-2-key"),
      answer([txn({ amount: "-$8.88" })], "page-3-key"),
      answer([txn({ amount: "-$34.19" })]),
    );
    await apiSearch(query("charge"), lookFor(3419), never());
    expect(bodies.map((b) => b["exclusiveStartKey"])).toEqual([
      "page-1-key",
      "page-2-key",
      "page-3-key",
    ]);
  });

  test("stops at the last page, which comes without a bookmark", async () => {
    const { fetch } = serve(
      answer([txn({ amount: "-$9.99" })], "page-2-key"),
      answer([txn({ amount: "-$8.88" })]),
    );
    expect(await apiSearch(query("charge"), lookFor(3419), never())).toEqual({
      done: true,
      checked: 2,
    });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  test("stops when the service says there is no more, even with a bookmark", async () => {
    const { fetch } = serve(answer([txn({ amount: "-$9.99" })], "page-2-key", { hasMore: false }));
    expect(await apiSearch(query("charge"), lookFor(3419), never())).toEqual({
      done: true,
      checked: 1,
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  test("stops when the search goes past the date", async () => {
    const { fetch } = serve(answer([txn({ amount: "-$9.99" })], "page-2-key"));
    const result = await apiSearch(query("charge"), () => ({ hits: [], past: true }), never());
    expect(result).toEqual({ done: true, past: true, checked: 1 });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  test("gives up after ten requests", async () => {
    const pages = Array.from({ length: 11 }, (_, i) =>
      answer([txn({ amount: "-$9.99" })], `page-${i + 2}-key`),
    );
    const { fetch } = serve(...pages);
    expect(await apiSearch(query("charge"), lookFor(3419), never())).toEqual({
      done: true,
      limit: true,
      checked: 10,
    });
    expect(fetch).toHaveBeenCalledTimes(10);
  });

  describe("when Amazon holds back", () => {
    test.each([429, 503, 500])(
      "a %i stops the search at once, saying how many were checked",
      async (status) => {
        const { fetch } = serve(
          answer([txn({ amount: "-$9.99" }), txn({ amount: "-$8.88" })], "page-2-key"),
          { status },
          answer([txn({ amount: "-$34.19" })]),
        );
        expect(await apiSearch(query("charge"), lookFor(3419), never())).toEqual({
          throttled: true,
          checked: 2,
        });
        // Asking again would only extend the limit.
        expect(fetch).toHaveBeenCalledTimes(2);
      },
    );

    test("a refusal doesn't put the service aside, so the next search may try it", async () => {
      serve({ status: 429 });
      await apiSearch(query("charge"), lookFor(3419), never());
      expect(gm.get(UNUSABLE_KEY)).toBeUndefined();
    });
  });

  describe("when turned away", () => {
    test.each<Reply>([{ status: 401 }, { status: 403 }, { status: 200, redirected: true }])(
      "%o is unusable for now, and the next search tries the service again",
      async (reply) => {
        const { fetch } = serve(reply, answer([txn({ amount: "-$34.19" })]));
        expect(await apiSearch(query("charge"), lookFor(3419), never())).toEqual({
          unusable: true,
        });
        expect(gm.get(UNUSABLE_KEY)).toBeUndefined();
        await apiSearch(query("charge"), lookFor(3419), never());
        expect(fetch).toHaveBeenCalledTimes(2);
      },
    );
  });

  describe("when the service no longer answers the way this reads", () => {
    const shapes: [string, Reply][] = [
      ["a 400", { status: 400 }],
      ["a 404", { status: 404 }],
      ["an answer that isn't JSON", { status: 200, body: "<html>" }],
      ["an answer without a transaction list", { status: 200, body: { something: [] } }],
      ["rows it can't read", answer([{ amount: 5 }], "page-2-key")],
      [
        "rows without card digits",
        answer([txn({ amount: "-$9.99", card: { name: "Visa" } })], "page-2-key"),
      ],
      ["a bookmark of another kind", answer([txn({ amount: "-$9.99" })], { page: 2 })],
    ];

    test.each(shapes)("%s is unusable, and remembered for a day", async (_, reply) => {
      const { fetch } = serve(reply);
      expect(await apiSearch(query("charge"), lookFor(3419), never())).toEqual({
        unusable: true,
      });
      expect(gm.get(UNUSABLE_KEY)).toEqual(expect.any(Number));
      // The next search within the day spends nothing on it.
      expect(await apiSearch(query("charge"), lookFor(3419), never())).toEqual({
        unusable: true,
      });
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    test("is tried again once the day is up", async () => {
      gm.seed(UNUSABLE_KEY, Date.now() - 864e5 - 1000);
      const { fetch } = serve(answer([txn({ amount: "-$34.19" })]));
      expect(await apiSearch(query("charge"), lookFor(3419), never())).toMatchObject({
        hits: [{ amount: 3419 }],
      });
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    test("an empty page is the end, not an unreadable answer", async () => {
      serve(answer([]));
      expect(await apiSearch(query("charge"), lookFor(3419), never())).toEqual({
        done: true,
        checked: 0,
      });
      expect(gm.get(UNUSABLE_KEY)).toBeUndefined();
    });
  });

  describe("pacing", () => {
    beforeEach(() => {
      waits.real = true;
      vi.useFakeTimers();
      // The shortest pause the jitter allows.
      vi.spyOn(Math, "random").mockReturnValue(0);
    });
    afterEach(() => {
      waits.real = false;
      vi.useRealTimers();
      vi.restoreAllMocks();
    });

    test("asks for each page no sooner than 1.5 seconds after the last", async () => {
      const { sentAt } = serve(
        answer([txn({ amount: "-$9.99" })], "page-2-key"),
        answer([txn({ amount: "-$8.88" })], "page-3-key"),
        answer([txn({ amount: "-$34.19" })]),
      );
      const search = apiSearch(query("charge"), lookFor(3419), never());
      await vi.runAllTimersAsync();
      expect(await search).toMatchObject({ hits: [{ amount: 3419 }] });
      expect(sentAt).toHaveLength(3);
      const gaps = sentAt.slice(1).map((t, i) => t - (sentAt[i] ?? 0));
      expect(gaps).toEqual([expect.any(Number), expect.any(Number)]);
      for (const gap of gaps) expect(gap).toBeGreaterThanOrEqual(1500);
    });
  });

  test("stops between pages once cancelled", async () => {
    const ctrl = new AbortController();
    const { fetch } = serve(
      answer([txn({ amount: "-$9.99" })], "page-2-key"),
      answer([txn({ amount: "-$34.19" })]),
    );
    const result = await apiSearch(
      query("charge"),
      (seen) => {
        ctrl.abort();
        return lookFor(3419)(seen);
      },
      ctrl.signal,
    );
    expect(result).toEqual({ aborted: true });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  test("a request that never reaches Amazon is unusable for now, not remembered", async () => {
    const { fetch } = serve("network-error", answer([txn({ amount: "-$34.19" })]));
    expect(await apiSearch(query("charge"), lookFor(3419), never())).toEqual({ unusable: true });
    expect(gm.get(UNUSABLE_KEY)).toBeUndefined();
    expect(gm.get("acs-requests")).toEqual([
      { at: expect.any(Number), how: "api", status: expect.stringMatching(/^not sent/) },
    ]);
    await apiSearch(query("charge"), lookFor(3419), never());
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
