import { describe, it, expect } from "bun:test";
import { createHeadlessRenderer } from "@hance/gpu";

// The CLI image/video path drives the same native wgpu sidecar as the export
// renderer, so this exercises the linear-light bracket headlessly (no browser).
describe("linear-light pipeline", () => {
  it("halation blooms energy into neighboring pixels", async () => {
    const width = 16;
    const height = 16;
    const params = {
      "halation-amount": 0.8,
      "halation-radius": 4,
      "no-grain": true,
      "no-camera-shake": true,
    };

    const renderer = await createHeadlessRenderer();
    try {
      await renderer.init(width, height, params);

      // Single bright white pixel in the center, everything else black.
      const rgba = new Uint8Array(width * height * 4);
      for (let i = 0; i < width * height; i++) rgba[i * 4 + 3] = 255; // A
      const center = (height / 2) * width + width / 2;
      rgba[center * 4] = 255;
      rgba[center * 4 + 1] = 255;
      rgba[center * 4 + 2] = 255;

      const out = await renderer.renderFrame(rgba, width, height, params);

      expect(out.length).toBe(width * height * 4);

      // A neighbor of the bright pixel should now carry bloomed energy.
      const neighbor = center + 1;
      const bloomed =
        out[neighbor * 4] + out[neighbor * 4 + 1] + out[neighbor * 4 + 2];
      expect(bloomed).toBeGreaterThan(0);

      // Output stays within valid 8-bit range.
      for (let i = 0; i < out.length; i++) {
        expect(out[i]).toBeGreaterThanOrEqual(0);
        expect(out[i]).toBeLessThanOrEqual(255);
      }
    } finally {
      await renderer.close();
    }
  }, 30000);
});
