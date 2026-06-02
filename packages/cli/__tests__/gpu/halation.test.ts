import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { createHeadlessRenderer, type HeadlessRenderer } from "@hance/gpu";

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
    const params = { ...HALATION_ONLY, "halation-amount": 0.5 };
    await renderer.init(W, H, params);
    out = await renderer.renderFrame(makeFrame(), W, H, params);
  }, 30000);

  afterAll(async () => {
    await renderer.close();
  });

  it("glows warm just outside a highlight (red > blue)", () => {
    // A few px to the right of the block's right edge, vertically centered.
    const [r, g, b] = px(out, BLOCK_HI + 2, 32);
    expect(r).toBeGreaterThan(0); // glow reaches here at all
    expect(r).toBeGreaterThan(b); // warm, not cold/cyan
    expect(r).toBeGreaterThanOrEqual(g);
  });

  it("leaves the far field neutral (no global warm wash)", () => {
    // Far corner, well outside any glow radius.
    const [r, g, b] = px(out, 1, 1);
    expect(Math.abs(r - b)).toBeLessThanOrEqual(2);
    expect(Math.abs(r - g)).toBeLessThanOrEqual(2);
  });
});
