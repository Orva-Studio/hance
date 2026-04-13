import { describe, it, expect } from "bun:test";
import { EXPORT_PRESETS, resolveExportPreset } from "../src/export-presets";

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
});
