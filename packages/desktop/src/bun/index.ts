import Electrobun, { BrowserWindow, ApplicationMenu } from "electrobun/bun";
import { appendFileSync, mkdirSync, renameSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { buildApplicationMenu } from "./menu";
import { startUiServer } from "./server";

// A packaged app launched from Finder inherits no terminal: every console call
// and every crash goes to a void, so "the app just closed" is unreportable and
// undebuggable. Mirror console output to a file under ~/Library/Logs/Hance and
// record the uncaught failures that take the process (and the window) down.
const LOG_MAX_BYTES = 5 * 1024 * 1024;

// One generation of history: hance.log.1 is the previous session's tail, which
// is usually where the crash that made someone go looking actually happened.
function rotateIfLarge(logPath: string): void {
  try {
    if (statSync(logPath).size < LOG_MAX_BYTES) return;
    renameSync(logPath, `${logPath}.1`);
  } catch {} // Missing file (first run) or an unrenamable one: keep appending.
}

function startLogging(): void {
  const logPath = join(homedir(), "Library", "Logs", "Hance", "hance.log");
  let fileLogging = true;
  try {
    mkdirSync(join(homedir(), "Library", "Logs", "Hance"), { recursive: true });
  } catch {
    // No log dir means no file logging; never take the app down over it. The
    // crash handlers below still matter — they are what turns "the app just
    // closed" into a message on stderr for a terminal-launched run.
    fileLogging = false;
  }

  if (fileLogging) {
    rotateIfLarge(logPath);
    for (const level of ["log", "warn", "error"] as const) {
      const original = console[level].bind(console);
      console[level] = (...args: unknown[]) => {
        original(...args);
        if (!fileLogging) return;
        const text = args.map(a => (typeof a === "string" ? a : Bun.inspect(a))).join(" ");
        try {
          appendFileSync(logPath, `${new Date().toISOString()} [${level}] ${text}\n`);
        } catch {
          // A log file that has become unwritable (ownership, full disk) would
          // otherwise cost a failed syscall on every console call for the rest
          // of the session. Give up on the file, keep the console.
          fileLogging = false;
        }
      };
    }
  }

  // Log, then still die: swallowing an uncaught exception would leave a
  // half-dead app whose window is up but whose server is gone, which is worse
  // than closing.
  process.on("uncaughtException", err => {
    console.error("uncaughtException:", err);
    process.exit(1);
  });
  // A rejection is not the same: one missed `await` anywhere in the UI server
  // should not close the user's window mid-export. Record it and stay up.
  process.on("unhandledRejection", reason => {
    console.error("unhandledRejection:", reason);
  });

  console.log(`Hance starting (pid ${process.pid}, bun ${Bun.version})`);
}

function createMainWindow(url: string): BrowserWindow {
  return new BrowserWindow({
    title: "Hance",
    url,
    titleBarStyle: "hiddenInset",
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
  console.error(`ui server not responding at ${url} after ${timeoutMs}ms; loading anyway`);
}

let mainWindow: BrowserWindow | null = null;

async function main(): Promise<void> {
  startLogging();
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
