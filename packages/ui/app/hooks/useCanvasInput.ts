import { useEffect, useRef } from "react";
import { ZOOM_LEVELS, ZOOM_LEVELS_DESC, type ZoomLevel, type useCanvasTransform } from "./useCanvasTransform";
import type { ViewMode } from "../components/ViewModeToolbar";

type CanvasTransform = ReturnType<typeof useCanvasTransform>;

// Pure: given the current zoom and a wheel direction ("in" steps up the level
// ladder, "out" steps down toward "fit"), return the next zoom value, or null
// when already at the relevant extreme.
export function nextZoom(current: ZoomLevel, direction: "in" | "out"): ZoomLevel | null {
  const currentNum = current === "fit" ? 100 : current;
  const idx = ZOOM_LEVELS.indexOf(currentNum as (typeof ZOOM_LEVELS)[number]);
  if (direction === "in") {
    const next = idx === -1 ? ZOOM_LEVELS.find(z => z > currentNum) : ZOOM_LEVELS[idx + 1];
    return next ?? null;
  }
  const prev = idx === -1 ? ZOOM_LEVELS_DESC.find(z => z < currentNum) : ZOOM_LEVELS[idx - 1];
  return prev ?? "fit";
}

// Wires window-level keyboard and wheel input for the canvas, active only in
// "normal" view mode:
//   - Space: hold-to-pan while zoomed in; tap toggles video play/pause.
//   - H: toggle pan mode while zoomed in.
//   - Ctrl/Cmd + wheel: step zoom in/out.
export function useCanvasInput(
  viewMode: ViewMode,
  canvasTransform: CanvasTransform,
  videoElement: HTMLVideoElement | null,
) {
  const spacebarPanRef = useRef(false);
  const didPanRef = useRef(false);
  const zoomRef = useRef(canvasTransform.zoom);
  const panModeRef = useRef(canvasTransform.panMode);
  zoomRef.current = canvasTransform.zoom;
  panModeRef.current = canvasTransform.panMode;
  if (canvasTransform.isPanning) didPanRef.current = true;

  useEffect(() => {
    if (viewMode !== "normal") return;
    function isTextField(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      return t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (isTextField(e)) return;
      if (e.key === " ") {
        e.preventDefault();
        if (!e.repeat && zoomRef.current !== "fit") {
          spacebarPanRef.current = true;
          canvasTransform.setPanMode(true);
        }
      }
      if (e.key.toLowerCase() === "h" && zoomRef.current !== "fit") {
        canvasTransform.setPanMode(!panModeRef.current);
      }
    }
    function onKeyUp(e: KeyboardEvent) {
      if (e.key !== " ") return;
      if (isTextField(e)) return;
      const didPan = didPanRef.current;
      if (spacebarPanRef.current) {
        spacebarPanRef.current = false;
        didPanRef.current = false;
        canvasTransform.setPanMode(false);
      }
      if (!didPan && videoElement) {
        e.preventDefault();
        if (videoElement.paused) videoElement.play();
        else videoElement.pause();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => { window.removeEventListener("keydown", onKeyDown); window.removeEventListener("keyup", onKeyUp); };
  }, [viewMode, canvasTransform.setPanMode, videoElement]);

  useEffect(() => {
    if (viewMode !== "normal") return;
    function onWheel(e: WheelEvent) {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const next = nextZoom(zoomRef.current, e.deltaY < 0 ? "in" : "out");
      if (next !== null) canvasTransform.setZoom(next);
    }
    window.addEventListener("wheel", onWheel, { passive: false });
    return () => window.removeEventListener("wheel", onWheel);
  }, [viewMode, canvasTransform.setZoom]);
}
