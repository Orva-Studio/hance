import { seedDefaults, EFFECT_SCHEMA } from "@hance/core";
import type { PreviewParams } from "@hance/ui/app/gpu/renderer";

export interface Look {
  name: string; // file slug, e.g. "portra-400" — used for the CLI --preset flag
  label: string; // display name from the .hlook, e.g. "Portra 400"
  description: string;
  params: PreviewParams; // raw look params (pre-defaults), for .hlook export
  previewParams: PreviewParams; // full param set (defaults + look) for the renderer
}

// Bundle the free built-in looks from the repo presets/ dir. The glob is
// non-recursive so presets/premium/* is excluded — free looks only, by design.
const files = import.meta.glob("../../../presets/*.hlook", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

function slugOf(path: string): string {
  return path.split("/").pop()!.replace(/\.hlook$/, "");
}

// "Original" = the image exactly as imported. Every effect group disabled via
// its `no-*` enable key, so the renderer passes the source through untouched.
// Editor-only (no .hlook file), and always first so it's the obvious way back.
const ORIGINAL_PARAMS = Object.fromEntries(
  EFFECT_SCHEMA.map(g => [g.enableKey, true]),
) as PreviewParams;

const ORIGINAL: Look = {
  name: "original",
  label: "Original",
  description: "The image as imported, with no effects applied.",
  params: ORIGINAL_PARAMS,
  previewParams: seedDefaults(ORIGINAL_PARAMS) as PreviewParams,
};

const FILE_LOOKS: Look[] = Object.entries(files)
  .map(([path, raw]) => {
    const data = JSON.parse(raw) as {
      name?: string;
      description?: string;
      params?: PreviewParams;
    };
    const slug = slugOf(path);
    const params = data.params ?? {};
    return {
      name: slug,
      label: data.name ?? slug,
      description: data.description ?? "",
      params,
      previewParams: seedDefaults(params) as PreviewParams,
    };
  })
  // Drop the bundled "Default" look — "Original" replaces it in the editor.
  .filter(l => l.name !== "default")
  .sort((a, b) => a.label.localeCompare(b.label));

export const LOOKS: Look[] = [ORIGINAL, ...FILE_LOOKS];

export function findLook(name: string): Look | undefined {
  return LOOKS.find(l => l.name === name);
}
