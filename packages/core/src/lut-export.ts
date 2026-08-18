// Bakes the per-pixel portion of a look into a .cube 3D LUT, for tools with a
// LUT slot (Elgato Camera Hub, OBS, Resolve, Premiere) — including live camera
// paths Hance itself cannot sit in.
//
// A 3D LUT maps colour to colour and nothing else, so only passes that read
// their own texel survive the bake. Everything spatial or temporal is dropped;
// LOSSY_EFFECTS is the single source of truth for which, and drives both the
// forced params and the warning the UI shows before exporting.

export const CUBE_SIZE = 33;

export interface LossyEffect {
  /** The `--no-*` flag that disables the effect for the bake. */
  enableKey: string;
  label: string;
  /** Why a colour-only mapping cannot carry it. */
  reason: string;
}

// Effects a .cube cannot represent. Each samples neighbouring pixels, depends
// on screen position, or varies per frame — none of which is a function of the
// input colour alone.
export const LOSSY_EFFECTS: readonly LossyEffect[] = [
  { enableKey: "no-halation", label: "Halation", reason: "blurs highlights across neighbouring pixels" },
  { enableKey: "no-bloom", label: "Bloom", reason: "blurs highlights across neighbouring pixels" },
  { enableKey: "no-aberration", label: "Chromatic Aberration", reason: "samples the frame at offset positions" },
  { enableKey: "no-grain", label: "Grain", reason: "is noise that changes every frame" },
  { enableKey: "no-vignette", label: "Vignette", reason: "depends on where a pixel sits in the frame" },
  { enableKey: "no-camera-shake", label: "Camera Shake", reason: "moves the whole frame over time" },
];

type ParamDict = Record<string, string | number | boolean>;

/** True when the look actually uses an effect the bake will drop. */
export function activeLossyEffects(params: ParamDict): LossyEffect[] {
  return LOSSY_EFFECTS.filter(effect => params[effect.enableKey] !== true);
}

/** The look with every non-bakeable effect forced off. */
export function cubeBakeParams(params: ParamDict): ParamDict {
  const baked: ParamDict = { ...params };
  for (const effect of LOSSY_EFFECTS) baked[effect.enableKey] = true;
  return baked;
}

/**
 * An identity colour cube as an RGBA image: every one of size^3 colours, once.
 * Laid out size^2 wide by size tall, so x = r + g*size and y = b — which makes
 * the readback order identical to .cube's (R fastest, B slowest).
 */
export function identityCubeImage(size: number = CUBE_SIZE): { data: Uint8Array; width: number; height: number } {
  const width = size * size;
  const height = size;
  const data = new Uint8Array(width * height * 4);
  const step = 255 / (size - 1);
  let o = 0;
  for (let b = 0; b < size; b++) {
    for (let g = 0; g < size; g++) {
      for (let r = 0; r < size; r++) {
        data[o++] = Math.round(r * step);
        data[o++] = Math.round(g * step);
        data[o++] = Math.round(b * step);
        data[o++] = 255;
      }
    }
  }
  return { data, width, height };
}

/**
 * Serialises rendered cube pixels as .cube text. `pixels` must be the RGBA
 * readback of identityCubeImage() put through the colour-only chain, so entry
 * order already matches the format.
 */
export function formatCube(pixels: Uint8Array, size: number = CUBE_SIZE, title = "Hance"): string {
  const entries = size * size * size;
  // Exact, not minimum: a row-padded readback (copyTextureToBuffer aligns
  // bytesPerRow to 256) is *longer* than the cube and would otherwise be
  // accepted, shifting every entry after the first row into the wrong colour.
  if (pixels.length !== entries * 4) {
    throw new Error(`Expected exactly ${entries * 4} bytes for a ${size}^3 cube, got ${pixels.length}`);
  }
  // .cube titles are quoted single-line; a stray quote or newline would produce
  // a file the parser rejects.
  const safeTitle = title.replace(/["\r\n]/g, " ").trim() || "Hance";
  const lines = [
    `TITLE "${safeTitle}"`,
    `LUT_3D_SIZE ${size}`,
    "DOMAIN_MIN 0.0 0.0 0.0",
    "DOMAIN_MAX 1.0 1.0 1.0",
    "",
  ];
  for (let i = 0; i < entries; i++) {
    const o = i * 4;
    const r = (pixels[o]! / 255).toFixed(6);
    const g = (pixels[o + 1]! / 255).toFixed(6);
    const b = (pixels[o + 2]! / 255).toFixed(6);
    lines.push(`${r} ${g} ${b}`);
  }
  return lines.join("\n") + "\n";
}

/** `Kodak Gold.cube` — a filename tools will accept. */
export function cubeFilename(lookName: string | null): string {
  const base = (lookName ?? "Hance").replace(/[/\\:*?"<>|]/g, "").trim() || "Hance";
  return `${base}.cube`;
}
