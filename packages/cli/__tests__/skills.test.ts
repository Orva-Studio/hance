import { test, expect } from "bun:test";
import { parseSkillsArgs } from "../src/commands/skills";
import { SKILLS } from "../src/skills.generated";

test("no args resolves to the root action", () => {
  expect(parseSkillsArgs([])).toEqual({ action: "root" });
});

test("list and path actions parse", () => {
  expect(parseSkillsArgs(["list"])).toEqual({ action: "list" });
  expect(parseSkillsArgs(["path"])).toEqual({ action: "path" });
});

test("get requires a name", () => {
  expect(parseSkillsArgs(["get", "refine"])).toEqual({ action: "get", name: "refine" });
  expect(() => parseSkillsArgs(["get"])).toThrow(/<name> required/);
});

test("unknown command throws", () => {
  expect(() => parseSkillsArgs(["wat"])).toThrow(/unknown skills command/);
});

test("every generated skill has a known kind", () => {
  for (const doc of Object.values(SKILLS)) {
    expect(["subcommand", "reference"]).toContain(doc.kind);
  }
});
