import type { PresetData, OutputCodec, ExportPreset, OptionDef, EffectGroup } from "@hance/core";
import { EFFECT_SCHEMA } from "@hance/core";

// ---------------------------------------------------------------------------
// Non-effect flags — these are not effect params and so don't live in the
// schema. They are the only hand-maintained flag entries left in this file.
// ---------------------------------------------------------------------------

const CODECS = ["h264", "prores", "h265"] as const;
const ENCODE_PRESETS = ["fast", "medium", "slow"] as const;
const EXPORT_PRESETS = ["low", "medium", "high", "max"] as const;

const NON_EFFECT_FLAGS = new Set([
  "--output", "-o", "--preset", "--codec", "--encode-preset", "--crf",
  "--blend", "--export", "--no-config", "--help", "-h",
]);

// ---------------------------------------------------------------------------
// Schema-derived flag metadata
// ---------------------------------------------------------------------------

/** The CLI flag for an option: its `flag` override, else `--<key>`. */
function optionFlag(opt: OptionDef): string {
  return opt.flag ?? `--${opt.key}`;
}

interface FlagBinding {
  group: EffectGroup;
  opt: OptionDef;
  /** When set, this flag is an alias that writes a fixed value. */
  aliasValue?: string | boolean;
}

/** flag string -> how to apply it. Built once from the schema. */
const FLAG_BINDINGS = new Map<string, FlagBinding>();
const ENABLE_FLAGS = new Map<string, EffectGroup>();

for (const group of EFFECT_SCHEMA) {
  ENABLE_FLAGS.set(`--${group.enableKey}`, group);
  for (const opt of group.options) {
    FLAG_BINDINGS.set(optionFlag(opt), { group, opt });
    if (opt.alias) {
      FLAG_BINDINGS.set(opt.alias.flag, { group, opt, aliasValue: opt.alias.value });
    }
  }
}

// Removed flags still accepted for compatibility. Their values pass through as
// legacy params and are rewritten by core's migrateLegacyParams (seedDefaults).
const LEGACY_FLAGS = new Map<string, { hint: string; parse: (val: string, flag: string) => string | number }>([
  ["--split-tone-hue", {
    hint: "use --split-tone-shadow-hue / --split-tone-highlight-hue",
    parse: (val, flag) => parseNum(val, flag, 0, 360),
  }],
  ["--split-tone-mode", {
    hint: "use --split-tone-shadow-hue / --split-tone-highlight-hue",
    parse: (val, flag) => oneOf(val, flag, ["natural", "complementary"] as const),
  }],
  ["--grain-amount", {
    hint: "use --grain-iso",
    parse: (val, flag) => parseNum(val, flag, 0, 1),
  }],
  ["--grain-defocus", {
    hint: "use --grain-iso",
    parse: (val, flag) => parseNum(val, flag, 0, 5),
  }],
  ["--fade-tint", {
    hint: "use --fade-color",
    parse: (val, flag) => parseNum(val, flag, 0, 1),
  }],
  ["--fade-hue", {
    hint: "use --fade-color",
    parse: (val, flag) => parseNum(val, flag, 0, 360),
  }],
]);

const KNOWN_FLAGS = new Set<string>([
  ...NON_EFFECT_FLAGS,
  ...ENABLE_FLAGS.keys(),
  ...FLAG_BINDINGS.keys(),
  ...LEGACY_FLAGS.keys(),
]);

/** Flags that take no value. */
const BOOLEAN_FLAGS = new Set<string>(["--no-config", ...ENABLE_FLAGS.keys()]);
for (const [flag, b] of FLAG_BINDINGS) {
  if (b.aliasValue !== undefined || b.opt.type === "boolean") BOOLEAN_FLAGS.add(flag);
}

// ---------------------------------------------------------------------------
// Generated help text
// ---------------------------------------------------------------------------

function rangeHint(min: number, max: number): string {
  const span = min < 0 ? `${min} to ${max}` : `${min}-${max}`;
  return `<${span}>`;
}

function valueHint(opt: OptionDef): string {
  if (opt.type === "range") return rangeHint(opt.min, opt.max);
  if (opt.type === "select") return `<${opt.choices.join("|")}>`;
  return "";
}

/** The `flag + hint` head of a help line, used both to render and to size the
 *  description column so every effect line aligns. */
function optionHead(opt: OptionDef): string {
  const hint = valueHint(opt);
  return hint ? `${optionFlag(opt)} ${hint}` : optionFlag(opt);
}

function groupHelp(group: EffectGroup, pad: number): string {
  const lines = [`  ${group.label}:`];
  const fmt = (head: string, tail: string) => `  ${head.padEnd(pad)}  ${tail}`;
  for (const opt of group.options) {
    const tail = opt.description ? `${opt.description} (default: ${opt.default})` : `(default: ${opt.default})`;
    lines.push(fmt(optionHead(opt), tail));
    if (opt.alias) lines.push(fmt(opt.alias.flag, opt.alias.help));
  }
  lines.push(fmt(`--${group.enableKey}`, group.enableHelp ?? `Disable ${group.label.toLowerCase()}`));
  return lines.join("\n");
}

const HELP_COLUMN = Math.max(
  ...EFFECT_SCHEMA.flatMap(g => [
    `--${g.enableKey}`.length,
    ...g.options.flatMap(o => [optionHead(o).length, o.alias?.flag.length ?? 0]),
  ]),
);

export const EFFECT_HELP_TEXT = EFFECT_SCHEMA.map(g => groupHelp(g, HELP_COLUMN)).join("\n\n");

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

function parseNum(value: string, flag: string, min: number, max: number): number {
  const n = parseFloat(value);
  if (isNaN(n) || n < min || n > max) {
    throw new Error(`${flag} must be between ${min} and ${max}, got ${value}`);
  }
  return n;
}

function oneOf<T extends string>(value: string, flag: string, choices: readonly T[]): T {
  if (!(choices as readonly string[]).includes(value)) {
    throw new Error(`${flag} must be ${choices.join(", ")}, got ${value}`);
  }
  return value as T;
}

export interface ParsedEffectFlags {
  overrides: PresetData;
  positional: string[];
  presetName: string;
  outputArg: string;
  exportPreset: ExportPreset | undefined;
  overrideCodec: OutputCodec | undefined;
  overrideCrf: number | undefined;
  overrideEncodePreset: "fast" | "medium" | "slow" | undefined;
  help: boolean;
}

export function parseEffectFlags(argv: string[]): ParsedEffectFlags {
  const overrides: PresetData = {};
  const positional: string[] = [];
  let presetName = "default";
  let outputArg = "";
  let help = false;
  let exportPreset: ExportPreset | undefined;
  let overrideCodec: OutputCodec | undefined;
  let overrideCrf: number | undefined;
  let overrideEncodePreset: "fast" | "medium" | "slow" | undefined;

  let i = 0;
  while (i < argv.length) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") { help = true; i++; continue; }
    if (!arg.startsWith("-")) { positional.push(arg); i++; continue; }
    if (!KNOWN_FLAGS.has(arg)) throw new Error(`Unknown flag: ${arg}. Use --help for usage.`);

    // Boolean flags (effect toggles, aliases, boolean options, --no-config).
    if (BOOLEAN_FLAGS.has(arg)) {
      if (arg === "--no-config") { i++; continue; }
      const enableGroup = ENABLE_FLAGS.get(arg);
      if (enableGroup) { overrides[enableGroup.enableKey] = true; i++; continue; }
      const binding = FLAG_BINDINGS.get(arg)!;
      overrides[binding.opt.key] = binding.aliasValue ?? true;
      i++; continue;
    }

    const val = argv[i + 1];
    if (val === undefined) throw new Error(`${arg} requires a value`);

    // Non-effect value flags.
    switch (arg) {
      case "--output": case "-o": outputArg = val; i += 2; continue;
      case "--preset": presetName = val; i += 2; continue;
      case "--codec":
        overrideCodec = oneOf(val, "--codec", CODECS); overrides["codec"] = overrideCodec; i += 2; continue;
      case "--encode-preset":
        overrideEncodePreset = oneOf(val, "--encode-preset", ENCODE_PRESETS); overrides["encode-preset"] = overrideEncodePreset; i += 2; continue;
      case "--export":
        exportPreset = oneOf(val, "--export", EXPORT_PRESETS); i += 2; continue;
      case "--crf":
        overrideCrf = parseNum(val, "--crf", 0, 51); overrides["crf"] = overrideCrf; i += 2; continue;
      case "--blend":
        overrides["blend"] = parseNum(val, "--blend", 0, 1); i += 2; continue;
    }

    // Legacy value flags — accepted with a warning, migrated in seedDefaults.
    const legacy = LEGACY_FLAGS.get(arg);
    if (legacy) {
      console.error(`Warning: ${arg} is deprecated; ${legacy.hint}`);
      overrides[arg.slice(2)] = legacy.parse(val, arg);
      i += 2; continue;
    }

    // Schema-derived value flags (range + select).
    const binding = FLAG_BINDINGS.get(arg)!;
    const opt = binding.opt;
    if (opt.type === "range") {
      overrides[opt.key] = parseNum(val, arg, opt.min, opt.max);
    } else if (opt.type === "select") {
      overrides[opt.key] = oneOf(val, arg, opt.choices);
    }
    i += 2;
  }

  return { overrides, positional, presetName, outputArg, exportPreset, overrideCodec, overrideCrf, overrideEncodePreset, help };
}
