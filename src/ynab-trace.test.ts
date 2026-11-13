// Refund tracing, end to end: the Amazon tab reads the refunded order and leaves a trace in
// Tampermonkey's storage; the YNAB tab picks it up, asks YNAB's API for the original charge
// and says which category the refund belongs in. Built on the real partial refund: $68.64
// back from an $80.08 order, with two $80.08 Amazon outflows in YNAB a few days apart.
import { describe, expect, test, vi } from "vitest";
import { gm, type GmReply, type GmRequest } from "../test/gm.ts";
import { loadPage } from "../test/html.ts";
import orderHtml from "../test/fixtures/amazon/order-refund.html?raw";
import transactionsHtml from "../test/fixtures/amazon/order-refund.transactions.html?raw";
import plansJson from "../test/fixtures/ynab/api/plans.json?raw";
import planTxnsJson from "../test/fixtures/ynab/api/plan-transactions.json?raw";
import { parseOrder, priceItems } from "./order.ts";
import { TRACE_KEY, traceRefund } from "./refund.ts";
import { parseTransactions } from "./transactions.ts";
import type { Trace } from "./types.ts";
import { ynabTrace } from "./ynab-trace.ts";

const TOKEN_KEY = "ynab-token";
const FAKE_TOKEN = "fake-test-token";
const PLAN = "b49ec261-e368-45d9-8d7c-be85300bf1d4";
const ARCHIVED = "5f4df66c-de7f-49de-9ccc-9dc222ec6379";

// ---- The Amazon side ----

/** The trace the Amazon tab builds for the real partial refund. */
function refundTrace(): Trace {
  const { order } = priceItems(parseOrder(loadPage(orderHtml)));
  const txns = parseTransactions(loadPage(transactionsHtml), order.orderId);
  const refund = txns.find((t) => t.kind === "refund");
  if (!refund) throw new Error("fixture has no refund");
  const trace = traceRefund(
    order,
    txns.filter((t) => t.kind === "charge"),
    refund,
  );
  document.body.innerHTML = "";
  return trace;
}

// ---- The YNAB side ----

interface YnabTxn {
  id: string;
  date: string;
  amount: number;
  payee_name: string | null;
  category_name: string | null;
  transfer_account_id: string | null;
  deleted: boolean;
  subtransactions: { amount: number; category_name: string | null; deleted: boolean }[];
}

/** The plan's transactions as YNAB sent them, each changed by `edit` (by id) if given. */
function planTxns(edit: (t: YnabTxn) => YnabTxn = (t) => t, extra: YnabTxn[] = []): YnabTxn[] {
  const { data } = JSON.parse(planTxnsJson) as { data: { transactions: YnabTxn[] } };
  return [...data.transactions.map(edit), ...extra];
}
const AUG_21 = "87ca68fa-af3d-4cfd-a04b-4c2df8b5ee3a";
const AUG_23 = "9772b882-27e0-4190-9e75-6f7ea175f6ba";
const byId = (id: string, change: Partial<YnabTxn>) => (t: YnabTxn) =>
  t.id === id ? { ...t, ...change } : t;
/** An $80.08 transaction not in the fixture, shaped like the fixture's own. */
function extraTxn(change: Partial<YnabTxn>): YnabTxn {
  const base = planTxns().find((t) => t.id === AUG_21);
  if (!base) throw new Error("fixture lost its Aug 21 charge");
  return { ...base, id: "extra", ...change };
}

const ok = (transactions: unknown[]): GmReply => ({
  status: 200,
  body: { data: { transactions } },
});
const plans = (): GmReply => ({ status: 200, body: JSON.parse(plansJson) });

/** A YNAB tab open on the plan, answering API calls with `respond`. */
function openYnab(
  respond: (req: GmRequest) => GmReply,
  { token = FAKE_TOKEN as string | null } = {},
) {
  history.replaceState(null, "", `/${PLAN}/accounts`);
  if (token) gm.seed(TOKEN_KEY, token);
  gm.respond(respond);
  ynabTrace();
}

/** Hand a trace over from the Amazon tab, and wait for the YNAB tab to finish with it. */
async function handOver(trace: Trace) {
  gm.setRemote(TRACE_KEY, trace);
  await settle();
}
async function settle() {
  await vi.waitFor(() => {
    expect(panelText()).not.toMatch(/Looking up/);
  });
  // Let any follow-up request (another plan) finish too.
  for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
}
const panel = () => document.querySelector(".acs-result");
const panelText = () => panel()?.textContent ?? "";
const advice = () =>
  [...document.querySelectorAll(".acs-put")].map((e) => e.textContent ?? "").join(" | ");
const ynabOnly = () => gm.requests().every((r) => r.url.startsWith("https://api.ynab.com/v1/"));

describe("the refund's original charge and category", () => {
  test("the real refund points back to the $80.08 charge's category", async () => {
    openYnab(() => ok(planTxns()));
    await handOver(refundTrace());
    expect(advice()).toBe("Put $68.64 back in 🐷 Fun Money A");
    expect(gm.requests()).toEqual([
      {
        method: "GET",
        url: `https://api.ynab.com/v1/plans/${PLAN}/transactions?since_date=2026-08-15`,
        headers: { Authorization: `Bearer ${FAKE_TOKEN}` },
      },
    ]);
  });

  test("with two $80.08 charges in different categories, no single category is claimed", async () => {
    openYnab(() => ok(planTxns(byId(AUG_23, { category_name: "Kids: School" }))));
    await handOver(refundTrace());
    expect(advice()).not.toMatch(/^Put .* back in/);
    expect(advice()).toMatch(/🐷 Fun Money A/);
    expect(advice()).toMatch(/Kids: School/);
    expect(panelText()).toMatch(/also a \$80\.08 charge on August 23, 2026 in Kids: School/);
  });

  test("the same holds when the nearer charge is the one in the other category", async () => {
    openYnab(() => ok(planTxns(byId(AUG_21, { category_name: "Kids: School" }))));
    await handOver(refundTrace());
    expect(advice()).not.toMatch(/^Put .* back in/);
    expect(advice()).toMatch(/Kids: School/);
    expect(advice()).toMatch(/🐷 Fun Money A/);
  });

  test("two split charges whose lines differ are not treated as the same category", async () => {
    const split = (cat: string) => ({
      category_name: "Split",
      subtransactions: [
        { amount: -50000, category_name: cat, deleted: false },
        { amount: -30080, category_name: "Household", deleted: false },
      ],
    });
    openYnab(() =>
      ok(planTxns((t) => byId(AUG_23, split("Kids: School"))(byId(AUG_21, split("Gifts"))(t)))),
    );
    await handOver(refundTrace());
    expect(advice()).toMatch(/Gifts/);
    expect(advice()).toMatch(/Kids: School/);
    expect(panelText()).toMatch(/also a \$80\.08 charge on August 23/);
  });

  test("an $80.08 Amazon inflow inside the window is never taken as the charge", async () => {
    const onlyInflow = planTxns().filter((t) => t.id !== AUG_21 && t.id !== AUG_23);
    onlyInflow.push(extraTxn({ date: "2026-08-21", amount: 80080, category_name: "Wrong" }));
    openYnab(() => ok(onlyInflow));
    await handOver(refundTrace());
    expect(panelText()).toMatch(/No \$80\.08 Amazon charge in YNAB within a week/);
    expect(panelText()).not.toMatch(/Wrong/);
  });

  test("a transfer of $80.08 to an Amazon card is never taken as the charge", async () => {
    const transfer = extraTxn({
      date: "2026-08-20",
      payee_name: "Transfer : Amazon Store Card",
      category_name: "Wrong",
      transfer_account_id: "b1dda1e2-c00f-44ed-8c9e-ccaa02f30f89",
    });
    openYnab(() => ok(planTxns(undefined, [transfer])));
    await handOver(refundTrace());
    expect(panelText()).toMatch(/\$80\.08 on August 21, 2026/);
    expect(panelText()).not.toMatch(/Wrong/);
  });

  test("another store's $80.08 charge, or a deleted one, is not the order's", async () => {
    const txns = planTxns().filter((t) => t.id !== AUG_21 && t.id !== AUG_23);
    txns.push(
      extraTxn({ id: "grocery", payee_name: "Corner Grocery", category_name: "Wrong" }),
      extraTxn({ id: "deleted", deleted: true, category_name: "Wrong" }),
    );
    openYnab((r) =>
      r.url.endsWith("/plans") ? { status: 200, body: { data: { plans: [] } } } : ok(txns),
    );
    await handOver(refundTrace());
    expect(panelText()).toMatch(/No \$80\.08 Amazon charge/);
    expect(panelText()).not.toMatch(/Wrong/);
  });
});

describe("other plans", () => {
  const withoutCharge = () => planTxns().filter((t) => t.id !== AUG_21 && t.id !== AUG_23);

  test("a charge missing from this plan is found in the archived one, and named as such", async () => {
    openYnab((r) => {
      if (r.url.endsWith("/v1/plans")) return plans();
      if (r.url.includes(`/plans/${ARCHIVED}/`)) return ok(planTxns());
      return ok(withoutCharge());
    });
    await handOver(refundTrace());
    expect(panelText()).toMatch(/in your Old Budget \(Archived on 2026-08-16\) plan/);
    expect(advice()).toBe("Put $68.64 back in 🐷 Fun Money A");
    expect(gm.requests().map((r) => r.url)).toEqual([
      `https://api.ynab.com/v1/plans/${PLAN}/transactions?since_date=2026-08-15`,
      "https://api.ynab.com/v1/plans",
      `https://api.ynab.com/v1/plans/${ARCHIVED}/transactions?since_date=2026-08-15`,
    ]);
  });

  test("a charge found nowhere costs one look at each other plan, then says so", async () => {
    openYnab((r) => (r.url.endsWith("/v1/plans") ? plans() : ok(withoutCharge())));
    await handOver(refundTrace());
    expect(panelText()).toMatch(/No \$80\.08 Amazon charge in YNAB within a week of August 20/);
    expect(panelText()).not.toMatch(/not categorized/);
    expect(gm.requests()).toHaveLength(3);
  });

  test("a rate limit on the plans list is reported, not retried", async () => {
    openYnab((r) => (r.url.endsWith("/v1/plans") ? { status: 429 } : ok(withoutCharge())));
    await handOver(refundTrace());
    expect(panelText()).toMatch(/other plans weren't checked/);
    expect(gm.requests()).toHaveLength(2);
  });
});

describe("when YNAB can't be asked", () => {
  test("without a token, it asks for one and sends nothing", async () => {
    openYnab(() => ok(planTxns()), { token: null });
    gm.setRemote(TRACE_KEY, refundTrace());
    expect(panelText()).toMatch(/needs a YNAB personal access token/);
    expect(gm.requests()).toHaveLength(0);
  });

  test("a token typed into the form is saved and used for the lookup", async () => {
    openYnab(() => ok(planTxns()), { token: null });
    gm.setRemote(TRACE_KEY, refundTrace());
    const input = document.querySelector<HTMLInputElement>(".acs-token input");
    const form = document.querySelector<HTMLFormElement>(".acs-token");
    if (!input || !form) throw new Error("no token form");
    input.value = `  ${FAKE_TOKEN}  `;
    form.requestSubmit();
    await settle();
    expect(gm.get(TOKEN_KEY)).toBe(FAKE_TOKEN);
    expect(advice()).toBe("Put $68.64 back in 🐷 Fun Money A");
    expect(gm.requests()[0]?.headers).toEqual({ Authorization: `Bearer ${FAKE_TOKEN}` });
  });

  test("a rejected token is forgotten and asked for again, once", async () => {
    openYnab(() => ({ status: 401, body: { error: { id: "401" } } }));
    await handOver(refundTrace());
    expect(panelText()).toMatch(/didn't accept the saved token/);
    expect(document.querySelector(".acs-token")).not.toBeNull();
    expect(gm.get(TOKEN_KEY)).toBe("");
    expect(gm.requests()).toHaveLength(1);
  });

  test.each([
    ["a network error", "error" as const, /Couldn't reach YNAB/],
    ["a timeout", "timeout" as const, /YNAB took too long to answer/],
    ["a rate limit", { status: 429 }, /YNAB is limiting requests/],
    [
      "a server error",
      { status: 503, body: "<html>down</html>" },
      /YNAB answered with an error \(503\)/,
    ],
  ])("%s ends in a clear message after one request", async (_name, reply, message) => {
    openYnab(() => reply);
    await handOver(refundTrace());
    expect(panelText()).toMatch(message);
    expect(gm.requests()).toHaveLength(1);
    expect(gm.get(TOKEN_KEY)).toBe(FAKE_TOKEN);
  });

  test("an answer in an unknown shape says so, with a way to report it", async () => {
    openYnab(() => ({ status: 200, body: { data: { txns: [] } } }));
    await handOver(refundTrace());
    expect(panelText()).toMatch(/Couldn't read YNAB's answer/);
    expect(gm.requests()).toHaveLength(1);
  });

  test("the token only ever goes to api.ynab.com", async () => {
    openYnab((r) => {
      if (r.url.endsWith("/v1/plans")) return plans();
      if (r.url.includes(`/plans/${ARCHIVED}/`)) return ok(planTxns());
      return ok([]);
    });
    await handOver(refundTrace());
    expect(gm.requests().length).toBeGreaterThan(1);
    expect(ynabOnly()).toBe(true);
  });

  test("an order with no card charge needs no lookup", async () => {
    openYnab(() => ok(planTxns()));
    gm.setRemote(TRACE_KEY, { ...refundTrace(), charges: [] });
    expect(panelText()).toMatch(/didn't show a card charge/);
    expect(gm.requests()).toHaveLength(0);
  });
});

describe("handing the trace from the Amazon tab to the YNAB tab", () => {
  test("a trace from another tab shows once, and is marked shown", async () => {
    openYnab(() => ok(planTxns()));
    await handOver(refundTrace());
    expect(panelText()).toMatch(/Amazon order #114-0271446-2821572/);
    expect(gm.get(TRACE_KEY)).toMatchObject({ shown: true });
    expect(document.querySelectorAll(".acs-result")).toHaveLength(1);
    expect(gm.requests()).toHaveLength(1);
  });

  test("a trace this tab wrote itself, or one already shown, is ignored", () => {
    openYnab(() => ok(planTxns()));
    gm.setRemote(TRACE_KEY, { ...refundTrace(), shown: true });
    expect(panel()).toBeNull();
    expect(gm.requests()).toHaveLength(0);
  });

  test.each([
    ["nothing", null],
    ["a string", "acs-trace"],
    ["no refund amount", { at: Date.now(), refund: {}, charges: [], itemSets: [] }],
    ["no charges list", { at: Date.now(), refund: { amount: 6864 }, itemSets: [] }],
  ])("a malformed trace (%s) is ignored", (_name, value) => {
    openYnab(() => ok(planTxns()));
    gm.setRemote(TRACE_KEY, value);
    expect(panel()).toBeNull();
    expect(gm.requests()).toHaveLength(0);
  });

  test("a recent unshown trace left in storage shows when the YNAB tab opens", async () => {
    gm.seed(TRACE_KEY, refundTrace());
    openYnab(() => ok(planTxns()));
    await settle();
    expect(advice()).toBe("Put $68.64 back in 🐷 Fun Money A");
  });

  test("a stale trace left in storage is not shown when the YNAB tab opens", () => {
    gm.seed(TRACE_KEY, { ...refundTrace(), at: Date.now() - 11 * 60 * 1000 });
    openYnab(() => ok(planTxns()));
    expect(panel()).toBeNull();
    expect(gm.requests()).toHaveLength(0);
  });
});
