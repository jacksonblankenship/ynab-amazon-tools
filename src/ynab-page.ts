// YNAB: "Find on Amazon" button on Amazon transactions. A line already worked out on Amazon
// shows its saved answer here instead, with a way to open it on Amazon anyway.
import { rememberRow, savedAnswer } from "./answers.ts";
import { $$, el, line } from "./lib/dom.ts";
import { fmt } from "./lib/money.ts";
import { resultPanel } from "./lib/result-panel.ts";
import { type YnabCharge, ynabButton } from "./lib/ynab.ts";
import { suite } from "./overlay.ts";
import { itemNames } from "./refund.ts";
import { amountsTable, ESTIMATED, howItMatched, short } from "./render.ts";
import type { SavedAnswer } from "./types.ts";
import { AMAZON_PAYEE, categorySentence, planIn, rememberPlan } from "./ynab-lookup.ts";

// A refund's plan on screen goes to Tampermonkey's storage, not the link, so the Amazon tab
// can look up its category without Amazon's page ever seeing it. Left when the link is
// pointed at, so a middle-click or a keyboard opening gets it too.
const amazonUrl = (c: YnabCharge) => {
  const plan = c.kind === "refund" ? planIn(location.pathname) : undefined;
  if (plan) rememberPlan(c.amount, plan);
  return `https://www.amazon.com/cpe/yourpayments/transactions#acs-find=${c.amount}&acs-date=${c.dates.join(",")}&acs-kind=${c.kind}`;
};

export const ynabPage = () =>
  ynabButton({
    payee: AMAZON_PAYEE,
    prefix: "acs",
    label: "Find on Amazon",
    href: amazonUrl,
    onOpen: (c, e) => {
      const saved = e.type === "click" ? savedAnswer(c) : null;
      if (saved) {
        e.preventDefault();
        showSaved(saved, c);
      } else {
        // The line opened, transaction id and all, also goes by Tampermonkey's storage, so
        // the Amazon tab can save what it finds under it.
        rememberRow(c);
      }
    },
  });

/** The saved answer, in the same panel the Amazon page shows. */
function showSaved(a: SavedAnswer, c: YnabCharge) {
  $$(".acs-result").forEach((e) => {
    e.remove();
  });
  const saved = new Date(a.at).toLocaleDateString([], { month: "long", day: "numeric" });
  const panel = resultPanel(suite, {
    floating: true,
    label: a.kind === "refund" ? "This refund" : "This charge",
    amount: fmt(a.amount),
    meta: `Amazon order #${a.orderId} · found ${saved}`,
    body: a.kind === "refund" ? refundBody(a) : chargeBody(a),
  });
  const open = el("a", "acs-open", "Open on Amazon");
  open.href = amazonUrl(c);
  open.target = "_blank";
  open.rel = "noopener";
  open.addEventListener("click", () => rememberRow(c));
  panel.querySelector(".acs-r-body")?.appendChild(open);
  document.body.appendChild(panel);
}

function chargeBody(a: SavedAnswer): Node[] {
  const [only, ...more] = a.items;
  const items =
    only && !more.length
      ? [line("acs-answer", `${short(only.title)}${only.qty > 1 ? ` ×${only.qty}` : ""}`)]
      : a.items.length
        ? [amountsTable(a.items, a.amount)]
        : [];
  return [
    ...items,
    ...(a.exact ? [] : [line("acs-warn", ESTIMATED)]),
    ...a.cautions.map((t) => line("acs-warn", t)),
  ];
}

function refundBody(a: SavedAnswer): Node[] {
  const cat = a.category;
  const answer = el("div", "acs-answer");
  if (cat)
    answer.appendChild(
      line(
        "acs-put",
        categorySentence(
          cat.names.map((n) => n.name),
          cat.confident,
          a.amount,
        ),
      ),
    );
  const what = a.items.map((x) => ({ title: x.title, units: x.qty, amount: x.amount }));
  const how = (cat?.names ?? []).map((n) =>
    line(null, `${n.name}: ${fmt(n.amount)} of the original charge`),
  );
  return [
    answer,
    ...(what.length ? [line("acs-muted", `Probably for: ${itemNames(what)}`)] : []),
    ...a.cautions.map((t) => line("acs-warn", t)),
    ...(how.length ? [howItMatched(how)] : []),
  ];
}
