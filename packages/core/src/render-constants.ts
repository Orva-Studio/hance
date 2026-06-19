import renderConstants from "../constants/render.json";

/**
 * Internal renderer constants that are NOT exposed as effect params but must
 * stay identical across the TS preview renderer and the Rust export renderer.
 * Single source consumed by TS (this import) and Rust (`include_str!` of the
 * same JSON) — see packages/wgpu/src/renderer.rs.
 */
export const HALATION_THRESHOLD: readonly [number, number] = renderConstants.halationThreshold as [number, number];
export const BLUR_SIGMA_FACTOR: number = renderConstants.blurSigmaFactor;
export const HALATION_CHANNEL_SIGMA: readonly [number, number, number] =
  renderConstants.halationChannelSigma as [number, number, number];
export const HALATION_PSF: readonly (readonly [number, number])[] =
  renderConstants.halationPsf as [number, number][];
export const HALATION_RING: number = renderConstants.halationRing;
/** Frame height (px) at which blur radii are calibrated. */
export const REFERENCE_HEIGHT: number = renderConstants.referenceHeight;
/**
 * Factor to scale pixel-space blur sigmas so halation/bloom keep the same
 * relative size at any resolution. Calibrated at REFERENCE_HEIGHT.
 */
export function resolutionScale(frameHeight: number): number {
  if (frameHeight <= 0) return 1;
  return frameHeight / REFERENCE_HEIGHT;
}

/** Hue (degrees) of each named fade color; neutral has no entry (no tint). */
export const FADE_COLOR_HUES: Record<string, number> = renderConstants.fadeColorHues;
/** Tint strength applied to the black lift for any non-neutral fade color. */
export const FADE_TINT_STRENGTH: number = renderConstants.fadeTintStrength;

/**
 * Blur radius (px, at REFERENCE_HEIGHT) a fully-open aperture produces for a
 * pixel one full unit of depth away from the focus plane. The artistic DoF
 * heuristic, NOT a physical circle-of-confusion. Shared with the Rust export
 * renderer so preview and export agree.
 */
export const DOF_MAX_RADIUS: number = renderConstants.dofMaxRadius;

/**
 * Per-pixel DoF blur radius in px. `depth` and `focus` are in the normalized
 * 0–1 depth space (1 = near, 0 = far). The renderers (TS preview + Rust export
 * + WGSL shader) all compute this same value: a coefficient
 * `amount * DOF_MAX_RADIUS * resolutionScale` times the distance from the focus
 * plane, clamped to `maxBlurPx`. This pure mirror is the tested contract.
 */
export function dofRadiusPx(
  depth: number,
  focus: number,
  amount: number,
  maxBlurPx: number,
  frameHeight: number,
): number {
  const coeff = amount * DOF_MAX_RADIUS * resolutionScale(frameHeight);
  return Math.min(coeff * Math.abs(depth - focus), maxBlurPx);
}
