import { describe, it, expect } from "bun:test";
import { splitToneFilter } from "../../effects/splitTone";
import type { SplitToneOptions } from "../../types";

const defaults: SplitToneOptions = {
  enabled: true,
  mode: "natural",
  protectNeutrals: false,
  amount: 0.5,
  hueAngle: 20,
  pivot: 0.3,
};

describe("splitToneFilter", () => {
  it("returns passthrough when disabled", () => {
    const result = splitToneFilter("ab_out", { ...defaults, enabled: false });
    expect(result.output).toBe("splittone_out");
    expect(result.fragment).toContain("null");
  });

  it("returns fragment with colorbalance for split toning", () => {
    const result = splitToneFilter("ab_out", defaults);
    expect(result.output).toBe("splittone_out");
    expect(result.fragment).toContain("[ab_out]");
    expect(result.fragment).toContain("colorbalance=");
    expect(result.fragment).toContain("[splittone_out]");
  });

  it("applies hue angle to shadow/highlight color channels", () => {
    const result = splitToneFilter("ab_out", { ...defaults, hueAngle: 180 });
    expect(result.fragment).toContain("colorbalance=");
  });

  it("blends with original when protectNeutrals is true", () => {
    const result = splitToneFilter("ab_out", { ...defaults, protectNeutrals: true });
    expect(result.fragment).toContain("blend=");
  });
});
