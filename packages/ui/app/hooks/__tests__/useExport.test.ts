import { describe, expect, test } from "bun:test";
import { runExport, EXPORT_IDLE, type ExportDeps, type ExportProgress } from "../useExport";
import type { SSEHandlers } from "../../lib/sse";

const file = new File(["x"], "clip.mov");
const opts = { codec: "h264", crf: 18, outputPath: "out.mp4" };

// Collects every state runExport pushes, resolving updater functions against
// the latest value the way useState would.
function tracker() {
  const states: ExportProgress[] = [];
  let current = EXPORT_IDLE;
  const set = (next: ExportProgress | ((p: ExportProgress) => ExportProgress)) => {
    current = typeof next === "function" ? next(current) : next;
    states.push(current);
  };
  return { states, set, get current() { return current; } };
}

function deps(consume: (h: SSEHandlers) => void, downloads: string[]): ExportDeps {
  return {
    fetch: async () => new Response(null) as Response,
    consumeSSE: async (_res, handlers) => { consume(handlers); },
    download: (url) => { downloads.push(url); },
  };
}

describe("runExport", () => {
  test("uploading → rendering → progress → done, and triggers download", async () => {
    const t = tracker();
    const downloads: string[] = [];
    await runExport(file, null, {}, opts, t.set, deps((h) => {
      h.onProgress?.(0.5);
      h.onDone?.({ downloadUrl: "/dl/out.mp4" });
    }, downloads));

    expect(t.states.map(s => s.state)).toEqual(["uploading", "rendering", "rendering", "done"]);
    expect(t.current.progress).toBe(1);
    expect(t.current.downloadUrl).toBe("/dl/out.mp4");
    expect(downloads).toEqual(["/dl/out.mp4"]);
  });

  test("server error event lands in error state with the message", async () => {
    const t = tracker();
    await runExport(file, null, {}, opts, t.set, deps((h) => h.onError?.("boom"), []));
    expect(t.current.state).toBe("error");
    expect(t.current.error).toBe("boom");
  });

  test("fetch rejection lands in error state", async () => {
    const t = tracker();
    const failing: ExportDeps = {
      fetch: async () => { throw new Error("offline"); },
      consumeSSE: async () => {},
      download: () => {},
    };
    await runExport(file, null, {}, opts, t.set, failing);
    expect(t.current.state).toBe("error");
    expect(t.current.error).toBe("offline");
  });
});
