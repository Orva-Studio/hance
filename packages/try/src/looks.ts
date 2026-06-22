import { seedDefaults } from "@hance/core";
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

export const LOOKS: Look[] = Object.entries(files)
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
  .sort((a, b) => a.label.localeCompare(b.label));

export function findLook(name: string): Look | undefined {
  return LOOKS.find(l => l.name === name);
}
