---
title: Commands
description: All hance CLI commands and global options.
---

## `hance <input> [options]`

The default command. Applies film effects to one or more video/image files.

```bash
hance video.mp4
hance video.mp4 photo.jpg another.mov -o output-dir/
```

### Output

| Flag | Description | Default |
|------|-------------|---------|
| `--output`, `-o` | Output file (single input) or directory (multiple inputs) | `<input>_hanced.<ext>` |
| `--codec` | Output codec: `h264`, `h265`, `prores` | `h264` |
| `--encode-preset` | FFmpeg preset: `fast`, `medium`, `slow` | `medium` |
| `--crf` | Quality (0–51, lower is better; ignored for ProRes) | `18` |
| `--export` | Export quality preset: `low`, `medium`, `high`, `max` | none |
| `--blend` | Blend with original (0–1) | `1` |

### Presets

| Flag | Description | Default |
|------|-------------|---------|
| `--preset` | Load a look file by name | `default` |

### General

| Flag | Description |
|------|-------------|
| `--no-config` | Ignore config file |
| `--help`, `-h` | Show help |
| `--version`, `-v` | Print version |

## `hance ui [file] [options]`

Launch the browser-based editor.

```bash
hance ui
hance ui video.mp4
hance ui --port 8080 --no-open
```

| Flag | Description | Default |
|------|-------------|---------|
| `--port` | Server port | `4800` |
| `--no-open` | Don't open browser automatically | opens browser |

## `hance preview <input> [options]`

Generate a quick preview frame.

## `hance preset <subcommand>`

Manage looks/presets.

## Batch processing

Pass multiple inputs to process them in sequence:

```bash
hance clip1.mp4 clip2.mp4 clip3.mp4 -o graded/
```

Batch processing requires a pro license.
