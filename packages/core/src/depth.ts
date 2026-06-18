import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir, tmpdir } from "node:os";

/**
 * A monocular depth map normalized to 0–1. `near=1, far=0` (Depth Anything
 * emits relative *inverse* depth / disparity, where brighter = closer; we keep
 * that convention explicit here so `focus` reads the same way in the shader).
 * `data` is row-major, length `width * height`.
 */
export interface DepthMap {
  width: number;
  height: number;
  data: Float32Array;
}

// --- Replicate model pin --------------------------------------------------
// Depth Anything V2 *Small* is Apache-2.0 — safe for commercial use. The
// Base/Large/Giant checkpoints are CC-BY-NC, so we deliberately pin the small
// encoder and never default to a larger tier. See issue #114.
export const REPLICATE_MODEL = "chenxwh/depth-anything-v2";
// ponytail: version hash must track the current Small/Apache build of the model.
// Replicate community models require an explicit version; confirm/update this
// pin against https://replicate.com/chenxwh/depth-anything-v2/versions before
// shipping. Override per-call with opts.version (tests inject their own).
export const REPLICATE_MODEL_VERSION =
  process.env.HANCE_DEPTH_VERSION ?? "REPLACE_WITH_DEPTH_ANYTHING_V2_SMALL_VERSION";

const REPLICATE_API = "https://api.replicate.com/v1/predictions";

export type FetchImpl = typeof fetch;

export interface ReplicateOpts {
  token: string;
  /** Data URI of the source image, e.g. `data:image/png;base64,...`. */
  imageDataUri: string;
  model?: string;
  version?: string;
  fetchImpl?: FetchImpl;
  /** Poll interval while the prediction runs (0 in tests). */
  pollIntervalMs?: number;
  /** Safety cap on poll attempts. */
  maxPolls?: number;
}

interface Prediction {
  id: string;
  status: "starting" | "processing" | "succeeded" | "failed" | "canceled";
  output?: string | string[] | null;
  error?: string | null;
  urls?: { get?: string };
}

function firstOutputUrl(output: Prediction["output"]): string {
  const url = Array.isArray(output) ? output[output.length - 1] : output;
  if (typeof url !== "string" || !url) throw new Error("Replicate returned no depth image");
  return url;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Call the Replicate depth model and return the raw depth-image bytes. Pure HTTP
 * (no ffmpeg, no disk) so it can be unit-tested with a mocked `fetchImpl`; the
 * token is sent only in the Authorization header and never logged.
 */
export async function requestReplicateDepth(opts: ReplicateOpts): Promise<Uint8Array> {
  const doFetch = opts.fetchImpl ?? fetch;
  const pollIntervalMs = opts.pollIntervalMs ?? 1500;
  const maxPolls = opts.maxPolls ?? 120;
  const headers = {
    Authorization: `Bearer ${opts.token}`,
    "Content-Type": "application/json",
  };

  const createRes = await doFetch(REPLICATE_API, {
    method: "POST",
    headers,
    body: JSON.stringify({
      version: opts.version ?? REPLICATE_MODEL_VERSION,
      input: { image: opts.imageDataUri, encoder: "vits" },
    }),
  });
  if (!createRes.ok) {
    throw new Error(`Replicate prediction failed (${createRes.status}): ${await safeText(createRes)}`);
  }

  let pred = (await createRes.json()) as Prediction;
  // Capture the poll URL once — poll responses don't always echo `urls`.
  const getUrl = pred.urls?.get ?? `${REPLICATE_API}/${pred.id}`;
  let polls = 0;
  while (pred.status !== "succeeded" && pred.status !== "failed" && pred.status !== "canceled") {
    if (polls++ >= maxPolls) throw new Error("Replicate prediction timed out");
    await sleep(pollIntervalMs);
    const pollRes = await doFetch(getUrl, { headers });
    if (!pollRes.ok) throw new Error(`Replicate poll failed (${pollRes.status})`);
    pred = (await pollRes.json()) as Prediction;
  }
  if (pred.status !== "succeeded") {
    throw new Error(`Replicate prediction ${pred.status}: ${pred.error ?? "unknown error"}`);
  }

  const imgRes = await doFetch(firstOutputUrl(pred.output));
  if (!imgRes.ok) throw new Error(`Failed to download depth image (${imgRes.status})`);
  return new Uint8Array(await imgRes.arrayBuffer());
}

async function safeText(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 200);
  } catch {
    return "";
  }
}

/**
 * Per-image min–max stretch of raw depth samples to 0–1. Depth Anything emits a
 * relative map with no absolute scale, so normalizing per image is correct.
 * `invert` flips the near/far sign for models that emit near=dark.
 */
export function normalizeDepth(samples: ArrayLike<number>, invert = false): Float32Array {
  const n = samples.length;
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < n; i++) {
    const v = samples[i];
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const out = new Float32Array(n);
  const span = max - min;
  if (span <= 0) return out; // flat map → all 0 (no defocus anywhere)
  for (let i = 0; i < n; i++) {
    const t = (samples[i] - min) / span;
    out[i] = invert ? 1 - t : t;
  }
  return out;
}

// --- Disk cache + orchestration ------------------------------------------

export interface FetchDepthOpts {
  token?: string;
  cacheDir?: string;
  model?: string;
  version?: string;
  invert?: boolean;
  /** Cap the longer depth-map edge to bound init payload + GPU memory. */
  maxDim?: number;
  fetchImpl?: FetchImpl;
  pollIntervalMs?: number;
}

export function depthCacheDir(): string {
  return join(homedir(), ".cache", "hance", "depth");
}

async function sha256Hex(...parts: Array<Uint8Array | string>): Promise<string> {
  const hasher = new Bun.CryptoHasher("sha256");
  for (const p of parts) hasher.update(p);
  return hasher.digest("hex");
}

function writeDepthCache(path: string, map: DepthMap): void {
  const header = new Uint32Array([map.width, map.height]);
  const out = new Uint8Array(8 + map.data.byteLength);
  out.set(new Uint8Array(header.buffer), 0);
  out.set(new Uint8Array(map.data.buffer, map.data.byteOffset, map.data.byteLength), 8);
  Bun.write(path, out);
}

async function readDepthCache(path: string): Promise<DepthMap> {
  const buf = new Uint8Array(await Bun.file(path).arrayBuffer());
  const header = new Uint32Array(buf.buffer, buf.byteOffset, 2);
  const width = header[0];
  const height = header[1];
  const data = new Float32Array(buf.buffer.slice(buf.byteOffset + 8));
  return { width, height, data: data.slice(0, width * height) };
}

function mimeFor(path: string): string {
  const ext = path.toLowerCase().split(".").pop();
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  return "image/jpeg";
}

/** Decode a depth image (any format ffmpeg reads) to normalized 0–1 samples. */
async function decodeDepthImage(bytes: Uint8Array, maxDim: number, invert: boolean): Promise<DepthMap> {
  const tmp = join(tmpdir(), `hance-depth-${process.pid}-${Date.now()}.img`);
  await Bun.write(tmp, bytes);
  try {
    // gray16le keeps the model's full bit depth so the blur falloff doesn't band.
    const scale = `scale='min(${maxDim},iw)':-1:force_original_aspect_ratio=decrease`;
    const proc = Bun.spawn(
      ["ffmpeg", "-i", tmp, "-vf", scale, "-f", "rawvideo", "-pix_fmt", "gray16le", "-v", "error", "pipe:1"],
      { stdout: "pipe", stderr: "pipe" },
    );
    const raw = new Uint8Array(await new Response(proc.stdout).arrayBuffer());
    if ((await proc.exited) !== 0) {
      throw new Error(`ffmpeg depth decode failed: ${(await new Response(proc.stderr).text()).trim()}`);
    }
    // Recover dimensions from the scaled image (ffprobe reads the same temp file
    // through the same scale filter would be redundant; derive from byte count
    // and probed aspect instead).
    const { width, height } = await probeScaledSize(tmp, maxDim, raw.length / 2);
    const samples = new Uint16Array(raw.buffer, raw.byteOffset, raw.length / 2);
    return { width, height, data: normalizeDepth(samples, invert) };
  } finally {
    try { await Bun.file(tmp).exists() && (await import("node:fs/promises")).unlink(tmp); } catch {}
  }
}

async function probeScaledSize(path: string, maxDim: number, pixelCount: number): Promise<{ width: number; height: number }> {
  const proc = Bun.spawn(
    ["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", path],
    { stdout: "pipe", stderr: "ignore" },
  );
  const out = (await new Response(proc.stdout).text()).trim();
  await proc.exited;
  const [w, h] = out.split(",").map((n) => parseInt(n, 10));
  // Mirror ffmpeg's decrease-fit so width*height matches the decoded byte count.
  const ratio = Math.min(1, maxDim / Math.max(w, h));
  let width = Math.round(w * ratio);
  let height = Math.round(h * ratio);
  if (width * height !== pixelCount) {
    // Aspect rounding can be off by a row/col; trust the byte count for height.
    height = Math.max(1, Math.floor(pixelCount / Math.max(1, width)));
  }
  return { width, height };
}

/**
 * Get a normalized depth map for `inputPath`, fetching from Replicate on a cache
 * miss and caching the result to disk keyed by sha256(file + model + version).
 * Caching is mandatory: every fetch is a paid Replicate run. Throws an
 * actionable error when no token is available.
 */
export async function fetchDepthMap(inputPath: string, opts: FetchDepthOpts = {}): Promise<DepthMap> {
  const model = opts.model ?? REPLICATE_MODEL;
  const version = opts.version ?? REPLICATE_MODEL_VERSION;
  const invert = opts.invert ?? false;
  const maxDim = opts.maxDim ?? 1024;
  const cacheDir = opts.cacheDir ?? depthCacheDir();

  const fileBytes = new Uint8Array(await Bun.file(inputPath).arrayBuffer());
  const key = await sha256Hex(fileBytes, `${model}@${version}@${maxDim}@${invert}`);
  const cachePath = join(cacheDir, `${key}.depth`);

  if (existsSync(cachePath)) return readDepthCache(cachePath);

  const token = opts.token ?? process.env.REPLICATE_API_TOKEN;
  if (!token) {
    throw new Error(
      "Depth-of-field needs a Replicate API token. Set REPLICATE_API_TOKEN " +
      "(get one at https://replicate.com/account/api-tokens). The depth map is " +
      "fetched once and cached, so later runs are offline.",
    );
  }

  const imageDataUri = `data:${mimeFor(inputPath)};base64,${Buffer.from(fileBytes).toString("base64")}`;
  const depthBytes = await requestReplicateDepth({
    token, imageDataUri, model, version,
    fetchImpl: opts.fetchImpl, pollIntervalMs: opts.pollIntervalMs,
  });
  const map = await decodeDepthImage(depthBytes, maxDim, invert);

  if (!existsSync(cacheDir)) mkdirSync(cacheDir, { recursive: true });
  writeDepthCache(cachePath, map);
  return map;
}
