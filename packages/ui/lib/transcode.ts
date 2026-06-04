import { probe } from "@hance/core";

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
}

// Default proxy is downscaled to 720p for faster preview transcodes. Export
// reads the original footage, so this only changes what the grading UI shows.
const DEFAULT_PROXY_OPTIONS: Required<ProxyOptions> = { scaleHeight: 720, fps: 30 };

// Pure builder so the ffmpeg invocation can be unit-tested without spawning.
export function buildProxyArgs(
  inputPath: string,
  outputPath: string,
  encoder: string,
  options: ProxyOptions = {},
): string[] {
  const { scaleHeight, fps } = { ...DEFAULT_PROXY_OPTIONS, ...options };
  const filters: string[] = [];
  // -2 keeps width even and preserves aspect ratio; only downscale, never up.
  if (scaleHeight > 0) filters.push(`scale=-2:min(${scaleHeight}\\,ih)`);
  if (fps > 0) filters.push(`fps=min(${fps}\\,source_fps)`);
  return [
    "ffmpeg", "-y", "-i", inputPath,
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

export function transcodeToH264Stream(inputPath: string, outputPath: string, options?: ProxyOptions): ReadableStream<Uint8Array> {
  return new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (obj: unknown) => {
        try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`)); } catch {}
      };
      try {
        const probeResult = await probe(inputPath);
        const durationSec = probeResult.duration ?? 0;
        const vcodec = pickH264Encoder();

        const proc = Bun.spawn(buildProxyArgs(inputPath, outputPath, vcodec, options), { stdout: "pipe", stderr: "pipe" });

        const reader = proc.stdout.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";
          for (const line of lines) {
            const m = line.match(/^out_time_us=(\d+)/);
            if (m && durationSec > 0) {
              const ratio = Math.min(1, Number(m[1]) / 1e6 / durationSec);
              send({ progress: ratio });
            }
          }
        }

        const exitCode = await proc.exited;
        if (exitCode !== 0) {
          const stderr = await new Response(proc.stderr).text();
          throw new Error(`ffmpeg failed: ${stderr.trim()}`);
        }
        send({ done: true, proxyUrl: `/api/proxy-file?path=${encodeURIComponent(outputPath)}` });
      } catch (err) {
        send({ error: (err as Error).message });
      } finally {
        try { controller.close(); } catch {}
      }
    },
  });
}
