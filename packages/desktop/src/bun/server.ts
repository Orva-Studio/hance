import { join, dirname } from "node:path";
import { existsSync } from "node:fs";
import { Utils } from "electrobun/bun";
import { createServer } from "@hance/ui/server";

// Native macOS open dialog via Electrobun, exposed to the web UI through the
// server's /api/pick-file hook. Returning a real filesystem path (unlike the
// browser <input type=file>) is what lets the recent-files list reopen media.
async function pickFile(): Promise<string | null> {
  const paths = await Utils.openFileDialog({
    startingFolder: "~/",
    allowedFileTypes: "*",
    canChooseFiles: true,
    canChooseDirectory: false,
    allowsMultipleSelection: false,
  });
  return paths.find(p => p.length > 0) ?? null;
}

// Electrobun bundles src/bun/*.ts and runs the bundle from inside the built
// .app (Contents/Resources/app/bun), so neither process.cwd() nor
// import.meta.dir points at packages/desktop directly. The bundle does live
// under the repo, though, so walk up from both candidates until a sibling
// packages/ui/dist appears, and pass it through explicitly. Without this the
// ui server silently falls back to a stale ~/.hance/ui copy (or 404s).
function resolveUiDistDir(): string | undefined {
  for (const start of [import.meta.dir, process.cwd()]) {
    let dir = start;
    while (true) {
      const candidate = join(dir, "packages", "ui", "dist");
      if (existsSync(candidate)) return candidate;
      const parent = dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  }
  return undefined;
}

// Starts the @hance/ui Bun server in-process on an ephemeral port and returns
// the URL the WebView should load. The ui server serves its built dist/ (run
// `bun run build:ui` at the repo root first) plus the /api routes the app uses.
// Bound to 127.0.0.1 only so the local API is never exposed beyond localhost.
export function startUiServer(): { url: string; stop: () => Promise<void> } {
  const server = createServer(0, "127.0.0.1", resolveUiDistDir(), { pickFile });
  async function stop(): Promise<void> {
    await server.stop(true);
  }
  return {
    // ?desktop=1 tells the web app it runs inside the shell (hiddenInset
    // titlebar), so it pads the top bar clear of the macOS traffic lights.
    // 127.0.0.1 literal, not "localhost": the server binds the IPv4 loopback
    // only, and localhost can resolve to ::1 first, failing the first load.
    url: `http://127.0.0.1:${server.port}/?desktop=1`,
    stop,
  };
}
