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
