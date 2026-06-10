import { describe, it, expect } from "bun:test";
import { createHeadlessRenderer } from "@hance/gpu";

// Drives the native wgpu sidecar (same renderer as export) through the real
// color-wheels pass, so a non-neutral lift/gamma/gain push must change the
// output and the neutral defaults must pass the frame through untouched.
describe("color wheels pipeline", () => {
  const width = 16;
  const height = 16;
  // Isolate the color wheels: disable every other effect.
  const base = {
    "no-input-lut": true,
    "no-color-settings": true,
    "no-halation": true,
    "no-aberration": true,
    "no-bloom": true,
    "no-grain": true,
    "no-vignette": true,
    "no-split-tone": true,
    "no-camera-shake": true,
  };

  // Flat mid-grey frame so a per-channel lift is visible on every pixel.
  function greyFrame(): Uint8Array {
    const rgba = new Uint8Array(width * height * 4);
    for (let i = 0; i < width * height; i++) {
      rgba[i * 4] = 128;
      rgba[i * 4 + 1] = 128;
      rgba[i * 4 + 2] = 128;
      rgba[i * 4 + 3] = 255;
    }
    return rgba;
  }

  async function render(params: Record<string, unknown>): Promise<Uint8Array> {
    const renderer = await createHeadlessRenderer();
    try {
      await renderer.init(width, height, params);
      return await renderer.renderFrame(greyFrame(), width, height, params);
    } finally {
      await renderer.close();
    }
  }

  it("neutral wheels pass the frame through; a warm lift shifts the balance", async () => {
    const neutral = await render({ ...base });
    // Lift the red channel up and the blue channel down: a warm shadow push.
    const warm = await render({ ...base, "lift-r": 0.15, "lift-b": -0.15 });

    // Neutral defaults are a no-op (within rounding).
    expect(Math.abs(neutral[0] - 128)).toBeLessThanOrEqual(2);
    expect(Math.abs(neutral[2] - 128)).toBeLessThanOrEqual(2);

    // The warm lift raises red and lowers blue relative to neutral.
    expect(warm[0]).toBeGreaterThan(neutral[0] + 2);
    expect(warm[2]).toBeLessThan(neutral[2] - 2);
  }, 30000);

  it("disabling color wheels ignores non-neutral values", async () => {
    const off = await render({ ...base, "no-color-wheels": true, "lift-r": 0.15, "lift-b": -0.15 });

    // With the pass disabled the warm lift has no effect.
    expect(Math.abs(off[0] - 128)).toBeLessThanOrEqual(2);
    expect(Math.abs(off[2] - 128)).toBeLessThanOrEqual(2);
  }, 30000);
});
