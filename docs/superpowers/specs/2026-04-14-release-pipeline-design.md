# Release Pipeline Design

**Date:** 2026-04-14
**Status:** Approved
**Scope:** v0.1 alpha release pipeline for Hancer

## Goal

Ship Hancer as a single-binary CLI plus Rust WGPU sidecar via tagged GitHub Releases, installable with a one-line `curl | sh`. Inspired by x-dl's release layout.

## Bundling model

One `hance` binary (Bun-compiled, UI assets embedded) plus one `hance-wgpu` Rust sidecar. The CLI launches the UI via `hance ui`. Users run a single command; the sidecar lives next to the CLI and is invoked internally.

## Supported platforms (v0.1)

- macOS arm64 (Apple Silicon)
- macOS x64 (Intel)
- Linux x64
- Linux arm64

Windows is deferred.

## Release artifacts

For each tag `vX.Y.Z`, the GitHub Release contains:

- `hance-macos-arm64.tar.gz`
- `hance-macos-x64.tar.gz`
- `hance-linux-x64.tar.gz`
- `hance-linux-arm64.tar.gz`
- `checksums.txt` — sha256 per tarball, `shasum -a 256 -c` compatible
- `install.sh` — OS/arch-detecting installer

Each tarball extracts to `hance-<version>-<platform>/` containing `hance`, `hance-wgpu`, `LICENSE`, `README.md`.

## CI workflow

`.github/workflows/release.yml`, triggered on tags matching `v*`.

### Matrix (native runners, no cross-compile)

| Platform | Runner |
|---|---|
| macos-arm64 | `macos-14` |
| macos-x64 | `macos-13` |
| linux-x64 | `ubuntu-latest` |
| linux-arm64 | `ubuntu-24.04-arm` |

### Per-build job

1. Checkout
2. Setup Bun (`oven-sh/setup-bun`) + Rust (`dtolnay/rust-toolchain@stable`)
3. Cache `~/.cargo/registry`, `~/.cargo/git`, `packages/wgpu/target`, Bun install cache
4. `bun install --frozen-lockfile`
5. `bun run build` (builds wgpu → ui → cli in order; existing script)
6. `bun run scripts/stage-release.ts` → assembles `dist/hance-<platform>/` with `hance`, `hance-wgpu`, `LICENSE`, `README.md`
7. `tar -czf hance-<platform>.tar.gz -C dist hance-<platform>`
8. Upload artifact

Version is injected into the CLI build via `bun build --define HANCE_VERSION='"X.Y.Z"'` sourced from the git tag.

### Release job (ubuntu-latest)

1. Download all 4 artifacts
2. `shasum -a 256 hance-*.tar.gz > checksums.txt`
3. Copy `scripts/install.sh` from the repo
4. `gh release create "$TAG" --generate-notes hance-*.tar.gz checksums.txt install.sh`

## install.sh behavior

POSIX sh, `curl -fsSL <url> | sh` compatible. Supports `--version vX.Y.Z` and `HANCE_VERSION` env override. User-facing output at each step; checksum verification is silent on success, loud on failure.

1. **Detect OS/arch** via `uname`. Map to one of the 4 platforms; exit with a supported-list message otherwise.
   - Prints: `Detected: macOS on Apple Silicon (arm64) → hance-macos-arm64`
2. **Resolve version** — default to latest from GitHub API; honor `--version` / `HANCE_VERSION`.
   - Prints: `Installing hance v0.1.0 (latest)`
3. **Check prerequisites.** Verify `ffmpeg` on PATH; if missing, print install hints (`brew install ffmpeg`, `apt install ffmpeg`) and warn but continue.
4. **Download** tarball and `checksums.txt` into a `mktemp -d` with `curl -fL` (fallback `wget`).
   - Prints: `Downloading hance-macos-arm64.tar.gz (≈XX MB)...`
5. **Verify sha256** silently using `shasum -a 256 -c` (or `sha256sum -c` on Linux). Abort loudly on mismatch.
6. **Extract** to `~/.hance/bin/` (strip top-level dir; overwrite).
   - Prints: `Installing to ~/.hance/bin/`
7. **macOS only:** `xattr -dr com.apple.quarantine ~/.hance/bin` to skip Gatekeeper dialogs.
8. **PATH setup.** Detect shell from `$SHELL`. If `~/.hance/bin` isn't on PATH, print the exact export line and prompt `Add to ~/.zshrc now? [y/N]`. Skip prompt when stdin isn't a TTY; just print the line.
9. **Done message** with getting-started hints:
   ```
   ✓ Installed hance v0.1.0 to ~/.hance/bin

   Get started:
     hance --help                    # CLI usage
     hance ui                        # launch the UI
     hance input.mp4 -o out.mp4      # apply default look

   Docs: https://github.com/<owner>/hancer
   ```

## macOS signing

v0.1 ships unsigned. The `xattr -dr com.apple.quarantine` step in install.sh removes the quarantine flag on curl-downloaded binaries, so users see no Gatekeeper dialog when installed via the script. Developer ID signing + notarization is deferred.

## Repo changes

- `.github/workflows/release.yml` — the workflow above
- `scripts/install.sh` — installer (single source of truth, checked in)
- `scripts/stage-release.ts` — Bun script to assemble `dist/hance-<platform>/`
- `package.json` — wire `HANCE_VERSION` into the build; add a `release:local` script for dry-run tarball build
- `README.md` — add an "Install" section with the one-line curl command
- `packages/cli/src/cli.ts` — read `HANCE_VERSION` for `--version` output

No other source changes.

## Testing

- **install.sh:** shellcheck in CI; manual smoke test on fresh macOS + a Linux Docker container before cutting the first real release.
- **Release workflow:** dry-run via a `v0.0.0-test` tag on a throwaway branch before `v0.1.0`. A push trigger on a `release-ci` branch runs the matrix build (without the release-create step) whenever the workflow file changes.
- No unit tests for the pipeline — it's config.

## Out of scope for v0.1

- Windows support (.exe, .ps1 installer, Rust MSVC toolchain)
- Developer ID signing / notarization
- Homebrew tap
- Auto-update
- Publishing `hance-wgpu` to crates.io

All are additive and won't reshape this pipeline.
