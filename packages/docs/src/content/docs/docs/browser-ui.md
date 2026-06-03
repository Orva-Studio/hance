---
title: Browser UI
description: "Full tour of the hance browser-based editor: panels, view modes, and export."
---

The hance browser-based editor previews looks in real-time on your footage, rendering effects on the GPU via WebGPU. This page documents every panel and feature.

## Launching

```bash
hance ui                      # open http://localhost:4800 in your browser
hance ui path/to/video.mp4    # launch with a file preloaded
hance ui --port 5000          # use a custom port
hance ui --no-open            # start the server without opening a browser
```

Using an AI agent? The [`/hance ui`](/docs/agent/overview/) skill command opens the editor too: `/hance ui my-video.mp4`.

## Upload & preview

Drag and drop a video or image into the editor, or pass a file path when launching. The preview updates in real-time as you adjust parameters.

*<!-- Screenshot: upload zone / main preview -->*

## Looks panel

Browse and apply any of the 40+ built-in film stock looks. Click a look to preview it instantly on your footage. Each look shows a thumbnail preview so you can compare at a glance.

*<!-- Screenshot: looks panel with thumbnails -->*

## Adjustments panel

Fine-tune every effect parameter with sliders. All the same controls available on the CLI (colour, halation, bloom, grain, vignette, split tone, aberration, and camera shake), grouped into collapsible sections.

*<!-- Screenshot: adjustments panel with sliders -->*

## View modes

Switch between three view modes to evaluate your grade:

- **Normal**: full-screen preview of the graded result
- **Split**: side-by-side comparison of the original and graded frames
- **Reference**: compare against a reference image

*<!-- Screenshot: split view mode -->*

## Timeline

For video files, a timeline scrubber lets you navigate through your footage and preview the look at any point. Frame-accurate seeking so you can check how the grade looks across different scenes.

*<!-- Screenshot: timeline scrubber -->*

## Undo / redo

Full undo/redo history for parameter changes. Experiment freely; you can always step back.

## Zoom & pan

Zoom into your footage to inspect grain, halation, and other fine details at pixel level. Multiple zoom levels available, plus a pan mode for navigating zoomed-in frames.

## Save & create looks

Save your current settings as a new `.hlook` file directly from the UI. Saved looks appear in the looks panel and can be used from the CLI with `--preset <name>`.

*<!-- Screenshot: save look modal -->*

## Export

Export your graded video or image from the editor. Choose codec, quality, and export preset: the same options available on the CLI.

*<!-- Screenshot: export modal -->*
