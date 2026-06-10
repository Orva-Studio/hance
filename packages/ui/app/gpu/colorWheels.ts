import type { PreviewParams } from "./renderer";

const NEUTRAL: Record<string, number> = {
  "lift-r": 0, "lift-g": 0, "lift-b": 0,
  "gamma-r": 1, "gamma-g": 1, "gamma-b": 1,
  "gain-r": 1, "gain-g": 1, "gain-b": 1,
};

function num(params: PreviewParams, key: string): number {
  const v = params[key];
  return typeof v === "number" ? v : NEUTRAL[key];
}

export function isColorWheelsActive(params: PreviewParams): boolean {
  if (params["no-color-wheels"] === true) return false;
  return Object.keys(NEUTRAL).some(key => num(params, key) !== NEUTRAL[key]);
}

/** [liftR, liftG, liftB, 0, gammaR, gammaG, gammaB, 0, gainR, gainG, gainB, 0] */
export function colorWheelsUniform(params: PreviewParams): Float32Array {
  return new Float32Array([
    num(params, "lift-r"), num(params, "lift-g"), num(params, "lift-b"), 0,
    num(params, "gamma-r"), num(params, "gamma-g"), num(params, "gamma-b"), 0,
    num(params, "gain-r"), num(params, "gain-g"), num(params, "gain-b"), 0,
  ]);
}
