// Browser stub for the node builtins (fs / path / os) that @hance/core pulls in.
// Its barrel re-exports presets.ts / preset-index.ts, which import those modules
// at the top level. None of those code paths run in the browser (we bundle our
// own looks and never touch the filesystem), but the bundler must still resolve
// every named import to link the module graph - Vite's dev server and its Rollup
// production build both need the bindings to exist. vite.config.ts aliases the
// node imports to this file. Each export is a function that throws if it is ever
// actually called, so the dead code links and then tree-shakes away, while any
// accidental call fails loudly instead of silently returning undefined.
function nope(name: string): never {
  throw new Error(`node:${name} is not available in the browser build`);
}

export const existsSync = () => nope("fs.existsSync");
export const readFileSync = () => nope("fs.readFileSync");
export const readdirSync = () => nope("fs.readdirSync");
export const statSync = () => nope("fs.statSync");
export const writeFileSync = () => nope("fs.writeFileSync");
export const mkdirSync = () => nope("fs.mkdirSync");
export const join = () => nope("path.join");
export const dirname = () => nope("path.dirname");
export const homedir = () => nope("os.homedir");

export default {
  existsSync, readFileSync, readdirSync, statSync, writeFileSync, mkdirSync,
  join, dirname, homedir,
};
