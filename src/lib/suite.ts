// The look every script in the suite shares: one stylesheet, scoped per script by prefix,
// plus the bits of markup (disclosure line, search icon) the shared components reuse.
import css from "./suite.css?raw";

/** One script's identity: its CSS/id prefix, its name, and the site it works on. */
export interface Suite {
  prefix: string;
  name: string;
  site: string;
  /** Where people report a broken script; offered when a site's page can't be read. */
  issues?: string;
}

export const disclosure = (s: Suite) =>
  `${s.name} for YNAB · independent, not affiliated with YNAB`;

/** A "Report it" link to the suite's issues page, or null if it has none. */
export function reportLink(s: Suite): HTMLAnchorElement | null {
  if (!s.issues) return null;
  const a = document.createElement("a");
  a.className = `${s.prefix}-report`;
  a.href = s.issues;
  a.target = "_blank";
  a.rel = "noopener";
  a.textContent = "Report it";
  return a;
}

/** A line of plain text followed by the report link, for "couldn't read the page" notes. */
export function reportLine(s: Suite, cls: string | null, text: string): HTMLElement {
  const e = document.createElement("div");
  if (cls) e.className = cls;
  e.textContent = text;
  const a = reportLink(s);
  if (a) e.append(" ", a);
  return e;
}

export const searchIcon = (size: number) =>
  `<svg aria-hidden="true" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5L21 21"/></svg>`;

export const reducedMotion = () =>
  typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

const FONT = "https://fonts.googleapis.com/css2?family=Figtree:wght@400;600;700&display=swap";

/** Inject the suite stylesheet under `prefix`, and the Figtree font off YNAB (which has its own). */
export function suiteStyle(prefix: string) {
  const root = document.head || document.documentElement;
  const style = document.createElement("style");
  style.textContent = css.replace(/pfx-/g, `${prefix}-`);
  root.appendChild(style);
  if (location.hostname === "app.ynab.com") return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = FONT;
  root.appendChild(link);
}
