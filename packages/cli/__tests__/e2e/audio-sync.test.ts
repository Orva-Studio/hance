import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { existsSync, unlinkSync } from "node:fs";
import path from "node:path";

const FIXTURES_DIR = path.join(import.meta.dir, "fixtures");
const CLI_PATH = path.join(import.meta.dir, "../../src/cli.ts");
const INPUT = path.join(FIXTURES_DIR, "test_with_audio.mp4");
const OUTPUT = path.join(FIXTURES_DIR, "test_with_audio_hanced.mp4");

async function probeStream(file: string, streamSelector: string, field: "start_time" | "duration"): Promise<number> {
  const proc = Bun.spawn(
    ["ffprobe", "-v", "error", "-select_streams", streamSelector,
      "-show_entries", `stream=${field}`, "-of", "default=nw=1:nk=1", file],
    { stdout: "pipe", stderr: "pipe" },
  );
  const out = (await new Response(proc.stdout).text()).trim();
  await proc.exited;
  const n = parseFloat(out);
  if (!Number.isFinite(n)) {
    throw new Error(`ffprobe returned non-numeric ${field} for ${streamSelector}: ${JSON.stringify(out)}`);
  }
  return n;
}

describe("e2e: audio/video sync", () => {
  beforeAll(async () => {
    if (!existsSync(INPUT)) {
      const proc = Bun.spawn(["bash", path.join(FIXTURES_DIR, "generate-fixtures.sh")], {
        stdout: "pipe", stderr: "pipe",
      });
      const stderr = await new Response(proc.stderr).text();
      const exitCode = await proc.exited;
      if (exitCode !== 0) throw new Error(`generate-fixtures.sh failed (exit ${exitCode}): ${stderr}`);
    }
  });

  afterAll(() => {
    if (existsSync(OUTPUT)) unlinkSync(OUTPUT);
  });

  it("video and audio streams start at aligned PTS (no drift)", async () => {
    if (existsSync(OUTPUT)) unlinkSync(OUTPUT);
    const proc = Bun.spawn(
      ["bun", "run", CLI_PATH, INPUT, "-o", OUTPUT, "--no-grain", "--no-camera-shake"],
      { stdout: "pipe", stderr: "pipe" },
    );
    const stderr = await new Response(proc.stderr).text();
    const exitCode = await proc.exited;
    if (exitCode !== 0) console.error("hance stderr:", stderr);
    expect(exitCode).toBe(0);
    expect(existsSync(OUTPUT)).toBe(true);

    const videoStart = await probeStream(OUTPUT, "v:0", "start_time");
    const audioStart = await probeStream(OUTPUT, "a:0", "start_time");
    expect(Math.abs(videoStart - audioStart)).toBeLessThan(0.01);

    // A previous fix re-encoded audio with `aresample=async=1:first_pts=0`,
    // which decoded the source's AAC priming samples (~2112 samples / ~48ms)
    // into PCM and re-encoded them as audible content — making output audio
    // longer than source. `-c:a copy` preserves the edit list so priming is
    // skipped on playback. Assert output audio duration matches source.
    const srcAudioDuration = await probeStream(INPUT, "a:0", "duration");
    const outAudioDuration = await probeStream(OUTPUT, "a:0", "duration");
    expect(Math.abs(outAudioDuration - srcAudioDuration)).toBeLessThan(0.005);
  }, 60000);
});
