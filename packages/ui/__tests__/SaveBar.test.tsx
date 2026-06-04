import { test, expect } from "bun:test";
import { renderToString } from "react-dom/server";
import { SaveBar } from "../app/components/SaveBar";

test("renders 'Save Look' when dirty", () => {
  const html = renderToString(
    <SaveBar hasChanges={true} onSave={() => {}} onSaveAsNew={() => {}} />
  );
  expect(html).toContain("Save Look");
  expect(html).not.toContain("Saved");
});

test("renders 'Look Saved ✓' when clean", () => {
  const html = renderToString(
    <SaveBar hasChanges={false} onSave={() => {}} onSaveAsNew={() => {}} />
  );
  expect(html).toContain("Look Saved");
  expect(html).toContain("✓");
});

test("always renders Save as New Look", () => {
  const clean = renderToString(
    <SaveBar hasChanges={false} onSave={() => {}} onSaveAsNew={() => {}} />
  );
  const dirty = renderToString(
    <SaveBar hasChanges={true} onSave={() => {}} onSaveAsNew={() => {}} />
  );
  expect(clean).toContain("Save as New Look");
  expect(dirty).toContain("Save as New Look");
});
