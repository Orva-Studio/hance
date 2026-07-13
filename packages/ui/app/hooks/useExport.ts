import { useCallback, useState } from "react";
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
    const res = await deps.fetch("/api/export", { method: "POST", body: formData });
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
    setProgress({ state: "error", progress: 0, downloadUrl: null, error: (err as Error).message });
  }
}

export function useExport(file: File | null, sourcePath: string | null, params: PreviewParams) {
  const [exportProgress, setExportProgress] = useState<ExportProgress>(EXPORT_IDLE);

  const startExport = useCallback(async (opts: ExportOpts) => {
    if (!file) return;
    await runExport(file, sourcePath, params, opts, setExportProgress);
  }, [file, sourcePath, params]);

  const resetExport = useCallback(() => setExportProgress(EXPORT_IDLE), []);

  return { exportProgress, startExport, resetExport };
}
