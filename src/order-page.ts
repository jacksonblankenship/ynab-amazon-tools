// Order details page: parse, fetch the order's charges, match them, and show the result.
import { GM_setValue } from "$";
import { $, $$ } from "./lib/dom.ts";
import { errMsg } from "./lib/errors.ts";
import { fmt } from "./lib/money.ts";
import { solve } from "./matcher.ts";
import { parseOrder, priceItems } from "./order.ts";
import { overlayDone, overlayFound, overlayStop, signal } from "./overlay.ts";
import { refundPanel, TRACE_KEY, traceRefund } from "./refund.ts";
import { render, renderFocus } from "./render.ts";
import { fetchTransactions } from "./transactions.ts";
import { remember } from "./txn-cache.ts";
import type { Focus, Txn } from "./types.ts";

/** The delivery's whole card on the page, to highlight; the box itself if it has none of its own. */
const card = (box: Element) => {
  const c = box.closest(".a-box");
  return c && $$('[data-component="shipmentStatus"]', c).length === 1 ? c : box;
};

export async function orderPage() {
  if (!$('[data-component="shipments"] [data-component="purchasedItems"]')) {
    if (focusTarget())
      overlayStop("Couldn't read this order page", "Amazon may have changed its layout.");
    return;
  }
  const focus = focusTarget();
  if (focus) overlayFound(`Found ${fmt(focus.amount)}`, "Finding the items it paid for");
  const { order, warnings } = priceItems(parseOrder(document));
  const search = signal();
  let txns: Txn[] = [];
  let error: string | null = null;
  if (order.orderId) {
    try {
      txns = await fetchTransactions(order.orderId);
      remember(txns);
    } catch (e: unknown) {
      error = errMsg(e);
    }
  } else {
    // Without it the lookup would ask Amazon for order "null" and report a misleading result.
    error = "Couldn't find the order number on this page";
  }
  // Cancelled while the charges loaded: leave the page as it is.
  if (focus && search.aborted) return;
  const charges = txns.filter((t) => t.kind === "charge");
  const credits = txns.filter((t) => t.kind === "credit");
  const refunds = txns.filter((t) => t.kind === "refund");
  const credit = credits.length ? credits.reduce((a, c) => a + c.amount, 0) : order.summary.credits;
  const { solution, incomplete } = charges.length
    ? solve(order.shipments, charges, credit)
    : { solution: null, incomplete: false };
  if (incomplete) {
    warnings.push(
      solution
        ? "This order has too many charges to check every combination. The match below is the best found, not guaranteed. Double-check it against your statement."
        : "This order has too many charges to check every combination, so no match was found. Match the charges to deliveries manually.",
    );
  } else if (charges.length && (!solution || solution.assign.some((g) => g < 0))) {
    warnings.push(
      "Some charges didn't match a delivery cleanly (item-specific coupons or a partial refund can cause this). Unmatched amounts are flagged.",
    );
  }
  const shown = focus && solution && renderFocus(order, charges, solution, focus, warnings);
  if (shown) {
    const cards = shown.boxes.map(card);
    const top = Math.min(...cards.map((c) => c.getBoundingClientRect().top));
    if (Number.isFinite(top)) window.scrollTo({ top: window.scrollY + top - 16 });
    overlayDone(shown.panel, () => {
      for (const c of cards) c.classList.add("acs-glow");
    });
    return;
  }
  render(order, { charges, credits, refunds, solution, warnings, error });
  // Opened from a YNAB refund: show it, and hand its trace to the YNAB tab.
  const sameRefunds = focus && !error ? refunds.filter((r) => r.amount === focus.amount) : [];
  const refund = sameRefunds.find((r) => r.date === focus?.date) ?? sameRefunds[0];
  if (refund) {
    const trace = traceRefund(order, charges, refund);
    const panel = refundPanel(trace);
    try {
      GM_setValue(TRACE_KEY, trace);
    } catch {
      /* ignore */
    }
    panel.scrollIntoView?.({ block: "center" });
    overlayDone(panel);
    return;
  }
  if (focus) {
    overlayStop(
      error ? "Couldn't read Amazon's charges" : `Couldn't tie ${fmt(focus.amount)} to a delivery`,
      `${error ? `${error}. ` : ""}Showing the full breakdown for this order instead.`,
    );
  }
}

/** Order page opened from YNAB: #acs-charge=1999&acs-on=January%205%2C%202026 */
export function focusTarget(): Focus | null {
  const h = new URLSearchParams(location.hash.slice(1));
  const amount = Number(h.get("acs-charge"));
  return amount ? { amount, date: h.get("acs-on") || "" } : null;
}
