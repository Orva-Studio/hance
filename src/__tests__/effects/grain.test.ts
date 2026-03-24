import { describe, it, expect } from "bun:test";
import { grainFilter } from "../../effects/grain";
import type { GrainOptions } from "../../types";

const defaults: GrainOptions = {
  enabled: true,
  amount: 0.125,
  size: 0,
  softness: 0.1,
  saturation: 0.3,
  imageDefocus: 1,
};

describe("grainFilter", () => {
  it("returns passthrough when disabled", () => {
    const result = grainFilter("ab_out", { ...defaults, enabled: false });
    expect(result.output).toBe("grain_out");
    expect(result.fragment).toContain("null");
  });

  it("generates noise overlay with blend", () => {
    const result = grainFilter("ab_out", defaults);
    expect(result.output).toBe("grain_out");
    expect(result.fragment).toContain("[ab_out]");
    expect(result.fragment).toContain("noise=");
    expect(result.fragment).toContain("blend=");
  });

  it("applies image defocus via gblur when > 0", () => {
    const result = grainFilter("ab_out", { ...defaults, imageDefocus: 1.5 });
    expect(result.fragment).toContain("gblur=");
  });

  it("skips defocus blur when imageDefocus is 0", () => {
    const result = grainFilter("ab_out", { ...defaults, imageDefocus: 0, softness: 0, size: 0 });
    expect(result.fragment).not.toContain("gblur=");
  });
});
