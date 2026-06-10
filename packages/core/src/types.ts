export interface InputLutOptions {
  enabled: boolean;
  profile: "rec709" | "vlog";
}

export interface ColorSettingsOptions {
  enabled: boolean;
  exposure: number;
  contrast: number;
  highlights: number;
  fade: number;
  fadeTint: number;
  fadeHue: number;
  whiteBalance: number;
  tint: number;
  subtractiveSat: number;
  richness: number;
  bleachBypass: number;
}

export interface HalationOptions {
  enabled: boolean;
  amount: number;
  radius: number;
  highlightsOnly: boolean;
}

export interface AberrationOptions {
  enabled: boolean;
  amount: number;
}

export interface CameraShakeOptions {
  enabled: boolean;
  amount: number;
  rate: number;
}

export interface GrainOptions {
  enabled: boolean;
  amount: number;
  size: number;
  saturation: number;
  imageDefocus: number;
  iso: number;
}

export interface VignetteOptions {
  enabled: boolean;
  amount: number;
  size: number;
}

export interface SplitToneOptions {
  enabled: boolean;
  protectNeutrals: boolean;
  amount: number;
  /** Independent per-band hues in degrees. */
  shadowHueAngle: number;
  highlightHueAngle: number;
  /** Highlight tint strength as a fraction of the shadow scale (0–1). */
  highlightStrength: number;
  pivot: number;
}

export interface BloomOptions {
  enabled: boolean;
  amount: number;
  radius: number;
}

export interface FilmOptions {
  input: string;
  output: string;
  encodePreset: "fast" | "medium" | "slow";
  codec: OutputCodec;
  crf: number;
  blend: number;
  pixelFormat: PixelFormat;
  inputLut: InputLutOptions;
  colorSettings: ColorSettingsOptions;
  halation: HalationOptions;
  aberration: AberrationOptions;
  bloom: BloomOptions;
  grain: GrainOptions;
  vignette: VignetteOptions;
  splitTone: SplitToneOptions;
  cameraShake: CameraShakeOptions;
}

export type OutputCodec = "h264" | "h265" | "prores" | "webm";

export interface LicenseContext {
  tier: "free" | "pro";
}
export type ExportPreset = "low" | "medium" | "high" | "max";
export type PixelFormat = "yuv420p" | "yuv420p10le" | "yuv422p10le";

export interface ProbeResult {
  duration: number | null;
  isImage: boolean;
  width: number | null;
  height: number | null;
  fps: number | null;
}
