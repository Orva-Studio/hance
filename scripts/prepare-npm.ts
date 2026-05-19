import { mkdir, copyFile, rm } from "node:fs/promises";
import { readdirSync, existsSync } from "node:fs";
import path from "node:path";

const PLATFORM_MAP: Record<string, string> = {
  "macos-arm64": "darwin-arm64",
  "macos-x64": "darwin-x64",
  "linux-x64": "linux-x64",
  "linux-arm64": "linux-arm64",
};

async function main() {
  const root = path.resolve(import.meta.dir, "..");
  const artifactsDir = process.argv[2];
  const version = process.argv[3];

  if (!artifactsDir || !version) {
    console.error("Usage: bun run scripts/prepare-npm.ts <artifacts-dir> <version>");
    process.exit(1);
  }

  for (const [ciPlatform, npmPlatform] of Object.entries(PLATFORM_MAP)) {
    const srcDir = path.join(artifactsDir, `hance-${ciPlatform}`);
    const pkgDir = path.join(root, "npm", "@orva-studio", `cli-${npmPlatform}`);
    const binDir = path.join(pkgDir, "bin");

    if (!existsSync(srcDir)) {
      console.warn(`skipping ${ciPlatform}: ${srcDir} not found`);
      continue;
    }

    await rm(binDir, { recursive: true, force: true });
    await mkdir(binDir, { recursive: true });

    await copyFile(path.join(srcDir, "hance"), path.join(binDir, "hance"));
    await copyFile(path.join(srcDir, "hance-gpu"), path.join(binDir, "hance-gpu"));

    const presetsDir = path.join(srcDir, "presets");
    if (existsSync(presetsDir)) {
      const destPresets = path.join(binDir, "presets");
      await mkdir(destPresets, { recursive: true });
      for (const f of readdirSync(presetsDir)) {
        await copyFile(path.join(presetsDir, f), path.join(destPresets, f));
      }
    }

    const pkgJson = path.join(pkgDir, "package.json");
    const pkg = JSON.parse(await Bun.file(pkgJson).text());
    pkg.version = version;
    await Bun.write(pkgJson, JSON.stringify(pkg, null, 2) + "\n");

    console.log(`prepared ${npmPlatform} (${version})`);
  }

  const wrapperPkgJson = path.join(root, "npm", "hance", "package.json");
  const wrapperPkg = JSON.parse(await Bun.file(wrapperPkgJson).text());
  wrapperPkg.version = version;
  if (wrapperPkg.optionalDependencies) {
    for (const dep of Object.keys(wrapperPkg.optionalDependencies)) {
      wrapperPkg.optionalDependencies[dep] = version;
    }
  }
  await Bun.write(wrapperPkgJson, JSON.stringify(wrapperPkg, null, 2) + "\n");
  console.log(`prepared wrapper (${version})`);
}

await main();
