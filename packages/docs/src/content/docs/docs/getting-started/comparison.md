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

Tools like [Imagen](https://imagen-ai.com/video/) take a different approach: you upload footage and an AI model makes the grading and editing decisions for you in the cloud. That's a good fit if you want a hands-off, automated result and don't mind sending footage to a third party.

Hance is the opposite by design: **deterministic and local**. You choose the look, and the same input produces the same output every time: offline, scriptable, with no upload, account, or per-render cost. Use an AI auto-editor when you want the tool to decide; use hance when you want to.
