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
  start: (file: File) => Promise<void>;
}

export function useProxyStream(): ProxyStreamApi {
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const [state, setState] = useState<ProxyStreamState>("idle");
  const [progress, setProgress] = useState(0);
  const [durationHint, setDurationHint] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const blobUrlRef = useRef<string | null>(null);

  const start = useCallback(async (file: File) => {
    setState("streaming");
    setProgress(0);
    setErrorMsg(null);

    const formData = new FormData();
    formData.append("file", file);

    let res: Response;
    try {
      res = await fetch("/api/proxy", { method: "POST", body: formData });
    } catch (err) {
      setState("error");
      setErrorMsg((err as Error).message);
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
    const fileUrl = `/api/proxy-file?path=${encodeURIComponent(proxyPath)}`;

    // Fallback: drain the whole stream, then play the finished file.
    if (!mseSupported()) {
      try {
        await res.arrayBuffer();
        setPreviewSrc(fileUrl);
        setProgress(1);
        setState("ready");
      } catch (err) {
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
          await appendChunk(value);
          const end = sourceBuffer.buffered.length
            ? sourceBuffer.buffered.end(sourceBuffer.buffered.length - 1)
            : 0;
          setProgress(computeBufferedProgress(end, durationSec));
        }
        if (mediaSource.readyState === "open") mediaSource.endOfStream();
        setProgress(1);
        setState("ready");
        setPreviewSrc(fileUrl); // swap handled by the consumer (Task 5) to preserve currentTime
      } catch (err) {
        setState("error");
        setErrorMsg((err as Error).message);
      } finally {
        if (blobUrlRef.current) {
          URL.revokeObjectURL(blobUrlRef.current);
          blobUrlRef.current = null;
        }
      }
    }, { once: true });
  }, []);

  return { previewSrc, state, progress, durationHint, errorMsg, start };
}
