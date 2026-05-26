---
name: hance
description: Apply cinematic film looks to images/video via the Hance CLI. Use when asked to grade, color, or "make it look like" film.
---

# /hance

A single entry point that routes to one of six subcommands.

## Routing

Pick the subcommand from the user's request. When in doubt, ask.

| User intent | Subcommand | Doc |
|---|---|---|
| "install hance" / "set up hance" | `setup` | `subcommands/setup.md` |
| "apply <preset> to <file>" / "grade with <preset>" | `run` | `subcommands/run.md` |
| "make this look like X" / "match this reference" / "show me some looks for this" | `try` | `subcommands/try.md` |
| "apply X to all of these" / batch a folder | `batch` | `subcommands/batch.md` |
| "open the editor" / "open the UI" | `ui` | `subcommands/ui.md` |

## Runner selection (every subcommand)

Pick one runner per invocation, in order:

1. If `command -v bun` succeeds → use `bunx @orva-studio/hance` (preferred — fast cold-start, cached after first fetch).
2. Else → use `npx @orva-studio/hance`.

There is no compiled-binary install path. Every subcommand must work on a fresh machine; `setup` only verifies Bun + ffmpeg and shows examples.

## Hard rules

- Never invent flags. Only use names listed in `hance --help` or `hance preset --help`.
- Never run a full video render to explore looks — use `hance preview` (still frame) for `try`.
- Windows is unsupported. If `uname -s` reports Windows, stop and tell the user.

## References

- `references/preset-index.md` — `presets/index.json` schema and rebuild contract.
- `references/compare-page.md` — `/compare` route query params and Edit hand-off.

## Replaces

The old `/match-look` skill is gone — its purpose is now served by `/hance try` with a reference image.
