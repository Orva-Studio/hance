import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

// The reused gpu/shaders.ts imports .wgsl as text (Bun does this natively).
// Teach Vite the same: load .wgsl files as default-exported strings.
function wgslText(): Plugin {
  return {
    name: "wgsl-text",
    async transform(_code, id) {
      if (!id.endsWith(".wgsl")) return null;
      const src = await readFile(id, "utf-8");
      return { code: `export default ${JSON.stringify(src)};`, map: null };
    },
  };
}

// ponytail: import @hance/ui source directly (subpath export "./app/*"). The
// renderer + control components are pure browser code, so one source of truth
// beats a copy. Vite resolves their extensions and the workspace fs access.
const nodeStub = fileURLToPath(new URL("./src/node-stub.ts", import.meta.url));

export default defineConfig({
  plugins: [react(), wgslText()],
  resolve: {
    alias: ["fs", "node:fs", "path", "node:path", "os", "node:os"].map(find => ({
      find,
      replacement: nodeStub,
    })),
  },
  // .hlook is just JSON; let ?raw imports pick them up from the repo presets/.
  assetsInclude: ["**/*.hlook"],
});
