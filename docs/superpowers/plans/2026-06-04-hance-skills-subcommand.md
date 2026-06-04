# hance skills Subcommand Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `hance skills` subcommand that serves the agent skill content (router + subcommand/reference docs) baked into the CLI binary, so any agent harness gets version-matched instructions at runtime.

**Architecture:** Skill markdown lives at the `skills/` repo root (flattened from `skills/hance/`). A build-time codegen (`scripts/gen-skills.ts`) inlines every doc into a generated TS module imported only by the CLI; `bun build --compile` bakes it into the binary. A new `commands/skills.ts` handler exposes `skills` / `skills list` / `skills get <name>` / `skills path`. Nothing skills-related touches `@hance/core` or `packages/ui`.

**Tech Stack:** Bun, TypeScript, `bun:test`, `Bun.Glob`.

**Spec:** `docs/superpowers/specs/2026-06-04-hance-skills-subcommand-design.md`

---

## File Structure

- `skills/SKILL.md`, `skills/subcommands/*.md`, `skills/references/*.md` — moved from `skills/hance/` (single source of truth).
- `scripts/gen-skills.ts` — Create. Globs `skills/**/*.md`, emits the generated module.
- `packages/cli/src/skills.generated.ts` — Generated (git-ignored). Exports `SKILL_ROOT` and `SKILLS`.
- `packages/cli/src/commands/skills.ts` — Create. Arg parser + `runSkills` handler.
- `packages/cli/src/cli.ts` — Modify. Add `"skills"` to `Subcommand`, dispatch, help line.
- `packages/cli/__tests__/skills.test.ts` — Create. Unit + drift + UI-boundary guards.
- `packages/cli/__tests__/e2e/skills.e2e.test.ts` — Create. Built-binary checks.
- `.gitignore`, root `package.json`, `README.md`, `skills/README.md` — Modify.

---

## Task 1: Flatten the skills directory

**Files:**
- Move: `skills/hance/*` → `skills/*`

- [ ] **Step 1: Move the skill tree up one level**

```bash
cd /Users/robray/hancer
git mv skills/hance/SKILL.md skills/SKILL.md
git mv skills/hance/subcommands skills/subcommands
git mv skills/hance/references skills/references
rmdir skills/hance 2>/dev/null || true
```

- [ ] **Step 2: Verify the layout**

Run: `find skills -type f | sort`
Expected (README.md plus):
```
skills/README.md
skills/SKILL.md
skills/references/compare-page.md
skills/references/grading.md
skills/references/preset-index.md
skills/subcommands/batch.md
skills/subcommands/refine.md
skills/subcommands/run.md
skills/subcommands/setup.md
skills/subcommands/try.md
skills/subcommands/ui.md
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "refactor(skills): flatten skills/hance to skills root"
```

---

## Task 2: Codegen script

**Files:**
- Create: `scripts/gen-skills.ts`
- Create: `scripts/__tests__/gen-skills.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// scripts/__tests__/gen-skills.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test scripts/__tests__/gen-skills.test.ts`
Expected: FAIL — cannot find module `../gen-skills` / `collectSkills` not exported.

- [ ] **Step 3: Write the codegen**

```ts
// scripts/gen-skills.ts
import { Glob } from "bun";
import path from "node:path";

export interface SkillDoc {
  kind: "subcommand" | "reference";
  description: string;
  content: string;
}

const root = path.resolve(import.meta.dir, "..");
const skillsDir = path.join(root, "skills");

function firstHeading(md: string): string {
  for (const line of md.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    if (t.startsWith("#")) return t.replace(/^#+\s*/, "").trim();
    if (t.startsWith("---")) continue; // frontmatter fence
    return t;
  }
  return "";
}

export async function collectSkills(): Promise<{
  root: string;
  skills: Record<string, SkillDoc>;
}> {
  const glob = new Glob("**/*.md");
  let rootContent = "";
  const skills: Record<string, SkillDoc> = {};

  for await (const rel of glob.scan(skillsDir)) {
    if (path.basename(rel) === "README.md") continue;
    const abs = path.join(skillsDir, rel);
    const content = await Bun.file(abs).text();

    if (rel === "SKILL.md") {
      rootContent = content;
      continue;
    }

    const name = path.basename(rel, ".md");
    const dir = rel.split(path.sep)[0];
    const kind =
      dir === "subcommands" ? "subcommand" :
      dir === "references" ? "reference" : null;
    if (!kind) throw new Error(`gen-skills: unexpected skill path "${rel}"`);

    if (skills[name]) {
      throw new Error(`gen-skills: duplicate skill name "${name}" (from ${rel})`);
    }
    skills[name] = { kind, description: firstHeading(content), content };
  }

  if (!rootContent) throw new Error("gen-skills: skills/SKILL.md not found");
  return { root: rootContent, skills };
}

export async function generate(): Promise<string> {
  const { root, skills } = await collectSkills();
  const lines: string[] = [
    "// AUTO-GENERATED by scripts/gen-skills.ts — do not edit.",
    "export interface SkillDoc {",
    '  kind: "subcommand" | "reference";',
    "  description: string;",
    "  content: string;",
    "}",
    `export const SKILL_ROOT: string = ${JSON.stringify(root)};`,
    "export const SKILLS: Record<string, SkillDoc> = {",
  ];
  for (const [name, doc] of Object.entries(skills).sort()) {
    lines.push(`  ${JSON.stringify(name)}: ${JSON.stringify(doc)},`);
  }
  lines.push("};", "");
  return lines.join("\n");
}

if (import.meta.main) {
  const out = path.join(root, "packages", "cli", "src", "skills.generated.ts");
  await Bun.write(out, await generate());
  console.log(`wrote ${path.relative(root, out)}`);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test scripts/__tests__/gen-skills.test.ts`
Expected: PASS (both tests).

- [ ] **Step 5: Generate the module and confirm it writes**

Run: `bun run scripts/gen-skills.ts`
Expected: `wrote packages/cli/src/skills.generated.ts`

- [ ] **Step 6: Commit**

```bash
git add scripts/gen-skills.ts scripts/__tests__/gen-skills.test.ts
git commit -m "feat(skills): add gen-skills codegen for embedded skill docs"
```

---

## Task 3: Git-ignore generated file and wire codegen into build

**Files:**
- Modify: `.gitignore`
- Modify: `package.json:13` (the `build` script)

- [ ] **Step 1: Ignore the generated module**

Add to `.gitignore` (under the "Generated preset index" block):

```
# Generated skills module (rebuild with: bun run scripts/gen-skills.ts)
packages/cli/src/skills.generated.ts
```

- [ ] **Step 2: Run codegen before compile in the build script**

In `package.json`, change the `build` script so `gen-skills` runs first:

```json
"build": "bun run scripts/gen-skills.ts && bun run build:wgpu && bun run build:ui && bun build packages/cli/src/cli.ts --compile ${BUN_TARGET:+--target=$BUN_TARGET} --define HANCE_VERSION=\"'${HANCE_VERSION:-dev}'\" --outfile hance",
```

- [ ] **Step 3: Verify the generated file is untracked**

Run: `git status --porcelain packages/cli/src/skills.generated.ts`
Expected: empty output (ignored).

- [ ] **Step 4: Commit**

```bash
git add .gitignore package.json
git commit -m "build(skills): run gen-skills before compile, ignore generated module"
```

---

## Task 4: skills command handler

**Files:**
- Create: `packages/cli/src/commands/skills.ts`
- Create: `packages/cli/__tests__/skills.test.ts`

Depends on `packages/cli/src/skills.generated.ts` existing (run `bun run scripts/gen-skills.ts` first if it was cleaned).

- [ ] **Step 1: Write the failing test**

```ts
// packages/cli/__tests__/skills.test.ts
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
  expect(() => parseSkillsArgs(["get"])).toThrow(/name required/);
});

test("unknown command throws", () => {
  expect(() => parseSkillsArgs(["wat"])).toThrow(/unknown skills command/);
});

test("every generated skill has a known kind", () => {
  for (const doc of Object.values(SKILLS)) {
    expect(["subcommand", "reference"]).toContain(doc.kind);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test packages/cli/__tests__/skills.test.ts`
Expected: FAIL — cannot find module `../src/commands/skills`.

- [ ] **Step 3: Write the handler**

```ts
// packages/cli/src/commands/skills.ts
import { mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { SKILL_ROOT, SKILLS } from "../skills.generated";

declare const HANCE_VERSION: string | undefined;
const VERSION: string = (typeof HANCE_VERSION !== "undefined" ? HANCE_VERSION : (process.env.HANCE_VERSION ?? "dev"));

export interface SkillsArgs {
  action: "root" | "list" | "get" | "path";
  name?: string;
}

export function parseSkillsArgs(argv: string[]): SkillsArgs {
  const [cmd, ...rest] = argv;
  if (!cmd) return { action: "root" };
  if (cmd === "list") return { action: "list" };
  if (cmd === "path") return { action: "path" };
  if (cmd === "get") {
    if (!rest[0]) throw new Error("skills get: <name> required");
    return { action: "get", name: rest[0] };
  }
  throw new Error(`unknown skills command: ${cmd}`);
}

function formatList(): string {
  const rows = Object.entries(SKILLS).sort(([a], [b]) => a.localeCompare(b));
  const width = Math.max(...rows.map(([n]) => n.length));
  const subs = rows.filter(([, d]) => d.kind === "subcommand");
  const refs = rows.filter(([, d]) => d.kind === "reference");
  const section = (title: string, items: typeof rows) =>
    items.length
      ? `${title}\n` + items.map(([n, d]) => `  ${n.padEnd(width)}  ${d.description}`).join("\n")
      : "";
  return [
    "Run 'hance skills' for the entry doc, 'hance skills get <name>' for any below.",
    "",
    section("Subcommands:", subs),
    "",
    section("References:", refs),
  ].filter((s) => s !== "").join("\n");
}

function cacheDir(): string {
  if (process.env.HANCE_SKILLS_DIR) return process.env.HANCE_SKILLS_DIR;
  const base = process.env.XDG_CACHE_HOME ?? path.join(os.homedir(), ".cache");
  return path.join(base, "hance", "skills", VERSION);
}

async function extractSkills(): Promise<string> {
  const dir = cacheDir();
  await mkdir(dir, { recursive: true });
  if (!existsSync(path.join(dir, "SKILL.md"))) {
    await Bun.write(path.join(dir, "SKILL.md"), SKILL_ROOT);
    for (const [name, doc] of Object.entries(SKILLS)) {
      await Bun.write(path.join(dir, `${name}.md`), doc.content);
    }
  }
  return dir;
}

export async function runSkills(argv: string[]): Promise<void> {
  let args: SkillsArgs;
  try {
    args = parseSkillsArgs(argv);
  } catch (err) {
    console.error(`Error: ${(err as Error).message}`);
    process.exit(1);
  }

  switch (args.action) {
    case "root":
      console.log(SKILL_ROOT);
      return;
    case "list":
      console.log(formatList());
      return;
    case "get": {
      const doc = SKILLS[args.name!];
      if (!doc) {
        console.error(`Unknown skill: ${args.name}\nAvailable: ${Object.keys(SKILLS).sort().join(", ")}`);
        process.exit(1);
      }
      console.log(doc.content);
      return;
    }
    case "path":
      console.log(await extractSkills());
      return;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test packages/cli/__tests__/skills.test.ts`
Expected: PASS (all five tests).

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/commands/skills.ts packages/cli/__tests__/skills.test.ts
git commit -m "feat(skills): add skills command handler (root/list/get/path)"
```

---

## Task 5: Wire the subcommand into the CLI

**Files:**
- Modify: `packages/cli/src/cli.ts` (Subcommand union ~line 67, `resolveSubcommand` ~line 69, dispatch ~line 229, `HELP_TEXT` Commands/Docs sections)

- [ ] **Step 1: Write the failing test**

Append to `packages/cli/__tests__/skills.test.ts`:

```ts
import { resolveSubcommand } from "../src/cli";

test("skills resolves as a subcommand", () => {
  expect(resolveSubcommand(["skills"])).toBe("skills");
  expect(resolveSubcommand(["skills", "get", "refine"])).toBe("skills");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test packages/cli/__tests__/skills.test.ts -t "skills resolves"`
Expected: FAIL — `resolveSubcommand(["skills"])` returns `"render"`, not `"skills"`.

- [ ] **Step 3: Add `skills` to the union and resolver**

In `packages/cli/src/cli.ts`, change the `Subcommand` type:

```ts
export type Subcommand = "ui" | "preview" | "preset" | "config" | "skills" | "render";
```

And add a case in `resolveSubcommand`:

```ts
    case "config": return "config";
    case "skills": return "skills";
    default: return "render";
```

- [ ] **Step 4: Add dispatch in `main()`**

After the `config` dispatch block (the one ending its `return;`), add:

```ts
  if (sub === "skills") {
    const { runSkills } = await import("./commands/skills");
    await runSkills(args.slice(1));
    return;
  }
```

- [ ] **Step 5: Add help text**

In `HELP_TEXT`, add to the `Commands:` block:

```
  hance skills [get <name>]   print the agent skill docs (for AI harnesses)
```

And add a "Start here (for AI agents)" line just above the existing `Docs:` line:

```
Agents: run "hance skills" first for the agent skill router.
```

- [ ] **Step 6: Run the resolver test to verify it passes**

Run: `bun test packages/cli/__tests__/skills.test.ts -t "skills resolves"`
Expected: PASS.

- [ ] **Step 7: Smoke-test the wired command from source**

Run: `bun run packages/cli/src/cli.ts skills list`
Expected: prints the Subcommands/References list including `refine` and `grading`.

Run: `bun run packages/cli/src/cli.ts skills get refine`
Expected: prints the contents of `skills/subcommands/refine.md`.

- [ ] **Step 8: Commit**

```bash
git add packages/cli/src/cli.ts packages/cli/__tests__/skills.test.ts
git commit -m "feat(skills): wire skills subcommand into the CLI"
```

---

## Task 6: Drift guard + UI boundary guard

**Files:**
- Create: `packages/cli/__tests__/skills-guards.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// packages/cli/__tests__/skills-guards.test.ts
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
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `bun test packages/cli/__tests__/skills-guards.test.ts`
Expected: PASS (drift matches; UI has no offenders). If the generated module is stale, run `bun run scripts/gen-skills.ts` first.

> Note: these are written to pass immediately against current state — they are regression guards, not red-first TDD. Confirm they would fail on drift by temporarily editing `skills/subcommands/refine.md` and re-running; expect FAIL, then revert.

- [ ] **Step 3: Commit**

```bash
git add packages/cli/__tests__/skills-guards.test.ts
git commit -m "test(skills): guard against manifest drift and UI leakage"
```

---

## Task 7: E2E test against the built binary

**Files:**
- Create: `packages/cli/__tests__/e2e/skills.e2e.test.ts`

- [ ] **Step 1: Build the binary**

Run: `bun run build`
Expected: produces `./hance` (and runs `gen-skills` first).

- [ ] **Step 2: Write the test**

```ts
// packages/cli/__tests__/e2e/skills.e2e.test.ts
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
```

- [ ] **Step 3: Run the e2e test**

Run: `bun test packages/cli/__tests__/e2e/skills.e2e.test.ts`
Expected: PASS (all four). The "Routing" assertion matches the `## Routing` heading in `skills/SKILL.md`.

- [ ] **Step 4: Commit**

```bash
git add packages/cli/__tests__/e2e/skills.e2e.test.ts
git commit -m "test(skills): e2e coverage for skills subcommand on built binary"
```

---

## Task 8: Docs

**Files:**
- Modify: `skills/README.md`
- Modify: `README.md` (root)

- [ ] **Step 1: Rewrite `skills/README.md`**

Replace its contents with:

```markdown
# Skills

The Hance agent skill, shipped inside the CLI.

The skill content (`SKILL.md`, `subcommands/`, `references/`) is baked into the
`hance` binary at build time via `scripts/gen-skills.ts`. Agents read it at
runtime — no install or symlink needed:

```bash
hance skills              # the router / entry doc
hance skills list         # available subcommand + reference docs
hance skills get refine   # one doc
hance skills path         # extract docs to a local dir
```

When this repo is opened in Claude Code, the skill at `skills/` is also
auto-loaded for local development.
```

- [ ] **Step 2: Document the command in the root `README.md`**

Find the section that lists CLI commands/usage and add a line describing
`hance skills` (mirror the wording in `HELP_TEXT`). If no such section exists,
add a short "Agent skill" subsection with the four commands from Step 1.

Run to locate the spot: `grep -n "hance preset\|hance ui\|## " README.md | head -30`

- [ ] **Step 3: Verify no stale match-look reference remains**

Run: `grep -rn "match-look" README.md skills/`
Expected: no output.

- [ ] **Step 4: Run the full test suite**

Run: `bun test`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add README.md skills/README.md
git commit -m "docs(skills): document hance skills subcommand, drop match-look"
```

---

## Self-Review Notes

- **Spec coverage:** source flatten (T1), codegen/embedding (T2–T3), command surface root/list/get/path (T4), CLI wiring + help "start here" (T5), drift + UI-boundary guards (T6), `path` extract-to-cache with `HANCE_SKILLS_DIR` override (T4), error handling for unknown `get` (T4 + T7), docs incl. match-look removal (T8). The spec's npm-tarball `files` note is intentionally dropped: npm ships the compiled binary (`prepare-npm.ts`), so embedding already covers it — no `files` change needed.
- **Type consistency:** `SkillDoc`, `SKILL_ROOT`, `SKILLS`, `collectSkills`, `parseSkillsArgs`, `runSkills`, `SkillsArgs.action` values used identically across T2/T4/T6.
- **External follow-up:** `hance.video/docs/agent/overview` update remains out of scope (separate repo).
