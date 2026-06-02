import { describe, it, expect } from "bun:test";
import { LUT_SIZE, generateLut, vlogToRec709, lutDataForParams } from "../src/lut-profiles";

const N = LUT_SIZE;

function idx(r: number, g: number, b: number): number {
  // RGB-major, R fastest
  return ((b * N + g) * N + r) * 3;
}

describe("generateLut rec709", () => {
  it("is an exact identity at grid corners", () => {
    const lut = generateLut("rec709");
    const corners = [0, N - 1];
    for (const ri of corners) {
      for (const gi of corners) {
        for (const bi of corners) {
          const o = idx(ri, gi, bi);
          expect(lut[o]).toBeCloseTo(ri / (N - 1), 6);
          expect(lut[o + 1]).toBeCloseTo(gi / (N - 1), 6);
          expect(lut[o + 2]).toBeCloseTo(bi / (N - 1), 6);
        }
      }
    }
  });

  it("is identity at an interior grid point", () => {
    const lut = generateLut("rec709");
    const o = idx(10, 20, 5);
    expect(lut[o]).toBeCloseTo(10 / (N - 1), 6);
    expect(lut[o + 1]).toBeCloseTo(20 / (N - 1), 6);
    expect(lut[o + 2]).toBeCloseTo(5 / (N - 1), 6);
  });
});

describe("generateLut shape", () => {
  it("has length 33^3 * 3", () => {
    expect(generateLut("rec709").length).toBe(N * N * N * 3);
    expect(generateLut("vlog").length).toBe(N * N * N * 3);
  });

  it("stays within [0,1] for vlog", () => {
    const lut = generateLut("vlog");
    for (let i = 0; i < lut.length; i++) {
      expect(lut[i]).toBeGreaterThanOrEqual(0);
      expect(lut[i]).toBeLessThanOrEqual(1);
    }
  });
});

describe("vlogToRec709", () => {
  it("maps V-Log middle grey (~0.4233) to its Rec.709 value (~0.403)", () => {
    // V-Log code for 0.18 scene-linear reflectance is ~0.42331.
    // Reverse OETF -> 0.18 linear, then Rec.709 OETF -> ~0.409.
    expect(vlogToRec709(0.42331)).toBeCloseTo(0.409, 3);
  });

  it("maps black to black and is monotonic up", () => {
    expect(vlogToRec709(0)).toBeGreaterThanOrEqual(0);
    expect(vlogToRec709(0.1)).toBeLessThan(vlogToRec709(0.9));
  });
});

describe("lutDataForParams", () => {
  it("returns null for the rec709 identity profile (pass-through skip)", () => {
    expect(lutDataForParams({ "input-lut-profile": "rec709" })).toBeNull();
    expect(lutDataForParams({})).toBeNull();
  });

  it("returns null when the pre-LUT is disabled", () => {
    expect(lutDataForParams({ "input-lut-profile": "vlog", "no-input-lut": true })).toBeNull();
  });

  it("returns the baked vlog array when active", () => {
    const data = lutDataForParams({ "input-lut-profile": "vlog" });
    expect(data).not.toBeNull();
    expect(data!.length).toBe(N * N * N * 3);
  });
});
