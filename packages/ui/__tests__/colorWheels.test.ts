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

// Pointer-event guards: a drag that starts elsewhere (e.g. the compare-view
// divider) must not change wheel values when the pointer crosses a wheel, and
// the divider must capture its pointer so it cannot leak into other controls.
// No DOM-event test infra exists here, so guard the source directly.
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("drag isolation between compare divider and color wheels", () => {
  const dir = join(import.meta.dir, "..", "app", "components");

  test("wheel pointermove only acts on drags that started on the wheel", () => {
    const src = readFileSync(join(dir, "ColorWheelsControls.tsx"), "utf8");
    expect(src).toContain("draggingRef.current = true");
    expect(src).toMatch(/handlePointerMove[\s\S]*?!draggingRef\.current/);
    expect(src).toContain("onPointerCancel");
  });

  test("compare divider captures its pointer for the whole drag", () => {
    const src = readFileSync(join(dir, "CompareOverlay.tsx"), "utf8");
    expect(src).toContain("setPointerCapture");
    expect(src).not.toContain("onMouseDown");
    expect(src).toMatch(/hasPointerCapture/);
  });
});
