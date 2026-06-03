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
