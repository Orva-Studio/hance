import { describe, it, expect } from "bun:test";
import {
  CUBE_SIZE, LOSSY_EFFECTS, activeLossyEffects, cubeBakeParams,
  identityCubeImage, formatCube, cubeFilename,
} from "../src/lut-export";
import { EFFECT_SCHEMA } from "../src/schema";

describe("identityCubeImage", () => {
  it("emits every colour once, R fastest and B slowest", () => {
    const size = 4;
    const { data, width, height } = identityCubeImage(size);
    expect(width).toBe(size * size);
    expect(height).toBe(size);
    expect(data.length).toBe(size * size * size * 4);

    // First entry is black, last is white.
    expect(Array.from(data.slice(0, 4))).toEqual([0, 0, 0, 255]);
    expect(Array.from(data.slice(-4))).toEqual([255, 255, 255, 255]);

    // Second entry advances R only; the (size)th advances G with R back to 0.
    expect(Array.from(data.slice(4, 8))).toEqual([85, 0, 0, 255]);
    expect(Array.from(data.slice(size * 4, size * 4 + 4))).toEqual([0, 85, 0, 255]);
  });

  it("covers the full 0-255 range at the default size", () => {
    const { data } = identityCubeImage();
    expect(data.length).toBe(CUBE_SIZE ** 3 * 4);
    expect(data[0]).toBe(0);
    expect(data[data.length - 2]).toBe(255);
  });
});

describe("formatCube", () => {
  it("writes a parseable header and one line per entry", () => {
    const size = 2;
    const { data } = identityCubeImage(size);
    const text = formatCube(data, size, "Kodak Gold");
    const lines = text.trim().split("\n");

    expect(lines[0]).toBe('TITLE "Kodak Gold"');
    expect(lines[1]).toBe("LUT_3D_SIZE 2");
    expect(lines).toContain("DOMAIN_MIN 0.0 0.0 0.0");
    expect(lines).toContain("DOMAIN_MAX 1.0 1.0 1.0");

    const entries = lines.filter(l => /^[\d.]+ [\d.]+ [\d.]+$/.test(l) && !l.startsWith("DOMAIN"));
    expect(entries.length).toBe(size ** 3);
    expect(entries[0]).toBe("0.000000 0.000000 0.000000");
    expect(entries.at(-1)).toBe("1.000000 1.000000 1.000000");
  });

  it("strips quotes and newlines that would corrupt the title line", () => {
    const { data } = identityCubeImage(2);
    const text = formatCube(data, 2, 'Look "A"\nLUT_3D_SIZE 99');
    expect(text.split("\n")[0]).toBe('TITLE "Look  A  LUT_3D_SIZE 99"');
    expect(text.split("\n")[1]).toBe("LUT_3D_SIZE 2");
  });

  it("falls back to a default title when nothing usable is left", () => {
    const { data } = identityCubeImage(2);
    expect(formatCube(data, 2, '""').split("\n")[0]).toBe('TITLE "Hance"');
  });

  // Endpoints alone survive a channel swap or a transposed walk, so assert
  // lines that move one axis at a time: entry 1 advances R, entry `size`
  // advances G, entry `size^2` advances B. This is the assertion that catches a
  // cube serialised BGR or walked B-first.
  it("keeps R fastest and B slowest in the emitted entries", () => {
    const size = 4;
    const { data } = identityCubeImage(size);
    const entries = formatCube(data, size).trim().split("\n").slice(5);

    expect(entries[0]).toBe("0.000000 0.000000 0.000000");
    expect(entries[1]).toBe("0.333333 0.000000 0.000000");
    expect(entries[size]).toBe("0.000000 0.333333 0.000000");
    expect(entries[size * size]).toBe("0.000000 0.000000 0.333333");
  });

  it("rejects a readback that is not exactly the cube size", () => {
    expect(() => formatCube(new Uint8Array(16), 33)).toThrow(/Expected exactly/);
    // A 256-aligned readback is longer, not shorter — the failure mode that
    // would silently shift every entry past the first row.
    const padded = new Uint8Array(33 ** 3 * 4 + 252 * 33);
    expect(() => formatCube(padded, 33)).toThrow(/Expected exactly/);
  });
});

describe("cubeBakeParams", () => {
  it("forces every non-bakeable effect off without touching the rest", () => {
    const baked = cubeBakeParams({ exposure: 0.5, "halation-amount": 0.8 });
    expect(baked.exposure).toBe(0.5);
    expect(baked["halation-amount"]).toBe(0.8); // value kept; the pass is what's off
    for (const effect of LOSSY_EFFECTS) {
      expect(baked[effect.enableKey]).toBe(true);
    }
  });

  it("does not mutate the caller's params", () => {
    const params = { exposure: 0.5 };
    cubeBakeParams(params);
    expect(params).toEqual({ exposure: 0.5 });
  });
});

describe("activeLossyEffects", () => {
  it("reports only effects the look is actually using", () => {
    const allOff = Object.fromEntries(LOSSY_EFFECTS.map(e => [e.enableKey, true]));
    expect(activeLossyEffects(allOff)).toEqual([]);

    const grainOn = { ...allOff, "no-grain": false };
    expect(activeLossyEffects(grainOn).map(e => e.label)).toEqual(["Grain"]);
  });

  it("treats an unset flag as the effect being on", () => {
    expect(activeLossyEffects({}).length).toBe(LOSSY_EFFECTS.length);
  });
});

// LOSSY_EFFECTS is only correct relative to the effects that exist. If a new
// group lands in EFFECT_SCHEMA, someone has to decide whether a colour->colour
// mapping can carry it; this fails until they do.
describe("LOSSY_EFFECTS vs EFFECT_SCHEMA", () => {
  const BAKEABLE = [
    "no-input-lut", "no-color-settings", "no-film-density",
    "no-split-tone", "no-color-wheels",
  ];

  it("classifies every effect in the schema as bakeable or not", () => {
    const schemaKeys = EFFECT_SCHEMA.map(group => group.enableKey).sort();
    const classified = [...BAKEABLE, ...LOSSY_EFFECTS.map(e => e.enableKey)].sort();
    expect(classified).toEqual(schemaKeys);
  });

  it("names effects that actually exist", () => {
    const schemaKeys = new Set(EFFECT_SCHEMA.map(group => group.enableKey));
    for (const effect of LOSSY_EFFECTS) {
      expect(schemaKeys.has(effect.enableKey)).toBe(true);
    }
  });
});

describe("cubeFilename", () => {
  it("names the file after the look", () => {
    expect(cubeFilename("Kodak Gold")).toBe("Kodak Gold.cube");
  });

  it("strips path separators and falls back when unnamed", () => {
    expect(cubeFilename("a/b:c")).toBe("abc.cube");
    expect(cubeFilename(null)).toBe("Hance.cube");
    expect(cubeFilename("   ")).toBe("Hance.cube");
  });
});
