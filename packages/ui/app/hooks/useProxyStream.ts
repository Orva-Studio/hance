import { useCallback, useRef, useState } from "react";

export const PROXY_MIME = 'video/mp4; codecs="avc1.640028, mp4a.40.2"';

export type ProxyStreamState =
  | "idle"
  | "streaming"
  | "ready"
  | "error";

// buffered end (sec) over duration (sec), clamped to [0, 1].
export function computeBufferedProgress(bufferedEnd: number, durationSec: number): number {
  if (durationSec <= 0) return 0;
  return Math.min(1, bufferedEnd / durationSec);
}

function mseSupported(): boolean {
  return typeof MediaSource !== "undefined" && MediaSource.isTypeSupported(PROXY_MIME);
}

export interface ProxyStreamApi {
  previewSrc: string | null;
  state: ProxyStreamState;
  progress: number;
  durationHint: number;
  errorMsg: string | null;
  cacheBytes: number;   // total size of the on-disk proxy cache, from the server
  start: (file: File, sourcePath?: string | null) => Promise<void>;
  reset: () => void;
}

export function useProxyStream(): ProxyStreamApi {
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const [state, setState] = useState<ProxyStreamState>("idle");
  const [progress, setProgress] = useState(0);
  const [durationHint, setDurationHint] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [cacheBytes, setCacheBytes] = useState(0);
  const blobUrlRef = useRef<string | null>(null);
  // Incremented on every start(). Each run captures its value and bails the
  // moment it changes, so a newer upload can't be clobbered by an older
  // stream's async callbacks still resolving in the background.
  const runRef = useRef(0);

  const revokeBlob = useCallback(() => {
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }
  }, []);

  const start = useCallback(async (file: File, sourcePath?: string | null) => {
    const run = ++runRef.current;
    const isStale = () => run !== runRef.current;
    // A new run supersedes any in-flight one; drop its blob immediately.
    revokeBlob();
    setState("streaming");
    setProgress(0);
    setErrorMsg(null);

    // Cheap probe first: if this exact file was transcoded before, load the
    // finished proxy directly with no upload and no streaming. Metadata-only,
    // so a hit is effectively instant regardless of source size. Skipped in
    // the path lane, where the server does its own cache check from a stat.
    if (!sourcePath) {
      try {
        const probe = await fetch("/api/proxy/lookup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: file.name, size: file.size, lastModified: file.lastModified }),
        });
        if (isStale()) return;
        if (probe.ok) {
          const hit = await probe.json();
          if (isStale()) return;
          setCacheBytes(Number(hit.cacheBytes ?? 0));
          if (hit.cached && hit.proxyPath) {
            setDurationHint(Number(hit.durationSec ?? 0));
            setPreviewSrc(`/api/proxy-file?path=${encodeURIComponent(hit.proxyPath)}`);
            setProgress(1);
            setState("ready");
            return;
          }
        }
      } catch {
        // Lookup is an optimization; fall through to the normal transcode path.
        if (isStale()) return;
      }
    }

    let res: Response;
    try {
      if (sourcePath) {
        // Desktop path lane: the file is already on disk next to the server,
        // so ffmpeg reads it in place instead of receiving an upload.
        res = await fetch("/api/proxy/from-path", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ path: sourcePath }),
        });
      } else {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("lastModified", String(file.lastModified));
        res = await fetch("/api/proxy", { method: "POST", body: formData });
      }
    } catch (err) {
      if (isStale()) return;
      setState("error");
      setErrorMsg((err as Error).message);
      return;
    }
    if (isStale()) {
      res.body?.cancel().catch(() => {});
      return;
    }
    if (!res.ok || !res.body) {
      setState("error");
      setErrorMsg((await res.text().catch(() => "")) || "Proxy request failed");
      return;
    }

    const durationSec = Number(res.headers.get("X-Proxy-Duration") ?? "0");
    const proxyPath = res.headers.get("X-Proxy-Path") ?? "";
    setDurationHint(durationSec);
    setCacheBytes(Number(res.headers.get("X-Proxy-Cache-Bytes") ?? "0"));
    const fileUrl = `/api/proxy-file?path=${encodeURIComponent(proxyPath)}`;

    // Server-side cache hit (path lane): the body is the finished proxy, so
    // skip MediaSource and play it straight from disk with full seeking.
    if (res.headers.get("X-Proxy-Cached") === "1") {
      res.body?.cancel().catch(() => {});
      setPreviewSrc(fileUrl);
      setProgress(1);
      setState("ready");
      return;
    }

    // Fallback: drain the whole stream, then play the finished file.
    if (!mseSupported()) {
      try {
        await res.arrayBuffer();
        if (isStale()) return;
        setPreviewSrc(fileUrl);
        setProgress(1);
        setState("ready");
      } catch (err) {
        if (isStale()) return;
        setState("error");
        setErrorMsg((err as Error).message);
      }
      return;
    }

    const mediaSource = new MediaSource();
    const blobUrl = URL.createObjectURL(mediaSource);
    blobUrlRef.current = blobUrl;
    setPreviewSrc(blobUrl);

    mediaSource.addEventListener("sourceopen", async () => {
      if (isStale()) { revokeBlob(); return; }
      const sourceBuffer = mediaSource.addSourceBuffer(PROXY_MIME);
      // Without this the streaming blob reports duration === Infinity until
      // endOfStream, which breaks duration-based UI (e.g. timeline ticks).
      if (durationSec > 0) {
        try { mediaSource.duration = durationSec; } catch {}
      }
      const reader = res.body!.getReader();

      const appendChunk = (chunk: Uint8Array) =>
        new Promise<void>((resolve, reject) => {
          const onUpdate = () => { sourceBuffer.removeEventListener("updateend", onUpdate); resolve(); };
          const onErr = () => { sourceBuffer.removeEventListener("error", onErr); reject(new Error("SourceBuffer append failed")); };
          sourceBuffer.addEventListener("updateend", onUpdate);
          sourceBuffer.addEventListener("error", onErr);
          sourceBuffer.appendBuffer(chunk);
        });

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          // A newer upload arrived mid-stream: stop feeding this MediaSource
          // and let the cancel()/revoke below tear it down.
          if (isStale()) { reader.cancel().catch(() => {}); return; }
          await appendChunk(value);
          const end = sourceBuffer.buffered.length
            ? sourceBuffer.buffered.end(sourceBuffer.buffered.length - 1)
            : 0;
          setProgress(computeBufferedProgress(end, durationSec));
        }
        if (isStale()) return;
        if (mediaSource.readyState === "open") mediaSource.endOfStream();
        setProgress(1);
        setState("ready");
        // Swap the streaming blob for the on-disk file so the whole clip is
        // seekable. App.tsx freezes the playhead across this swap.
        setPreviewSrc(fileUrl);
      } catch (err) {
        if (isStale()) return;
        setState("error");
        setErrorMsg((err as Error).message);
      } finally {
        revokeBlob();
      }
    }, { once: true });
  }, [revokeBlob]);

  // Invalidate any in-flight run so its async callbacks become no-ops, drop
  // the blob, and go back to idle — used when the file being previewed is
  // discarded (e.g. the Home button) so a later start() isn't shadowed by a
  // stale previewSrc/state from the old file.
  const reset = useCallback(() => {
    runRef.current++;
    revokeBlob();
    setPreviewSrc(null);
    setState("idle");
    setProgress(0);
    setDurationHint(0);
    setErrorMsg(null);
  }, [revokeBlob]);

  return { previewSrc, state, progress, durationHint, errorMsg, cacheBytes, start, reset };
}
