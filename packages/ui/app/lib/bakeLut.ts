import { cubeBakeParams, formatCube, identityCubeImage, CUBE_SIZE } from "@hance/core";
import { createRenderer, type PreviewParams } from "../gpu/renderer";

// Bakes the look into .cube text by pushing an identity colour cube through the
// real shader chain, rather than reimplementing the grade in TypeScript. The
// renderer stays the single source of truth for what a look looks like, so an
// exported LUT cannot drift from the preview.
//
// The chain's final blit adds +/-0.5 LSB of dither, so entries can land one
// 8-bit step off the exact mapping. That is well inside the interpolation error
// of a 33^3 LUT and invisible in use; a dither-free readback path would be the
// fix if a LUT ever needs to be bit-exact.
export async function bakeLutCube(params: PreviewParams, title: string): Promise<string> {
  const { data, width, height } = identityCubeImage(CUBE_SIZE);

  // Offscreen: the bake renders through exportImage() and never presents, but
  // createRenderer still needs a canvas to configure its context against.
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const renderer = await createRenderer(canvas, {
    sourceWidth: width,
    sourceHeight: height,
    previewWidth: width,
    previewHeight: height,
  });

  try {
    renderer.setSourceFromBuffer(data, width, height);
    renderer.setParams(cubeBakeParams(params) as PreviewParams);
    const { pixels } = await renderer.exportImage();
    return formatCube(pixels, CUBE_SIZE, title);
  } finally {
    renderer.destroy();
  }
}

/** Hands the .cube to the user as a download. */
export function downloadCube(text: string, filename: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
