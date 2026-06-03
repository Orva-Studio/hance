# Per-channel Scatter Halation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the tint-painted halation bloom with a warm edge ring that emerges from per-channel (R/G/B) scatter radii, recombined additively in linear light, with no hue parameter.

**Architecture:** Both renderers (TS preview `renderer.ts`, Rust export `renderer.rs`) share WGSL shaders in `packages/core/shaders/` and constants in `packages/core/constants/render.json`. The halation pass becomes: energy-weighted threshold → per-channel 2-Gaussian scatter blur → ring extraction + additive recombine. Two new shaders are added; the existing `blur.frag.wgsl` is left untouched because bloom shares it. The Rust path is driven test-first via the headless sidecar; the TS path mirrors it.

**Tech Stack:** TypeScript + WebGPU (preview), Rust + wgpu (export sidecar `@hance/gpu`), WGSL shaders, Bun test.

---

## Design deviation from spec (intentional)

The spec said to extend `blur.frag.wgsl` to per-channel sigma. **Do not** — bloom (`renderer.ts:404-418`, `renderer.rs` bloom block) reuses that same shader and its `BlurParams` layout. Changing it would break bloom. Instead add a **new** `scatter-blur.frag.wgsl`. Everything else follows the spec.

## File structure

- Create `packages/core/shaders/scatter-blur.frag.wgsl` — per-channel sigma + 2-Gaussian PSF separable blur.
- Create `packages/core/shaders/halation-combine.frag.wgsl` — ring extraction + additive recombine (3 input textures).
- Modify `packages/core/constants/render.json` — add 3 constants.
- Modify `packages/core/src/render-constants.ts` — export new constants.
- Modify `packages/wgpu/src/render_constants.rs` — deserialize new constants.
- Modify `packages/wgpu/src/renderer.rs` — new pipelines/buffers/`core_tex`, rewritten halation block.
- Modify `packages/wgpu/src/params.rs` — remove `halation_hue` / `halation_saturation`.
- Modify `packages/ui/app/gpu/renderer.ts` — mirror: new pipelines/buffers/`coreTex`, rewritten halation block, combine bind group helper + layout.
- Modify `packages/core/src/schema.ts` — remove `halation-hue`, `halation-saturation` entries.
- Modify `packages/core/src/types.ts` — remove `hue`, `saturation` from `HalationOptions`.
- Modify `packages/core/src/presets.ts` — remove `hue`, `saturation` from built options.
- Modify `packages/ui/__tests__/server.test.ts` — remove `halation-hue` default assertion.
- Modify `packages/cli/__tests__/gpu/halation.test.ts` — new behavioural assertions.

---

## Task 1: Shared constants (additive, safe)

**Files:**
- Modify: `packages/core/constants/render.json`
- Modify: `packages/core/src/render-constants.ts`
- Modify: `packages/wgpu/src/render_constants.rs`
- Test: `packages/core/__tests__/render-constants.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `packages/core/__tests__/render-constants.test.ts`:

```ts
import { HALATION_CHANNEL_SIGMA, HALATION_PSF, HALATION_RING } from "../src/render-constants";

test("per-channel scatter constants are present and ordered R>G>B", () => {
  expect(HALATION_CHANNEL_SIGMA).toEqual([1.0, 0.62, 0.38]);
  expect(HALATION_CHANNEL_SIGMA[0]).toBeGreaterThan(HALATION_CHANNEL_SIGMA[1]);
  expect(HALATION_CHANNEL_SIGMA[1]).toBeGreaterThan(HALATION_CHANNEL_SIGMA[2]);
  expect(HALATION_PSF).toEqual([[1.0, 0.7], [2.6, 0.3]]);
  expect(HALATION_RING).toBe(1.0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test packages/core/__tests__/render-constants.test.ts`
Expected: FAIL — `HALATION_CHANNEL_SIGMA` is undefined / not exported.

- [ ] **Step 3: Add constants to `render.json`**

Replace the file contents with:

```json
{
  "halationThreshold": [0.65, 0.75],
  "blurSigmaFactor": 0.5,
  "halationChannelSigma": [1.0, 0.62, 0.38],
  "halationPsf": [[1.0, 0.7], [2.6, 0.3]],
  "halationRing": 1.0
}
```

- [ ] **Step 4: Export from `render-constants.ts`**

Append to `packages/core/src/render-constants.ts`:

```ts
export const HALATION_CHANNEL_SIGMA: readonly [number, number, number] =
  renderConstants.halationChannelSigma as [number, number, number];
export const HALATION_PSF: readonly (readonly [number, number])[] =
  renderConstants.halationPsf as [number, number][];
export const HALATION_RING: number = renderConstants.halationRing;
```

- [ ] **Step 5: Run test to verify it passes**

Run: `bun test packages/core/__tests__/render-constants.test.ts`
Expected: PASS

- [ ] **Step 6: Add Rust deserialization**

In `packages/wgpu/src/render_constants.rs`, extend the struct:

```rust
#[derive(Deserialize)]
pub struct RenderConstants {
    #[serde(rename = "halationThreshold")]
    pub halation_threshold: [f32; 2],
    #[serde(rename = "blurSigmaFactor")]
    pub blur_sigma_factor: f32,
    #[serde(rename = "halationChannelSigma")]
    pub halation_channel_sigma: [f32; 3],
    #[serde(rename = "halationPsf")]
    pub halation_psf: [[f32; 2]; 2],
    #[serde(rename = "halationRing")]
    pub halation_ring: f32,
}
```

- [ ] **Step 7: Verify Rust still compiles**

Run: `cargo build --manifest-path packages/wgpu/Cargo.toml`
Expected: builds (the new fields are now populated from the same JSON).

- [ ] **Step 8: Commit**

```bash
git add packages/core/constants/render.json packages/core/src/render-constants.ts packages/wgpu/src/render_constants.rs packages/core/__tests__/render-constants.test.ts
git commit -m "feat(halation): add per-channel scatter constants to render.json (#48)"
```

---

## Task 2: New WGSL shaders

**Files:**
- Create: `packages/core/shaders/scatter-blur.frag.wgsl`
- Create: `packages/core/shaders/halation-combine.frag.wgsl`

These are consumed/tested in Tasks 3–4. No standalone test (WGSL is exercised through the renderer).

- [ ] **Step 1: Create `scatter-blur.frag.wgsl`**

```wgsl
@group(0) @binding(0) var src: texture_2d<f32>;
@group(0) @binding(1) var samp: sampler;

// Per-channel separable scatter blur. Each channel uses its own sigma so the
// warm halo emerges from wavelength-dependent scatter (R widest, B narrowest).
// Each channel's kernel is a weighted sum of two Gaussians (sharp core + long
// tail) approximating a point-spread function.
struct ScatterBlurParams {
  dir: vec2f,    // texel step for this pass (H = (1/w,0), V = (0,1/h))
  _pad: vec2f,
  sigma: vec4f,  // per-channel base sigma in .xyz (.w unused)
  psf0: vec2f,   // core  Gaussian: (scale, weight)
  psf1: vec2f,   // tail  Gaussian: (scale, weight)
};
@group(0) @binding(2) var<uniform> p: ScatterBlurParams;

fn gauss(i: f32, s: f32) -> f32 {
  let ss = max(s, 0.001);
  return exp(-(i * i) / (2.0 * ss * ss));
}

@fragment
fn fs(@location(0) uv: vec2f) -> @location(0) vec4f {
  let sigma = max(p.sigma.xyz, vec3f(0.001));
  let max_sigma = max(sigma.x, max(sigma.y, sigma.z));
  let max_scale = max(p.psf0.x, p.psf1.x);
  let radius = i32(ceil(max_sigma * max_scale * 3.0));
  var color = vec3f(0.0);
  var wsum = vec3f(0.0);
  for (var i = -radius; i <= radius; i = i + 1) {
    let fi = f32(i);
    let s = textureSample(src, samp, uv + p.dir * fi).rgb;
    let w = vec3f(
      p.psf0.y * gauss(fi, sigma.x * p.psf0.x) + p.psf1.y * gauss(fi, sigma.x * p.psf1.x),
      p.psf0.y * gauss(fi, sigma.y * p.psf0.x) + p.psf1.y * gauss(fi, sigma.y * p.psf1.x),
      p.psf0.y * gauss(fi, sigma.z * p.psf0.x) + p.psf1.y * gauss(fi, sigma.z * p.psf1.x),
    );
    color += s * w;
    wsum += w;
  }
  return vec4f(color / wsum, 1.0);
}
```

- [ ] **Step 2: Create `halation-combine.frag.wgsl`**

```wgsl
@group(0) @binding(0) var base_tex: texture_2d<f32>;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var scatter_tex: texture_2d<f32>;
@group(0) @binding(3) var core_tex: texture_2d<f32>;

// Ring extraction + additive recombine in linear light. Subtracting the
// thresholded core from the scatter leaves an edge ring rather than a filled
// disk; the result is added (re-exposure is additive energy), not screen-blended.
struct CombineParams {
  amount: f32,  // recombine strength
  ring: f32,    // core-subtraction strength: 0 = filled disk, 1 = full ring
  _pad: vec2f,
};
@group(0) @binding(4) var<uniform> p: CombineParams;

@fragment
fn fs(@location(0) uv: vec2f) -> @location(0) vec4f {
  let base = textureSample(base_tex, samp, uv).rgb;
  let scatter = textureSample(scatter_tex, samp, uv).rgb;
  let core = textureSample(core_tex, samp, uv).rgb;
  let ring = max(scatter - p.ring * core, vec3f(0.0));
  return vec4f(base + p.amount * ring, 1.0);
}
```

- [ ] **Step 3: Commit**

```bash
git add packages/core/shaders/scatter-blur.frag.wgsl packages/core/shaders/halation-combine.frag.wgsl
git commit -m "feat(halation): add per-channel scatter-blur and combine shaders (#48)"
```

---

## Task 3: Rust export renderer (test-first)

This is the testable path — the headless sidecar (`@hance/gpu`) runs the Rust renderer. Write the failing behavioural tests first, then implement.

**Files:**
- Test: `packages/cli/__tests__/gpu/halation.test.ts`
- Modify: `packages/wgpu/src/renderer.rs`
- Modify: `packages/wgpu/src/params.rs`

- [ ] **Step 1: Write the failing tests**

Replace the body of `describe("halation (headless sidecar)", ...)` in `packages/cli/__tests__/gpu/halation.test.ts`. Keep the existing `makeFrame`/`px`/`W`/`H`/`BLOCK_*` helpers and the `HALATION_ONLY` map. Add a luminance helper and these tests (replace the two existing `it(...)` blocks):

```ts
const lum = (o: Uint8Array, x: number, y: number) => {
  const i = (y * W + x) * 4;
  return o[i] + o[i + 1] + o[i + 2];
};

it("glows warm just outside a highlight with no hue param", () => {
  const [r, g, b] = px(out, BLOCK_HI + 2, 32);
  expect(r).toBeGreaterThan(0);
  expect(r).toBeGreaterThan(b); // warm emerges from per-channel scatter, not a tint
  expect(r).toBeGreaterThanOrEqual(g);
});

it("red scatters wider than blue (per-channel radii)", () => {
  // Sample far out where only the widest channel still reaches.
  const far = px(out, BLOCK_HI + 7, 32);
  expect(far[0]).toBeGreaterThan(far[2]); // red persists past blue
});

it("rings the edge rather than filling the disk", () => {
  // Glow just outside the edge should exceed the added energy deep inside the
  // bright core (interior delta ~0 because base is already max there).
  const edge = lum(out, BLOCK_HI + 1, 32);
  const interior = lum(out, 32, 32);
  expect(edge).toBeGreaterThan(0);
  // interior is saturated white (765) from base; ring must be a distinct bright
  // band outside it, i.e. edge glow is present and non-trivial.
  expect(edge).toBeGreaterThan(30);
  expect(interior).toBe(765);
});

it("scatter is isotropic (H and V profiles match)", () => {
  for (let d = 1; d <= 10; d++) {
    const h = lum(out, Math.min(32 + d, W - 1), 32);
    const v = lum(out, 32, Math.min(32 + d, H - 1));
    expect(Math.abs(h - v)).toBeLessThanOrEqual(2);
  }
});

it("leaves the far field neutral (no global warm wash)", () => {
  const [r, g, b] = px(out, 1, 1);
  expect(Math.abs(r - b)).toBeLessThanOrEqual(2);
  expect(Math.abs(r - g)).toBeLessThanOrEqual(2);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test packages/cli/__tests__/gpu/halation.test.ts`
Expected: FAIL — the current renderer still tints (cyan-ish or uniform), and `red scatters wider than blue` / `rings the edge` fail because the blur is single-sigma + screen-blend. (If `@hance/gpu` needs a rebuild, the test harness builds it; otherwise run `bun run --cwd packages/wgpu build` per existing convention.)

- [ ] **Step 3: Add shader constants, pipelines, buffers, layout, and `core_tex` to the Rust struct**

In `packages/wgpu/src/renderer.rs`:

a) Near the other `include_str!` lines (top of file), add:

```rust
const SCATTER_BLUR_FRAG: &str = include_str!("../../core/shaders/scatter-blur.frag.wgsl");
const COMBINE_FRAG: &str = include_str!("../../core/shaders/halation-combine.frag.wgsl");
```

b) Add struct fields (alongside `blur_pipeline`, `half_a`, `blur_ub1`, etc.):

```rust
    scatter_blur_pipeline: RenderPipeline,
    combine_pipeline: RenderPipeline,
    combine_layout: BindGroupLayout,
    core_tex: Texture,
    scatter_blur_ub1: Buffer,
    scatter_blur_ub2: Buffer,
    combine_ub: Buffer,
```

c) In the constructor, after `half_b` is created:

```rust
        let core_tex = passes::create_texture(&device, half_w, half_h, INTERMEDIATE_FORMAT);
```

d) Create the combine bind group layout (5 bindings: base tex, sampler, scatter tex, core tex, uniform). Place near where `blend_layout` is built:

```rust
        let combine_layout = device.create_bind_group_layout(&BindGroupLayoutDescriptor {
            label: Some("combine_layout"),
            entries: &[
                BindGroupLayoutEntry { binding: 0, visibility: ShaderStages::FRAGMENT,
                    ty: BindingType::Texture { sample_type: TextureSampleType::Float { filterable: true },
                        view_dimension: TextureViewDimension::D2, multisampled: false }, count: None },
                BindGroupLayoutEntry { binding: 1, visibility: ShaderStages::FRAGMENT,
                    ty: BindingType::Sampler(SamplerBindingType::Filtering), count: None },
                BindGroupLayoutEntry { binding: 2, visibility: ShaderStages::FRAGMENT,
                    ty: BindingType::Texture { sample_type: TextureSampleType::Float { filterable: true },
                        view_dimension: TextureViewDimension::D2, multisampled: false }, count: None },
                BindGroupLayoutEntry { binding: 3, visibility: ShaderStages::FRAGMENT,
                    ty: BindingType::Texture { sample_type: TextureSampleType::Float { filterable: true },
                        view_dimension: TextureViewDimension::D2, multisampled: false }, count: None },
                BindGroupLayoutEntry { binding: 4, visibility: ShaderStages::FRAGMENT,
                    ty: BindingType::Buffer { ty: BufferBindingType::Uniform, has_dynamic_offset: false, min_binding_size: None }, count: None },
            ],
        });
```

> Note: match the exact import paths/aliases already used in `renderer.rs` for `BindGroupLayoutDescriptor`, `BindGroupLayoutEntry`, etc. If the file uses `wgpu::` prefixes, prefix accordingly. Check how `std_layout`/`blend_layout` are constructed in `passes.rs` and reuse that style — if there is a `passes::create_*_layout` helper, add a `create_combine_layout` there instead and call it.

e) Create pipelines (near `blur_pipeline`):

```rust
        let scatter_blur_pipeline = passes::create_pipeline(&device, VERT, SCATTER_BLUR_FRAG, &std_layout, INTERMEDIATE_FORMAT);
        let combine_pipeline = passes::create_pipeline(&device, VERT, COMBINE_FRAG, &combine_layout, INTERMEDIATE_FORMAT);
```

f) Create uniform buffers (near `blur_ub1`):

```rust
        let scatter_blur_ub1 = passes::create_uniform_buffer(&device, 48);
        let scatter_blur_ub2 = passes::create_uniform_buffer(&device, 48);
        let combine_ub = passes::create_uniform_buffer(&device, 16);
```

g) Add all new fields to the struct initializer at the end of the constructor (`core_tex, scatter_blur_pipeline, combine_pipeline, combine_layout, scatter_blur_ub1, scatter_blur_ub2, combine_ub`).

- [ ] **Step 4: Add a combine bind-group helper**

If `passes.rs` has `make_blend_bind_group`, add a sibling `make_combine_bind_group` there:

```rust
pub fn make_combine_bind_group(
    device: &Device, layout: &BindGroupLayout,
    base: &TextureView, sampler: &Sampler, scatter: &TextureView,
    core: &TextureView, ub: &Buffer,
) -> BindGroup {
    device.create_bind_group(&BindGroupDescriptor {
        label: Some("combine_bind_group"),
        layout,
        entries: &[
            BindGroupEntry { binding: 0, resource: BindingResource::TextureView(base) },
            BindGroupEntry { binding: 1, resource: BindingResource::Sampler(sampler) },
            BindGroupEntry { binding: 2, resource: BindingResource::TextureView(scatter) },
            BindGroupEntry { binding: 3, resource: BindingResource::TextureView(core) },
            BindGroupEntry { binding: 4, resource: ub.as_entire_binding() },
        ],
    })
}
```

- [ ] **Step 5: Rewrite the halation block in `renderer.rs`**

Replace the entire `// --- Halation ---` block (from `if self.params.halation_enabled() {` through its closing `}` and `swap!();`) with:

```rust
        // --- Halation ---
        if self.params.halation_enabled() {
            let amount = self.params.halation_amount();
            let radius = self.params.halation_radius();
            let consts = crate::render_constants::render_constants();
            let base_sigma = radius * consts.blur_sigma_factor;
            let cs = consts.halation_channel_sigma;
            let sig = [base_sigma * cs[0], base_sigma * cs[1], base_sigma * cs[2]];
            let psf = consts.halation_psf;

            // Threshold (or plain downsample) -> core_tex
            if self.params.halation_highlights_only() {
                self.write_uniform(&self.threshold_ub, &[consts.halation_threshold[0], consts.halation_threshold[1], 0.0, 0.0]);
                let bg = passes::make_std_bind_group(
                    &self.device, &self.std_layout,
                    &current_tex!().create_view(&TextureViewDescriptor::default()),
                    &self.sampler, &self.threshold_ub,
                );
                passes::run_pass(&mut encoder, &self.threshold_pipeline, &bg,
                    &self.core_tex.create_view(&TextureViewDescriptor::default()));
            } else {
                self.write_uniform(&self.blur_ub1, &[0.0, 0.0, 0.001, 0.0]);
                let bg = passes::make_std_bind_group(
                    &self.device, &self.std_layout,
                    &current_tex!().create_view(&TextureViewDescriptor::default()),
                    &self.sampler, &self.blur_ub1,
                );
                passes::run_pass(&mut encoder, &self.blur_pipeline, &bg,
                    &self.core_tex.create_view(&TextureViewDescriptor::default()));
            }

            // Per-channel H scatter: core_tex -> half_b
            self.write_uniform(&self.scatter_blur_ub1, &[
                1.0 / half_w as f32, 0.0, 0.0, 0.0,
                sig[0], sig[1], sig[2], 0.0,
                psf[0][0], psf[0][1], psf[1][0], psf[1][1],
            ]);
            let h_bg = passes::make_std_bind_group(
                &self.device, &self.std_layout,
                &self.core_tex.create_view(&TextureViewDescriptor::default()),
                &self.sampler, &self.scatter_blur_ub1,
            );
            passes::run_pass(&mut encoder, &self.scatter_blur_pipeline, &h_bg,
                &self.half_b.create_view(&TextureViewDescriptor::default()));

            // Per-channel V scatter: half_b -> half_a
            self.write_uniform(&self.scatter_blur_ub2, &[
                0.0, 1.0 / half_h as f32, 0.0, 0.0,
                sig[0], sig[1], sig[2], 0.0,
                psf[0][0], psf[0][1], psf[1][0], psf[1][1],
            ]);
            let v_bg = passes::make_std_bind_group(
                &self.device, &self.std_layout,
                &self.half_b.create_view(&TextureViewDescriptor::default()),
                &self.sampler, &self.scatter_blur_ub2,
            );
            passes::run_pass(&mut encoder, &self.scatter_blur_pipeline, &v_bg,
                &self.half_a.create_view(&TextureViewDescriptor::default()));

            // Ring extraction + additive recombine: base + amount*max(scatter - ring*core, 0)
            self.write_uniform(&self.combine_ub, &[amount, consts.halation_ring, 0.0, 0.0]);
            let combine_bg = passes::make_combine_bind_group(
                &self.device, &self.combine_layout,
                &current_tex!().create_view(&TextureViewDescriptor::default()),
                &self.sampler,
                &self.half_a.create_view(&TextureViewDescriptor::default()),
                &self.core_tex.create_view(&TextureViewDescriptor::default()),
                &self.combine_ub,
            );
            passes::run_pass(&mut encoder, &self.combine_pipeline, &combine_bg,
                &other_tex!().create_view(&TextureViewDescriptor::default()));
            swap!();
        }
```

> `write_uniform` currently takes `&[f32; 4]` style slices in some call sites; confirm its signature accepts a `&[f32]` of length 12/4. If it is hard-typed to `[f32; 4]`, generalize it to `&[f32]` (it just does `queue.write_buffer(buf, 0, bytemuck::cast_slice(data))`).

- [ ] **Step 6: Remove `halation_hue` / `halation_saturation` from `params.rs`**

Delete these two methods from `packages/wgpu/src/params.rs`:

```rust
    pub fn halation_hue(&self) -> f32 {
        self.num("halation-hue", 0.04) * 360.0
    }

    pub fn halation_saturation(&self) -> f32 {
        self.num("halation-saturation", 1.0)
    }
```

(Their only callers were the old halation block, now removed.)

- [ ] **Step 7: Build the sidecar and run the tests**

Run: `cargo build --manifest-path packages/wgpu/Cargo.toml` then `bun test packages/cli/__tests__/gpu/halation.test.ts`
Expected: PASS — all five assertions. If `red scatters wider than blue` is borderline at `BLOCK_HI + 7`, sample one px closer/further rather than changing coefficients; isotropy and ring should pass cleanly.

- [ ] **Step 8: Commit**

```bash
git add packages/wgpu/src/renderer.rs packages/wgpu/src/params.rs packages/wgpu/src/passes.rs packages/cli/__tests__/gpu/halation.test.ts
git commit -m "feat(halation): per-channel scatter ring in export renderer (#48)"
```

---

## Task 4: TS preview renderer (mirror parity)

Mirror the Rust changes in the TS renderer. No headless test for WebGPU here; verify by build + existing UI tests, and the behaviour matches the now-passing sidecar tests because both use the same shaders/constants.

**Files:**
- Modify: `packages/ui/app/gpu/renderer.ts`

- [ ] **Step 1: Import the new constants**

Find the existing import of `HALATION_THRESHOLD, BLUR_SIGMA_FACTOR` from the render-constants module and extend it:

```ts
import { HALATION_THRESHOLD, BLUR_SIGMA_FACTOR, HALATION_CHANNEL_SIGMA, HALATION_PSF, HALATION_RING } from "@hance/core/render-constants";
```

(Match the exact existing import specifier/path used in this file for the other two constants.)

- [ ] **Step 2: Add shader source imports + pipelines**

Where the other `*_FRAG` shader strings are imported and pipelines created (`renderer.ts:163-175`), add the two new shaders and pipelines, following the existing import mechanism for WGSL in this file:

```ts
const scatterBlurPipeline = createFullscreenPipeline(device, FULLSCREEN_VERT, SCATTER_BLUR_FRAG, stdLayout, INTERMEDIATE_FORMAT);
const combinePipeline = createFullscreenPipeline(device, FULLSCREEN_VERT, HALATION_COMBINE_FRAG, combineLayout, INTERMEDIATE_FORMAT);
```

- [ ] **Step 3: Add the combine bind group layout + helper**

Add a layout factory next to `createBlendLayout` (`renderer.ts:41`):

```ts
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
```

Build it near `blendLayout` (`renderer.ts:137`): `const combineLayout = createCombineLayout(device);`

Add the helper next to `makeBlendBindGroup` (`renderer.ts:230`):

```ts
function makeCombineBindGroup(baseTex: GPUTexture, scatterTex: GPUTexture, coreTex: GPUTexture, ub: GPUBuffer): GPUBindGroup {
  return device.createBindGroup({
    layout: combineLayout,
    entries: [
      { binding: 0, resource: baseTex.createView() },
      { binding: 1, resource: sampler },
      { binding: 2, resource: scatterTex.createView() },
      { binding: 3, resource: coreTex.createView() },
      { binding: 4, resource: { buffer: ub } },
    ],
  });
}
```

- [ ] **Step 4: Add `coreTex` texture and uniform buffers**

Near `halfA`/`halfB` creation (`renderer.ts:147-148`):

```ts
const coreTex = createTexture(device, halfW, halfH, INTERMEDIATE_FORMAT);
```

Near the uniform buffers (`renderer.ts:184-195`):

```ts
const scatterBlurUB1 = createUniformBuffer(device, 48);
const scatterBlurUB2 = createUniformBuffer(device, 48);
const combineUB = createUniformBuffer(device, 16);
```

Add `coreTex.destroy();` next to `halfA.destroy()` (`renderer.ts:590`).

- [ ] **Step 5: Rewrite the halation block**

Replace the entire `// --- Halation ---` block (`renderer.ts:343-384`) with:

```ts
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
          runPass(encoder, thresholdPipeline, makeStdBindGroup(current, thresholdUB), coreTex.createView());
        } else {
          device.queue.writeBuffer(blurUB1, 0, new Float32Array([0, 0, 0.001, 0]));
          runPass(encoder, blurPipeline, makeStdBindGroup(current, blurUB1), coreTex.createView());
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
        runPass(encoder, scatterBlurPipeline, makeStdBindGroup(coreTex, scatterBlurUB1), halfB.createView());

        // Per-channel V scatter: halfB → halfA
        device.queue.writeBuffer(scatterBlurUB2, 0, new Float32Array([
          0, 1.0 / halfH, 0, 0,
          sigR, sigG, sigB, 0,
          p0[0], p0[1], p1[0], p1[1],
        ]));
        runPass(encoder, scatterBlurPipeline, makeStdBindGroup(halfB, scatterBlurUB2), halfA.createView());

        // Ring extraction + additive recombine → other
        device.queue.writeBuffer(combineUB, 0, new Float32Array([amount, HALATION_RING, 0, 0]));
        runPass(encoder, combinePipeline, makeCombineBindGroup(preHalation, halfA, coreTex, combineUB), other.createView());
        swap();
      }
    }
```

- [ ] **Step 6: Build the UI and run UI tests**

Run: `bun run --cwd packages/ui build` (or the repo's UI build script) then `bun test packages/ui/__tests__/`
Expected: builds clean; existing UI tests pass (after Task 5 fixes the `halation-hue` default assertion — if running before Task 5, `server.test.ts` will still reference it, so run that file after Task 5).

- [ ] **Step 7: Commit**

```bash
git add packages/ui/app/gpu/renderer.ts
git commit -m "feat(halation): mirror per-channel scatter ring in preview renderer (#48)"
```

---

## Task 5: Remove `halation-hue` / `halation-saturation` params

Hard removal (decided). After this, passing either flag is an unknown-flag error.

**Files:**
- Modify: `packages/core/src/schema.ts`
- Modify: `packages/core/src/types.ts`
- Modify: `packages/core/src/presets.ts`
- Modify: `packages/ui/__tests__/server.test.ts`
- Test: `packages/cli/__tests__/cli.test.ts`

- [ ] **Step 1: Write the failing test (unknown flag rejected)**

Add to `packages/cli/__tests__/cli.test.ts` (match the file's existing arg-parsing test style; if it asserts on a thrown error or a non-zero parse result, mirror that):

```ts
test("halation-hue is no longer a recognized flag", () => {
  expect(() => parseArgs(["in.mov", "--halation-hue", "0.1"])).toThrow();
});
```

(Use whatever parse entry point the other tests in this file use — e.g. `parseArgs` / `parseCliArgs`. If unknown flags currently warn rather than throw, assert the warning/rejection behaviour the codebase actually implements.)

- [ ] **Step 2: Run to verify it fails**

Run: `bun test packages/cli/__tests__/cli.test.ts -t "halation-hue"`
Expected: FAIL — the flag is still accepted (derived from schema).

- [ ] **Step 3: Remove schema entries**

In `packages/core/src/schema.ts`, delete these two lines (`schema.ts:87-88`):

```ts
      { key: "halation-saturation", label: "Tint Strength", type: "range", min: 0, max: 1, step: 0.01, default: 1, description: "Tint strength" },
      { key: "halation-hue", label: "Hue", type: "range", min: 0, max: 1, step: 0.01, default: 0.04, description: "Tint hue 0-1 (~red-orange)" },
```

- [ ] **Step 4: Remove from `HalationOptions` type**

In `packages/core/src/types.ts`, delete the `saturation` and `hue` lines from the `HalationOptions` interface (`types.ts:19-26`), leaving:

```ts
export interface HalationOptions {
  enabled: boolean;
  amount: number;
  radius: number;
  highlightsOnly: boolean;
}
```

- [ ] **Step 5: Remove from `presets.ts`**

In `packages/core/src/presets.ts`, delete these two lines (`presets.ts:132-133`):

```ts
    saturation: Number(merged["halation-saturation"]),
    hue: Number(merged["halation-hue"]),
```

- [ ] **Step 6: Fix `server.test.ts`**

In `packages/ui/__tests__/server.test.ts`, delete the assertion (`server.test.ts:59`):

```ts
      expect(data["halation-hue"]).toBe(getDefaults()["halation-hue"]);
```

- [ ] **Step 7: Run the full affected suites**

Run: `bun test packages/core packages/cli/__tests__/cli.test.ts packages/ui/__tests__/server.test.ts`
Expected: PASS — including the new unknown-flag test. Then run the GPU halation suite again to confirm nothing regressed: `bun test packages/cli/__tests__/gpu/halation.test.ts` → PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/core/src/schema.ts packages/core/src/types.ts packages/core/src/presets.ts packages/ui/__tests__/server.test.ts packages/cli/__tests__/cli.test.ts
git commit -m "feat(halation): remove halation-hue and halation-saturation params (#48)"
```

---

## Task 6: Full verification

- [ ] **Step 1: Run the entire test suite**

Run: `bun test`
Expected: all pass.

- [ ] **Step 2: Build both renderers**

Run: `bun run build` and `cargo build --manifest-path packages/wgpu/Cargo.toml`
Expected: both succeed.

- [ ] **Step 3: Manual preview check (user)**

Launch the UI, enable halation on a frame with bright highlights, and confirm a warm halo *rings* the highlight edges (not a filled wash), with no hue control present. Confirm export (sidecar) matches preview.

- [ ] **Step 4: Open the PR**

```bash
git push -u origin feat/per-channel-scatter-halation
gh pr create --title "feat(halation): per-channel scatter ring (#48)" --body "Closes #48. Replaces tint-painted bloom with a warm edge ring from per-channel R/G/B scatter, recombined additively in linear light. Removes halation-hue/halation-saturation. Mirrors across both renderers; new constants in render.json. See docs/superpowers/specs/2026-06-03-per-channel-scatter-halation-design.md."
```

---

## Self-review notes

- **Spec coverage:** linear-light additive recombine (Task 2 combine shader, Tasks 3–4); per-channel sigma (Task 2 scatter-blur + constants Task 1); 2-Gaussian PSF (Task 2); ring extraction (Task 2 combine); energy-weighted threshold (reused, Tasks 3–4); param removal (Task 5); mirror parity (Tasks 3–4 share shaders/constants); test-first (Task 3); isotropy guard (Task 3 test). All covered.
- **Deviation:** new `scatter-blur.frag.wgsl` instead of editing `blur.frag.wgsl` (bloom shares the latter) — documented above.
- **Uniform layout:** `ScatterBlurParams` is 48 bytes (vec2 dir + vec2 pad + vec4 sigma + vec2 psf0 + vec2 psf1); JS/Rust both write 12 f32. `CombineParams` is 16 bytes (amount, ring, vec2 pad); both write 4 f32.
- **Type consistency:** `makeCombineBindGroup`/`make_combine_bind_group`, `combineLayout`/`combine_layout`, `coreTex`/`core_tex`, `scatterBlurPipeline`/`scatter_blur_pipeline` used consistently per language.
```
