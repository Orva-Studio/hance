import { createServer } from "@hance/ui/server";

// Starts the @hance/ui Bun server in-process on an ephemeral port and returns
// the URL the WebView should load. The ui server serves its built dist/ (run
// `bun run build:ui` at the repo root first) plus the /api routes the app uses.
// Bound to 127.0.0.1 only so the local API is never exposed beyond localhost.
export function startUiServer(): { url: string; stop: () => Promise<void> } {
  const server = createServer(0, "127.0.0.1");
  async function stop(): Promise<void> {
    await server.stop(true);
  }
  return {
    url: `http://localhost:${server.port}`,
    stop,
  };
}
