export interface ColorSettingsOptions {
  enabled: boolean;
  exposure: number;
  contrast: number;
  highlights: number;
  fade: number;
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
  saturation: number;
  hue: number;
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
  softness: number;
  saturation: number;
  imageDefocus: number;
}

export interface VignetteOptions {
  enabled: boolean;
  amount: number;
  size: number;
}

export interface SplitToneOptions {
  enabled: boolean;
  mode: "natural" | "complementary";
  protectNeutrals: boolean;
  amount: number;
  hueAngle: number;
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
  colorSettings: ColorSettingsOptions;
  halation: HalationOptions;
  aberration: AberrationOptions;
  bloom: BloomOptions;
  grain: GrainOptions;
  vignette: VignetteOptions;
  splitTone: SplitToneOptions;
  cameraShake: CameraShakeOptions;
}

export type OutputCodec = "h264" | "prores" | "h265";
export type ExportPreset = "low" | "medium" | "high" | "max";
export type PixelFormat = "yuv420p" | "yuv420p10le" | "yuv422p10le";

export interface ProbeResult {
  duration: number | null;
  isImage: boolean;
  width: number | null;
  height: number | null;
  fps: number | null;
}
