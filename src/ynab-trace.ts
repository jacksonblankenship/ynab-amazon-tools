// Refund tracing, YNAB side: take the trace the Amazon tab left, find the order's
// original charges in YNAB, and say which category the refund belongs in.
import { GM_addValueChangeListener, GM_getValue, GM_registerMenuCommand, GM_setValue } from "$";
import { readableDates } from "./dates.ts";
import { $$, el, esc, line } from "./lib/dom.ts";
import { errMsg } from "./lib/errors.ts";
import { fmt } from "./lib/money.ts";
import { resultPanel } from "./lib/result-panel.ts";
import { reportLine } from "./lib/suite.ts";
import { suite } from "./overlay.ts";
import { notInYnab, refundHint, saveRefund, TRACE_KEY } from "./refund.ts";
import { howItMatched, short } from "./render.ts";
import type { LookupError, RefundLookup, Trace } from "./types.ts";
import { lookUpRefund, planIn, refundAnswer, TOKEN_KEY } from "./ynab-lookup.ts";

/** A trace older than this is from an earlier refund lookup; don't show it. */
const TRACE_MS = 6e5;

function isTrace(v: unknown): v is Trace {
  if (typeof v !== "object" || v === null) return false;
  const t: Partial<Record<keyof Trace, unknown>> = v;
  return (
    typeof t.at === "number" &&
    typeof t.refund === "object" &&
    t.refund !== null &&
    "amount" in t.refund &&
    typeof t.refund.amount === "number" &&
    Array.isArray(t.charges) &&
    Array.isArray(t.itemSets) &&
    (t.lookup === undefined ||
      (typeof t.lookup === "object" && t.lookup !== null && "charges" in t.lookup)) &&
    (t.lookupError === undefined ||
      (typeof t.lookupError === "object" &&
        t.lookupError !== null &&
        "error" in t.lookupError &&
        typeof t.lookupError.error === "string"))
  );
}

// One original charge as a small table: its category, or each split line, with a link
// to its account. A split line matching the refund is emphasized.
function describeMatch({ charge: c, found: x }: RefundLookup["charges"][number]): HTMLElement[] {
  if (!x) return [];
  const box = el("div", "acs-split");
  // Absolute, so the link works whichever tab made the lookup.
  const account =
    x.plan && x.accountId
      ? `<a href="https://app.ynab.com/${esc(x.plan)}/accounts/${esc(x.accountId)}">${esc(x.accountName || "account")}</a>`
      : esc(x.accountName);
  box.appendChild(
    el(
      "div",
      null,
      `<b>${fmt(c.amount)}</b> on ${esc(readableDates([x.date]))} · ${account}${x.split ? " · split" : ""}${x.planName ? ` · in your <b>${esc(x.planName)}</b> plan` : ""}`,
    ),
  );
  const rows = x.lines
    .map(
      (s) =>
        `<tr${s.hit ? ' class="acs-hit"' : ""}><td>${esc(s.category || "Uncategorized")}${s.memo ? ` <span class="acs-muted">${esc(short(s.memo))}</span>` : ""}</td><td class="acs-r">${fmt(s.amount)}</td></tr>`,
    )
    .join("");
  box.appendChild(el("table", null, rows));
  return [box];
}

/** What can't be left behind "How it matched": a charge not found, or found twice. */
function cautions({ charge: c, found: x }: RefundLookup["charges"][number]): HTMLElement[] {
  if (!x) return [notInYnab(c)];
  if (!x.alt) return [];
  return [
    line(
      "acs-warn",
      `There's also a ${fmt(c.amount)} charge on ${readableDates([x.alt.date])} in ${x.alt.categories.join(", ") || "no category"}. If that's the one, use it instead.`,
    ),
  ];
}

/** The answer, then (after the refunded items) its cautions and how it was matched. */
function lookupNodes(l: RefundLookup, t: Trace): [Node[], Node[]] {
  const answer = refundAnswer(l, t.refund.amount);
  const lead =
    // With no charge found, "not categorized yet" would be wrong; the cautions say why.
    answer ? ["put" in answer ? line("acs-put", answer.put) : line("acs-warn", answer.warn)] : [];
  const how = l.charges.flatMap(describeMatch);
  return [
    lead,
    [
      ...l.charges.flatMap(cautions),
      ...(l.limited
        ? [
            line(
              "acs-warn",
              "YNAB is limiting requests, so other plans weren't checked. Try again later.",
            ),
          ]
        : []),
      ...(how.length ? [howItMatched(how)] : []),
    ],
  ];
}

function tokenForm(done: () => void): HTMLElement[] {
  const form = el("form", "acs-token");
  const input = el("input");
  input.type = "password";
  input.placeholder = "Paste a YNAB personal access token";
  input.autocomplete = "off";
  const save = el("button", null, "Save");
  save.type = "submit";
  form.append(input, save);
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const v = input.value.trim();
    if (!v) return;
    GM_setValue(TOKEN_KEY, v);
    done();
  });
  return [
    line(
      null,
      "To look up the category, this needs a YNAB personal access token. It's stored in Tampermonkey, not on the page, and only sent to api.ynab.com.",
    ),
    el(
      "div",
      "acs-muted",
      'Create one under <a href="https://app.ynab.com/settings/developer" target="_blank" rel="noopener">Developer Settings</a> in YNAB.',
    ),
    form,
  ];
}

async function fillTrace(body: HTMLElement, t: Trace): Promise<void> {
  // The answer (or what stands in for it) first, then the refunded items, then the rest.
  const say = (lead: Node[], rest: Node[] = []) =>
    body.replaceChildren(...lead, ...refundHint(t), ...rest);
  if (!t.charges.length)
    return say([
      line(
        "acs-warn",
        "Amazon didn't show a card charge for this order, so there's nothing to trace.",
      ),
    ]);
  // The Amazon tab already asked YNAB: show its answer, or why it got none, rather than ask
  // again (a rate limit would only refuse again). A new token asks afresh.
  if (t.lookup) return say(...lookupNodes(t.lookup, t));
  const { lookupError, ...fresh } = t;
  const failed = (e: LookupError) => {
    if (e.badToken) {
      GM_setValue(TOKEN_KEY, "");
      return say([line("acs-warn", e.error), ...tokenForm(() => fillTrace(body, fresh))]);
    }
    say([e.report ? reportLine(suite, "acs-warn", e.error) : line("acs-warn", e.error)]);
  };
  if (lookupError) return failed(lookupError);
  const token = GM_getValue(TOKEN_KEY, "");
  if (!token) return say(tokenForm(() => fillTrace(body, t)));
  say([line("acs-muted", "Looking up the original charge in YNAB…")]);
  const res = await lookUpRefund(t, planIn(location.pathname), token);
  if ("lookup" in res) {
    // This tab asked YNAB, not the Amazon tab: keep the answer here.
    saveRefund(t, res.lookup);
    return say(...lookupNodes(res.lookup, t));
  }
  failed(res);
}

function showTrace(t: Trace) {
  $$(".acs-result").forEach((e) => {
    e.remove();
  });
  GM_setValue(TRACE_KEY, { ...t, shown: true });
  const body = el("div", null);
  const panel = resultPanel(suite, {
    floating: true,
    label: "Refund",
    amount: fmt(t.refund.amount),
    meta: `Amazon order #${t.orderId}`,
    body: [body],
  });
  document.body.appendChild(panel);
  fillTrace(body, t).catch((e) => body.replaceChildren(line("acs-warn", errMsg(e))));
}

// The Amazon tab hands the trace over through Tampermonkey's storage; this YNAB tab shows it.
export function ynabTrace() {
  if (typeof GM_addValueChangeListener !== "function") return;
  GM_addValueChangeListener(TRACE_KEY, (_k, _old, t: unknown, remote) => {
    if (remote && isTrace(t) && !t.shown) showTrace(t);
  });
  const t: unknown = GM_getValue(TRACE_KEY, null);
  if (isTrace(t) && !t.shown && Date.now() - t.at < TRACE_MS) showTrace(t);
  GM_registerMenuCommand("Set YNAB token", () => {
    $$(".acs-result").forEach((e) => {
      e.remove();
    });
    const body = el("div", null);
    const panel = resultPanel(suite, {
      floating: true,
      label: "YNAB token",
      amount: "",
      meta: GM_getValue(TOKEN_KEY, "")
        ? "A token is saved. Saving a new one replaces it."
        : "No token saved yet.",
      body: [body],
    });
    body.replaceChildren(
      ...tokenForm(() =>
        body.replaceChildren(line("acs-put", "Saved. Refund traces will use it.")),
      ),
    );
    document.body.appendChild(panel);
  });
  GM_registerMenuCommand("Forget YNAB token", () => GM_setValue(TOKEN_KEY, ""));
}
