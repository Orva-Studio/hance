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

`dev`/`dev:watch` always run `build:ui` first (from repo root) so the desktop shell serves a fresh `packages/ui/dist`.
