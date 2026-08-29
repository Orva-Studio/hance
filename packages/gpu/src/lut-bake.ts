import { CUBE_SIZE, cubeBakeParams, formatCube, identityCubeImage } from "@hance/core";
import { createHeadlessRenderer } from "./wgpu-renderer";

/**
 * Bakes a look into .cube text by pushing an identity colour cube through the
 * GPU sidecar — the same renderer that produces final exports, so a LUT matches
 * what Hance actually renders rather than a second implementation of the grade.
 *
 * Only the per-pixel passes survive a colour->colour mapping; cubeBakeParams
 * forces the spatial and temporal ones off (see LOSSY_EFFECTS in @hance/core).
 *
 * The blit's TPDF dither is forced off: it exists to break up banding in an
 * image, but here every texel is a lattice point, so its +/-0.5 LSB would be
 * quantized into the cube and replayed on everything the LUT touches.
 *
 * Precision: the cube is 8-bit in and out, so grid points land up to 0.5 LSB
 * (~6% of a lattice cell) off true — 0.5 grey stores as 128/255. Under one
 * output step for any smooth grade; a float source would be the fix if a LUT
 * ever needs to be exact.
 */
export async function bakeLutCube(
  params: Record<string, unknown>,
  title: string,
): Promise<string> {
  const { data, width, height } = identityCubeImage(CUBE_SIZE);
  const bakeParams = {
    ...cubeBakeParams(params as Record<string, string | number | boolean>),
    "no-dither": true,
  };

  const renderer = await createHeadlessRenderer();
  try {
    await renderer.init(width, height, bakeParams);
    const pixels = await renderer.renderFrame(data, width, height, bakeParams);
    return formatCube(pixels, CUBE_SIZE, title);
  } finally {
    await renderer.close();
  }
}
