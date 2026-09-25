import { test, expect, describe } from "bun:test";
import { sanitizeParams, gradableOptions, describeParams, buildSystemPrompt, groupsToEnable } from "../lib/ai-grade";

describe("gradableOptions", () => {
  test("covers colour and excludes optical and motion effects", () => {
    const keys = gradableOptions().map(o => o.key);
    expect(keys).toContain("exposure");
    expect(keys).toContain("white-balance");
    expect(keys).toContain("split-tone-amount");
    expect(keys).toContain("vignette-amount");
    expect(keys).not.toContain("grain-iso");
    expect(keys).not.toContain("halation-amount");
    expect(keys).not.toContain("camera-shake-amount");
  });
});

describe("prompt", () => {
  test("states the Kelvin direction, which models get backwards", () => {
    expect(buildSystemPrompt()).toContain("LOWER is warmer");
  });

  test("describes every gradable parameter", () => {
    const described = describeParams();
    for (const opt of gradableOptions()) expect(described).toContain(opt.key);
  });
});

describe("groupsToEnable", () => {
  test("switches on each group a proposal touches, once", () => {
    expect(groupsToEnable({ exposure: 0.3, contrast: 1.1, "vignette-amount": 0.4 }).sort())
      .toEqual(["no-color-settings", "no-vignette"]);
  });

  test("switches nothing on for an empty proposal", () => {
    expect(groupsToEnable({})).toEqual([]);
  });
});

describe("sanitizeParams", () => {
  test("keeps valid values", () => {
    expect(sanitizeParams({ exposure: 0.4, "white-balance": 4200 }))
      .toEqual({ exposure: 0.4, "white-balance": 4200 });
  });

  test("drops parameters that do not exist", () => {
    expect(sanitizeParams({ exposure: 0.2, teal_orange: 1, "grain-iso": 800 }))
      .toEqual({ exposure: 0.2 });
  });

  test("clamps values outside the schema range", () => {
    const out = sanitizeParams({ exposure: 99, "white-balance": -5 });
    expect(out.exposure).toBe(2);
    expect(out["white-balance"]).toBe(1000);
  });

  test("accepts a valid select value and rejects an invented one", () => {
    expect(sanitizeParams({ "fade-color": "teal" })).toEqual({ "fade-color": "teal" });
    expect(sanitizeParams({ "fade-color": "aubergine" })).toEqual({});
  });

  test("coerces numeric strings, which models often return", () => {
    expect(sanitizeParams({ exposure: "0.5" })).toEqual({ exposure: 0.5 });
  });

  test("drops values that are not numbers at all", () => {
    expect(sanitizeParams({ exposure: "warmer", contrast: null })).toEqual({});
  });

  test("survives junk input", () => {
    expect(sanitizeParams(null)).toEqual({});
    expect(sanitizeParams("nope")).toEqual({});
    expect(sanitizeParams([1, 2, 3])).toEqual({});
  });
});
