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

test("application and window roles declare accelerators; edit roles leave the native defaults alone", () => {
  const byRole = new Map(
    buildApplicationMenu()
      .flatMap(item => ("submenu" in item ? item.submenu ?? [] : []))
      .filter((item): item is { role: string; accelerator?: string } => "role" in item && !!item.role)
      .map(item => [item.role, item.accelerator]),
  );
  const expected: Record<string, string> = {
    quit: "CmdOrCtrl+Q",
    hide: "CmdOrCtrl+H",
    hideOthers: "CmdOrCtrl+Option+H",
    minimize: "CmdOrCtrl+M",
    toggleFullScreen: "Control+Command+F",
  };
  for (const [role, accelerator] of Object.entries(expected)) {
    expect(byRole.get(role)).toBe(accelerator);
  }
  // The edit roles are bound natively; declaring an accelerator would override
  // that default, so they must stay bare.
  for (const role of ["cut", "copy", "paste", "pasteAndMatchStyle", "selectAll"]) {
    expect(byRole.get(role)).toBeUndefined();
  }
});

// Every accelerator has to be spelled in tokens libNativeWrapper actually
// parses; it drops an unrecognised modifier silently, so "Alt"/"Cmd" bind a
// weaker shortcut instead of failing loudly.
test("every accelerator uses modifier tokens the native layer parses", () => {
  const NATIVE_MODIFIERS = new Set([
    "commandorcontrol", "cmdorctrl", "command", "control", "ctrl", "option", "shift", "super", "meta",
  ]);
  const accelerators = buildApplicationMenu()
    .flatMap(item => ("submenu" in item ? item.submenu ?? [] : []))
    .map(item => ("accelerator" in item ? item.accelerator : undefined))
    .filter((value): value is string => !!value);
  expect(accelerators.length).toBeGreaterThan(0);
  for (const accelerator of accelerators) {
    for (const modifier of accelerator.split("+").slice(0, -1)) {
      expect(NATIVE_MODIFIERS.has(modifier.toLowerCase())).toBe(true);
    }
  }
});

test("File menu exposes every custom action, each with an accelerator except About and Export LUT", () => {
  const items = buildApplicationMenu()
    .flatMap(item => ("submenu" in item ? item.submenu ?? [] : []))
    .filter((item): item is { action: string; accelerator?: string } => "action" in item && !!item.action);
  expect(items.map(i => i.action).sort()).toEqual(Object.values(MENU_ACTIONS).sort());
  for (const item of items) {
    if (item.action === MENU_ACTIONS.about || item.action === MENU_ACTIONS.exportLut) continue;
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
