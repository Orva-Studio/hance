import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { createServer, allowFilePath } from "../server";

// Point recents storage at a temp dir so tests never touch ~/.hance.
const fakeHome = mkdtempSync(join(tmpdir(), "hance-recents-"));
const originalRecentsPath = process.env.HANCE_RECENTS_PATH;

describe("recents & pick-file API", () => {
  let server: ReturnType<typeof createServer>;
  let base: string;
  const mediaPath = join(fakeHome, "clip.mp4");

  beforeAll(() => {
    process.env.HANCE_RECENTS_PATH = join(fakeHome, "recents.json");
    writeFileSync(mediaPath, "fake video bytes");
    server = createServer(0, undefined, undefined, {
      pickFile: async () => mediaPath,
    });
    base = `http://localhost:${server.port}`;
  });

  afterAll(() => {
    server.stop();
    if (originalRecentsPath === undefined) delete process.env.HANCE_RECENTS_PATH;
    else process.env.HANCE_RECENTS_PATH = originalRecentsPath;
    rmSync(fakeHome, { recursive: true, force: true });
  });

  test("GET /api/recents starts empty", async () => {
    const res = await fetch(`${base}/api/recents`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  test("POST /api/recents rejects paths never vetted", async () => {
    const res = await fetch(`${base}/api/recents`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: "/etc/passwd", name: "passwd" }),
    });
    expect(res.status).toBe(403);
  });

  test("POST /api/pick-file returns the picked path and vets it", async () => {
    const res = await fetch(`${base}/api/pick-file`, { method: "POST" });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.path).toBe(mediaPath);
    expect(data.name).toBe("clip.mp4");

    const fileRes = await fetch(`${base}/api/local-file?path=${encodeURIComponent(mediaPath)}`);
    expect(fileRes.status).toBe(200);
    expect(await fileRes.text()).toBe("fake video bytes");
  });

  test("POST /api/recents accepts a vetted path and lists it", async () => {
    const res = await fetch(`${base}/api/recents`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: mediaPath, name: "clip.mp4", thumbnail: "data:image/jpeg;base64,abc" }),
    });
    expect(res.status).toBe(200);

    const list = await (await fetch(`${base}/api/recents`)).json();
    expect(list.length).toBe(1);
    expect(list[0].path).toBe(mediaPath);
    expect(list[0].thumbnail).toBe("data:image/jpeg;base64,abc");
    expect(typeof list[0].openedAt).toBe("number");
  });

  test("GET /api/recents filters entries whose file is gone", async () => {
    const gonePath = join(fakeHome, "gone.mp4");
    writeFileSync(gonePath, "x");
    allowFilePath(gonePath);
    await fetch(`${base}/api/recents`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: gonePath, name: "gone.mp4" }),
    });
    rmSync(gonePath);
    const list = await (await fetch(`${base}/api/recents`)).json();
    expect(list.map((e: { name: string }) => e.name)).toEqual(["clip.mp4"]);
  });
});

describe("pick-file without a hook", () => {
  test("404s so the UI falls back to the browser input", async () => {
    const server = createServer(0);
    const res = await fetch(`http://localhost:${server.port}/api/pick-file`, { method: "POST" });
    expect(res.status).toBe(404);
    server.stop();
  });
});
