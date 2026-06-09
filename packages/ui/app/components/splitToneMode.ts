// UI-only "tone mode" sugar that links the two split-tone hue sliders. The
// render path (CLI + GPU) only ever sees the two explicit hues; mode is never
// persisted — it is inferred from the current pair and drives the sliders.
export type SplitToneMode = "natural" | "complementary" | "custom";

/** Highlight hue implied by a shadow hue under a linked mode. */
export function deriveHighlightHue(shadowHue: number, mode: "natural" | "complementary"): number {
  return mode === "complementary" ? (shadowHue + 180) % 360 : shadowHue;
}

/** Classify a shadow/highlight pair back into a mode for the dropdown. */
export function inferMode(shadowHue: number, highlightHue: number): SplitToneMode {
  if (highlightHue === shadowHue) return "natural";
  if (highlightHue === (shadowHue + 180) % 360) return "complementary";
  return "custom";
}
