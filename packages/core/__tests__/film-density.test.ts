import { describe, expect, test } from "bun:test";
import { filmDensityCurve, filmDensityUniform, isFilmDensityActive } from "../src/film-density";
import { FILM_DENSITY_PRESETS } from "../src/render-constants";

describe("film density curve", () => {
  test("endpoints and pivot are fixed regardless of gamma", () => {
    for (const [toe, shoulder] of [[1, 1], [0.6, 1.8], [1.8, 0.6]]) {
      expect(filmDensityCurve(0, toe, shoulder)).toBeCloseTo(0, 6);
      expect(filmDensityCurve(1, toe, shoulder)).toBeCloseTo(1, 6);
      expect(filmDensityCurve(0.5, toe, shoulder)).toBeCloseTo(0.5, 6);
    }
  });

  test("toe gamma < 1 lifts shadows (film-fog toe)", () => {
    expect(filmDensityCurve(0.25, 0.5, 1)).toBeGreaterThan(0.25);
  });

  test("toe gamma > 1 deepens shadows", () => {
    expect(filmDensityCurve(0.25, 2, 1)).toBeLessThan(0.25);
  });

  test("shoulder gamma < 1 rolls off highlights", () => {
    expect(filmDensityCurve(0.75, 1, 0.5)).toBeLessThan(0.75);
  });

  test("shoulder gamma > 1 crushes highlights harder", () => {
    expect(filmDensityCurve(0.75, 1, 2)).toBeGreaterThan(0.75);
  });

  test("monotonic across the range for a representative preset", () => {
    const { toe, shoulder } = FILM_DENSITY_PRESETS["warm-classic"];
    let prev = -Infinity;
    for (let i = 0; i <= 20; i++) {
      const x = i / 20;
      const y = filmDensityCurve(x, toe[0], shoulder[0]);
      expect(y).toBeGreaterThanOrEqual(prev);
      prev = y;
    }
  });
});

describe("isFilmDensityActive", () => {
  // Off by default (amount 0), like split-tone/color-wheels — an opt-in
  // creative choice, unlike the baseline halation/grain/vignette look.
  test("inactive by default", () => {
    expect(isFilmDensityActive({})).toBe(false);
  });

  test("active once amount is set", () => {
    expect(isFilmDensityActive({ "film-density-amount": 0.5 })).toBe(true);
  });

  test("inactive when disabled even with amount set", () => {
    expect(isFilmDensityActive({ "no-film-density": true, "film-density-amount": 0.5 })).toBe(false);
  });
});

describe("filmDensityUniform", () => {
  test("uses warm-classic preset values by default", () => {
    const u = filmDensityUniform({ "film-density-amount": 0.5 });
    const preset = FILM_DENSITY_PRESETS["warm-classic"];
    expect(u).toEqual([0.5, preset.toe[0], preset.toe[1], preset.toe[2], preset.shoulder[0], preset.shoulder[1], preset.shoulder[2], 0]);
  });

  test("falls back to warm-classic for an unknown preset name", () => {
    const u = filmDensityUniform({ "film-density-preset": "bogus" });
    expect(u[1]).toBe(FILM_DENSITY_PRESETS["warm-classic"].toe[0]);
  });
});
