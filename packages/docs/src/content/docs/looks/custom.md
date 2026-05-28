---
title: Custom Looks
description: Create and share your own .hlook files.
---

## The `.hlook` format

A `.hlook` file is a JSON file containing effect parameters:

```json
{
  "hance_version": "0.3.1",
  "name": "My Look",
  "description": "Warm faded vintage feel",
  "keywords": ["warm", "faded", "vintage"],
  "params": {
    "exposure": 0.1,
    "contrast": 1.1,
    "fade": 0.15,
    "white-balance": 5500,
    "subtractive-sat": 0.85,
    "halation-amount": 0.35,
    "halation-hue": 0.06,
    "grain-amount": 0.2,
    "grain-size": 1,
    "vignette-amount": 0.35
  }
}
```

Only include parameters you want to change from the default. Anything omitted falls back to the default look.

## Where to put looks

Hance searches for looks in two directories:

1. **User looks** — `~/.hance/presets/`
2. **Built-in looks** — ships with the binary

User looks take precedence over built-in looks with the same name.

## Using a custom look

Save your `.hlook` file to `~/.hance/presets/` and reference it by name:

```bash
hance video.mp4 --preset my-look
```

## Creating a look from the UI

Use `hance ui` to dial in your settings visually, then export the look as a `.hlook` file.

## Sharing looks

`.hlook` files are plain JSON and can be shared, version-controlled, or distributed as part of a project. Drop them in `~/.hance/presets/` on any machine.
