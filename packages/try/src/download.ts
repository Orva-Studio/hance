import type { Renderer } from "@hance/ui/app/gpu/renderer";

// Render at full resolution and pack the RGBA readback into a PNG blob.
export async function exportImageBlob(renderer: Renderer): Promise<Blob> {
  const { pixels, width, height } = await renderer.exportImage();
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not get a 2D canvas context for export");
  ctx.putImageData(new ImageData(new Uint8ClampedArray(pixels), width, height), 0, 0);
  // PNG holds a multi-source-sized working set in memory; above ~24MP the
  // encode risks OOM-crashing the tab, so fall back to JPEG which encodes
  // streaming with a far smaller peak. ponytail: dimension threshold, swap to
  // a real memory probe if exports still OOM on low-RAM devices.
  const big = width * height > 24_000_000;
  const type = big ? "image/jpeg" : "image/png";
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error("toBlob failed"))), type, 0.92);
  });
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  // Defer the revoke: some browsers (Firefox/Safari) abort the download if the
  // object URL is invalidated before the navigation latches.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
