// Per-channel H&D (Hurter-Driffield) density curve: an artistic stand-in for a
// film stock's characteristic curve, applied in linear light (see the linear
// bracket in packages/wgpu/src/renderer.rs and packages/ui/app/gpu/renderer.ts).
// Single source of truth for the curve math, mirrored in
// packages/core/shaders/film-density.frag.wgsl. Pivoted at 0.5 so toe and
// shoulder gamma can be tuned independently without moving midtones.

import { FILM_DENSITY_PRESETS, type FilmDensityPreset } from "./render-constants";

export type FilmDensityPresetName = keyof typeof FILM_DENSITY_PRESETS;

/**
 * toeGamma < 1 lifts/flattens shadows (film-fog toe); > 1 deepens them.
 * shoulderGamma < 1 rolls off highlights; > 1 crushes them harder.
 */
export function filmDensityCurve(x: number, toeGamma: number, shoulderGamma: number): number {
  const xc = Math.min(1, Math.max(0, x));
  if (xc <= 0.5) return 0.5 * Math.pow(xc / 0.5, toeGamma);
  return 1 - 0.5 * Math.pow((1 - xc) / 0.5, shoulderGamma);
}

type ParamDict = Record<string, string | number | boolean | undefined>;

export function filmDensityPresetName(params: ParamDict): FilmDensityPresetName {
  const name = params["film-density-preset"];
  return typeof name === "string" && name in FILM_DENSITY_PRESETS ? (name as FilmDensityPresetName) : "warm-classic";
}

export function filmDensityAmount(params: ParamDict): number {
  const amount = params["film-density-amount"];
  return typeof amount === "number" ? amount : 0;
}

export function isFilmDensityActive(params: ParamDict): boolean {
  if (params["no-film-density"] === true) return false;
  return filmDensityAmount(params) > 0;
}

/** [amount, toeR, toeG, toeB, shoulderR, shoulderG, shoulderB, 0] uniform for the shader. */
export function filmDensityUniform(params: ParamDict): number[] {
  const preset: FilmDensityPreset = FILM_DENSITY_PRESETS[filmDensityPresetName(params)];
  const amount = filmDensityAmount(params);
  return [amount, preset.toe[0], preset.toe[1], preset.toe[2], preset.shoulder[0], preset.shoulder[1], preset.shoulder[2], 0];
}
