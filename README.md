# Hance

> ⚠️ **Alpha software.** Mainly tested on macOS by a single developer. Expect rough edges on Linux/Windows, and pin versions if you rely on it.

**Preview a cinematic film look in the browser, then batch-apply it from the CLI.** GPU-accelerated colour, halation, bloom, grain, vignette, split-tone, aberration, and camera shake — one binary, no plugins, no subscriptions.

📖 **[Full documentation →](packages/docs/src/content/docs/getting-started/introduction.md)**

---

## Quick start

```sh
# Install (needs ffmpeg on your PATH)
brew install ffmpeg
curl -fsSL https://github.com/Orva-Studio/hancer/releases/latest/download/install.sh | sh

# Preview presets on your footage and dial in a look
hance ui video.mp4

# Batch-apply a look from the CLI
hance video.mp4 --preset my-look
```

Looks saved from the UI live in `~/.hance/presets/` and are referenced by name. See the [Installation](packages/docs/src/content/docs/getting-started/installation.md) and [Quick Start](packages/docs/src/content/docs/getting-started/quick-start.md) guides for details.

## Documentation

- [Introduction](packages/docs/src/content/docs/getting-started/introduction.md) — what hance is and who it's for
- [Commands & options](packages/docs/src/content/docs/cli/commands.md) — full CLI reference
- [Effects](packages/docs/src/content/docs/cli/effects.md) — the effect pipeline and per-effect flags
- [Output quality](packages/docs/src/content/docs/cli/output-quality.md) — codecs, CRF, ProRes
- [Config file](packages/docs/src/content/docs/cli/config-file.md) — `.hancerc.json` defaults
- [Looks](packages/docs/src/content/docs/looks/built-in.md) — built-in and custom `.hlook` presets
- [AI agent usage](packages/docs/src/content/docs/agent/overview.md) — drive hance from Claude Code in plain English

## Build from source

Only needed to hack on hance itself — the released CLI binary requires none of this.

```sh
git clone https://github.com/Orva-Studio/hancer.git
cd hancer
bun install
bun run build    # wgpu sidecar + UI bundle + CLI binary → ./hance
bun test         # unit tests
```

Requires [Bun](https://bun.sh), [Rust](https://rustup.rs), and [FFmpeg](https://ffmpeg.org). See [ARCHITECTURE.md](ARCHITECTURE.md) for the monorepo layout and rendering pipeline.

## License

[FSL-1.1-Apache-2.0](LICENSE) — free to use, modify, and redistribute. Cannot be used to build a competing product or service. Converts to Apache 2.0 on April 1, 2028.
