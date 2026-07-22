import { test, expect } from "bun:test";
import { renderToString } from "react-dom/server";
import { AboutModal } from "../app/components/AboutModal";

test("renders app name, description, and copyright", () => {
  const html = renderToString(<AboutModal onClose={() => {}} />);
  expect(html).toContain("Hance");
  expect(html).toContain("Cinematic film effects");
  expect(html).toContain("Copyright");
  expect(html).toContain(String(new Date().getFullYear()));
  expect(html).toContain("Orva Studio.");
  expect(html).toContain("Uses FFmpeg under the LGPL.");
});

test("shows loading state before the version fetch resolves", () => {
  const html = renderToString(<AboutModal onClose={() => {}} />);
  expect(html).toContain("Loading version…");
});
