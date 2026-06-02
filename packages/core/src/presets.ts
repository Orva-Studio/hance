import { existsSync, readFileSync, readdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import type {
  ColorSettingsOptions, HalationOptions, AberrationOptions,
  BloomOptions, GrainOptions, VignetteOptions, SplitToneOptions, CameraShakeOptions,
  FilmOptions, OutputCodec, LicenseContext, InputLutOptions,
} from "./types";

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
  const merged = { ...defaults, ...named, ...overrides };

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
    exposure: Number(merged["exposure"] ?? 0),
    contrast: Number(merged["contrast"] ?? 1),
    highlights: Number(merged["highlights"] ?? 0),
    fade: Number(merged["fade"] ?? 0),
    whiteBalance: Number(merged["white-balance"] ?? 6500),
    tint: Number(merged["tint"] ?? 0),
    subtractiveSat: Number(merged["subtractive-sat"] ?? 1),
    richness: Number(merged["richness"] ?? 1),
    bleachBypass: Number(merged["bleach-bypass"] ?? 0),
  };

  const halation: HalationOptions = {
    enabled: merged["no-halation"] ? false : true,
    amount: Number(merged["halation-amount"] ?? 0.25),
    radius: Number(merged["halation-radius"] ?? 4),
    saturation: Number(merged["halation-saturation"] ?? 1),
    hue: Number(merged["halation-hue"] ?? 0.04),
    highlightsOnly: Boolean(merged["halation-highlights-only"] ?? true),
  };

  const aberration: AberrationOptions = {
    enabled: merged["no-aberration"] ? false : true,
    amount: Number(merged["aberration"] ?? 0.3),
  };

  const bloom: BloomOptions = {
    enabled: merged["no-bloom"] ? false : true,
    amount: Number(merged["bloom-amount"] ?? 0.25),
    radius: Number(merged["bloom-radius"] ?? 10),
  };

  const grain: GrainOptions = {
    enabled: merged["no-grain"] ? false : true,
    amount: Number(merged["grain-amount"] ?? 0.125),
    size: Number(merged["grain-size"] ?? 0),
    softness: Number(merged["grain-softness"] ?? 0.1),
    saturation: Number(merged["grain-saturation"] ?? 0.3),
    imageDefocus: Number(merged["grain-defocus"] ?? 1),
  };

  const vignette: VignetteOptions = {
    enabled: merged["no-vignette"] ? false : true,
    amount: Number(merged["vignette-amount"] ?? 0.25),
    size: Number(merged["vignette-size"] ?? 0.25),
  };

  const splitTone: SplitToneOptions = {
    enabled: merged["no-split-tone"] ? false : true,
    mode: (merged["split-tone-mode"] as SplitToneOptions["mode"]) ?? "natural",
    protectNeutrals: Boolean(merged["split-tone-protect-neutrals"] ?? false),
    amount: Number(merged["split-tone-amount"] ?? 0),
    hueAngle: Number(merged["split-tone-hue"] ?? 20),
    pivot: Number(merged["split-tone-pivot"] ?? 0.3),
  };

  const cameraShake: CameraShakeOptions = {
    enabled: merged["no-camera-shake"] ? false : true,
    amount: Number(merged["camera-shake-amount"] ?? 0.25),
    rate: Number(merged["camera-shake-rate"] ?? 0.5),
  };

  const encodePreset = (merged["encode-preset"] as EffectOptions["encodePreset"]) ?? "medium";
  const codec = (merged["codec"] as OutputCodec) ?? "h264";
  const crf = Number(merged["crf"] ?? 18);
  const blend = Number(merged["blend"] ?? 1);
  const pixelFormat = "yuv420p";

  return { encodePreset, codec, crf, blend, pixelFormat, inputLut, colorSettings, halation, aberration, bloom, grain, vignette, splitTone, cameraShake, mergedParams: merged };
}
