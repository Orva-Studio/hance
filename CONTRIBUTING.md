# Contributing to Hance

Thanks for your interest in improving Hance! This guide covers everything you
need to get a development environment running, make a change, and open a pull
request.

> ⚠️ Hance is **beta software**, mainly tested on macOS by a single developer.
> Contributions that improve Linux/Windows support, test coverage, and docs are
> especially welcome.

## License & contribution terms

Hance is released under [FSL-1.1-Apache-2.0](LICENSE) (converts to Apache 2.0 on
April 1, 2028). By submitting a contribution you agree that your work is
licensed under the same terms. Please don't include code you can't license this
way. Third-party notices live in [`THIRD_PARTY_NOTICES`](THIRD_PARTY_NOTICES).

## Prerequisites

You only need these to hack on Hance itself — the released binary requires none
of them.

- [Bun](https://bun.sh) — runtime, package manager, and test runner
- [Rust](https://rustup.rs) — builds the `wgpu` GPU sidecar
- [FFmpeg](https://ffmpeg.org) — must be on your `PATH` at runtime
  (`brew install ffmpeg`)

## Getting started

```sh
git clone https://github.com/Orva-Studio/hancer.git
cd hancer
bun install
bun run build    # wgpu sidecar + UI bundle + CLI binary → ./hance
bun test         # unit tests
```

Run the CLI from source without building a binary:

```sh
bun run packages/cli/src/cli.ts <input> [options]
# or
bun start <input> [options]
```

## Repository layout

Hance is a Bun-workspace monorepo. See [ARCHITECTURE.md](ARCHITECTURE.md) for the
full rendering pipeline; the short version:

| Package         | Purpose                                          |
| --------------- | ------------------------------------------------ |
| `packages/cli`  | CLI entry point, arg parsing, FFmpeg orchestration |
| `packages/core` | Effect modules and filter-graph building         |
| `packages/gpu`  | GPU export pipeline                               |
| `packages/wgpu` | Rust WebGPU sidecar                              |
| `packages/ui`   | Browser preview UI                               |
| `packages/docs` | Documentation site                               |
| `presets/`      | Built-in `.hlook` looks                          |

### How effects work

Effects are **pure functions** of the form `(inputLabel, options) => { fragment, output }`
— no side effects. They compose, in order, into a single FFmpeg
`-filter_complex` string: `grade → halation → aberration → weave`. Add a new
effect by following the shape of the existing modules in `packages/core`.

## Coding conventions

- **TypeScript only**; prefer function declarations over expressions.
- **Verb-first naming**: `buildFilterGraph`, `parseProgress`.
- Effect modules stay **pure** — return `{ fragment, output }`, no side effects.
- Use the `node:` prefix for Node built-in imports, but prefer Bun-native APIs
  where an equivalent exists.
- No new runtime dependencies beyond Bun, FFmpeg, and Sentry without discussion.

## Testing

All features and bugfixes must ship with tests, and all tests must pass before a
PR is merged.

```sh
bun test                              # all tests
bun test packages/cli/__tests__/e2e/  # end-to-end FFmpeg tests
```

- **Unit tests** live in `packages/*/__tests__/` — cover each module's output
  and CLI arg parsing.
- **E2E tests** live in `packages/cli/__tests__/e2e/` — exercise real FFmpeg
  execution against small fixtures.
- Framework is `bun:test`.

## Commits & pull requests

- Use [Conventional Commits](https://www.conventionalcommits.org):
  `<type>(<scope>): <description>` (e.g. `feat(core): add bloom effect`).
- **Never commit directly to `main`** — always work on a feature branch.
- Keep PRs focused; describe what changed and why, and link any related issue.
- Make sure `bun test` passes and the project builds before requesting review.

## Reporting bugs & requesting features

Open an issue on [GitHub](https://github.com/Orva-Studio/hancer/issues). For
bugs, include your OS, FFmpeg version, the exact command you ran, and the full
output. Minimal reproductions with a small input file help a lot.

## Questions

Not sure where to start? Open a discussion or a draft PR and ask — early
feedback is better than a large change in the wrong direction.
