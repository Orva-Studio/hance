---
title: Installation
description: How to install hance.
---

No Bun, Rust, or Node required — just FFmpeg.

## Install hance

```bash
curl -fsSL https://github.com/Orva-Studio/hancer/releases/latest/download/install.sh | sh
```

This installs `hance` and its GPU sidecar to `~/.hance/bin`. The installer detects macOS (arm64/x64) or Linux (x64/arm64).

Or via npm:

```bash
npx @orva-studio/hance
```

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

### Windows

Download from [ffmpeg.org](https://ffmpeg.org/download.html) and add to your PATH.

## Verify

```bash
hance --version
```
