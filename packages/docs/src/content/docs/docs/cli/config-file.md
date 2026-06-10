---
title: Config File
description: Set persistent defaults with .hancerc.json.
---

Instead of passing the same flags every time, save them in a config file.

## Config locations

Hance checks two locations, in order:

1. **Local**: `.hancerc.json` in the current directory (or any parent directory)
2. **Global**: `~/.config/hance/config.json`

The first one found wins. CLI flags always override config values.

## Format

The config file is a JSON object where keys are flag names (without `--`):

```json
{
  "preset": "portra-400",
  "grain-iso": 650,
  "no-camera-shake": true,
  "codec": "h264",
  "crf": 20
}
```

Boolean flags like `no-camera-shake` should be set to `true`.

## Example: project defaults

Create a `.hancerc.json` in your project root to share settings across a team:

```json
{
  "preset": "cinestill-800t",
  "export": "high"
}
```

## Ignoring the config

Skip config file loading with:

```bash
hance video.mp4 --no-config
```
