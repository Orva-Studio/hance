---
title: Default Look
description: What hance applies when you don't specify a preset.
---

When you run `hance video.mp4` without `--preset`, hance loads the built-in `default` look. This is a balanced cinematic starting point, not a neutral pass-through.

## What the default look does

| Effect | Setting | What it does |
|--------|---------|--------------|
| **Color** | All neutral | No color shift: exposure 0, contrast 1, white balance 6500K |
| **Halation** | 0.25 amount, radius 4 | Subtle warm glow around highlights |
| **Chromatic aberration** | 0.3 | Slight color fringing at edges |
| **Bloom** | 0.25 amount, radius 10 | Gentle light diffusion |
| **Grain** | 0.125 amount | Light organic noise |
| **Vignette** | 0.25 amount, 0.25 size | Mild edge darkening |
| **Split tone** | 0 amount | Disabled (amount is zero) |
| **Camera shake** | 0.25 amount, 0.5 rate | Subtle handheld motion |

## The default look is not "no effect"

Even with neutral color settings, the optical effects (halation, aberration, bloom, grain, vignette, camera shake) are all active. To get a clean pass-through, disable them:

```bash
hance video.mp4 --no-halation --no-aberration --no-bloom --no-grain --no-vignette --no-camera-shake
```

## Overriding the default

Any preset you choose replaces the default as the base. CLI flags then override on top:

```bash
# portra-400 as base, with extra grain
hance video.mp4 --preset portra-400 --grain-amount 0.3
```
