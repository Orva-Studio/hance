---
title: Free vs Pro
description: What's included in the free tier and what requires a pro license.
---

Hance works out of the box on the free tier. Pro unlocks additional codecs, batch processing, and premium looks.

:::note
Pro is **coming soon**. The features below outline what a pro license will include. It's not yet available for purchase.
:::

## Feature comparison

| Feature | Free | Pro |
|---------|------|-----|
| All effects (color, halation, bloom, grain, etc.) | ✓ | ✓ |
| 40+ built-in film stock looks | ✓ | ✓ |
| Custom `.hlook` files | ✓ | ✓ |
| Browser UI (`hance ui`) | ✓ | ✓ |
| Config file (`.hancerc.json`) | ✓ | ✓ |
| H.264 codec | ✓ | ✓ |
| H.265 codec | ✓ | ✓ |
| ProRes codec | — | ✓ |
| Batch processing (multiple inputs) | — | ✓ |
| Premium looks | — | ✓ |
| AI features (coming soon) | — | ✓ |
| Mac app (coming soon) | — | ✓ |

## Pro codecs

The free tier supports H.264 and H.265 output. Pro unlocks:

- **ProRes**: near-lossless 4:2:2 10-bit output for professional editing workflows

Using a pro codec on the free tier will show an error:

```
Codec "prores" requires a pro license — upgrade at hance.video/pro
```

## Export presets and codecs

Some export presets select pro codecs automatically:

| Export preset | Codec | Tier required |
|---------------|-------|---------------|
| `low` | H.264 | Free |
| `medium` | H.264 | Free |
| `high` | H.265 | Free |
| `max` | ProRes | Pro |

You can override the codec on any export preset with `--codec h264` to stay on the free tier:

```bash
hance video.mp4 --export high --codec h264
```

## Batch processing

Processing multiple files in one command requires a pro license:

```bash
# Pro only
hance clip1.mp4 clip2.mp4 clip3.mp4 -o graded/

# Or use a glob pattern
hance clip*.mp4 -o graded/
```

On the free tier, process one file at a time.

## Premium looks

Some looks in the `presets/premium/` directory require a pro license. These are marked with `"premium": true` in the `.hlook` file.