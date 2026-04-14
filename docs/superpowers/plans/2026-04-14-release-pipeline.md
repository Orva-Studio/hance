# Release Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Hancer v0.1.0 as tagged GitHub Releases for macOS (arm64/x64) and Linux (x64/arm64), installable via `curl | sh`.

**Architecture:** Tag `v*` triggers a GitHub Actions matrix across four native runners; each builds `hance` (Bun-compiled CLI with UI embedded) + `hance-gpu` (Rust sidecar), packages them into `hance-<platform>.tar.gz`, and a final job uploads tarballs + `checksums.txt` + `install.sh` to the Release. Installer detects OS/arch, fetches the right tarball, verifies sha256 silently, installs to `~/.hance/bin`, strips quarantine on macOS, and offers PATH setup.

**Tech Stack:** GitHub Actions, Bun (`--compile`), Rust (cargo), POSIX sh, `shasum`/`sha256sum`, `tar`.

**Spec:** `docs/superpowers/specs/2026-04-14-release-pipeline-design.md`

**Note on naming:** spec says `hance-wgpu`; the real binary is `hance-gpu` (unchanged to avoid scope churn). Everywhere below uses `hance-gpu`.

---

## File Structure

Files created:
- `.github/workflows/release.yml` — matrix build + release job
- `scripts/install.sh` — POSIX sh installer
- `scripts/stage-release.ts` — Bun script that assembles a per-platform `dist/<platform>/` staging dir

Files modified:
- `packages/cli/src/cli.ts` — add `--version` flag
- `packages/cli/src/pipeline.ts` — make `sidecarPath()` resolve next to the running binary when compiled
- `packages/cli/src/gpu/wgpu-renderer.ts` — same fix for the duplicate `sidecarPath()`
- `package.json` — add `HANCE_VERSION` build-time define; add `release:local` script
- `README.md` — add "Install" section

---

## Task 1: Add `--version` flag to the CLI

**Files:**
- Modify: `packages/cli/src/cli.ts`
- Test: `packages/cli/__tests__/version.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/cli/__tests__/version.test.ts`:

```ts
import { describe, it, expect } from "bun:test";

describe("cli --version", () => {
  it("prints HANCE_VERSION and exits 0", async () => {
    const proc = Bun.spawn(
      ["bun", "run", "packages/cli/src/cli.ts", "--version"],
      { stdout: "pipe", stderr: "pipe", env: { ...process.env, HANCE_VERSION: "9.9.9-test" } }
    );
    const out = await new Response(proc.stdout).text();
    const code = await proc.exited;
    expect(code).toBe(0);
    expect(out.trim()).toBe("hance 9.9.9-test");
  });

  it("prints 'dev' when HANCE_VERSION is unset", async () => {
    const env = { ...process.env };
    delete env.HANCE_VERSION;
    const proc = Bun.spawn(
      ["bun", "run", "packages/cli/src/cli.ts", "--version"],
      { stdout: "pipe", stderr: "pipe", env }
    );
    const out = await new Response(proc.stdout).text();
    const code = await proc.exited;
    expect(code).toBe(0);
    expect(out.trim()).toBe("hance dev");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test packages/cli/__tests__/version.test.ts`
Expected: FAIL — the CLI does not currently handle `--version`.

- [ ] **Step 3: Implement `--version` handling**

At the top of `packages/cli/src/cli.ts` (after the imports), add:

```ts
declare const HANCE_VERSION: string | undefined;
const VERSION: string = (typeof HANCE_VERSION !== "undefined" ? HANCE_VERSION : (process.env.HANCE_VERSION ?? "dev"));
```

Find the `main()` function (or the entry block at the bottom of `cli.ts` that calls `parseArgs`). Immediately after argv is obtained (typically `const argv = Bun.argv.slice(2);` or similar — look for where the CLI first sees its args), insert:

```ts
if (argv.includes("--version") || argv.includes("-v")) {
  console.log(`hance ${VERSION}`);
  process.exit(0);
}
```

If you can't find a clear entry, check for `if (import.meta.main)` at the bottom of the file. If it doesn't exist, add:

```ts
if (import.meta.main) {
  const argv = Bun.argv.slice(2);
  if (argv.includes("--version") || argv.includes("-v")) {
    console.log(`hance ${VERSION}`);
    process.exit(0);
  }
  // ... existing entry logic
}
```

Also add `--version, -v                Print version and exit` to the `HELP_TEXT` constant, in the Input/Output section.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test packages/cli/__tests__/version.test.ts`
Expected: PASS, both cases.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/cli.ts packages/cli/__tests__/version.test.ts
git commit -m "feat(cli): add --version flag backed by HANCE_VERSION"
```

---

## Task 2: Resolve sidecar next to the compiled binary

Currently `sidecarPath()` uses `import.meta.dir` which points inside the source tree. When `hance` is a compiled single-file binary, `import.meta.dir` is a virtual path and the computed sidecar path doesn't exist. We need: in the compiled binary, look next to `process.execPath`; in dev (`bun run`), keep the existing behavior.

**Files:**
- Modify: `packages/cli/src/pipeline.ts` (lines 15–17)
- Modify: `packages/cli/src/gpu/wgpu-renderer.ts` (lines 20-ish)
- Test: `packages/cli/__tests__/sidecar-path.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/cli/__tests__/sidecar-path.test.ts`:

```ts
import { describe, it, expect } from "bun:test";
import { resolveSidecarPath } from "../src/sidecar-path";
import { join } from "node:path";

describe("resolveSidecarPath", () => {
  it("prefers HANCE_GPU env override", () => {
    expect(resolveSidecarPath({ execPath: "/whatever/hance", env: { HANCE_GPU: "/custom/hance-gpu" } }))
      .toBe("/custom/hance-gpu");
  });

  it("looks next to execPath when run as a compiled binary", () => {
    expect(resolveSidecarPath({ execPath: "/opt/hance/bin/hance", env: {} }))
      .toBe(join("/opt/hance/bin", "hance-gpu"));
  });

  it("falls back to the cargo target dir when execPath is bun", () => {
    const p = resolveSidecarPath({ execPath: "/usr/local/bin/bun", env: {}, devRoot: "/repo" });
    expect(p).toBe(join("/repo", "packages/wgpu/target/release/hance-gpu"));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test packages/cli/__tests__/sidecar-path.test.ts`
Expected: FAIL — `../src/sidecar-path` does not exist.

- [ ] **Step 3: Create the shared sidecar resolver**

Create `packages/cli/src/sidecar-path.ts`:

```ts
import path from "node:path";
import { basename } from "node:path";

export interface ResolveOpts {
  execPath: string;
  env: Record<string, string | undefined>;
  devRoot?: string;
}

export function resolveSidecarPath(opts: ResolveOpts): string {
  const { execPath, env } = opts;
  if (env.HANCE_GPU) return env.HANCE_GPU;

  const execBase = basename(execPath).toLowerCase();
  const isBunRuntime = execBase === "bun" || execBase === "bun.exe";

  if (!isBunRuntime) {
    // Compiled single-file binary; sidecar sits next to it.
    return path.join(path.dirname(execPath), "hance-gpu");
  }

  const root = opts.devRoot ?? path.resolve(import.meta.dir ?? "", "..", "..", "..");
  return path.join(root, "packages/wgpu/target/release/hance-gpu");
}

export function sidecarPath(): string {
  return resolveSidecarPath({ execPath: process.execPath, env: process.env });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test packages/cli/__tests__/sidecar-path.test.ts`
Expected: PASS.

- [ ] **Step 5: Swap callers to the shared resolver**

In `packages/cli/src/pipeline.ts`, replace the existing `function sidecarPath()` (lines 15–17) with:

```ts
import { sidecarPath } from "./sidecar-path";
```

(Remove the local definition; keep all other imports and the rest of the file intact.)

In `packages/cli/src/gpu/wgpu-renderer.ts`, replace the local `sidecarPath()` (around line 20) the same way:

```ts
import { sidecarPath } from "../sidecar-path";
```

- [ ] **Step 6: Verify existing tests still pass**

Run: `bun test`
Expected: PASS. If any test directly depended on the old `sidecarPath()` signature, update it to import from `./sidecar-path`.

- [ ] **Step 7: Commit**

```bash
git add packages/cli/src/sidecar-path.ts packages/cli/src/pipeline.ts packages/cli/src/gpu/wgpu-renderer.ts packages/cli/__tests__/sidecar-path.test.ts
git commit -m "refactor(cli): resolve hance-gpu sidecar next to compiled binary"
```

---

## Task 3: Wire `HANCE_VERSION` into the Bun build

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Add build define**

Change the `build` script in `package.json` from:

```json
"build": "bun run build:wgpu && bun run build:ui && bun build packages/cli/src/cli.ts --compile --outfile hance"
```

to:

```json
"build": "bun run build:wgpu && bun run build:ui && bun build packages/cli/src/cli.ts --compile --define HANCE_VERSION=\"'${HANCE_VERSION:-dev}'\" --outfile hance"
```

Also add a `release:local` script that builds a dev tarball for the current host, useful for smoke-testing install.sh locally:

```json
"release:local": "HANCE_VERSION=${HANCE_VERSION:-0.0.0-local} bun run build && bun run scripts/stage-release.ts && bun run scripts/pack-local.ts"
```

(`pack-local.ts` is written in Task 4 alongside `stage-release.ts`.)

- [ ] **Step 2: Manually verify the build picks up the version**

Run:
```bash
HANCE_VERSION=0.0.0-smoke bun run build
./hance --version
```
Expected: `hance 0.0.0-smoke`

- [ ] **Step 3: Commit**

```bash
git add package.json
git commit -m "build: inject HANCE_VERSION into compiled hance binary"
```

---

## Task 4: `scripts/stage-release.ts`

Assembles `dist/hance-<platform>/` containing `hance`, `hance-gpu`, `LICENSE`, `README.md`. Platform is derived from host unless `HANCE_PLATFORM` is set (for CI).

**Files:**
- Create: `scripts/stage-release.ts`
- Create: `scripts/pack-local.ts` (small helper used by `release:local`)
- Test: `scripts/__tests__/stage-release.test.ts`

- [ ] **Step 1: Write the failing test**

Create `scripts/__tests__/stage-release.test.ts`:

```ts
import { describe, it, expect } from "bun:test";
import { detectPlatform } from "../stage-release";

describe("detectPlatform", () => {
  it("maps darwin arm64", () => {
    expect(detectPlatform("darwin", "arm64")).toBe("macos-arm64");
  });
  it("maps darwin x64", () => {
    expect(detectPlatform("darwin", "x64")).toBe("macos-x64");
  });
  it("maps linux x64", () => {
    expect(detectPlatform("linux", "x64")).toBe("linux-x64");
  });
  it("maps linux arm64", () => {
    expect(detectPlatform("linux", "arm64")).toBe("linux-arm64");
  });
  it("throws on unsupported", () => {
    expect(() => detectPlatform("win32", "x64")).toThrow(/unsupported/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test scripts/__tests__/stage-release.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement `stage-release.ts`**

Create `scripts/stage-release.ts`:

```ts
import { mkdir, copyFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

export function detectPlatform(platform: string, arch: string): string {
  if (platform === "darwin" && arch === "arm64") return "macos-arm64";
  if (platform === "darwin" && arch === "x64") return "macos-x64";
  if (platform === "linux" && arch === "x64") return "linux-x64";
  if (platform === "linux" && arch === "arm64") return "linux-arm64";
  throw new Error(`unsupported host: ${platform}/${arch}`);
}

async function main() {
  const root = path.resolve(import.meta.dir, "..");
  const platform = process.env.HANCE_PLATFORM ?? detectPlatform(process.platform, process.arch);
  const stageDir = path.join(root, "dist", `hance-${platform}`);

  await rm(stageDir, { recursive: true, force: true });
  await mkdir(stageDir, { recursive: true });

  const cli = path.join(root, "hance");
  const gpu = path.join(root, "packages/wgpu/target/release/hance-gpu");
  if (!existsSync(cli)) throw new Error(`missing ${cli} — run bun run build first`);
  if (!existsSync(gpu)) throw new Error(`missing ${gpu} — run bun run build:wgpu first`);

  await copyFile(cli, path.join(stageDir, "hance"));
  await copyFile(gpu, path.join(stageDir, "hance-gpu"));
  await copyFile(path.join(root, "LICENSE"), path.join(stageDir, "LICENSE"));
  await copyFile(path.join(root, "README.md"), path.join(stageDir, "README.md"));

  // Ensure executable bits
  const { chmodSync } = await import("node:fs");
  chmodSync(path.join(stageDir, "hance"), 0o755);
  chmodSync(path.join(stageDir, "hance-gpu"), 0o755);

  console.log(`staged: ${stageDir}`);
}

if (import.meta.main) {
  await main();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test scripts/__tests__/stage-release.test.ts`
Expected: PASS.

- [ ] **Step 5: Implement `pack-local.ts`**

Create `scripts/pack-local.ts`:

```ts
import path from "node:path";
import { detectPlatform } from "./stage-release";

const root = path.resolve(import.meta.dir, "..");
const platform = process.env.HANCE_PLATFORM ?? detectPlatform(process.platform, process.arch);
const tarball = `hance-${platform}.tar.gz`;

const proc = Bun.spawn(
  ["tar", "-czf", tarball, "-C", "dist", `hance-${platform}`],
  { cwd: root, stdout: "inherit", stderr: "inherit" }
);
const code = await proc.exited;
if (code !== 0) process.exit(code);
console.log(`packed: ${tarball}`);
```

- [ ] **Step 6: Smoke-test locally**

Run:
```bash
HANCE_VERSION=0.0.0-local bun run release:local
ls hance-*.tar.gz
tar -tzf hance-*.tar.gz
```
Expected: tarball contains `hance-<platform>/{hance,hance-gpu,LICENSE,README.md}`.

- [ ] **Step 7: Commit**

```bash
git add scripts/stage-release.ts scripts/pack-local.ts scripts/__tests__/stage-release.test.ts
git commit -m "build: add stage-release and pack-local scripts for release tarballs"
```

---

## Task 5: Write `scripts/install.sh`

POSIX sh, passes `shellcheck`. Follows the flow from the design doc §install.sh behavior.

**Files:**
- Create: `scripts/install.sh`

- [ ] **Step 1: Write the installer**

Create `scripts/install.sh` (mode 755):

```sh
#!/bin/sh
# Hancer installer. Usage:
#   curl -fsSL https://github.com/<owner>/hancer/releases/latest/download/install.sh | sh
#   curl -fsSL <...>/install.sh | sh -s -- --version v0.1.0
set -eu

REPO="${HANCE_REPO:-<OWNER>/hancer}"
INSTALL_DIR="${HANCE_INSTALL_DIR:-$HOME/.hance/bin}"
VERSION="${HANCE_VERSION:-}"

while [ $# -gt 0 ]; do
  case "$1" in
    --version) VERSION="$2"; shift 2 ;;
    --version=*) VERSION="${1#*=}"; shift ;;
    -h|--help)
      cat <<EOF
Hancer installer.
  --version vX.Y.Z    install a specific version (default: latest)
Environment:
  HANCE_REPO          override repo (default: ${REPO})
  HANCE_INSTALL_DIR   override install dir (default: \$HOME/.hance/bin)
EOF
      exit 0 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

info()  { printf '%s\n' "$*"; }
warn()  { printf 'warning: %s\n' "$*" >&2; }
die()   { printf 'error: %s\n' "$*" >&2; exit 1; }

# --- detect OS/arch ----------------------------------------------------------
uname_s=$(uname -s)
uname_m=$(uname -m)
case "$uname_s/$uname_m" in
  Darwin/arm64)         PLATFORM="macos-arm64";   PLATFORM_HUMAN="macOS on Apple Silicon (arm64)" ;;
  Darwin/x86_64)        PLATFORM="macos-x64";     PLATFORM_HUMAN="macOS on Intel (x64)" ;;
  Linux/x86_64)         PLATFORM="linux-x64";     PLATFORM_HUMAN="Linux x86_64" ;;
  Linux/aarch64|Linux/arm64) PLATFORM="linux-arm64"; PLATFORM_HUMAN="Linux arm64" ;;
  *) die "unsupported platform: $uname_s/$uname_m. Supported: macOS (arm64/x64), Linux (x64/arm64)." ;;
esac
info "Detected: ${PLATFORM_HUMAN} → hance-${PLATFORM}"

# --- resolve version ---------------------------------------------------------
if [ -z "$VERSION" ]; then
  api="https://api.github.com/repos/${REPO}/releases/latest"
  VERSION=$(curl -fsSL "$api" | sed -n 's/.*"tag_name": *"\([^"]*\)".*/\1/p' | head -n1)
  [ -n "$VERSION" ] || die "could not resolve latest version from $api"
  info "Installing hance ${VERSION} (latest)"
else
  info "Installing hance ${VERSION}"
fi

# --- prereqs -----------------------------------------------------------------
if ! command -v ffmpeg >/dev/null 2>&1; then
  case "$uname_s" in
    Darwin) warn "ffmpeg not found on PATH — install with: brew install ffmpeg" ;;
    Linux)  warn "ffmpeg not found on PATH — install with: apt install ffmpeg (or your distro's package manager)" ;;
  esac
fi

# --- download ----------------------------------------------------------------
tarball="hance-${PLATFORM}.tar.gz"
base="https://github.com/${REPO}/releases/download/${VERSION}"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

info "Downloading ${tarball}..."
curl -fL --progress-bar -o "$tmp/$tarball"       "$base/$tarball"      || die "download failed: $tarball"
curl -fsSL                -o "$tmp/checksums.txt" "$base/checksums.txt" || die "download failed: checksums.txt"

# --- verify (silent on success) ---------------------------------------------
( cd "$tmp" && grep " $tarball\$" checksums.txt > checksums.expected ) \
  || die "no checksum entry for $tarball in checksums.txt"
if command -v shasum >/dev/null 2>&1; then
  ( cd "$tmp" && shasum -a 256 -c checksums.expected >/dev/null ) \
    || die "checksum mismatch for $tarball — aborting"
elif command -v sha256sum >/dev/null 2>&1; then
  ( cd "$tmp" && sha256sum -c checksums.expected >/dev/null ) \
    || die "checksum mismatch for $tarball — aborting"
else
  die "neither shasum nor sha256sum found; cannot verify download"
fi

# --- extract -----------------------------------------------------------------
info "Installing to ${INSTALL_DIR}"
mkdir -p "$INSTALL_DIR"
tar -xzf "$tmp/$tarball" -C "$tmp"
cp -f "$tmp/hance-${PLATFORM}/hance"     "$INSTALL_DIR/hance"
cp -f "$tmp/hance-${PLATFORM}/hance-gpu" "$INSTALL_DIR/hance-gpu"
chmod 0755 "$INSTALL_DIR/hance" "$INSTALL_DIR/hance-gpu"

# --- macOS: strip quarantine --------------------------------------------------
if [ "$uname_s" = "Darwin" ] && command -v xattr >/dev/null 2>&1; then
  xattr -dr com.apple.quarantine "$INSTALL_DIR" 2>/dev/null || true
fi

# --- PATH --------------------------------------------------------------------
shell_name=$(basename "${SHELL:-sh}")
case ":$PATH:" in
  *":$INSTALL_DIR:"*) on_path=1 ;;
  *) on_path=0 ;;
esac

if [ "$on_path" = "0" ]; then
  case "$shell_name" in
    zsh)  rc="$HOME/.zshrc";  line="export PATH=\"$INSTALL_DIR:\$PATH\"" ;;
    bash) rc="$HOME/.bashrc"; line="export PATH=\"$INSTALL_DIR:\$PATH\"" ;;
    fish) rc="$HOME/.config/fish/config.fish"; line="set -gx PATH $INSTALL_DIR \$PATH" ;;
    *)    rc=""; line="export PATH=\"$INSTALL_DIR:\$PATH\"" ;;
  esac
  echo
  echo "$INSTALL_DIR is not on your PATH. Add this line to your shell config:"
  echo "  $line"
  if [ -t 0 ] && [ -n "$rc" ]; then
    printf "Add to %s now? [y/N] " "$rc"
    read -r reply
    case "$reply" in
      y|Y|yes|YES)
        mkdir -p "$(dirname "$rc")"
        printf '\n# Added by hance installer\n%s\n' "$line" >> "$rc"
        echo "Added. Open a new shell (or 'source $rc') to pick it up."
        ;;
    esac
  fi
fi

cat <<EOF

✓ Installed hance ${VERSION} to ${INSTALL_DIR}

Get started:
  hance --help                    # CLI usage
  hance ui                        # launch the UI
  hance input.mp4 -o out.mp4      # apply default look

Docs: https://github.com/${REPO}
EOF
```

Replace `<OWNER>` with the actual GitHub owner before committing.

- [ ] **Step 2: Lint**

Run: `shellcheck scripts/install.sh`
Expected: no warnings. Fix any issues.

- [ ] **Step 3: Smoke-test dry-run locally**

Serve the local tarball + a hand-written `checksums.txt` from a `python3 -m http.server` in a scratch dir, then:

```bash
HANCE_REPO=localhost:8000/fake HANCE_INSTALL_DIR=/tmp/hance-test sh scripts/install.sh --version v0.0.0-local
```

(Or simpler: just shellcheck + CI will catch real issues. Skip the full HTTP mock if tedious.)

- [ ] **Step 4: Commit**

```bash
chmod +x scripts/install.sh
git add scripts/install.sh
git commit -m "feat: add POSIX sh installer for hance releases"
```

---

## Task 6: GitHub Actions release workflow

**Files:**
- Create: `.github/workflows/release.yml`

- [ ] **Step 1: Write the workflow**

Create `.github/workflows/release.yml`:

```yaml
name: release

on:
  push:
    tags: ["v*"]
  workflow_dispatch:
    inputs:
      tag:
        description: "Tag to build (e.g. v0.1.0). Required for manual runs."
        required: true

permissions:
  contents: write

jobs:
  build:
    strategy:
      fail-fast: false
      matrix:
        include:
          - platform: macos-arm64
            runner: macos-14
          - platform: macos-x64
            runner: macos-13
          - platform: linux-x64
            runner: ubuntu-latest
          - platform: linux-arm64
            runner: ubuntu-24.04-arm
    runs-on: ${{ matrix.runner }}
    steps:
      - uses: actions/checkout@v4

      - name: Resolve version
        id: v
        shell: bash
        run: |
          TAG="${{ github.event.inputs.tag || github.ref_name }}"
          echo "tag=$TAG"            >> "$GITHUB_OUTPUT"
          echo "version=${TAG#v}"    >> "$GITHUB_OUTPUT"

      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: latest

      - uses: dtolnay/rust-toolchain@stable

      - name: Cache cargo
        uses: actions/cache@v4
        with:
          path: |
            ~/.cargo/registry
            ~/.cargo/git
            packages/wgpu/target
          key: ${{ matrix.platform }}-cargo-${{ hashFiles('packages/wgpu/Cargo.lock') }}

      - name: Install ffmpeg (Linux, for tests only)
        if: startsWith(matrix.platform, 'linux')
        run: sudo apt-get update && sudo apt-get install -y ffmpeg

      - run: bun install --frozen-lockfile

      - name: Build
        env:
          HANCE_VERSION: ${{ steps.v.outputs.version }}
        run: bun run build

      - name: Stage release dir
        env:
          HANCE_PLATFORM: ${{ matrix.platform }}
        run: bun run scripts/stage-release.ts

      - name: Create tarball
        run: tar -czf hance-${{ matrix.platform }}.tar.gz -C dist hance-${{ matrix.platform }}

      - uses: actions/upload-artifact@v4
        with:
          name: hance-${{ matrix.platform }}
          path: hance-${{ matrix.platform }}.tar.gz
          if-no-files-found: error

  release:
    needs: build
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Resolve version
        id: v
        run: |
          TAG="${{ github.event.inputs.tag || github.ref_name }}"
          echo "tag=$TAG" >> "$GITHUB_OUTPUT"

      - uses: actions/download-artifact@v4
        with:
          path: artifacts
          merge-multiple: true

      - name: Generate checksums
        run: |
          cd artifacts
          shasum -a 256 hance-*.tar.gz > checksums.txt
          cat checksums.txt

      - name: Copy install.sh
        run: cp scripts/install.sh artifacts/install.sh

      - name: Create GitHub Release
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          gh release create "${{ steps.v.outputs.tag }}" \
            --title "${{ steps.v.outputs.tag }}" \
            --generate-notes \
            artifacts/hance-*.tar.gz \
            artifacts/checksums.txt \
            artifacts/install.sh
```

- [ ] **Step 2: Validate with actionlint (if available)**

Run: `actionlint .github/workflows/release.yml`
Expected: no errors. If actionlint isn't installed, skip — CI will catch syntax issues on first push.

- [ ] **Step 3: Commit**

```bash
mkdir -p .github/workflows
git add .github/workflows/release.yml
git commit -m "ci: add tag-driven release workflow (macOS + Linux matrix)"
```

---

## Task 7: README install section

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add install section**

Near the top of `README.md`, after the project tagline / before the usage docs, insert:

```markdown
## Install

```sh
curl -fsSL https://github.com/<OWNER>/hancer/releases/latest/download/install.sh | sh
```

This installs `hance` and its GPU sidecar to `~/.hance/bin`. The installer detects macOS (arm64/x64) or Linux (x64/arm64). You'll also need `ffmpeg` on your PATH (`brew install ffmpeg` / `apt install ffmpeg`).

Pin a specific version:

```sh
curl -fsSL https://github.com/<OWNER>/hancer/releases/latest/download/install.sh | sh -s -- --version v0.1.0
```
```

Replace `<OWNER>` with the actual GitHub owner.

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add install instructions for release pipeline"
```

---

## Task 8: Dry-run the workflow

**Goal:** catch workflow errors before the real v0.1.0 tag.

- [ ] **Step 1: Push branch and trigger a dry tag**

```bash
git push -u origin feat/release-pipeline
git tag v0.0.0-test
git push origin v0.0.0-test
```

- [ ] **Step 2: Watch the run**

Run: `gh run watch`
Expected: all 4 build jobs succeed, release job creates a GitHub Release named `v0.0.0-test` with 4 tarballs + `checksums.txt` + `install.sh`.

- [ ] **Step 3: Smoke-test the installer against the dry release**

On a fresh machine or `/tmp`:

```bash
HANCE_INSTALL_DIR=/tmp/hance-dryrun curl -fsSL \
  https://github.com/<OWNER>/hancer/releases/download/v0.0.0-test/install.sh \
  | sh -s -- --version v0.0.0-test
/tmp/hance-dryrun/hance --version
```
Expected: `hance 0.0.0-test`

Also run `/tmp/hance-dryrun/hance --help` to confirm the UI launch path resolves; run a short export to confirm the sidecar resolves next to the binary.

- [ ] **Step 4: Tear down the dry release**

```bash
gh release delete v0.0.0-test --yes --cleanup-tag
```

- [ ] **Step 5: Fix any issues discovered, then retest**

If step 2 or 3 failed, fix the workflow / install.sh / stage-release, commit, retag `v0.0.0-test` (force — this is a throwaway dry tag), and repeat.

- [ ] **Step 6: Cut v0.1.0**

```bash
git checkout main
git merge --no-ff feat/release-pipeline
git push origin main
git tag v0.1.0
git push origin v0.1.0
```

Watch the run, verify the release page looks right, and test the real one-liner install from the README.

---

## Done criteria

- Tag `v0.1.0` produces a GitHub Release with 4 tarballs + `checksums.txt` + `install.sh`.
- `curl -fsSL .../install.sh | sh` on a fresh mac installs `hance` + `hance-gpu` into `~/.hance/bin`, prints getting-started hints, and `hance --version` reports `0.1.0`.
- Same flow on a fresh Linux x64 and arm64 machine works end-to-end.
- Every test in this plan passes in CI.
