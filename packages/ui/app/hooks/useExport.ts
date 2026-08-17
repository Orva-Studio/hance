import { useCallback, useRef, useState } from "react";
import { consumeSSE } from "../lib/sse";
import type { PreviewParams } from "../gpu/renderer";

export interface ExportProgress {
  state: "idle" | "uploading" | "rendering" | "done" | "error";
  progress: number;
  downloadUrl: string | null;
  error: string | null;
}

export interface ExportOpts {
  codec: string;
  crf: number;
  outputPath: string;
}

export const EXPORT_IDLE: ExportProgress = {
  state: "idle", progress: 0, downloadUrl: null, error: null,
};

// Injectable so tests can drive the SSE transitions without a real network
// request or DOM. Defaults are the real browser implementations.
export interface ExportDeps {
  fetch: typeof fetch;
  consumeSSE: typeof consumeSSE;
  download: (url: string, filename: string) => void;
}

function browserDownload(url: string, filename: string): void {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

const defaultDeps: ExportDeps = {
  fetch: (...args) => fetch(...args),
  consumeSSE,
  download: browserDownload,
};

// Drives the export request and reports each state transition through
// setProgress (uploading → rendering → progress* → done|error). Pure apart
// from the injected fetch/download side effects, so it's unit-testable.
export async function runExport(
  file: File,
  sourcePath: string | null,
  params: PreviewParams,
  opts: ExportOpts,
  setProgress: (next: ExportProgress | ((prev: ExportProgress) => ExportProgress)) => void,
  deps: ExportDeps = defaultDeps,
  signal?: AbortSignal,
): Promise<void> {
  setProgress({ state: "uploading", progress: 0, downloadUrl: null, error: null });
  const formData = new FormData();
  // Desktop path lane: the server exports from the vetted local path in
  // place; the File is an empty stub then, so it must not be uploaded.
  if (sourcePath) {
    formData.append("sourcePath", sourcePath);
  } else {
    formData.append("file", file);
  }
  formData.append("params", JSON.stringify(params));
  formData.append("codec", opts.codec);
  formData.append("crf", String(opts.crf));
  formData.append("outputName", opts.outputPath);
  try {
    const res = await deps.fetch("/api/export", { method: "POST", body: formData, signal });
    setProgress(p => ({ ...p, state: "rendering" }));
    await deps.consumeSSE(res, {
      onProgress: (p) => setProgress(prev => ({ ...prev, progress: p })),
      onDone: (data) => {
        const url = data.downloadUrl as string;
        setProgress({ state: "done", progress: 1, downloadUrl: url, error: null });
        deps.download(url, opts.outputPath);
      },
      onError: (msg) => setProgress({ state: "error", progress: 0, downloadUrl: null, error: msg }),
    });
  } catch (err) {
    // A cancel aborts the in-flight fetch, which surfaces here as an
    // AbortError. That is the user getting what they asked for, not a failure,
    // so drop straight back to idle instead of showing an error.
    if (signal?.aborted) {
      setProgress(EXPORT_IDLE);
      return;
    }
    setProgress({ state: "error", progress: 0, downloadUrl: null, error: (err as Error).message });
  }
}

export function useExport(file: File | null, sourcePath: string | null, params: PreviewParams) {
  const [exportProgress, setExportProgress] = useState<ExportProgress>(EXPORT_IDLE);
  // Held across renders so the Cancel button can abort the render that is
  // actually in flight, not one from a superseded render pass.
  const abortRef = useRef<AbortController | null>(null);

  const startExport = useCallback(async (opts: ExportOpts) => {
    if (!file) return;
    // A second export can be started while one is in flight (the File → Export
    // menu item ignores export state). Stop the previous render rather than
    // leaving two pipelines competing for the GPU and for the same output path
    // in the temp dir, where one run's cancel would delete the other's file.
    abortRef.current?.abort();

    const controller = new AbortController();
    abortRef.current = controller;
    // Only the run that still owns abortRef may report progress or download.
    // Without this a superseded run's late `done` frame would save its file and
    // flip the bar to "Exported ✓" over the top of the run that replaced it.
    const owns = () => abortRef.current === controller;
    const setIfCurrent: typeof setExportProgress = (next) => {
      if (owns()) setExportProgress(next);
    };
    const deps: ExportDeps = {
      ...defaultDeps,
      download: (url, filename) => {
        if (owns()) defaultDeps.download(url, filename);
      },
    };

    try {
      await runExport(file, sourcePath, params, opts, setIfCurrent, deps, controller.signal);
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  }, [file, sourcePath, params]);

  // Aborting the fetch drops the SSE connection, which the server sees as a
  // request abort and uses to kill the render pipeline — so this stops the
  // actual work, not just the progress display.
  const cancelExport = useCallback(() => {
    abortRef.current?.abort();
    // Disowning the run keeps its in-flight callbacks from writing state back
    // over the idle bar or downloading a file the user just cancelled.
    abortRef.current = null;
    setExportProgress(EXPORT_IDLE);
  }, []);

  const resetExport = useCallback(() => setExportProgress(EXPORT_IDLE), []);

  return { exportProgress, startExport, cancelExport, resetExport };
}
