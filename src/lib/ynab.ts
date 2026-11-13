// YNAB: a small search button on hover over a merchant's transactions, linking to that
// charge on the merchant's site.
import { $, $$, el, txt } from "./dom.ts";
import { searchIcon } from "./suite.ts";

/** A YNAB transaction to look up: cents, direction, and candidate ISO dates. */
export interface YnabCharge {
  amount: number;
  kind: "charge" | "refund";
  /** One date, or both readings when YNAB's date order can't be determined. */
  dates: string[];
}

export function ynabButton(opts: {
  /** Payees the button appears on. */
  payee: RegExp;
  /** The script's class prefix; the button is styled as `<prefix>-yn`. */
  prefix: string;
  /** Tooltip and accessible name. */
  label: string;
  href: (c: YnabCharge) => string;
}) {
  const p = opts.prefix;
  const pill = el("a", `${p}-yn`, searchIcon(14));
  pill.appendChild(el("span", `${p}-yn-tip`)).textContent = opts.label;
  pill.setAttribute("aria-label", opts.label);
  pill.target = "_blank";
  pill.rel = "noopener";
  document.body.appendChild(pill);
  let current: Element | null = null;
  let hideTimer: ReturnType<typeof setTimeout> | undefined;

  const show = (row: Element) => {
    const payee = txt($(".ynab-grid-cell-payeeName", row));
    if (!opts.payee.test(payee)) return hide(0);
    const out = money($(".ynab-grid-cell-outflow", row));
    const inn = money($(".ynab-grid-cell-inflow", row));
    const amount = out || inn;
    if (!amount) return hide(0);
    pill.href = opts.href({
      amount,
      kind: out ? "charge" : "refund",
      dates: ynabDates(txt($(".ynab-grid-cell-date", row))),
    });
    const cell = $(".ynab-grid-cell-payeeName", row) || row;
    const r = cell.getBoundingClientRect();
    // Pop in when it appears, not when it moves between rows.
    if (pill.style.display !== "flex") {
      pill.classList.remove(`${p}-pop`);
      void pill.offsetWidth; // restart the animation
      pill.classList.add(`${p}-pop`);
    }
    pill.style.display = "flex";
    pill.style.top = `${r.top + (r.height - pill.offsetHeight) / 2}px`;
    pill.style.left = `${r.right - pill.offsetWidth - 6}px`;
    current = row;
    clearTimeout(hideTimer);
  };
  const hide = (delay = 250) => {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      pill.style.display = "none";
      current = null;
    }, delay);
  };

  // Event delegation only: YNAB re-renders rows constantly, so we never touch its DOM.
  document.addEventListener(
    "mouseover",
    (e) => {
      if (e.target instanceof Node && pill.contains(e.target)) {
        clearTimeout(hideTimer);
        return;
      }
      const row = e.target instanceof Element && e.target.closest(".ynab-grid-body-row");
      if (row) {
        if (row !== current) show(row);
        else clearTimeout(hideTimer);
      } else if (current) hide();
    },
    true,
  );
  document.addEventListener("scroll", () => hide(0), true);
  ["mousedown", "click"].forEach((t) => {
    pill.addEventListener(t, (e) => e.stopPropagation());
  });
  let pressTimer: ReturnType<typeof setTimeout> | undefined;
  pill.addEventListener("click", () => {
    clearTimeout(pressTimer);
    pill.classList.remove(`${p}-press`);
    void pill.offsetWidth; // restart the animation
    pill.classList.add(`${p}-press`);
    pressTimer = setTimeout(() => pill.classList.remove(`${p}-press`), 520);
  });
}

const money = (cell: Element | null) => {
  const v = txt(cell).replace(/[^\d.]/g, "");
  return v ? Math.round(parseFloat(v) * 100) : 0;
};

const iso = (y: string, mo: string, d: string) =>
  `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;

/**
 * YNAB shows dates in the budget's chosen format: year-first, or day and month in
 * either order. Year-first is unambiguous. For the others, any date in the register
 * with a part over 12 settles the order; until one does, both readings are returned and
 * the merchant side matches whichever is closer. Amounts must match exactly, so the
 * wider window costs little.
 */
function ynabDates(s: string): string[] {
  let m = s.match(/(\d{4})\D(\d{1,2})\D(\d{1,2})/);
  if (m) {
    const [, y = "", mo = "", d = ""] = m;
    return [iso(y, mo, d)];
  }
  m = s.match(/(\d{1,2})\D(\d{1,2})\D(\d{4})/);
  if (!m) return [];
  const [, a = "", b = "", y = ""] = m;
  const order = Number(a) > 12 ? true : Number(b) > 12 ? false : dayFirst();
  if (order === true) return [iso(y, b, a)];
  if (order === false) return [iso(y, a, b)];
  return [iso(y, a, b), iso(y, b, a)];
}
function dayFirst(): boolean | null {
  for (const cell of $$(".ynab-grid-cell-date")) {
    const m = txt(cell).match(/^(\d{1,2})\D(\d{1,2})\D\d{4}$/);
    if (m && Number(m[1]) > 12) return true;
    if (m && Number(m[2]) > 12) return false;
  }
  return null;
}
