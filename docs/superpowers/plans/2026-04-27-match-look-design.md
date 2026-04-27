# Match-look Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `hance preview` and `hance preset` CLI subcommands plus a `/match-look` skill so an agent can iteratively dial in a preset that matches a reference image.

**Architecture:** Split `cli.ts` into a subcommand dispatcher and a shared effect-flag parser. `preview` reuses the existing image-render path for stills; for video it seeks to 25/50/75% via FFmpeg, runs each raw frame through the existing `wgpu` sidecar (one renderer init, three `renderFrame` calls), and stitches a horizontal contact sheet. `preset save` writes `~/.hance/presets/<name>.hlook` using the same parser as `render`. Both new commands print only the absolute output path on stdout. The skill drives the iteration loop in priority order (white balance → exposure → contrast → sat → split-tone → halation → grain → vignette).

**Tech Stack:** Bun, TypeScript, FFmpeg, existing `@hance/wgpu` sidecar, `bun:test`.

---

## File Structure

**Modify:**
- `packages/cli/src/cli.ts` — replace `isSubcommand` with a dispatcher; extract shared effect-flag parsing; route `preview` / `preset` to new modules.

**Create:**
- `packages/cli/src/effect-flags.ts` — shared parser (`parseEffectFlags`, `EFFECT_FLAGS`, `BOOLEAN_EFFECT_FLAGS`, `EFFECT_HELP_TEXT`) used by `render`, `preview`, `preset save`.
- `packages/cli/src/commands/preview.ts` — `runPreview(args)` — image and video preview rendering + stitching.
- `packages/cli/src/commands/preset.ts` — `runPreset(args)` — `save` and `list` subcommands.
- `packages/cli/__tests__/effect-flags.test.ts` — parser parity tests.
- `packages/cli/__tests__/commands/preview.test.ts` — argv parsing + dispatcher unit tests.
- `packages/cli/__tests__/commands/preset.test.ts` — name validation + write/overwrite tests.
- `packages/cli/__tests__/e2e/preview.e2e.test.ts` — preview against image and video fixtures.
- `packages/cli/__tests__/e2e/preset.e2e.test.ts` — preset save → render parity.
- `.claude/skills/match-look/SKILL.md` — the `/match-look` skill.

---

## Task 1: Extract shared effect-flag parser

**Files:**
- Create: `packages/cli/src/effect-flags.ts`
- Modify: `packages/cli/src/cli.ts:85-258`
- Test: `packages/cli/__tests__/effect-flags.test.ts`

Goal: lift the effect-flag whitelist + `parseNum` + the big `switch` into a pure function `parseEffectFlags(argv: string[]): { overrides: PresetData; consumed: Set<number>; presetName: string; outputArg: string; help: boolean; }` that `render`, `preview`, and `preset save` all call. `cli.ts`'s existing `parseArgs` keeps its current signature but delegates to this.

- [ ] **Step 1: Write the failing parser-parity test**

```ts
// packages/cli/__tests__/effect-flags.test.ts
import { describe, it, expect } from "bun:test";
import { parseEffectFlags } from "../src/effect-flags";

describe("parseEffectFlags", () => {
  it("parses numeric effect flags into overrides", () => {
    const r = parseEffectFlags(["--exposure", "0.5", "--contrast", "1.2"]);
    expect(r.overrides["exposure"]).toBe(0.5);
    expect(r.overrides["contrast"]).toBe(1.2);
  });

  it("parses boolean disable flags", () => {
    const r = parseEffectFlags(["--no-grain", "--no-halation"]);
    expect(r.overrides["no-grain"]).toBe(true);
    expect(r.overrides["no-halation"]).toBe(true);
  });

  it("rejects unknown flags", () => {
    expect(() => parseEffectFlags(["--bogus", "1"])).toThrow(/Unknown flag/);
  });

  it("validates ranges", () => {
    expect(() => parseEffectFlags(["--exposure", "9"])).toThrow(/between -2 and 2/);
  });

  it("captures --preset and -o without consuming them as effect flags", () => {
    const r = parseEffectFlags(["--preset", "kodak", "-o", "out.png", "--exposure", "0.1"]);
    expect(r.presetName).toBe("kodak");
    expect(r.outputArg).toBe("out.png");
    expect(r.overrides["exposure"]).toBe(0.1);
  });

  it("collects positional args separately", () => {
    const r = parseEffectFlags(["input.mp4", "--exposure", "0.2"]);
    expect(r.positional).toEqual(["input.mp4"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test packages/cli/__tests__/effect-flags.test.ts`
Expected: FAIL — module `../src/effect-flags` does not exist.

- [ ] **Step 3: Create `packages/cli/src/effect-flags.ts`**

Move `KNOWN_FLAGS`, `BOOLEAN_FLAGS`, `parseNum`, and the per-flag `switch` body out of `cli.ts`. Export:

```ts
import type { PresetData, OutputCodec, ExportPreset } from "@hance/core";

export const EFFECT_HELP_TEXT = `\
  Color Settings:
  --exposure          <-2 to 2>     Exposure adjustment (default: 0)
  --contrast          <0-3>         Contrast multiplier (default: 1)
  --highlights        <-1 to 1>     Highlight compression (default: 0)
  --fade              <0-1>         Fade / lift blacks (default: 0)
  --white-balance     <1000-15000>  Color temperature in Kelvin (default: 6500)
  --tint              <-100 to 100> Green-magenta tint (default: 0)
  --subtractive-sat   <0-3>         Subtractive saturation (default: 1)
  --richness          <0-3>         Color richness (default: 1)
  --bleach-bypass     <0-1>         Bleach bypass amount (default: 0)
  --no-color-settings               Disable color settings

  Halation:
  --halation-amount         <0-1>   Halation strength (default: 0.25)
  --halation-radius         <1-100> Blur radius (default: 4)
  --halation-saturation     <0-3>   Glow saturation (default: 1)
  --halation-hue            <0-1>   Hue rotation 0-1 (default: 0.5)
  --halation-highlights-only        Restrict to highlights (default: true)
  --no-halation                     Disable halation

  Chromatic Aberration:
  --aberration  <0-1>       Aberration amount (default: 0.3)
  --no-aberration           Disable aberration

  Bloom:
  --bloom-amount   <0-1>    Bloom strength (default: 0.25)
  --bloom-radius   <1-100>  Bloom blur radius (default: 10)
  --no-bloom                Disable bloom

  Grain:
  --grain-amount     <0-1>    Grain intensity (default: 0.125)
  --grain-size       <0-5>    Grain particle size (default: 0)
  --grain-softness   <0-1>    Grain softness (default: 0.1)
  --grain-saturation <0-1>    Grain color saturation (default: 0.3)
  --grain-defocus    <0-5>    Image defocus amount (default: 1)
  --no-grain                  Disable grain

  Vignette:
  --vignette-amount  <0-1>   Vignette strength (default: 0.25)
  --vignette-size    <0-1>   Vignette size (default: 0.25)
  --no-vignette              Disable vignette

  Split Tone:
  --split-tone-mode      <natural|complementary>  (default: natural)
  --split-tone-protect-neutrals                   Protect neutral colors
  --split-tone-amount    <0-1>    Toning amount (default: 0)
  --split-tone-hue       <0-360>  Hue angle in degrees (default: 20)
  --split-tone-pivot     <0-1>    Shadow/highlight pivot (default: 0.3)
  --no-split-tone                 Disable split tone

  Camera Shake:
  --camera-shake-amount  <0-1>   Shake intensity (default: 0.25)
  --camera-shake-rate    <0-2>   Shake speed (default: 0.5)
  --no-camera-shake              Disable camera shake`;

const KNOWN_FLAGS = new Set([
  "--output", "-o", "--preset", "--codec", "--encode-preset", "--crf", "--blend", "--export",
  "--exposure", "--contrast", "--highlights", "--fade",
  "--white-balance", "--tint", "--subtractive-sat", "--richness", "--bleach-bypass",
  "--no-color-settings",
  "--halation-amount", "--halation-radius", "--halation-saturation", "--halation-hue",
  "--halation-highlights-only", "--no-halation",
  "--aberration", "--no-aberration",
  "--bloom-amount", "--bloom-radius", "--no-bloom",
  "--grain-amount", "--grain-size", "--grain-softness", "--grain-saturation", "--grain-defocus",
  "--no-grain",
  "--vignette-amount", "--vignette-size", "--no-vignette",
  "--split-tone-mode", "--split-tone-protect-neutrals", "--split-tone-amount",
  "--split-tone-hue", "--split-tone-pivot", "--no-split-tone",
  "--camera-shake-amount", "--camera-shake-rate", "--no-camera-shake",
  "--help", "-h",
]);

const BOOLEAN_FLAGS = new Set([
  "--help", "-h",
  "--no-color-settings", "--no-halation", "--no-aberration", "--no-bloom",
  "--no-grain", "--no-vignette", "--no-split-tone", "--no-camera-shake",
  "--halation-highlights-only", "--split-tone-protect-neutrals",
]);

function parseNum(value: string, flag: string, min: number, max: number): number {
  const n = parseFloat(value);
  if (isNaN(n) || n < min || n > max) {
    throw new Error(`${flag} must be between ${min} and ${max}, got ${value}`);
  }
  return n;
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

    if (BOOLEAN_FLAGS.has(arg)) {
      switch (arg) {
        case "--no-color-settings": overrides["no-color-settings"] = true; break;
        case "--no-halation": overrides["no-halation"] = true; break;
        case "--no-aberration": overrides["no-aberration"] = true; break;
        case "--no-bloom": overrides["no-bloom"] = true; break;
        case "--no-grain": overrides["no-grain"] = true; break;
        case "--no-vignette": overrides["no-vignette"] = true; break;
        case "--no-split-tone": overrides["no-split-tone"] = true; break;
        case "--no-camera-shake": overrides["no-camera-shake"] = true; break;
        case "--halation-highlights-only": overrides["halation-highlights-only"] = true; break;
        case "--split-tone-protect-neutrals": overrides["split-tone-protect-neutrals"] = true; break;
      }
      i++; continue;
    }

    const val = argv[i + 1];
    if (val === undefined) throw new Error(`${arg} requires a value`);

    switch (arg) {
      case "--output": case "-o": outputArg = val; break;
      case "--preset": presetName = val; break;
      case "--codec":
        if (val !== "h264" && val !== "prores" && val !== "h265") throw new Error(`--codec must be h264, prores, or h265, got ${val}`);
        overrideCodec = val; overrides["codec"] = val; break;
      case "--encode-preset":
        if (val !== "fast" && val !== "medium" && val !== "slow") throw new Error(`--encode-preset must be fast, medium, or slow, got ${val}`);
        overrideEncodePreset = val; overrides["encode-preset"] = val; break;
      case "--export":
        if (val !== "low" && val !== "medium" && val !== "high" && val !== "max") throw new Error(`--export must be low, medium, high, or max, got ${val}`);
        exportPreset = val as ExportPreset; break;
      case "--crf": overrideCrf = parseNum(val, "--crf", 0, 51); overrides["crf"] = overrideCrf; break;
      case "--blend": overrides["blend"] = parseNum(val, "--blend", 0, 1); break;
      case "--exposure": overrides["exposure"] = parseNum(val, "--exposure", -2, 2); break;
      case "--contrast": overrides["contrast"] = parseNum(val, "--contrast", 0, 3); break;
      case "--highlights": overrides["highlights"] = parseNum(val, "--highlights", -1, 1); break;
      case "--fade": overrides["fade"] = parseNum(val, "--fade", 0, 1); break;
      case "--white-balance": overrides["white-balance"] = parseNum(val, "--white-balance", 1000, 15000); break;
      case "--tint": overrides["tint"] = parseNum(val, "--tint", -100, 100); break;
      case "--subtractive-sat": overrides["subtractive-sat"] = parseNum(val, "--subtractive-sat", 0, 3); break;
      case "--richness": overrides["richness"] = parseNum(val, "--richness", 0, 3); break;
      case "--bleach-bypass": overrides["bleach-bypass"] = parseNum(val, "--bleach-bypass", 0, 1); break;
      case "--halation-amount": overrides["halation-amount"] = parseNum(val, "--halation-amount", 0, 1); break;
      case "--halation-radius": overrides["halation-radius"] = parseNum(val, "--halation-radius", 1, 100); break;
      case "--halation-saturation": overrides["halation-saturation"] = parseNum(val, "--halation-saturation", 0, 3); break;
      case "--halation-hue": overrides["halation-hue"] = parseNum(val, "--halation-hue", 0, 1); break;
      case "--aberration": overrides["aberration"] = parseNum(val, "--aberration", 0, 1); break;
      case "--bloom-amount": overrides["bloom-amount"] = parseNum(val, "--bloom-amount", 0, 1); break;
      case "--bloom-radius": overrides["bloom-radius"] = parseNum(val, "--bloom-radius", 1, 100); break;
      case "--grain-amount": overrides["grain-amount"] = parseNum(val, "--grain-amount", 0, 1); break;
      case "--grain-size": overrides["grain-size"] = parseNum(val, "--grain-size", 0, 5); break;
      case "--grain-softness": overrides["grain-softness"] = parseNum(val, "--grain-softness", 0, 1); break;
      case "--grain-saturation": overrides["grain-saturation"] = parseNum(val, "--grain-saturation", 0, 1); break;
      case "--grain-defocus": overrides["grain-defocus"] = parseNum(val, "--grain-defocus", 0, 5); break;
      case "--vignette-amount": overrides["vignette-amount"] = parseNum(val, "--vignette-amount", 0, 1); break;
      case "--vignette-size": overrides["vignette-size"] = parseNum(val, "--vignette-size", 0, 1); break;
      case "--split-tone-mode":
        if (val !== "natural" && val !== "complementary") throw new Error(`--split-tone-mode must be natural or complementary, got ${val}`);
        overrides["split-tone-mode"] = val; break;
      case "--split-tone-amount": overrides["split-tone-amount"] = parseNum(val, "--split-tone-amount", 0, 1); break;
      case "--split-tone-hue": overrides["split-tone-hue"] = parseNum(val, "--split-tone-hue", 0, 360); break;
      case "--split-tone-pivot": overrides["split-tone-pivot"] = parseNum(val, "--split-tone-pivot", 0, 1); break;
      case "--camera-shake-amount": overrides["camera-shake-amount"] = parseNum(val, "--camera-shake-amount", 0, 1); break;
      case "--camera-shake-rate": overrides["camera-shake-rate"] = parseNum(val, "--camera-shake-rate", 0, 2); break;
    }
    i += 2;
  }

  return { overrides, positional, presetName, outputArg, exportPreset, overrideCodec, overrideCrf, overrideEncodePreset, help };
}
```

- [ ] **Step 4: Refactor `cli.ts` to use the shared parser**

In `packages/cli/src/cli.ts`, delete the local `KNOWN_FLAGS`, `BOOLEAN_FLAGS`, `parseNum`, and replace the body of `parseArgs` so it delegates:

```ts
import { parseEffectFlags } from "./effect-flags";

export function parseArgs(argv: string[]): ParsedArgs {
  const r = parseEffectFlags(argv);
  const inputs = r.positional;

  if (!r.help && inputs.length === 0) {
    throw new Error("No input file provided. Usage: hance <input> [<input> ...] [options]");
  }

  const outputs: string[] = [];
  if (r.outputArg && inputs.length > 1) {
    for (const inp of inputs) outputs.push(path.join(r.outputArg, getDefaultOutput(path.basename(inp))));
  } else if (r.outputArg) {
    outputs.push(r.outputArg);
  } else {
    for (const inp of inputs) outputs.push(getDefaultOutput(inp));
  }

  const effectOpts = applyPreset(r.presetName, r.overrides);
  const params = effectOpts.mergedParams;

  let resolvedCodec = effectOpts.codec;
  let resolvedCrf = effectOpts.crf;
  let resolvedEncodePreset = effectOpts.encodePreset;
  let resolvedPixelFormat = effectOpts.pixelFormat;

  if (r.exportPreset) {
    const exp = resolveExportPreset(r.exportPreset, {
      codec: r.overrideCodec, crf: r.overrideCrf, encodePreset: r.overrideEncodePreset,
    });
    resolvedCodec = exp.codec;
    resolvedCrf = exp.crf;
    resolvedEncodePreset = exp.encodePreset;
    resolvedPixelFormat = exp.pixelFormat;
    if (r.exportPreset === "high" || r.exportPreset === "max") {
      console.error("High quality export — expect larger file sizes");
    }
  }

  return {
    inputs, outputs, outputArg: r.outputArg,
    encodePreset: resolvedEncodePreset, codec: resolvedCodec, crf: resolvedCrf,
    blend: effectOpts.blend, pixelFormat: resolvedPixelFormat,
    colorSettings: effectOpts.colorSettings, halation: effectOpts.halation,
    aberration: effectOpts.aberration, bloom: effectOpts.bloom,
    grain: effectOpts.grain, vignette: effectOpts.vignette,
    splitTone: effectOpts.splitTone, cameraShake: effectOpts.cameraShake,
    params, help: r.help,
  };
}
```

- [ ] **Step 5: Run the parser-parity test + existing tests**

Run: `bun test packages/cli/__tests__/effect-flags.test.ts packages/cli/__tests__/cli.test.ts`
Expected: PASS (all). The existing `cli.test.ts` continues to pass through `parseArgs`.

- [ ] **Step 6: Commit**

```bash
git add packages/cli/src/effect-flags.ts packages/cli/src/cli.ts packages/cli/__tests__/effect-flags.test.ts
git commit -m "refactor(cli): extract shared effect-flag parser"
```

---

## Task 2: Subcommand dispatcher

**Files:**
- Modify: `packages/cli/src/cli.ts:110-112` (`isSubcommand`) and `cli.ts:330-351` (dispatch in `main`)
- Test: `packages/cli/__tests__/cli.test.ts`

- [ ] **Step 1: Write the failing dispatcher test**

Append to `packages/cli/__tests__/cli.test.ts`:

```ts
import { resolveSubcommand } from "../src/cli";

describe("resolveSubcommand", () => {
  it("routes 'ui' to ui", () => { expect(resolveSubcommand(["ui"])).toBe("ui"); });
  it("routes 'preview' to preview", () => { expect(resolveSubcommand(["preview", "in.mp4"])).toBe("preview"); });
  it("routes 'preset' to preset", () => { expect(resolveSubcommand(["preset", "list"])).toBe("preset"); });
  it("treats anything else as render", () => { expect(resolveSubcommand(["in.mp4", "-o", "out.mp4"])).toBe("render"); });
  it("treats empty argv as render", () => { expect(resolveSubcommand([])).toBe("render"); });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test packages/cli/__tests__/cli.test.ts -t resolveSubcommand`
Expected: FAIL — `resolveSubcommand` is not exported.

- [ ] **Step 3: Add `resolveSubcommand` and update `main`**

In `packages/cli/src/cli.ts`, replace `isSubcommand` with:

```ts
export type Subcommand = "ui" | "preview" | "preset" | "render";

export function resolveSubcommand(args: string[]): Subcommand {
  switch (args[0]) {
    case "ui": return "ui";
    case "preview": return "preview";
    case "preset": return "preset";
    default: return "render";
  }
}
```

Update `main()` to dispatch:

```ts
const sub = resolveSubcommand(args);
if (sub === "ui") {
  const { startUI } = await import("@hance/ui/server");
  const { port, open, initialFile: rawFile } = parseUiArgs(args.slice(1));
  let initialFile: string | undefined;
  if (rawFile) {
    initialFile = path.resolve(rawFile);
    if (!existsSync(initialFile)) { console.error(`File not found: ${initialFile}`); process.exit(1); }
  }
  await startUI(port, open, initialFile);
  return;
}
if (sub === "preview") {
  const { runPreview } = await import("./commands/preview");
  await runPreview(args.slice(1));
  return;
}
if (sub === "preset") {
  const { runPreset } = await import("./commands/preset");
  await runPreset(args.slice(1));
  return;
}
// fall through to render
```

Keep the existing `isSubcommand` export as a thin compatibility wrapper (`return resolveSubcommand(args) === "ui"`) so any external import keeps compiling.

- [ ] **Step 4: Run all CLI unit tests**

Run: `bun test packages/cli/__tests__/cli.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/cli.ts packages/cli/__tests__/cli.test.ts
git commit -m "refactor(cli): replace isSubcommand with resolveSubcommand dispatcher"
```

---

## Task 3: `hance preview` for image input

**Files:**
- Create: `packages/cli/src/commands/preview.ts`
- Test: `packages/cli/__tests__/commands/preview.test.ts`

- [ ] **Step 1: Write the failing argv-validation test**

```ts
// packages/cli/__tests__/commands/preview.test.ts
import { describe, it, expect } from "bun:test";
import { parsePreviewArgs } from "../../src/commands/preview";

describe("parsePreviewArgs", () => {
  it("requires an input", () => {
    expect(() => parsePreviewArgs([])).toThrow(/input/i);
  });
  it("requires -o", () => {
    expect(() => parsePreviewArgs(["in.png"])).toThrow(/-o/);
  });
  it("returns input, output, and overrides", () => {
    const r = parsePreviewArgs(["in.png", "-o", "out.png", "--exposure", "0.5"]);
    expect(r.input).toBe("in.png");
    expect(r.output).toBe("out.png");
    expect(r.overrides["exposure"]).toBe(0.5);
  });
  it("supports --help", () => {
    const r = parsePreviewArgs(["--help"]);
    expect(r.help).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test packages/cli/__tests__/commands/preview.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Create `packages/cli/src/commands/preview.ts` with image path**

```ts
import { existsSync } from "node:fs";
import path from "node:path";
import { probe, applyPreset } from "@hance/core";
import type { PresetData } from "@hance/core";
import { parseEffectFlags, EFFECT_HELP_TEXT } from "../effect-flags";
import { createHeadlessRenderer } from "../gpu/wgpu-renderer";

const PREVIEW_HELP = `\
hance preview <input> -o <out.png> [effect flags...]

  Render a single preview frame (image) or a horizontal contact sheet of
  three frames at 25/50/75% (video). Prints absolute output path on stdout.

${EFFECT_HELP_TEXT}
`;

export interface PreviewArgs {
  input: string;
  output: string;
  overrides: PresetData;
  presetName: string;
  help: boolean;
}

export function parsePreviewArgs(argv: string[]): PreviewArgs {
  const r = parseEffectFlags(argv);
  if (r.help) return { input: "", output: "", overrides: {}, presetName: "default", help: true };
  if (r.positional.length === 0) throw new Error("preview: input file required");
  if (!r.outputArg) throw new Error("preview: -o <out.png> required");
  return {
    input: r.positional[0],
    output: r.outputArg,
    overrides: r.overrides,
    presetName: r.presetName,
    help: false,
  };
}

async function decodeImageRgba(input: string, width: number, height: number): Promise<Uint8Array> {
  const proc = Bun.spawn([
    "ffmpeg", "-i", input,
    "-f", "rawvideo", "-pix_fmt", "rgba",
    "-v", "quiet", "pipe:1",
  ], { stdout: "pipe", stderr: "pipe" });
  const bytes = new Uint8Array(await new Response(proc.stdout).arrayBuffer());
  const code = await proc.exited;
  if (code !== 0) throw new Error(`ffmpeg decode failed for ${input}`);
  const expected = width * height * 4;
  if (bytes.length !== expected) throw new Error(`decoded ${bytes.length} bytes, expected ${expected}`);
  return bytes;
}

async function encodePng(rgba: Uint8Array, width: number, height: number, output: string): Promise<void> {
  const proc = Bun.spawn([
    "ffmpeg", "-y",
    "-f", "rawvideo", "-pix_fmt", "rgba",
    "-s", `${width}x${height}`,
    "-i", "pipe:0",
    "-v", "quiet", output,
  ], { stdin: "pipe", stdout: "pipe", stderr: "pipe" });
  proc.stdin.write(rgba); proc.stdin.end();
  const code = await proc.exited;
  if (code !== 0) {
    const err = await new Response(proc.stderr).text();
    throw new Error(`ffmpeg encode failed: ${err.trim()}`);
  }
}

export async function runPreview(argv: string[]): Promise<void> {
  let parsed: PreviewArgs;
  try { parsed = parsePreviewArgs(argv); }
  catch (e) { console.error(`Error: ${(e as Error).message}`); process.exit(1); }
  if (parsed.help) { console.log(PREVIEW_HELP); return; }

  if (!existsSync(parsed.input)) {
    console.error(`Input file not found: ${parsed.input}`); process.exit(1);
  }

  const probeResult = await probe(parsed.input);
  const params = applyPreset(parsed.presetName, parsed.overrides).mergedParams;

  if (probeResult.isImage) {
    const w = probeResult.width!, h = probeResult.height!;
    const rgba = await decodeImageRgba(parsed.input, w, h);
    const renderer = await createHeadlessRenderer();
    try {
      await renderer.init(w, h, params);
      const out = await renderer.renderFrame(rgba, w, h, params);
      await encodePng(out, w, h, parsed.output);
    } finally { await renderer.close(); }
    process.stdout.write(path.resolve(parsed.output) + "\n");
    return;
  }
  // video path implemented in Task 4
  throw new Error("preview: video input not yet implemented");
}
```

- [ ] **Step 4: Run unit tests**

Run: `bun test packages/cli/__tests__/commands/preview.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/commands/preview.ts packages/cli/__tests__/commands/preview.test.ts
git commit -m "feat(cli): add hance preview for image input"
```

---

## Task 4: `hance preview` for video input (3-frame contact sheet)

**Files:**
- Modify: `packages/cli/src/commands/preview.ts` (replace the `throw "not yet implemented"`)
- Test: `packages/cli/__tests__/e2e/preview.e2e.test.ts`

- [ ] **Step 1: Write the failing E2E test**

```ts
// packages/cli/__tests__/e2e/preview.e2e.test.ts
import { describe, it, expect, afterAll } from "bun:test";
import { existsSync, unlinkSync } from "node:fs";
import path from "node:path";

const FIX = path.join(import.meta.dir, "fixtures");
const CLI = path.join(import.meta.dir, "../../src/cli.ts");
const VIDEO = path.join(FIX, "test.mp4");
const IMG = path.join(FIX, "test.png");
const OUT_VIDEO = path.join(FIX, "preview-video.png");
const OUT_IMG = path.join(FIX, "preview-img.png");

async function probeWh(file: string): Promise<{ w: number; h: number }> {
  const p = Bun.spawn(["ffprobe", "-v", "error", "-select_streams", "v:0",
    "-show_entries", "stream=width,height", "-of", "csv=p=0:s=x", file],
    { stdout: "pipe", stderr: "pipe" });
  const s = (await new Response(p.stdout).text()).trim();
  await p.exited;
  const [w, h] = s.split("x").map((x) => parseInt(x, 10));
  return { w, h };
}

async function run(args: string[]) {
  const p = Bun.spawn(["bun", "run", CLI, ...args], { stdout: "pipe", stderr: "pipe" });
  const stdout = await new Response(p.stdout).text();
  const stderr = await new Response(p.stderr).text();
  const code = await p.exited;
  return { code, stdout, stderr };
}

afterAll(() => {
  for (const f of [OUT_VIDEO, OUT_IMG]) if (existsSync(f)) unlinkSync(f);
});

describe("e2e: hance preview", () => {
  it("renders a single PNG for image input", async () => {
    const { code, stdout } = await run(["preview", IMG, "-o", OUT_IMG]);
    expect(code).toBe(0);
    expect(stdout.trim()).toBe(path.resolve(OUT_IMG));
    expect(existsSync(OUT_IMG)).toBe(true);
  }, 60000);

  it("renders a contact sheet ~3x wider than tall for video input", async () => {
    const { code } = await run(["preview", VIDEO, "-o", OUT_VIDEO]);
    expect(code).toBe(0);
    expect(existsSync(OUT_VIDEO)).toBe(true);
    const src = await probeWh(VIDEO);
    const sheet = await probeWh(OUT_VIDEO);
    expect(sheet.w).toBe(src.w * 3);
    expect(sheet.h).toBe(src.h);
  }, 90000);

  it("prints only the absolute output path on stdout", async () => {
    const { stdout } = await run(["preview", IMG, "-o", OUT_IMG]);
    expect(stdout.trim().split("\n")).toHaveLength(1);
    expect(path.isAbsolute(stdout.trim())).toBe(true);
  }, 60000);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test packages/cli/__tests__/e2e/preview.e2e.test.ts`
Expected: FAIL — video case throws "not yet implemented".

- [ ] **Step 3: Implement video preview path**

In `packages/cli/src/commands/preview.ts`, replace the trailing `throw new Error("preview: video input not yet implemented");` with:

```ts
  // video: seek to 25/50/75%, render each frame, stitch horizontally
  const w = probeResult.width!, h = probeResult.height!;
  const duration = probeResult.duration ?? 0;
  if (!duration || duration <= 0) throw new Error(`preview: could not determine duration for ${parsed.input}`);
  const stops = [0.25, 0.5, 0.75].map((p) => p * duration);

  async function decodeFrameAt(t: number): Promise<Uint8Array> {
    const proc = Bun.spawn([
      "ffmpeg", "-ss", t.toFixed(3), "-i", parsed.input,
      "-frames:v", "1",
      "-f", "rawvideo", "-pix_fmt", "rgba",
      "-v", "quiet", "pipe:1",
    ], { stdout: "pipe", stderr: "pipe" });
    const bytes = new Uint8Array(await new Response(proc.stdout).arrayBuffer());
    const code = await proc.exited;
    if (code !== 0) throw new Error(`ffmpeg seek/decode failed at t=${t}`);
    const expected = w * h * 4;
    if (bytes.length !== expected) throw new Error(`frame at ${t}: ${bytes.length} bytes, expected ${expected}`);
    return bytes;
  }

  const renderer = await createHeadlessRenderer();
  let stitched: Uint8Array;
  try {
    await renderer.init(w, h, params);
    const rendered: Uint8Array[] = [];
    for (const t of stops) {
      const raw = await decodeFrameAt(t);
      rendered.push(await renderer.renderFrame(raw, w, h, params));
    }
    const sheetW = w * 3;
    stitched = new Uint8Array(sheetW * h * 4);
    for (let y = 0; y < h; y++) {
      for (let i = 0; i < 3; i++) {
        const srcRow = rendered[i].subarray(y * w * 4, (y + 1) * w * 4);
        stitched.set(srcRow, (y * sheetW + i * w) * 4);
      }
    }
  } finally { await renderer.close(); }

  await encodePng(stitched, w * 3, h, parsed.output);
  process.stdout.write(path.resolve(parsed.output) + "\n");
```

Note on `duration`: confirm `probe()` in `@hance/core` returns it. Check `packages/core/src/probe.ts`. If the field is named differently (e.g. `durationSeconds`), use that name everywhere in this task.

- [ ] **Step 4: Run E2E**

Run: `bun test packages/cli/__tests__/e2e/preview.e2e.test.ts`
Expected: PASS (all three cases).

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/commands/preview.ts packages/cli/__tests__/e2e/preview.e2e.test.ts
git commit -m "feat(cli): hance preview video contact sheet at 25/50/75%"
```

---

## Task 5: `hance preset save` and `hance preset list`

**Files:**
- Create: `packages/cli/src/commands/preset.ts`
- Test: `packages/cli/__tests__/commands/preset.test.ts`
- Test: `packages/cli/__tests__/e2e/preset.e2e.test.ts`

- [ ] **Step 1: Write failing unit tests**

```ts
// packages/cli/__tests__/commands/preset.test.ts
import { describe, it, expect } from "bun:test";
import { validatePresetName, parsePresetSaveArgs } from "../../src/commands/preset";

describe("validatePresetName", () => {
  it("rejects path separators", () => { expect(() => validatePresetName("a/b")).toThrow(); });
  it("rejects backslashes", () => { expect(() => validatePresetName("a\\b")).toThrow(); });
  it("rejects leading dot", () => { expect(() => validatePresetName(".hidden")).toThrow(); });
  it("rejects whitespace", () => { expect(() => validatePresetName("a b")).toThrow(); });
  it("rejects empty", () => { expect(() => validatePresetName("")).toThrow(); });
  it("accepts kebab and underscore", () => {
    expect(() => validatePresetName("kodak-2393_v1")).not.toThrow();
  });
});

describe("parsePresetSaveArgs", () => {
  it("parses name and effect overrides", () => {
    const r = parsePresetSaveArgs(["my-look", "--exposure", "0.5"]);
    expect(r.name).toBe("my-look");
    expect(r.overrides["exposure"]).toBe(0.5);
    expect(r.force).toBe(false);
  });
  it("parses --force", () => {
    const r = parsePresetSaveArgs(["x", "--force"]);
    expect(r.force).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `bun test packages/cli/__tests__/commands/preset.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement `packages/cli/src/commands/preset.ts`**

```ts
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { homedir } from "node:os";
import { parseEffectFlags, EFFECT_HELP_TEXT } from "../effect-flags";
import type { PresetData } from "@hance/core";

const PRESET_HELP = `\
hance preset save <name> [effect flags...] [--force]
hance preset list

  save: writes ~/.hance/presets/<name>.hlook with the given effect flags.
  list: prints preset names from ~/.hance/presets and the builtin dir.

${EFFECT_HELP_TEXT}
`;

export function validatePresetName(name: string): void {
  if (!name) throw new Error("preset name cannot be empty");
  if (/[\/\\]/.test(name)) throw new Error("preset name cannot contain path separators");
  if (name.startsWith(".")) throw new Error("preset name cannot start with a dot");
  if (/\s/.test(name)) throw new Error("preset name cannot contain whitespace");
}

export interface PresetSaveArgs {
  name: string;
  overrides: PresetData;
  force: boolean;
  help: boolean;
}

export function parsePresetSaveArgs(argv: string[]): PresetSaveArgs {
  const force = argv.includes("--force");
  const filtered = argv.filter((a) => a !== "--force");
  const r = parseEffectFlags(filtered);
  if (r.help) return { name: "", overrides: {}, force: false, help: true };
  if (r.positional.length === 0) throw new Error("preset save: <name> required");
  return { name: r.positional[0], overrides: r.overrides, force, help: false };
}

function userPresetsDir(): string {
  return path.join(homedir(), ".hance", "presets");
}

function builtinPresetsDir(): string {
  const repo = path.join(import.meta.dir, "..", "..", "..", "..", "presets");
  return repo;
}

function listDir(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".hlook") || f.endsWith(".json"))
    .map((f) => f.replace(/\.(hlook|json)$/, ""));
}

async function runSave(argv: string[]): Promise<void> {
  let parsed: PresetSaveArgs;
  try { parsed = parsePresetSaveArgs(argv); }
  catch (e) { console.error(`Error: ${(e as Error).message}`); process.exit(1); }
  if (parsed.help) { console.log(PRESET_HELP); return; }

  try { validatePresetName(parsed.name); }
  catch (e) { console.error(`Error: ${(e as Error).message}`); process.exit(1); }

  const dir = userPresetsDir();
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${parsed.name}.hlook`);
  if (existsSync(file) && !parsed.force) {
    console.error(`preset "${parsed.name}" already exists. Use --force to overwrite.`);
    process.exit(1);
  }

  writeFileSync(file, JSON.stringify({ name: parsed.name, params: parsed.overrides }, null, 2));
  process.stdout.write(path.resolve(file) + "\n");
}

function runList(): void {
  const names = new Set<string>();
  for (const n of listDir(userPresetsDir())) names.add(n);
  for (const n of listDir(builtinPresetsDir())) names.add(n);
  const sorted = [...names].sort();
  if (sorted.length > 0) process.stdout.write(sorted.join("\n") + "\n");
}

export async function runPreset(argv: string[]): Promise<void> {
  if (argv[0] === "--help" || argv[0] === "-h" || argv.length === 0) {
    console.log(PRESET_HELP); return;
  }
  if (argv[0] === "save") return runSave(argv.slice(1));
  if (argv[0] === "list") { runList(); return; }
  console.error(`Unknown preset subcommand: ${argv[0]}`); process.exit(1);
}
```

- [ ] **Step 4: Write E2E parity test**

```ts
// packages/cli/__tests__/e2e/preset.e2e.test.ts
import { describe, it, expect, afterAll } from "bun:test";
import { existsSync, unlinkSync, readFileSync } from "node:fs";
import path from "node:path";
import { homedir } from "node:os";

const FIX = path.join(import.meta.dir, "fixtures");
const CLI = path.join(import.meta.dir, "../../src/cli.ts");
const IMG = path.join(FIX, "test.png");
const NAME = "match-look-e2e-test";
const PRESET_FILE = path.join(homedir(), ".hance", "presets", `${NAME}.hlook`);
const OUT_DIRECT = path.join(FIX, "direct.png");
const OUT_VIA_PRESET = path.join(FIX, "viapreset.png");

async function run(args: string[]) {
  const p = Bun.spawn(["bun", "run", CLI, ...args], { stdout: "pipe", stderr: "pipe" });
  const stdout = await new Response(p.stdout).text();
  const stderr = await new Response(p.stderr).text();
  const code = await p.exited;
  return { code, stdout, stderr };
}

afterAll(() => {
  for (const f of [PRESET_FILE, OUT_DIRECT, OUT_VIA_PRESET]) if (existsSync(f)) unlinkSync(f);
});

describe("e2e: hance preset", () => {
  it("save writes a valid .hlook file", async () => {
    if (existsSync(PRESET_FILE)) unlinkSync(PRESET_FILE);
    const { code, stdout } = await run(["preset", "save", NAME, "--exposure", "0.5"]);
    expect(code).toBe(0);
    expect(stdout.trim()).toBe(path.resolve(PRESET_FILE));
    const data = JSON.parse(readFileSync(PRESET_FILE, "utf-8"));
    expect(data.params.exposure).toBe(0.5);
  });

  it("save refuses to overwrite without --force", async () => {
    const { code, stderr } = await run(["preset", "save", NAME, "--exposure", "0.6"]);
    expect(code).toBe(1);
    expect(stderr).toMatch(/already exists/);
  });

  it("save overwrites with --force", async () => {
    const { code } = await run(["preset", "save", NAME, "--exposure", "0.6", "--force"]);
    expect(code).toBe(0);
  });

  it("list includes saved preset", async () => {
    const { code, stdout } = await run(["preset", "list"]);
    expect(code).toBe(0);
    expect(stdout.split("\n")).toContain(NAME);
  });

  it("rejects names with path separators", async () => {
    const { code, stderr } = await run(["preset", "save", "../evil", "--exposure", "0.1"]);
    expect(code).toBe(1);
    expect(stderr).toMatch(/path separators/);
  });

  it("preset render matches direct flag render", async () => {
    if (existsSync(OUT_DIRECT)) unlinkSync(OUT_DIRECT);
    if (existsSync(OUT_VIA_PRESET)) unlinkSync(OUT_VIA_PRESET);
    const a = await run([IMG, "-o", OUT_DIRECT, "--exposure", "0.6"]);
    const b = await run([IMG, "-o", OUT_VIA_PRESET, "--preset", NAME]);
    expect(a.code).toBe(0); expect(b.code).toBe(0);
    const ha = Bun.hash(readFileSync(OUT_DIRECT));
    const hb = Bun.hash(readFileSync(OUT_VIA_PRESET));
    expect(ha).toBe(hb);
  }, 90000);
});
```

- [ ] **Step 5: Run unit + E2E**

Run: `bun test packages/cli/__tests__/commands/preset.test.ts packages/cli/__tests__/e2e/preset.e2e.test.ts`
Expected: PASS (all).

- [ ] **Step 6: Commit**

```bash
git add packages/cli/src/commands/preset.ts packages/cli/__tests__/commands/preset.test.ts packages/cli/__tests__/e2e/preset.e2e.test.ts
git commit -m "feat(cli): add hance preset save and list"
```

---

## Task 6: Stdout-on-success contract verification

**Files:**
- Test: `packages/cli/__tests__/e2e/preview.e2e.test.ts` (already covers preview)
- Test: `packages/cli/__tests__/e2e/preset.e2e.test.ts` (already covers preset save)

This is a checkpoint task — no new code, just verification that no log lines from internal helpers leak to stdout.

- [ ] **Step 1: Audit `runPreview` and `runSave` for stray `console.log`**

Run: `grep -nE "console\.(log|info)" packages/cli/src/commands/preview.ts packages/cli/src/commands/preset.ts`
Expected: only the help-text `console.log(PREVIEW_HELP)` / `console.log(PRESET_HELP)` lines, plus list output via `process.stdout.write`. Anything else → move to `console.error`.

- [ ] **Step 2: Run the full E2E suite to confirm stdout is clean**

Run: `bun test packages/cli/__tests__/e2e/preview.e2e.test.ts packages/cli/__tests__/e2e/preset.e2e.test.ts`
Expected: PASS — including the "prints only the absolute output path on stdout" assertion.

- [ ] **Step 3: Commit (no-op if grep was clean)**

If the audit produced edits:
```bash
git add packages/cli/src/commands
git commit -m "fix(cli): keep preview/preset stdout to output path only"
```
Otherwise skip.

---

## Task 7: `/match-look` skill

**Files:**
- Create: `.claude/skills/match-look/SKILL.md`

- [ ] **Step 1: Confirm skill location**

Run: `ls .claude/skills 2>/dev/null || echo "no skills dir yet"`
If "no skills dir yet", create it: `mkdir -p .claude/skills/match-look`. (Per spec §"Skill: /match-look", location is TBD; `.claude/skills/` is the project-local convention.)

- [ ] **Step 2: Write `SKILL.md`**

Create `.claude/skills/match-look/SKILL.md` with this exact content:

```markdown
---
name: match-look
description: Iteratively dial in a Hance preset that matches a reference image. Use when the user shares a reference image and asks to make their video or image look like it.
---

# /match-look

You are tuning a Hance preset so the user's target media matches a reference image they shared.

## Inputs

- **Reference image**: attached to the conversation. This is the look to match.
- **Target file**: a video or image path the user wants graded. Ask if not provided.

## Loop

Use a per-run scratch dir: `WORK=/tmp/hance-match-$$` and `mkdir -p "$WORK"`.

1. **Baseline.** Run `hance preview <target> -o "$WORK/iter-0.png"` with no effect flags. Look at the output — this is "before".

2. **Compare** reference vs. current preview. Identify gaps in this fixed priority order. Earlier knobs dominate; do not chase later ones before earlier ones are right:
   1. White balance — `--white-balance` (Kelvin, 1000–15000), `--tint` (-100..100)
   2. Exposure — `--exposure` (-2..2)
   3. Contrast — `--contrast` (0..3), `--highlights` (-1..1), `--fade` (0..1)
   4. Saturation / richness — `--subtractive-sat` (0..3), `--richness` (0..3), `--bleach-bypass` (0..1)
   5. Split-tone — `--split-tone-mode`, `--split-tone-amount`, `--split-tone-hue`, `--split-tone-pivot`
   6. Halation — `--halation-amount`, `--halation-radius`, `--halation-saturation`, `--halation-hue`
   7. Grain — `--grain-amount`, `--grain-size`, `--grain-softness`, `--grain-saturation`, `--grain-defocus`
   8. Vignette — `--vignette-amount`, `--vignette-size`

3. **Render iteration N.** Run `hance preview <target> -o "$WORK/iter-N.png" <flags>`. Adjust one or two knobs at a time so you can attribute changes.

4. **Judge.** Look at iter-N vs. reference.

5. **Stop when any of:**
   - You judge the match close enough.
   - 5 iterations have run.
   - Two consecutive iterations show no improvement.

6. **Confirm.** Show the user the final preview path and the chosen flags. Ask whether to save and what name to use.

7. **Save.** Run `hance preset save <name> <flags>`. If the name is taken (`hance preset list` to check, or non-zero exit on save), ask the user before passing `--force`. Then tell them: `hance <input> -o out.mp4 --preset <name>`.

8. **Cleanup.** `rm -rf "$WORK"` on success, on user-cancel, and on error.

## Guardrails

- **Never run `hance <input>`** (the render path) during the loop. Only `hance preview`. Full video renders are expensive and wrong here.
- **Never invent flags.** Only use names listed in `hance preview --help`.
- **Don't tweak grain/halation/vignette before exposure and white balance are right.** Priority order is not optional.
- **Don't save the preset until the user confirms.**
- **Always clean up `$WORK`** — even on error or cancel.
```

- [ ] **Step 3: Commit**

```bash
git add .claude/skills/match-look/SKILL.md
git commit -m "feat(skill): add /match-look iteration loop"
```

---

## Task 8: Final integration check

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `bun test`
Expected: PASS — including the existing `cli.test.ts`, the new `effect-flags.test.ts`, both new `commands/*.test.ts`, and both new e2e files.

- [ ] **Step 2: Smoke-test the binary build**

Run: `bun run build && ./hance preview packages/cli/__tests__/e2e/fixtures/test.png -o /tmp/smoke.png && ls -la /tmp/smoke.png`
Expected: build succeeds, `/tmp/smoke.png` exists, the only stdout line from the preview command is the absolute path.

- [ ] **Step 3: Manual skill verification (one-time)**

Per spec §"Skill verification": run `/match-look` end-to-end against two or three reference stills and confirm convergence in ≤5 iterations. Record results in the PR description; do not commit them.

- [ ] **Step 4: Commit nothing — open the PR**

If everything passes, open a PR titled `feat: match-look — hance preview, preset save/list, and /match-look skill`.

---

## Self-review notes

- **Spec coverage:** dispatcher (Task 2), `preview` image (Task 3), `preview` video stitch (Task 4), `preset save` + name validation + overwrite (Task 5), `preset list` (Task 5), shared parser (Task 1), stdout contract (Tasks 3–6), skill with priority order + guardrails + cleanup (Task 7), unit + E2E + manual verification (Tasks 1, 3, 4, 5, 8). All spec sections mapped.
- **`probe` duration field:** Task 4 Step 3 includes a check-and-rename note in case the field on the `ProbeResult` type is named differently than `duration`.
- **Builtin presets dir path:** Task 5's `builtinPresetsDir()` resolves to `<repo>/presets`. If the repo's actual builtin presets live elsewhere, mirror the resolver in `packages/core/src/presets.ts` (`builtinPresetsDir`) instead of duplicating the heuristic.
```