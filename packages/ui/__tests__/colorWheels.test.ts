import { describe, test, expect } from "bun:test";
import { isColorWheelsActive, colorWheelsUniform } from "../app/gpu/colorWheels";

const neutral = {
  "lift-r": 0, "lift-g": 0, "lift-b": 0,
  "gamma-r": 1, "gamma-g": 1, "gamma-b": 1,
  "gain-r": 1, "gain-g": 1, "gain-b": 1,
};

describe("isColorWheelsActive", () => {
  test("neutral params are inactive", () => {
    expect(isColorWheelsActive({ ...neutral })).toBe(false);
  });

  test("any non-neutral value activates", () => {
    expect(isColorWheelsActive({ ...neutral, "lift-b": 0.05 })).toBe(true);
    expect(isColorWheelsActive({ ...neutral, "gamma-r": 1.2 })).toBe(true);
    expect(isColorWheelsActive({ ...neutral, "gain-g": 0.9 })).toBe(true);
  });

  test("disabled group is inactive even when non-neutral", () => {
    expect(isColorWheelsActive({ ...neutral, "lift-r": 0.5, "no-color-wheels": true })).toBe(false);
  });
});

describe("colorWheelsUniform", () => {
  test("packs 12 floats in lift/gamma/gain order with padding", () => {
    const u = colorWheelsUniform({ ...neutral, "lift-r": 0.1, "gamma-g": 1.5, "gain-b": 2 });
    const expected = [0.1, 0, 0, 0, 1, 1.5, 1, 0, 1, 1, 2, 0];
    expect(u.length).toBe(12);
    for (let i = 0; i < 12; i++) {
      expect(u[i]).toBeCloseTo(expected[i], 6);
    }
  });
});
