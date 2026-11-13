// Amazon transactions page: read the payment rows for an order (or for every order shown).
import { txt } from "./lib/dom.ts";
import { must } from "./lib/errors.ts";
import { cents } from "./lib/money.ts";
import { DATE_RE, leaves, MASK_RE, moneyIn, ORDER_RE, STATUS_RE } from "./scrape.ts";
import type { Txn } from "./types.ts";

export async function fetchTransactions(orderId: string): Promise<Txn[]> {
  const url = `/cpe/yourpayments/transactions?transactionTag=${encodeURIComponent(orderId)}`;
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) throw new Error(`Transactions page returned ${res.status}`);
  const html = await res.text();
  const rows = parseTransactions(new DOMParser().parseFromString(html, "text/html"), orderId);
  if (!rows.length && html.includes(orderId))
    throw new Error("Amazon's transactions page changed and couldn't be read");
  return rows;
}

// Reads transactions by what they say, not by how Amazon builds the page: a transaction
// is the largest block around an "Order #" that holds exactly one dollar amount. Its date
// and status are inside that block (new layout) or in the nearest heading above it (old
// layout); a masked card number makes it a card charge.
export function transactionRows(root: Element): Element[] {
  const orderLeaves = leaves(root).filter(
    (e) => ORDER_RE.test(txt(e)) && !e.closest("#acs-overlay, .acs-result, .acs-panel"),
  );
  const rows: Element[] = [];
  for (const leaf of orderLeaves) {
    let row = leaf;
    while (
      row.parentElement &&
      row.parentElement !== root &&
      moneyIn(row.parentElement).length <= 1 &&
      row.parentElement.textContent.length < 600
    )
      row = row.parentElement;
    if (moneyIn(row).length === 1 && !rows.includes(row)) rows.push(row);
  }
  return rows;
}

/** "Visa ****1234" from a row's texts, whichever way the mask is laid out; "" if none. */
function cardIn(texts: string[]): string {
  const i = texts.findIndex((t) => MASK_RE.test(t));
  const t = texts[i];
  if (t === undefined) return "";
  const [name = "", rest = ""] = t.split(MASK_RE);
  const digits = rest.match(/\d{2,4}/)?.[0] ?? texts[i + 1]?.match(/^\d{2,4}$/)?.[0];
  return digits ? `${name.trim() || texts[i - 1] || "Card"} ****${digits}` : "";
}

export function parseTransactions(doc: Document, orderId: string | null): Txn[] {
  const root = doc.body || doc;
  const markers = leaves(root).filter((e) => DATE_RE.test(txt(e)) || STATUS_RE.test(txt(e)));
  const before = (row: Node, re: RegExp) => {
    let found = "";
    for (const m of markers) {
      if (!(m.compareDocumentPosition(row) & Node.DOCUMENT_POSITION_FOLLOWING)) break;
      if (re.test(txt(m))) found = txt(m);
    }
    return found;
  };

  const out: Txn[] = [];
  for (const row of transactionRows(root)) {
    const texts = leaves(row).map(txt);
    // One charge can cover several orders; the row then lists each.
    const ids = [...new Set(texts.join(" ").match(new RegExp(ORDER_RE.source, "g")) || [])];
    if (orderId && !ids.includes(orderId)) continue;
    const amt = cents(must(moneyIn(row)[0], "amount"));
    if (!amt || !ids.length) continue;
    const card = cardIn(texts);
    const method =
      card || texts.find((t) => /points|gift card|balance|reward|credit/i.test(t)) || "";
    out.push({
      method,
      date: texts.find((t) => DATE_RE.test(t)) || before(row, DATE_RE),
      status: texts.find((t) => STATUS_RE.test(t)) || before(row, STATUS_RE),
      el: row,
      orderId: orderId || must(ids[0], "order id"),
      orderIds: ids,
      amount: Math.abs(amt),
      kind: amt > 0 ? "refund" : card ? "charge" : "credit",
    });
  }
  return out;
}
