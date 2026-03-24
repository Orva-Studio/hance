import { describe, it, expect } from "bun:test";
import { cameraShakeFilter } from "../../effects/cameraShake";
import type { CameraShakeOptions } from "../../types";

const defaults: CameraShakeOptions = {
  enabled: true,
  amount: 0.25,
  rate: 0.5,
};

describe("cameraShakeFilter", () => {
  it("returns passthrough when disabled", () => {
    const result = cameraShakeFilter("ab_out", { ...defaults, enabled: false });
    expect(result.output).toBe("shake_out");
    expect(result.fragment).toContain("null");
  });

  it("returns fragment with crop and scale for drift", () => {
    const result = cameraShakeFilter("ab_out", defaults);
    expect(result.output).toBe("shake_out");
    expect(result.fragment).toContain("[ab_out]");
    expect(result.fragment).toContain("crop=");
    expect(result.fragment).toContain("scale=");
  });

  it("uses sine-based expressions", () => {
    const result = cameraShakeFilter("ab_out", defaults);
    expect(result.fragment).toContain("sin(");
  });

  it("rate controls the frequency of shake", () => {
    const slow = cameraShakeFilter("ab_out", { ...defaults, rate: 0.1 });
    const fast = cameraShakeFilter("ab_out", { ...defaults, rate: 1.0 });
    // Higher rate = smaller period divisor = faster oscillation
    expect(slow.fragment).not.toBe(fast.fragment);
  });

  it("handles zero amount", () => {
    const result = cameraShakeFilter("ab_out", { ...defaults, amount: 0 });
    expect(result.output).toBe("shake_out");
    expect(result.fragment).toContain("null");
  });
});
