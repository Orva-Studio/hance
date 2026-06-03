import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { HALATION_THRESHOLD, BLUR_SIGMA_FACTOR, HALATION_CHANNEL_SIGMA, HALATION_PSF, HALATION_RING } from "../src/render-constants";

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
});
