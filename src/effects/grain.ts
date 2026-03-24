import type { FilterResult, GrainOptions } from "../types";

export function grainFilter(input: string, options: GrainOptions): FilterResult {
  if (!options.enabled) {
    return { fragment: `[${input}]null[grain_out]`, output: "grain_out" };
  }

  const { amount, size, softness, saturation, imageDefocus } = options;

  // Noise intensity mapped from 0-1 to FFmpeg noise alls range (0-100)
  const noiseIntensity = Math.round(amount * 100);

  // Size controls the scale of grain particles (blur the noise to make it coarser)
  const grainBlur = size > 0 ? `,gblur=sigma=${(size * 2).toFixed(2)}` : "";

  // Softness blurs the grain slightly for a softer look
  const softnessBlur = softness > 0 ? `,gblur=sigma=${(softness * 1.5).toFixed(2)}` : "";

  // Build noise generation: use allf for all frames, temporal noise
  const noiseFilter = `noise=alls=${noiseIntensity}:allf=t`;

  // Optional image defocus (blur applied to the base image, not the grain)
  const defocusChain = imageDefocus > 0 ? `gblur=sigma=${(imageDefocus * 0.5).toFixed(2)},` : "";

  // Saturation of grain: 0 = monochrome grain, 1 = full color grain
  // Use hue=s to desaturate the noise layer
  const grainSat = `,hue=s=${saturation.toFixed(4)}`;

  const fragment = [
    `[${input}]split=2[grain_orig][grain_base];`,
    `[grain_base]${defocusChain}${noiseFilter}${grainBlur}${softnessBlur}${grainSat}[grain_noisy];`,
    `[grain_orig][grain_noisy]blend=all_mode=overlay:all_opacity=${amount.toFixed(4)}[grain_out]`,
  ].join("");

  return { fragment, output: "grain_out" };
}
