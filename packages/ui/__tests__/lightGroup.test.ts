import { describe, expect, test } from "bun:test";
import { isLightGroupActive } from "../app/gpu/lightGroup";

// The linear-light bracket is only inserted when isLightGroupActive() is true.
// When the whole light group is off the frame must pass through untouched, so
// split-tone/camera-shake stay byte-identical to the pre-linear-light pipeline.
describe("isLightGroupActive", () => {
  test("defaults (no params) run the bracket", () => {
    // Halation, aberration, bloom, grain, vignette all default to amount > 0.
    expect(isLightGroupActive({})).toBe(true);
  });

  test("whole group disabled via no-* flags -> no bracket", () => {
    expect(
      isLightGroupActive({
        "no-halation": true,
        "no-aberration": true,
        "no-bloom": true,
        "no-grain": true,
        "no-vignette": true,
      }),
    ).toBe(false);
  });

  test("whole group disabled via zero amounts -> no bracket", () => {
    expect(
      isLightGroupActive({
        "halation-amount": 0,
        "aberration": 0,
        "bloom-amount": 0,
        "grain-iso": 0,
        "vignette-amount": 0,
      }),
    ).toBe(false);
  });

  test("any single active effect runs the bracket", () => {
    const allOff = {
      "no-halation": true,
      "no-aberration": true,
      "no-bloom": true,
      "no-grain": true,
      "no-vignette": true,
    };
    expect(isLightGroupActive({ ...allOff, "no-halation": false, "halation-amount": 0.5 })).toBe(true);
    expect(isLightGroupActive({ ...allOff, "no-bloom": false, "bloom-amount": 0.3 })).toBe(true);
    expect(isLightGroupActive({ ...allOff, "no-vignette": false, "vignette-amount": 0.2 })).toBe(true);
  });

  test("a disabled flag overrides a non-zero amount", () => {
    expect(
      isLightGroupActive({
        "no-halation": true,
        "halation-amount": 0.9,
        "no-aberration": true,
        "no-bloom": true,
        "no-grain": true,
        "no-vignette": true,
      }),
    ).toBe(false);
  });
});
