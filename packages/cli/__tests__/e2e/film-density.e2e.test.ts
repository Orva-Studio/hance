import { describe, it, expect } from "bun:test";
import { createHeadlessRenderer } from "@hance/gpu";

// GPU float rounding introduces occasional +/-1 per-channel noise between
// renders of the same params (pre-existing on this driver — see the
// analogous tolerance-free flake in gpu-export.test.ts), so comparisons use a
// small tolerance rather than exact equality.
function meanAbsDiff(a: Uint8Array, b: Uint8Array): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += Math.abs(a[i] - b[i]);
  return sum / a.length;
}

describe("Film density curve (H&D)", () => {
  it("changes output vs. disabled, and repeats consistently", async () => {
    const renderer = await createHeadlessRenderer();
    const base = { "no-grain": true, "no-camera-shake": true, "no-halation": true, "no-bloom": true, "no-vignette": true, "no-aberration": true };
    const off = { ...base, "no-film-density": true };
    const on = { ...base, "film-density-preset": "vintage-fade", "film-density-amount": 1 };

    const rgba = new Uint8Array(64 * 64 * 4);
    for (let i = 0; i < 64 * 64; i++) {
      rgba[i * 4] = (i % 64) * 4;
      rgba[i * 4 + 1] = Math.floor(i / 64) * 4;
      rgba[i * 4 + 2] = 128;
      rgba[i * 4 + 3] = 255;
    }

    await renderer.init(64, 64, off);
    const resultOff = await renderer.renderFrame(rgba, 64, 64, off);

    await renderer.init(64, 64, on);
    const resultOn1 = await renderer.renderFrame(rgba, 64, 64, on);
    const resultOn2 = await renderer.renderFrame(rgba, 64, 64, on);

    expect(meanAbsDiff(resultOn1, resultOn2)).toBeLessThan(1); // repeats within GPU rounding noise
    expect(meanAbsDiff(resultOn1, resultOff)).toBeGreaterThan(5); // curve actually changes pixels

    await renderer.close();
  }, 30000);
});
