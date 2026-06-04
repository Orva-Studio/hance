import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { streamFragmentedMp4 } from "../lib/transcode";

const work = mkdtempSync(join(tmpdir(), "hance-proxy-e2e-"));
const inputPath = join(work, "in.mov");

beforeAll(async () => {
  // 1s ProRes test clip so the browser-undecodable path is exercised.
  const gen = Bun.spawn([
    "ffmpeg", "-y",
    "-f", "lavfi", "-i", "testsrc=size=320x240:rate=30:duration=1",
    "-c:v", "prores_ks", "-pix_fmt", "yuv422p10le",
    inputPath,
  ], { stdout: "ignore", stderr: "ignore" });
  await gen.exited;
});

describe("streamFragmentedMp4", () => {
  test("streams fragmented mp4 bytes and writes the proxy to disk", async () => {
    const outputPath = join(work, "proxy.mp4");
    const { stream, durationSec } = await streamFragmentedMp4(inputPath, outputPath);

    const chunks: Uint8Array[] = [];
    const reader = stream.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
    const bytes = Buffer.concat(chunks);

    // Fragmented mp4 contains moof boxes; faststart files lead with a single moov.
    expect(bytes.includes(Buffer.from("moof"))).toBe(true);
    expect(durationSec).toBeGreaterThan(0);
    expect(existsSync(outputPath)).toBe(true);
    expect(readdirSync(work)).toContain("proxy.mp4");
  });
});
