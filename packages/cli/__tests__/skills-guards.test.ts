import { test, expect } from "bun:test";
import { Glob } from "bun";
import path from "node:path";
import { collectSkills } from "../../../scripts/gen-skills";
import { SKILL_ROOT, SKILLS } from "../src/skills.generated";

test("generated module matches the skills/ source (no drift)", async () => {
  const { root, skills } = await collectSkills();
  expect(SKILL_ROOT).toBe(root);
  expect(Object.keys(SKILLS).sort()).toEqual(Object.keys(skills).sort());
  for (const [name, doc] of Object.entries(skills)) {
    expect(SKILLS[name].content).toBe(doc.content);
  }
});

test("packages/ui never imports skill content", async () => {
  const uiDir = path.resolve(import.meta.dir, "..", "..", "ui");
  const glob = new Glob("**/*.{ts,tsx}");
  const offenders: string[] = [];
  for await (const rel of glob.scan(uiDir)) {
    if (rel.includes("node_modules") || rel.includes("dist")) continue;
    const text = await Bun.file(path.join(uiDir, rel)).text();
    if (text.includes("skills.generated") || text.includes("commands/skills")) {
      offenders.push(rel);
    }
  }
  expect(offenders).toEqual([]);
});
