# Hance

> ⚠️ **Alpha software.** Mainly tested on macOS by a single developer. Expect rough edges on Linux, and pin versions if you rely on it. Windows is not supported; binaries ship for macOS (arm64/x64) and Linux (x64/arm64) only.

**Preview a cinematic film look in the browser, then batch-apply it from the CLI.** GPU-accelerated colour, halation, bloom, grain, vignette, split-tone, aberration, and camera shake — one binary, no plugins, no subscriptions.

📖 **[Full documentation →](https://hance.video/docs/getting-started/introduction/)**

---

## Quick start

```sh
# Try it with no install (needs ffmpeg on your PATH: `brew install ffmpeg`)
npx @orva-studio/hance video.mp4    # or `bunx` if you use Bun

# Or install a persistent binary to ~/.hance/bin
curl -fsSL https://hance.video/install.sh | sh

# Preview presets on your footage and dial in a look
hance ui video.mp4

# Batch-apply a look from the CLI
hance video.mp4 --preset my-look
```

Looks saved from the UI live in `~/.hance/presets/` and are referenced by name. See the [Installation](https://hance.video/docs/getting-started/installation/) and [Quick Start](https://hance.video/docs/getting-started/quick-start/) guides for details.

## Agent skill

The `hance` binary carries its own agent skill so any AI harness gets version-matched instructions at runtime:

```sh
hance skills              # the router / entry doc (for AI harnesses)
hance skills list         # available subcommand + reference docs
hance skills get refine   # print one doc
hance skills path         # extract the docs to a local dir
```

## Documentation

- [Introduction](https://hance.video/docs/getting-started/introduction/) — what hance is and who it's for
- [Commands & options](https://hance.video/docs/cli/commands/) — full CLI reference
- [Effects](https://hance.video/docs/cli/effects/) — the effect pipeline and per-effect flags
- [Output quality](https://hance.video/docs/cli/output-quality/) — codecs, CRF, ProRes
- [Config file](https://hance.video/docs/cli/config-file/) — `.hancerc.json` defaults
- [Looks](https://hance.video/docs/looks/built-in/) — built-in and custom `.hlook` presets
- [AI agent usage](https://hance.video/docs/agent/overview/) — drive hance from Claude Code in plain English

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
