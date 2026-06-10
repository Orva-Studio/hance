---
title: Quick Start
description: Get your first hanced video in under a minute.
---

## Basic usage

Apply the default film look to a video:

```bash
hance video.mp4
```

Output: `video_hanced.mp4`

## Choose a look

Apply a specific film stock:

```bash
hance video.mp4 --preset cinestill-800t
```

## Custom output path

```bash
hance video.mp4 -o output.mp4
```

## Tweak individual effects

Override any parameter on top of a preset:

```bash
hance video.mp4 --preset portra-400 --grain-iso 1000 --vignette-amount 0.5
```

## Disable an effect

```bash
hance video.mp4 --no-grain --no-vignette
```

## Process an image

Hance auto-detects images and processes them the same way:

```bash
hance photo.jpg
```

Output: `photo_hanced.jpg`

## Export quality presets

For higher quality output:

```bash
hance video.mp4 --export high
```

Available presets: `low`, `medium`, `high`, `max`.

## Open the UI

Hance includes a browser-based editor:

```bash
hance ui
```

Or open it with a file pre-loaded:

```bash
hance ui video.mp4
```
