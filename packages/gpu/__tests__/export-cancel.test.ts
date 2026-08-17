import { test, expect } from "bun:test";
import { runGpuExport, killPipeline, ExportCancelledError } from "../src/export";
import type { ProbeResult } from "../src/probe";

const probeResult = { width: 1920, height: 1080, fps: 24, duration: 10, isImage: false } as ProbeResult;

test("refuses to start when the signal is already aborted", async () => {
  const controller = new AbortController();
  controller.abort();

  await expect(
    runGpuExport("in.mov", "out.mp4", {}, probeResult, () => {}, undefined, controller.signal)
  ).rejects.toBeInstanceOf(ExportCancelledError);
});

// Killing only the `sh` that owns the pipeline leaves ffmpeg and the GPU
// sidecar orphaned and still rendering, so a cancel has to reap the shell's
// children too. Stand in for the real pipeline with sleeps.
test("killPipeline reaps the pipeline's child processes, not just the shell", async () => {
  const proc = Bun.spawn(["sh", "-c", "sleep 30 | sleep 30 | sleep 30"], {
    stdout: "ignore",
    stderr: "ignore",
  });

  // Give the shell a moment to actually fork its children.
  await Bun.sleep(300);
  const childrenBefore = Bun.spawnSync(["pgrep", "-P", String(proc.pid)]);
  expect(new TextDecoder().decode(childrenBefore.stdout).trim().split("\n").filter(Boolean).length).toBeGreaterThan(0);

  killPipeline(proc.pid, () => proc.kill());
  await proc.exited;
  await Bun.sleep(300);

  const childrenAfter = Bun.spawnSync(["pgrep", "-P", String(proc.pid)]);
  expect(new TextDecoder().decode(childrenAfter.stdout).trim()).toBe("");
});
