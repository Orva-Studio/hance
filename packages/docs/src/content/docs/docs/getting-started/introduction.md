---
title: Introduction
description: What hance is and how it works.
---

:::caution
Hance is alpha software. It has mainly been tested on macOS by a single developer. Expect rough edges on Linux, and pin versions if you use it in anything important. Windows is not supported.
:::

:::tip[Using an AI agent?]
These docs are machine-readable: point your agent at [`/llms.txt`](/llms.txt), or append `.md` to any page URL for raw Markdown. See [AI Agent Usage](/docs/agent/overview/#machine-readable-docs).
:::

Hance is a single-binary CLI that applies cinematic film effects to video and images. Preview a look in the browser with `hance ui`, then batch-apply it from the CLI. GPU-accelerated colour, halation, bloom, grain, vignette, split-tone, aberration, and camera shake. One binary, no plugins, no subscriptions.

## Who is this for?

- **Creators whose editors don't support LUTs**: CapCut, ScreenFlow, iMovie, browser-based editors, and mobile NLEs have no LUT pipeline. Hance gives you cinematic film looks that weren't possible before. Process your clips before you import them.
- **Creators who want more than a LUT**: halation, grain, bloom, aberration, and camera shake are spatial effects that LUTs literally cannot do. Hance bundles colour grading and film texture into one step, no plugins required.
- **Automation pipelines**: agencies, studios, or platforms that need to batch-apply a consistent look across hundreds of clips with no GUI in the loop.
- **Developers** building apps that need film effects programmatically: social video platforms, AI video pipelines, content tools.

Hance is not a replacement for professional colour grading. It's the tool you reach for when you don't want to open a colour grading app at all.

## How it works

Run `hance` on any video or image file and it applies a chain of film effects in a single pass:

```bash
hance video.mp4
```

This produces `video_hanced.mp4` next to the original, with the default film look applied.

## Effects pipeline

Every file passes through these stages:

1. **Color grading**: exposure, contrast, white balance, saturation, fade
2. **Halation**: soft glow around highlights (a real film optical artifact)
3. **Chromatic aberration**: subtle color fringing at edges
4. **Bloom**: soft light diffusion
5. **Film grain**: luminance-dependent, ISO-scaled noise with controllable size
6. **Vignette**: darkened edges
7. **Split toning**: color shifts in shadows and highlights
8. **Camera shake**: subtle motion for a handheld feel

Each effect can be tuned individually via CLI flags, or disabled entirely with `--no-<effect>`.

## Looks

Hance ships with 40+ built-in looks modeled after real film stocks: Portra 400, Cinestill 800T, Kodachrome 64, and more. Apply one with:

```bash
hance video.mp4 --preset portra-400
```

You can also create and share your own `.hlook` files.

## License

Hance is licensed under [FSL-1.1-Apache-2.0](https://github.com/Orva-Studio/hance/blob/main/LICENSE): free to use, modify, and redistribute. Cannot be used to build a competing product or service. Converts to Apache 2.0 on April 1, 2028.
