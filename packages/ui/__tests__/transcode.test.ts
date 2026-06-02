import { describe, expect, test } from "bun:test";
import { buildProxyArgs } from "../lib/transcode";

function vfArg(args: string[]): string | undefined {
  const i = args.indexOf("-vf");
  return i === -1 ? undefined : args[i + 1];
}

describe("buildProxyArgs", () => {
  test("downscales to 720p and caps fps at 30 by default", () => {
    const args = buildProxyArgs("in.mov", "out.mp4", "libx264");
    const vf = vfArg(args);
    expect(vf).toContain("scale=-2:min(720\\,ih)");
    expect(vf).toContain("fps=min(30\\,source_fps)");
  });

  test("honors custom scale height and fps", () => {
    const args = buildProxyArgs("in.mov", "out.mp4", "libx264", { scaleHeight: 540, fps: 24 });
    const vf = vfArg(args);
    expect(vf).toContain("scale=-2:min(540\\,ih)");
    expect(vf).toContain("fps=min(24\\,source_fps)");
  });

  test("omits the scale filter when scaleHeight is 0", () => {
    const args = buildProxyArgs("in.mov", "out.mp4", "libx264", { scaleHeight: 0 });
    expect(vfArg(args)).not.toContain("scale");
  });

  test("omits -vf entirely when no filters apply", () => {
    const args = buildProxyArgs("in.mov", "out.mp4", "libx264", { scaleHeight: 0, fps: 0 });
    expect(args).not.toContain("-vf");
  });

  test("includes the chosen encoder and the input/output paths", () => {
    const args = buildProxyArgs("in.mov", "out.mp4", "h264_videotoolbox");
    expect(args).toContain("h264_videotoolbox");
    expect(args[0]).toBe("ffmpeg");
    expect(args.at(-1)).toBe("out.mp4");
    expect(args).toContain("in.mov");
  });
});
