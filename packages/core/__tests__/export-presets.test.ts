import { describe, it, expect } from "bun:test";
import { EXPORT_PRESETS, resolveExportPreset, requireCodecLicense } from "../src/export-presets";

describe("EXPORT_PRESETS", () => {
  it("defines all four tiers", () => {
    expect(EXPORT_PRESETS.low).toBeDefined();
    expect(EXPORT_PRESETS.medium).toBeDefined();
    expect(EXPORT_PRESETS.high).toBeDefined();
    expect(EXPORT_PRESETS.max).toBeDefined();
  });

  it("low uses h264, crf 23, fast, 8-bit", () => {
    expect(EXPORT_PRESETS.low).toEqual({
      codec: "h264",
      crf: 23,
      encodePreset: "fast",
      pixelFormat: "yuv420p",
    });
  });

  it("medium uses h264, crf 18, medium, 8-bit", () => {
    expect(EXPORT_PRESETS.medium).toEqual({
      codec: "h264",
      crf: 18,
      encodePreset: "medium",
      pixelFormat: "yuv420p",
    });
  });

  it("high uses h265, crf 16, slow, 10-bit", () => {
    expect(EXPORT_PRESETS.high).toEqual({
      codec: "h265",
      crf: 16,
      encodePreset: "slow",
      pixelFormat: "yuv420p10le",
    });
  });

  it("max uses prores, no crf, 10-bit 422", () => {
    expect(EXPORT_PRESETS.max).toEqual({
      codec: "prores",
      crf: 0,
      encodePreset: "medium",
      pixelFormat: "yuv422p10le",
    });
  });
});

describe("resolveExportPreset", () => {
  it("returns preset values with no overrides", () => {
    const result = resolveExportPreset("low", {});
    expect(result.codec).toBe("h264");
    expect(result.crf).toBe(23);
    expect(result.encodePreset).toBe("fast");
    expect(result.pixelFormat).toBe("yuv420p");
  });

  it("individual overrides win over preset", () => {
    const result = resolveExportPreset("high", { codec: "h264", crf: 20 });
    expect(result.codec).toBe("h264");
    expect(result.crf).toBe(20);
    expect(result.encodePreset).toBe("slow");
    expect(result.pixelFormat).toBe("yuv420p10le");
  });

  it("allows h264 on free tier", () => {
    const result = resolveExportPreset("low", {}, { tier: "free" });
    expect(result.codec).toBe("h264");
  });

  it("allows h265 on free tier", () => {
    const result = resolveExportPreset("high", {}, { tier: "free" });
    expect(result.codec).toBe("h265");
  });

  it("blocks prores on free tier", () => {
    expect(() => resolveExportPreset("max", {}, { tier: "free" }))
      .toThrow('Codec "prores" requires a pro license');
  });

  it("blocks webm on free tier via requireCodecLicense", () => {
    expect(() => requireCodecLicense("webm", { tier: "free" }))
      .toThrow('Codec "webm" requires a pro license');
  });

  it("requireCodecLicense allows free codecs", () => {
    expect(() => requireCodecLicense("h264", { tier: "free" })).not.toThrow();
    expect(() => requireCodecLicense("h265", { tier: "free" })).not.toThrow();
  });

  it("requireCodecLicense allows everything without license context", () => {
    expect(() => requireCodecLicense("prores")).not.toThrow();
  });

  it("blocks webm on free tier", () => {
    expect(() => resolveExportPreset("low", { codec: "webm" }, { tier: "free" }))
      .toThrow('Codec "webm" requires a pro license');
  });

  it("allows prores on pro tier", () => {
    const result = resolveExportPreset("max", {}, { tier: "pro" });
    expect(result.codec).toBe("prores");
  });

  it("allows webm on pro tier", () => {
    const result = resolveExportPreset("low", { codec: "webm" }, { tier: "pro" });
    expect(result.codec).toBe("webm");
  });

  it("allows any codec when no license context", () => {
    const result = resolveExportPreset("max", {});
    expect(result.codec).toBe("prores");
  });
});
