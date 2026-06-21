import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { createHeadlessRenderer, type HeadlessRenderer } from "@hance/gpu";
import { REFERENCE_HEIGHT } from "@hance/core";

// Isolate halation: disable every other effect so the only thing tinting the
// frame is the halation glow.
const HALATION_ONLY = {
  "no-input-lut": true,
  "no-color-settings": true,
  "no-aberration": true,
  "no-bloom": true,
  "no-grain": true,
  "no-vignette": true,
  "no-split-tone": true,
  "no-camera-shake": true,
};

// Blur sigmas scale with frameHeight / REFERENCE_HEIGHT (1080), so render at
// the reference height to keep the pixel-space glow geometry these tests
// were calibrated against.
const W = 1080;
const H = 1080;
// Centered bright block, rows/cols [BLOCK_LO, BLOCK_HI).
const BLOCK_LO = 532;
const BLOCK_HI = 548;
const CY = 540;

function makeFrame(): Uint8Array {
  const rgba = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const bright = x >= BLOCK_LO && x < BLOCK_HI && y >= BLOCK_LO && y < BLOCK_HI;
      const v = bright ? 255 : 0;
      rgba[i] = v;
      rgba[i + 1] = v;
      rgba[i + 2] = v;
      rgba[i + 3] = 255;
    }
  }
  return rgba;
}

function px(out: Uint8Array, x: number, y: number): [number, number, number] {
  const i = (y * W + x) * 4;
  return [out[i], out[i + 1], out[i + 2]];
}

describe("halation (headless sidecar)", () => {
  let renderer: HeadlessRenderer;
  let out: Uint8Array;

  beforeAll(async () => {
    renderer = await createHeadlessRenderer();
    // Blur sigma scales with frame height relative to REFERENCE_HEIGHT, so at
    // this tiny test resolution boost the radius to keep the calibrated glow
    // profile the assertions were written against.
    const radius = 4 * (REFERENCE_HEIGHT / H);
    const params = { ...HALATION_ONLY, "halation-amount": 0.5, "halation-radius": radius };
    await renderer.init(W, H, params);
    out = await renderer.renderFrame(makeFrame(), W, H, params);
  }, 30000);

  afterAll(async () => {
    await renderer.close();
  });

  const lum = (o: Uint8Array, x: number, y: number) => {
    const i = (y * W + x) * 4;
    return o[i] + o[i + 1] + o[i + 2];
  };

  it("glows warm just outside a highlight with no hue param", () => {
    const [r, g, b] = px(out, BLOCK_HI + 2, CY);
    expect(r).toBeGreaterThan(0);
    expect(r).toBeGreaterThan(b); // warm emerges from per-channel scatter, not a tint
    expect(r).toBeGreaterThanOrEqual(g);
  });

  it("red scatters wider than blue (per-channel radii)", () => {
    // Sample far out where only the widest channel still reaches.
    const far = px(out, BLOCK_HI + 7, CY);
    expect(far[0]).toBeGreaterThan(far[2]); // red persists past blue
  });

  it("rings the edge rather than filling the disk", () => {
    // Glow just outside the edge should exceed the added energy deep inside the
    // bright core (interior delta ~0 because base is already max there).
    const edge = lum(out, BLOCK_HI + 1, CY);
    const interior = lum(out, CY, CY);
    expect(edge).toBeGreaterThan(0);
    // interior is saturated white (765) from base; ring must be a distinct bright
    // band outside it, i.e. edge glow is present and non-trivial.
    expect(edge).toBeGreaterThan(30);
    expect(interior).toBe(765);
  });

  it("scatter is isotropic (H and V profiles match)", () => {
    for (let d = 1; d <= 10; d++) {
      const h = lum(out, CY + d, CY);
      const v = lum(out, CY, CY + d);
      // Output dither shifts each pixel's luma by up to ~1.5 (half an LSB
      // across three channels), so two pixels can differ by ~3 from dither
      // alone. Tight enough to still catch a real scatter asymmetry.
      expect(Math.abs(h - v)).toBeLessThanOrEqual(3);
    }
  });

  it("leaves the far field neutral (no global warm wash)", () => {
    const [r, g, b] = px(out, 1, 1);
    expect(Math.abs(r - b)).toBeLessThanOrEqual(2);
    expect(Math.abs(r - g)).toBeLessThanOrEqual(2);
  });
});

// A large near-white region (e.g. a white shirt) sits entirely above the
// halation threshold band; the scatter exceeds the core inside shading dips,
// so an unlimited additive recombine fills the dips and flattens the shading
// (reads as solarized). The soft-knee scales the added light by remaining
// per-channel headroom so near-white pixels receive almost none.
describe("halation soft-knee on near-white shading", () => {
  const SW = 512;
  const SH = 512;

  function makeShadedFrame(): Uint8Array {
    const rgba = new Uint8Array(SW * SH * 4);
    for (let y = 0; y < SH; y++) {
      for (let x = 0; x < SW; x++) {
        const i = (y * SW + x) * 4;
        const v = Math.round(240 + 13 * Math.sin(x / 8) * Math.sin(y / 6));
        rgba[i] = v;
        rgba[i + 1] = v;
        rgba[i + 2] = v;
        rgba[i + 3] = 255;
      }
    }
    return rgba;
  }

  function distinctLevels(rgba: Uint8Array): number {
    const seen = new Set<number>();
    for (let i = 0; i < rgba.length; i += 4) seen.add(rgba[i + 1]);
    return seen.size;
  }

  // Peak-to-dip shading amplitude over the interior (away from edge falloff).
  function amplitude(rgba: Uint8Array): number {
    let min = 255;
    let max = 0;
    for (let y = 100; y < SH - 100; y++) {
      for (let x = 100; x < SW - 100; x++) {
        const v = rgba[(y * SW + x) * 4 + 1];
        if (v < min) min = v;
        if (v > max) max = v;
      }
    }
    return max - min;
  }

  let renderer: HeadlessRenderer;
  let out: Uint8Array;
  let input: Uint8Array;

  beforeAll(async () => {
    renderer = await createHeadlessRenderer();
    // Radius large enough that the scatter blur spans the shading dips —
    // that's where scatter > core and the recombine fills the shading in.
    const params = {
      ...HALATION_ONLY,
      "halation-amount": 1.0,
      "halation-radius": 60,
    };
    await renderer.init(SW, SH, params);
    input = makeShadedFrame();
    out = await renderer.renderFrame(input, SW, SH, params);
  }, 30000);

  afterAll(async () => {
    await renderer.close();
  });

  it("preserves shading amplitude instead of flattening it", () => {
    // Without the soft-knee this collapses from 26 to ~14.
    expect(amplitude(out)).toBeGreaterThanOrEqual(amplitude(input) - 4);
  });

  it("preserves distinct shading levels", () => {
    // Without the soft-knee 27 input levels collapse to ~16.
    expect(distinctLevels(out)).toBeGreaterThanOrEqual(distinctLevels(input) - 5);
  });
});
