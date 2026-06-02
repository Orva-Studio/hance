import {
  FULLSCREEN_VERT, COLOR_SETTINGS_FRAG, THRESHOLD_FRAG, BLUR_FRAG,
  SCREEN_BLEND_FRAG, ABERRATION_FRAG, GRAIN_FRAG, VIGNETTE_FRAG,
  SPLIT_TONE_FRAG, CAMERA_SHAKE_FRAG, COLORSPACE_FRAG, LUT_FRAG,
} from "./shaders";
import { createFullscreenPipeline, createTexture, runPass } from "./passes";
import { getSplitToneTintValues } from "./splitToneMath";
import { isLightGroupActive } from "./lightGroup";
import { LUT_SIZE, generateLut, isInputLutActive } from "@hance/core";

export interface PreviewParams {
  [key: string]: string | number | boolean;
}

export interface Renderer {
  setSource(source: HTMLVideoElement | HTMLImageElement): Promise<void>;
  setSourceFromBuffer(data: Uint8Array, width: number, height: number): void;
  setParams(params: PreviewParams): void;
  renderFrame(): void;
  readPixels(): Promise<Uint8Array>;
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
  const lutLayout = createLutLayout(device);

  const halfW = Math.max(1, Math.floor(previewWidth / 2));
  const halfH = Math.max(1, Math.floor(previewHeight / 2));

  const INTERMEDIATE_FORMAT: GPUTextureFormat = "rgba16float";

  const texA = createTexture(device, previewWidth, previewHeight, INTERMEDIATE_FORMAT);
  const texB = createTexture(device, previewWidth, previewHeight, INTERMEDIATE_FORMAT);
  const halfA = createTexture(device, halfW, halfH, INTERMEDIATE_FORMAT);
  const halfB = createTexture(device, halfW, halfH, INTERMEDIATE_FORMAT);

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

  const colorUB = createUniformBuffer(device, 32); // 8 floats
  const blitUB = createUniformBuffer(device, 32); // identity color pass for final blit
  device.queue.writeBuffer(blitUB, 0, new Float32Array([1, 0, 1, 1, 6500, 0, 0, 0]));
  const thresholdUB = createUniformBuffer(device, 16);
  const blurUB1 = createUniformBuffer(device, 16);
  const blurUB2 = createUniformBuffer(device, 16);
  const blendUB = createUniformBuffer(device, 16);
  const aberrationUB = createUniformBuffer(device, 16);
  const grainUB = createUniformBuffer(device, 32); // 8 floats
  const vignetteUB = createUniformBuffer(device, 16);
  const splitToneUB = createUniformBuffer(device, 32);
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

  function num(key: string, fallback: number): number {
    const v = params[key];
    return typeof v === "number" ? v : fallback;
  }

  function bool(key: string, fallback: boolean): boolean {
    const v = params[key];
    return typeof v === "boolean" ? v : fallback;
  }

  function renderFrame() {
    if (!source && !bufferSource) return;
    copySourceToTexture();
    frameCount++;

    const encoder = device.createCommandEncoder();
    let current = texA;
    let other = texB;

    function swap() {
      const tmp = current;
      current = other;
      other = tmp;
    }

    // --- Input/pre-LUT (first pass, srcTex -> texA) ---
    // Skipped entirely when identity/disabled so the frame passes through.
    let colorInput = srcTex;
    if (isInputLutActive(params)) {
      runPass(encoder, lutPipeline, makeLutBindGroup(srcTex), texA.createView());
      colorInput = texA;
      // Color must write somewhere other than its texA input.
      current = texB;
      other = texA;
    }

    if (params["no-color-settings"] !== true) {
      const fade = num("fade", 0);
      const contrast = num("contrast", 1) * (1 - fade);
      const brightness = num("exposure", 0) * 0.1 + fade * 0.05;
      const saturation = num("subtractive-sat", 1) * num("richness", 1);
      const gamma = 1 - num("highlights", 0) * 0.5;
      const wb = num("white-balance", 6500);
      const tint = num("tint", 0) / 100;
      const bleach = num("bleach-bypass", 0);
      device.queue.writeBuffer(colorUB, 0, new Float32Array([contrast, brightness, saturation, gamma, wb, tint, bleach, 0]));
      const bg = makeStdBindGroup(colorInput, colorUB);
      runPass(encoder, colorPipeline, bg, current.createView());
    } else {
      const bg = makeStdBindGroup(colorInput, colorUB);
      device.queue.writeBuffer(colorUB, 0, new Float32Array([1, 0, 1, 1, 6500, 0, 0, 0]));
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
      const amount = num("halation-amount", 0.25);
      if (amount > 0) {
        const radius = num("halation-radius", 4);
        const highlightsOnly = bool("halation-highlights-only", true);

        // Save pre-halation result for blend
        const preHalation = current;

        if (highlightsOnly) {
          // Threshold pass → halfA
          device.queue.writeBuffer(thresholdUB, 0, new Float32Array([0.4, 0.9, 0, 0]));
          const threshBG = makeStdBindGroup(current, thresholdUB);
          runPass(encoder, thresholdPipeline, threshBG, halfA.createView());
        } else {
          // Downsample directly (use blur with sigma=0.001 as passthrough-ish)
          device.queue.writeBuffer(blurUB1, 0, new Float32Array([0, 0, 0.001, 0]));
          const bg = makeStdBindGroup(current, blurUB1);
          runPass(encoder, blurPipeline, bg, halfA.createView());
        }

        // Horizontal blur → halfB
        const sigma = radius * 0.5;
        device.queue.writeBuffer(blurUB1, 0, new Float32Array([1.0 / halfW, 0, sigma, 0]));
        const hBG = makeStdBindGroup(halfA, blurUB1);
        runPass(encoder, blurPipeline, hBG, halfB.createView());

        // Vertical blur → halfA
        device.queue.writeBuffer(blurUB2, 0, new Float32Array([0, 1.0 / halfH, sigma, 0]));
        const vBG = makeStdBindGroup(halfB, blurUB2);
        runPass(encoder, blurPipeline, vBG, halfA.createView());

        // Screen blend halation with pre-halation → other
        const hue = num("halation-hue", 0.04) * 360;
        const sat = num("halation-saturation", 1);
        const ambient = amount * 0.18;
        device.queue.writeBuffer(blendUB, 0, new Float32Array([amount, hue, sat, ambient]));
        const blendBG = makeBlendBindGroup(preHalation, halfA, blendUB);
        runPass(encoder, blendPipeline, blendBG, other.createView());
        swap();
      }
    }

    // --- Chromatic Aberration ---
    if (params["no-aberration"] !== true) {
      const amount = num("aberration", 0.3);
      if (amount > 0) {
        device.queue.writeBuffer(aberrationUB, 0, new Float32Array([amount * 0.02, 0, 0, 0]));
        const bg = makeStdBindGroup(current, aberrationUB);
        runPass(encoder, aberrationPipeline, bg, other.createView());
        swap();
      }
    }

    // --- Bloom ---
    if (params["no-bloom"] !== true) {
      const amount = num("bloom-amount", 0.25);
      if (amount > 0) {
        const radius = num("bloom-radius", 10);
        const preBloom = current;

        // FFmpeg bloom blurs the full frame, so downsample without thresholding first.
        device.queue.writeBuffer(blurUB1, 0, new Float32Array([0, 0, 0.001, 0]));
        const downsampleBG = makeStdBindGroup(current, blurUB1);
        runPass(encoder, blurPipeline, downsampleBG, halfA.createView());

        // H-blur → halfB
        const sigma = radius * 0.5;
        device.queue.writeBuffer(bloomBlurUB1, 0, new Float32Array([1.0 / halfW, 0, sigma, 0]));
        const hBG = makeStdBindGroup(halfA, bloomBlurUB1);
        runPass(encoder, blurPipeline, hBG, halfB.createView());

        // V-blur → halfA
        device.queue.writeBuffer(bloomBlurUB2, 0, new Float32Array([0, 1.0 / halfH, sigma, 0]));
        const vBG = makeStdBindGroup(halfB, bloomBlurUB2);
        runPass(encoder, blurPipeline, vBG, halfA.createView());

        // Screen blend → other
        device.queue.writeBuffer(bloomBlendUB, 0, new Float32Array([amount, 0, 0, 0]));
        const blendBG = makeBlendBindGroup(preBloom, halfA, bloomBlendUB);
        runPass(encoder, blendPipeline, blendBG, other.createView());
        swap();
      }
    }

    // --- Grain ---
    if (params["no-grain"] !== true) {
      const amount = num("grain-amount", 0.125);
      if (amount > 0) {
        device.queue.writeBuffer(grainUB, 0, new Float32Array([
          amount,
          num("grain-size", 0),
          num("grain-softness", 0.1),
          num("grain-saturation", 0.3),
          num("grain-defocus", 1),
          frameCount,
          1.0 / previewWidth,
          1.0 / previewHeight,
        ]));
        const bg = makeStdBindGroup(current, grainUB);
        runPass(encoder, grainPipeline, bg, other.createView());
        swap();
      }
    }

    // --- Vignette ---
    if (params["no-vignette"] !== true) {
      const amount = num("vignette-amount", 0.25);
      if (amount > 0) {
        const angle = amount * Math.PI / 2;
        const aspect = 1 - num("vignette-size", 0.25) * 0.5;
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
      const amount = num("split-tone-amount", 0);
      if (amount > 0) {
        const hue = num("split-tone-hue", 20);
        const pivot = num("split-tone-pivot", 0.3);
        const mode = params["split-tone-mode"] || "natural";
        const protect = params["split-tone-protect-neutrals"] === true ? 1 : 0;
        const { shadowR, shadowB, highlightR, highlightB, midR } = getSplitToneTintValues({
          amount,
          hueAngle: hue,
          mode: typeof mode === "string" && mode === "complementary" ? "complementary" : "natural",
          pivot,
        });

        device.queue.writeBuffer(splitToneUB, 0, new Float32Array([
          shadowR, shadowB, highlightR, highlightB, midR, amount, protect, 0,
        ]));
        const bg = makeStdBindGroup(current, splitToneUB);
        runPass(encoder, splitTonePipeline, bg, other.createView());
        swap();
      }
    }

    // --- Camera Shake ---
    if (params["no-camera-shake"] !== true) {
      const amount = num("camera-shake-amount", 0.25);
      if (amount > 0) {
        const rate = num("camera-shake-rate", 0.5);
        const amplitude = (amount * 3) / previewWidth; // normalize to UV space
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
    runPass(encoder, blitPipeline, outBG, outputTex.createView());
    lastOutputTex = outputTex;

    // Canvas texture can't be used mid-chain, so blit via neutral passthrough
    const finalBG = makeStdBindGroup(current, blitUB);
    runPass(encoder, blitPipeline, finalBG, ctx.getCurrentTexture().createView());

    device.queue.submit([encoder.finish()]);
  }

  let lastOutputTex: GPUTexture = outputTex;

  async function readPixels(): Promise<Uint8Array> {
    const encoder = device.createCommandEncoder();

    const bytesPerRow = Math.ceil(previewWidth * 4 / 256) * 256;
    const readBuf = device.createBuffer({
      size: bytesPerRow * previewHeight,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });

    encoder.copyTextureToBuffer(
      { texture: lastOutputTex },
      { buffer: readBuf, bytesPerRow, rowsPerImage: previewHeight },
      { width: previewWidth, height: previewHeight },
    );

    device.queue.submit([encoder.finish()]);

    try {
      await readBuf.mapAsync(GPUMapMode.READ);
      const mapped = new Uint8Array(readBuf.getMappedRange());

      const result = new Uint8Array(previewWidth * previewHeight * 4);
      const isBGRA = format === "bgra8unorm";
      for (let y = 0; y < previewHeight; y++) {
        const srcOffset = y * bytesPerRow;
        const dstOffset = y * previewWidth * 4;
        for (let x = 0; x < previewWidth; x++) {
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
    destroy() {
      if (imageBitmap) { imageBitmap.close(); imageBitmap = null; }
      texA.destroy();
      texB.destroy();
      halfA.destroy();
      halfB.destroy();
      outputTex.destroy();
      srcTex.destroy();
      lutTex.destroy();
      device.destroy();
    },
  };
}
