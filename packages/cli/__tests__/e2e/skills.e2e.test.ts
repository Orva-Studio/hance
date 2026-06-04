import { test, expect } from "bun:test";
import path from "node:path";

const bin = path.resolve(import.meta.dir, "..", "..", "..", "..", "hance");

async function run(args: string[]) {
  const proc = Bun.spawn([bin, ...args], { stdout: "pipe", stderr: "pipe" });
  const stdout = await new Response(proc.stdout).text();
  const code = await proc.exited;
  return { stdout, code };
}

test("hance skills prints the router doc", async () => {
  const { stdout, code } = await run(["skills"]);
  expect(code).toBe(0);
  expect(stdout).toContain("Routing");
});

test("hance skills get refine prints the doc", async () => {
  const { stdout, code } = await run(["skills", "get", "refine"]);
  expect(code).toBe(0);
  expect(stdout.length).toBeGreaterThan(0);
});

test("hance skills get unknown exits non-zero", async () => {
  const { code } = await run(["skills", "get", "nope"]);
  expect(code).toBe(1);
});

test("hance skills path prints an existing directory", async () => {
  const { stdout, code } = await run(["skills", "path"]);
  expect(code).toBe(0);
  expect(stdout.trim().length).toBeGreaterThan(0);
});
