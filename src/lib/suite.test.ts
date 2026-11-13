import { afterEach, describe, expect, test } from "vitest";
import pageCss from "../style.css?raw";
import { suiteStyle } from "./suite.ts";

afterEach(() => {
  document.head.replaceChildren();
});

const injected = () =>
  [...document.querySelectorAll("style")].map((s) => s.textContent ?? "").join("\n");

// The README promises the script talks only to Amazon and YNAB: no web fonts, no CDN.
describe("suiteStyle", () => {
  test("injects no stylesheet or link that loads from another host", () => {
    suiteStyle("acs");
    expect(document.querySelectorAll("link")).toHaveLength(0);
    expect(injected()).toContain(".acs-result");
    expect(injected()).not.toMatch(/@import|url\(|https?:/);
  });

  test("names no web font", () => {
    suiteStyle("acs");
    expect(injected()).not.toMatch(/Figtree/);
  });

  test("the panels' own styles load nothing either", () => {
    expect(pageCss).toContain(".acs-launch");
    expect(pageCss).not.toMatch(/@import|url\(|https?:|Figtree/);
  });
});
