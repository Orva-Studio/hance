import type { ExportPreset, OutputCodec, PixelFormat, LicenseContext } from "./types";
import { HANCE_PRO_URL } from "./constants";

export const PRO_CODECS: ReadonlySet<OutputCodec> = new Set(["prores", "webm"]);

export function requireCodecLicense(codec: OutputCodec, license?: LicenseContext): void {
  if (license && license.tier !== "pro" && PRO_CODECS.has(codec)) {
    throw new Error(`Codec "${codec}" requires a pro license — upgrade at ${HANCE_PRO_URL}`);
  }
}

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
  license?: LicenseContext,
): ExportPresetSettings {
  const base = EXPORT_PRESETS[preset];
  const codec = overrides.codec ?? base.codec;
  requireCodecLicense(codec, license);
  return {
    codec,
    crf: overrides.crf ?? base.crf,
    encodePreset: overrides.encodePreset ?? base.encodePreset,
    pixelFormat: base.pixelFormat,
  };
}
