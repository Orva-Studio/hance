import { describe, expect, test } from "bun:test";
import { EFFECT_SCHEMA, getDefaults, seedDefaults, migrateLegacyParams } from "../src/schema";

describe("EFFECT_SCHEMA", () => {
  test("every option has required fields", () => {
    for (const group of EFFECT_SCHEMA) {
      expect(group.key).toBeDefined();
      expect(group.label).toBeDefined();
      for (const opt of group.options) {
        expect(opt.key).toBeDefined();
        expect(opt.label).toBeDefined();
        expect(opt.type).toBeDefined();
        if (opt.type === "range") {
          expect(opt.min).toBeDefined();
          expect(opt.max).toBeDefined();
          expect(opt.step).toBeDefined();
        }
      }
    }
  });

  test("getDefaults returns flat PresetData matching default.json keys", () => {
    const defaults = getDefaults();
    expect(defaults["exposure"]).toBe(0);
    expect(defaults["halation-amount"]).toBe(0.25);
    expect(defaults["split-tone-shadow-hue"]).toBe(30);
    expect(defaults["split-tone-highlight-hue"]).toBe(210);
    expect(defaults["split-tone-highlight-strength"]).toBe(0.5);
  });
});

describe("migrateLegacyParams", () => {
  test("passes through layers without legacy keys untouched", () => {
    const layer = { exposure: 1, "split-tone-shadow-hue": 100 };
    expect(migrateLegacyParams(layer)).toBe(layer);
  });

  test("legacy natural hue maps to matching per-band hues at default strength", () => {
    const out = migrateLegacyParams({ "split-tone-hue": 35, "split-tone-mode": "natural" });
    expect(out["split-tone-shadow-hue"]).toBe(35);
    expect(out["split-tone-highlight-hue"]).toBe(35);
    expect(out["split-tone-highlight-strength"]).toBeUndefined();
    expect(out["split-tone-hue"]).toBeUndefined();
    expect(out["split-tone-mode"]).toBeUndefined();
  });

  test("legacy complementary hue maps to opposite hues at full strength", () => {
    // Old complementary tinted highlights at the full shadow scale (0.3);
    // strength 1 preserves that exact look against the new 0.5 default.
    const out = migrateLegacyParams({ "split-tone-hue": 200, "split-tone-mode": "complementary" });
    expect(out["split-tone-shadow-hue"]).toBe(200);
    expect(out["split-tone-highlight-hue"]).toBe(20); // 380 wraps
    expect(out["split-tone-highlight-strength"]).toBe(1);
  });

  test("explicit new keys in the same layer win over migrated values", () => {
    const out = migrateLegacyParams({ "split-tone-hue": 200, "split-tone-shadow-hue": 90 });
    expect(out["split-tone-shadow-hue"]).toBe(90);
    expect(out["split-tone-highlight-hue"]).toBe(200); // natural fallback from legacy hue
  });

  test("seedDefaults migrates each layer, later layers still win", () => {
    const merged = seedDefaults(
      { "split-tone-hue": 20, "split-tone-mode": "natural" },
      { "split-tone-hue": 220, "split-tone-mode": "complementary" },
    );
    expect(merged["split-tone-shadow-hue"]).toBe(220);
    expect(merged["split-tone-highlight-hue"]).toBe(40);
    expect(merged["split-tone-highlight-strength"]).toBe(1);
    expect(merged["split-tone-hue"]).toBeUndefined();
    expect(merged["split-tone-mode"]).toBeUndefined();
  });
});

describe("seedDefaults", () => {
  test("returns every schema default when given no layers", () => {
    expect(seedDefaults()).toEqual(getDefaults());
  });

  test("later layers override earlier ones and the defaults", () => {
    const merged = seedDefaults({ exposure: 1 }, { exposure: 2, contrast: 0.5 });
    expect(merged["exposure"]).toBe(2);
    expect(merged["contrast"]).toBe(0.5);
    expect(merged["halation-amount"]).toBe(0.25); // untouched default
  });

  test("undefined values in a layer never clobber a default", () => {
    const merged = seedDefaults({ exposure: undefined }, undefined);
    expect(merged["exposure"]).toBe(0);
  });

  test("every exposed param is defined and non-NaN after seeding a sparse look", () => {
    const merged = seedDefaults({ exposure: 0.5 });
    for (const key of Object.keys(getDefaults())) {
      const v = merged[key];
      expect(v).toBeDefined();
      if (typeof v === "number") expect(Number.isNaN(v)).toBe(false);
    }
  });
});
