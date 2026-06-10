import { describe, it, expect } from "bun:test";
import { loadPreset, applyPreset, exportLook, importLook } from "../src/presets";

describe("loadPreset", () => {
  it("loads the built-in default preset (.hlook format)", () => {
    const data = loadPreset("default");
    expect(data).toBeDefined();
    expect(data.name).toBe("Default");
    const params = data.params as Record<string, unknown>;
    expect(params["aberration"]).toBe(0.3);
    expect(params["halation-amount"]).toBe(0.25);
  });

  it("loads a named built-in preset (.hlook format)", () => {
    const data = loadPreset("portra-400");
    expect(data).toBeDefined();
    const params = data.params as Record<string, unknown>;
    expect(params["halation-amount"]).toBe(0.2);
  });

  it("throws for unknown preset", () => {
    expect(() => loadPreset("nonexistent")).toThrow(/not found/i);
  });
});

describe("applyPreset", () => {
  it("returns full effect options from default preset with no overrides", () => {
    const opts = applyPreset("default", {});
    expect(opts.colorSettings.exposure).toBe(0);
    expect(opts.colorSettings.contrast).toBe(1);
    expect(opts.halation.amount).toBe(0.25);
    expect(opts.aberration.amount).toBe(0.3);
    expect(opts.bloom.amount).toBe(0.25);
    expect(opts.grain.iso).toBe(400);
    expect(opts.vignette.amount).toBe(0.25);
    expect(opts.cameraShake.amount).toBe(0.25);
    expect(opts.encodePreset).toBe("medium");
    expect(opts.crf).toBe(18);
    expect(opts.blend).toBe(1);
  });

  it("applies CLI overrides on top of preset", () => {
    const opts = applyPreset("default", { "exposure": 0.5, "aberration": 0.8 });
    expect(opts.colorSettings.exposure).toBe(0.5);
    expect(opts.aberration.amount).toBe(0.8);
    // Non-overridden values stay at preset defaults
    expect(opts.halation.amount).toBe(0.25);
  });

  it("merges named preset over default then applies overrides", () => {
    const opts = applyPreset("portra-400", { "aberration": 0.5 });
    expect(opts.halation.amount).toBe(0.2); // from portra-400
    expect(opts.aberration.amount).toBe(0.5); // from CLI override
    expect(opts.vignette.amount).toBe(0.15); // from portra-400
  });

  it("handles boolean disable overrides", () => {
    const opts = applyPreset("default", { "no-halation": true });
    expect(opts.halation.enabled).toBe(false);
  });

  it("defaults the input LUT to the rec709 identity profile", () => {
    const opts = applyPreset("default", {});
    expect(opts.inputLut.enabled).toBe(true);
    expect(opts.inputLut.profile).toBe("rec709");
  });

  it("applies an input-lut-profile override", () => {
    const opts = applyPreset("default", { "input-lut-profile": "vlog" });
    expect(opts.inputLut.profile).toBe("vlog");
  });

  it("disables the input LUT via no-input-lut", () => {
    const opts = applyPreset("default", { "no-input-lut": true });
    expect(opts.inputLut.enabled).toBe(false);
  });

  it("reads a top-level preLut field from a look into the input LUT", () => {
    const opts = applyPreset("default", { preLut: "vlog" });
    expect(opts.inputLut.profile).toBe("vlog");
    expect(opts.mergedParams["input-lut-profile"]).toBe("vlog");
  });
});

describe("exportLook", () => {
  it("serializes preset data to JSON", () => {
    const json = exportLook("test", { "exposure": 0.5 });
    const parsed = JSON.parse(json);
    expect(parsed.name).toBe("test");
    expect(parsed.exposure).toBe(0.5);
  });

  it("is available on free tier", () => {
    const json = exportLook("test", {});
    expect(JSON.parse(json).name).toBe("test");
  });
});

describe("importLook", () => {
  it("parses JSON into preset data", () => {
    const data = importLook('{"name":"test","exposure":0.5}');
    expect(data.name).toBe("test");
  });

  it("is available on free tier", () => {
    const data = importLook('{"name":"test"}');
    expect(data.name).toBe("test");
  });

  it("round-trips a top-level preLut string", () => {
    const json = exportLook("vlog-look", { preLut: "vlog", exposure: 0.2 });
    const data = importLook(json);
    expect(data.preLut).toBe("vlog");
  });
});
