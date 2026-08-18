import { test, expect } from "bun:test";
import { renderToString } from "react-dom/server";
import { TopBar } from "../app/components/TopBar";

const baseProps = {
  filename: "clip.mov",
  params: {},
  renderer: null,
  isVideo: true,
  hasChanges: false,
  onSave: () => {},
  onSaveAsNew: () => {},
  onExportClick: () => {},
  onExportLutClick: () => {},
};

// isDesktop reads the global `location` directly, so simulate the desktop
// shell's `?desktop=1` query param around each desktop-scoped assertion.
function withDesktopLocation<T>(fn: () => T): T {
  const original = (globalThis as { location?: unknown }).location;
  (globalThis as { location?: unknown }).location = { search: "?desktop=1" };
  try {
    return fn();
  } finally {
    (globalThis as { location?: unknown }).location = original;
  }
}

test("renders a Home button in the desktop shell when a file is loaded and onHome is provided", () => {
  const file = new File([], "clip.mov", { type: "video/quicktime" });
  const html = withDesktopLocation(() =>
    renderToString(<TopBar {...baseProps} file={file} onHome={() => {}} />)
  );
  expect(html).toContain('aria-label="Home"');
});

test("omits the Home button when no file is loaded", () => {
  const html = withDesktopLocation(() =>
    renderToString(<TopBar {...baseProps} filename={null} file={null} onHome={() => {}} />)
  );
  expect(html).not.toContain('aria-label="Home"');
});

test("omits the Home button when onHome is not provided", () => {
  const file = new File([], "clip.mov", { type: "video/quicktime" });
  const html = withDesktopLocation(() =>
    renderToString(<TopBar {...baseProps} file={file} />)
  );
  expect(html).not.toContain('aria-label="Home"');
});

test("omits the Home button outside the desktop shell (browser UI), even with file and onHome", () => {
  const file = new File([], "clip.mov", { type: "video/quicktime" });
  const html = renderToString(<TopBar {...baseProps} file={file} onHome={() => {}} />);
  expect(html).not.toContain('aria-label="Home"');
});

const videoFile = new File([], "clip.mov", { type: "video/quicktime" });

// The finished export downloads itself, so a Download button in the done state
// just wrote a second, duplicate copy for anyone who clicked it.
test("shows a confirmation rather than a Download button once the export is done", () => {
  const html = renderToString(
    <TopBar
      {...baseProps}
      file={videoFile}
      exportProgress={{ state: "done", progress: 1, downloadUrl: "/api/download?path=out.mp4", error: null }}
    />
  );
  expect(html).toContain("Exported");
  expect(html).not.toContain("download");
  expect(html).not.toContain("/api/download");
});

test("offers Cancel while an export is rendering", () => {
  const html = renderToString(
    <TopBar
      {...baseProps}
      file={videoFile}
      exportProgress={{ state: "rendering", progress: 0.42, downloadUrl: null, error: null }}
      onCancelExport={() => {}}
    />
  );
  expect(html).toContain("Cancel");
  expect(html).toContain("42%");
});

test("offers Cancel while the source is still uploading", () => {
  const html = renderToString(
    <TopBar
      {...baseProps}
      file={videoFile}
      exportProgress={{ state: "uploading", progress: 0, downloadUrl: null, error: null }}
      onCancelExport={() => {}}
    />
  );
  expect(html).toContain("Cancel");
});

test("omits Cancel when the export is idle", () => {
  const html = renderToString(
    <TopBar {...baseProps} file={videoFile} onCancelExport={() => {}} />
  );
  expect(html).not.toContain("Cancel");
});
