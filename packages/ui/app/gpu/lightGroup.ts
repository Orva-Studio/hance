import type { PreviewParams } from "./renderer";

function num(params: PreviewParams, key: string, fallback: number): number {
  const v = params[key];
  return typeof v === "number" ? v : fallback;
}

// True when at least one light-transport effect (halation, aberration, bloom,
// grain, vignette) will actually run. The renderer only inserts the
// sRGB<->linear bracket when this holds, so a frame with the whole group
// disabled passes through byte-for-byte (perceptual passes are unaffected).
export function isLightGroupActive(params: PreviewParams): boolean {
  return (
    (params["no-halation"] !== true && num(params, "halation-amount", 0.25) > 0) ||
    (params["no-aberration"] !== true && num(params, "aberration", 0.3) > 0) ||
    (params["no-bloom"] !== true && num(params, "bloom-amount", 0.25) > 0) ||
    (params["no-grain"] !== true && num(params, "grain-iso", 400) > 0) ||
    (params["no-vignette"] !== true && num(params, "vignette-amount", 0.25) > 0)
  );
}
