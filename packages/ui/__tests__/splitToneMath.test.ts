import { test, expect } from "bun:test";
import { getSplitToneTintValues } from "../app/gpu/splitToneMath";

test("shadow hue 0 (red) warms shadows on the centered wheel", () => {
  // hue_to_rgb(0) = [1,0,0], centered [2/3,-1/3,-1/3] * 0.3.
  const v = getSplitToneTintValues({ amount: 1, shadowHueAngle: 0, highlightHueAngle: 0, pivot: 0.3 });
  expect(v.shadowR).toBeCloseTo(0.2, 5);
  expect(v.shadowB).toBeCloseTo(-0.1, 5);
  expect(v.shadowG).toBeCloseTo(-0.1, 5);
  // Luminance-neutral: channels sum to zero.
  expect(v.shadowR + v.shadowB + v.shadowG).toBeCloseTo(0, 5);
});

test("teal shadow hue 180 gives shadows low R, high G+B", () => {
  // hue_to_rgb(180) = [0,1,1], centered [-2/3,1/3,1/3] * 0.3.
  const v = getSplitToneTintValues({ amount: 1, shadowHueAngle: 180, highlightHueAngle: 0, pivot: 0.3 });
  expect(v.shadowR).toBeCloseTo(-0.2, 5);
  expect(v.shadowG).toBeCloseTo(0.1, 5);
  expect(v.shadowB).toBeCloseTo(0.1, 5);
  expect(v.shadowG).toBeGreaterThan(v.shadowR);
});

test("highlight hue tints highlights from its own hue at the subtler 0.15 scale", () => {
  // Red highlight (0): centered [2/3,-1/3,-1/3] * 0.15.
  const v = getSplitToneTintValues({ amount: 1, shadowHueAngle: 180, highlightHueAngle: 0, pivot: 0.3 });
  expect(v.highlightR).toBeCloseTo(0.1, 5); // 2/3 * 0.15
  expect(v.highlightG).toBeCloseTo(-0.05, 5);
  expect(v.highlightB).toBeCloseTo(-0.05, 5);
});

test("shadow and highlight hues are fully independent", () => {
  // Teal shadows (180) + amber highlights (40): a non-complementary pair.
  const v = getSplitToneTintValues({ amount: 1, shadowHueAngle: 180, highlightHueAngle: 40, pivot: 0.3 });
  expect(v.shadowR).toBeCloseTo(-0.2, 5); // teal shadow
  expect(v.shadowG).toBeCloseTo(0.1, 5);
  expect(v.highlightR).toBeGreaterThan(0); // amber highlight leans warm
  expect(v.highlightB).toBeLessThan(0);
});
