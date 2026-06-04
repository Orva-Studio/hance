import { test, expect } from "bun:test";
import { collectSkills } from "../gen-skills";

test("collectSkills returns the root doc and named entries", async () => {
  const { root, skills } = await collectSkills();
  expect(root.length).toBeGreaterThan(0);
  expect(skills.refine).toBeDefined();
  expect(skills.refine.kind).toBe("subcommand");
  expect(skills.grading.kind).toBe("reference");
  expect(skills.refine.description.length).toBeGreaterThan(0);
  expect(skills.refine.content).toContain("#");
});

test("collectSkills has no SKILL entry (root is separate)", async () => {
  const { skills } = await collectSkills();
  expect(skills.SKILL).toBeUndefined();
});
