---
title: Overview
description: Use hance with an AI agent — describe the look you want in plain English.
---

Hance ships with an [AI agent skill](https://www.skills.sh/) that lets you grade footage using natural language. No CLI knowledge needed — describe the look you want and the agent handles the rest.

## Install the skill

Install via [skills.sh](https://skills.sh):

```bash
npx skills add Orva-Studio/hance
```

Once installed, type `/hance` in your AI agent to get started.

## How it works

The skill uses `bunx @orva-studio/hance` (or `npx` as fallback) under the hood — no global install needed. It automatically detects your runtime and picks the fastest available runner.

## Subcommands

The `/hance` skill routes to one of five subcommands based on what you ask for. See the [Skill Commands](/agent/commands/) page for full details.

| Command | Description |
|---------|-------------|
| `/hance setup` | Verify your environment is ready |
| `/hance run` | Apply a preset to a single file |
| `/hance try` | Explore and compare looks in a browser UI |
| `/hance batch` | Apply one preset to multiple files |
| `/hance ui` | Open the browser-based editor |
