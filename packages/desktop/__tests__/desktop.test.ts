import { test, expect } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import config from "../electrobun.config";
import { buildApplicationMenu, MENU_ACTIONS } from "../src/bun/menu";
import { startUiServer } from "../src/bun/server";

const pkgDir = join(import.meta.dir, "..");

test("electrobun config names the app and points at an existing bun entrypoint", () => {
  expect(config.app.name).toBe("Hance");
  expect(config.app.identifier).toBeTruthy();
  expect(existsSync(join(pkgDir, config.build.bun.entrypoint))).toBe(true);
});

test("dock icon iconset exists with the sizes macOS expects", () => {
  const iconset = join(pkgDir, config.build.mac.icons);
  for (const size of [16, 32, 128, 256, 512]) {
    expect(existsSync(join(iconset, `icon_${size}x${size}.png`))).toBe(true);
    expect(existsSync(join(iconset, `icon_${size}x${size}@2x.png`))).toBe(true);
  }
});

test("package.json wires the workspace and electrobun dependencies", () => {
  const pkg = JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf-8"));
  expect(pkg.name).toBe("@hance/desktop");
  expect(pkg.dependencies["@hance/ui"]).toBe("workspace:*");
  expect(pkg.dependencies.electrobun).toBeTruthy();
  expect(pkg.scripts.dev).toContain("electrobun dev");
});

test("application menu includes quit and the standard edit roles", () => {
  const menu = buildApplicationMenu();
  const roles = menu
    .flatMap(item => ("submenu" in item ? item.submenu ?? [] : []))
    .map(item => ("role" in item ? item.role : undefined));
  for (const role of ["quit", "cut", "copy", "paste", "selectAll"]) {
    expect(roles).toContain(role);
  }
});

test("File menu exposes every custom action with an accelerator", () => {
  const items = buildApplicationMenu()
    .flatMap(item => ("submenu" in item ? item.submenu ?? [] : []))
    .filter((item): item is { action: string; accelerator?: string } => "action" in item && !!item.action);
  expect(items.map(i => i.action).sort()).toEqual(Object.values(MENU_ACTIONS).sort());
  for (const item of items) {
    expect(item.accelerator).toBeTruthy();
  }
});

test("startUiServer serves the @hance/ui app over http", async () => {
  const ui = startUiServer();
  try {
    expect(ui.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/\?desktop=1$/);
    const res = await fetch(`${new URL(ui.url).origin}/api/looks`);
    expect(res.ok).toBe(true);
  } finally {
    await ui.stop();
  }
});
