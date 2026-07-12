import { useEffect, useRef } from "react";
import { captureFrame } from "../lib/captureFrame";

interface FirstFrameSource {
  // Object URL of the loaded media; null when nothing is loaded.
  objectUrl: string | null;
  isVideo: boolean;
  // For video, the mounted <video> element and whether its first frame has
  // decoded; ignored for images.
  videoElement: HTMLVideoElement | null;
  firstFrameReady: boolean;
}

// Calls onFrame with a small JPEG data URL of the loaded media's first frame,
// once per load, as soon as it is decodable (immediately for images, after
// the <video> reports a decoded frame for video). The frame is what look
// thumbnails and recents entries are rendered from. Capture failures are
// logged, not surfaced: thumbnails are cosmetic and the media itself loaded.
export function useFirstFrame(
  { objectUrl, isVideo, videoElement, firstFrameReady }: FirstFrameSource,
  onFrame: (frame: string) => void,
): void {
  // Ref so the effect always sees the latest callback without re-capturing
  // when the caller re-renders.
  const onFrameRef = useRef(onFrame);
  onFrameRef.current = onFrame;

  useEffect(() => {
    if (!objectUrl) return;
    if (isVideo && (!videoElement || !firstFrameReady)) return;
    let cancelled = false;
    (async () => {
      try {
        const frame = await captureFrame(isVideo ? videoElement! : objectUrl);
        if (!cancelled) onFrameRef.current(frame);
      } catch (err) {
        console.error("First-frame capture failed:", err);
      }
    })();
    return () => { cancelled = true; };
  }, [objectUrl, isVideo, videoElement, firstFrameReady]);
}
