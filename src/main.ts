import "./style.css";
import { GM_registerMenuCommand } from "$";
import { checkAccount, forgetAnswers } from "./answers.ts";
import { guard, ready } from "./lib/boot.ts";
import { errMsg } from "./lib/errors.ts";
import { fmt } from "./lib/money.ts";
import { suiteStyle } from "./lib/suite.ts";
import { focusTarget, orderPage } from "./order-page.ts";
import { FIND_KEY, overlayStart, overlayStop, suite } from "./overlay.ts";
import { requestLogPanel } from "./request-log.ts";
import { transactionsPage } from "./transactions-page.ts";
import { forgetTxns } from "./txn-cache.ts";
import { ynabPage } from "./ynab-page.ts";
import { ynabTrace } from "./ynab-trace.ts";

declare global {
  interface Window {
    __acsLoaded?: boolean;
  }
}

(() => {
  if (window.__acsLoaded) return;
  window.__acsLoaded = true;
  suiteStyle(suite.prefix);

  // Always shown, not just when the loading overlay is up: on a plain order-page visit an
  // error would otherwise leave no results and no explanation.
  const fail = (e: unknown) => {
    console.error("[Amazon Charge Finder]", e);
    // Usually a bug or a page this script can no longer read, either way worth reporting.
    overlayStop("Something went wrong", errMsg(e), [], { report: true });
  };
  // Runs at document-start so the loading overlay covers the page before it paints.
  const onTransactions = location.pathname.startsWith("/cpe/yourpayments/transactions");
  if (location.hostname !== "app.ynab.com") {
    try {
      GM_registerMenuCommand("Amazon request log", () => ready(requestLogPanel));
      // If a search says "already checked" for something that is there, start over.
      // Along with what the lines in YNAB were found to be.
      GM_registerMenuCommand("Forget saved Amazon transactions", () => {
        forgetTxns();
        forgetAnswers();
      });
    } catch {
      /* no menu in this userscript manager */
    }
    // Signed in to another Amazon account: its saved answers aren't this one's.
    ready(guard(fail, checkAccount));
  }
  if (location.hostname === "app.ynab.com") {
    ready(
      guard(fail, () => {
        ynabPage();
        ynabTrace();
      }),
    );
  } else if (onTransactions) {
    let pending = /acs-find=/.test(location.hash);
    try {
      pending = pending || !!sessionStorage.getItem(FIND_KEY);
    } catch {
      /* ignore */
    }
    if (pending) overlayStart("Finding your charge on Amazon", "Searching your transactions");
    ready(guard(fail, transactionsPage));
  } else {
    const f = focusTarget();
    if (f) overlayStart(`Found ${fmt(f.amount)}`, "Opening the order", true);
    ready(guard(fail, orderPage));
  }
})();
