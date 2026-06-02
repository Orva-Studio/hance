import { describe, expect, test, afterAll } from "bun:test";
import { createServer, setInitialFile } from "../server";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { writeFileSync, unlinkSync } from "node:fs";

describe("API server", () => {
  const server = createServer(0);
  const base = `http://localhost:${server.port}`;

  afterAll(() => server.stop());

  test("GET /api/schema returns effect schema", async () => {
    const res = await fetch(`${base}/api/schema`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
    expect(data[0].key).toBe("inputLut");
  });

  test("GET /api/looks lists available looks", async () => {
    const res = await fetch(`${base}/api/looks`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).not.toContain("default");
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThan(0);
  });

  test("GET /api/look?name=default returns look data", async () => {
    const res = await fetch(`${base}/api/look?name=default`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data["exposure"]).toBe(0);
  });

  test("POST then GET /api/look round-trips a top-level preLut field", async () => {
    const name = `hance-prelut-test-${Date.now()}`;
    const post = await fetch(`${base}/api/looks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, data: { exposure: 0.2 }, preLut: "vlog" }),
    });
    expect(post.status).toBe(200);
    try {
      const res = await fetch(`${base}/api/look?name=${name}`);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data["exposure"]).toBe(0.2);
      expect(data["preLut"]).toBe("vlog");
    } finally {
      await fetch(`${base}/api/look?name=${name}`, { method: "DELETE" });
    }
  });

  test("GET /api/initial-file returns 404 when no file set", async () => {
    setInitialFile(null);
    const res = await fetch(`${base}/api/initial-file`);
    expect(res.status).toBe(404);
  });

  test("GET /api/initial-file serves file bytes with X-Filename", async () => {
    const filePath = join(tmpdir(), `hance-initial-test-${Date.now()}.mp4`);
    const contents = new Uint8Array([1, 2, 3, 4, 5]);
    writeFileSync(filePath, contents);
    setInitialFile(filePath);
    try {
      const res = await fetch(`${base}/api/initial-file`);
      expect(res.status).toBe(200);
      const name = decodeURIComponent(res.headers.get("X-Filename") || "");
      expect(name).toBe(filePath.split("/").pop());
      expect(res.headers.get("Content-Type")).toContain("video/mp4");
      const bytes = new Uint8Array(await res.arrayBuffer());
      expect(Array.from(bytes)).toEqual([1, 2, 3, 4, 5]);
    } finally {
      setInitialFile(null);
      try { unlinkSync(filePath); } catch {}
    }
  });
});
