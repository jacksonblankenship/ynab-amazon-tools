// Small DOM helpers shared by userscripts.

export const $ = <E extends Element = Element>(
  sel: string,
  root: ParentNode = document,
) => root.querySelector<E>(sel);
export const $$ = <E extends Element = Element>(
  sel: string,
  root: ParentNode = document,
) => Array.from(root.querySelectorAll<E>(sel));
export const txt = (el: Element | null | undefined) =>
  el ? el.textContent.replace(/\s+/g, " ").trim() : "";

export const el = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls?: string | null,
  html?: string,
) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
};
/** A div holding plain text (never parsed as HTML). */
export const line = (cls: string | null, t: string) => {
  const e = el("div", cls);
  e.textContent = t;
  return e;
};
const ESC: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
};
// The regex only matches ESC's keys, so the fallback never applies.
export const esc = (s: unknown) =>
  String(s).replace(/[&<>"]/g, (c) => ESC[c] ?? c);
