import { useCallback, useEffect, useRef, useState } from "react";
import { pickNativeFile } from "../lib/openFile";

export interface RecentEntry {
  path: string;
  name: string;
  thumbnail?: string;
  openedAt: number;
}

interface Props {
  onFile: (file: File, sourcePath?: string) => void;
  // Path lane for natively picked / recent files: the media stays on disk and
  // is served (and later transcoded/exported) by path, never downloaded.
  onPath: (path: string, name: string) => void;
  onError: (message: string) => void;
}

const NLE_IMPORTS = ["DaVinci Resolve", "Premiere Pro", "Final Cut Pro"];

export function Landing({ onFile, onPath, onError }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [recents, setRecents] = useState<RecentEntry[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/recents")
      .then(res => (res.ok ? res.json() : []))
      .then((entries: RecentEntry[]) => { if (!cancelled) setRecents(entries); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const loadPath = useCallback(async (path: string, name: string) => {
    try {
      onPath(path, name);
    } catch (err) {
      onError(`Failed to open "${name}": ${(err as Error).message}`);
    }
  }, [onPath, onError]);

  // Prefer the native OS picker (desktop shell) because it yields a real path
  // for the recents list; fall back to the browser file input elsewhere.
  const openPicker = useCallback(async () => {
    try {
      const picked = await pickNativeFile();
      if (picked === "unsupported") {
        inputRef.current?.click();
        return;
      }
      if (picked) await loadPath(picked.path, picked.name);
    } catch {
      inputRef.current?.click();
    }
  }, [loadPath]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) onFile(file);
  }, [onFile]);

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 py-8 gap-8 overflow-y-auto">
      <div
        onClick={openPicker}
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`w-full max-w-md rounded-xl border-2 border-dashed cursor-pointer transition-colors px-6 py-10 text-center ${
          dragging ? "border-accent bg-accent/5" : "border-zinc-700 hover:border-zinc-500"
        }`}
      >
        <p className="text-zinc-200 text-sm font-medium">Drag &amp; drop an image or video</p>
        <p className="text-zinc-500 text-xs mt-1">or click to browse</p>
        {/* Persistent hidden input: a detached input created on click can be
            GC'd by WKWebView while the file dialog is open, dropping onchange. */}
        <input
          ref={inputRef}
          type="file"
          accept="image/*,video/*"
          className="hidden"
          onClick={e => e.stopPropagation()}
          onChange={e => {
            const file = e.target.files?.[0];
            if (file) onFile(file);
            e.target.value = "";
          }}
        />
      </div>

      {recents.length > 0 && (
        <div className="w-full max-w-md">
          <p className="text-xs uppercase tracking-wide text-zinc-500 mb-3">Recent files</p>
          <div className="grid grid-cols-3 gap-3">
            {recents.slice(0, 6).map(r => (
              <button
                key={r.path}
                onClick={() => loadPath(r.path, r.name)}
                title={r.path}
                className="group relative aspect-[4/3] rounded-lg overflow-hidden border border-zinc-800 hover:border-zinc-600 bg-zinc-900"
              >
                {r.thumbnail ? (
                  <img
                    src={r.thumbnail}
                    alt={r.name}
                    loading="lazy"
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                  />
                ) : (
                  <span className="absolute inset-0 flex items-center justify-center text-2xl text-zinc-700">▶</span>
                )}
                <span className="absolute inset-x-0 bottom-0 bg-black/60 text-[11px] text-zinc-200 py-1 px-1.5 truncate">
                  {r.name}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="w-full max-w-md">
        <p className="text-xs uppercase tracking-wide text-zinc-500 mb-3">Import from</p>
        <div className="grid grid-cols-3 gap-3">
          {NLE_IMPORTS.map(name => (
            <button
              key={name}
              disabled
              className="relative rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-4 text-xs text-zinc-500 cursor-not-allowed"
            >
              {name}
              <span className="block mt-1 text-[10px] uppercase tracking-wide text-zinc-600">
                Coming soon
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
