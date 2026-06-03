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

## What about AI color tools?

Hance can be AI-driven: the [`/hance` agent skill](/docs/agent/overview/) runs a render→read→adjust loop, picking looks and tuning parameters by inspecting preview stills. A few other tools use AI for color, in different shapes:

- **[Colourlab AI](https://colourlab.ai/)** is a desktop app and NLE plugin (Resolve, Premiere, Final Cut) for colorists: AI auto-balancing, shot matching across a timeline, reference grading, plus grain and film emulation in its Pro tier. Like hance, it processes media locally.
- **[Imagen](https://imagen-ai.com/video/)** is a cloud auto-editor: you upload footage and a hosted model makes the grading and editing calls for you.

The line isn't "AI or not": it's **how you run it**. Hance is a headless CLI and agent that runs upstream of any editor: scriptable, batchable, with no GUI or timeline required, and it bundles a broader film-texture set (halation, bloom, aberration, shake) alongside grading and grain in one pass. Reach for a GUI colorist app like Colourlab when you're grading shot-by-shot inside an NLE; reach for hance when you want grading and texture applied programmatically, in batch, or by an agent.
