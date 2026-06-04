# Streaming preview for undecodable codecs (ProRes)

Date: 2026-06-04
Status: Approved, ready for implementation plan

## Problem

When a user uploads a video the browser cannot natively decode (notably
ProRes), the hance browser UI transcodes the whole clip to an H.264 proxy
before any playback can start. Two things force the wait:

1. `proxyUrl` is only emitted on `done: true`, so the `<video>` element has
   nothing to play until the transcode finishes.
2. `-movflags +faststart` relocates the moov atom in a second pass, which
   requires the entire file first.

Encode speed is not the bottleneck. It is already hardware accelerated
(`h264_videotoolbox` on macOS, `libx264 -preset veryfast` elsewhere).

## Goal

Reduce time-to-first-frame so playback begins (in ~1 second) while the
transcode is still running, without changing export quality in any way.

## Non-goals

- Export is untouched. Export always re-renders from the original file and
  never reads the proxy. Nothing in this design may affect export.
- Scrubbing arbitrarily far ahead of the encode before it catches up. Seeking
  is limited to the buffered range until the transcode completes.

## Chosen approach: Fragmented MP4 + Media Source Extensions (MSE)

The renderer reads frames from a standard `<video>` element
(`copySourceToTexture` in `app/gpu/renderer.ts` via `new VideoFrame(source)`).
MSE also drives a `<video>`, so the frame-grab path needs no change.

We produce the same H.264 we produce today, but muxed as fragmented MP4 so it
can be fed to the browser incrementally and played as it arrives. We also
persist the proxy to disk so that, once the transcode completes, we swap the
`<video>` to the finished file for full-range seeking and cheap reloads.

WebM was rejected: it would require VP8/VP9/AV1, losing the hardware H.264
encoder that is already the fast part. fMP4 + H.264 is supported by MSE in all
target browsers (WebGPU is already required, so the browser is modern).

HLS (segmenting + hls.js) was rejected: it optimizes scrubbing long footage,
which is not the hance workflow (drop a clip, dial in a look, batch-apply via
CLI), and it adds a dependency plus segment lifecycle management against a
stack that values "one binary, no plugins".

## Architecture

### 1. ffmpeg args: `packages/ui/lib/transcode.ts` (`buildProxyArgs`)

Changes:

- Replace `-movflags +faststart` with
  `-movflags +frag_keyframe+empty_moov+default_base_moof`.
- Output to `pipe:1` (stdout) instead of a file path.
- Pin the H.264 profile and level so the codec string is deterministic for
  `MediaSource.isTypeSupported`: `-profile:v high -level 4.0` yields
  `avc1.640028`. Audio stays AAC (`mp4a.40.2`). The MSE mime type is therefore
  `video/mp4; codecs="avc1.640028, mp4a.40.2"`.
- Remove `-progress pipe:1` and `-nostats` (stdout now carries video, not
  progress). Keep `-v error` on stderr for failure reporting.

The downscale (720p) and fps cap (30) filters are unchanged. Pinning the
profile has negligible quality effect on a 720p preview and never touches
export.

### 2. Transcode runner: `packages/ui/lib/transcode.ts`

Replace the SSE-progress `transcodeToH264Stream` with a function that returns
the raw fragmented-MP4 byte stream from ffmpeg stdout while teeing the same
bytes to a file on disk:

- Spawn ffmpeg, read `proc.stdout`.
- For each chunk: enqueue to the returned `ReadableStream<Uint8Array>` AND
  append to a disk write at `proxy_<id>.mp4`.
- On non-zero exit, surface the ffmpeg stderr as a stream error.
- The tee to disk is done in TypeScript (not ffmpeg's `tee` muxer) so the
  arg builder stays simple and unit-testable.

Naming follows verb-first convention, e.g. `streamFragmentedMp4`.

### 3. Server: `packages/ui/server.ts`

`/api/proxy` (POST) changes from a Server-Sent-Events progress stream to a raw
byte stream:

- Save the uploaded input, probe duration, spawn the transcode.
- Respond with the fragmented-MP4 byte stream.
- Set response headers available before the body:
  - `X-Proxy-Duration`: total seconds from probe (drives the timeline and the
    buffered-progress calculation).
  - `X-Proxy-Path`: the on-disk proxy path, used by the client to build the
    `/api/proxy-file` swap URL.
- Clean up the input file when the stream ends (as today). The proxy output
  file remains in tmpdir for `/api/proxy-file`.

`/api/proxy-file` (GET) is unchanged. It already serves `Bun.file` with
`Accept-Ranges: bytes`, which is what the post-swap full-range seeking needs.

### 4. Client: `packages/ui/app`

A small hook (e.g. `app/hooks/useProxyStream.ts`) owns the MSE lifecycle, so
`App.tsx` stays readable and the logic is testable in isolation:

- `fetch('/api/proxy')`, read `X-Proxy-Duration` and `X-Proxy-Path` headers.
- Create a `MediaSource`, set `<video>.src` to its `blob:` URL.
- Read `res.body` with a reader; append chunks to a single `SourceBuffer`,
  respecting `updateend` backpressure.
- First frame plays as soon as the first fragment is appended (~1s).
- **Progress** is derived client-side as
  `video.buffered.end(last) / duration`. No server progress stream.
- **Swap on completion**: when the response stream ends and the buffer is fully
  appended, record `currentTime` and paused state, set
  `<video>.src = /api/proxy-file?path=<X-Proxy-Path>`, revoke the old `blob:`
  URL, then restore `currentTime` and play/pause. This frees the in-memory
  `SourceBuffer` and enables full-range seeking. The swap happens once; the
  last rendered frame is held to hide any reload flicker.
- **Fallback**: if `MediaSource` is unavailable or
  `MediaSource.isTypeSupported(mime)` is false, fall back to today's behavior:
  consume the whole stream, then set `<video>.src` to `/api/proxy-file`.

### 5. UI behavior: `App.tsx` and `Timeline.tsx`

Confirmed UX decisions:

- **Auto-start.** On upload of an undecodable codec, the stream starts
  automatically. The blocking "Transcode to H.264" CTA overlay is removed.
  A small non-blocking "buffering preview" indicator (a pill) shows while
  fragments stream in and disappears after the completion swap. The error and
  retry states are preserved (retry re-runs the stream).
- **Full timeline + buffered fill.** The timeline renders at the true duration
  immediately, using `X-Proxy-Duration` (so it does not wait for
  `video.duration` from the proxy). A buffered bar animates forward as
  fragments arrive, derived from `video.buffered`. The un-buffered tail is
  dimmed. Seeking is clamped to the buffered range until the completion swap,
  after which the bar becomes fully seekable and the dim/animation clears.

The `proxyState` machine expands to cover streaming (e.g.
`idle | streaming | swapping | ready | error`) or equivalent; exact shape is an
implementation detail for the plan.

## Error handling

- ffmpeg non-zero exit: stream errors; client shows the existing error UI with
  a retry that re-invokes the stream.
- Mid-stream network failure: the MSE append loop catches, tears down the
  `MediaSource`, and surfaces the error state.
- Codec/MSE unsupported: graceful fallback path (section 4).
- The completion swap must preserve `currentTime`; a failed swap leaves the
  working MSE source in place rather than resetting to frame 0.

## Testing

Follows project conventions: pure arg-builders unit-tested without spawning
ffmpeg; e2e tests exercise real ffmpeg with small fixtures.

- Unit (`packages/ui/lib/__tests__`): `buildProxyArgs` asserts
  `+frag_keyframe+empty_moov+default_base_moof` present, `+faststart` absent,
  output is `pipe:1`, and `-profile:v high -level 4.0` pinned.
- Unit: header/tee wiring where it can be isolated (duration header from a
  probe stub; tee writes the same bytes it streams).
- E2E (`packages/cli/__tests__/e2e/` or the ui server tests): POST a tiny
  ProRes fixture to `/api/proxy`, assert the response is fragmented-MP4 bytes
  (fragmented moov: `moof` boxes present, `faststart`-style leading `moov`
  absent) and that `proxy_<id>.mp4` lands on disk.
- Client hook: a focused test of `useProxyStream` swap logic (preserves
  `currentTime`, revokes the blob URL, falls back when `isTypeSupported` is
  false), using mocks for `MediaSource`/`<video>`.

## Docs

Update `packages/docs/src/content/docs/docs/browser-ui.md` ProRes note and the
Upload & preview section: preview now begins playing while transcoding
continues; seeking is limited to the loaded range until it finishes; export is
still always from the original. No em dashes. Run
`cd packages/docs && bun run build` to verify slugs/links.

## Conventions

Bun runtime, `node:` prefix for builtins, verb-first naming, function
declarations, Conventional Commits, feature branch (`feat/prores-streaming-preview`,
never commit to main), rebase-merge PR.
