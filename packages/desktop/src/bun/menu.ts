// Application menu definition for the desktop shell. Only a type-only import
// from electrobun so it can be unit-tested without booting the native layer;
// src/bun/index.ts passes the result to ApplicationMenu.setApplicationMenu().
import type { ApplicationMenuItemConfig } from "electrobun/bun";

// Custom menu actions forwarded into the webview as a "hance:menu"
// CustomEvent (see index.ts); the React app maps them to handlers.
export const MENU_ACTIONS = {
  openFile: "open-file",
  saveLook: "save-look",
  saveLookAsNew: "save-look-as-new",
  export: "export",
} as const;

export function buildApplicationMenu(): ApplicationMenuItemConfig[] {
  return [
    {
      submenu: [
        { role: "hide" },
        { role: "hideOthers" },
        { role: "showAll" },
        { type: "separator" },
        { role: "quit" },
      ],
    },
    {
      label: "File",
      submenu: [
        { label: "Open…", action: MENU_ACTIONS.openFile, accelerator: "CmdOrCtrl+O" },
        { type: "separator" },
        { label: "Save Look", action: MENU_ACTIONS.saveLook, accelerator: "CmdOrCtrl+S" },
        { label: "Save As New Look…", action: MENU_ACTIONS.saveLookAsNew, accelerator: "CmdOrCtrl+Shift+S" },
        { type: "separator" },
        { label: "Export…", action: MENU_ACTIONS.export, accelerator: "CmdOrCtrl+E" },
      ],
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "pasteAndMatchStyle" },
        { role: "delete" },
        { role: "selectAll" },
      ],
    },
    {
      label: "View",
      submenu: [{ role: "toggleFullScreen" }],
    },
    {
      label: "Window",
      submenu: [{ role: "minimize" }, { role: "zoom" }],
    },
  ];
}
