import type { FilmOptions, ProbeResult } from "./types";
import { colorSettingsFilter } from "./effects/colorSettings";
import { halationFilter } from "./effects/halation";
import { aberrationFilter } from "./effects/aberration";
import { bloomFilter } from "./effects/bloom";
import { grainFilter } from "./effects/grain";
import { vignetteFilter } from "./effects/vignette";
import { splitToneFilter } from "./effects/splitTone";
import { cameraShakeFilter } from "./effects/cameraShake";
import { parseProgress, renderProgressBar } from "./progress";

export function buildFilterGraph(
  options: FilmOptions,
  isImage: boolean
): { graph: string; finalLabel: string } {
  const fragments: string[] = [];
  let currentLabel = "0:v";

  // For global blend: save original input reference
  const needsBlend = options.blend < 1;
  if (needsBlend) {
    fragments.push(`[0:v]split=2[gb_orig][gb_proc]`);
    currentLabel = "gb_proc";
  }

  // Color Settings
  const color = colorSettingsFilter(currentLabel, options.colorSettings);
  fragments.push(color.fragment);
  currentLabel = color.output;

  // Halation
  const halation = halationFilter(currentLabel, options.halation);
  fragments.push(halation.fragment);
  currentLabel = halation.output;

  // Aberration
  const aberration = aberrationFilter(currentLabel, options.aberration);
  fragments.push(aberration.fragment);
  currentLabel = aberration.output;

  // Bloom
  const bloom = bloomFilter(currentLabel, options.bloom);
  fragments.push(bloom.fragment);
  currentLabel = bloom.output;

  // Grain
  const grain = grainFilter(currentLabel, options.grain);
  fragments.push(grain.fragment);
  currentLabel = grain.output;

  // Vignette
  const vignette = vignetteFilter(currentLabel, options.vignette);
  fragments.push(vignette.fragment);
  currentLabel = vignette.output;

  // Split Tone
  const splitTone = splitToneFilter(currentLabel, options.splitTone);
  fragments.push(splitTone.fragment);
  currentLabel = splitTone.output;

  // Camera Shake (skip for images)
  if (!isImage) {
    const shake = cameraShakeFilter(currentLabel, options.cameraShake);
    fragments.push(shake.fragment);
    currentLabel = shake.output;
  }

  // Global Blend
  if (needsBlend) {
    const opacity = options.blend.toFixed(4);
    fragments.push(`[gb_orig][${currentLabel}]blend=all_mode=normal:all_opacity=${opacity}[blend_out]`);
    currentLabel = "blend_out";
  }

  return { graph: fragments.join(";"), finalLabel: currentLabel };
}

export async function runPipeline(
  options: FilmOptions,
  probeResult: ProbeResult
): Promise<void> {
  const { graph, finalLabel } = buildFilterGraph(options, probeResult.isImage);

  const args = [
    "ffmpeg", "-y",
    "-i", options.input,
    "-filter_complex", graph,
    "-map", `[${finalLabel}]`,
  ];

  if (!probeResult.isImage) {
    args.push("-map", "0:a?", "-c:a", "copy");
  }

  if (probeResult.isImage) {
    args.push(options.output);
  } else {
    args.push(
      "-c:v", "libx264",
      "-preset", options.preset,
      "-crf", String(options.crf),
      "-progress", "pipe:1",
      "-nostats",
      options.output
    );
  }

  if (probeResult.isImage) {
    process.stdout.write("Processing...\n");
  }

  const proc = Bun.spawn(args, {
    stdout: "pipe",
    stderr: "pipe",
  });

  if (!probeResult.isImage && probeResult.duration) {
    const reader = proc.stdout.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const ratio = parseProgress(buffer, probeResult.duration);
      if (ratio !== null) {
        process.stdout.write("\r" + renderProgressBar(ratio));
        buffer = "";
      }
    }
    process.stdout.write("\n");
  }

  const exitCode = await proc.exited;

  if (exitCode !== 0) {
    const stderr = await new Response(proc.stderr).text();
    console.error(`FFmpeg failed (exit ${exitCode}):\n${stderr.trim()}`);
    process.exit(1);
  }

  if (probeResult.isImage) {
    console.log("Done.");
  }
}
