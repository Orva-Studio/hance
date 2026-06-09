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

// Mean absolute difference between horizontally adjacent pixels in a band —
// low for coarse (spatially correlated) grain, high for fine per-pixel grain.
function meanAdjacentDiff(out: Uint8Array, y0: number, y1: number): number {
  let total = 0;
  let n = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = 0; x < W - 1; x++) {
      total += Math.abs(out[(y * W + x) * 4] - out[(y * W + x + 1) * 4]);
      n++;
    }
  }
  return total / n;
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

  // The sidecar bakes params at init() — renderFrame() ignores its params arg —
  // so each distinct param set needs its own renderer. A fresh renderer always
  // starts at frame 1, so two of them produce the same noise field and differ
  // only by the param under test.
  async function renderOnce(params: Record<string, unknown>): Promise<Uint8Array> {
    const r = await createHeadlessRenderer();
    await r.init(W, H, params);
    const out = await r.renderFrame(makeFrame(), W, H, params);
    await r.close();
    return out;
  }

  it("renders coarser grain at larger size", async () => {
    // Coarser grain spans multiple pixels per noise cell, so horizontally
    // adjacent pixels are more similar (smaller mean adjacent difference) than
    // fine, per-pixel grain.
    const fine = await renderOnce({ ...GRAIN_PARAMS, "grain-size": 0 });
    const coarse = await renderOnce({ ...GRAIN_PARAMS, "grain-size": 4 });
    expect(meanAdjacentDiff(coarse, ...MID_BAND)).toBeLessThan(meanAdjacentDiff(fine, ...MID_BAND));
  }, 30000);

  it("scales grain amplitude with virtual ISO", async () => {
    const lowOut = await renderOnce({ ...GRAIN_PARAMS, "grain-amount": 0.25, "grain-iso": 100 });
    const highOut = await renderOnce({ ...GRAIN_PARAMS, "grain-amount": 0.25, "grain-iso": 800 });
    // grain-amount 0.25 keeps effAmount (amount * iso/400) below the clamp at
    // both ISOs, so the midtone variance reflects the ISO multiplier directly.
    const lowVar = bandVariance(lowOut, ...MID_BAND);
    const highVar = bandVariance(highOut, ...MID_BAND);
    expect(highVar).toBeGreaterThan(lowVar * 1.5);
  }, 30000);

  it("ISO 400 is the neutral baseline (no amplitude change)", async () => {
    const baseline = await renderOnce(GRAIN_PARAMS);
    const iso400 = await renderOnce({ ...GRAIN_PARAMS, "grain-iso": 400 });
    const a = bandVariance(baseline, ...MID_BAND);
    const b = bandVariance(iso400, ...MID_BAND);
    // Identical effective amplitude and noise field → identical variance.
    expect(Math.abs(a - b) / Math.max(a, b)).toBeLessThan(0.05);
  }, 30000);

  it("boils in place rather than sliding diagonally between frames", async () => {
    // Two consecutive frames (the renderer increments its frame counter each
    // call). Sliding grain would make frame N+1 a one-cell diagonal shift of
    // frame N, i.e. frame1[x,y] ~= frame0[x+1,y+1]. Boiling grain decorrelates.
    const f0 = await renderer.renderFrame(makeFrame(), W, H, GRAIN_PARAMS);
    const f1 = await renderer.renderFrame(makeFrame(), W, H, GRAIN_PARAMS);
    const [y0, y1] = MID_BAND;
    const a: number[] = []; // frame1[x,y]
    const b: number[] = []; // frame0[x+1,y+1]
    for (let y = y0; y < y1 - 1; y++) {
      for (let x = 1; x < W - 1; x++) {
        a.push(f1[(y * W + x) * 4]);
        b.push(f0[((y + 1) * W + (x + 1)) * 4]);
      }
    }
    expect(Math.abs(pearson(a, b))).toBeLessThan(0.5);
  });
});

function pearson(a: number[], b: number[]): number {
  const n = a.length;
  const ma = a.reduce((s, v) => s + v, 0) / n;
  const mb = b.reduce((s, v) => s + v, 0) / n;
  let cov = 0, va = 0, vb = 0;
  for (let i = 0; i < n; i++) {
    const da = a[i] - ma;
    const db = b[i] - mb;
    cov += da * db;
    va += da * da;
    vb += db * db;
  }
  return cov / Math.sqrt(va * vb);
}
