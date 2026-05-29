import { describe, it, expect } from "bun:test";
import { formatConfig } from "../../src/commands/config";

describe("formatConfig", () => {
  it("reports the active source and merged values", () => {
    const out = formatConfig({ preset: "clay", codec: "h265" }, "/home/u/.config/hance/config.json", null);
    expect(out).toContain("Active config: /home/u/.config/hance/config.json");
    expect(out).toContain(`"preset": "clay"`);
    expect(out).toContain(`"codec": "h265"`);
  });

  it("lists searched paths when no config is found", () => {
    const out = formatConfig({}, null, null);
    expect(out).toContain("No config file found");
    expect(out).toContain(".hancerc.json");
    expect(out).toContain("config.json");
  });

  it("shows the local path that was searched", () => {
    const out = formatConfig({}, null, "/proj/.hancerc.json");
    expect(out).toContain("/proj/.hancerc.json");
  });
});
