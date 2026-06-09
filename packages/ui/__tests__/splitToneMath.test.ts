import { test, expect } from "bun:test";
import { getSplitToneTintValues } from "../app/gpu/splitToneMath";

test("green is zero by default (backward compatible)", () => {
  const v = getSplitToneTintValues({ mode: "natural", amount: 1, hueAngle: 0, pivot: 0.3 });
  expect(v.shadowR).toBeCloseTo(0.3, 5);
  expect(v.shadowG).toBeCloseTo(0, 5);
  expect(v.highlightG).toBeCloseTo(0, 5);
});

test("split-tone green pushes green into shadows", () => {
  const v = getSplitToneTintValues({ mode: "natural", amount: 1, hueAngle: 0, pivot: 0.3, green: 1 });
  expect(v.shadowG).toBeCloseTo(0.3, 5);
  expect(v.highlightG).toBeCloseTo(0.15, 5);
});

test("complementary mode mirrors green into highlights", () => {
  const v = getSplitToneTintValues({ mode: "complementary", amount: 1, hueAngle: 0, pivot: 0.3, green: 1 });
  expect(v.shadowG).toBeCloseTo(0.3, 5);
  expect(v.highlightG).toBeCloseTo(-0.3, 5);
});
