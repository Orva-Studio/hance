import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import type { GradeOptions, HalationOptions, AberrationOptions, WeaveOptions } from "./types";

export interface PresetData {
  [key: string]: string | number | undefined;
}

interface EffectOptions {
  grade: GradeOptions;
  halation: HalationOptions;
  aberration: AberrationOptions;
  weave: WeaveOptions;
  preset: "fast" | "medium" | "slow";
  crf: number;
}

function builtinPresetsDir(): string {
  return join(import.meta.dir, "..", "presets");
}

function userPresetsDir(): string {
  return join(homedir(), ".openhancer", "presets");
}

export function loadPreset(name: string): PresetData {
  const userPath = join(userPresetsDir(), `${name}.json`);
  if (existsSync(userPath)) {
    return JSON.parse(readFileSync(userPath, "utf-8"));
  }

  const builtinPath = join(builtinPresetsDir(), `${name}.json`);
  if (existsSync(builtinPath)) {
    return JSON.parse(readFileSync(builtinPath, "utf-8"));
  }

  throw new Error(`Preset "${name}" not found. Looked in:\n  ${userPresetsDir()}\n  ${builtinPresetsDir()}`);
}

export function applyPreset(
  name: string,
  overrides: PresetData
): EffectOptions {
  const defaults = loadPreset("default");
  const named = name === "default" ? {} : loadPreset(name);
  const merged = { ...defaults, ...named, ...overrides };

  const grade: GradeOptions = {
    liftBlacks: Number(merged["lift"] ?? 0.05),
    crushWhites: Number(merged["crush"] ?? 0.04),
    shadowTint: (merged["shadow-tint"] as GradeOptions["shadowTint"]) ?? "warm",
    highlightTint: (merged["highlight-tint"] as GradeOptions["highlightTint"]) ?? "cool",
    fade: Number(merged["fade"] ?? 0.15),
  };

  const halation: HalationOptions = {
    intensity: Number(merged["halation-intensity"] ?? 0.6),
    radius: Number(merged["halation-radius"] ?? 51),
    threshold: Number(merged["halation-threshold"] ?? 180),
    warmth: Number(merged["halation-warmth"] ?? 0.7),
  };

  const aberration: AberrationOptions = {
    strength: Number(merged["aberration"] ?? 0.3),
  };

  const weave: WeaveOptions = {
    strength: Number(merged["weave"] ?? 0.3),
  };

  const preset = (merged["encode-preset"] as EffectOptions["preset"]) ?? "medium";
  const crf = Number(merged["crf"] ?? 18);

  return { grade, halation, aberration, weave, preset, crf };
}
