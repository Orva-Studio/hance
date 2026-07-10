import { createServer } from "@hance/ui/server";

// Starts the @hance/ui Bun server in-process on an ephemeral port and returns
// the URL the WebView should load. The ui server serves its built dist/ (run
// `bun run build:ui` at the repo root first) plus the /api routes the app uses.
export function startUiServer(): { url: string; stop: () => void } {
  const server = createServer(0);
  return {
    url: `http://localhost:${server.port}`,
    stop: () => server.stop(true),
  };
}
