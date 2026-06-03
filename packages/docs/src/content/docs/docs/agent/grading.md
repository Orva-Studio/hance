---
title: Grading workflow
description: How an AI agent evaluates and dials in a film look with hance.
---

When you ask an agent to make a shot "look like film," it doesn't apply a preset and
stop. Through the `/hance refine` command it works the way a colorist does: render,
look, adjust, repeat. It judges its own output against your intent. This page explains
what's happening so you know what to ask for.

## The loop

The agent renders a **still** preview (never a full video while iterating), reads the
result, names what's wrong, changes a knob or two, and re-renders. Suspected artifacts
get inspected at 1:1. It stops when the frame reads as film, then offers to apply the
look to the whole file and save it as a reusable preset.

## What "film" usually means

A preset applied raw can look punchy and digital. A convincing film look usually adds:

- **Lifted blacks** so shadows aren't pure digital black.
- **Highlight rolloff** for a gentle shoulder instead of clipped whites.
- **Restrained saturation.** Oversaturation is the most common digital tell.
- **Grain** for texture.
- **Halation**, a soft glow bleeding from highlights.
- **A subtle vignette** to frame the subject.

## Split tone, and matching mood

A complementary split tone (warm highlights, cool teal shadows, the classic
"teal-orange") gives action, landscape, and city shots cinematic separation. But it
fights warm, intimate scenes like a sunset portrait, which want consistent warmth
instead. Part of refining is matching the toning to the mood rather than applying it
everywhere.

## What to ask for

Be specific about the direction and let the agent handle the knobs:

```
> /hance refine portra-400 on sunset.jpg, classic film but less punchy
> /hance refine the surf shot, warmer, more grain, slightly stronger vignette
> /hance refine match the look of this reference.jpg
```

When the agent has tuned a preset rather than used it stock, it will say so. The look
is "portra-400, tuned," and it can save your tuned version under its own name.
