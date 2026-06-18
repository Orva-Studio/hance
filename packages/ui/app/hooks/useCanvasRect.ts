import { useEffect, useState } from "react";

export interface CanvasRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

// Tracks a canvas element's viewport bounding rect, re-measuring on resize and
// scroll. Consumed by the compare/reference overlays, which position absolutely
// over the canvas. Returns null until a canvas is mounted.
export function useCanvasRect(canvas: HTMLCanvasElement | null): CanvasRect | null {
  const [rect, setRect] = useState<CanvasRect | null>(null);
  useEffect(() => {
    if (!canvas) { setRect(null); return; }
    function update() {
      const r = canvas!.getBoundingClientRect();
      setRect({ left: r.left, top: r.top, width: r.width, height: r.height });
    }
    update();
    const ro = new ResizeObserver(update);
    ro.observe(canvas);
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      ro.disconnect();
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [canvas]);
  return rect;
}
