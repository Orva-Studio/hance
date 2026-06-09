import {
  FULLSCREEN_VERT, COLOR_SETTINGS_FRAG, THRESHOLD_FRAG, BLUR_FRAG,
  SCREEN_BLEND_FRAG, ABERRATION_FRAG, GRAIN_FRAG, VIGNETTE_FRAG,
  SPLIT_TONE_FRAG, CAMERA_SHAKE_FRAG, COLORSPACE_FRAG, LUT_FRAG,
  SCATTER_BLUR_FRAG, HALATION_COMBINE_FRAG,
} from "./shaders";
import { createFullscreenPipeline, createTexture, runPass } from "./passes";
import { getSplitToneTintValues } from "./splitToneMath";
import { isLightGroupActive } from "./lightGroup";
import { LUT_SIZE, generateLut, isInputLutActive, HALATION_THRESHOLD, BLUR_SIGMA_FACTOR, HALATION_CHANNEL_SIGMA, HALATION_PSF, HALATION_RING } from "@hance/core";
import { chooseExportSize } from "../mediaSizing";

export interface PreviewParams {
  [key: string]: string | number | boolean;
}

export interface Renderer {
  setSource(source: HTMLVideoElement | HTMLImageElement): Promise<void>;
  setSourceFromBuffer(data: Uint8Array, width: number, height: number): void;
  setParams(params: PreviewParams): void;
  renderFrame(): void;
  readPixels(): Promise<Uint8Array>;
  /**
   * Render the full effect chain at the source's native resolution (clamped to
   * the GPU texture limit) and read it back. Use for image export so the output
   * isn't capped to the preview size.
   */
  exportImage(): Promise<{ pixels: Uint8Array; width: number; height: number }>;
  destroy(): void;
}

export interface RendererInit {
  sourceWidth: number;
  sourceHeight: number;
  previewWidth: number;
  previewHeight: number;
}

function createStandardLayout(device: GPUDevice): GPUBindGroupLayout {
  return device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: {} },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
      { binding: 2, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } },
    ],
  });
}

function createBlendLayout(device: GPUDevice): GPUBindGroupLayout {
  return device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: {} },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
      { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: {} },
      { binding: 3, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } },
    ],
  });
}

function createCombineLayout(device: GPUDevice): GPUBindGroupLayout {
  return device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: {} },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
      { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: {} },
      { binding: 3, visibility: GPUShaderStage.FRAGMENT, texture: {} },
      { binding: 4, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } },
    ],
  });
}

function createLutLayout(device: GPUDevice): GPUBindGroupLayout {
  return device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: {} },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
      { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: { viewDimension: "3d" } },
    ],
  });
}

// JS has no native f16; convert a float to its IEEE-754 half-precision bits.
// Inputs here are LUT values clamped to [0,1], so the Inf/NaN (e > 142) path is
// unreachable and intentionally omitted — do not reuse this for arbitrary floats.
// Fully-saturated RGB for a hue in degrees (HSV with s=v=1). Mirrors hue_to_rgb in params.rs.
function hueToRgb(hDeg: number): [number, number, number] {
  const h = (((hDeg % 360) + 360) % 360) / 60;
  const x = 1 - Math.abs((h % 2) - 1);
  if (h < 1) return [1, x, 0];
  if (h < 2) return [x, 1, 0];
  if (h < 3) return [0, 1, x];
  if (h < 4) return [0, x, 1];
  if (h < 5) return [x, 0, 1];
  return [1, 0, x];
}

const f32buf = new Float32Array(1);
const u32buf = new Uint32Array(f32buf.buffer);
function floatToHalf(val: number): number {
  f32buf[0] = val;
  const x = u32buf[0];
  let bits = (x >> 16) & 0x8000;
  let m = (x >> 12) & 0x07ff;
  const e = (x >> 23) & 0xff;
  if (e < 103) return bits;
  if (e < 113) {
    m |= 0x0800;
    bits |= (m >> (114 - e)) + ((m >> (113 - e)) & 1);
    return bits;
  }
  bits |= ((e - 112) << 10) | (m >> 1);
  bits += m & 1;
  return bits;
}

// Build a 33^3 rgba16float 3D LUT texture from the baked core array (alpha = 1).
function createLutTexture(device: GPUDevice): GPUTexture {
  const n = LUT_SIZE;
  const rgb = generateLut("vlog");
  const texels = new Uint16Array(n * n * n * 4);
  const one = floatToHalf(1.0);
  for (let i = 0, o = 0; i < rgb.length; i += 3) {
    texels[o++] = floatToHalf(rgb[i]);
    texels[o++] = floatToHalf(rgb[i + 1]);
    texels[o++] = floatToHalf(rgb[i + 2]);
    texels[o++] = one;
  }
  const tex = device.createTexture({
    size: { width: n, height: n, depthOrArrayLayers: n },
    dimension: "3d",
    format: "rgba16float",
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
  });
  device.queue.writeTexture(
    { texture: tex },
    texels.buffer,
    { bytesPerRow: n * 4 * 2, rowsPerImage: n },
    { width: n, height: n, depthOrArrayLayers: n },
  );
  return tex;
}

function alignTo16(n: number): number {
  return Math.ceil(n / 16) * 16;
}

function createUniformBuffer(device: GPUDevice, size: number): GPUBuffer {
  return device.createBuffer({
    size: alignTo16(size),
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
}

export async function createRenderer(canvas: HTMLCanvasElement, init: RendererInit): Promise<Renderer> {
  const { sourceWidth, sourceHeight, previewWidth, previewHeight } = init;
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) throw new Error("No WebGPU adapter found");
  const device = await adapter.requestDevice();
  const format = navigator.gpu.getPreferredCanvasFormat();

  const ctx = canvas.getContext("webgpu")!;
  ctx.configure({ device, format, alphaMode: "opaque" });

  canvas.width = previewWidth;
  canvas.height = previewHeight;

  const sampler = device.createSampler({ magFilter: "linear", minFilter: "linear" });
  const stdLayout = createStandardLayout(device);
  const blendLayout = createBlendLayout(device);
  const combineLayout = createCombineLayout(device);
  const lutLayout = createLutLayout(device);

  const halfW = Math.max(1, Math.floor(previewWidth / 2));
  const halfH = Math.max(1, Math.floor(previewHeight / 2));

  const INTERMEDIATE_FORMAT: GPUTextureFormat = "rgba16float";

  const texA = createTexture(device, previewWidth, previewHeight, INTERMEDIATE_FORMAT);
  const texB = createTexture(device, previewWidth, previewHeight, INTERMEDIATE_FORMAT);
  const halfA = createTexture(device, halfW, halfH, INTERMEDIATE_FORMAT);
  const halfB = createTexture(device, halfW, halfH, INTERMEDIATE_FORMAT);
  const coreTex = createTexture(device, halfW, halfH, INTERMEDIATE_FORMAT);

  // 8-bit output texture used as the readback source (readPixels assumes 4 bytes/pixel).
  const outputTex = device.createTexture({
    size: { width: previewWidth, height: previewHeight },
    format,
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC | GPUTextureUsage.TEXTURE_BINDING,
  });

  const srcTex = device.createTexture({
    size: { width: sourceWidth, height: sourceHeight },
    format: "rgba8unorm",
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
  });

  const colorPipeline = createFullscreenPipeline(device, FULLSCREEN_VERT, COLOR_SETTINGS_FRAG, stdLayout, INTERMEDIATE_FORMAT);
  const thresholdPipeline = createFullscreenPipeline(device, FULLSCREEN_VERT, THRESHOLD_FRAG, stdLayout, INTERMEDIATE_FORMAT);
  const blurPipeline = createFullscreenPipeline(device, FULLSCREEN_VERT, BLUR_FRAG, stdLayout, INTERMEDIATE_FORMAT);
  const scatterBlurPipeline = createFullscreenPipeline(device, FULLSCREEN_VERT, SCATTER_BLUR_FRAG, stdLayout, INTERMEDIATE_FORMAT);
  const combinePipeline = createFullscreenPipeline(device, FULLSCREEN_VERT, HALATION_COMBINE_FRAG, combineLayout, INTERMEDIATE_FORMAT);
  const blendPipeline = createFullscreenPipeline(device, FULLSCREEN_VERT, SCREEN_BLEND_FRAG, blendLayout, INTERMEDIATE_FORMAT);
  const aberrationPipeline = createFullscreenPipeline(device, FULLSCREEN_VERT, ABERRATION_FRAG, stdLayout, INTERMEDIATE_FORMAT);
  const grainPipeline = createFullscreenPipeline(device, FULLSCREEN_VERT, GRAIN_FRAG, stdLayout, INTERMEDIATE_FORMAT);
  const vignettePipeline = createFullscreenPipeline(device, FULLSCREEN_VERT, VIGNETTE_FRAG, stdLayout, INTERMEDIATE_FORMAT);
  const splitTonePipeline = createFullscreenPipeline(device, FULLSCREEN_VERT, SPLIT_TONE_FRAG, stdLayout, INTERMEDIATE_FORMAT);
  const shakePipeline = createFullscreenPipeline(device, FULLSCREEN_VERT, CAMERA_SHAKE_FRAG, stdLayout, INTERMEDIATE_FORMAT);
  const colorspacePipeline = createFullscreenPipeline(device, FULLSCREEN_VERT, COLORSPACE_FRAG, stdLayout, INTERMEDIATE_FORMAT);
  const lutPipeline = createFullscreenPipeline(device, FULLSCREEN_VERT, LUT_FRAG, lutLayout, INTERMEDIATE_FORMAT);
  // Blit reads a 16float intermediate and writes the 8-bit output/canvas format.
  const blitPipeline = createFullscreenPipeline(device, FULLSCREEN_VERT, COLOR_SETTINGS_FRAG, stdLayout, format);

  // The pre-LUT only has one non-identity profile (vlog); build it once.
  const lutTex = createLutTexture(device);
  const lutView = lutTex.createView({ dimension: "3d" });

  const colorUB = createUniformBuffer(device, 48); // 12 floats
  const blitUB = createUniformBuffer(device, 48); // identity color pass for final blit
  device.queue.writeBuffer(blitUB, 0, new Float32Array([1, 0, 1, 1, 6500, 0, 0, 0, 0, 0, 0, 0]));
  const thresholdUB = createUniformBuffer(device, 16);
  const blurUB1 = createUniformBuffer(device, 16);
  const blurUB2 = createUniformBuffer(device, 16);
  const scatterBlurUB1 = createUniformBuffer(device, 48);
  const scatterBlurUB2 = createUniformBuffer(device, 48);
  const combineUB = createUniformBuffer(device, 16);
  const blendUB = createUniformBuffer(device, 16);
  const aberrationUB = createUniformBuffer(device, 16);
  const grainUB = createUniformBuffer(device, 32); // 8 floats
  const vignetteUB = createUniformBuffer(device, 16);
  const splitToneUB = createUniformBuffer(device, 48);
  const shakeUB = createUniformBuffer(device, 16);
  const bloomBlurUB1 = createUniformBuffer(device, 16);
  const bloomBlurUB2 = createUniformBuffer(device, 16);
  const bloomBlendUB = createUniformBuffer(device, 16);
  const decodeUB = createUniformBuffer(device, 16);
  device.queue.writeBuffer(decodeUB, 0, new Float32Array([0, 0, 0, 0])); // 0 = sRGB->linear
  const encodeUB = createUniformBuffer(device, 16);
  device.queue.writeBuffer(encodeUB, 0, new Float32Array([1, 0, 0, 0])); // 1 = linear->sRGB

  let source: HTMLVideoElement | HTMLImageElement | null = null;
  let imageBitmap: ImageBitmap | null = null;
  let bufferSource: { data: Uint8Array; width: number; height: number } | null = null;
  let params: PreviewParams = {};
  let frameCount = 0;


  function makeStdBindGroup(inputTex: GPUTexture, ub: GPUBuffer): GPUBindGroup {
    return device.createBindGroup({
      layout: stdLayout,
      entries: [
        { binding: 0, resource: inputTex.createView() },
        { binding: 1, resource: sampler },
        { binding: 2, resource: { buffer: ub } },
      ],
    });
  }

  function makeLutBindGroup(inputTex: GPUTexture): GPUBindGroup {
    return device.createBindGroup({
      layout: lutLayout,
      entries: [
        { binding: 0, resource: inputTex.createView() },
        { binding: 1, resource: sampler },
        { binding: 2, resource: lutView },
      ],
    });
  }

  function makeBlendBindGroup(baseTex: GPUTexture, overlayTex: GPUTexture, ub: GPUBuffer): GPUBindGroup {
    return device.createBindGroup({
      layout: blendLayout,
      entries: [
        { binding: 0, resource: baseTex.createView() },
        { binding: 1, resource: sampler },
        { binding: 2, resource: overlayTex.createView() },
        { binding: 3, resource: { buffer: ub } },
      ],
    });
  }

  function makeCombineBindGroup(baseTex: GPUTexture, scatterTex: GPUTexture, coreTexture: GPUTexture, ub: GPUBuffer): GPUBindGroup {
    return device.createBindGroup({
      layout: combineLayout,
      entries: [
        { binding: 0, resource: baseTex.createView() },
        { binding: 1, resource: sampler },
        { binding: 2, resource: scatterTex.createView() },
        { binding: 3, resource: coreTexture.createView() },
        { binding: 4, resource: { buffer: ub } },
      ],
    });
  }

  function setSourceFromBuffer(data: Uint8Array, width: number, height: number): void {
    bufferSource = { data, width, height };
    source = null;
  }

  function copySourceToTexture() {
    if (bufferSource) {
      device.queue.writeTexture(
        { texture: srcTex },
        bufferSource.data,
        { bytesPerRow: bufferSource.width * 4, rowsPerImage: bufferSource.height },
        { width: bufferSource.width, height: bufferSource.height },
      );
    } else if (source) {
      if (source instanceof HTMLVideoElement) {
        const frame = new VideoFrame(source, { timestamp: 0 });
        device.queue.copyExternalImageToTexture(
          { source: frame },
          { texture: srcTex },
          { width: sourceWidth, height: sourceHeight },
        );
        frame.close();
      } else if (imageBitmap) {
        device.queue.copyExternalImageToTexture(
          { source: imageBitmap },
          { texture: srcTex },
          { width: sourceWidth, height: sourceHeight },
        );
      }
    }
  }

  // Params arrive fully populated with schema defaults (see core getDefaults /
  // applyPreset and the UI's /api/look + initial state), so these helpers only
  // coerce type; the neutral fallback is a safety net, not a defaults source.
  function num(key: string, fallback = 0): number {
    const v = params[key];
    return typeof v === "number" ? v : fallback;
  }

  function bool(key: string, fallback = false): boolean {
    const v = params[key];
    return typeof v === "boolean" ? v : fallback;
  }

  // Bundles the size + ping-pong texture set the pass chain renders into, so the
  // same chain can target the preview textures or a one-off full-res export set.
  interface RenderTarget {
    w: number;
    h: number;
    halfW: number;
    halfH: number;
    texA: GPUTexture;
    texB: GPUTexture;
    halfA: GPUTexture;
    halfB: GPUTexture;
    coreTex: GPUTexture;
    outputTex: GPUTexture;
  }

  const previewTarget: RenderTarget = {
    w: previewWidth, h: previewHeight, halfW, halfH,
    texA, texB, halfA, halfB, coreTex, outputTex,
  };

  function encodeChain(encoder: GPUCommandEncoder, t: RenderTarget, drawToCanvas: boolean) {
    const halfW = t.halfW;
    const halfH = t.halfH;
    let current = t.texA;
    let other = t.texB;

    function swap() {
      const tmp = current;
      current = other;
      other = tmp;
    }

    // --- Input/pre-LUT (first pass, srcTex -> texA) ---
    // Skipped entirely when identity/disabled so the frame passes through.
    let colorInput = srcTex;
    if (isInputLutActive(params)) {
      runPass(encoder, lutPipeline, makeLutBindGroup(srcTex), t.texA.createView());
      colorInput = t.texA;
      // Color must write somewhere other than its texA input.
      current = t.texB;
      other = t.texA;
    }

    if (params["no-color-settings"] !== true) {
      const fade = num("fade");
      const contrast = num("contrast") * (1 - fade);
      const brightness = num("exposure") * 0.1;
      const saturation = num("subtractive-sat") * num("richness");
      const gamma = 1 - num("highlights") * 0.5;
      const wb = num("white-balance");
      const tint = num("tint") / 100;
      const bleach = num("bleach-bypass");
      // Tintable black lift; neutral (white) tint reproduces the legacy fade.
      const liftBase = fade * 0.05;
      const fadeTint = num("fade-tint");
      const hue = hueToRgb(num("fade-hue"));
      const lift = hue.map((ch) => liftBase * (1 + fadeTint * (ch - 1)));
      device.queue.writeBuffer(colorUB, 0, new Float32Array([contrast, brightness, saturation, gamma, wb, tint, bleach, 0, lift[0], lift[1], lift[2], 0]));
      const bg = makeStdBindGroup(colorInput, colorUB);
      runPass(encoder, colorPipeline, bg, current.createView());
    } else {
      const bg = makeStdBindGroup(colorInput, colorUB);
      device.queue.writeBuffer(colorUB, 0, new Float32Array([1, 0, 1, 1, 6500, 0, 0, 0, 0, 0, 0, 0]));
      runPass(encoder, colorPipeline, bg, current.createView());
    }

    // The light-transport group runs in linear light. Only bracket the chain
    // with decode/encode passes when at least one of those effects is active,
    // so a frame with the whole group disabled passes through byte-for-byte.
    const lightGroupActive = isLightGroupActive(params);

    // --- Decode to linear light (start of light-transport bracket) ---
    if (lightGroupActive) {
      const bg = makeStdBindGroup(current, decodeUB);
      runPass(encoder, colorspacePipeline, bg, other.createView());
      swap();
    }

    // --- Halation ---
    if (params["no-halation"] !== true) {
      const amount = num("halation-amount");
      if (amount > 0) {
        const radius = num("halation-radius");
        const highlightsOnly = bool("halation-highlights-only");
        const preHalation = current;

        // Threshold (or plain downsample) → coreTex
        if (highlightsOnly) {
          device.queue.writeBuffer(thresholdUB, 0, new Float32Array([HALATION_THRESHOLD[0], HALATION_THRESHOLD[1], 0, 0]));
          runPass(encoder, thresholdPipeline, makeStdBindGroup(current, thresholdUB), t.coreTex.createView());
        } else {
          device.queue.writeBuffer(blurUB1, 0, new Float32Array([0, 0, 0.001, 0]));
          runPass(encoder, blurPipeline, makeStdBindGroup(current, blurUB1), t.coreTex.createView());
        }

        const baseSigma = radius * BLUR_SIGMA_FACTOR;
        const sigR = baseSigma * HALATION_CHANNEL_SIGMA[0];
        const sigG = baseSigma * HALATION_CHANNEL_SIGMA[1];
        const sigB = baseSigma * HALATION_CHANNEL_SIGMA[2];
        const p0 = HALATION_PSF[0];
        const p1 = HALATION_PSF[1];

        // Per-channel H scatter: coreTex → halfB
        device.queue.writeBuffer(scatterBlurUB1, 0, new Float32Array([
          1.0 / halfW, 0, 0, 0,
          sigR, sigG, sigB, 0,
          p0[0], p0[1], p1[0], p1[1],
        ]));
        runPass(encoder, scatterBlurPipeline, makeStdBindGroup(t.coreTex, scatterBlurUB1), t.halfB.createView());

        // Per-channel V scatter: halfB → halfA
        device.queue.writeBuffer(scatterBlurUB2, 0, new Float32Array([
          0, 1.0 / halfH, 0, 0,
          sigR, sigG, sigB, 0,
          p0[0], p0[1], p1[0], p1[1],
        ]));
        runPass(encoder, scatterBlurPipeline, makeStdBindGroup(t.halfB, scatterBlurUB2), t.halfA.createView());

        // Ring extraction + additive recombine → other
        device.queue.writeBuffer(combineUB, 0, new Float32Array([amount, HALATION_RING, 0, 0]));
        runPass(encoder, combinePipeline, makeCombineBindGroup(preHalation, t.halfA, t.coreTex, combineUB), other.createView());
        swap();
      }
    }

    // --- Chromatic Aberration ---
    if (params["no-aberration"] !== true) {
      const amount = num("aberration");
      if (amount > 0) {
        device.queue.writeBuffer(aberrationUB, 0, new Float32Array([amount * 0.02, 0, 0, 0]));
        const bg = makeStdBindGroup(current, aberrationUB);
        runPass(encoder, aberrationPipeline, bg, other.createView());
        swap();
      }
    }

    // --- Bloom ---
    if (params["no-bloom"] !== true) {
      const amount = num("bloom-amount");
      if (amount > 0) {
        const radius = num("bloom-radius");
        const preBloom = current;

        // FFmpeg bloom blurs the full frame, so downsample without thresholding first.
        device.queue.writeBuffer(blurUB1, 0, new Float32Array([0, 0, 0.001, 0]));
        const downsampleBG = makeStdBindGroup(current, blurUB1);
        runPass(encoder, blurPipeline, downsampleBG, t.halfA.createView());

        // H-blur → halfB
        const sigma = radius * BLUR_SIGMA_FACTOR;
        device.queue.writeBuffer(bloomBlurUB1, 0, new Float32Array([1.0 / halfW, 0, sigma, 0]));
        const hBG = makeStdBindGroup(t.halfA, bloomBlurUB1);
        runPass(encoder, blurPipeline, hBG, t.halfB.createView());

        // V-blur → halfA
        device.queue.writeBuffer(bloomBlurUB2, 0, new Float32Array([0, 1.0 / halfH, sigma, 0]));
        const vBG = makeStdBindGroup(t.halfB, bloomBlurUB2);
        runPass(encoder, blurPipeline, vBG, t.halfA.createView());

        // Screen blend → other
        device.queue.writeBuffer(bloomBlendUB, 0, new Float32Array([amount, 0, 0, 0]));
        const blendBG = makeBlendBindGroup(preBloom, t.halfA, bloomBlendUB);
        runPass(encoder, blendPipeline, blendBG, other.createView());
        swap();
      }
    }

    // --- Grain ---
    if (params["no-grain"] !== true) {
      const amount = num("grain-amount");
      if (amount > 0) {
        device.queue.writeBuffer(grainUB, 0, new Float32Array([
          amount,
          num("grain-size"),
          num("grain-softness"),
          num("grain-saturation"),
          num("grain-defocus"),
          frameCount,
          1.0 / t.w,
          1.0 / t.h,
        ]));
        const bg = makeStdBindGroup(current, grainUB);
        runPass(encoder, grainPipeline, bg, other.createView());
        swap();
      }
    }

    // --- Vignette ---
    if (params["no-vignette"] !== true) {
      const amount = num("vignette-amount");
      if (amount > 0) {
        const angle = amount * Math.PI / 2;
        const aspect = 1 - num("vignette-size") * 0.5;
        device.queue.writeBuffer(vignetteUB, 0, new Float32Array([angle, aspect, 0, 0]));
        const bg = makeStdBindGroup(current, vignetteUB);
        runPass(encoder, vignettePipeline, bg, other.createView());
        swap();
      }
    }

    // --- Encode back to sRGB (end of light-transport bracket) ---
    if (lightGroupActive) {
      const bg = makeStdBindGroup(current, encodeUB);
      runPass(encoder, colorspacePipeline, bg, other.createView());
      swap();
    }

    // --- Split Tone ---
    if (params["no-split-tone"] !== true) {
      const amount = num("split-tone-amount");
      if (amount > 0) {
        const hue = num("split-tone-hue");
        const pivot = num("split-tone-pivot");
        const mode = params["split-tone-mode"] || "natural";
        const protect = params["split-tone-protect-neutrals"] === true ? 1 : 0;
        const { shadowR, shadowB, shadowG, highlightR, highlightB, highlightG, midR } = getSplitToneTintValues({
          amount,
          hueAngle: hue,
          green: num("split-tone-green"),
          mode: typeof mode === "string" && mode === "complementary" ? "complementary" : "natural",
          pivot,
        });

        device.queue.writeBuffer(splitToneUB, 0, new Float32Array([
          shadowR, shadowB, shadowG, 0, highlightR, highlightB, highlightG, 0, midR, amount, protect, 0,
        ]));
        const bg = makeStdBindGroup(current, splitToneUB);
        runPass(encoder, splitTonePipeline, bg, other.createView());
        swap();
      }
    }

    // --- Camera Shake ---
    if (params["no-camera-shake"] !== true) {
      const amount = num("camera-shake-amount");
      if (amount > 0) {
        const rate = num("camera-shake-rate");
        const amplitude = (amount * 3) / t.w; // normalize to UV space
        const period1 = Math.max(1, 30 / (rate + 0.01));
        const period2 = period1 * 1.3;
        device.queue.writeBuffer(shakeUB, 0, new Float32Array([amplitude, period1, period2, frameCount]));
        const bg = makeStdBindGroup(current, shakeUB);
        runPass(encoder, shakePipeline, bg, other.createView());
        swap();
      }
    }

    // Blit the 16float intermediate into an 8-bit output texture for readback.
    const outBG = makeStdBindGroup(current, blitUB);
    runPass(encoder, blitPipeline, outBG, t.outputTex.createView());

    if (drawToCanvas) {
      // Canvas texture can't be used mid-chain, so blit via neutral passthrough
      const finalBG = makeStdBindGroup(current, blitUB);
      runPass(encoder, blitPipeline, finalBG, ctx.getCurrentTexture().createView());
    }
  }

  function renderFrame() {
    if (!source && !bufferSource) return;
    copySourceToTexture();
    frameCount++;

    const encoder = device.createCommandEncoder();
    encodeChain(encoder, previewTarget, true);
    lastOutputTex = previewTarget.outputTex;
    device.queue.submit([encoder.finish()]);
  }

  async function exportImage(): Promise<{ pixels: Uint8Array; width: number; height: number }> {
    const { width, height } = chooseExportSize(
      sourceWidth,
      sourceHeight,
      device.limits.maxTextureDimension2D,
    );

    if (!source && !bufferSource) return { pixels: new Uint8Array(0), width, height };
    copySourceToTexture();

    const eHalfW = Math.max(1, Math.floor(width / 2));
    const eHalfH = Math.max(1, Math.floor(height / 2));

    // A full-res export holds two source-sized rgba16float textures plus the
    // halves live at once (~160 MB each at 5472×3648), which can exhaust VRAM
    // on constrained GPUs. Catch the allocation failure and surface it instead
    // of leaking an unhandled device error.
    device.pushErrorScope("out-of-memory");
    const t: RenderTarget = {
      w: width, h: height, halfW: eHalfW, halfH: eHalfH,
      texA: createTexture(device, width, height, INTERMEDIATE_FORMAT),
      texB: createTexture(device, width, height, INTERMEDIATE_FORMAT),
      halfA: createTexture(device, eHalfW, eHalfH, INTERMEDIATE_FORMAT),
      halfB: createTexture(device, eHalfW, eHalfH, INTERMEDIATE_FORMAT),
      coreTex: createTexture(device, eHalfW, eHalfH, INTERMEDIATE_FORMAT),
      outputTex: device.createTexture({
        size: { width, height },
        format,
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC | GPUTextureUsage.TEXTURE_BINDING,
      }),
    };

    const encoder = device.createCommandEncoder();
    encodeChain(encoder, t, false);
    device.queue.submit([encoder.finish()]);

    const oom = await device.popErrorScope();
    if (oom) {
      t.texA.destroy();
      t.texB.destroy();
      t.halfA.destroy();
      t.halfB.destroy();
      t.coreTex.destroy();
      t.outputTex.destroy();
      throw new Error(
        `Not enough GPU memory to export at ${width}×${height}. Try a smaller source image.`,
      );
    }

    try {
      const pixels = await readPixelsFrom(t.outputTex, width, height);
      return { pixels, width, height };
    } finally {
      t.texA.destroy();
      t.texB.destroy();
      t.halfA.destroy();
      t.halfB.destroy();
      t.coreTex.destroy();
      t.outputTex.destroy();
    }
  }

  let lastOutputTex: GPUTexture = outputTex;

  async function readPixels(): Promise<Uint8Array> {
    return readPixelsFrom(lastOutputTex, previewWidth, previewHeight);
  }

  async function readPixelsFrom(tex: GPUTexture, width: number, height: number): Promise<Uint8Array> {
    const encoder = device.createCommandEncoder();

    const bytesPerRow = Math.ceil(width * 4 / 256) * 256;
    const readBuf = device.createBuffer({
      size: bytesPerRow * height,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });

    encoder.copyTextureToBuffer(
      { texture: tex },
      { buffer: readBuf, bytesPerRow, rowsPerImage: height },
      { width, height },
    );

    device.queue.submit([encoder.finish()]);

    try {
      await readBuf.mapAsync(GPUMapMode.READ);
      const mapped = new Uint8Array(readBuf.getMappedRange());

      const result = new Uint8Array(width * height * 4);
      const isBGRA = format === "bgra8unorm";
      for (let y = 0; y < height; y++) {
        const srcOffset = y * bytesPerRow;
        const dstOffset = y * width * 4;
        for (let x = 0; x < width; x++) {
          const s = srcOffset + x * 4;
          const d = dstOffset + x * 4;
          if (isBGRA) {
            result[d]     = mapped[s + 2]; // R <- B
            result[d + 1] = mapped[s + 1]; // G
            result[d + 2] = mapped[s];     // B <- R
            result[d + 3] = mapped[s + 3]; // A
          } else {
            result[d]     = mapped[s];
            result[d + 1] = mapped[s + 1];
            result[d + 2] = mapped[s + 2];
            result[d + 3] = mapped[s + 3];
          }
        }
      }

      return result;
    } finally {
      readBuf.unmap();
      readBuf.destroy();
    }
  }

  return {
    async setSource(s: HTMLVideoElement | HTMLImageElement) {
      source = s;
      bufferSource = null;
      if (imageBitmap) { imageBitmap.close(); imageBitmap = null; }
      if (s instanceof HTMLImageElement) {
        imageBitmap = await createImageBitmap(s);
      }
    },
    setSourceFromBuffer,
    setParams(p: PreviewParams) {
      params = p;
    },
    renderFrame,
    readPixels,
    exportImage,
    destroy() {
      if (imageBitmap) { imageBitmap.close(); imageBitmap = null; }
      texA.destroy();
      texB.destroy();
      halfA.destroy();
      halfB.destroy();
      coreTex.destroy();
      outputTex.destroy();
      srcTex.destroy();
      lutTex.destroy();
      device.destroy();
    },
  };
}
