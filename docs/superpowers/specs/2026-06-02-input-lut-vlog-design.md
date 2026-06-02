# Input LUT (free V-Log → Rec.709) — Design

Date: 2026-06-02
Status: approved, light process (spec + TDD on core + final visual check)

## Goal

Add a **pre-LUT** slot to the hance effect chain with one genuinely useful
free profile: **V-Log → Rec.709** (Panasonic). A `rec709` identity profile is
the default no-op. This is the free slice of the larger LUT pipeline design;
all Pro work (additional log profiles, custom `.cube` post-LUT, `.hlook`
embedding, render-time tiering gate) is deferred to a GitHub issue.

## Why V-Log specifically

A pre-LUT un-flattens "log" footage so the rest of the chain operates on a
normal image instead of grey mush. Doing this correctly requires knowing the
input log curve, so a generic "rec709" pre-LUT can only honestly mean
identity. We ship one real curve — V-Log — because the target audience (film
students on Panasonic/Lumix) shoots V-Log and needs the conversion on step
one. Adding more profiles later is just another data array, no new code.

## Scope

In scope (free):
- Input/pre-LUT only. Profiles: `rec709` (identity, default) and `vlog`.
- Runs as the first pass in the chain, before Color Settings.
- All three surfaces: core, CLI, Rust `wgpu` sidecar, UI WebGPU preview.
- `.hlook` gains an optional `preLut` string field.

Deferred to issue (Pro): post-LUT custom `.cube` import + parser, log profiles
`slog3`/`clog`/`logc`, `.hlook` `postLut` (reference + embedded), and the
render-time tiering gate. No paywall code is needed in this slice because both
shippable profiles are free.

## Effect chain (updated)

```
pre-LUT → colorSettings → halation → aberration → bloom → grain → vignette → splitTone → cameraShake
```

## Single source of truth for LUT data

`packages/core/src/lut-profiles.ts` generates the 33×33×33 LUT as a
`Float32Array` (length 33³×3, RGB-major, R fastest) in TypeScript:

- `rec709`: identity — output equals input grid coordinate.
- `vlog`: Panasonic V-Log reverse OETF (linearize) → Rec.709 OETF (gamma encode).

This is the only place the math lives. To guarantee the preview matches the
export pixel-for-pixel, the **baked array is shipped to both renderers** rather
than re-deriving the formula in Rust:

- Sidecar: the array is added to the existing `{ width, height, params }` init
  JSON (`packages/gpu/src/export.ts`, `wgpu-renderer.ts`). ~108k floats, one
  time at init.
- UI: imports the array directly from core.

## Shader + GPU plumbing

Shared `packages/core/shaders/lut.frag.wgsl`: samples a 3D LUT texture using the
input pixel RGB as UVW, with the standard half-texel scale/offset. A new
`lut_layout` bind group (2D input texture + sampler + 3D LUT texture) is added
to both the Rust passes (`passes.rs`/`renderer.rs`) and the UI
(`passes.ts`/`renderer.ts`), each uploading the 33³ array as an `rgba`/`rgba16f`
3D texture. The pre-LUT pass is skipped entirely when `no-input-lut` is set or
the profile is `rec709` (identity) — byte-for-byte passthrough, matching the
existing light-group bracketing pattern.

## Schema / types / flags

- `schema.ts`: new `inputLut` group, first in `EFFECT_SCHEMA`.
  - `enableKey: "no-input-lut"`.
  - option `input-lut-profile`: select, choices `["rec709","vlog"]`, default `rec709`.
- `types.ts`: `InputLutOptions { enabled; profile: "rec709"|"vlog" }`, added to
  `FilmOptions` as `inputLut`.
- CLI (`effect-flags.ts`): `--input-lut <rec709|vlog>`, `--vlog` (sugar for
  `--input-lut vlog`), `--no-input-lut`. Update `KNOWN_FLAGS`, `BOOLEAN_FLAGS`,
  help text, parser.
- `.hlook` (`presets.ts`): optional top-level `preLut` string saved/loaded.

## Tests (TDD on core)

- LUT generation: `rec709` is exact identity at grid corners; `vlog` maps a
  known mid-grey V-Log code value to its expected Rec.709 value (spot check),
  array length and range sane.
- `.hlook` round-trip preserves `preLut`.
- CLI flag parsing: `--input-lut vlog`, `--vlog`, `--no-input-lut`, and
  rejection of an invalid profile.
- E2E: `hance --input-lut vlog` produces different output than `--no-input-lut`.

GPU pass correctness is verified by the final manual visual check (preview a
V-Log clip and confirm it looks normal, and that export matches preview).
