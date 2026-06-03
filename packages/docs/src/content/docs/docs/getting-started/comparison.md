---
title: Hance vs Alternatives
description: How hance compares to FilmConvert, Dehancer, and FilmBox.
---

There are several tools for adding film looks to video. Here's how hance stacks up.

## Feature comparison

| | Hance | FilmConvert | Dehancer | FilmBox |
|---|---|---|---|---|
| **Standalone CLI** | ✓ | — | — | — |
| **No NLE required** | ✓ | — | — | — |
| **Browser-based UI** | ✓ | — | — | — |
| **Batch processing** | ✓ | — | — | — |
| **Scriptable / automatable** | ✓ | — | — | — |
| **Self-hostable** | ✓ | — | — | — |
| **AI agent integration** | ✓ | — | — | — |
| **GPU-accelerated** | ✓ | ✓ | ✓ | ✓ |
| **Film stock emulation** | 40+ looks | 19 stocks | 60+ stocks | 90+ stocks |
| **Halation** | ✓ | ✓ | ✓ | — |
| **Bloom** | ✓ | — | ✓ | — |
| **Film grain** | ✓ | ✓ | ✓ | ✓ |
| **Chromatic aberration** | ✓ | — | ✓ | — |
| **Vignette** | ✓ | ✓ | ✓ | — |
| **Camera shake** | ✓ | — | — | — |
| **Split toning** | ✓ | — | — | — |
| **Pricing** | Free / $49 Pro | $149+ | $99–$399 | $89–$129 |
| **Plugin (Premiere, Resolve, etc.)** | — | ✓ | ✓ | ✓ |

## When to use hance

- You want to apply film looks **without opening an NLE**: process clips from the terminal and import them already graded.
- You need **batch automation**: script it, cron it, or plug it into a CI/ingest pipeline.
- Your editor **doesn't support plugins**: CapCut, iMovie, ScreenFlow, and browser-based editors have no plugin system. Hance works upstream of any editor.
- You want a **single tool** that combines colour grading and film texture (halation, grain, bloom, aberration, shake) in one pass.
- You're a **developer** building an app that needs film effects programmatically.

## When to use alternatives

- You need **real-time preview inside your NLE**: FilmConvert, Dehancer, and FilmBox integrate directly into Premiere, Resolve, and Final Cut as plugins.
- You want a **larger library of film stocks**: Dehancer and FilmBox offer more stock emulations.
- You need **per-clip adjustments within a timeline**: NLE plugins let you tweak each clip on the timeline without round-tripping.

## What about AI auto-editors?

Hance can be AI-driven too. The [`/hance` agent skill](/docs/agent/overview/) lets an AI assistant run a render→read→adjust loop, picking looks and tuning parameters by inspecting preview stills. The difference from cloud tools like [Imagen](https://imagen-ai.com/video/) is where the work happens and what you get back:

- **Cloud auto-editors** are a black box: you upload footage, a hosted model decides, and you get a rendered file. Fast and hands-off, but you can't see or reproduce the pipeline, and your footage leaves your machine.
- **Hance** keeps the engine **local and deterministic**. Whether you or an agent drives it, the look is expressed as explicit looks and parameters you can read, version, and re-run: same input, same output, every time, offline, with no per-render cost. AI assists by choosing those parameters, not by hiding them.

Reach for a cloud auto-editor when you want a result without touching the controls. Reach for hance when you want the look to be transparent and reproducible, with or without an agent in the loop.
