---
title: "A free, source-available alternative to Dehancer and FilmConvert"
description: "Dehancer, FilmConvert and FilmBox are great GUI plugins. Hance is the free, CLI-first, scriptable, reproducible film-look tool for batch and CI workflows."
pubDate: 2026-06-20
author: "Richard Oliver Bray"
heroImage: "/blog/dehancer-filmconvert-alternative-hero.png"
heroAlt: "Hance command line film look compared with Dehancer, FilmConvert and FilmBox"
about: "How Hance compares to Dehancer, FilmConvert and FilmBox as a free, CLI-first film-look tool"
draft: true
---

Dehancer, FilmConvert and FilmBox are good. They're also paid GUI plugins that live inside your NLE. If what you actually want is a **film look you can run from the command line, batch across a folder, and reproduce frame-for-frame in CI** - none of them do that. Hance does.

This is an honest comparison. Hance isn't trying to out-emulate a colorist's plugin. It's a different tool for a different job: **workflow, not fidelity.**

## What only Hance does

- **Command line first.** `hance input.mp4 --preset my-look`. No app to open, no timeline to babysit.
- **Batch + CI.** Loop a whole folder, drop it in a pipeline, run it on a server with no GUI.
- **Reproducible.** Same input + same flags = the same frame, every time. Version your look as text.
- **No host NLE.** It's one binary. No Resolve, Premiere, or Final Cut required.
- **Agent-friendly.** It ships its own agent skill, so an AI harness can drive it in plain English.
- **Free / source-available.** FSL-1.1-Apache-2.0 (converts to Apache 2.0 in 2028). No subscription.

## Honest comparison

| | **Hance** | Dehancer | FilmConvert | FilmBox |
|---|---|---|---|---|
| Price | **Free / source-available** | Paid (perpetual or subscription, per host) | Paid (one-time perpetual) | Paid (subscription or perpetual) |
| Runs from CLI | **Yes** | No | No | No |
| Batch / CI / scriptable | **Yes** | No | No | No |
| Reproducible (input+flags → same frame) | **Yes** | No | No | No |
| Needs a host NLE | **No** | Yes | Yes | Yes |
| Agent / AI-harness friendly | **Yes** | No | No | No |
| GUI preview | Browser preview (`hance ui`) | Yes (polished) | Yes (polished) | Yes (polished) |
| Film-stock breadth / emulation fidelity | Good, growing | **Excellent** | **Excellent** | **Excellent** |
| Maturity | Alpha, mac-first | Mature | Mature | Mature |

Where they win, credit where it's due: **if your job is matching a specific film stock with the deepest possible emulation fidelity, inside a colour grade, Dehancer and FilmBox are the better tool.** That's their moat and Hance isn't fighting it. Hance is alpha and mac-first today, with a smaller stock library.

Where Hance wins: **everything about workflow.** If you batch, script, automate, or just resent paying a subscription to add grain and halation to a clip, this is the one built for you. (Curious how the halation actually works? See [halation in FFmpeg, and in one Hance flag](/blog/halation-ffmpeg/).)

## Price-shopping? Read this

If you got here searching "Dehancer price" or "film emulation free" - Hance is free to use, modify, and redistribute. There's no trial clock and no subscription. You preview a look in the browser, save it, and apply it from the CLI for as many clips as you like.

## Try it now

```bash
# no install - needs ffmpeg on your PATH
npx @orva-studio/hance video.mp4

# preview looks and dial one in
hance ui video.mp4

# batch-apply your saved look
hance video.mp4 --preset my-look
```

[Get Hance on GitHub →](https://github.com/Orva-Studio/hance) · [Docs →](/docs/getting-started/introduction/) · [How Hance compares →](/docs/getting-started/comparison/)
