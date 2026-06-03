---
title: Hance vs Alternatives
description: How hance compares to Colourlab AI, Dehancer, and FilmBox.
---

There are several tools for adding film looks to video. Here's how hance stacks up.

## Feature comparison

| | Hance | Colourlab AI | Dehancer | FilmBox |
|---|---|---|---|---|
| **CLI, scriptable & batchable** | ✓ | — | — | — |
| **Runs without an NLE** | ✓ | ✓ | — | — |
| **Browser-based UI** | ✓ | — | — | — |
| **AI agent integration** | ✓ | — | — | — |
| **AI auto-grading / shot match** | — | ✓ | — | — |
| **Film stock emulation** | 40+ looks | Neural Looks | 60+ stocks | 90+ stocks |
| **Optical effects** (halation, bloom, aberration, vignette) | ✓ | — | ✓ | — |
| **Film grain** | ✓ | ✓ (Pro) | ✓ | ✓ |
| **Camera shake** | ✓ | — | — | — |
| **Split toning** | ✓ | — | — | — |
| **Pricing** | Free / $49 Pro | $15/mo+ | $99–$399 | $89–$129 |
| **NLE plugin** (Premiere, Resolve, etc.) | — | ✓ | ✓ | ✓ |

## When to use hance

- You want to apply film looks **without opening an NLE**: process clips from the terminal and import them already graded.
- You need **batch automation**: script it, cron it, or plug it into a CI/ingest pipeline.
- Your editor **doesn't support plugins**: CapCut, iMovie, ScreenFlow, and browser-based editors have no plugin system. Hance works upstream of any editor.
- You want a **single tool** that combines colour grading and film texture (halation, grain, bloom, aberration, shake) in one pass.
- You're a **developer** building an app that needs film effects programmatically.

## When to use alternatives

- You need **real-time preview inside your NLE**: Colourlab AI, Dehancer, and FilmBox integrate directly into Premiere, Resolve, and Final Cut as plugins.
- You want **AI auto-grading and shot matching**: Colourlab AI balances and matches shots across a timeline for you.
- You want a **larger library of film stocks**: Dehancer and FilmBox offer more stock emulations.
- You need **per-clip adjustments within a timeline**: NLE plugins let you tweak each clip on the timeline without round-tripping.

## What about AI color tools?

Hance can be AI-driven too. The [`/hance` agent skill](/docs/agent/overview/) runs a render, read, adjust loop: it picks looks and tunes parameters by inspecting preview stills.

Other tools use AI for color in different shapes:

- **[Colourlab AI](https://colourlab.ai/)** (in the table above) auto-balances and matches shots inside an NLE, locally.
- **[Imagen](https://imagen-ai.com/video/)** goes further into automation. It is a cloud auto-editor: you upload footage and a hosted model makes the grading and editing calls for you.

The real difference isn't "AI or not." It's **how you run it**:

- Hance is a headless CLI and agent that runs upstream of any editor.
- It is scriptable and batchable, with no GUI or timeline required.
- It bundles a broader film-texture set (halation, bloom, aberration, shake) alongside grading and grain in one pass.

Reach for a GUI colorist app when you're grading shot-by-shot inside an NLE. Reach for hance when you want grading and texture applied programmatically, in batch, or by an agent.
