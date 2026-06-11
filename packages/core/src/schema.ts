import { FADE_COLOR_HUES } from "./render-constants";

/** Sugar flag that maps to a fixed value of another option, e.g. `--vlog`. */
export interface OptionAlias {
  flag: string;
  value: string | boolean;
  help: string;
}

/** Help metadata shared by every option, used to generate CLI flags + help. */
interface OptionMeta {
  /** Human-readable help blurb shown in `--help`. */
  description: string;
  /** CLI flag override when it is not simply `--<key>` (e.g. `--input-lut`). */
  flag?: string;
  /** Optional sugar alias flag. */
  alias?: OptionAlias;
}

export interface RangeOption extends OptionMeta {
  key: string;
  label: string;
  type: "range";
  min: number;
  max: number;
  step: number;
  default: number;
}

export interface SelectOption extends OptionMeta {
  key: string;
  label: string;
  type: "select";
  choices: string[];
  default: string;
}

export interface BooleanOption extends OptionMeta {
  key: string;
  label: string;
  type: "boolean";
  default: boolean;
}

export type OptionDef = RangeOption | SelectOption | BooleanOption;

export interface EffectGroup {
  key: string;
  label: string;
  enableKey: string;
  /** Help line for the `--<enableKey>` toggle. Defaults to `Disable <label>`. */
  enableHelp?: string;
  options: OptionDef[];
}

export const EFFECT_SCHEMA: EffectGroup[] = [
  {
    key: "inputLut",
    label: "Input LUT",
    enableKey: "no-input-lut",
    enableHelp: "Disable the input LUT",
    options: [
      { key: "input-lut-profile", label: "Profile", type: "select", choices: ["rec709", "vlog"], default: "rec709", flag: "--input-lut", description: "Pre-LUT applied before grading", alias: { flag: "--vlog", value: "vlog", help: "Sugar for --input-lut vlog (Panasonic V-Log)" } },
    ],
  },
  {
    key: "colorSettings",
    label: "Color Settings",
    enableKey: "no-color-settings",
    options: [
      { key: "exposure", label: "Exposure", type: "range", min: -2, max: 2, step: 0.01, default: 0, description: "Exposure adjustment" },
      { key: "contrast", label: "Contrast", type: "range", min: 0, max: 3, step: 0.01, default: 1, description: "Contrast multiplier" },
      { key: "highlights", label: "Highlights", type: "range", min: -1, max: 1, step: 0.01, default: 0, description: "Highlight compression" },
      { key: "fade", label: "Fade", type: "range", min: 0, max: 1, step: 0.01, default: 0, description: "Fade / lift blacks" },
      { key: "fade-color", label: "Fade Color", type: "select", choices: ["neutral", "warm", "green", "teal", "magenta"], default: "neutral", description: "Tint of the lifted blacks" },
      { key: "white-balance", label: "White Balance", type: "range", min: 1000, max: 15000, step: 100, default: 6500, description: "Color temperature in Kelvin" },
      { key: "tint", label: "Tint", type: "range", min: -100, max: 100, step: 1, default: 0, description: "Green-magenta tint" },
      { key: "subtractive-sat", label: "Subtractive Saturation", type: "range", min: 0, max: 3, step: 0.01, default: 1, description: "Subtractive saturation" },
      { key: "richness", label: "Richness", type: "range", min: 0, max: 3, step: 0.01, default: 1, description: "Color richness" },
      { key: "bleach-bypass", label: "Bleach Bypass", type: "range", min: 0, max: 1, step: 0.01, default: 0, description: "Bleach bypass amount" },
    ],
  },
  {
    key: "halation",
    label: "Halation",
    enableKey: "no-halation",
    options: [
      { key: "halation-amount", label: "Amount", type: "range", min: 0, max: 1, step: 0.01, default: 0.25, description: "Halation strength" },
      { key: "halation-radius", label: "Radius", type: "range", min: 1, max: 100, step: 1, default: 4, description: "Blur radius" },
      { key: "halation-highlights-only", label: "Highlights Only", type: "boolean", default: true, description: "Restrict to highlights" },
    ],
  },
  {
    key: "aberration",
    label: "Chromatic Aberration",
    enableKey: "no-aberration",
    options: [
      { key: "aberration", label: "Amount", type: "range", min: 0, max: 1, step: 0.01, default: 0.3, description: "Aberration amount" },
    ],
  },
  {
    key: "bloom",
    label: "Bloom",
    enableKey: "no-bloom",
    options: [
      { key: "bloom-amount", label: "Amount", type: "range", min: 0, max: 1, step: 0.01, default: 0.25, description: "Bloom strength" },
      { key: "bloom-radius", label: "Radius", type: "range", min: 1, max: 100, step: 1, default: 10, description: "Bloom blur radius" },
    ],
  },
  {
    key: "grain",
    label: "Grain",
    enableKey: "no-grain",
    options: [
      { key: "grain-iso", label: "ISO", type: "range", min: 0, max: 3200, step: 50, default: 400, description: "Grain intensity as virtual film speed (0 = off, 3200 = heavy)" },
      { key: "grain-size", label: "Size", type: "range", min: 0, max: 5, step: 0.1, default: 0, description: "Grain particle size (0 = finest, higher = coarser)" },
      { key: "grain-saturation", label: "Saturation", type: "range", min: 0, max: 1, step: 0.01, default: 0.3, description: "Grain color saturation" },
    ],
  },
  {
    key: "vignette",
    label: "Vignette",
    enableKey: "no-vignette",
    options: [
      { key: "vignette-amount", label: "Amount", type: "range", min: 0, max: 1, step: 0.01, default: 0.25, description: "Vignette strength" },
      { key: "vignette-size", label: "Size", type: "range", min: 0, max: 1, step: 0.01, default: 0.25, description: "Vignette size" },
    ],
  },
  {
    key: "splitTone",
    label: "Split Tone",
    enableKey: "no-split-tone",
    options: [
      { key: "split-tone-protect-neutrals", label: "Protect Neutrals", type: "boolean", default: false, description: "Protect neutral colors" },
      { key: "split-tone-amount", label: "Amount", type: "range", min: 0, max: 1, step: 0.01, default: 0, description: "Toning amount" },
      { key: "split-tone-shadow-hue", label: "Shadow Hue", type: "range", min: 0, max: 360, step: 1, default: 30, description: "Shadow hue in degrees" },
      { key: "split-tone-highlight-hue", label: "Highlight Hue", type: "range", min: 0, max: 360, step: 1, default: 210, description: "Highlight hue in degrees" },
      { key: "split-tone-highlight-strength", label: "Highlight Strength", type: "range", min: 0, max: 1, step: 0.01, default: 0.5, description: "Highlight tint strength relative to shadows" },
      { key: "split-tone-pivot", label: "Pivot", type: "range", min: 0, max: 1, step: 0.01, default: 0.3, description: "Shadow/highlight pivot" },
    ],
  },
  {
    key: "colorWheels",
    label: "Color Wheels",
    enableKey: "no-color-wheels",
    enableHelp: "Disable color wheels (lift/gamma/gain)",
    options: [
      { key: "lift-r", label: "Lift R", type: "range", min: -1, max: 1, step: 0.01, default: 0, description: "Shadow offset, red channel" },
      { key: "lift-g", label: "Lift G", type: "range", min: -1, max: 1, step: 0.01, default: 0, description: "Shadow offset, green channel" },
      { key: "lift-b", label: "Lift B", type: "range", min: -1, max: 1, step: 0.01, default: 0, description: "Shadow offset, blue channel" },
      { key: "gamma-r", label: "Gamma R", type: "range", min: 0.2, max: 5, step: 0.01, default: 1, description: "Midtone power, red channel" },
      { key: "gamma-g", label: "Gamma G", type: "range", min: 0.2, max: 5, step: 0.01, default: 1, description: "Midtone power, green channel" },
      { key: "gamma-b", label: "Gamma B", type: "range", min: 0.2, max: 5, step: 0.01, default: 1, description: "Midtone power, blue channel" },
      { key: "gain-r", label: "Gain R", type: "range", min: 0, max: 4, step: 0.01, default: 1, description: "Highlight multiply, red channel" },
      { key: "gain-g", label: "Gain G", type: "range", min: 0, max: 4, step: 0.01, default: 1, description: "Highlight multiply, green channel" },
      { key: "gain-b", label: "Gain B", type: "range", min: 0, max: 4, step: 0.01, default: 1, description: "Highlight multiply, blue channel" },
    ],
  },
  {
    key: "cameraShake",
    label: "Camera Shake",
    enableKey: "no-camera-shake",
    options: [
      { key: "camera-shake-amount", label: "Amount", type: "range", min: 0, max: 1, step: 0.01, default: 0.25, description: "Shake intensity" },
      { key: "camera-shake-rate", label: "Rate", type: "range", min: 0, max: 2, step: 0.01, default: 0.5, description: "Shake speed" },
    ],
  },
];

export function getDefaults(): Record<string, string | number | boolean> {
  const defaults: Record<string, string | number | boolean> = {};
  for (const group of EFFECT_SCHEMA) {
    for (const opt of group.options) {
      defaults[opt.key] = opt.default;
    }
  }
  return defaults;
}

/**
 * Seed schema defaults under successive override layers. This is the single
 * place the "every exposed param is populated" invariant lives — `applyPreset`,
 * the UI server's `/api/look`, and the App's initial state all funnel through
 * here so the renderers (TS preview + Rust export) can drop their inline
 * fallbacks. Later layers win; an explicit `undefined` in a layer is ignored so
 * a sparse look can never clobber a default back to undefined → NaN.
 */
export function seedDefaults(
  ...layers: Array<Record<string, string | number | boolean | undefined> | undefined>
): Record<string, string | number | boolean> {
  const result = getDefaults();
  for (const layer of layers) {
    if (!layer) continue;
    for (const [key, value] of Object.entries(migrateLegacyParams(layer))) {
      if (value !== undefined) result[key] = value;
    }
  }
  return result;
}

type ParamLayer = Record<string, string | number | boolean | undefined>;

/**
 * Rewrite removed params to their current equivalents so old looks and flags
 * keep rendering the same. Applied per layer in seedDefaults, the single
 * funnel every param source passes through.
 *
 * `split-tone-hue` + `split-tone-mode` → per-band hues: shadows take the hue;
 * highlights take the same hue (natural) or its opposite (complementary).
 * Legacy complementary tinted highlights at the full shadow scale, so it also
 * sets `split-tone-highlight-strength` to 1 (vs the 0.5 default).
 *
 * `grain-amount` (+ old multiplier-style `grain-iso`) → intensity-driving
 * `grain-iso`. The old shader applied amount * iso/400; the new one applies
 * iso/3200, so the equivalent ISO is 8 * amount * oldIso, snapped to the
 * 50-step grid. `grain-defocus` is dropped (the defocus pre-blur is gone).
 *
 * `fade-tint` + `fade-hue` → named `fade-color`: neutral when the tint was
 * weak (< 0.25), else the named color whose hue is circularly nearest.
 */
export function migrateLegacyParams(layer: ParamLayer): ParamLayer {
  layer = migrateSplitTone(layer);
  layer = migrateGrain(layer);
  layer = migrateFade(layer);
  return layer;
}

function migrateSplitTone(layer: ParamLayer): ParamLayer {
  const hue = layer["split-tone-hue"];
  const mode = layer["split-tone-mode"];
  if (hue === undefined && mode === undefined) return layer;

  const { "split-tone-hue": _hue, "split-tone-mode": _mode, ...out } = layer;
  const shadowHue = typeof hue === "number" ? hue : 20;
  const complementary = mode === "complementary";
  out["split-tone-shadow-hue"] ??= shadowHue;
  out["split-tone-highlight-hue"] ??= complementary ? (shadowHue + 180) % 360 : shadowHue;
  if (complementary) out["split-tone-highlight-strength"] ??= 1;
  return out;
}

function migrateGrain(layer: ParamLayer): ParamLayer {
  const amount = layer["grain-amount"];
  if (amount === undefined && layer["grain-defocus"] === undefined) return layer;

  const { "grain-amount": _amount, "grain-defocus": _defocus, ...out } = layer;
  if (typeof amount === "number") {
    const oldIso = typeof out["grain-iso"] === "number" ? (out["grain-iso"] as number) : 400;
    const iso = Math.round((8 * amount * oldIso) / 50) * 50;
    // Snapping can land on 0 for near-zero amounts — that's correct: the old
    // amount 0 meant "no grain", and ISO 0 keeps grain off.
    out["grain-iso"] = Math.min(3200, Math.max(0, iso));
  }
  return out;
}

function migrateFade(layer: ParamLayer): ParamLayer {
  const tint = layer["fade-tint"];
  const hue = layer["fade-hue"];
  if (tint === undefined && hue === undefined) return layer;

  const { "fade-tint": _tint, "fade-hue": _hue, ...out } = layer;
  const strength = typeof tint === "number" ? tint : 0;
  if (strength < 0.25) {
    out["fade-color"] ??= "neutral";
    return out;
  }
  const hueDeg = typeof hue === "number" ? hue : 0;
  let best = "warm";
  let bestDist = Infinity;
  for (const [name, h] of Object.entries(FADE_COLOR_HUES)) {
    const d = Math.abs(((hueDeg - h + 540) % 360) - 180);
    if (d < bestDist) { bestDist = d; best = name; }
  }
  out["fade-color"] ??= best;
  return out;
}
