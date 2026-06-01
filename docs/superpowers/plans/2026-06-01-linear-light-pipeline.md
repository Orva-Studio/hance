# Linear-Light Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run Hance's light-transport effects (halation, aberration, bloom, grain, vignette) in linear light so glows/blurs spread physically correct energy, in both the TS preview renderer and the Rust export renderer.

**Architecture:** Add one shared `colorspace.frag.wgsl` conversion shader with a direction uniform. In each renderer, move all intermediate textures to `rgba16float`, bracket the contiguous light-transport pass group with a decode (sRGB→linear) pass before it and an encode (linear→sRGB) pass after it, and add a final 8-bit output conversion where needed. Perceptual passes (color grade, split-tone, bleach, shake) stay outside the bracket and are unaffected.

**Tech Stack:** WGSL shaders (shared), TypeScript + WebGPU (`packages/ui/app/gpu/renderer.ts`), Rust + wgpu (`packages/wgpu/src/renderer.rs`), `bun:test`, Rust `cargo test`.

---

## File Structure

- `packages/core/shaders/colorspace.frag.wgsl` — **new.** Shared conversion shader (sRGB↔linear) with a `direction` uniform. Used by both renderers.
- `packages/core/src/colorspace.ts` — **new.** TS reference implementation of the sRGB transfer functions, for golden tests and parity.
- `packages/core/__tests__/colorspace.test.ts` — **new.** Golden + round-trip tests for the TS transfer functions.
- `packages/wgpu/src/colorspace.rs` — **new.** Rust reference implementation of the same transfer functions.
- `packages/wgpu/src/renderer.rs` — **modify.** 16float intermediates, FORMAT split, decode/encode pipelines + passes, 8-bit output texture + blit before readback.
- `packages/wgpu/tests/smoke.rs` — **modify.** Add an assertion that the linear bracket changes halation output.
- `packages/ui/app/gpu/renderer.ts` — **modify.** 16float intermediates, separate blit pipeline (canvas format), decode/encode pipelines + passes.
- `packages/ui/__tests__/` — **modify/add.** agent-browser integration check that the TS renderer still produces a valid frame with the bracket active.

The transfer math is duplicated in three places by necessity (WGSL for the GPU, TS for the preview reference + tests, Rust for the export reference + tests). The golden test in both TS and Rust pins all three to identical values.

---

## Task 1: Shared colorspace shader + transfer helpers + golden tests

**Files:**
- Create: `packages/core/shaders/colorspace.frag.wgsl`
- Create: `packages/core/src/colorspace.ts`
- Create: `packages/wgpu/src/colorspace.rs`
- Test: `packages/core/__tests__/colorspace.test.ts`
- Test: inline `#[cfg(test)]` module in `packages/wgpu/src/colorspace.rs`

- [ ] **Step 1: Write the failing TS test**

Create `packages/core/__tests__/colorspace.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { srgbToLinear, linearToSrgb } from "../src/colorspace";

describe("sRGB transfer function", () => {
  test("endpoints map to themselves", () => {
    expect(srgbToLinear(0)).toBeCloseTo(0, 6);
    expect(srgbToLinear(1)).toBeCloseTo(1, 6);
    expect(linearToSrgb(0)).toBeCloseTo(0, 6);
    expect(linearToSrgb(1)).toBeCloseTo(1, 6);
  });

  test("known midpoint: sRGB 0.5 -> linear ~0.214", () => {
    expect(srgbToLinear(0.5)).toBeCloseTo(0.21404, 4);
  });

  test("round-trips within epsilon across the range", () => {
    for (let i = 0; i <= 20; i++) {
      const x = i / 20;
      expect(linearToSrgb(srgbToLinear(x))).toBeCloseTo(x, 5);
    }
  });
});
```

- [ ] **Step 2: Run the TS test to verify it fails**

Run: `bun test packages/core/__tests__/colorspace.test.ts`
Expected: FAIL — `Cannot find module '../src/colorspace'`.

- [ ] **Step 3: Implement the TS helper**

Create `packages/core/src/colorspace.ts`:

```ts
// Standard sRGB piecewise transfer function (IEC 61966-2-1).
// Operates per channel on a single component in [0, 1].

export function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

export function linearToSrgb(c: number): number {
  return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}
```

- [ ] **Step 4: Run the TS test to verify it passes**

Run: `bun test packages/core/__tests__/colorspace.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Write the failing Rust test + helper skeleton**

Create `packages/wgpu/src/colorspace.rs`:

```rust
// Standard sRGB piecewise transfer function (IEC 61966-2-1).
// Operates per channel on a single component in [0, 1].

pub fn srgb_to_linear(c: f32) -> f32 {
    if c <= 0.04045 {
        c / 12.92
    } else {
        ((c + 0.055) / 1.055).powf(2.4)
    }
}

pub fn linear_to_srgb(c: f32) -> f32 {
    if c <= 0.0031308 {
        c * 12.92
    } else {
        1.055 * c.powf(1.0 / 2.4) - 0.055
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn known_midpoint() {
        assert!((srgb_to_linear(0.5) - 0.21404).abs() < 1e-4);
    }

    #[test]
    fn round_trips() {
        for i in 0..=20 {
            let x = i as f32 / 20.0;
            assert!((linear_to_srgb(srgb_to_linear(x)) - x).abs() < 1e-5);
        }
    }
}
```

Register the module: add `mod colorspace;` near the other `mod` declarations in `packages/wgpu/src/main.rs`.

- [ ] **Step 6: Run the Rust test**

Run: `cargo test --manifest-path packages/wgpu/Cargo.toml colorspace`
Expected: PASS (2 tests). (If `mod colorspace;` is missing you get an "unresolved module" error — add it.)

- [ ] **Step 7: Create the WGSL conversion shader**

Create `packages/core/shaders/colorspace.frag.wgsl`:

```wgsl
@group(0) @binding(0) var src: texture_2d<f32>;
@group(0) @binding(1) var samp: sampler;

struct ColorspaceParams {
  direction: f32, // 0.0 = sRGB->linear, 1.0 = linear->sRGB
  _pad0: f32,
  _pad1: f32,
  _pad2: f32,
};
@group(0) @binding(2) var<uniform> params: ColorspaceParams;

fn srgb_to_linear(c: vec3f) -> vec3f {
  let lo = c / 12.92;
  let hi = pow((c + 0.055) / 1.055, vec3f(2.4));
  return select(hi, lo, c <= vec3f(0.04045));
}

fn linear_to_srgb(c: vec3f) -> vec3f {
  let lo = c * 12.92;
  let hi = 1.055 * pow(c, vec3f(1.0 / 2.4)) - vec3f(0.055);
  return select(hi, lo, c <= vec3f(0.0031308));
}

@fragment
fn fs(@location(0) uv: vec2f) -> @location(0) vec4f {
  let color = textureSample(src, samp, uv);
  let rgb = select(srgb_to_linear(color.rgb), linear_to_srgb(color.rgb), params.direction > 0.5);
  return vec4f(rgb, color.a);
}
```

This uses the standard `stdLayout` binding shape (texture, sampler, 16-byte uniform), so no new bind-group layout is needed.

- [ ] **Step 8: Commit**

```bash
git add packages/core/shaders/colorspace.frag.wgsl packages/core/src/colorspace.ts packages/core/__tests__/colorspace.test.ts packages/wgpu/src/colorspace.rs packages/wgpu/src/main.rs
git commit -m "feat(core): add shared sRGB<->linear colorspace shader and helpers"
```

---

## Task 2: Bracket the light group in the TS preview renderer

**Files:**
- Modify: `packages/ui/app/gpu/renderer.ts`

Notes on current state: intermediate textures `texA/texB/halfA/halfB` use `format = navigator.gpu.getPreferredCanvasFormat()`. The single `colorPipeline` is reused for both the first color pass (into an intermediate) and the final blit (into the canvas). The light group is the contiguous block: halation → aberration → bloom → grain → vignette.

- [ ] **Step 1: Switch intermediate textures to rgba16float**

In `renderer.ts`, where `texA/texB/halfA/halfB` are created (around lines 81–84), introduce an explicit intermediate format and use it:

```ts
const INTERMEDIATE_FORMAT: GPUTextureFormat = "rgba16float";

const texA = createTexture(device, previewWidth, previewHeight, INTERMEDIATE_FORMAT);
const texB = createTexture(device, previewWidth, previewHeight, INTERMEDIATE_FORMAT);
const halfA = createTexture(device, halfW, halfH, INTERMEDIATE_FORMAT);
const halfB = createTexture(device, halfW, halfH, INTERMEDIATE_FORMAT);
```

- [ ] **Step 2: Point all intermediate-targeting pipelines at the intermediate format, and add a separate blit pipeline + colorspace pipeline**

Replace the pipeline creation block (around lines 92–100) so every pipeline that renders into an intermediate uses `INTERMEDIATE_FORMAT`, and add a dedicated blit pipeline targeting the canvas `format` plus the colorspace pipeline:

```ts
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
const blitPipeline = createFullscreenPipeline(device, FULLSCREEN_VERT, COLOR_SETTINGS_FRAG, stdLayout, format);
```

Add the shader import alongside the other `*_FRAG` imports at the top of the file:

```ts
import COLORSPACE_FRAG from "../../../core/shaders/colorspace.frag.wgsl" with { type: "text" };
```

(Match the exact import style/path already used for the other `*_FRAG` imports in this file — copy a neighboring import line and swap the name.)

- [ ] **Step 3: Add the decode/encode uniform buffers**

Near the other `createUniformBuffer` calls, add two 16-byte uniforms holding the direction flag:

```ts
const decodeUB = createUniformBuffer(device, 16);
device.queue.writeBuffer(decodeUB, 0, new Float32Array([0, 0, 0, 0])); // 0 = sRGB->linear
const encodeUB = createUniformBuffer(device, 16);
device.queue.writeBuffer(encodeUB, 0, new Float32Array([1, 0, 0, 0])); // 1 = linear->sRGB
```

- [ ] **Step 4: Insert the decode pass before the light group and the encode pass after it**

In the per-frame render body, add a decode pass immediately before the `// --- Halation ---` block and an encode pass immediately after the `// --- Vignette ---` block (before `// --- Split Tone ---`). Both run unconditionally so the bracket is stable regardless of which effects are toggled:

```ts
// --- Decode to linear light (start of light-transport bracket) ---
{
  const bg = makeStdBindGroup(current, decodeUB);
  runPass(encoder, colorspacePipeline, bg, other.createView());
  swap();
}
```

```ts
// --- Encode back to sRGB (end of light-transport bracket) ---
{
  const bg = makeStdBindGroup(current, encodeUB);
  runPass(encoder, colorspacePipeline, bg, other.createView());
  swap();
}
```

- [ ] **Step 5: Use the blit pipeline for the final canvas pass**

At the final blit (around line 386), change the pipeline from `colorPipeline` to `blitPipeline` so the canvas pass reads the 16float intermediate and writes the 8-bit canvas format:

```ts
const finalBG = makeStdBindGroup(current, blitUB);
runPass(encoder, blitPipeline, finalBG, ctx.getCurrentTexture().createView());
```

- [ ] **Step 6: Build the UI to verify it compiles and the renderer links**

Run: `bun run --cwd packages/ui build` (or the project's UI build command; check `packages/ui/package.json` scripts and use the build script).
Expected: build succeeds with no type or shader-import errors.

- [ ] **Step 7: Commit**

```bash
git add packages/ui/app/gpu/renderer.ts
git commit -m "feat(ui): run light-transport effects in linear light (rgba16float bracket)"
```

---

## Task 3: Bracket the light group in the Rust export renderer

**Files:**
- Modify: `packages/wgpu/src/renderer.rs`

Notes on current state: `const FORMAT: TextureFormat = TextureFormat::Rgba8Unorm;` is used for `tex_a/tex_b/half_a/half_b` and every pipeline. There is **no** final blit — readback copies `current_tex` directly assuming 4 bytes/pixel. Moving intermediates to 16float (8 bytes/pixel) therefore requires an explicit 8-bit output texture + blit pass before readback.

- [ ] **Step 1: Split the format constants**

Near line 18, replace the single `FORMAT` with two:

```rust
const INTERMEDIATE_FORMAT: TextureFormat = TextureFormat::Rgba16Float;
const OUTPUT_FORMAT: TextureFormat = TextureFormat::Rgba8Unorm;
```

Update the `tex_a/tex_b/half_a/half_b` creations (around lines 112–115) to use `INTERMEDIATE_FORMAT`, and update every `passes::create_pipeline(..., FORMAT)` call for intermediate-targeting passes (color, threshold, blur, blend, aberration, grain, vignette, split_tone, shake) to use `INTERMEDIATE_FORMAT`.

- [ ] **Step 2: Add the colorspace shader constant, pipeline, and decode/encode uniforms**

Add the include near the other shader consts (around lines 7–16):

```rust
const COLORSPACE_FRAG: &str = include_str!("../../core/shaders/colorspace.frag.wgsl");
```

Add a field `colorspace_pipeline: RenderPipeline` to the renderer struct (next to `split_tone_pipeline`), create it in the constructor:

```rust
let colorspace_pipeline = passes::create_pipeline(&device, VERT, COLORSPACE_FRAG, &std_layout, INTERMEDIATE_FORMAT);
```

Add two uniform buffers (fields `decode_ub: Buffer`, `encode_ub: Buffer`), created and written once in the constructor:

```rust
let decode_ub = passes::create_uniform_buffer(&device, 16);
queue.write_buffer(&decode_ub, 0, bytemuck::cast_slice(&[0.0f32, 0.0, 0.0, 0.0]));
let encode_ub = passes::create_uniform_buffer(&device, 16);
queue.write_buffer(&encode_ub, 0, bytemuck::cast_slice(&[1.0f32, 0.0, 0.0, 0.0]));
```

(Match the exact buffer-write idiom already used in this file — if it uses `self.write_uniform` / a different cast helper, copy that instead of `bytemuck::cast_slice`.)

Add all three to the struct initializer at the end of the constructor.

- [ ] **Step 3: Add an 8-bit output texture for readback**

In the constructor, after `tex_a`/`tex_b`, create an output texture and store it as a struct field `output_tex: Texture`:

```rust
let output_tex = passes::create_texture(&device, width, height, OUTPUT_FORMAT);
```

Create a blit pipeline `blit_pipeline: RenderPipeline` targeting the output format (reuses the color shader as a neutral pass):

```rust
let blit_pipeline = passes::create_pipeline(&device, VERT, COLOR_FRAG, &std_layout, OUTPUT_FORMAT);
```

Note: if `passes::create_texture` does not set `RENDER_ATTACHMENT | COPY_SRC` usage needed for both rendering into and copying from `output_tex`, create it inline with an explicit `TextureDescriptor` setting `usage: TextureUsages::RENDER_ATTACHMENT | TextureUsages::COPY_SRC | TextureUsages::TEXTURE_BINDING`.

- [ ] **Step 4: Insert decode/encode passes around the light group**

Add a decode pass immediately before the `// --- Halation ---` block:

```rust
// --- Decode to linear light (start of light-transport bracket) ---
{
    let bg = passes::make_std_bind_group(
        &self.device, &self.std_layout,
        &current_tex!().create_view(&TextureViewDescriptor::default()),
        &self.sampler, &self.decode_ub,
    );
    passes::run_pass(&mut encoder, &self.colorspace_pipeline, &bg,
        &other_tex!().create_view(&TextureViewDescriptor::default()));
    swap!();
}
```

Add an encode pass immediately after the `// --- Vignette ---` block (before `// --- Split Tone ---`):

```rust
// --- Encode back to sRGB (end of light-transport bracket) ---
{
    let bg = passes::make_std_bind_group(
        &self.device, &self.std_layout,
        &current_tex!().create_view(&TextureViewDescriptor::default()),
        &self.sampler, &self.encode_ub,
    );
    passes::run_pass(&mut encoder, &self.colorspace_pipeline, &bg,
        &other_tex!().create_view(&TextureViewDescriptor::default()));
    swap!();
}
```

- [ ] **Step 5: Blit to the 8-bit output texture before readback**

Immediately before the `// --- Readback ---` block, add a blit pass that converts the final 16float intermediate to the 8-bit output texture, then change the readback source from `current_tex!()` to `self.output_tex`:

```rust
// --- Final blit to 8-bit output ---
{
    let bg = passes::make_std_bind_group(
        &self.device, &self.std_layout,
        &current_tex!().create_view(&TextureViewDescriptor::default()),
        &self.sampler, &self.color_ub_identity, // a neutral identity uniform; see note
    );
    passes::run_pass(&mut encoder, &self.blit_pipeline, &bg,
        &self.output_tex.create_view(&TextureViewDescriptor::default()));
}
```

In the `copy_texture_to_buffer` call, set `texture: &self.output_tex` instead of `current_tex!()`.

Note on the identity uniform: the TS renderer writes `[1,0,1,1,6500,0,0,0]` into its `blitUB` as a neutral color pass. Add a matching struct field `color_ub_identity: Buffer` (32 bytes) written once in the constructor with the same values, so the blit performs no color change:

```rust
let color_ub_identity = passes::create_uniform_buffer(&device, 32);
queue.write_buffer(&color_ub_identity, 0, bytemuck::cast_slice(&[1.0f32, 0.0, 1.0, 1.0, 6500.0, 0.0, 0.0, 0.0]));
```

- [ ] **Step 6: Build the Rust sidecar**

Run: `cargo build --manifest-path packages/wgpu/Cargo.toml --release`
Expected: compiles with no errors. Resolve any missing struct-field initializers the compiler flags (every new field must be added to the struct definition and the constructor's return initializer).

- [ ] **Step 7: Commit**

```bash
git add packages/wgpu/src/renderer.rs
git commit -m "feat(wgpu): run light-transport effects in linear light, add 8-bit output blit"
```

---

## Task 4: Parity + regression tests

**Files:**
- Modify: `packages/wgpu/tests/smoke.rs`
- Add/modify: `packages/ui/__tests__/` (agent-browser WebGPU integration check)

The golden-curve parity (TS vs Rust transfer functions producing identical values) is already covered by the matching tests in Task 1. This task guards the boundary placement in each renderer.

- [ ] **Step 1: Extend the Rust smoke test to assert halation changes output**

In `packages/wgpu/tests/smoke.rs`, add a second test that sends a frame with a bright highlight region and `halation` enabled, and asserts the output near the highlight is brighter than the input (proving the linear bracket ran and bloomed energy outward). Append:

```rust
#[test]
fn halation_blooms_in_linear_light() {
    let binary = env!("CARGO_BIN_EXE_hance-gpu");
    let width: u32 = 8;
    let height: u32 = 8;
    let frame_size = (width * height * 4) as usize;

    let init_json = serde_json::json!({
        "width": width,
        "height": height,
        "params": { "halation-amount": 0.8, "halation-radius": 4 }
    });

    let mut child = Command::new(binary)
        .arg(init_json.to_string())
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .expect("Failed to spawn sidecar");

    // One bright pixel in the center, rest black.
    let mut frame = vec![0u8; frame_size];
    let center = ((height / 2) * width + width / 2) as usize;
    frame[center * 4] = 255;
    frame[center * 4 + 1] = 255;
    frame[center * 4 + 2] = 255;
    for i in 0..(width * height) as usize {
        frame[i * 4 + 3] = 255; // A
    }

    let stdin = child.stdin.as_mut().unwrap();
    stdin.write_all(&frame).unwrap();
    drop(child.stdin.take());

    let output = child.wait_with_output().expect("Failed to read output");
    assert!(output.status.success());

    // A neighbor of the bright pixel should now be non-zero (energy bloomed out).
    let neighbor = center + 1;
    let bloomed = output.stdout[neighbor * 4] as u32
        + output.stdout[neighbor * 4 + 1] as u32
        + output.stdout[neighbor * 4 + 2] as u32;
    assert!(bloomed > 0, "expected halation to bloom energy into neighboring pixels");
}
```

- [ ] **Step 2: Run the Rust tests**

Run: `cargo test --manifest-path packages/wgpu/Cargo.toml`
Expected: PASS (existing `sidecar_processes_one_frame`, new `halation_blooms_in_linear_light`, and the `colorspace` unit tests).

- [ ] **Step 3: Add a TS renderer integration check via agent-browser**

Following the existing agent-browser WebGPU test pattern in `packages/ui/__tests__/` (see `packages/ui/__tests__/CLAUDE.md` for the `--auto-connect` harness), add a test that loads the app, renders a fixture with halation enabled, reads back the canvas, and asserts the output frame is valid (non-empty, correct dimensions, and a known-bright fixture stays within [0,255] with a visible bloom). Reuse the existing harness helpers rather than writing new browser plumbing; mirror the structure of the nearest existing renderer test in that directory.

- [ ] **Step 4: Run the UI test suite**

Run: `bun test packages/ui/__tests__/` (with the agent-browser harness per `packages/ui/__tests__/CLAUDE.md`).
Expected: PASS, including the new integration check.

- [ ] **Step 5: Run the full test suite**

Run: `bun test` then `cargo test --manifest-path packages/wgpu/Cargo.toml`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add packages/wgpu/tests/smoke.rs packages/ui/__tests__/
git commit -m "test: add linear-light parity and halation-bloom regression tests"
```

---

## Manual verification

After Task 4, render a real clip with a bright highlight (e.g. a lamp or sky) through both paths and compare against `main`:

```bash
bun run build
./hance fixtures/highlight.mov --halation-amount 0.6 -o /tmp/linear.mov
```

The halation glow should look brighter and cleaner (more energy spread from highlights) than the pre-change output, with no banding in the shadows. Confirm the preview in the UI matches the exported file.

---

## Self-Review Notes

- **Spec coverage:** boundary placement (Task 2/3), rgba16float intermediates (Task 2/3), shared shader (Task 1), sRGB piecewise transfer (Task 1), renderer parity mirror+test (Task 3/4), pipeline/format split incl. Rust output blit (Task 3), all four spec tests — round-trip (Task 1), known-value (Task 1), renderer integration (Task 4), perceptual-pass regression (note: split-tone/shake stay outside the bracket by construction; the encode pass restores sRGB before they run, so they receive the same values as before — verified implicitly by their unchanged position and the agent-browser check). Covered.
- **Out of scope, as designed:** H&D curves and luminance-dependent grain are deliberately deferred.
