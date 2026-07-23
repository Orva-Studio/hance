---
title: Desktop App
description: "The macOS desktop app: a native shell around the hance editor, currently in beta."
---

Hance ships a native desktop app for macOS.
It wraps the same editor as the [browser UI](/docs/browser-ui/) in a native window, with a Finder-native file picker, a native application menu, and a recents screen that remembers your past edits.

:::caution[Beta, macOS only]
The desktop app is currently in **beta**: expect rough edges.
It is **macOS only** for now.
Download the latest build from the [GitHub Releases page](https://github.com/Orva-Studio/hance/releases).
:::

## Why a desktop app

The desktop app reuses the browser editor's UI almost entirely; it is a thin native shell (Electrobun) around the same React app and Bun server the browser build uses.
Running it gets you a few things a browser tab can't give you.

## Landing screen

Opening the app shows a landing screen instead of an empty editor.

- Drag and drop a file, or click to open the **native Finder picker** (no HTML file input).
- **Recent files** are listed with a thumbnail for each, showing the look currently applied to that file, so you can see and resume past edits at a glance.
- A **Home** button in the top bar returns to this screen from the editor at any time.

## Native application menu

The desktop app has a real macOS menu bar with keyboard shortcuts wired to the editor, instead of on-screen buttons only:

| Action | Shortcut |
|---|---|
| Open… | `Cmd+O` |
| Save Look | `Cmd+S` |
| Save As New Look… | `Cmd+Shift+S` |
| Export… | `Cmd+E` |
| Undo | `Cmd+Z` |
| Redo | `Cmd+Shift+Z` |

:::note
Undo and Redo are wired to the editor's own edit history, not the OS's native undo.
If a text field is focused, standard text-field undo still works as expected.
:::

An **About Hance** panel is available from the app menu.

## Native playback and export path

Files opened via the native picker or the recents list are opened by path rather than uploaded into the page.
The editor tries native `<video>` playback first for any file, in the browser UI and the desktop app alike.

The difference on desktop is what happens when that native playback fails, which is the case for the browser's H.264 proxy step described in the [Browser UI docs](/docs/browser-ui/#upload--preview) for formats such as ProRes: the desktop app's WKWebView can decode ProRes natively via AVFoundation, so it usually never needs the transcoded proxy at all.
When a proxy is still needed, it reads and writes the file in place on disk instead of uploading it, and export reads the source in place as well.

## Native window chrome

The window uses a `hiddenInset` titlebar with the standard macOS traffic lights, and a compact top bar built to sit alongside them.

## Running it

The desktop app runs as a standalone application. There's no browser tab to keep open and no need to run `hance ui` yourself; the app starts its own local server internally and points its window at it.

See the [Browser UI](/docs/browser-ui/) page for a full tour of the editor itself: panels, view modes, looks, and export all work the same way in both.
