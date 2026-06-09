import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { createHeadlessRenderer, type HeadlessRenderer } from "@hance/gpu";

// Isolate grain: disable every other effect so the only thing perturbing the
// frame is the grain pass.
const GRAIN_ONLY = {
  "no-input-lut": true,
  "no-color-settings": true,
  "no-halation": true,
  "no-aberration": true,
  "no-bloom": true,
  "no-vignette": true,
  "no-split-tone": true,
  "no-camera-shake": true,
};

// Per-pixel monochrome grain, no defocus blur — keeps each pixel an independent
// sample so band variance reflects grain amplitude directly.
const GRAIN_PARAMS = {
  ...GRAIN_ONLY,
  "grain-amount": 1.0,
  "grain-size": 0,
  "grain-softness": 0,
  "grain-saturation": 0,
  "grain-defocus": 0,
};

const W = 64;
const H = 96;
// Three horizontal bands: shadow (top), midtone (middle), highlight (bottom).
const SHADOW_V = 60;
const MID_V = 128;
const HIGHLIGHT_V = 235;

function bandValue(y: number): number {
  if (y < H / 3) return SHADOW_V;
  if (y < (2 * H) / 3) return MID_V;
  return HIGHLIGHT_V;
}

function makeFrame(): Uint8Array {
  const rgba = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) {
    const v = bandValue(y);
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      rgba[i] = v;
      rgba[i + 1] = v;
      rgba[i + 2] = v;
      rgba[i + 3] = 255;
    }
  }
  return rgba;
}

// Variance of the red channel across a horizontal band [y0, y1).
function bandVariance(out: Uint8Array, y0: number, y1: number): number {
  const vals: number[] = [];
  for (let y = y0; y < y1; y++) {
    for (let x = 0; x < W; x++) {
      vals.push(out[(y * W + x) * 4]);
    }
  }
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  return vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length;
}

const SHADOW_BAND: [number, number] = [2, Math.floor(H / 3) - 2];
const MID_BAND: [number, number] = [Math.floor(H / 3) + 2, Math.floor((2 * H) / 3) - 2];
const HIGHLIGHT_BAND: [number, number] = [Math.floor((2 * H) / 3) + 2, H - 2];

describe("luminance-dependent, ISO-scaled grain (headless sidecar)", () => {
  let renderer: HeadlessRenderer;

  beforeAll(async () => {
    renderer = await createHeadlessRenderer();
    await renderer.init(W, H, GRAIN_PARAMS);
  }, 30000);

  afterAll(async () => {
    await renderer.close();
  });

  it("grains shadows more strongly than highlights", async () => {
    const out = await renderer.renderFrame(makeFrame(), W, H, GRAIN_PARAMS);
    const shadow = bandVariance(out, ...SHADOW_BAND);
    const highlight = bandVariance(out, ...HIGHLIGHT_BAND);
    expect(shadow).toBeGreaterThan(highlight);
  });

  it("renders highlights as the finest grain", async () => {
    const out = await renderer.renderFrame(makeFrame(), W, H, GRAIN_PARAMS);
    const shadow = bandVariance(out, ...SHADOW_BAND);
    const mid = bandVariance(out, ...MID_BAND);
    const highlight = bandVariance(out, ...HIGHLIGHT_BAND);
    // Highlights are the finest grain of the three tonal bands.
    expect(highlight).toBeLessThan(shadow);
    expect(highlight).toBeLessThan(mid);
  });

  it("scales grain amplitude with virtual ISO", async () => {
    const lowIso = { ...GRAIN_PARAMS, "grain-iso": 100 };
    const highIso = { ...GRAIN_PARAMS, "grain-iso": 1600 };
    const lowOut = await renderer.renderFrame(makeFrame(), W, H, lowIso);
    const highOut = await renderer.renderFrame(makeFrame(), W, H, highIso);
    // Compare on the midtone band where soft-light response is constant, so the
    // only variable is the ISO multiplier.
    const lowVar = bandVariance(lowOut, ...MID_BAND);
    const highVar = bandVariance(highOut, ...MID_BAND);
    expect(highVar).toBeGreaterThan(lowVar);
  });

  it("ISO 400 is the neutral baseline (no amplitude change)", async () => {
    const baseline = await renderer.renderFrame(makeFrame(), W, H, GRAIN_PARAMS);
    const iso400 = await renderer.renderFrame(makeFrame(), W, H, { ...GRAIN_PARAMS, "grain-iso": 400 });
    const a = bandVariance(baseline, ...MID_BAND);
    const b = bandVariance(iso400, ...MID_BAND);
    // Same effective amplitude → comparable variance (allow noise sampling slack).
    expect(Math.abs(a - b) / Math.max(a, b)).toBeLessThan(0.2);
  });
});
