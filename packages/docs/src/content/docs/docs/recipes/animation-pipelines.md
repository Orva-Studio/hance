---
title: Animation Pipelines
description: Add film texture to Remotion, Manim, and FFmpeg renders by piping their output through hance.
---

Programmatic animation tools produce clean, sterile output, exactly what film texture fixes. Because hance operates on any standard video file, it slots in as a post-processing step after your render: grade the colour and add halation, grain, and bloom that no LUT can reproduce.

The pattern is always the same: render with your tool, then run hance on the file it produced:

```bash
hance <rendered-file> --preset <look> --export high
```

Output is written alongside the input with a `_hanced` suffix (e.g. `out.mp4` → `out_hanced.mp4`), or wherever you point `-o`.

## Remotion

Remotion writes to `out/video.mp4` by default (or the path you pass to `--output`):

```bash
npx remotion render src/index.ts MyComp out/video.mp4
hance out/video.mp4 --preset cinestill-800t --export high -o final.mp4
```

## Manim

There are two Manim projects with different commands; point hance at whichever file your build produced.

**Manim Community** (`pip install manim`) writes to `media/videos/<file>/<quality>/<SceneName>.mp4`:

```bash
manim -qh scene.py MyScene
hance media/videos/scene/1080p60/MyScene.mp4 --preset portra-400 -o MyScene_film.mp4
```

**ManimGL** ([3b1b/manim](https://github.com/3b1b/manim)) uses `manimgl` with `-w` to write a file; the output directory is set in your `custom_config.yml`:

```bash
manimgl scene.py MyScene -w
hance <output-from-custom_config>/MyScene.mp4 --preset portra-400 -o MyScene_film.mp4
```

:::tip
Animation renders are often crisp and high-contrast. A subtle look reads better than a heavy one: start with a low grain amount and a gentle halation, then build up:

```bash
hance render.mp4 --preset portra-400 --grain-iso 650 --halation-amount 0.3
```
:::

## Raw FFmpeg output

Any file FFmpeg can produce, hance can grade; there's nothing tool-specific about it:

```bash
ffmpeg -i frames/%04d.png -c:v libx264 -pix_fmt yuv420p render.mp4
hance render.mp4 --preset kodachrome-64
```

## Batch a sequence of renders

If your pipeline emits many clips, apply one consistent look across all of them in a single command:

```bash
hance renders/*.mp4 --preset portra-400 -o ./graded/
```

:::note
Batch processing (multiple inputs in one command) requires a Pro license. On the free tier, process one file at a time. See [Free vs Pro](/docs/free-vs-pro/).
:::
