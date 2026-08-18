import { test, expect } from "bun:test";
import { renderToString } from "react-dom/server";
import { LutExportModal } from "../app/components/LutExportModal";
import { LOSSY_EFFECTS } from "@hance/core";

const noop = () => {};

function render(params: Record<string, string | number | boolean>, lookName: string | null = "Kodak Gold") {
  return renderToString(
    <LutExportModal lookName={lookName} params={params} onCancel={noop} onExport={noop} />,
  );
}

test("names the file after the active look", () => {
  expect(render({})).toContain("Kodak Gold.cube");
});

test("warns about every effect the look uses that a LUT cannot carry", () => {
  const html = render({}); // no flags set = every effect on
  for (const effect of LOSSY_EFFECTS) {
    expect(html).toContain(effect.label);
    expect(html).toContain(effect.reason);
  }
});

test("lists only the effects actually in use", () => {
  const allOff = Object.fromEntries(LOSSY_EFFECTS.map(e => [e.enableKey, true]));
  const html = render({ ...allOff, "no-grain": false });
  expect(html).toContain("Grain");
  expect(html).not.toContain("Vignette");
});

test("says the LUT is exact when the look is colour-only", () => {
  const allOff = Object.fromEntries(LOSSY_EFFECTS.map(e => [e.enableKey, true]));
  const html = render(allOff);
  expect(html).toContain("will match it exactly");
  expect(html).not.toContain("won&#x27;t be included");
});

test("falls back to a default filename with no active look", () => {
  expect(render({}, null)).toContain("Hance.cube");
});
