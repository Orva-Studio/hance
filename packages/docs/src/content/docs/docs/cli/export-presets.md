---
title: Export Presets
description: Quick quality presets for different output needs.
---

Export presets are shortcuts that configure codec, CRF, and encoding speed in one flag:

```bash
hance video.mp4 --export high
```

## Available presets

| Preset | Use case |
|--------|----------|
| `low` | Quick previews, small file size |
| `medium` | Balanced quality and size |
| `high` | High quality, larger files |
| `max` | Maximum quality |

`high` and `max` print a warning about larger file sizes.

## Overriding export presets

You can override individual settings on top of an export preset:

```bash
hance video.mp4 --export high --codec prores
hance video.mp4 --export medium --crf 20
```

Explicit `--codec`, `--crf`, and `--encode-preset` flags take precedence over the export preset values.

## Pro codecs

ProRes and H.265 codecs require a pro license. Using `--export` levels that select these codecs will fail on the free tier.
