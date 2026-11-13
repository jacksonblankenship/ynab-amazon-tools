// Also proves the "$" stub wiring: source code's GM_* calls land in test/gm.ts.
import { expect, test } from "vitest";
import { gm } from "../test/gm.ts";
import { logRequest, requestLog } from "./request-log.ts";

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
