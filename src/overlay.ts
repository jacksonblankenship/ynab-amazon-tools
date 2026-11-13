// Full-page loading overlay (YNAB -> transactions -> order).
import { makeOverlay } from "./lib/overlay.ts";
import type { Suite } from "./lib/suite.ts";

export const suite: Suite = {
  prefix: "acs",
  name: "Amazon Charge Finder",
  site: "Amazon",
  issues: "https://github.com/jacksonblankenship/ynab-amazon-tools/issues",
};

/** The search sent over from YNAB, kept in sessionStorage across transactions pages. */
export const FIND_KEY = "acs-find";

export const { overlay, overlayStart, overlayFound, overlayStop, overlayDone, signal } =
  makeOverlay(suite, {
    // Whenever the overlay ends, so does the search: a cancelled one mustn't resume.
    onEnd: () => {
      try {
        sessionStorage.removeItem(FIND_KEY);
      } catch {
        /* ignore */
      }
    },
  });
