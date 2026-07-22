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

test("renders a Home button when a file is loaded and onHome is provided", () => {
  const file = new File([], "clip.mov", { type: "video/quicktime" });
  const html = renderToString(
    <TopBar {...baseProps} file={file} onHome={() => {}} />
  );
  expect(html).toContain('aria-label="Home"');
});

test("omits the Home button when no file is loaded", () => {
  const html = renderToString(
    <TopBar {...baseProps} filename={null} file={null} onHome={() => {}} />
  );
  expect(html).not.toContain('aria-label="Home"');
});

test("omits the Home button when onHome is not provided", () => {
  const file = new File([], "clip.mov", { type: "video/quicktime" });
  const html = renderToString(<TopBar {...baseProps} file={file} />);
  expect(html).not.toContain('aria-label="Home"');
});
