import type { ExportPreset, OutputCodec, PixelFormat } from "./types";

export interface ExportPresetSettings {
  codec: OutputCodec;
  crf: number;
  encodePreset: "fast" | "medium" | "slow";
  pixelFormat: PixelFormat;
}

export const EXPORT_PRESETS: Record<ExportPreset, ExportPresetSettings> = {
  low: { codec: "h264", crf: 23, encodePreset: "fast", pixelFormat: "yuv420p" },
  medium: { codec: "h264", crf: 18, encodePreset: "medium", pixelFormat: "yuv420p" },
  high: { codec: "h265", crf: 16, encodePreset: "slow", pixelFormat: "yuv420p10le" },
  max: { codec: "prores", crf: 0, encodePreset: "medium", pixelFormat: "yuv422p10le" },
};

interface ExportOverrides {
  codec?: OutputCodec;
  crf?: number;
  encodePreset?: "fast" | "medium" | "slow";
}

export function resolveExportPreset(
  preset: ExportPreset,
  overrides: ExportOverrides,
): ExportPresetSettings {
  const base = EXPORT_PRESETS[preset];
  return {
    codec: overrides.codec ?? base.codec,
    crf: overrides.crf ?? base.crf,
    encodePreset: overrides.encodePreset ?? base.encodePreset,
    pixelFormat: base.pixelFormat,
  };
}
