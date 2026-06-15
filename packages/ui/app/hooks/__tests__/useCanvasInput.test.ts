import { describe, expect, test } from "bun:test";
import { nextZoom } from "../useCanvasInput";

describe("nextZoom", () => {
  test("steps up through the level ladder when zooming in", () => {
    expect(nextZoom(100, "in")).toBe(200);
    expect(nextZoom(25, "in")).toBe(50);
  });

  test("returns null at the top when zooming in further", () => {
    expect(nextZoom(400, "in")).toBeNull();
  });

  test("steps down through the ladder when zooming out", () => {
    expect(nextZoom(200, "out")).toBe(100);
    expect(nextZoom(50, "out")).toBe(25);
  });

  test('drops to "fit" below the lowest level', () => {
    expect(nextZoom(25, "out")).toBe("fit");
  });

  test('treats "fit" as 100% for stepping', () => {
    expect(nextZoom("fit", "in")).toBe(200);
    expect(nextZoom("fit", "out")).toBe(75);
  });
});
