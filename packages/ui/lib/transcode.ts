import { probe } from "@hance/core";

function pickH264Encoder(): string {
  return process.platform === "darwin" ? "h264_videotoolbox" : "libx264";
}

function encoderArgs(encoder: string): string[] {
  if (encoder === "h264_videotoolbox") return ["-c:v", encoder, "-q:v", "60"];
  return ["-c:v", encoder, "-preset", "veryfast", "-crf", "23"];
}

export function transcodeToH264Stream(inputPath: string, outputPath: string): ReadableStream<Uint8Array> {
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

        const proc = Bun.spawn([
          "ffmpeg", "-y", "-i", inputPath,
          ...encoderArgs(vcodec),
          "-pix_fmt", "yuv420p",
          "-movflags", "+faststart", "-c:a", "aac", "-b:a", "128k",
          "-progress", "pipe:1", "-nostats", "-v", "error",
          outputPath,
        ], { stdout: "pipe", stderr: "pipe" });

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
