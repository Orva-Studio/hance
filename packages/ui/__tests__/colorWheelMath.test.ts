import { describe, test, expect } from "bun:test";
import { rgbFromWheel, wheelFromRgb, ZONES, type Zone } from "../app/components/colorWheelMath";

describe("colorWheelMath", () => {
  test("centered puck with neutral master is a no-op for every zone", () => {
    for (const zone of Object.keys(ZONES) as Zone[]) {
      const n = ZONES[zone].neutral;
      expect(rgbFromWheel(zone, 0, 0, n)).toEqual([n, n, n]);
    }
  });

  test("round-trips puck position and master", () => {
    for (const zone of Object.keys(ZONES) as Zone[]) {
      const n = ZONES[zone].neutral;
      const rgb = rgbFromWheel(zone, 0.4, -0.3, n + 0.1);
      const w = wheelFromRgb(zone, rgb[0], rgb[1], rgb[2]);
      expect(w.x).toBeCloseTo(0.4, 5);
      expect(w.y).toBeCloseTo(-0.3, 5);
      expect(w.master).toBeCloseTo(n + 0.1, 5);
    }
  });

  test("pushing toward red raises R and lowers G/B equally", () => {
    const [r, g, b] = rgbFromWheel("lift", 1, 0, 0);
    expect(r).toBeGreaterThan(0);
    expect(g).toBeLessThan(0);
    expect(g).toBeCloseTo(b, 5);
    expect(r + g + b).toBeCloseTo(0, 5); // mean-neutral: master unchanged
  });

  test("clamps to the zone's schema range", () => {
    const [r] = rgbFromWheel("gain", 1, 0, 4); // master at max, push red further
    expect(r).toBeLessThanOrEqual(4);
  });
});
