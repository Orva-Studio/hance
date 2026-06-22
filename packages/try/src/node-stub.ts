// @hance/core's barrel re-exports presets.ts / preset-index.ts, which import
// node fs/path/os at the top level. None of those code paths run in the browser
// (we bundle our own looks and never touch the filesystem), but Rollup still
// needs the named bindings to resolve. Stub them so the dead code links, then
// gets tree-shaken away. Any accidental call fails loudly instead of silently.
function nope(name: string): never {
  throw new Error(`node:${name} is not available in the browser build`);
}

export const existsSync = () => nope("fs.existsSync");
export const readFileSync = () => nope("fs.readFileSync");
export const readdirSync = () => nope("fs.readdirSync");
export const statSync = () => nope("fs.statSync");
export const writeFileSync = () => nope("fs.writeFileSync");
export const mkdirSync = () => nope("fs.mkdirSync");
export const join = (...parts: string[]) => parts.join("/");
export const dirname = (p: string) => p.replace(/\/[^/]*$/, "");
export const homedir = () => nope("os.homedir");

export default {
  existsSync, readFileSync, readdirSync, statSync, writeFileSync, mkdirSync,
  join, dirname, homedir,
};
