export interface SplitToneTintValues {
  shadowR: number;
  shadowB: number;
  shadowG: number;
  highlightR: number;
  highlightB: number;
  highlightG: number;
  midR: number;
}

export function getSplitToneTintValues(options: {
  mode: string;
  amount: number;
  hueAngle: number;
  pivot: number;
  green?: number;
}): SplitToneTintValues {
  const green = options.green ?? 0;
  const hueRad = (options.hueAngle * Math.PI) / 180;
  const cosHue = Math.cos(hueRad);
  const sinHue = Math.sin(hueRad);
  const shadowR = cosHue * options.amount * 0.3;
  const shadowB = sinHue * options.amount * 0.3;
  const shadowG = green * options.amount * 0.3;

  const isComp = options.mode === "complementary";
  const highlightScale = isComp ? 0.3 : 0.15;
  const cosHL = isComp ? -cosHue : cosHue;
  const sinHL = isComp ? -sinHue : sinHue;
  const greenHL = isComp ? -green : green;
  const highlightR = cosHL * options.amount * highlightScale;
  const highlightB = sinHL * options.amount * highlightScale;
  const highlightG = greenHL * options.amount * highlightScale;

  const midR = options.pivot * -0.1;

  return { shadowR, shadowB, shadowG, highlightR, highlightB, highlightG, midR };
}
