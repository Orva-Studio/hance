import Electrobun, { BrowserWindow, ApplicationMenu } from "electrobun/bun";
import { buildApplicationMenu } from "./menu";
import { startUiServer } from "./server";

function createMainWindow(url: string): BrowserWindow {
  return new BrowserWindow({
    title: "Hance",
    url,
    frame: {
      width: 1280,
      height: 800,
      x: 100,
      y: 100,
    },
  });
}

// Bun.serve() binds synchronously, but the WebView can still attempt its
// first navigation before it (or the native window itself) is truly ready
// to load - polling here avoids a blank/half-loaded first paint.
async function waitUntilReady(url: string, timeoutMs = 3000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 25));
  }
}

let mainWindow: BrowserWindow | null = null;

async function main(): Promise<void> {
  const ui = startUiServer();
  await waitUntilReady(ui.url);
  ApplicationMenu.setApplicationMenu(buildApplicationMenu());
  const win = createMainWindow(ui.url);
  mainWindow = win;

  win.on("close", async () => {
    mainWindow = null;
    try {
      await ui.stop();
    } catch (err) {
      console.error("failed to stop ui server:", err);
    }
  });
}

main();

// Forward custom menu actions into the webview as a DOM CustomEvent; the
// React app listens for "hance:menu" and dispatches to its own handlers.
// Role-based items (undo, copy, quit…) are handled natively and never fire.
Electrobun.events.on("application-menu-clicked", (event) => {
  const action = event.data.action;
  if (!action || !mainWindow) return;
  mainWindow.webview.executeJavascript(
    `window.dispatchEvent(new CustomEvent("hance:menu", { detail: ${JSON.stringify(action)} }))`,
  );
});
