import type { Renderer } from "../gpu/renderer";
import { SaveBar } from "./SaveBar";
import { isDesktop } from "../lib/isDesktop";

type ExportState = "idle" | "uploading" | "rendering" | "done" | "error";

interface ExportProgress {
  state: ExportState;
  progress: number;
  downloadUrl: string | null;
  error: string | null;
}

interface Props {
  filename: string | null;
  file: File | null;
  params: Record<string, string | number | boolean>;
  renderer: Renderer | null;
  isVideo: boolean;
  hasChanges: boolean;
  onSave: () => void;
  onSaveAsNew: () => void;
  onExportClick: () => void;
  onHome?: () => void;
  exportProgress?: ExportProgress;
  onExportDone?: () => void;
}

export function TopBar({
  filename, file, renderer, isVideo,
  hasChanges, onSave, onSaveAsNew, onExportClick, onHome,
  exportProgress, onExportDone,
}: Props) {
  const state: ExportState = exportProgress?.state ?? "idle";
  const progress = exportProgress?.progress ?? 0;
  const downloadUrl = exportProgress?.downloadUrl ?? null;
  const error = exportProgress?.error ?? null;

  async function downloadImage() {
    if (!renderer) return;
    try {
      const { pixels: rgba, width: w, height: h } = await renderer.exportImage();
      if (rgba.length === 0) return;
      const offscreen = new OffscreenCanvas(w, h);
      const ctx = offscreen.getContext("2d")!;
      const imageData = new ImageData(new Uint8ClampedArray(rgba.buffer), w, h);
      ctx.putImageData(imageData, 0, 0);
      const blob = await offscreen.convertToBlob({ type: "image/png" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = file!.name.replace(/\.[^.]+$/, "_hanced.png");
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Image export failed.");
    }
  }

  // In the desktop shell (hiddenInset titlebar) the bar doubles as the window
  // titlebar: Slack-height, left padding clears the traffic lights, and empty
  // areas drag the window (electrobun's preload watches these class names).
  return (
    <div
      className={`flex items-center justify-between border-b border-zinc-800 bg-zinc-900 ${
        isDesktop
          ? "h-[38px] pl-[84px] pr-3 electrobun-webkit-app-region-drag"
          : "px-4 py-2.5"
      }`}
    >
      <span className="text-xs text-zinc-300 truncate max-w-xs">
        {filename || ""}
      </span>

      <span />

      <div className="flex items-center gap-2 electrobun-webkit-app-region-no-drag">
        {file && (
          <SaveBar hasChanges={hasChanges} onSave={onSave} onSaveAsNew={onSaveAsNew} />
        )}

        {state === "idle" && file && (
          <button
            onClick={isVideo ? onExportClick : downloadImage}
            className="px-4 py-1.5 bg-accent text-white text-xs font-medium rounded-sm hover:bg-accent-hover transition-colors"
          >
            {isVideo ? "Export" : "Download"}
          </button>
        )}

        {(state === "uploading" || state === "rendering") && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-400">
              {state === "uploading" ? "Uploading..." : `${Math.round(progress * 100)}%`}
            </span>
            <div className="w-24 h-1.5 bg-zinc-700 overflow-hidden rounded-sm">
              <div
                className="h-full bg-accent transition-[width] duration-200"
                style={{ width: `${progress * 100}%` }}
              />
            </div>
          </div>
        )}

        {state === "done" && downloadUrl && (
          <a
            href={downloadUrl}
            download
            onClick={() => onExportDone?.()}
            className="px-4 py-1.5 bg-success text-white text-xs font-medium rounded-sm"
          >
            Download
          </a>
        )}

        {state === "error" && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-danger">{error}</span>
            <button
              onClick={() => onExportDone?.()}
              className="px-3 py-1 bg-zinc-700 text-zinc-200 text-xs rounded-sm hover:bg-zinc-600 transition-colors"
            >
              Retry
            </button>
          </div>
        )}

        {file && onHome && (
          <button
            onClick={onHome}
            aria-label="Home"
            title="Back to library"
            className="p-1.5 text-zinc-400 rounded-sm hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 9.5L12 3l9 6.5" />
              <path d="M5 10v10h14V10" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}

export type { ExportState, ExportProgress };
