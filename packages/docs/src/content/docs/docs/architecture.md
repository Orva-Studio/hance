---
title: Architecture
description: "How hance is built: monorepo structure, GPU rendering, and IPC."
---

Hance is a Bun workspaces monorepo with four packages:

| Package | Purpose |
|---------|---------|
| `packages/core` | Pure TypeScript effect/preset/arg logic |
| `packages/cli` | The compiled `hance` binary entry point |
| `packages/ui` | Browser-based interactive preview |
| `packages/wgpu` | Rust wgpu sidecar binary |

## GPU rendering

Effects are rendered on the GPU via the native Rust [wgpu](https://wgpu.rs) sidecar. WGSL shaders are shared between the browser preview and the Rust sidecar, so what you see in `hance ui` is exactly what you get from the CLI.

## IPC protocol

The sidecar communicates with the Bun CLI over stdin/stdout using a length-prefixed JSON init message followed by raw RGBA frames. This keeps the CLI lightweight while offloading pixel work to the GPU.

## Processing pipeline

Every file passes through the same effect chain:

1. Input LUT (log → Rec.709 conversion, e.g. V-Log, skipped unless set)
2. Color grading (exposure, contrast, white balance, saturation, fade)
3. Halation (highlight glow)
4. Chromatic aberration (lens fringing)
5. Bloom (soft light diffusion)
6. Film grain
7. Vignette
8. Split toning
9. Camera shake

The optical effects (halation, chromatic aberration, bloom, grain, and vignette) run in **linear light** (the chain is bracketed by sRGB↔linear conversions, with 16-bit float intermediates) so glows and blurs spread physically correct energy. Color grading, split toning, and camera shake stay in perceptual (gamma) space.

All effects compose into a single GPU render graph, with no intermediate files and no re-encoding chains.
