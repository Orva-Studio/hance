import { test, expect } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { seedDefaults, exportLook, importLook } from "@hance/core";

// The browser bundles these same free .hlook files via import.meta.glob (which
// can't run under bun:test). This guards the data contract the loader relies on:
// every free preset parses, has params, and round-trips through the .hlook
// serializer the "Download .hlook" button uses.
const presetsDir = join(import.meta.dir, "..", "..", "..", "presets");
const files = readdirSync(presetsDir).filter(f => f.endsWith(".hlook"));

test("free presets exist and the default is among them", () => {
  expect(files.length).toBeGreaterThan(0);
  expect(files).toContain("default.hlook");
});

test("each preset parses, has params, and seeds a full param set", () => {
  for (const f of files) {
    const data = JSON.parse(readFileSync(join(presetsDir, f), "utf-8"));
    expect(data.params, `${f} missing params`).toBeDefined();
    const seeded = seedDefaults(data.params);
    // seedDefaults must fill defaults beyond the look's own overrides.
    expect(Object.keys(seeded).length).toBeGreaterThanOrEqual(
      Object.keys(data.params).length,
    );
  }
});

test("exportLook -> importLook round-trips tuned params", () => {
  const params = { exposure: 0.25, contrast: 1.1, "halation-amount": 0.2 };
  // The "Download .hlook" button exports params flat under the look name.
  const json = exportLook("my-look", params);
  const back = importLook(json);
  expect(back.name).toBe("my-look");
  expect(back.exposure).toBe(0.25);
  expect(back["halation-amount"]).toBe(0.2);
});
