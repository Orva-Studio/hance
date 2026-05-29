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

The `/hance` skill routes to one of five subcommands based on what you ask for. See the [Skill Commands](/docs/agent/commands/) page for full details.

| Command | Description |
|---------|-------------|
| `/hance setup` | Verify your environment is ready |
| `/hance run` | Apply a preset to a single file |
| `/hance try` | Explore and compare looks in a browser UI |
| `/hance batch` | Apply one preset to multiple files |
| `/hance ui` | Open the browser-based editor |

## Machine-readable docs

These docs are published in formats built for LLMs and agents:

- **[`/llms.txt`](/llms.txt)** — an index of the documentation, following the [llms.txt convention](https://llmstxt.org/), with links to every page.
- **Plain Markdown** — append `.md` to any page URL to fetch its raw Markdown (frontmatter stripped). For example, this page is available at `/agent/overview.md`.

Point your agent at `/llms.txt` to let it discover and pull in the relevant pages on demand.
