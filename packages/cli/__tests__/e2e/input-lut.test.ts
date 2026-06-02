import { describe, it, expect } from "bun:test";
import { createHeadlessRenderer } from "@hance/gpu";

// Drives the native wgpu sidecar (same renderer as export) with the baked
// pre-LUT shipped in the init JSON, so this exercises the real GPU pre-LUT pass.
describe("input LUT pipeline", () => {
  const width = 16;
  const height = 16;
  // Isolate the pre-LUT: disable every other effect.
  const base = {
    "no-color-settings": true,
    "no-halation": true,
    "no-aberration": true,
    "no-bloom": true,
    "no-grain": true,
    "no-vignette": true,
    "no-split-tone": true,
    "no-camera-shake": true,
  };

  // Flat V-Log middle grey frame (~code 0.4235 -> 108/255).
  function greyFrame(): Uint8Array {
    const rgba = new Uint8Array(width * height * 4);
    for (let i = 0; i < width * height; i++) {
      rgba[i * 4] = 108;
      rgba[i * 4 + 1] = 108;
      rgba[i * 4 + 2] = 108;
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

  it("vlog profile changes the image; no-input-lut passes it through", async () => {
    const vlog = await render({ ...base, "input-lut-profile": "vlog" });
    const off = await render({ ...base, "no-input-lut": true });

    // Passthrough keeps the input grey (within rounding).
    expect(Math.abs(off[0] - 108)).toBeLessThanOrEqual(2);

    // V-Log -> Rec.709 darkens mid grey noticeably and differs from passthrough.
    expect(vlog[0]).not.toBe(off[0]);
    expect(Math.abs(vlog[0] - off[0])).toBeGreaterThan(2);
  }, 30000);
});
