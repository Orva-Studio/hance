# npm Distribution for Hance CLI

## Goal

Make the Hance CLI installable via `npx hance` (and `npm install -g hance`) so that agents and JS-ecosystem developers can run it without the curl-to-binary install. Reuses the existing `release.yml` GitHub Actions matrix that already builds platform tarballs.

Out of scope: an MCP server, porting skills into the CLI binary, Windows support.

## Architecture

Five npm packages published in lockstep from each `v*` git tag:

- **`hance`** — meta package, ~5KB. Contains `bin/hance.js` launcher and a `package.json` whose `optionalDependencies` lists all four platform packages.
- **`@hance/darwin-arm64`**, **`@hance/darwin-x64`**, **`@hance/linux-x64`**, **`@hance/linux-arm64`** — one prebuilt binary each at `bin/hance`, with `os` and `cpu` fields constraining install to the matching platform. ~30–80MB each.

At `npm install` time, npm tries to install all four optional deps and silently skips ones whose `os`/`cpu` don't match the host. The user ends up with one platform package on disk. The launcher resolves `@hance/${process.platform}-${process.arch}` and execs the binary.

Versioning is lockstep with git tags: `vX.Y.Z` → all five packages publish at `X.Y.Z`. Prereleases (`v0.2.0-alpha.1`) publish to `latest` like everything else; no `next` dist-tag.

## Repo Layout

All new files under `scripts/npm/` (release tooling, not a workspace package):

```
scripts/npm/
  launcher.js              # bin script shipped verbatim in `hance`
  build-packages.ts        # generates package.json objects + assembles dist/npm/
  verify-install.ts        # CI script: pack + install + smoke-test `hance --version`
  __tests__/
    build-packages.test.ts # unit tests for package.json generation
    launcher.test.ts       # unit tests for launcher behavior
```

`build-packages.ts` consumes the existing `hance-<platform>.tar.gz` artifacts from the `build` matrix job, extracts each binary into `dist/npm/@hance/<platform>/bin/hance` (mode `0o755`), and writes generated `package.json` files for all five packages plus the launcher into `dist/npm/hance/`.

## Launcher

Shipped as `bin/hance.js` in the meta package:

```js
#!/usr/bin/env node
const { execFileSync } = require("node:child_process");

const pkg = `@hance/${process.platform}-${process.arch}`;
let binary;
try {
  binary = require.resolve(`${pkg}/bin/hance`);
} catch {
  console.error(`hance: no prebuilt binary for ${process.platform}-${process.arch}.`);
  console.error(`Supported: darwin-arm64, darwin-x64, linux-x64, linux-arm64.`);
  process.exit(1);
}

try {
  execFileSync(binary, process.argv.slice(2), { stdio: "inherit" });
} catch (err) {
  process.exit(typeof err.status === "number" ? err.status : 1);
}
```

- Node-only runtime; runs under whatever Node `npx` provides. No Bun dep on user's machine.
- `stdio: "inherit"` so FFmpeg progress, stdin, and TTY signals (Ctrl-C) pass through.
- Exit code is forwarded from the child via `err.status`.
- Executable bit set by `build-packages.ts` before publish.

## CI Workflow

Add to `.github/workflows/release.yml`:

**`verify-npm`** (matrix per platform, depends on `build`):
- Runs on each platform's actual runner (`macos-14`, `ubuntu-latest`, `ubuntu-24.04-arm`).
- Downloads that platform's tarball.
- Runs `bun run scripts/npm/build-packages.ts --version $VERSION --platform <p>` to assemble just that platform's pkg + the meta pkg.
- `npm pack`s both, `npm install`s the resulting `.tgz` files into a temp dir, runs `./node_modules/.bin/hance --version`, asserts version match.
- Failure here fails the release before any publish happens.

**`publish-npm`** (depends on `verify-npm` AND `release`):
- Single job on `ubuntu-latest`.
- Downloads all four tarballs.
- Runs `bun run scripts/npm/build-packages.ts --version $VERSION` to assemble all five `dist/npm/*` dirs.
- For each: `cd dist/npm/<pkg> && npm publish --access public`. Wraps in a shell check that treats `EPUBLISHCONFLICT` (already published at this version) as success for re-runnability.
- Uses `NODE_AUTH_TOKEN` from a new `NPM_TOKEN` secret.

Job order: `build` → (`verify-npm` ∥ `release`) → `publish-npm`. The GitHub release publishing stays independent of npm.

## Error Handling

| Case | Behavior |
| --- | --- |
| Unsupported platform (Windows, freebsd, linux-armv7) | `npm install` succeeds (all platform deps optional). Launcher prints the unsupported-platform error and exits 1. |
| All optional installs failed (network flake) | Same UX as unsupported platform. User reruns to retry. |
| Binary missing executable bit | `EACCES` from `execFileSync` → exit 1. Verify-npm catches this in CI. |
| Re-publishing a tag | `EPUBLISHCONFLICT` treated as success per-package, so partial-failure re-runs converge. |
| Non-semver tag | `build-packages.ts` rejects up front; workflow fails before any work. |

## Testing

- **Unit tests** (`bun test`): `build-packages.test.ts` asserts generated `package.json` shapes — meta has correct `optionalDependencies` (all four platforms pinned to the version), correct `bin`, no runtime `dependencies`; platform packages have correct `os`/`cpu`/`bin`, no optionals.
- **Launcher unit test**: spawn `launcher.js` against a temp `node_modules` containing a stub `@hance/<platform>/bin/hance` shell script that echoes argv. Assert argv passthrough, exit code propagation (0 and non-zero), and unsupported-platform error message.
- **E2E**: the `verify-npm` CI job is the e2e test. It exercises real `npm install`, real `optionalDependencies` resolution, and real binary execution on a real platform runner — every release.

## Out-of-Band Prerequisites

Before merging this PR:

1. Reserve `hance` and the `@hance` scope on npm (publish `0.0.0-reserved` placeholders if needed to prevent name squatting).
2. Generate an npm automation token with publish rights for the user/org and `@hance` scope.
3. Add the token as `NPM_TOKEN` repo secret in GitHub.
