---
title: Skill Commands
description: Detailed reference for each /hance subcommand.
---

The `/hance` skill routes to one of six subcommands based on what you ask for.

## `/hance setup`

Verifies your environment is ready: checks for Bun (or Node as fallback), FFmpeg, and shows example commands. Use this the first time you run hance from your AI agent.

```
> /hance setup
```

## `/hance run`

Apply a specific preset to a single file. The simplest path: name a look and a file.

```
> /hance run portra-400 on my-video.mp4
> /hance run cinestill-800t sunset.mov
```

## `/hance try`

Explore looks for a file. The agent picks 3 candidate presets, renders still previews, and opens a side-by-side comparison UI in your browser so you can pick your favourite and fine-tune it.

```
> /hance try a warm 70s look on sunset.mp4
> /hance try some looks for interview.mov
```

You can also provide a reference image to match:

```
> /hance try match this reference photo.jpg on my-video.mp4
```

## `/hance refine`

Perfect a single look on a single file. Where `try` explores options for you to pick
from, `refine` takes one direction and dials it in — adjusting effects like grain,
halation, vignette, white balance, and split tone on top of a base preset. The agent
iterates on a still preview, judging each render against your intent, then offers to
apply the result and save it as a reusable preset.

```
> /hance refine portra-400 on sunset.jpg, classic film but less punchy
> /hance refine the surf shot — add grain and a teal-orange split tone
> /hance refine match the warmth of this reference.jpg
```

See [Grading workflow](/docs/agent/grading/) for how the agent evaluates and tunes a look.

## `/hance batch`

Apply one preset to multiple files at once.

```
> /hance batch apply portra-400 to everything in ./footage
> /hance batch cinestill-800t clip*.mp4
```

:::note
Batch processing requires a pro license. On the free tier, process one file at a time. See [Free vs Pro](/docs/free-vs-pro/).
:::

## `/hance ui`

Open the browser-based editor for interactive preview and tweaking.

```
> /hance ui
> /hance ui video.mp4
```
