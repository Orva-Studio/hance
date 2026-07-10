// Application menu definition for the desktop shell. Only a type-only import
// from electrobun so it can be unit-tested without booting the native layer;
// src/bun/index.ts passes the result to ApplicationMenu.setApplicationMenu().
import type { ApplicationMenuItemConfig } from "electrobun/bun";

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
