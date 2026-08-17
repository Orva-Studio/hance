import { test, expect } from "bun:test";
import { runExport, EXPORT_IDLE, type ExportProgress, type ExportDeps } from "../app/hooks/useExport";
import type { PreviewParams } from "../app/gpu/renderer";

const params = {} as PreviewParams;
const opts = { codec: "H.264", crf: 23, outputPath: "clip_hance.mp4" };

function collect() {
  const states: ExportProgress[] = [];
  let current: ExportProgress = EXPORT_IDLE;
  return {
    states,
    set(next: ExportProgress | ((prev: ExportProgress) => ExportProgress)) {
      current = typeof next === "function" ? next(current) : next;
      states.push(current);
    },
    get last() {
      return states[states.length - 1];
    },
  };
}

test("downloads the finished file exactly once, without waiting for a click", async () => {
  const downloads: string[] = [];
  const sink = collect();
  const deps: ExportDeps = {
    fetch: (async () => new Response("")) as unknown as typeof fetch,
    consumeSSE: (async (_res, handlers) => {
      handlers.onDone?.({ downloadUrl: "/api/download?path=out.mp4" });
    }) as ExportDeps["consumeSSE"],
    download: (url) => downloads.push(url),
  };

  await runExport(new File([], "clip.mov"), null, params, opts, sink.set, deps);

  expect(downloads).toEqual(["/api/download?path=out.mp4"]);
  expect(sink.last.state).toBe("done");
});

// A cancel aborts the in-flight fetch, which throws an AbortError. The user got
// what they asked for, so the bar must return to idle rather than accusing them
// of a failed export.
test("returns to idle, not error, when the export is cancelled", async () => {
  const controller = new AbortController();
  const sink = collect();
  const deps: ExportDeps = {
    fetch: (async () => {
      controller.abort();
      throw new DOMException("The operation was aborted.", "AbortError");
    }) as unknown as typeof fetch,
    consumeSSE: (async () => {}) as ExportDeps["consumeSSE"],
    download: () => { throw new Error("must not download a cancelled export"); },
  };

  await runExport(new File([], "clip.mov"), null, params, opts, sink.set, deps, controller.signal);

  expect(sink.last).toEqual(EXPORT_IDLE);
});

// The dangerous window is after the request is accepted, while the SSE stream
// is open: a `done` frame arriving after the user cancelled must not save the
// file they just cancelled, nor flip the bar back to "Exported ✓".
test("ignores a done frame that lands after the export was cancelled", async () => {
  const controller = new AbortController();
  const downloads: string[] = [];
  const sink = collect();
  const deps: ExportDeps = {
    fetch: (async () => new Response("")) as unknown as typeof fetch,
    consumeSSE: (async (_res, handlers) => {
      // Cancel arrives mid-stream, then the server's last frame races in.
      controller.abort();
      if (controller.signal.aborted) {
        throw new DOMException("The operation was aborted.", "AbortError");
      }
      handlers.onDone?.({ downloadUrl: "/api/download?path=out.mp4" });
    }) as ExportDeps["consumeSSE"],
    download: (url) => downloads.push(url),
  };

  await runExport(new File([], "clip.mov"), null, params, opts, sink.set, deps, controller.signal);

  expect(downloads).toEqual([]);
  expect(sink.last).toEqual(EXPORT_IDLE);
});

test("still reports a genuine failure as an error", async () => {
  const sink = collect();
  const deps: ExportDeps = {
    fetch: (async () => { throw new Error("network down"); }) as unknown as typeof fetch,
    consumeSSE: (async () => {}) as ExportDeps["consumeSSE"],
    download: () => {},
  };

  await runExport(new File([], "clip.mov"), null, params, opts, sink.set, deps, new AbortController().signal);

  expect(sink.last.state).toBe("error");
  expect(sink.last.error).toBe("network down");
});
