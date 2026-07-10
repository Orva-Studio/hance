const MAX_DIM = 320;

// Capture the current video frame (or an image URL) as a small JPEG data URL,
// used for look-thumbnail sources and the recent-files list.
export async function captureFrame(source: HTMLVideoElement | string): Promise<string> {
  let drawable: HTMLVideoElement | HTMLImageElement;
  let width: number;
  let height: number;

  if (typeof source === "string") {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = source;
    await img.decode();
    drawable = img;
    width = img.naturalWidth;
    height = img.naturalHeight;
  } else {
    drawable = source;
    width = source.videoWidth;
    height = source.videoHeight;
  }

  if (width <= 0 || height <= 0) throw new Error("source has no dimensions");

  const scale = Math.min(1, MAX_DIM / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  canvas.getContext("2d")!.drawImage(drawable, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.75);
}
