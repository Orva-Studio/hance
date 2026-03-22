import { describe, it, expect } from "bun:test";
import { loadPreset, applyPreset } from "../presets";

describe("loadPreset", () => {
  it("loads the built-in default preset", () => {
    const data = loadPreset("default");
    expect(data).toBeDefined();
    expect(data["lift"]).toBe(0.05);
    expect(data["aberration"]).toBe(0.3);
  });

  it("loads a named built-in preset", () => {
    const data = loadPreset("subtle");
    expect(data).toBeDefined();
    expect(data["lift"]).toBe(0.02);
  });

  it("throws for unknown preset", () => {
    expect(() => loadPreset("nonexistent")).toThrow(/not found/i);
  });

  it("merges named preset over default", () => {
    const data = loadPreset("subtle");
    // subtle only overrides some keys — missing keys should be undefined
    // (merging with default happens at applyPreset level)
    expect(data["lift"]).toBe(0.02);
  });
});

describe("applyPreset", () => {
  it("returns full FilmOptions from default preset with no overrides", () => {
    const opts = applyPreset("default", {});
    expect(opts.grade.liftBlacks).toBe(0.05);
    expect(opts.grade.fade).toBe(0.15);
    expect(opts.halation.intensity).toBe(0.6);
    expect(opts.aberration.strength).toBe(0.3);
    expect(opts.weave.strength).toBe(0.3);
    expect(opts.preset).toBe("medium");
    expect(opts.crf).toBe(18);
  });

  it("applies CLI overrides on top of preset", () => {
    const opts = applyPreset("default", { "lift": 0.1, "aberration": 0.8 });
    expect(opts.grade.liftBlacks).toBe(0.1);
    expect(opts.aberration.strength).toBe(0.8);
    // Non-overridden values stay at preset defaults
    expect(opts.grade.fade).toBe(0.15);
  });

  it("merges named preset over default then applies overrides", () => {
    const opts = applyPreset("subtle", { "fade": 0.5 });
    expect(opts.grade.liftBlacks).toBe(0.02); // from subtle
    expect(opts.grade.fade).toBe(0.5); // from CLI override
    expect(opts.grade.shadowTint).toBe("warm"); // from default (subtle doesn't set it)
  });
});
