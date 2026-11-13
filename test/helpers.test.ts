// The test helpers themselves, so a broken stub fails here rather than in a source test.
import {
  GM_addValueChangeListener,
  GM_getValue,
  GM_registerMenuCommand,
  GM_setValue,
  GM_xmlhttpRequest,
} from "$";
import { expect, test, vi } from "vitest";
import { gm } from "./gm.ts";
import { loadPage } from "./html.ts";

test("values are stored as copies", () => {
  const v = { n: 1 };
  GM_setValue("k", v);
  v.n = 2;
  expect(GM_getValue("k")).toEqual({ n: 1 });
  expect(GM_getValue("missing", "fallback")).toBe("fallback");
});

test("listeners hear local and remote changes", () => {
  const heard = vi.fn();
  GM_addValueChangeListener("k", heard);
  GM_setValue("k", 1);
  gm.setRemote("k", 2);
  expect(heard.mock.calls).toEqual([
    ["k", undefined, 1, false],
    ["k", 1, 2, true],
  ]);
});

test("menu commands can be clicked", () => {
  const run = vi.fn();
  GM_registerMenuCommand("Do it", run);
  expect(gm.menuCaptions()).toEqual(["Do it"]);
  gm.clickMenu("Do it");
  expect(run).toHaveBeenCalledOnce();
});

test("requests are recorded and answered by the responder", async () => {
  gm.respond((req) => (req.url.endsWith("/ok") ? { status: 200, body: { a: 1 } } : "timeout"));
  const text = await new Promise((resolve) => {
    GM_xmlhttpRequest({ url: "https://api.ynab.com/ok", onload: (r) => resolve(r.responseText) });
  });
  expect(text).toBe('{"a":1}');
  const timedOut = await new Promise((resolve) => {
    GM_xmlhttpRequest({ url: "https://api.ynab.com/slow", ontimeout: () => resolve(true) });
  });
  expect(timedOut).toBe(true);
  expect(gm.requests().map((r) => r.url)).toEqual([
    "https://api.ynab.com/ok",
    "https://api.ynab.com/slow",
  ]);
});

test("loadPage replaces the document", () => {
  loadPage("<!doctype html><title>T</title><p id=x>hi</p><script>window.ran = true</script>");
  expect(document.title).toBe("T");
  expect(document.querySelector("#x")?.textContent).toBe("hi");
  expect("ran" in window).toBe(false);
});
