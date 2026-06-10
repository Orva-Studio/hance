import { test, expect } from "bun:test";
import { deriveHighlightHue, inferMode } from "../app/components/splitToneMode";

test("natural mode derives highlight equal to the shadow hue", () => {
  expect(deriveHighlightHue(200, "natural")).toBe(200);
  expect(deriveHighlightHue(0, "natural")).toBe(0);
});

test("complementary mode derives highlight opposite the shadow hue, wrapping at 360", () => {
  expect(deriveHighlightHue(30, "complementary")).toBe(210);
  expect(deriveHighlightHue(200, "complementary")).toBe(20); // 380 wraps to 20
  expect(deriveHighlightHue(180, "complementary")).toBe(0);
});

test("inferMode classifies the current hue pair", () => {
  expect(inferMode(200, 200)).toBe("natural");
  expect(inferMode(30, 210)).toBe("complementary");
  expect(inferMode(200, 20)).toBe("complementary"); // wrapped
  expect(inferMode(180, 40)).toBe("custom");
});

test("inferMode is wrap-aware and tolerant of float hues", () => {
  expect(inferMode(0, 360)).toBe("natural"); // same hue across the wrap
  expect(inferMode(360, 180)).toBe("complementary");
  expect(inferMode(180, 360)).toBe("complementary");
  expect(inferMode(20.0001, 20)).toBe("natural"); // hand-edited float look
  expect(inferMode(20, 201)).toBe("custom"); // a whole degree off is custom
});
