---
title: Effects
description: All effect parameters and their defaults.
---

Every effect is enabled by default and can be disabled with `--no-<effect>`. Parameters can be overridden individually.

## Input LUT

A pre-grade LUT applied as the very first pass, before color grading. Use it to convert flat log footage to Rec.709 so the rest of the chain works on a normal (un-flattened) image.

| Flag | Values | Default | Description |
|------|--------|---------|-------------|
| `--input-lut` | `rec709`, `vlog` | `rec709` | Input color profile |
| `--vlog` | boolean | off | Shorthand for `--input-lut vlog` (Panasonic V-Log) |

`rec709` is a pass-through and adds no processing. Disable explicitly with `--no-input-lut`.

## Color settings

Control the base color grade applied before any optical effects.

| Flag | Range | Default | Description |
|------|-------|---------|-------------|
| `--exposure` | -2 to 2 | `0` | Exposure adjustment |
| `--contrast` | 0–3 | `1` | Contrast multiplier |
| `--highlights` | -1 to 1 | `0` | Highlight compression |
| `--fade` | 0–1 | `0` | Fade / lift blacks |
| `--white-balance` | 1000–15000 | `6500` | Color temperature in Kelvin |
| `--tint` | -100 to 100 | `0` | Green-magenta tint |
| `--subtractive-sat` | 0–3 | `1` | Subtractive saturation |
| `--richness` | 0–3 | `1` | Color richness |
| `--bleach-bypass` | 0–1 | `0` | Bleach bypass amount |

Disable with `--no-color-settings`.

## Halation

Simulates the glow that occurs when bright light passes through film emulsion and reflects off the base. The warm edge ring emerges from per-channel (R/G/B) scatter recombined in linear light; there is no tint colour to set.

| Flag | Range | Default | Description |
|------|-------|---------|-------------|
| `--halation-amount` | 0–1 | `0.25` | Halation strength |
| `--halation-radius` | 1–100 | `4` | Blur radius |
| `--halation-highlights-only` | boolean | `true` | Restrict to highlights |

Disable with `--no-halation`.

## Chromatic aberration

Simulates lens color fringing at frame edges.

| Flag | Range | Default | Description |
|------|-------|---------|-------------|
| `--aberration` | 0–1 | `0.3` | Aberration amount |

Disable with `--no-aberration`.

## Bloom

Soft light diffusion that wraps around bright areas.

| Flag | Range | Default | Description |
|------|-------|---------|-------------|
| `--bloom-amount` | 0–1 | `0.25` | Bloom strength |
| `--bloom-radius` | 1–100 | `10` | Blur radius |

Disable with `--no-bloom`.

## Grain

Adds organic film grain.

| Flag | Range | Default | Description |
|------|-------|---------|-------------|
| `--grain-amount` | 0–1 | `0.125` | Grain intensity |
| `--grain-size` | 0–5 | `0` | Particle size (0 = finest, higher = coarser) |
| `--grain-saturation` | 0–1 | `0.3` | Color saturation of grain |
| `--grain-defocus` | 0–5 | `1` | Image defocus amount |
| `--grain-iso` | 50–3200 | `400` | Virtual ISO; scales grain amplitude (400 = neutral) |

Disable with `--no-grain`.

## Vignette

Darkens the edges of the frame.

| Flag | Range | Default | Description |
|------|-------|---------|-------------|
| `--vignette-amount` | 0–1 | `0.25` | Vignette strength |
| `--vignette-size` | 0–1 | `0.25` | Vignette size |

Disable with `--no-vignette`.

## Split tone

Applies color toning to shadows and highlights.

| Flag | Range | Default | Description |
|------|-------|---------|-------------|
| `--split-tone-amount` | 0–1 | `0` | Toning amount |
| `--split-tone-shadow-hue` | 0–360 | `30` | Shadow hue in degrees |
| `--split-tone-highlight-hue` | 0–360 | `210` | Highlight hue in degrees |
| `--split-tone-highlight-strength` | 0–1 | `0.5` | Highlight tint strength relative to shadows |
| `--split-tone-pivot` | 0–1 | `0.3` | Shadow/highlight pivot |
| `--split-tone-protect-neutrals` | boolean | `false` | Protect neutral colors |

Disable with `--no-split-tone`. Note: split tone amount defaults to `0`, so it's effectively off unless you set it.

:::note
The removed `--split-tone-hue` and `--split-tone-mode` flags (and the matching keys in older `.hlook` files) are still accepted and migrate automatically: shadows take the hue, highlights take the same hue (natural) or its opposite (complementary), and complementary sets highlight strength to `1` to keep the original look.
:::

## Camera shake

Adds subtle motion for a handheld feel.

| Flag | Range | Default | Description |
|------|-------|---------|-------------|
| `--camera-shake-amount` | 0–1 | `0.25` | Shake intensity |
| `--camera-shake-rate` | 0–2 | `0.5` | Shake speed |

Disable with `--no-camera-shake`.
