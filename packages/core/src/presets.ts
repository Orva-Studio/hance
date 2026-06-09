import { existsSync, readFileSync, readdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import type {
  ColorSettingsOptions, HalationOptions, AberrationOptions,
  BloomOptions, GrainOptions, VignetteOptions, SplitToneOptions, CameraShakeOptions,
  FilmOptions, OutputCodec, LicenseContext, InputLutOptions,
} from "./types";
import { seedDefaults } from "./schema";

export interface PresetData {
  [key: string]: string | number | boolean | undefined;
}

type EffectOptions = Omit<FilmOptions, "input" | "output">;

export function builtinPresetsDir(): string {
  const repoDir = join(import.meta.dir, "..", "..", "..", "presets");
  if (existsSync(repoDir)) return repoDir;
  return join(homedir(), ".hance", "presets");
}

export function userPresetsDir(): string {
  return join(homedir(), ".hance", "presets");
}

export function listPresetNames(): string[] {
  const names = new Set<string>();
  for (const dir of [userPresetsDir(), builtinPresetsDir()]) {
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir)) {
      if (!f.endsWith(".hlook") && !f.endsWith(".json")) continue;
      const name = f.replace(/\.(hlook|json)$/, "");
      if (name === "default" || name === "index") continue;
      names.add(name);
    }
  }
  return [...names].sort();
}

function findPresetFile(name: string): { path: string; premium: boolean } | null {
  for (const dir of [userPresetsDir(), builtinPresetsDir()]) {
    for (const ext of [".hlook", ".json"]) {
      const filePath = join(dir, `${name}${ext}`);
      if (existsSync(filePath)) return { path: filePath, premium: false };
      const premiumPath = join(dir, "premium", `${name}${ext}`);
      if (existsSync(premiumPath)) return { path: premiumPath, premium: true };
    }
  }
  return null;
}

export function loadPreset(name: string, license?: LicenseContext): PresetData {
  const found = findPresetFile(name);
  if (!found) {
    throw new Error(`Look "${name}" not found. Looked in:\n  ${userPresetsDir()}\n  ${builtinPresetsDir()}`);
  }
  const data: PresetData = JSON.parse(readFileSync(found.path, "utf-8"));
  const isPremium = found.premium || data.premium === true;
  if (isPremium && license && license.tier !== "pro") {
    throw new Error(`Preset "${name}" requires a pro license`);
  }
  return data;
}

export function exportLook(name: string, data: PresetData): string {
  return JSON.stringify({ name, ...data }, null, 2);
}

export function importLook(json: string): PresetData {
  const parsed = JSON.parse(json);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("Invalid look file: expected a JSON object");
  }
  return parsed as PresetData;
}

interface ApplyPresetResult extends EffectOptions {
  mergedParams: PresetData;
}

function unwrapLookParams(data: PresetData): PresetData {
  if (data.params && typeof data.params === "object") {
    return data.params as PresetData;
  }
  return data;
}

export function applyPreset(
  name: string,
  overrides: PresetData
): ApplyPresetResult {
  const defaultRaw = loadPreset("default");
  const namedRaw = name === "default" ? {} : loadPreset(name);
  const defaults = unwrapLookParams(defaultRaw);
  const named = name === "default" ? {} : unwrapLookParams(namedRaw);
  // Schema defaults seed the merge so every exposed param is populated once,
  // from a single source (seedDefaults). Renderers (TS preview + Rust export)
  // and the option builders below all read fully-populated params and need no
  // inline fallbacks.
  const merged = seedDefaults(defaults, named, overrides);

  // A look may carry the input/pre-LUT as a top-level `preLut` string. Fold it
  // into the merged params so it flows through to the renderers like any option.
  const preLut = overrides.preLut ?? namedRaw.preLut ?? defaultRaw.preLut;
  if (typeof preLut === "string") {
    merged["input-lut-profile"] = preLut;
  }

  const inputLut: InputLutOptions = {
    enabled: merged["no-input-lut"] ? false : true,
    profile: merged["input-lut-profile"] === "vlog" ? "vlog" : "rec709",
  };

  const colorSettings: ColorSettingsOptions = {
    enabled: merged["no-color-settings"] ? false : true,
    exposure: Number(merged["exposure"]),
    contrast: Number(merged["contrast"]),
    highlights: Number(merged["highlights"]),
    fade: Number(merged["fade"]),
    fadeTint: Number(merged["fade-tint"]),
    fadeHue: Number(merged["fade-hue"]),
    whiteBalance: Number(merged["white-balance"]),
    tint: Number(merged["tint"]),
    subtractiveSat: Number(merged["subtractive-sat"]),
    richness: Number(merged["richness"]),
    bleachBypass: Number(merged["bleach-bypass"]),
  };

  const halation: HalationOptions = {
    enabled: merged["no-halation"] ? false : true,
    amount: Number(merged["halation-amount"]),
    radius: Number(merged["halation-radius"]),
    highlightsOnly: Boolean(merged["halation-highlights-only"]),
  };

  const aberration: AberrationOptions = {
    enabled: merged["no-aberration"] ? false : true,
    amount: Number(merged["aberration"]),
  };

  const bloom: BloomOptions = {
    enabled: merged["no-bloom"] ? false : true,
    amount: Number(merged["bloom-amount"]),
    radius: Number(merged["bloom-radius"]),
  };

  const grain: GrainOptions = {
    enabled: merged["no-grain"] ? false : true,
    amount: Number(merged["grain-amount"]),
    size: Number(merged["grain-size"]),
    softness: Number(merged["grain-softness"]),
    saturation: Number(merged["grain-saturation"]),
    imageDefocus: Number(merged["grain-defocus"]),
  };

  const vignette: VignetteOptions = {
    enabled: merged["no-vignette"] ? false : true,
    amount: Number(merged["vignette-amount"]),
    size: Number(merged["vignette-size"]),
  };

  const splitTone: SplitToneOptions = {
    enabled: merged["no-split-tone"] ? false : true,
    mode: merged["split-tone-mode"] as SplitToneOptions["mode"],
    protectNeutrals: Boolean(merged["split-tone-protect-neutrals"]),
    amount: Number(merged["split-tone-amount"]),
    hueAngle: Number(merged["split-tone-hue"]),
    green: Number(merged["split-tone-green"]),
    pivot: Number(merged["split-tone-pivot"]),
  };

  const cameraShake: CameraShakeOptions = {
    enabled: merged["no-camera-shake"] ? false : true,
    amount: Number(merged["camera-shake-amount"]),
    rate: Number(merged["camera-shake-rate"]),
  };

  const encodePreset = (merged["encode-preset"] as EffectOptions["encodePreset"]) ?? "medium";
  const codec = (merged["codec"] as OutputCodec) ?? "h264";
  const crf = Number(merged["crf"] ?? 18);
  const blend = Number(merged["blend"] ?? 1);
  const pixelFormat = "yuv420p";

  return { encodePreset, codec, crf, blend, pixelFormat, inputLut, colorSettings, halation, aberration, bloom, grain, vignette, splitTone, cameraShake, mergedParams: merged };
}
