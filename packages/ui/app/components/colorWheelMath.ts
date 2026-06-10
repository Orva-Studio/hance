export type Zone = "lift" | "gamma" | "gain";

export interface ZoneDef {
  /** schema key prefix: `${prefix}-r` etc. */
  prefix: Zone;
  label: string;
  neutral: number;
  min: number;
  max: number;
  /** deviation at puck radius 1 (full saturation push) */
  scale: number;
}

export const ZONES: Record<Zone, ZoneDef> = {
  lift: { prefix: "lift", label: "Lift", neutral: 0, min: -1, max: 1, scale: 0.25 },
  gamma: { prefix: "gamma", label: "Gamma", neutral: 1, min: 0.2, max: 5, scale: 0.5 },
  gain: { prefix: "gain", label: "Gain", neutral: 1, min: 0, max: 4, scale: 0.5 },
};

// Color plane basis: R at angle 0 (east), G at 120 deg, B at 240 deg.
// A puck at (x, y) produces a mean-zero RGB deviation, so dragging the puck
// never changes the master (luma) value, and the master slider never moves
// the puck — the two controls are orthogonal.
const BASIS: [number, number][] = [
  [Math.cos(0), Math.sin(0)],                       // R
  [Math.cos((2 * Math.PI) / 3), Math.sin((2 * Math.PI) / 3)],   // G
  [Math.cos((4 * Math.PI) / 3), Math.sin((4 * Math.PI) / 3)],   // B
];

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

/** Puck position + master -> [r, g, b] schema values for the zone. */
export function rgbFromWheel(zone: Zone, x: number, y: number, master: number): [number, number, number] {
  const def = ZONES[zone];
  const rgb = BASIS.map(([bx, by]) => {
    // dot(puck, basis) * 2/3 makes the basis projection exactly invertible
    // (the three 120-degree-spaced unit vectors are an overcomplete frame
    // with frame bound 3/2).
    const dev = (x * bx + y * by) * (2 / 3) * def.scale;
    return clamp(master + dev, def.min, def.max);
  });
  return [rgb[0], rgb[1], rgb[2]];
}

/** [r, g, b] schema values -> puck position + master. */
export function wheelFromRgb(zone: Zone, r: number, g: number, b: number): { x: number; y: number; master: number } {
  const def = ZONES[zone];
  const master = (r + g + b) / 3;
  const dev = [r - master, g - master, b - master];
  let x = 0;
  let y = 0;
  for (let i = 0; i < 3; i++) {
    x += dev[i] * BASIS[i][0];
    y += dev[i] * BASIS[i][1];
  }
  return { x: x / def.scale, y: y / def.scale, master };
}

/** True when the zone's three values are all at neutral. */
export function zoneIsNeutral(zone: Zone, r: number, g: number, b: number): boolean {
  const n = ZONES[zone].neutral;
  return r === n && g === n && b === n;
}
