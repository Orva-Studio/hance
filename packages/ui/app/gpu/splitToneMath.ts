export interface SplitToneTintValues {
  shadowR: number;
  shadowB: number;
  shadowG: number;
  highlightR: number;
  highlightB: number;
  highlightG: number;
  midR: number;
}

/** Fully-saturated RGB for a hue in degrees (HSV with s=v=1). */
export function hueToRgb(hDeg: number): [number, number, number] {
  const h = (((hDeg % 360) + 360) % 360) / 60;
  const x = 1 - Math.abs((h % 2) - 1);
  switch (Math.floor(h)) {
    case 0:
      return [1, x, 0];
    case 1:
      return [x, 1, 0];
    case 2:
      return [0, 1, x];
    case 3:
      return [0, x, 1];
    case 4:
      return [x, 0, 1];
    default:
      return [1, 0, x];
  }
}

/** Centered hue wheel: a fully-saturated hue minus its own mean, so the tint is
 *  mean-neutral — its channels sum to zero (a neutral gray gets no shift). Not
 *  luma-weighted, so a pure hue still nudges perceived brightness slightly. */
function centeredTint(hueAngle: number): [number, number, number] {
  const rgb = hueToRgb(hueAngle);
  const mean = (rgb[0] + rgb[1] + rgb[2]) / 3;
  return [rgb[0] - mean, rgb[1] - mean, rgb[2] - mean];
}

export function getSplitToneTintValues(options: {
  amount: number;
  shadowHueAngle: number;
  highlightHueAngle: number;
  pivot: number;
}): SplitToneTintValues {
  // Shadows and highlights tint independently from their own hues. Highlights
  // use a subtler scale (0.15 vs 0.3) — film highlights carry less tint.
  const shadowTint = centeredTint(options.shadowHueAngle);
  const shadowR = shadowTint[0] * options.amount * 0.3;
  const shadowG = shadowTint[1] * options.amount * 0.3;
  const shadowB = shadowTint[2] * options.amount * 0.3;

  const highlightTint = centeredTint(options.highlightHueAngle);
  const highlightR = highlightTint[0] * options.amount * 0.15;
  const highlightG = highlightTint[1] * options.amount * 0.15;
  const highlightB = highlightTint[2] * options.amount * 0.15;

  const midR = options.pivot * -0.1;

  return { shadowR, shadowB, shadowG, highlightR, highlightB, highlightG, midR };
}
