import { describe, it, expect } from "bun:test";
import { EFFECT_SCHEMA } from "@hance/core";
import { parseEffectFlags, EFFECT_HELP_TEXT } from "../src/effect-flags";

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

  it("accepts deprecated split-tone flags as legacy params for migration", () => {
    const r = parseEffectFlags(["--split-tone-hue", "200", "--split-tone-mode", "complementary"]);
    expect(r.overrides["split-tone-hue"]).toBe(200);
    expect(r.overrides["split-tone-mode"]).toBe("complementary");
    expect(() => parseEffectFlags(["--split-tone-mode", "weird"])).toThrow(/natural, complementary/);
    expect(() => parseEffectFlags(["--split-tone-hue", "400"])).toThrow(/between 0 and 360/);
  });

  it("accepts deprecated grain and fade flags as legacy params for migration", () => {
    const r = parseEffectFlags(["--grain-amount", "0.2", "--grain-defocus", "1", "--fade-tint", "0.7", "--fade-hue", "190"]);
    expect(r.overrides["grain-amount"]).toBe(0.2);
    expect(r.overrides["grain-defocus"]).toBe(1);
    expect(r.overrides["fade-tint"]).toBe(0.7);
    expect(r.overrides["fade-hue"]).toBe(190);
    expect(() => parseEffectFlags(["--grain-amount", "2"])).toThrow(/between 0 and 1/);
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

  it("parses export-shape flags", () => {
    const r = parseEffectFlags([
      "--export", "high",
      "--codec", "prores",
      "--crf", "18",
      "--encode-preset", "slow",
      "--blend", "0.5",
    ]);
    expect(r.exportPreset).toBe("high");
    expect(r.overrideCodec).toBe("prores");
    expect(r.overrideCrf).toBe(18);
    expect(r.overrideEncodePreset).toBe("slow");
    expect(r.overrides["blend"]).toBe(0.5);
  });

  it("rejects invalid --codec / --export / --encode-preset values", () => {
    expect(() => parseEffectFlags(["--codec", "av1"])).toThrow(/--codec/);
    expect(() => parseEffectFlags(["--export", "ultra"])).toThrow(/--export/);
    expect(() => parseEffectFlags(["--encode-preset", "turbo"])).toThrow(/--encode-preset/);
  });

  it("parses --input-lut vlog", () => {
    const r = parseEffectFlags(["--input-lut", "vlog"]);
    expect(r.overrides["input-lut-profile"]).toBe("vlog");
  });

  it("parses --vlog as sugar for --input-lut vlog", () => {
    const r = parseEffectFlags(["--vlog"]);
    expect(r.overrides["input-lut-profile"]).toBe("vlog");
  });

  it("parses --no-input-lut", () => {
    const r = parseEffectFlags(["--no-input-lut"]);
    expect(r.overrides["no-input-lut"]).toBe(true);
  });

  it("rejects an invalid --input-lut profile", () => {
    expect(() => parseEffectFlags(["--input-lut", "slog3"])).toThrow(/--input-lut/);
  });
});

// These guard that the CLI is derived from EFFECT_SCHEMA: every schema option
// and every group disable toggle must be a recognized, parseable flag, and the
// generated help must mention each flag with its default. A new/removed option
// in the schema is then a one-file change — see issue #61.
describe("schema-derived CLI flags", () => {
  it("recognizes every option flag and group disable toggle", () => {
    for (const group of EFFECT_SCHEMA) {
      expect(() => parseEffectFlags([`--${group.enableKey}`])).not.toThrow();
      for (const opt of group.options) {
        const flag = opt.flag ?? `--${opt.key}`;
        const args = opt.type === "boolean"
          ? [flag]
          : opt.type === "select"
            ? [flag, opt.choices[0]]
            : [flag, String(opt.default)];
        expect(() => parseEffectFlags(args), `flag ${flag}`).not.toThrow();
      }
    }
  });

  it("validates ranges from the schema min/max", () => {
    const radius = EFFECT_SCHEMA.flatMap(g => g.options).find(o => o.key === "halation-radius")!;
    if (radius.type === "range") {
      expect(() => parseEffectFlags(["--halation-radius", String(radius.max + 1)])).toThrow();
    }
  });

  it("generates help text covering every option flag and default", () => {
    for (const group of EFFECT_SCHEMA) {
      for (const opt of group.options) {
        const flag = opt.flag ?? `--${opt.key}`;
        expect(EFFECT_HELP_TEXT).toContain(flag);
        expect(EFFECT_HELP_TEXT).toContain(`(default: ${opt.default})`);
      }
      expect(EFFECT_HELP_TEXT).toContain(`--${group.enableKey}`);
    }
  });
});

describe("color wheel flags", () => {
  it("parses lift/gamma/gain flags into overrides", () => {
    const { overrides } = parseEffectFlags([
      "in.mp4", "--lift-r", "0.1", "--gamma-g", "1.2", "--gain-b", "0.8",
    ]);
    expect(overrides["lift-r"]).toBe(0.1);
    expect(overrides["gamma-g"]).toBe(1.2);
    expect(overrides["gain-b"]).toBe(0.8);
  });

  it("rejects out-of-range lift", () => {
    expect(() => parseEffectFlags(["in.mp4", "--lift-r", "2"])).toThrow();
  });

  it("--no-color-wheels sets the enable key", () => {
    const { overrides } = parseEffectFlags(["in.mp4", "--no-color-wheels"]);
    expect(overrides["no-color-wheels"]).toBe(true);
  });
});
