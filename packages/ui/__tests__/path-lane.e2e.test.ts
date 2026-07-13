import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer, allowFilePath } from "../server";

// Desktop path lane: media opened by absolute path is served (with Range),
// transcoded, and exported directly from disk — never uploaded or copied.

const work = mkdtempSync(join(tmpdir(), "hance-path-lane-"));
const clipPath = join(work, "clip.mov");

async function drain(res: Response): Promise<void> {
  await res.arrayBuffer();
}

describe("path lane e2e", () => {
  let server: ReturnType<typeof createServer>;
  let base: string;

  beforeAll(async () => {
    // 1s ProRes clip: the case the browser can't decode natively.
    const gen = Bun.spawn([
      "ffmpeg", "-y",
      "-f", "lavfi", "-i", "testsrc=size=320x240:rate=30:duration=1",
      "-c:v", "prores_ks", "-pix_fmt", "yuv422p10le",
      clipPath,
    ], { stdout: "ignore", stderr: "ignore" });
    await gen.exited;
    server = createServer(0);
    base = `http://localhost:${server.port}`;
  });

  afterAll(() => {
    server.stop();
    rmSync(work, { recursive: true, force: true });
  });

  test("POST /api/proxy/from-path rejects invalid JSON", async () => {
    const res = await fetch(`${base}/api/proxy/from-path`, { method: "POST", body: "nope" });
    expect(res.status).toBe(400);
  });

  test("POST /api/proxy/from-path rejects unvetted paths", async () => {
    const res = await fetch(`${base}/api/proxy/from-path`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: clipPath }),
    });
    expect(res.status).toBe(404);
  });

  test("POST /api/export rejects unvetted sourcePath", async () => {
    const formData = new FormData();
    formData.append("sourcePath", join(work, "not-vetted.mov"));
    formData.append("params", "{}");
    const res = await fetch(`${base}/api/export`, { method: "POST", body: formData });
    expect(res.status).toBe(404);
  });

  test("GET /api/local-file serves vetted files with Range support", async () => {
    const textPath = join(work, "small.mov");
    writeFileSync(textPath, "abcdefghij");
    allowFilePath(textPath);
    const res = await fetch(`${base}/api/local-file?path=${encodeURIComponent(textPath)}`, {
      headers: { Range: "bytes=2-4" },
    });
    expect(res.status).toBe(206);
    expect(res.headers.get("Content-Range")).toBe("bytes 2-4/10");
    expect(await res.text()).toBe("cde");
  });

  test("POST /api/proxy/from-path transcodes in place and caches", async () => {
    allowFilePath(clipPath);
    const first = await fetch(`${base}/api/proxy/from-path`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: clipPath }),
    });
    expect(first.status).toBe(200);
    expect(first.headers.get("Content-Type")).toBe("video/mp4");
    expect(Number(first.headers.get("X-Proxy-Duration"))).toBeGreaterThan(0);
    const proxyPath = first.headers.get("X-Proxy-Path")!;
    await drain(first);
    // The source must never be treated as an uploaded temp copy and deleted.
    expect(existsSync(clipPath)).toBe(true);
    expect(existsSync(proxyPath)).toBe(true);

    const second = await fetch(`${base}/api/proxy/from-path`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: clipPath }),
    });
    expect(second.status).toBe(200);
    expect(second.headers.get("X-Proxy-Cached")).toBe("1");
    await drain(second);
  }, 30000);
});
