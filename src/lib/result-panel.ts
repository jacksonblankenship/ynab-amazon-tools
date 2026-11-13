// The result panel: a card with the amount found, what it was for, and the script's
// disclosure line. Shown on the merchant's page, or floating over YNAB.
import { el } from "./dom.ts";
import { disclosure, type Suite, searchIcon } from "./suite.ts";

export interface ResultPanelOptions {
  /** What the amount is, e.g. "This charge" (the default) or "This refund". */
  label?: string;
  amount: string;
  meta: string;
  body?: Node[];
  /** Pinned to the viewport instead of placed in the page. */
  floating?: boolean;
  onDismiss?: () => void;
}

export function resultPanel(suite: Suite, o: ResultPanelOptions) {
  const p = suite.prefix;
  const panel = el("section", `${p}-result${o.floating ? ` ${p}-floating` : ""}`);
  const label = o.label ?? "This charge";
  panel.setAttribute("aria-label", `${label}, from ${suite.name}`);
  const text = (cls: string, t: string) => {
    const e = el("span", `${p}-${cls}`);
    e.textContent = t;
    return e;
  };
  const head = el("div", `${p}-r-head`);
  head.append(
    el("span", `${p}-mark`, searchIcon(12)),
    text("r-label", label),
    text("r-pill", suite.site),
  );
  const x = el(
    "button",
    `${p}-r-x`,
    '<svg aria-hidden="true" width="14" height="14" viewBox="0 0 14 14"><path d="M3 3l8 8M11 3l-8 8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  );
  x.type = "button";
  x.setAttribute("aria-label", "Dismiss");
  x.addEventListener("click", () => {
    panel.classList.add(`${p}-gone`);
    o.onDismiss?.();
    setTimeout(() => panel.remove(), 200);
  });
  head.appendChild(x);
  const amt = el("div", `${p}-r-amt`);
  amt.append(text("r-num", o.amount), text("r-meta", o.meta));
  const body = el("div", `${p}-r-body`);
  body.append(...(o.body ?? []));
  panel.append(head, amt, body, el("div", `${p}-r-foot`, disclosure(suite)));
  return panel;
}
