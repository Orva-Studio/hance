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

const W = 64;
const H = 64;
// Centered bright block, rows/cols [BLOCK_LO, BLOCK_HI).
const BLOCK_LO = 24;
const BLOCK_HI = 40;

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
    const [r, g, b] = px(out, BLOCK_HI + 2, 32);
    expect(r).toBeGreaterThan(0);
    expect(r).toBeGreaterThan(b); // warm emerges from per-channel scatter, not a tint
    expect(r).toBeGreaterThanOrEqual(g);
  });

  it("red scatters wider than blue (per-channel radii)", () => {
    // Sample far out where only the widest channel still reaches.
    const far = px(out, BLOCK_HI + 7, 32);
    expect(far[0]).toBeGreaterThan(far[2]); // red persists past blue
  });

  it("rings the edge rather than filling the disk", () => {
    // Glow just outside the edge should exceed the added energy deep inside the
    // bright core (interior delta ~0 because base is already max there).
    const edge = lum(out, BLOCK_HI + 1, 32);
    const interior = lum(out, 32, 32);
    expect(edge).toBeGreaterThan(0);
    // interior is saturated white (765) from base; ring must be a distinct bright
    // band outside it, i.e. edge glow is present and non-trivial.
    expect(edge).toBeGreaterThan(30);
    expect(interior).toBe(765);
  });

  it("scatter is isotropic (H and V profiles match)", () => {
    for (let d = 1; d <= 10; d++) {
      const h = lum(out, Math.min(32 + d, W - 1), 32);
      const v = lum(out, 32, Math.min(32 + d, H - 1));
      expect(Math.abs(h - v)).toBeLessThanOrEqual(2);
    }
  });

  it("leaves the far field neutral (no global warm wash)", () => {
    const [r, g, b] = px(out, 1, 1);
    expect(Math.abs(r - b)).toBeLessThanOrEqual(2);
    expect(Math.abs(r - g)).toBeLessThanOrEqual(2);
  });
});
