import { describe, test, expect } from "bun:test";
import { normalizeDepth, requestReplicateDepth, type FetchImpl } from "../src/depth";

describe("normalizeDepth", () => {
  test("min–max stretches to 0–1", () => {
    const out = normalizeDepth([10, 20, 30]);
    expect(out[0]).toBeCloseTo(0, 6);
    expect(out[1]).toBeCloseTo(0.5, 6);
    expect(out[2]).toBeCloseTo(1, 6);
  });

  test("invert flips near/far", () => {
    const out = normalizeDepth([10, 20, 30], true);
    expect(out[0]).toBeCloseTo(1, 6);
    expect(out[2]).toBeCloseTo(0, 6);
  });

  test("a flat map yields all zeros (no defocus anywhere)", () => {
    const out = normalizeDepth([7, 7, 7]);
    expect(Array.from(out)).toEqual([0, 0, 0]);
  });

  test("handles 16-bit sample range without clipping", () => {
    const out = normalizeDepth([0, 65535]);
    expect(out[0]).toBe(0);
    expect(out[1]).toBe(1);
  });
});

// A scripted Replicate flow: create → poll (processing) → poll (succeeded) →
// download. Records requests so we can assert token handling and input shaping
// without touching the network (CI must never hit Replicate / pay).
function mockReplicate(imageBytes: Uint8Array) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  let polls = 0;
  const fetchImpl: FetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    calls.push({ url: u, init });
    if (init?.method === "POST") {
      return new Response(JSON.stringify({ id: "pred1", status: "processing", urls: { get: "https://api/preds/pred1" } }));
    }
    if (u === "https://api/preds/pred1") {
      polls++;
      const status = polls >= 2 ? "succeeded" : "processing";
      const output = status === "succeeded" ? "https://cdn/depth.png" : null;
      return new Response(JSON.stringify({ id: "pred1", status, output }));
    }
    if (u === "https://cdn/depth.png") {
      return new Response(imageBytes);
    }
    throw new Error(`unexpected fetch: ${u}`);
  }) as unknown as FetchImpl;
  return { fetchImpl, calls, polls: () => polls };
}

describe("requestReplicateDepth (mocked HTTP)", () => {
  test("polls until succeeded and returns the depth image bytes", async () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const { fetchImpl, calls } = mockReplicate(bytes);
    const out = await requestReplicateDepth({
      token: "r8_secret",
      imageDataUri: "data:image/png;base64,AAAA",
      version: "vtest",
      fetchImpl,
      pollIntervalMs: 0,
    });
    expect(Array.from(out)).toEqual([1, 2, 3, 4]);

    // Token rides only in the Authorization header, never in a URL/body.
    const post = calls.find((c) => c.init?.method === "POST")!;
    expect((post.init!.headers as Record<string, string>).Authorization).toBe("Bearer r8_secret");
    const body = JSON.parse(post.init!.body as string);
    expect(body.version).toBe("vtest");
    expect(body.input.encoder).toBe("vits"); // commercial-safe Small encoder
    for (const c of calls) {
      expect(c.url).not.toContain("r8_secret");
      if (typeof c.init?.body === "string") expect(c.init.body).not.toContain("r8_secret");
    }
  });

  test("throws when the prediction fails", async () => {
    const fetchImpl: FetchImpl = (async (_url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        return new Response(JSON.stringify({ id: "p", status: "failed", error: "oom" }));
      }
      throw new Error("should not poll");
    }) as unknown as FetchImpl;
    await expect(
      requestReplicateDepth({ token: "t", imageDataUri: "data:,x", fetchImpl, pollIntervalMs: 0 }),
    ).rejects.toThrow(/failed/i);
  });

  test("surfaces a non-2xx create error", async () => {
    const fetchImpl: FetchImpl = (async () =>
      new Response("nope", { status: 401 })) as unknown as FetchImpl;
    await expect(
      requestReplicateDepth({ token: "t", imageDataUri: "data:,x", fetchImpl, pollIntervalMs: 0 }),
    ).rejects.toThrow(/401/);
  });
});
