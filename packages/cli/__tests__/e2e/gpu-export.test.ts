import { describe, it, expect } from "bun:test";
import { createHeadlessRenderer } from "@hance/gpu";

const WIDTH = 100;
const HEIGHT = 100;
const PARAMS = { "halation-amount": 0.3, "halation-radius": 10, "no-grain": true, "no-camera-shake": true };

function makeGradientFrame(): Uint8Array {
  const rgba = new Uint8Array(WIDTH * HEIGHT * 4);
  for (let i = 0; i < WIDTH * HEIGHT; i++) {
    rgba[i * 4] = (i % WIDTH) * 2.55;              // R gradient
    rgba[i * 4 + 1] = Math.floor(i / WIDTH) * 2.55; // G gradient
    rgba[i * 4 + 2] = 128;                          // B constant
    rgba[i * 4 + 3] = 255;                          // A
  }
  return rgba;
}

// Renders the first frame of a fresh renderer. Frame position matters: the
// blit dither is seeded from the frame counter on purpose (renderer.rs), so
// only frames at the same index are comparable.
async function renderFirstFrame(rgba: Uint8Array): Promise<Uint8Array> {
  const renderer = await createHeadlessRenderer();
  await renderer.init(WIDTH, HEIGHT, PARAMS);
  try {
    return await renderer.renderFrame(rgba, WIDTH, HEIGHT, PARAMS);
  } finally {
    await renderer.close();
  }
}

describe("GPU export parity", () => {
  // Reproducible exports: the same input and params must render the same bytes
  // in a separate process, not merely twice inside one. Two frames from one
  // renderer would differ by design — the dither decorrelates across frames.
  it("renders identical output across separate renderer runs", async () => {
    const rgba = makeGradientFrame();

    const first = await renderFirstFrame(rgba);
    const second = await renderFirstFrame(rgba);

    expect(first).toEqual(second);
  }, 60000);

  // Guards the intent of the frame-seeded dither: if this ever passes, the
  // dither has stopped varying and will sit frozen on top of the video.
  it("varies the dither between consecutive frames", async () => {
    const rgba = makeGradientFrame();
    const renderer = await createHeadlessRenderer();
    await renderer.init(WIDTH, HEIGHT, PARAMS);
    try {
      const frame1 = await renderer.renderFrame(rgba, WIDTH, HEIGHT, PARAMS);
      const frame2 = await renderer.renderFrame(rgba, WIDTH, HEIGHT, PARAMS);

      expect(frame1).not.toEqual(frame2);
      // Dither only ever nudges the low bit; anything larger is a real
      // non-determinism bug wearing the dither's clothes.
      let maxDelta = 0;
      for (let i = 0; i < frame1.length; i++) {
        maxDelta = Math.max(maxDelta, Math.abs(frame1[i]! - frame2[i]!));
      }
      expect(maxDelta).toBeLessThanOrEqual(1);
    } finally {
      await renderer.close();
    }
  }, 60000);
});
