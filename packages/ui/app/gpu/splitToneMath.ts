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

export function getSplitToneTintValues(options: {
  mode: string;
  amount: number;
  hueAngle: number;
  pivot: number;
}): SplitToneTintValues {
  // Centered hue wheel: a fully-saturated hue minus its own mean, so the tint
  // is luminance-neutral (a neutral gray would produce no shift).
  const rgb = hueToRgb(options.hueAngle);
  const mean = (rgb[0] + rgb[1] + rgb[2]) / 3;
  const tint: [number, number, number] = [rgb[0] - mean, rgb[1] - mean, rgb[2] - mean];
  const shadowR = tint[0] * options.amount * 0.3;
  const shadowG = tint[1] * options.amount * 0.3;
  const shadowB = tint[2] * options.amount * 0.3;

  const isComp = options.mode === "complementary";
  const highlightScale = isComp ? 0.3 : 0.15;
  const sign = isComp ? -1 : 1;
  const highlightR = sign * tint[0] * options.amount * highlightScale;
  const highlightG = sign * tint[1] * options.amount * highlightScale;
  const highlightB = sign * tint[2] * options.amount * highlightScale;

  const midR = options.pivot * -0.1;

  return { shadowR, shadowB, shadowG, highlightR, highlightB, highlightG, midR };
}
