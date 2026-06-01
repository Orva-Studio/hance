import { describe, expect, test } from "bun:test";
import { srgbToLinear, linearToSrgb } from "../src/colorspace";

describe("sRGB transfer function", () => {
  test("endpoints map to themselves", () => {
    expect(srgbToLinear(0)).toBeCloseTo(0, 6);
    expect(srgbToLinear(1)).toBeCloseTo(1, 6);
    expect(linearToSrgb(0)).toBeCloseTo(0, 6);
    expect(linearToSrgb(1)).toBeCloseTo(1, 6);
  });

  test("known midpoint: sRGB 0.5 -> linear ~0.214", () => {
    expect(srgbToLinear(0.5)).toBeCloseTo(0.21404, 4);
  });

  test("round-trips within epsilon across the range", () => {
    for (let i = 0; i <= 20; i++) {
      const x = i / 20;
      expect(linearToSrgb(srgbToLinear(x))).toBeCloseTo(x, 5);
    }
  });
});
