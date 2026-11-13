import { afterEach, describe, expect, test } from "vitest";
import pageCss from "../style.css?raw";
import suiteCss from "./suite.css?raw";
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

describe("the floating panel on a narrow screen", () => {
  // At phone width a panel pinned top-right covers the delivery it points at.
  test("docks to the bottom edge, capped, scrolling inside itself", () => {
    const narrow = suiteCss.match(/@media \(width <= 600px\) \{([\s\S]*?)\n\}/)?.[1] ?? "";
    const rule = narrow.match(/\.pfx-result\.pfx-floating \{([^}]*)\}/)?.[1] ?? "";
    expect(rule).toMatch(/inset: auto 0 0/);
    expect(rule).toMatch(/max-block-size: \d+dvh/);
    expect(suiteCss).toMatch(/\.pfx-result\.pfx-floating \{[^}]*overflow-y: auto/);
  });
});
