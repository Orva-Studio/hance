// UI-only "tone mode" sugar that links the two split-tone hue sliders. The
// render path (CLI + GPU) only ever sees the two explicit hues; mode is never
// persisted — it is inferred from the current pair and drives the sliders.
export type SplitToneMode = "natural" | "complementary" | "custom";

/** Highlight hue implied by a shadow hue under a linked mode. */
export function deriveHighlightHue(shadowHue: number, mode: "natural" | "complementary"): number {
  return mode === "complementary" ? (shadowHue + 180) % 360 : shadowHue;
}

/** Angular distance between two hues, accounting for the 0/360 wrap. */
function hueDistance(a: number, b: number): number {
  const d = (((a - b) % 360) + 360) % 360;
  return Math.min(d, 360 - d);
}

/** Classify a shadow/highlight pair back into a mode for the dropdown.
 *  Wrap-aware with a small tolerance so 0/360 pairs and float hues from
 *  hand-edited looks still classify as their linked mode. */
export function inferMode(shadowHue: number, highlightHue: number): SplitToneMode {
  const EPSILON = 0.5;
  if (hueDistance(highlightHue, shadowHue) < EPSILON) return "natural";
  if (hueDistance(highlightHue, shadowHue + 180) < EPSILON) return "complementary";
  return "custom";
}
