// Also proves the "$" stub wiring: source code's GM_* calls land in test/gm.ts.
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { gm } from "../test/gm.ts";
import { isRefusal, logRequest, requestLog, requestLogPanel } from "./request-log.ts";

test("an empty store gives an empty log", () => {
  expect(requestLog()).toEqual([]);
});

test("logged requests are saved to GM storage", () => {
  logRequest("api", 200);
  logRequest("scroll", 429);
  expect(gm.get("acs-requests")).toEqual([
    { at: expect.any(Number), how: "api", status: 200 },
    { at: expect.any(Number), how: "scroll", status: 429 },
  ]);
  expect(requestLog().map((e) => e.status)).toEqual([200, 429]);
});

test("a corrupt stored value reads as an empty log", () => {
  gm.seed("acs-requests", { not: "a list" });
  expect(requestLog()).toEqual([]);
});

test("keeps only the newest 300 entries", () => {
  gm.seed(
    "acs-requests",
    Array.from({ length: 300 }, (_, i) => ({ at: i, how: "api", status: 200 })),
  );
  logRequest("api", 503);
  const log = requestLog();
  expect(log).toHaveLength(300);
  expect(log[0]?.at).toBe(1);
  expect(log.at(-1)?.status).toBe(503);
});

test("storage starts empty in every test", () => {
  expect(gm.get("acs-requests")).toBeUndefined();
});

test.each([
  [429, true],
  [503, true],
  [500, true],
  [200, false],
  [404, false],
  ["not sent: offline", false],
  ["429, not accepted", false],
])("status %s counts as Amazon holding back: %s", (status, refused) => {
  expect(isRefusal({ at: 0, how: "api", status })).toBe(refused);
});

describe("the request log panel", () => {
  const NOW = new Date(2026, 10, 13, 12).getTime();
  const HOUR = 36e5;
  beforeEach(() => {
    vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
  });
  afterEach(() => {
    vi.useRealTimers();
  });
  const panelText = () => document.querySelector(".acs-result")?.textContent ?? "";

  test("tallies the last hour and day, and says when Amazon last refused", () => {
    gm.seed("acs-requests", [
      { at: NOW - 48 * HOUR, how: "api", status: 503 },
      { at: NOW - 3 * HOUR, how: "scroll", status: 200 },
      { at: NOW - 0.5 * HOUR, how: "api", status: 429 },
      { at: NOW - 0.2 * HOUR, how: "api", status: 200 },
    ]);
    requestLogPanel();
    const text = panelText();
    // Three requests in the last 24 hours; the one from two days ago isn't counted.
    expect(document.querySelector(".acs-r-num")?.textContent).toBe("3");
    expect(text).toMatch(/hour\D*1 answered, 1 refused/i);
    expect(text).toMatch(/24 hours\D*2 answered, 1 refused/i);
    expect(text).toMatch(/last refusal/i);
    // Every request is listed.
    expect(document.querySelectorAll("tr")).toHaveLength(4);
  });

  test("an empty log says nothing has happened yet", () => {
    requestLogPanel();
    expect(panelText()).toMatch(/nothing yet/i);
    expect(panelText()).toMatch(/no refusals/i);
  });

  test("opening it again replaces the panel rather than stacking another", () => {
    requestLogPanel();
    requestLogPanel();
    expect(document.querySelectorAll(".acs-result")).toHaveLength(1);
  });
});
