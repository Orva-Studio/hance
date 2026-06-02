import { describe, expect, test } from "bun:test";
import { EFFECT_SCHEMA, getDefaults, seedDefaults } from "../src/schema";

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
    expect(defaults["split-tone-mode"]).toBe("natural");
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
