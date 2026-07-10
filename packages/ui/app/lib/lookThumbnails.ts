import { createRenderer, type Renderer, type PreviewParams } from "../gpu/renderer";
import { fitPreviewSize } from "../mediaSizing";

const THUMB_SIZE = 256;
const REFERENCE_URL = "/assets/reference.webp";

type Generator = {
  generate: (name: string, params: PreviewParams) => Promise<string>;
  invalidate: (name: string) => void;
  rename: (oldName: string, newName: string) => void;
  destroy: () => void;
};

let generatorPromise: Promise<Generator> | null = null;
// Which image thumbnails are rendered from: the bundled reference until the
// user loads media, then the first frame of their file.
let currentSourceUrl: string | null = null;

// Point look thumbnails at a new source image (data/object URL), or null to
// return to the bundled reference. The next generate() call rebuilds the GPU
// renderer against it; callers should regenerate all thumbnails afterwards.
export function setThumbnailSource(url: string | null): void {
  if (url === currentSourceUrl) return;
  currentSourceUrl = url;
  const old = generatorPromise;
  generatorPromise = null;
  old?.then(g => g.destroy()).catch(() => {});
}

async function loadSourceImage(): Promise<HTMLImageElement> {
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.src = currentSourceUrl ?? REFERENCE_URL;
  await img.decode();
  return img;
}

async function createGenerator(): Promise<Generator> {
  const canvas = document.createElement("canvas");
  const source = await loadSourceImage();
  const preview = fitPreviewSize(source.naturalWidth, source.naturalHeight, THUMB_SIZE, THUMB_SIZE);
  const renderer: Renderer = await createRenderer(canvas, {
    sourceWidth: source.naturalWidth,
    sourceHeight: source.naturalHeight,
    previewWidth: preview.width,
    previewHeight: preview.height,
  });
  await renderer.setSource(source);

  const out2d = document.createElement("canvas");
  out2d.width = preview.width;
  out2d.height = preview.height;
  const ctx = out2d.getContext("2d")!;

  const cache = new Map<string, string>();
  let queue: Promise<void> = Promise.resolve();

  async function runExclusive<T>(fn: () => Promise<T>): Promise<T> {
    const prev = queue;
    let resolve: () => void;
    queue = new Promise(r => { resolve = r; });
    try {
      await prev;
      return await fn();
    } finally {
      resolve!();
    }
  }

  return {
    async generate(name, params) {
      return runExclusive(async () => {
        renderer.setParams(params);
        renderer.renderFrame();
        const pixels = await renderer.readPixels();
        const imageData = new ImageData(new Uint8ClampedArray(pixels.buffer), preview.width, preview.height);
        ctx.putImageData(imageData, 0, 0);
        const blob: Blob = await new Promise((res, rej) =>
          out2d.toBlob(b => b ? res(b) : rej(new Error("toBlob failed")), "image/webp", 0.82),
        );
        const prev = cache.get(name);
        if (prev) URL.revokeObjectURL(prev);
        const url = URL.createObjectURL(blob);
        cache.set(name, url);
        return url;
      });
    },
    invalidate(name) {
      const prev = cache.get(name);
      if (prev) {
        URL.revokeObjectURL(prev);
        cache.delete(name);
      }
    },
    rename(oldName, newName) {
      const url = cache.get(oldName);
      if (url) {
        cache.delete(oldName);
        cache.set(newName, url);
      }
    },
    destroy() {
      renderer.destroy();
      for (const url of cache.values()) URL.revokeObjectURL(url);
      cache.clear();
    },
  };
}

export function getThumbnailGenerator(): Promise<Generator> {
  if (!generatorPromise) generatorPromise = createGenerator();
  return generatorPromise;
}
