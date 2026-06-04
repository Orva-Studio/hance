import { probe } from "@hance/core";
import { createWriteStream } from "node:fs";
import { cpus } from "node:os";

// Software ProRes decode is the CPU cost (no HW decoder exists on macOS), and
// it will pin every core. Cap it to ~half so the proxy stays well ahead of
// playback while leaving headroom for the rest of the machine (quieter fans).
function decodeThreads(): number {
  return Math.max(2, Math.floor(cpus().length / 2));
}

function pickH264Encoder(): string {
  return process.platform === "darwin" ? "h264_videotoolbox" : "libx264";
}

function encoderArgs(encoder: string): string[] {
  if (encoder === "h264_videotoolbox") return ["-c:v", encoder, "-q:v", "60"];
  return ["-c:v", encoder, "-preset", "veryfast", "-crf", "23"];
}

export interface ProxyOptions {
  // Cap the proxy's longest-side height (px). Preview only; never affects export.
  scaleHeight?: number;
  // Cap the proxy's framerate (fps). Preview only; never affects export.
  fps?: number;
  // Cap ffmpeg's decode threads; 0 lets ffmpeg use every core.
  threads?: number;
}

// Default proxy is downscaled to 720p for faster preview transcodes. Export
// reads the original footage, so this only changes what the grading UI shows.
const DEFAULT_PROXY_OPTIONS: Required<ProxyOptions> = {
  scaleHeight: 720,
  fps: 30,
  threads: decodeThreads(),
};

// Pure builder so the ffmpeg invocation can be unit-tested without spawning.
export function buildProxyArgs(
  inputPath: string,
  outputPath: string,
  encoder: string,
  options: ProxyOptions = {},
): string[] {
  const { scaleHeight, fps, threads } = { ...DEFAULT_PROXY_OPTIONS, ...options };
  const filters: string[] = [];
  // -2 keeps width even and preserves aspect ratio; only downscale, never up.
  if (scaleHeight > 0) filters.push(`scale=-2:min(${scaleHeight}\\,ih)`);
  if (fps > 0) filters.push(`fps=min(${fps}\\,source_fps)`);
  return [
    "ffmpeg", "-y",
    // Input-side: caps the (CPU-bound) decoder; the videotoolbox encoder
    // isn't CPU-threaded so this is where the savings are.
    ...(threads > 0 ? ["-threads", String(threads)] : []),
    "-i", inputPath,
    ...(filters.length ? ["-vf", filters.join(",")] : []),
    ...encoderArgs(encoder),
    "-profile:v", "high", "-level", "4.0",
    "-pix_fmt", "yuv420p",
    "-movflags", "+frag_keyframe+empty_moov+default_base_moof",
    "-c:a", "aac", "-b:a", "128k",
    "-nostats", "-v", "error",
    "-f", "mp4",
    "pipe:1",
  ];
}

export interface ProxyStream {
  // Raw fragmented-MP4 bytes for the browser to feed into MediaSource.
  stream: ReadableStream<Uint8Array>;
  // Total source duration in seconds, from probe; 0 if unknown.
  durationSec: number;
}

// Spawns ffmpeg, returns the fragmented-MP4 byte stream from stdout while
// teeing the exact same bytes to `outputPath` on disk so the finished proxy
// can be served by /api/proxy-file for full-range seeking after the swap.
export async function streamFragmentedMp4(
  inputPath: string,
  outputPath: string,
  options?: ProxyOptions,
): Promise<ProxyStream> {
  const probeResult = await probe(inputPath);
  const durationSec = probeResult.duration ?? 0;
  const encoder = pickH264Encoder();
  const proc = Bun.spawn(buildProxyArgs(inputPath, outputPath, encoder, options), {
    stdout: "pipe",
    stderr: "pipe",
  });

  const fileWriter = createWriteStream(outputPath);

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = proc.stdout.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          fileWriter.write(value);
          controller.enqueue(value);
        }
        const exitCode = await proc.exited;
        fileWriter.end();
        if (exitCode !== 0) {
          const stderr = await new Response(proc.stderr).text();
          controller.error(new Error(`ffmpeg failed: ${stderr.trim()}`));
          return;
        }
        controller.close();
      } catch (err) {
        fileWriter.end();
        try { proc.kill(); } catch {}
        controller.error(err);
      }
    },
    cancel() {
      try { proc.kill(); } catch {}
      fileWriter.end();
    },
  });

  return { stream, durationSec };
}
