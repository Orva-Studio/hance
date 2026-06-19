import { describe, it, expect, afterAll } from "bun:test";
import { createHeadlessRenderer, type HeadlessRenderer } from "@hance/gpu";
import type { DepthMap } from "@hance/core";

// DoF through the real GPU sidecar, driven by a synthetic depth map so the
// suite never touches Replicate. Scene: vertical stripes everywhere (edges to
// blur). Depth: left half near (1), right half far (0). Focus on the near plane
// → the left half must stay sharp, the right half must blur.
const W = 128;
const H = 256;
const STRIPE = 8; // px period

// Every other effect off so the only thing changing pixels is the bokeh pass.
const DOF_ONLY = {
  "no-input-lut": true, "no-color-settings": true, "no-halation": true,
  "no-aberration": true, "no-bloom": true, "no-grain": true, "no-vignette": true,
  "no-split-tone": true, "no-color-wheels": true, "no-camera-shake": true,
};

function makeStripes(): Uint8Array {
  const rgba = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const v = Math.floor(x / STRIPE) % 2 === 0 ? 255 : 0;
      rgba[i] = v; rgba[i + 1] = v; rgba[i + 2] = v; rgba[i + 3] = 255;
    }
  }
  return rgba;
}

// Left half near (depth 1), right half far (depth 0).
function makeSplitDepth(): DepthMap {
  const data = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      data[y * W + x] = x < W / 2 ? 1 : 0;
    }
  }
  return { width: W, height: H, data };
}

// Variance of the red channel over a region — high for sharp stripes, low once
// the blur averages neighbouring stripes toward mid-grey.
function regionVariance(out: Uint8Array, x0: number, x1: number): number {
  const vals: number[] = [];
  for (let y = 64; y < H - 64; y++) {
    for (let x = x0; x < x1; x++) vals.push(out[(y * W + x) * 4]);
  }
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  return vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length;
}

const LEFT = [24, 48] as const;   // near / in-focus, away from the x=64 seam
const RIGHT = [80, 104] as const; // far / out-of-focus

describe("depth-of-field (headless sidecar)", () => {
  const renderers: HeadlessRenderer[] = [];
  async function render(params: Record<string, unknown>, depth?: DepthMap): Promise<Uint8Array> {
    const r = await createHeadlessRenderer();
    renderers.push(r);
    await r.init(W, H, params, depth);
    return r.renderFrame(makeStripes(), W, H, params);
  }

  afterAll(async () => {
    await Promise.all(renderers.map((r) => r.close()));
  });

  it("blurs the out-of-focus plane but keeps the focus plane sharp", async () => {
    const params = { ...DOF_ONLY, "dof-amount": 1, focus: 1, "dof-max-blur": 40 };
    const out = await render(params, makeSplitDepth());

    const left = regionVariance(out, LEFT[0], LEFT[1]);
    const right = regionVariance(out, RIGHT[0], RIGHT[1]);

    expect(left).toBeGreaterThan(4000); // stripes still crisp on the focus plane
    expect(right).toBeLessThan(left / 4); // far plane clearly softened
  }, 30000);

  it("differs from a no-DoF render (amount 0 is a passthrough)", async () => {
    const dof = await render({ ...DOF_ONLY, "dof-amount": 1, focus: 1, "dof-max-blur": 40 }, makeSplitDepth());
    const none = await render({ ...DOF_ONLY, "dof-amount": 0, focus: 1 }, makeSplitDepth());

    // Focus plane (left) matches; far plane (right) was changed by the blur.
    expect(regionVariance(none, RIGHT[0], RIGHT[1])).toBeGreaterThan(4000);
    let maxDiff = 0;
    for (let y = 64; y < H - 64; y++) {
      for (let x = RIGHT[0]; x < RIGHT[1]; x++) {
        const i = (y * W + x) * 4;
        maxDiff = Math.max(maxDiff, Math.abs(dof[i] - none[i]));
      }
    }
    expect(maxDiff).toBeGreaterThan(20);
  }, 30000);

  it("is a true passthrough when no depth map is supplied", async () => {
    // Even with amount > 0, without depth the offline path is unchanged.
    const out = await render({ ...DOF_ONLY, "dof-amount": 1, focus: 1 });
    expect(regionVariance(out, RIGHT[0], RIGHT[1])).toBeGreaterThan(4000);
  }, 30000);
});
