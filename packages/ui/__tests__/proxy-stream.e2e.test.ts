import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, existsSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { streamFragmentedMp4, proxyDonePath } from "../lib/transcode";

async function drain(stream: ReadableStream<Uint8Array>): Promise<Buffer> {
  const chunks: Uint8Array[] = [];
  const reader = stream.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

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
    const bytes = await drain(stream);

    // Fragmented mp4 contains moof boxes; faststart files lead with a single moov.
    expect(bytes.includes(Buffer.from("moof"))).toBe(true);
    expect(durationSec).toBeGreaterThan(0);
    expect(existsSync(outputPath)).toBe(true);
    expect(readdirSync(work)).toContain("proxy.mp4");
  });

  test("writes a .done marker holding the duration once the proxy completes", async () => {
    const outputPath = join(work, "done-marker.mp4");
    const { stream, durationSec } = await streamFragmentedMp4(inputPath, outputPath);
    await drain(stream);

    const done = proxyDonePath(outputPath);
    expect(existsSync(done)).toBe(true);
    expect(Number(readFileSync(done, "utf8"))).toBeCloseTo(durationSec, 5);
  });
});
