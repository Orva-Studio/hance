import type { FilterResult, SplitToneOptions } from "../types";

export function splitToneFilter(input: string, options: SplitToneOptions): FilterResult {
  if (!options.enabled) {
    return { fragment: `[${input}]null[splittone_out]`, output: "splittone_out" };
  }

  const { mode, protectNeutrals, amount, hueAngle, pivot } = options;

  // Convert hue angle (0-360) to RGB shadow/highlight offsets
  const hueRad = (hueAngle * Math.PI) / 180;
  const shadowR = (Math.cos(hueRad) * amount * 0.3).toFixed(4);
  const shadowB = (Math.sin(hueRad) * amount * 0.3).toFixed(4);

  // Complementary mode: highlights get opposite hue; natural: same direction, weaker
  const highlightHueRad = mode === "complementary" ? hueRad + Math.PI : hueRad;
  const highlightScale = mode === "complementary" ? 0.3 : 0.15;
  const highlightR = (Math.cos(highlightHueRad) * amount * highlightScale).toFixed(4);
  const highlightB = (Math.sin(highlightHueRad) * amount * highlightScale).toFixed(4);

  // Pivot controls shadow/highlight split point via midtones
  const midR = (pivot * -0.1).toFixed(4);

  const colorbalance = `colorbalance=rs=${shadowR}:bs=${shadowB}:rh=${highlightR}:bh=${highlightB}:rm=${midR}`;

  if (protectNeutrals) {
    const fragment = [
      `[${input}]split=2[st_orig][st_src];`,
      `[st_src]${colorbalance}[st_toned];`,
      `[st_orig][st_toned]blend=all_mode=normal:all_opacity=${amount.toFixed(4)}[splittone_out]`,
    ].join("");
    return { fragment, output: "splittone_out" };
  }

  const fragment = `[${input}]${colorbalance}[splittone_out]`;
  return { fragment, output: "splittone_out" };
}
