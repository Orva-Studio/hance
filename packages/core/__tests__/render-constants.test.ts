import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { HALATION_THRESHOLD, BLUR_SIGMA_FACTOR, HALATION_CHANNEL_SIGMA, HALATION_PSF, HALATION_RING, REFERENCE_HEIGHT, resolutionScale, DOF_MAX_RADIUS, dofRadiusPx } from "../src/render-constants";

const repoRoot = join(import.meta.dir, "..", "..", "..");

describe("shared render constants", () => {
  test("exports match the canonical render.json values", () => {
    expect(HALATION_THRESHOLD).toEqual([0.65, 0.75]);
    expect(BLUR_SIGMA_FACTOR).toBe(0.5);
  });

  test("per-channel scatter constants are present and ordered R>G>B", () => {
    expect(HALATION_CHANNEL_SIGMA).toEqual([1.0, 0.62, 0.38]);
    expect(HALATION_CHANNEL_SIGMA[0]).toBeGreaterThan(HALATION_CHANNEL_SIGMA[1]);
    expect(HALATION_CHANNEL_SIGMA[1]).toBeGreaterThan(HALATION_CHANNEL_SIGMA[2]);
    expect(HALATION_PSF).toEqual([[1.0, 0.7], [2.6, 0.3]]);
    expect(HALATION_RING).toBe(1.0);
  });

  // Parity guard: neither renderer may re-hardcode these constants. If a future
  // edit pastes the literals back into one renderer (the #64 drift class), this
  // fails so CI catches it instead of shipping mismatched halation/bloom.
  test("TS renderer does not hardcode the threshold band or sigma factor", () => {
    const src = readFileSync(join(repoRoot, "packages/ui/app/gpu/renderer.ts"), "utf8");
    expect(src).toContain("HALATION_THRESHOLD");
    expect(src).toContain("BLUR_SIGMA_FACTOR");
    expect(src).not.toMatch(/\[0\.65,\s*0\.75/);
    expect(src).not.toMatch(/radius \* 0\.5\b/);
  });

  test("Rust renderer does not hardcode the threshold band or sigma factor", () => {
    const src = readFileSync(join(repoRoot, "packages/wgpu/src/renderer.rs"), "utf8");
    expect(src).toContain("render_constants()");
    expect(src).not.toMatch(/\[0\.65,\s*0\.75/);
    expect(src).not.toMatch(/radius \* 0\.5\b/);
  });

  test("resolutionScale normalizes blur sizes to the 1080p reference height", () => {
    expect(REFERENCE_HEIGHT).toBe(1080);
    expect(resolutionScale(1080)).toBe(1);
    expect(resolutionScale(2160)).toBe(2);
    expect(resolutionScale(540)).toBe(0.5);
    // Degenerate heights must not zero out or invert the effect.
    expect(resolutionScale(0)).toBe(1);
    expect(resolutionScale(-5)).toBe(1);
  });

  test("both renderers scale halation sigma by resolution", () => {
    const ts = readFileSync(join(repoRoot, "packages/ui/app/gpu/renderer.ts"), "utf8");
    expect(ts).toContain("resolutionScale");
    const rs = readFileSync(join(repoRoot, "packages/wgpu/src/renderer.rs"), "utf8");
    expect(rs).toContain("resolution_scale");
  });
});

describe("depth-of-field amount → radius mapping", () => {
  test("a pixel on the focus plane is never blurred", () => {
    expect(dofRadiusPx(0.5, 0.5, 1, 100, 1080)).toBe(0);
  });

  test("radius scales linearly with amount and with depth distance", () => {
    // coeff = amount * DOF_MAX_RADIUS * resolutionScale(1080=1).
    expect(dofRadiusPx(1.0, 0.5, 0.5, 100, 1080)).toBeCloseTo(0.5 * DOF_MAX_RADIUS * 0.5, 5);
    // Double the depth distance → double the radius (below the clamp).
    expect(dofRadiusPx(0.6, 0.5, 0.2, 100, 1080)).toBeCloseTo(
      2 * dofRadiusPx(0.55, 0.5, 0.2, 100, 1080),
      5,
    );
  });

  test("max-blur clamps the radius", () => {
    // amount 1, full depth distance would be DOF_MAX_RADIUS px; clamp to 8.
    expect(dofRadiusPx(1.0, 0.0, 1, 8, 1080)).toBe(8);
  });

  test("higher resolution scales the radius up", () => {
    expect(dofRadiusPx(1.0, 0.0, 0.1, 1000, 2160)).toBeCloseTo(
      2 * dofRadiusPx(1.0, 0.0, 0.1, 1000, 1080),
      5,
    );
  });
});
