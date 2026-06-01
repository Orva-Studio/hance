---
title: Installation
description: How to install hance.
---

The only system requirement is FFmpeg (see [below](#requirements)).

## Run with npx (no install)

The quickest way to try hance — no install step, on macOS or Linux:

```bash
npx @orva-studio/hance video.mp4
```

This downloads and runs the latest hance on demand. Swap `npx` for `bunx` if you use [Bun](https://bun.sh).

:::caution[FFmpeg required]
hance needs **FFmpeg** (and `ffprobe`) on your PATH — `brew install ffmpeg`, `apt install ffmpeg`, or see [Requirements](#requirements). Without it, hance exits with an error. (`/hance setup` checks this for you.)
:::

## With an AI agent

If you drive hance from an AI agent, run the skill's setup command — it verifies FFmpeg and gets you ready in one step:

```
> /hance setup
```

See [AI Agent Usage](/docs/agent/overview/) for installing the skill.

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
Windows is not currently supported — hance ships binaries for macOS (arm64/x64) and Linux (x64/arm64) only.
:::

## Verify

```bash
hance --version
```
