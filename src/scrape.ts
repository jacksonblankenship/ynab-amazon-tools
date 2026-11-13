import { $$, txt } from "./lib/dom.ts";

// Content-based lookups. Amazon's generated class names change between builds, but the things
// it has to show people (dollar amounts, order numbers, dates, "Label:" text) don't, so parsing
// leans on those. The data-component attributes used below are named for their content and
// have been stable; each one also has a content-based fallback.
export const MONEY_RE = /[-+−]?\s*\$\s*[\d,]+\.\d{2}/g;
export const IS_MONEY = /^[-+−]?\s*\$\s*[\d,]+\.\d{2}$/;
export const ORDER_RE = /\d{3}-\d{7}-\d{7}/;
// Amazon has written dates both as "November 2, 2026" and as "Nov 02, 2026".
export const DATE_RE =
  /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.? \d{1,2}, \d{4}$/;
export const STATUS_RE = /^(pending|completed|in progress|charged|refunded)$/i;
// A card number's mask: "****1234" in one piece (old layout), or "••••" then "1234" (new layout).
export const MASK_RE = /[*•]{2,}/;
/** Visible text-bearing elements with no element children, in document order. */
export const leaves = (root: ParentNode) =>
  $$("*", root).filter(
    (e) =>
      !e.children.length &&
      !/^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE)$/.test(e.tagName) &&
      txt(e) &&
      !e.closest('[aria-hidden="true"]'),
  );
export const moneyIn = (e: Element): string[] =>
  e.textContent.match(MONEY_RE) || [];
