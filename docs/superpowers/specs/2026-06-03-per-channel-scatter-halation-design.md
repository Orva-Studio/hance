# Per-channel scatter halation (#48)

## Problem

Halation currently reads as a uniform warm **bloom** rather than the warm **edge
ring** real film shows. Both renderers do: threshold highlights → single
symmetric Gaussian blur → screen-blend with a hardcoded hue tint
(`halation-hue`). The orange ring is *painted on* by a tint, not produced by how
light scatters, so it fills rather than rings.

The win we want is the perceptual cue done right — **not** a physical
light-transport solver. The reference,
[ComfyUI-Darkroom](https://github.com/jeremieLouvaert/ComfyUI-Darkroom)
(`nodes/halation.py`, MIT), is the *same* threshold→blur→tint structure; we port
its per-channel/PSF *coefficients* only, not its Capture-One-derived film-stock
data.

## Goal / acceptance

- A warm/orange halo emerges from **per-channel scatter** with **no hue param**.
- The halo **rings** highlight edges rather than filling a disk.
- **Mirror parity**: identical behaviour across the TS preview renderer and the
  Rust export renderer; new constants live in one shared place (no TS/Rust
  drift, per #61).
- Built **test-first** against the headless sidecar.

This builds on the landed linear-light bracket (commits `5896a8a`, `b4195f5`);
the halation pass already runs inside it.

## Approach

The new pipeline, all inside the existing linear-light bracket:

```
energy-weighted threshold (core highlights)
  → per-channel scatter blur (R widest, G mid, B narrowest;
      each channel = 2-Gaussian PSF: sharp core + long tail)
  → ring extraction: ring = max(scatter − ring_strength·core, 0)
  → additive recombine: result = base + amount·ring
```

Why each piece:

1. **Linear light.** Re-exposure is additive energy: de-gamma → scatter → add →
   re-gamma. Already bracketed — we recombine by **addition**, not screen blend.
2. **Per-channel scatter radii.** Blurring R/G/B with different sigmas (R widest,
   B smallest) makes the colored halo fall out on its own. `halation-hue` is
   removed.
3. **PSF with a tail.** Real scatter is a sharp core + long tail, approximated by
   a weighted sum of 2 Gaussians at different scales (cheap — folded into the
   same blur loop).
4. **Ring, not fill.** Subtract the thresholded core from the scatter so the
   result is an edge ring rather than a filled disk.
5. **Energy-weighted threshold, additive recombine.** Brighter highlights
   scatter proportionally more: smoothstep luminance threshold (already present),
   recombined as addition in linear space.

## Parameter surface

User-facing params (kept):

| Param | Role |
|---|---|
| `halation-amount` | strength of additive recombine |
| `halation-radius` | base radius; per-channel sigmas derived from it |
| `halation-highlights-only` | threshold gating on/off |

**Removed (hard removal — decided):** `halation-hue` and `halation-saturation`.
They only fed the tint that no longer exists. Passing them becomes an
unknown-flag error. This breaks any saved config/preset that set them; acceptable
per the decision to take a clean break now.

Full removal touchpoints (all must be updated):

- `packages/core/src/schema.ts:87-88` — drop both schema entries.
- `packages/core/src/types.ts:19` — drop `saturation` and `hue` from
  `HalationOptions`.
- `packages/core/src/presets.ts:132-133` — drop both fields from the built
  `HalationOptions`.
- `packages/ui/app/gpu/renderer.ts:377-378` — drop hue/sat uniform writes.
- `packages/wgpu/src/renderer.rs:403-404` and `packages/wgpu/src/params.rs:81-86`
  — drop `halation_hue()` / `halation_saturation()`.
- `packages/ui/__tests__/server.test.ts:59` — drop the `halation-hue` default
  assertion.

## Derived constants → `packages/core/constants/render.json`

Single source consumed by TS (`render-constants.ts` import) and Rust
(`include_str!` of the same JSON via `render_constants.rs`). Add:

```json
{
  "halationThreshold": [0.65, 0.75],
  "blurSigmaFactor": 0.5,
  "halationChannelSigma": [1.0, 0.62, 0.38],
  "halationPsf": [[1.0, 0.7], [2.6, 0.3]],
  "halationRing": 1.0
}
```

- `halationChannelSigma` — per-channel multipliers on the base sigma (`R, G, B`),
  R widest. Ported as coefficients from the Darkroom reference ratios.
- `halationPsf` — list of `[scale, weight]` Gaussians summed per channel: a sharp
  core (`scale 1.0`, weight 0.7) plus a long tail (`scale 2.6`, weight 0.3).
  Weights normalize in-shader.
- `halationRing` — core-subtraction strength: `0` = filled disk, `1` = full ring.

Both `render-constants.ts` and `render_constants.rs` gain typed accessors for the
three new keys, mirrored. The existing `render-constants.test.ts` drift guard
extends to cover them.

## Shader changes (`packages/core/shaders/`, shared by both renderers)

- **`blur.frag.wgsl`** — extend `sigma: f32` → `sigma: vec3f` (per-channel) and
  make the kernel a weight-normalized sum of the two PSF Gaussians. Stays
  separable (H then V); same pass count. Each channel accumulates with its own
  sigma so R/G/B spread independently. PSF scales/weights passed via uniform
  (sourced from `halationPsf`).
- **New `halation-combine.frag.wgsl`** — bindings: `base`, `scatter`, `core`,
  and a params uniform (`amount`, `ring_strength`). Computes
  `ring = max(scatter − ring_strength·core, 0)` and returns
  `base + amount·ring`. Replaces the screen-blend **for halation only**; bloom
  keeps `screen-blend.frag.wgsl`.
- **`threshold.frag.wgsl`** — unchanged (already energy-weighted via smoothstep).
  Its output (the core highlights) is now retained and fed to both the blur and
  the combine pass.

### Pass/buffer plan (per renderer, mirrored)

The current pass uses two half-res buffers (`halfA`, `halfB`). The ring needs the
core retained while the scatter is computed, so we need the core in a buffer that
survives the H/V blur. Plan:

1. threshold `current` → `coreTex` (half-res, new dedicated buffer).
2. H-blur `coreTex` → `halfB` with `vec3` sigma + PSF.
3. V-blur `halfB` → `halfA` (this is `scatter`).
4. combine(`base=preHalation`, `scatter=halfA`, `core=coreTex`) → `other`; swap.

Add one half-res texture (`coreTex`) in each renderer's allocation block
(`renderer.ts` ~line 147, `renderer.rs` ~line 192) and destroy it on teardown.

## Testing (test-first)

Extend `packages/cli/__tests__/gpu/halation.test.ts` (headless Rust sidecar). New
assertions, written before implementation:

1. **Warm halo, no hue param.** With only `halation-amount`/`-radius` set, the
   glow just outside a bright block is warm (`R > B`) — the color comes from
   per-channel scatter, not a tint.
2. **Per-channel radius ordering.** Sampling the falloff outward, red persists
   further than green, green further than blue (`R` spread > `G` > `B`).
3. **Ring, not fill.** The annulus just outside the highlight edge is brighter
   (relative to base) than the highlight interior delta — scatter rings the edge.
4. **Isotropy guard.** H and V glow profiles remain byte-for-byte equal (locks in
   the proven-isotropic behaviour so the new `vec3` blur can't regress one axis;
   relates to display bug #68, which is *not* in scope here).

Core/CLI unit tests:

5. Schema no longer exposes `halation-hue` / `halation-saturation`; passing either
   is rejected as an unknown flag.
6. `presets.test.ts` and `server.test.ts` updated for the removed fields.

## Scope / out of scope

- **In scope:** both renderers, shared shaders, shared constants, schema/preset
  cleanup, tests.
- **Out of scope:** the UI preview "radius grows only vertically" display bug
  (filed as #68 — display path, renderer blur proven isotropic).

## Dependency

Builds on #61 (single source of truth for renderer constants), now landed — the
new per-channel constants live in `render.json` so they don't re-introduce
TS/Rust drift.
