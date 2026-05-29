---
title: Output Quality
description: Choosing the right codec and quality settings for your output.
---

By default, hance encodes output as H.264 with CRF 18. If your source is a high-quality format like ProRes (common with `.mov` files from cameras or editing software), the default H.264 output will be lower quality than the original due to lossy compression and 4:2:0 chroma subsampling.

## Codec comparison

| Codec | Quality | File Size | Compatibility |
|-------|---------|-----------|---------------|
| `h264` (default) | Good (CRF-dependent) | Smallest | Universal |
| `h265` | Better at same CRF | ~30% smaller than h264 | Most modern players |
| `prores` | Near-lossless (4:2:2 10-bit) | Largest | macOS, editing software |

## Examples

```bash
# ProRes output (near-lossless, 4:2:2 10-bit, larger files)
hance video.mov -o output.mov --codec prores

# Lower CRF for higher-quality H.264 (0 = lossless)
hance video.mov -o output.mp4 --crf 8

# H.265 for better quality at similar file sizes
hance video.mov -o output.mp4 --codec h265 --crf 12
```

## Pro codecs

ProRes and H.265 require a pro license. On the free tier, H.264 is the only available codec.
