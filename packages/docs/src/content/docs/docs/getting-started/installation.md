---
title: Installation
description: How to install hance.
---

The only system requirement is FFmpeg (see [below](#requirements)).

## Run with npx (no install)

The quickest way to try hance, no install step, on macOS or Linux:

```bash
npx @orva-studio/hance video.mp4
```

This downloads and runs the latest hance on demand. Swap `npx` for `bunx` if you use [Bun](https://bun.sh).

:::caution[FFmpeg required]
hance needs **FFmpeg** (and `ffprobe`) on your PATH: `brew install ffmpeg`, `apt install ffmpeg`, or see [Requirements](#requirements). Without it, hance exits with an error. (`/hance setup` checks this for you.)
:::

## With an AI agent

Install the skill into your agent with [skills.sh](https://skills.sh):

```bash
npx skills add orva-studio/hance
```

This registers the `/hance` skill so your agent can drive hance in plain English. Then run the setup command, which verifies FFmpeg and gets you ready in one step:

```
> /hance setup
```

Harnesses that don't use skills.sh can read the same instructions straight from the CLI at runtime — no install — via `bunx @orva-studio/hance skills`. See [AI Agent Usage](/docs/agent/overview/) for details.

## Install a persistent binary

For frequent CLI use, install `hance` to your PATH so you don't re-download it each run:

```bash
curl -fsSL https://hance.video/install.sh | sh
```

This installs `hance` and its GPU sidecar to `~/.hance/bin`. The installer detects macOS (arm64/x64) or Linux (x64/arm64). No Bun, Rust, or Node required.

## Requirements

Hance requires **FFmpeg** and **ffprobe** on your system.

### macOS

```bash
brew install ffmpeg
```

### Linux

```bash
sudo apt install ffmpeg
```

:::note
Windows is not currently supported; hance ships binaries for macOS (arm64/x64) and Linux (x64/arm64) only.
:::

## Verify

```bash
hance --version
```

## Desktop app (macOS, beta)

If you're on macOS, you can also run hance as a native [Desktop App](/docs/desktop-app/) instead of the CLI plus browser editor. It's currently in beta; download it from the [GitHub Releases page](https://github.com/Orva-Studio/hance/releases).
