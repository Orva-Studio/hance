import { describe, test, expect } from "bun:test";
import { consumeSSE } from "../app/lib/sse";

function sseResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      for (const c of chunks) controller.enqueue(encoder.encode(c));
      controller.close();
    },
  });
  return new Response(stream, { status: 200 });
}

describe("consumeSSE", () => {
  test("parses progress, done, and error frames", async () => {
    const progress: number[] = [];
    let doneData: Record<string, unknown> | null = null;
    let errorMsg: string | null = null;

    await consumeSSE(
      sseResponse([
        `data: ${JSON.stringify({ progress: 0.25 })}\n\n`,
        `data: ${JSON.stringify({ progress: 0.75 })}\n\n`,
        `data: ${JSON.stringify({ done: true, proxyUrl: "/x" })}\n\n`,
      ]),
      {
        onProgress: (r) => progress.push(r),
        onDone: (d) => { doneData = d; },
        onError: (m) => { errorMsg = m; },
      },
    );

    expect(progress).toEqual([0.25, 0.75]);
    expect(doneData).toEqual({ done: true, proxyUrl: "/x" });
    expect(errorMsg).toBeNull();
  });

  test("reassembles frames split across chunks", async () => {
    const progress: number[] = [];
    const payload = `data: ${JSON.stringify({ progress: 0.5 })}\n\n`;
    const split = Math.floor(payload.length / 2);

    await consumeSSE(
      sseResponse([payload.slice(0, split), payload.slice(split)]),
      { onProgress: (r) => progress.push(r) },
    );

    expect(progress).toEqual([0.5]);
  });

  test("surfaces server error frame", async () => {
    let errorMsg: string | null = null;
    await consumeSSE(
      sseResponse([`data: ${JSON.stringify({ error: "ffmpeg failed" })}\n\n`]),
      { onError: (m) => { errorMsg = m; } },
    );
    expect(errorMsg).toBe("ffmpeg failed");
  });

  test("routes malformed JSON to onError and continues", async () => {
    const progress: number[] = [];
    const errors: string[] = [];
    await consumeSSE(
      sseResponse([
        `data: {not json\n\n`,
        `data: ${JSON.stringify({ progress: 0.5 })}\n\n`,
      ]),
      {
        onProgress: (r) => progress.push(r),
        onError: (m) => errors.push(m),
      },
    );
    expect(errors.length).toBe(1);
    expect(progress).toEqual([0.5]);
  });

  test("invokes onError when response is not ok", async () => {
    let errorMsg: string | null = null;
    await consumeSSE(
      new Response("bad", { status: 500 }),
      { onError: (m) => { errorMsg = m; } },
    );
    expect(errorMsg).not.toBeNull();
  });
});
