import { test, expect } from "bun:test";
import { getSplitToneTintValues } from "../app/gpu/splitToneMath";

test("hue 0 (red) warms shadows on the centered wheel", () => {
  // hue_to_rgb(0) = [1,0,0], centered [2/3,-1/3,-1/3] * 0.3.
  const v = getSplitToneTintValues({ mode: "natural", amount: 1, hueAngle: 0, pivot: 0.3 });
  expect(v.shadowR).toBeCloseTo(0.2, 5);
  expect(v.shadowB).toBeCloseTo(-0.1, 5);
  expect(v.shadowG).toBeCloseTo(-0.1, 5);
  expect(v.highlightR).toBeCloseTo(0.1, 5); // natural scale 0.15
  // Luminance-neutral: channels sum to zero.
  expect(v.shadowR + v.shadowB + v.shadowG).toBeCloseTo(0, 5);
});

test("teal hue 180 gives shadows low R, high G+B", () => {
  // hue_to_rgb(180) = [0,1,1], centered [-2/3,1/3,1/3] * 0.3.
  const v = getSplitToneTintValues({ mode: "natural", amount: 1, hueAngle: 180, pivot: 0.3 });
  expect(v.shadowR).toBeCloseTo(-0.2, 5);
  expect(v.shadowG).toBeCloseTo(0.1, 5);
  expect(v.shadowB).toBeCloseTo(0.1, 5);
  expect(v.shadowG).toBeGreaterThan(v.shadowR);
});

test("complementary mode mirrors the shadow tint into highlights at scale 0.3", () => {
  const v = getSplitToneTintValues({ mode: "complementary", amount: 1, hueAngle: 0, pivot: 0.3 });
  expect(v.highlightR).toBeCloseTo(-0.2, 5); // -2/3 * 0.3
  expect(v.highlightB).toBeCloseTo(0.1, 5);
  expect(v.highlightG).toBeCloseTo(0.1, 5);
});
