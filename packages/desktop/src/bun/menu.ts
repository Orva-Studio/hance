// Application menu definition for the desktop shell. Only a type-only import
// from electrobun so it can be unit-tested without booting the native layer;
// src/bun/index.ts passes the result to ApplicationMenu.setApplicationMenu().
import type { ApplicationMenuItemConfig } from "electrobun/bun";

// Custom menu actions forwarded into the webview as a "hance:menu"
// CustomEvent (see index.ts); the React app maps them to handlers.
export const MENU_ACTIONS = {
  about: "about",
  openFile: "open-file",
  saveLook: "save-look",
  saveLookAsNew: "save-look-as-new",
  export: "export",
  undo: "undo",
  redo: "redo",
} as const;

export function buildApplicationMenu(): ApplicationMenuItemConfig[] {
  return [
    {
      submenu: [
        // Custom action, not the "about" role: the role opens macOS's native
        // panel (name/version only), and we want our own view so the pro
        // license section (added in a later ticket) can live alongside it.
        { label: "About Hance", action: MENU_ACTIONS.about },
        { type: "separator" },
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
        // Custom actions, not native roles: the app has its own edit history,
        // and a native role would swallow cmd+Z before the webview sees it.
        // The web app falls back to text-field undo when an input is focused.
        { label: "Undo", action: MENU_ACTIONS.undo, accelerator: "CmdOrCtrl+Z" },
        { label: "Redo", action: MENU_ACTIONS.redo, accelerator: "CmdOrCtrl+Shift+Z" },
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
