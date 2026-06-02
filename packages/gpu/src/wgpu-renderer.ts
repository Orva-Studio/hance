import { join } from "node:path";
import { tmpdir } from "node:os";
import { unlink } from "node:fs/promises";
import { lutDataForParams } from "@hance/core";
import { sidecarPath } from "./sidecar-path";

export interface HeadlessRenderer {
  init(width: number, height: number, params?: Record<string, unknown>): Promise<void>;
  renderFrame(
    rgba: Uint8Array,
    width: number,
    height: number,
    params: Record<string, unknown>,
  ): Promise<Uint8Array>;
  close(): Promise<void>;
}

export async function createHeadlessRenderer(): Promise<HeadlessRenderer> {
  let proc: ReturnType<typeof Bun.spawn> | null = null;
  let initPath: string | null = null;
  let frameSize = 0;
  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  let readBuffer = new Uint8Array(0);

  async function readExactly(n: number): Promise<Uint8Array> {
    while (readBuffer.length < n) {
      const { done, value } = await reader!.read();
      if (done) throw new Error("Sidecar stdout closed unexpectedly");
      const combined = new Uint8Array(readBuffer.length + value.length);
      combined.set(readBuffer);
      combined.set(value, readBuffer.length);
      readBuffer = combined;
    }
    const result = readBuffer.slice(0, n);
    readBuffer = readBuffer.slice(n);
    return result;
  }

  async function init(width: number, height: number, params: Record<string, unknown> = {}): Promise<void> {
    frameSize = width * height * 4;

    const lut = lutDataForParams(params as Record<string, string | number | boolean>);
    const initJson = JSON.stringify({ width, height, params, lut });
    // The baked LUT can push init JSON past the OS argv limit, so pass it via a
    // temp file (the sidecar reads a file path that isn't inline JSON).
    initPath = join(tmpdir(), `hance-init-${process.pid}-${Date.now()}.json`);
    await Bun.write(initPath, initJson);
    try {
      proc = Bun.spawn([sidecarPath(), initPath], {
        stdin: "pipe",
        stdout: "pipe",
        stderr: "inherit",
      });
    } catch (err) {
      // Spawn failed before close() can run; don't leak the temp init file.
      try { await unlink(initPath); } catch {}
      initPath = null;
      throw err;
    }

    reader = proc.stdout.getReader();
  }

  async function renderFrame(
    rgba: Uint8Array,
    _width: number,
    _height: number,
    params: Record<string, unknown>,
  ): Promise<Uint8Array> {
    if (!proc) throw new Error("Renderer not initialized");

    await proc.stdin.write(rgba);

    return readExactly(frameSize);
  }

  async function close(): Promise<void> {
    if (proc) {
      proc.stdin.end();
      await proc.exited;
      proc = null;
      reader = null;
    }
    if (initPath) {
      try { await unlink(initPath); } catch {}
      initPath = null;
    }
  }

  return { init, renderFrame, close };
}
