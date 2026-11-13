// Every request against Amazon's transaction allowance is logged (in Tampermonkey's
// storage), so its real size shows up over time.
import { GM_getValue, GM_setValue } from "$";
import { $$, el, esc, line } from "./lib/dom.ts";
import { resultPanel } from "./lib/result-panel.ts";
import { suite } from "./overlay.ts";

const LOG_KEY = "acs-requests";

export interface LoggedRequest {
  at: number;
  /** "api" for the transaction service, "scroll" for the page loading more rows. */
  how: string;
  /** The HTTP status, or why there wasn't one. */
  status: number | string;
}

/** Amazon holding back: a 429, or a 503 or other server error, which asking again soon can extend just the same. */
export const isRefusal = (e: LoggedRequest) =>
  typeof e.status === "number" && (e.status === 429 || e.status >= 500);

export function requestLog(): LoggedRequest[] {
  try {
    const v: unknown = GM_getValue(LOG_KEY, []);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export function logRequest(how: string, status: number | string) {
  try {
    GM_setValue(LOG_KEY, [...requestLog(), { at: Date.now(), how, status }].slice(-300));
  } catch {
    /* ignore */
  }
}

/** The log as a floating panel, from the Tampermonkey menu. */
export function requestLogPanel() {
  const log = requestLog();
  const now = Date.now();
  const within = (ms: number) => log.filter((e) => now - e.at < ms);
  const tally = (es: LoggedRequest[]) =>
    `${es.filter((e) => e.status === 200).length} answered, ${es.filter(isRefusal).length} refused`;
  const time = (t: number) =>
    new Date(t).toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  const refused = log.filter(isRefusal).at(-1);
  const rows = log
    .slice(-15)
    .reverse()
    .map(
      (e) =>
        `<tr><td>${esc(time(e.at))} <span class="acs-muted">${esc(e.how)}</span></td><td class="acs-r">${e.status === 429 ? "refused" : esc(e.status)}</td></tr>`,
    )
    .join("");
  const box = el("div", "acs-split");
  box.appendChild(el("table", null, rows || "<tr><td>Nothing yet.</td></tr>"));
  $$(".acs-result").forEach((e) => {
    e.remove();
  });
  document.body.appendChild(
    resultPanel(suite, {
      floating: true,
      label: "Amazon requests",
      amount: String(within(864e5).length),
      meta: "loads of older transactions in the last 24 hours",
      body: [
        line(null, `Last hour: ${tally(within(36e5))}. Last 24 hours: ${tally(within(864e5))}.`),
        line("acs-muted", refused ? `Last refusal: ${time(refused.at)}.` : "No refusals logged."),
        box,
      ],
    }),
  );
}
