import { cubeBakeParams, formatCube, identityCubeImage, CUBE_SIZE } from "@hance/core";
import { createRenderer, type PreviewParams } from "../gpu/renderer";

// Bakes the look into .cube text by pushing an identity colour cube through the
// real shader chain, rather than reimplementing the grade in TypeScript. The
// renderer stays the single source of truth for what a look looks like, so an
// exported LUT cannot drift from the preview.
//
// Precision: the readback here is undithered — blit.frag.wgsl's TPDF dither is
// wired only into the Rust sidecar, while this path blits through an identity
// color-settings pass. The real limit is that an 8-bit identity cube cannot sit
// exactly on the 33^3 lattice: 0.5 grey stores as 128/255, so grid points are
// sampled up to 0.5 LSB (~6% of a lattice cell) off true. Feeding a float source
// texture would be the fix if a LUT ever needs to be exact; at 8-bit output the
// error stays under one output step for any smooth grade.
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
