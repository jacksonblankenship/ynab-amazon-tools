import { describe, expect, test } from "vitest";
import { clearTop } from "./highlight.ts";

const rect = (left: number, top: number, right: number, bottom: number) => ({
  left,
  top,
  right,
  bottom,
});

describe("clearTop", () => {
  test("no panel: the box goes near the top", () => {
    expect(clearTop(rect(0, 500, 400, 700), null, 800)).toBe(16);
  });

  test("a panel beside the box, not over it: near the top", () => {
    expect(clearTop(rect(0, 500, 600, 700), rect(700, 16, 1060, 380), 800)).toBe(16);
  });

  test("a panel over only the box's edge: near the top", () => {
    expect(clearTop(rect(0, 500, 900, 700), rect(700, 16, 1060, 380), 800)).toBe(16);
  });

  // A phone: the panel spans the screen, pinned to the top.
  test("a panel across the box at the top: the box goes below it", () => {
    expect(clearTop(rect(0, 900, 390, 1200), rect(16, 16, 374, 380), 844)).toBe(396);
  });

  // A phone: the panel docked as a bottom sheet.
  test("a panel across the box at the bottom: the box goes above it", () => {
    expect(clearTop(rect(0, 900, 390, 1200), rect(0, 464, 390, 844), 844)).toBe(16);
  });
});
