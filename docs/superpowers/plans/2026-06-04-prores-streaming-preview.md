# Streaming Preview for Undecodable Codecs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Start playing the ProRes preview in ~1 second by streaming a fragmented-MP4 H.264 proxy into the browser via Media Source Extensions while the transcode is still running, instead of waiting for the whole file.

**Architecture:** `buildProxyArgs` produces fragmented MP4 on ffmpeg stdout. The server tees that byte stream to the browser and to a temp file. A client hook feeds the bytes into a `MediaSource`/`SourceBuffer` for instant playback, derives progress from `video.buffered`, then swaps the `<video>` to the finished file for full-range seeking. Export is untouched.

**Tech Stack:** Bun, TypeScript, React, ffmpeg (`h264_videotoolbox`/`libx264`), Media Source Extensions, WebGPU (unchanged frame path).

---

## File Structure

- `packages/ui/lib/transcode.ts` (modify): fMP4 args + new streaming runner that tees to disk.
- `packages/ui/__tests__/transcode.test.ts` (modify): unit tests for new args.
- `packages/ui/server.ts` (modify): `/api/proxy` becomes a byte stream with headers; `/api/proxy-file` unchanged.
- `packages/ui/app/hooks/useProxyStream.ts` (create): owns the MSE lifecycle, swap, and fallback.
- `packages/ui/app/hooks/__tests__/useProxyStream.test.ts` (create): swap/fallback unit tests.
- `packages/ui/app/App.tsx` (modify): auto-start, remove blocking CTA, wire hook + proxyState.
- `packages/ui/app/components/Timeline.tsx` (modify): accept a duration override + buffered fill.
- `packages/ui/__tests__/proxy-stream.e2e.test.ts` (create): real ffmpeg POST to `/api/proxy`.
- `packages/docs/src/content/docs/docs/browser-ui.md` (modify): describe streaming preview.

---

## Task 1: Fragmented-MP4 ffmpeg args

**Files:**
- Modify: `packages/ui/lib/transcode.ts:24-44` (`buildProxyArgs`)
- Test: `packages/ui/__tests__/transcode.test.ts`

- [ ] **Step 1: Update the existing output-path test for the streaming output**

In `packages/ui/__tests__/transcode.test.ts`, replace the test
`"includes the chosen encoder and the input/output paths"` body's last-arg
assertion and add a new test block:

```typescript
  test("includes the chosen encoder and the input path", () => {
    const args = buildProxyArgs("in.mov", "out.mp4", "h264_videotoolbox");
    expect(args).toContain("h264_videotoolbox");
    expect(args[0]).toBe("ffmpeg");
    expect(args).toContain("in.mov");
  });

  test("outputs fragmented mp4 to stdout, not a faststart file", () => {
    const args = buildProxyArgs("in.mov", "out.mp4", "libx264");
    const i = args.indexOf("-movflags");
    expect(args[i + 1]).toBe("+frag_keyframe+empty_moov+default_base_moof");
    expect(args).not.toContain("+faststart");
    expect(args.at(-1)).toBe("pipe:1");
  });

  test("pins H.264 profile and level for a deterministic codec string", () => {
    const args = buildProxyArgs("in.mov", "out.mp4", "libx264");
    expect(args).toContain("-profile:v");
    expect(args[args.indexOf("-profile:v") + 1]).toBe("high");
    expect(args).toContain("-level");
    expect(args[args.indexOf("-level") + 1]).toBe("4.0");
  });

  test("does not request progress on stdout (stdout carries video)", () => {
    const args = buildProxyArgs("in.mov", "out.mp4", "libx264");
    expect(args).not.toContain("-progress");
  });
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `bun test packages/ui/__tests__/transcode.test.ts`
Expected: FAIL on the fragmented/profile/progress assertions.

- [ ] **Step 3: Rewrite `buildProxyArgs`**

In `packages/ui/lib/transcode.ts`, replace the `return [...]` in `buildProxyArgs`
(lines 35-43). The `outputPath` param stays in the signature (the runner still
needs the disk path), but it is no longer the ffmpeg output. Also pin the
profile/level in `encoderArgs` is wrong location, so add profile flags in the
main array:

```typescript
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
```

Note: `-f mp4` is required because the `pipe:1` target has no extension for
ffmpeg to infer the muxer from. `outputPath` is intentionally unused inside the
builder now; keep the parameter for the runner.

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test packages/ui/__tests__/transcode.test.ts`
Expected: PASS (all, including the unchanged scale/fps tests).

- [ ] **Step 5: Commit**

```bash
git add packages/ui/lib/transcode.ts packages/ui/__tests__/transcode.test.ts
git commit -m "feat(ui): emit fragmented mp4 proxy on stdout for streaming"
```

---

## Task 2: Streaming runner that tees ffmpeg stdout to disk

**Files:**
- Modify: `packages/ui/lib/transcode.ts` (replace `transcodeToH264Stream`)
- Test: covered by the e2e test in Task 7 (real ffmpeg). No pure unit test here because the function spawns a process and writes a file.

- [ ] **Step 1: Replace `transcodeToH264Stream` with a fMP4 byte-stream runner**

In `packages/ui/lib/transcode.ts`, delete `transcodeToH264Stream` (lines 46-91)
and add. Use `node:` builtins per project convention:

```typescript
import { probe } from "@hance/core";
import { createWriteStream } from "node:fs";

// ... keep pickH264Encoder, encoderArgs, ProxyOptions, DEFAULT_PROXY_OPTIONS, buildProxyArgs ...

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
```

- [ ] **Step 2: Type-check the package compiles**

Run: `bun test packages/ui/__tests__/transcode.test.ts`
Expected: PASS (builder tests still green; no import errors).

- [ ] **Step 3: Commit**

```bash
git add packages/ui/lib/transcode.ts
git commit -m "feat(ui): stream fragmented mp4 and tee proxy to disk"
```

---

## Task 3: Server `/api/proxy` byte stream with headers

**Files:**
- Modify: `packages/ui/server.ts:277-313` (`/api/proxy` handler)
- Modify: `packages/ui/server.ts` import of `transcodeToH264Stream`

- [ ] **Step 1: Update the import**

Find the existing import of `transcodeToH264Stream` near the top of
`packages/ui/server.ts` and change it to `streamFragmentedMp4`.

Run: `grep -n "transcodeToH264Stream\|streamFragmentedMp4" packages/ui/server.ts`
to locate it, then edit the import line to:

```typescript
import { streamFragmentedMp4 } from "./lib/transcode";
```

- [ ] **Step 2: Replace the `/api/proxy` handler body**

Replace lines 277-313 (the whole `if (url.pathname === "/api/proxy" ...)` block) with:

```typescript
      if (url.pathname === "/api/proxy" && req.method === "POST") {
        const formData = await req.formData();
        const file = formData.get("file") as File | null;
        if (!file) return new Response("file required", { status: 400 });

        const proxyDir = join(tmpdir(), "hance-proxy");
        mkdirSync(proxyDir, { recursive: true });
        const id = `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
        const inputPath = join(proxyDir, `input_${id}${safeExt(file.name)}`);
        await Bun.write(inputPath, file);

        const outputPath = join(proxyDir, `proxy_${id}.mp4`);
        let proxy;
        try {
          proxy = await streamFragmentedMp4(inputPath, outputPath);
        } catch (err) {
          try { unlinkSync(inputPath); } catch {}
          return new Response((err as Error).message, { status: 500 });
        }

        const reader = proxy.stream.getReader();
        const body = new ReadableStream<Uint8Array>({
          async start(controller) {
            try {
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                controller.enqueue(value);
              }
              controller.close();
            } catch (err) {
              controller.error(err);
            } finally {
              try { unlinkSync(inputPath); } catch {}
            }
          },
          cancel() {
            reader.cancel();
            try { unlinkSync(inputPath); } catch {}
          },
        });

        return new Response(body, {
          headers: {
            "Content-Type": "video/mp4",
            "Cache-Control": "no-store",
            "X-Proxy-Duration": String(proxy.durationSec),
            "X-Proxy-Path": outputPath,
          },
        });
      }
```

`/api/proxy-file` (lines 315-327) stays exactly as-is.

- [ ] **Step 3: Smoke-test the server boots**

Run: `bun build packages/ui/server.ts --target bun > /dev/null && echo OK`
Expected: `OK` (no type/import errors).

- [ ] **Step 4: Commit**

```bash
git add packages/ui/server.ts
git commit -m "feat(ui): serve proxy as fragmented-mp4 byte stream with headers"
```

---

## Task 4: `useProxyStream` hook (MSE lifecycle, swap, fallback)

**Files:**
- Create: `packages/ui/app/hooks/useProxyStream.ts`
- Test: `packages/ui/app/hooks/__tests__/useProxyStream.test.ts`

The hook returns a `previewSrc` (the blob MediaSource URL while streaming, the
file URL after swap), a `state`, a numeric `progress` (0..1), a `durationHint`
(seconds, from the header), and a `start(file)` action. It exposes a pure
helper `pickProxyMime()` and a pure `computeBufferedProgress()` so they can be
unit-tested without a real `MediaSource`.

- [ ] **Step 1: Write failing unit tests for the pure helpers**

Create `packages/ui/app/hooks/__tests__/useProxyStream.test.ts`:

```typescript
import { describe, expect, test } from "bun:test";
import { PROXY_MIME, computeBufferedProgress } from "../useProxyStream";

describe("PROXY_MIME", () => {
  test("matches the pinned high-profile H.264 + AAC codec string", () => {
    expect(PROXY_MIME).toBe('video/mp4; codecs="avc1.640028, mp4a.40.2"');
  });
});

describe("computeBufferedProgress", () => {
  test("is 0 when nothing is buffered or duration unknown", () => {
    expect(computeBufferedProgress(0, 0)).toBe(0);
    expect(computeBufferedProgress(5, 0)).toBe(0);
  });

  test("is the buffered-end over duration, clamped to 1", () => {
    expect(computeBufferedProgress(3, 12)).toBeCloseTo(0.25, 5);
    expect(computeBufferedProgress(15, 12)).toBe(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test packages/ui/app/hooks/__tests__/useProxyStream.test.ts`
Expected: FAIL with "Cannot find module ../useProxyStream".

- [ ] **Step 3: Implement the hook**

Create `packages/ui/app/hooks/useProxyStream.ts`:

```typescript
import { useCallback, useRef, useState } from "react";

export const PROXY_MIME = 'video/mp4; codecs="avc1.640028, mp4a.40.2"';

export type ProxyStreamState =
  | "idle"
  | "streaming"
  | "ready"
  | "error";

// buffered end (sec) over duration (sec), clamped to [0, 1].
export function computeBufferedProgress(bufferedEnd: number, durationSec: number): number {
  if (durationSec <= 0) return 0;
  return Math.min(1, bufferedEnd / durationSec);
}

function mseSupported(): boolean {
  return typeof MediaSource !== "undefined" && MediaSource.isTypeSupported(PROXY_MIME);
}

export interface ProxyStreamApi {
  previewSrc: string | null;
  state: ProxyStreamState;
  progress: number;
  durationHint: number;
  errorMsg: string | null;
  start: (file: File) => Promise<void>;
}

export function useProxyStream(): ProxyStreamApi {
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const [state, setState] = useState<ProxyStreamState>("idle");
  const [progress, setProgress] = useState(0);
  const [durationHint, setDurationHint] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const blobUrlRef = useRef<string | null>(null);

  const start = useCallback(async (file: File) => {
    setState("streaming");
    setProgress(0);
    setErrorMsg(null);

    const formData = new FormData();
    formData.append("file", file);

    let res: Response;
    try {
      res = await fetch("/api/proxy", { method: "POST", body: formData });
    } catch (err) {
      setState("error");
      setErrorMsg((err as Error).message);
      return;
    }
    if (!res.ok || !res.body) {
      setState("error");
      setErrorMsg((await res.text().catch(() => "")) || "Proxy request failed");
      return;
    }

    const durationSec = Number(res.headers.get("X-Proxy-Duration") ?? "0");
    const proxyPath = res.headers.get("X-Proxy-Path") ?? "";
    setDurationHint(durationSec);
    const fileUrl = `/api/proxy-file?path=${encodeURIComponent(proxyPath)}`;

    // Fallback: drain the whole stream, then play the finished file.
    if (!mseSupported()) {
      try {
        await res.arrayBuffer();
        setPreviewSrc(fileUrl);
        setProgress(1);
        setState("ready");
      } catch (err) {
        setState("error");
        setErrorMsg((err as Error).message);
      }
      return;
    }

    const mediaSource = new MediaSource();
    const blobUrl = URL.createObjectURL(mediaSource);
    blobUrlRef.current = blobUrl;
    setPreviewSrc(blobUrl);

    mediaSource.addEventListener("sourceopen", async () => {
      const sourceBuffer = mediaSource.addSourceBuffer(PROXY_MIME);
      const reader = res.body!.getReader();

      const appendChunk = (chunk: Uint8Array) =>
        new Promise<void>((resolve, reject) => {
          const onUpdate = () => { sourceBuffer.removeEventListener("updateend", onUpdate); resolve(); };
          const onErr = () => { sourceBuffer.removeEventListener("error", onErr); reject(new Error("SourceBuffer append failed")); };
          sourceBuffer.addEventListener("updateend", onUpdate);
          sourceBuffer.addEventListener("error", onErr);
          sourceBuffer.appendBuffer(chunk);
        });

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          await appendChunk(value);
          const end = sourceBuffer.buffered.length
            ? sourceBuffer.buffered.end(sourceBuffer.buffered.length - 1)
            : 0;
          setProgress(computeBufferedProgress(end, durationSec));
        }
        if (mediaSource.readyState === "open") mediaSource.endOfStream();
        setProgress(1);
        setState("ready");
        setPreviewSrc(fileUrl); // swap handled by the consumer (Task 5) to preserve currentTime
      } catch (err) {
        setState("error");
        setErrorMsg((err as Error).message);
      } finally {
        if (blobUrlRef.current) {
          URL.revokeObjectURL(blobUrlRef.current);
          blobUrlRef.current = null;
        }
      }
    }, { once: true });
  }, []);

  return { previewSrc, state, progress, durationHint, errorMsg, start };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test packages/ui/app/hooks/__tests__/useProxyStream.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/app/hooks/useProxyStream.ts packages/ui/app/hooks/__tests__/useProxyStream.test.ts
git commit -m "feat(ui): add useProxyStream MSE hook with progress and fallback"
```

---

## Task 5: Wire the hook into App, auto-start, remove blocking CTA, swap with currentTime preserved

**Files:**
- Modify: `packages/ui/app/App.tsx` (lines 25-62 transcode logic, 101-110 reset effect, 518-556 CTA overlay)
- Modify: `packages/ui/app/hooks/useUpload.ts` is left as-is; `proxyUrl` plumbing is replaced by the hook's `previewSrc`.

The swap to the finished file must preserve `currentTime`. We do that in App
where we hold the `videoElement` ref, by reacting to the `previewSrc` change.

- [ ] **Step 1: Replace the transcode state + callback**

In `App.tsx`, remove the `consumeSSE` import (line 22) if now unused, and remove
the `startTranscode` callback and the `proxyState`/`proxyProgress`/`proxyErrorMsg`
useStates (lines 29-31, 36-62). Add at the top of the component:

```typescript
  const proxy = useProxyStream();
  const previewSrc = proxy.previewSrc ?? objectUrl;
```

Add the import:

```typescript
import { useProxyStream } from "./hooks/useProxyStream";
```

Remove the old `const previewSrc = proxyUrl ?? objectUrl;` (line 27) and the
`proxyUrl, setProxyUrl` destructure from `useUpload` (line 26) if unused
elsewhere (keep `setProxyUrl` out).

- [ ] **Step 2: Auto-start streaming on upload of an undecodable video**

The existing flow shows the CTA overlay when the browser can't decode the
source. Replace that detection with an effect that auto-starts the stream. Add
after the upload hook:

```typescript
  useEffect(() => {
    if (file && isVideo) {
      // objectUrl plays directly for decodable codecs; the <video> error path
      // (Canvas onError) tells us when we actually need a proxy. Start eagerly
      // for known-undecodable types, else let the direct play attempt happen.
      if (needsProxy(file)) proxy.start(file);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file]);
```

Add a small pure helper near the top of the file (or import from a shared util):

```typescript
function needsProxy(file: File): boolean {
  // Browsers cannot decode ProRes / many intermediate codecs. MIME is often
  // generic (video/quicktime) so also check the extension.
  const name = file.name.toLowerCase();
  return /\.(mov|mxf|prores)$/.test(name) || file.type === "video/quicktime";
}
```

Note: if a `.mov` is actually H.264 the direct `objectUrl` would have worked,
but transcoding it is harmless (preview only) and keeps the logic simple. If you
prefer zero unnecessary transcodes, gate `proxy.start` on the Canvas `onError`
video-decode failure instead; that is acceptable but adds a round-trip delay.
For this plan, eager-start on `needsProxy` is the chosen behavior.

- [ ] **Step 3: Preserve currentTime across the file swap**

`useProxyStream` sets `previewSrc` to the file URL on completion. Because the
`<video>` is recreated by `Canvas` when `src` changes, capture and restore the
playhead. Add:

```typescript
  const lastTimeRef = useRef(0);
  useEffect(() => {
    if (videoElement) {
      const onTime = () => { lastTimeRef.current = videoElement.currentTime; };
      videoElement.addEventListener("timeupdate", onTime);
      return () => videoElement.removeEventListener("timeupdate", onTime);
    }
  }, [videoElement]);

  // When the proxy finishes and we swap to the file, restore the playhead.
  useEffect(() => {
    if (proxy.state === "ready" && videoElement) {
      const t = lastTimeRef.current;
      const restore = () => {
        try { videoElement.currentTime = t; } catch {}
        videoElement.removeEventListener("loadedmetadata", restore);
      };
      videoElement.addEventListener("loadedmetadata", restore);
    }
  }, [proxy.state, videoElement]);
```

- [ ] **Step 4: Replace the blocking CTA overlay with a non-blocking pill**

Replace the overlay block (old lines ~516-556, the
`This codec isn't supported...` panel and its `proxyState` branches) with a
small pill rendered over the canvas while streaming, plus an error state:

```tsx
      {proxy.state === "streaming" && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 px-3 py-1.5 rounded-full bg-zinc-900/80 backdrop-blur text-xs text-zinc-200">
          <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
          Buffering preview {Math.round(proxy.progress * 100)}%
        </div>
      )}
      {proxy.state === "error" && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 px-3 py-1.5 rounded-full bg-danger/90 text-xs text-white">
          {proxy.errorMsg ?? "Preview failed"}
          <button className="underline" onClick={() => file && proxy.start(file)}>Retry</button>
        </div>
      )}
```

Ensure the canvas wrapper has `relative` positioning so the absolute pill
anchors correctly (check the parent `div` around `<Canvas>`; add `relative` to
its className if missing).

- [ ] **Step 5: Update the reset effect**

In the upload-reset `useEffect` (old lines 101-110) remove references to
`setProxyState`/`setProxyProgress`/`setProxyErrorMsg` (now gone). Leave the
other resets (`setPreviewError`, `setReferenceImage`, view mode, zoom) intact.

- [ ] **Step 6: Build the UI to verify it compiles**

Run: `cd packages/ui && bun run build` (or the project's UI build script;
check `package.json` scripts). Expected: build succeeds, no TS errors.

- [ ] **Step 7: Commit**

```bash
git add packages/ui/app/App.tsx
git commit -m "feat(ui): auto-start streaming preview and swap to file on completion"
```

---

## Task 6: Timeline buffered fill + duration override

**Files:**
- Modify: `packages/ui/app/components/Timeline.tsx`

The timeline should show the true duration immediately (from the header) and a
buffered fill that animates forward.

- [ ] **Step 1: Add props for the duration hint and a streaming flag**

In `Timeline.tsx`, extend `Props` and the component signature:

```typescript
interface Props {
  videoRef: HTMLVideoElement | null;
  durationHint?: number;   // seconds, from X-Proxy-Duration; used before metadata loads
  streaming?: boolean;     // true while the proxy is still buffering in
}

export function Timeline({ videoRef, durationHint = 0, streaming = false }: Props) {
```

- [ ] **Step 2: Seed duration from the hint**

Where `duration` is initialized/updated, prefer the larger of the hint and the
video's metadata duration so the full track renders immediately:

```typescript
  const [duration, setDuration] = useState(durationHint);
  // ...
  // inside the metadata effect, when video.duration is known:
  if (videoRef.duration) setDuration(Math.max(videoRef.duration, durationHint));
```

Also add an effect so a later `durationHint` (arriving after first render) is
applied:

```typescript
  useEffect(() => {
    if (durationHint > 0) setDuration((d) => Math.max(d, durationHint));
  }, [durationHint]);
```

- [ ] **Step 3: Track buffered end and render a fill bar**

Add buffered tracking driven off the existing rAF loop. Add a ref + state:

```typescript
  const [bufferedEnd, setBufferedEnd] = useState(0);
```

Inside the existing `updateTime` rAF callback, also sample buffered:

```typescript
      if (videoRef && videoRef.buffered.length) {
        setBufferedEnd(videoRef.buffered.end(videoRef.buffered.length - 1));
      }
```

In the track JSX (the same container that holds the playhead and ticks), render
a buffered fill behind the playhead. Place this as the first child of the track
`div`:

```tsx
        {streaming && duration > 0 && (
          <div
            className="absolute inset-y-0 left-0 bg-accent/20 transition-[width] duration-200 pointer-events-none"
            style={{ width: `${Math.min(100, (bufferedEnd / duration) * 100)}%` }}
          />
        )}
```

When `streaming` is false (after the swap), the fill is not rendered and the
whole track is seekable as before.

- [ ] **Step 4: Pass the new props from App**

In `App.tsx` where `<Timeline videoRef={videoElement} />` is rendered, pass:

```tsx
            <Timeline
              videoRef={videoElement}
              durationHint={proxy.durationHint}
              streaming={proxy.state === "streaming"}
            />
```

- [ ] **Step 5: Build to verify it compiles**

Run: `cd packages/ui && bun run build`
Expected: success.

- [ ] **Step 6: Commit**

```bash
git add packages/ui/app/components/Timeline.tsx packages/ui/app/App.tsx
git commit -m "feat(ui): show full timeline with buffered fill while streaming"
```

---

## Task 7: E2E test for `/api/proxy` fragmented streaming

**Files:**
- Create: `packages/ui/__tests__/proxy-stream.e2e.test.ts`

This exercises real ffmpeg. It needs a tiny ProRes (or any) fixture. Reuse an
existing e2e fixture if one exists; otherwise generate one with ffmpeg in the
test setup.

- [ ] **Step 1: Write the e2e test**

```typescript
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { streamFragmentedMp4 } from "../lib/transcode";

const work = mkdtempSync(join(tmpdir(), "hance-proxy-e2e-"));
const inputPath = join(work, "in.mov");

beforeAll(async () => {
  // 1s ProRes test clip so the browser-undecodable path is exercised.
  const gen = Bun.spawn([
    "ffmpeg", "-y",
    "-f", "lavfi", "-i", "testsrc=size=320x240:rate=30:duration=1",
    "-c:v", "prores_ks", "-pix_fmt", "yuv422p10le",
    inputPath,
  ], { stdout: "ignore", stderr: "ignore" });
  await gen.exited;
});

describe("streamFragmentedMp4", () => {
  test("streams fragmented mp4 bytes and writes the proxy to disk", async () => {
    const outputPath = join(work, "proxy.mp4");
    const { stream, durationSec } = await streamFragmentedMp4(inputPath, outputPath);

    const chunks: Uint8Array[] = [];
    const reader = stream.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
    const bytes = Buffer.concat(chunks);

    // Fragmented mp4 contains moof boxes; faststart files lead with a single moov.
    expect(bytes.includes(Buffer.from("moof"))).toBe(true);
    expect(durationSec).toBeGreaterThan(0);
    expect(existsSync(outputPath)).toBe(true);
    expect(readdirSync(work)).toContain("proxy.mp4");
  });
});
```

- [ ] **Step 2: Run the e2e test**

Run: `bun test packages/ui/__tests__/proxy-stream.e2e.test.ts`
Expected: PASS. (Requires ffmpeg with `prores_ks` and `lavfi`, which the dev
environment already has.)

- [ ] **Step 3: Commit**

```bash
git add packages/ui/__tests__/proxy-stream.e2e.test.ts
git commit -m "test(ui): e2e fragmented-mp4 proxy streaming and disk tee"
```

---

## Task 8: Docs update

**Files:**
- Modify: `packages/docs/src/content/docs/docs/browser-ui.md:26-30`

- [ ] **Step 1: Update the ProRes note**

Replace the Upload & preview video bullet (line 26) and the `:::note` (lines
28-30) with copy that describes streaming. No em dashes:

```markdown
- **Videos** play back through the browser's native player. Formats the browser cannot decode, notably **ProRes**, are transcoded to an H.264 proxy capped at **720p / 30fps** purely for preview. Playback begins within about a second and the rest of the clip streams in while transcoding continues. Seeking is limited to the portion loaded so far until the transcode finishes, after which the whole clip is seekable. The proxy is never used for export; exporting always re-renders from your original file.

:::note
ProRes (and similar professional or intermediate codecs) cannot be played by web browsers, so hance generates a lightweight H.264 proxy on upload. It streams in progressively so you can start previewing almost immediately. This only affects what you see in the editor, not your final render.
:::
```

- [ ] **Step 2: Build the docs to verify slugs and links**

Run: `cd packages/docs && bun run build`
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add packages/docs/src/content/docs/docs/browser-ui.md
git commit -m "docs(browser-ui): describe streaming ProRes preview"
```

---

## Final verification

- [ ] Run the full unit suite: `bun test` — expect green.
- [ ] Run e2e: `bun test packages/ui/__tests__/proxy-stream.e2e.test.ts` — expect green.
- [ ] Manual: `bun run packages/ui/src/... ui <a-prores-file>.mov` (or `hance ui`), confirm: preview starts in ~1s, the pill shows buffering %, the timeline shows full duration with a buffered fill, seeking past the buffer is clamped, and after completion the whole clip is seekable. Export a clip and confirm it re-renders from the original (unchanged).
- [ ] Use superpowers:finishing-a-development-branch to open the rebase-merge PR.

---

## Self-Review Notes

- **Spec coverage:** fMP4 args (Task 1), tee runner (Task 2), server byte stream + headers (Task 3), MSE hook with progress/swap/fallback (Task 4), auto-start + no CTA + currentTime swap (Task 5), full timeline + buffered fill (Task 6), tests (Tasks 1/4/7), docs (Task 8). Export untouched: confirmed in final verification.
- **Type consistency:** `streamFragmentedMp4` returns `{ stream, durationSec }` used identically in Tasks 2/3/7. `PROXY_MIME`/`computeBufferedProgress` names match across Task 4 test and impl. `proxy.state` values (`idle|streaming|ready|error`) used consistently in Tasks 5/6.
- **Open implementation choice flagged in Task 5 Step 2:** eager `needsProxy` start vs. start-on-decode-error. Plan picks eager start; reviewer may switch to onError gating without other changes.
