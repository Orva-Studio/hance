import { useEffect, useState } from "react";
import { createRenderer } from "@hance/ui/app/gpu/renderer";
import { fitPreviewSize } from "@hance/ui/app/mediaSizing";
import type { Look } from "./looks";

// Generate a per-look thumbnail from the loaded image, client-side, with one
// offscreen WebGPU renderer: set the source once, then render each look at a
// small size and read it back to a data URL. Results stream in as they finish
// so the grid fills progressively instead of blocking on all 41.
export function useThumbnails(
  src: string,
  looks: Look[],
  onError?: (message: string) => void,
): Record<string, string> {
  const [thumbs, setThumbs] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    setThumbs({});

    async function run() {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = src;
      await img.decode();
      if (cancelled) return;

      const preview = fitPreviewSize(img.naturalWidth, img.naturalHeight, 220, 220);
      const canvas = document.createElement("canvas");
      const renderer = await createRenderer(canvas, {
        sourceWidth: img.naturalWidth,
        sourceHeight: img.naturalHeight,
        previewWidth: preview.width,
        previewHeight: preview.height,
      });
      // Once the renderer exists it holds GPU textures/buffers, so every exit
      // path (cancel, error mid-loop, completion) must destroy it.
      try {
        await renderer.setSource(img);
        if (cancelled) return;

        const out = document.createElement("canvas");
        out.width = preview.width;
        out.height = preview.height;
        const ctx = out.getContext("2d")!;

        for (const look of looks) {
          if (cancelled) break;
          renderer.setParams(look.previewParams);
          renderer.renderFrame();
          const pixels = await renderer.readPixels();
          if (cancelled) break;
          ctx.putImageData(
            new ImageData(new Uint8ClampedArray(pixels), preview.width, preview.height),
            0,
            0,
          );
          const url = out.toDataURL("image/jpeg", 0.7);
          setThumbs(prev => ({ ...prev, [look.name]: url }));
          // Yield so the UI stays responsive while the grid fills in.
          await new Promise(r => setTimeout(r, 0));
        }
      } finally {
        renderer.destroy();
      }
    }

    run().catch(err => {
      if (cancelled) return;
      // Thumbnail pipeline failed (decode, no adapter, GPU init). Surface it so
      // the empty grid reads as an error, not as looks still loading.
      onError?.(err instanceof Error ? err.message : "Failed to build look previews");
    });
    return () => {
      cancelled = true;
    };
  }, [src, looks, onError]);

  return thumbs;
}
