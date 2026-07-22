import { useEffect, useState } from "react";
import { fetchJson } from "../lib/fetchJson";

interface Props {
  onClose: () => void;
}

export function AboutModal({ onClose }: Props) {
  const [version, setVersion] = useState<string | null>(null);
  const [versionError, setVersionError] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetchJson<{ version: string }>("/api/version", { signal: controller.signal })
      .then(data => setVersion(data.version))
      .catch(() => {
        if (!controller.signal.aborted) setVersionError(true);
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-zinc-800 border border-zinc-700 max-w-xs w-full mx-4 shadow-2xl rounded-md p-modal flex flex-col items-center text-center gap-3"
        onClick={e => e.stopPropagation()}
      >
        <img src="/assets/favicon.svg" alt="Hance" className="w-16 h-16" />
        <h3 className="text-sm font-semibold text-zinc-200">Hance</h3>
        <p className="text-xs text-zinc-500">
          Cinematic film effects for video and images, applied in a single FFmpeg pass.
        </p>
        <p className="text-xs text-zinc-400">{version ? `Version ${version}` : versionError ? "Version unavailable" : "Loading version…"}</p>
        <p className="text-[11px] text-zinc-600">
          Copyright {new Date().getFullYear()} Orva Studio.
          <br />
          Uses FFmpeg under the LGPL.
        </p>
        <button
          onClick={onClose}
          className="mt-2 text-xs text-zinc-300 bg-zinc-700 hover:bg-zinc-600 transition-colors rounded-sm p-btn"
        >
          Close
        </button>
      </div>
    </div>
  );
}
