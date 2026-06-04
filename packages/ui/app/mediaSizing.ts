export interface Dimensions {
  width: number;
  height: number;
}

function roundDimension(value: number): number {
  return Math.max(1, Math.round(value));
}

export interface ExportSize extends Dimensions {
  /** True when the source exceeded the GPU texture limit and was scaled down. */
  clamped: boolean;
}

/**
 * Pick the render-target size for a full-resolution image export. Uses the
 * native source size whenever it fits within the GPU's max 2D texture
 * dimension; otherwise scales the long edge down to that limit, preserving
 * aspect ratio. Sources beyond the limit can't be rendered client-side and
 * should fall back to a server export path.
 */
export function chooseExportSize(
  sourceWidth: number,
  sourceHeight: number,
  maxTextureDimension: number,
): ExportSize {
  if (sourceWidth <= 0 || sourceHeight <= 0) {
    throw new Error(`Invalid source size ${sourceWidth}x${sourceHeight}`);
  }

  const scale = Math.min(1, maxTextureDimension / sourceWidth, maxTextureDimension / sourceHeight);
  return {
    width: roundDimension(sourceWidth * scale),
    height: roundDimension(sourceHeight * scale),
    clamped: scale < 1,
  };
}

export function fitPreviewSize(
  sourceWidth: number,
  sourceHeight: number,
  maxWidth = 1920,
  maxHeight = 1080,
): Dimensions {
  if (sourceWidth <= 0 || sourceHeight <= 0) {
    throw new Error(`Invalid source size ${sourceWidth}x${sourceHeight}`);
  }

  const scale = Math.min(1, maxWidth / sourceWidth, maxHeight / sourceHeight);
  return {
    width: roundDimension(sourceWidth * scale),
    height: roundDimension(sourceHeight * scale),
  };
}
