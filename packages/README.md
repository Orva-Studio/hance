# Packages

Bun workspace monorepo. 8 packages: 3 form the effects/render core, 4 are user-facing surfaces built on top of it, 1 is docs.

| Package | What it is |
|---|---|
| `core` | Pure TypeScript. Effect schema, filter-graph/preset logic, FFmpeg progress parsing, licensing. No I/O, no UI, no rendering. |
| `gpu` | TypeScript bridge to the `wgpu` sidecar. Spawns the native `hance-gpu` binary for headless GPU rendering/export, and resolves its path across dev/packaged builds. |
| `wgpu` | Rust. Standalone GPU renderer (`wgpu` crate) compiled to the `hance-gpu` binary. Applies the effect chain to frames off the browser, for CLI/desktop export. |
| `ui` | React app + a Bun HTTP server (`createServer`/`startUI`) that serves it. Canvas preview renders effects live in-browser via WebGPU. Exports both the built app (`./app/*`) and the server (`./server`) so other packages can reuse either piece. |
| `cli` | `hance` binary. Parses args, drives `core` for effect/preset logic and `gpu` for native export, and can also boot `ui`'s server for a local `hance ui` browser session. |
| `desktop` | Electrobun-packaged native app (macOS/Windows/Linux). Thin shell: starts `ui`'s server in-process, points a native WebView at it, adds a native menu. See `packages/desktop/README.md`. |
| `try` | Standalone static site (Vite, no server). Public browser demo - imports `ui`'s React components/hooks directly and reuses `core` for effect logic, but renders entirely client-side via WebGPU with its own sample-look picker instead of the file-based workflow. |
| `docs` | Astro/Starlight documentation site. No dependency on the other packages. |

## Package dependency graph

```
                         ┌────────────┐
                         │    core    │  effect schema, presets,
                         │            │  progress parsing, licensing
                         └─────┬──────┘
                     ┌─────────┼─────────┐
                     │         │         │
                     ▼         │         ▼
              ┌────────────┐  │   ┌────────────┐
              │    gpu     │  │   │     ui      │  React app +
              │ (TS bridge)│  │   │ (app+server)│  Bun server
              └─────┬──────┘  │   └──────┬──────┘
                    │spawns   │          │
                    ▼         │          │
             ┌────────────┐  │          │
             │    wgpu    │  │          │
             │ (Rust bin  │  │          │
             │ hance-gpu) │  │          │
             └────────────┘  │          │
                              │          │
        ┌─────────────────────┴───┐   ┌──┴───────────┬─────────────┐
        ▼                          ▼   ▼              ▼             ▼
  ┌───────────┐              ┌─────────────┐   ┌────────────┐ ┌──────────┐
  │    cli    │──uses gpu───▶│  cli (ui cmd)│   │   try      │ │ desktop  │
  │ (binary)  │  + core      │ boots ui/    │   │ (Vite site,│ │(Electro- │
  │           │              │ server       │   │  imports   │ │ bun app, │
  │           │              │              │   │  ui/app/*) │ │ boots    │
  │           │              │              │   │            │ │ ui/server│
  └───────────┘              └──────────────┘   └────────────┘ └──────────┘

  docs  — no edges to the others (independent Astro site)
```

## User-facing surfaces: how they connect

Four different front doors, three different rendering paths.

```
                    ┌───────────────────────────────────────────┐
                    │                   core                    │
                    │   effect schema · presets · FFmpeg parse  │
                    └───────────────────────────────────────────┘
                       ▲              ▲               ▲
                       │              │               │
     ┌─────────────────┘        ┌─────┘         ┌─────┘
     │                          │               │
┌────┴─────┐              ┌─────┴─────┐   ┌─────┴──────┐
│   cli    │              │    ui     │   │    try     │
│ terminal │              │  browser  │   │  browser   │
│          │              │  (server- │   │  (static,  │
│          │              │  served)  │   │  no server)│
└────┬─────┘              └─────┬─────┘   └─────┬──────┘
     │                          │               │
     │ export path:             │ preview path: │ preview path:
     │ spawns FFmpeg +          │ WebGPU in-tab  │ WebGPU in-tab
     │ gpu -> wgpu sidecar      │ (@hance/ui     │ (reuses same
     │ (native, headless)       │ canvas/gpu)    │ ui/app hooks)
     ▼                          │               │
 rendered video/image file      │               │
                                 │               │
     `hance ui` subcommand ─────┤               │
     also boots ui's Bun server │               │
     and opens it in a browser  │               │
     tab (same code path as    ─┘               │
     visiting ui directly)                       │
                                                  no export - "try before
                                                  you install"; picks from
                                                  bundled sample looks
                                                  instead of local files

                    ┌────────────────────────────┐
                    │          desktop            │
                    │  Electrobun native shell     │
                    │  (macOS/Windows/Linux)       │
                    │                              │
                    │  boots ui's Bun server        │
                    │  in-process, points a native  │
                    │  WebView at it - same React   │
                    │  app as ui, plus native menu  │
                    │  + native file-open dialog     │
                    └──────────────┬───────────────┘
                                   │
                          (indirectly, via ui)
                                   ▼
                                 core
```

**Key distinction:** `ui` and `desktop` both serve the *same* full app (file picker, recent files, export) via the same Bun server - desktop just wraps it in a native window with OS-native menu/dialogs instead of a browser tab. `try` is a separate, simplified front end that imports pieces of `ui`'s component/hook library but ships as its own static bundle with no backend, no local-file access, and no export - just a live WebGPU preview over a fixed set of sample looks. `cli` is the only surface that touches `wgpu`/FFmpeg directly for real file export; `ui`/`try`/`desktop` preview only, in-browser, via WebGPU.
