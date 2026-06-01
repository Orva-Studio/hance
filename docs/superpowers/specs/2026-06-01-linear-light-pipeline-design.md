# Linear-Light Pipeline — Design

Date: 2026-06-01
Branch: `feat/linear-light-pipeline`
Status: Approved design, pre-implementation

## Problem

Hance's effects run their math directly on gamma-encoded (sRGB) pixel values.
Operations that simulate light transport — halation, bloom, chromatic
aberration, grain, vignette — are physically only correct on *linear* light,
where a pixel value is proportional to actual photon energy. Running them on
gamma-encoded values understates the energy of bright tones, so glows and
blurs come out too dark and muddy compared to real film.

This branch makes the light-transport effects operate in linear light. It also
establishes the correct color space for two planned follow-up features that are
meaningless outside linear light: per-channel H&D film density curves and
luminance-dependent grain.

## Goal & Scope

**In scope:** Run the contiguous light-transport group — halation, aberration,
bloom, grain, vignette — in linear light. Move intermediate ping-pong textures
to `rgba16float` to preserve shadow precision.

**Out of scope (intentionally perceptual):** Color grade
(`color-settings.frag.wgsl`), split-tone, bleach-bypass, and camera shake stay
in their current gamma space so existing tuned presets and snapshot tests do
not shift. Shake is geometric (pixel displacement) and is color-space agnostic;
it stays outside the linear bracket for simplicity.

## Background: current pass order

From `packages/ui/app/gpu/renderer.ts`:

```
color → [ halation → aberration → bloom → grain → vignette ] → split-tone → shake → final blit
```

- Halation and bloom are threshold → blur → screen-blend sub-chains.
- Each effect is individually toggleable.
- Intermediate textures (`texA`, `texB`, `halfA`, `halfB`) are currently
  8-bit (`rgba8unorm` / preferred canvas format).
- The shaders do no color-space conversion; they operate on values as decoded
  from FFmpeg rawvideo (gamma-encoded sRGB).

## Architecture

### Boundary placement

Insert two conversion passes that bracket the light-transport group:

- **Decode (sRGB → linear):** immediately *before* halation.
- **Encode (linear → sRGB):** immediately *after* vignette, *before*
  split-tone.

The bracketed group runs in linear; everything outside (color grade upstream,
split-tone/shake downstream) stays perceptual.

Both conversion passes run **unconditionally whenever any light-group effect is
enabled**, so the boundary never depends on which individual effects are
toggled. If the entire light group is disabled, neither conversion runs (the
frame passes through untouched).

### Conversion shader

Add a single shader `colorspace.frag.wgsl` with a `direction` uniform
(`0 = sRGB→linear`, `1 = linear→sRGB`) rather than two near-duplicate shaders.
Conversion is applied per-channel to RGB; alpha is passed through untouched.

Use the **standard sRGB piecewise transfer function** (linear segment near
black + 2.4 gamma exponent), not a pure 2.2 power curve. This matches the sRGB
data FFmpeg's rawvideo decode produces and avoids a near-black mismatch.

```
// sRGB → linear
c <= 0.04045 ? c / 12.92 : pow((c + 0.055) / 1.055, 2.4)

// linear → sRGB
c <= 0.0031308 ? c * 12.92 : 1.055 * pow(c, 1/2.4) - 0.055
```

### Texture precision

Change the intermediate ping-pong textures (`texA`, `texB`, `halfA`, `halfB`)
from 8-bit to `rgba16float`. Linearizing into 8-bit storage would crush shadow
values into too few code values and cause banding; 16-bit float carries far
more precision than the 8-bit output needs.

The final blit still targets the 8-bit canvas / output texture. Because the
encode pass already runs before split-tone, the values reaching the final blit
are gamma-encoded and convert to 8-bit cleanly.

### Renderer parity (resolved)

There are two renderers consuming the effect chain:

- **Preview:** `packages/ui/app/gpu/renderer.ts` (TypeScript, in-browser
  WebGPU), imported by `App.tsx` etc.
- **Export:** `packages/wgpu/src/renderer.rs` (Rust/wgpu), compiled to the
  `hance-gpu` sidecar binary that `packages/gpu/src/wgpu-renderer.ts` spawns.

**Shared:** Both renderers load the *same* `.wgsl` files from
`packages/core/shaders/` (TS via import, Rust via `include_str!`). The new
`colorspace.frag.wgsl` is therefore written **once** and used by both.

**Duplicated:** Pass ordering and the intermediate texture format constant
(`format` in TS, `FORMAT = Rgba8Unorm` in Rust) live separately in each
renderer. Cross-language consolidation into one module is not feasible.

**Approach:** Mirror the identical boundary + format change in both
`renderer.ts` and `renderer.rs`, and add a parity guard against drift:

- A shared golden set of sRGB↔linear values tested against both the TS and Rust
  transfer-function helpers, ensuring both implement the identical curve.
- Extend the existing Rust smoke test (`packages/wgpu/tests/smoke.rs`) to assert
  halation output changes with the linear bracket enabled.
- A TS renderer integration check via the existing agent-browser WebGPU harness
  (`packages/ui/__tests__`).

A full cross-renderer per-pixel comparison is intentionally avoided: the TS path
requires in-browser WebGPU, making a combined-process pixel diff fragile. The
golden-curve test guards the most drift-prone surface (the transfer math)
cheaply; per-renderer integration tests guard the boundary placement.

### Pipeline/format consequence

Each render pipeline is bound to one target texture format. Today a single color
pipeline is reused for both the first color pass (into an intermediate texture)
and the final blit (into the 8-bit canvas/output texture). Once intermediates
become `rgba16float` while the output stays 8-bit, these two uses need
**separate pipelines**: an intermediate-targeting color pipeline (`rgba16float`)
and a blit pipeline targeting the output format. The conversion-shader pipelines
also target `rgba16float` (they run inside the linear bracket, into
intermediates).

## Testing

1. **Transfer round-trip (unit):** `linearToSrgb(srgbToLinear(x)) ≈ x` across
   the 0–1 range within float epsilon.
2. **Known-value (unit):** sRGB `0.5` → linear `≈ 0.214`; verifies the curve
   shape, not just round-trip symmetry.
3. **Renderer integration:** a fixture frame through halation with the boundary
   enabled, asserting brighter / more physically-plausible highlight bloom than
   the pre-change gamma-space result (sampled-pixel or snapshot assertion).
4. **Perceptual-pass regression:** confirm split-tone and bleach-bypass produce
   byte-identical output to the pre-change pipeline, proving they stayed out of
   the linear bracket.

All tests use `bun:test`. Shader-math unit tests (1, 2) extract the transfer
formula into a testable TS reference matching the WGSL, since WGSL itself is
not directly unit-testable.

## Risks & mitigations

- **Banding from precision loss** → mitigated by `rgba16float` intermediates.
- **Unintended look shift in existing presets** → light-transport effects *will*
  look different (that is the point); perceptual passes must not (covered by
  test 4). Existing presets that lean on the old muddy halation may want
  re-tuning as a follow-up, but this branch does not change their parameters.
- **Preview/export divergence** → addressed by the renderer-parity planning
  prerequisite.
- **16-bit float memory cost** → ~2x intermediate texture memory; acceptable for
  the precision gain.

## Follow-up (not this branch)

- Per-channel H&D film density curves (depends on linear light).
- Luminance-dependent, ISO-scaled grain (depends on linear light).
