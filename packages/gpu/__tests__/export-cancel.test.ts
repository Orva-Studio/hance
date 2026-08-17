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

function isAlive(pid: number): boolean {
  try {
    // Signal 0 tests for existence without touching the process.
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function childrenOf(pid: number): number[] {
  const out = Bun.spawnSync(["pgrep", "-P", String(pid)]);
  return new TextDecoder().decode(out.stdout)
    .split("\n")
    .map(l => Number(l.trim()))
    .filter(n => Number.isInteger(n) && n > 0);
}

// Killing only the `sh` that owns the pipeline leaves ffmpeg and the GPU
// sidecar orphaned and still rendering, so a cancel has to reap the shell's
// children too. Stand in for the real pipeline with sleeps.
//
// The children must be identified BEFORE the kill and then checked by pid:
// querying `pgrep -P <shell>` afterwards returns nothing either way, because a
// dead shell has no children to report — orphans get reparented to init rather
// than dying. That weaker check passes even with the reaping removed.
test("killPipeline reaps the pipeline's child processes, not just the shell", async () => {
  const proc = Bun.spawn(["sh", "-c", "sleep 30 | sleep 30 | sleep 30"], {
    stdout: "ignore",
    stderr: "ignore",
  });

  // Give the shell a moment to actually fork its children.
  await Bun.sleep(300);
  const children = childrenOf(proc.pid);
  expect(children.length).toBeGreaterThan(0);
  expect(children.every(isAlive)).toBe(true);

  killPipeline(proc.pid, () => proc.kill());
  await proc.exited;
  await Bun.sleep(300);

  const survivors = children.filter(isAlive);
  expect(survivors).toEqual([]);
});
