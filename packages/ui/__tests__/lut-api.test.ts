import { describe, expect, test, afterAll } from "bun:test";
import { createServer } from "../server";
import { CUBE_SIZE } from "@hance/core";

// Exercises the real sidecar: /api/lut is the whole LUT export path now that
// the bake runs on the GPU rather than in the webview.
describe("POST /api/lut", () => {
  const server = createServer(0);
  const base = `http://localhost:${server.port}`;

  afterAll(() => server.stop());

  async function postLut(body: unknown) {
    return fetch(`${base}/api/lut`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  test("bakes a look into a well-formed .cube", async () => {
    const res = await postLut({
      params: { exposure: 0.4, contrast: 1.3, "white-balance": 4000 },
      title: "Warm",
    });
    expect(res.status).toBe(200);

    const lines = (await res.text()).trim().split("\n");
    expect(lines[0]).toBe('TITLE "Warm"');
    expect(lines[1]).toBe(`LUT_3D_SIZE ${CUBE_SIZE}`);

    const entries = lines.slice(5);
    expect(entries.length).toBe(CUBE_SIZE ** 3);
    for (const entry of [entries[0]!, entries.at(-1)!, entries[1000]!]) {
      const channels = entry.split(" ").map(Number);
      expect(channels.length).toBe(3);
      for (const value of channels) {
        expect(Number.isFinite(value)).toBe(true);
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1);
      }
    }
  }, 30000);

  test("a warm white balance actually warms the LUT", async () => {
    const res = await postLut({ params: { "white-balance": 4000 }, title: "Warm" });
    const entries = (await res.text()).trim().split("\n").slice(5);
    // Mid-grey: r=g=b=16 of 33 -> index 16 + 16*33 + 16*33*33.
    const mid = entries[16 + 16 * CUBE_SIZE + 16 * CUBE_SIZE * CUBE_SIZE]!
      .split(" ").map(Number);
    expect(mid[0]!).toBeGreaterThan(mid[2]!); // red above blue
  }, 30000);

  test("rejects a body with no params", async () => {
    expect((await postLut({ title: "x" })).status).toBe(400);
  });

  test("rejects a malformed body", async () => {
    const res = await fetch(`${base}/api/lut`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });
    expect(res.status).toBe(400);
  });
});
