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

const ui = startUiServer();
ApplicationMenu.setApplicationMenu(buildApplicationMenu());
const win = createMainWindow(ui.url);

win.on("close", async () => {
  try {
    await ui.stop();
  } catch (err) {
    console.error("failed to stop ui server:", err);
  }
});

Electrobun.events.on("application-menu-clicked", (event) => {
  console.log("application menu clicked", event.data.action);
});
