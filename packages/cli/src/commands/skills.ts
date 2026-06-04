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
