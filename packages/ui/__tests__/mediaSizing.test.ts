import { describe, expect, test } from "bun:test";
import { chooseExportSize, fitPreviewSize } from "../app/mediaSizing";

describe("fitPreviewSize", () => {
  test("caps large landscape media at 1080p", () => {
    expect(fitPreviewSize(3840, 2160)).toEqual({ width: 1920, height: 1080 });
  });

  test("caps large portrait media within the 1080p preview bounds", () => {
    expect(fitPreviewSize(2160, 3840)).toEqual({ width: 608, height: 1080 });
  });

  test("keeps smaller media at native size", () => {
    expect(fitPreviewSize(1280, 720)).toEqual({ width: 1280, height: 720 });
  });
});

describe("chooseExportSize", () => {
  test("exports at full source resolution when within the GPU limit", () => {
    expect(chooseExportSize(5472, 3648, 8192)).toEqual({
      width: 5472,
      height: 3648,
      clamped: false,
    });
  });

  test("clamps the long edge to the GPU limit, preserving aspect ratio", () => {
    expect(chooseExportSize(10000, 5000, 8192)).toEqual({
      width: 8192,
      height: 4096,
      clamped: true,
    });
  });

  test("clamps a tall portrait source by its height", () => {
    expect(chooseExportSize(5000, 10000, 8192)).toEqual({
      width: 4096,
      height: 8192,
      clamped: true,
    });
  });

  test("rejects a non-positive source size", () => {
    expect(() => chooseExportSize(0, 100, 8192)).toThrow();
  });
});
