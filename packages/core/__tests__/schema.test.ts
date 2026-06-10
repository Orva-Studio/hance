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

  test("legacy grain-amount maps to the equivalent intensity ISO", () => {
    // Old shader: amount * iso/400. New: iso/3200. Default amount 0.125 at
    // the old default ISO 400 must land back on ISO 400.
    const out = migrateLegacyParams({ "grain-amount": 0.125 });
    expect(out["grain-iso"]).toBe(400);
    expect(out["grain-amount"]).toBeUndefined();
  });

  test("legacy grain-amount combines with an old multiplier-style ISO", () => {
    const out = migrateLegacyParams({ "grain-amount": 0.25, "grain-iso": 800 });
    expect(out["grain-iso"]).toBe(1600); // 8 * 0.25 * 800
  });

  test("migrated grain ISO snaps to the 50 grid and clamps to range", () => {
    expect(migrateLegacyParams({ "grain-amount": 0.03 })["grain-iso"]).toBe(100);
    expect(migrateLegacyParams({ "grain-amount": 1, "grain-iso": 3200 })["grain-iso"]).toBe(3200);
  });

  test("zero or near-zero legacy grain-amount keeps grain off (ISO 0)", () => {
    expect(migrateLegacyParams({ "grain-amount": 0 })["grain-iso"]).toBe(0);
    expect(migrateLegacyParams({ "grain-amount": 0.005 })["grain-iso"]).toBe(0);
  });

  test("grain-defocus is dropped", () => {
    const out = migrateLegacyParams({ "grain-defocus": 1 });
    expect(out["grain-defocus"]).toBeUndefined();
    expect(out["grain-iso"]).toBeUndefined(); // no amount → ISO untouched
  });

  test("weak or absent legacy fade-tint maps to neutral fade color", () => {
    expect(migrateLegacyParams({ "fade-tint": 0, "fade-hue": 190 })["fade-color"]).toBe("neutral");
    expect(migrateLegacyParams({ "fade-hue": 190 })["fade-color"]).toBe("neutral");
  });

  test("strong legacy fade tint maps to the nearest named fade color", () => {
    expect(migrateLegacyParams({ "fade-tint": 0.7, "fade-hue": 190 })["fade-color"]).toBe("teal");
    expect(migrateLegacyParams({ "fade-tint": 0.7, "fade-hue": 150 })["fade-color"]).toBe("green");
    expect(migrateLegacyParams({ "fade-tint": 0.7, "fade-hue": 20 })["fade-color"]).toBe("warm");
    expect(migrateLegacyParams({ "fade-tint": 0.7, "fade-hue": 350 })["fade-color"]).toBe("warm"); // wraps
    const out = migrateLegacyParams({ "fade-tint": 0.7, "fade-hue": 300 });
    expect(out["fade-color"]).toBe("magenta");
    expect(out["fade-tint"]).toBeUndefined();
    expect(out["fade-hue"]).toBeUndefined();
  });

  test("explicit fade-color in the same layer wins over migrated value", () => {
    const out = migrateLegacyParams({ "fade-tint": 0.7, "fade-hue": 190, "fade-color": "warm" });
    expect(out["fade-color"]).toBe("warm");
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

describe("colorWheels schema", () => {
  const group = EFFECT_SCHEMA.find(g => g.key === "colorWheels")!;

  test("group exists with enable key", () => {
    expect(group).toBeDefined();
    expect(group.enableKey).toBe("no-color-wheels");
    expect(group.options.length).toBe(9);
  });

  test("all nine options are ranges with neutral defaults", () => {
    const expectNeutral = (key: string, def: number) => {
      const opt = group.options.find(o => o.key === key)!;
      expect(opt.type).toBe("range");
      expect(opt.default).toBe(def);
    };
    for (const ch of ["r", "g", "b"]) {
      expectNeutral(`lift-${ch}`, 0);
      expectNeutral(`gamma-${ch}`, 1);
      expectNeutral(`gain-${ch}`, 1);
    }
  });

  test("getDefaults seeds neutral color wheel values", () => {
    const d = getDefaults();
    expect(d["lift-r"]).toBe(0);
    expect(d["gamma-g"]).toBe(1);
    expect(d["gain-b"]).toBe(1);
  });
});
