import { test, expect } from "bun:test";
import { renderToString } from "react-dom/server";
import { ExportModal, crfForQuality, extForCodec } from "../app/components/ExportModal";

test("crfForQuality maps labels to numbers", () => {
  expect(crfForQuality("Visually Lossless")).toBe(17);
  expect(crfForQuality("High")).toBe(20);
  expect(crfForQuality("Medium")).toBe(23);
  expect(crfForQuality("Low")).toBe(28);
});

test("extForCodec maps codecs to extensions", () => {
  expect(extForCodec("H.264")).toBe("mp4");
  expect(extForCodec("H.265")).toBe("mp4");
  expect(extForCodec("ProRes 422")).toBe("mov");
});

test("renders Cancel and Export buttons", () => {
  const html = renderToString(
    <ExportModal
      defaultBasename="clip"
      onCancel={() => {}}
      onExport={() => {}}
    />
  );
  expect(html).toContain("Cancel");
  expect(html).toContain(">Export<");
});

test("default output path uses basename and mp4 (H.264 default)", () => {
  const html = renderToString(
    <ExportModal
      defaultBasename="clip"
      onCancel={() => {}}
      onExport={() => {}}
    />
  );
  expect(html).toContain("clip_hance.mp4");
});
