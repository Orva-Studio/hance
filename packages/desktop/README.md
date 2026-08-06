# @hance/desktop

Native macOS/Windows/Linux shell around the existing `@hance/ui` web app, built with [Electrobun](https://electrobun.dev). It reuses ~100% of the UI code - this package is just glue: 3 files, ~190 lines total.

## Why so small

`@hance/ui` already ships a Bun HTTP server (`createServer`, from `@hance/ui/server`) that serves the built React app plus its `/api` routes. Electrobun's Bun-side process can run arbitrary Bun code, so the desktop shell just starts that same server in-process and points a native WebView at `http://127.0.0.1:<port>`. No separate desktop UI, no IPC framework, no duplicated components.

```
┌───────────────────────────── Hance.app ─────────────────────────────┐
│                                                                       │
│  Electrobun (native process, Bun runtime)                           │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ src/bun/index.ts                                             │   │
│  │  - creates BrowserWindow (native WebView, hiddenInset title) │   │
│  │  - builds & installs the native app menu                     │   │
│  │  - forwards menu clicks -> window.dispatchEvent("hance:menu")│   │
│  └───────────────────────┬─────────────────────────────────────┘   │
│                           │ starts                                  │
│  ┌────────────────────────▼────────────────────────────────────┐   │
│  │ src/bun/server.ts                                            │   │
│  │  - createServer() from @hance/ui/server (same code the       │   │
│  │    browser build uses), bound to 127.0.0.1 on an ephemeral   │   │
│  │    port                                                      │   │
│  │  - serves packages/ui/dist (built React app + assets)        │   │
│  │  - injects a native pickFile() into the /api/pick-file route │   │
│  │    via Electrobun's Utils.openFileDialog (native Finder      │   │
│  │    panel instead of <input type=file>)                       │   │
│  └───────────────────────┬─────────────────────────────────────┘   │
│                           │ serves over loopback HTTP               │
│  ┌────────────────────────▼────────────────────────────────────┐   │
│  │ Native WebView  ──loads──►  http://127.0.0.1:PORT/?desktop=1 │   │
│  │                                                               │   │
│  │  Same React app as the browser build (packages/ui).          │   │
│  │  ?desktop=1 tells it to pad the top bar clear of the macOS   │   │
│  │  traffic lights, and it listens for "hance:menu" events to   │   │
│  │  wire native menu items (Open, Save Look, Export, Undo…) to  │   │
│  │  its existing handlers.                                      │   │
│  └───────────────────────────────────────────────────────────────┘   │
│                                                                       │
│  src/bun/menu.ts: pure data - builds the ApplicationMenuItemConfig[]│
│  (File/Edit/View/Window), no native calls, so it's unit-testable    │
│  in isolation.                                                       │
└───────────────────────────────────────────────────────────────────┘
```

## Files

| File | Role |
|---|---|
| `src/bun/index.ts` | Entry point. Boots the UI server, waits for it to respond, opens the native window, wires the app menu, forwards menu clicks into the webview. |
| `src/bun/server.ts` | Starts `@hance/ui`'s Bun server in-process, resolves `packages/ui/dist` from inside the packaged `.app`, injects a native file-picker into the UI's `/api/pick-file` hook. |
| `src/bun/menu.ts` | Pure data: builds the native application menu (File/Edit/View/Window) and the `MENU_ACTIONS` forwarded to the webview as `hance:menu` CustomEvents. No native calls, so it's unit-testable standalone. |

## Dev loop

```
bun run --cwd packages/desktop dev        # build UI, launch Electrobun window
bun run --cwd packages/desktop dev:watch  # same, with watch mode
bun run --cwd packages/desktop build      # produce the packaged app
```

`dev`/`dev:watch`/`build` all run `build:ui` first (from repo root) so the desktop shell serves a fresh `packages/ui/dist`.

## Releasing

The desktop app is **not** built by CI.
`.github/workflows/release.yml` builds and publishes the CLI only; the `.app` and its `.dmg` are built and uploaded by hand, out of band from the CLI's tag-triggered release.

The download button on the site points at `${REPO}/releases/latest/download/hance-macos-arm64.dmg` (see `packages/docs/src/pages/mac-install.astro`).
It always resolves to whatever `.dmg` is attached to the newest published release, so replacing that asset changes what users get with no site rebuild.

```
cd packages/desktop

# 1. Build the stable-channel bundle. Note --env=stable: `bun run build`
#    defaults to the dev channel and produces Hance-dev.app, which is not
#    what you want to ship.
bun run --cwd ../.. build:wgpu && bun run --cwd ../.. build:ui
bunx electrobun build --env=stable

# 2. Package it.
hdiutil create -volname Hance -srcfolder build/stable-macos-arm64/Hance.app \
  -ov -format UDZO hance-macos-arm64.dmg

# 3. Attach it to the release the site points at. --clobber replaces the
#    asset in place, so this immediately changes the live download.
gh release upload v0.9.1 hance-macos-arm64.dmg --clobber
```

To ship under a new version instead of replacing the current asset, bump `version` in `electrobun.config.ts` and the `package.json` files, tag, and upload to the new release.
The CLI workflow fires on the tag independently.

Before uploading, launch the built `.app` and confirm an export completes.
Two shipped builds have been broken by a missing bundled asset (first `ui-dist`, then the `hance-gpu` sidecar), and neither failure is visible until the first export.
The `build` script chains `build:wgpu` and `build:ui` so both are fresh, but that only helps if you run it rather than reusing a stale `build/` directory.

Runtime logs for a packaged app go to `~/Library/Logs/Hance/hance.log` - a Finder-launched app has no terminal, so that file is the only record of a crash.

## Code signing & notarization

The app is currently distributed ad-hoc-signed and unnotarized. When launching a downloaded .app, macOS Gatekeeper will show a warning dialog. On macOS Sequoia and later, right-click "Open" no longer bypasses this. Users need to go to System Settings > Privacy & Security, scroll to the bottom, and click "Open Anyway" after the first blocked launch attempt (or run `xattr -d com.apple.quarantine /path/to/Hance.app`).

To enable automatic code signing and notarization, set the following environment variables before building:

**Developer ID:** Required for codesigning.
- ELECTROBUN_DEVELOPER_ID (e.g. "Developer ID Application: Your Name (TEAMID)")

**Notarization credentials:** Required for notarization (choose one set).
- Set A (Apple ID): ELECTROBUN_APPLEID, ELECTROBUN_APPLEIDPASS, ELECTROBUN_TEAMID
- Set B (API key): ELECTROBUN_APPLEAPIISSUER, ELECTROBUN_APPLEAPIKEY, ELECTROBUN_APPLEAPIKEYPATH

Once the env vars are set, run bun run build or electrobun build --env=stable and the build will automatically sign and notarize the app with no additional configuration needed.
