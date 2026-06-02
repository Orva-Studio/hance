// Single source of truth for input/pre-LUT data.
//
// Generates a 33x33x33 LUT as a Float32Array (length 33^3 * 3, RGB-major,
// R fastest). The baked array is shipped to both renderers (Rust wgpu export
// and the WebGPU preview) so they match pixel-for-pixel — the math lives here
// and nowhere else.

export type InputLutProfile = "rec709" | "vlog";

export const LUT_SIZE = 33;

// Panasonic V-Log reverse OETF (V-Log signal -> scene-linear reflectance).
function vlogToLinear(v: number): number {
  const cut2 = 0.181;
  const b = 0.00873;
  const c = 0.241514;
  const d = 0.598206;
  if (v < cut2) return (v - 0.125) / 5.6;
  return Math.pow(10, (v - d) / c) - b;
}

// Rec.709 OETF (scene-linear -> gamma-encoded display signal).
function linearToRec709(l: number): number {
  const lc = Math.max(0, l);
  if (lc < 0.018) return 4.5 * lc;
  return 1.099 * Math.pow(lc, 0.45) - 0.099;
}

// Per-channel V-Log -> Rec.709: linearize the log curve, then re-encode to
// Rec.709 so the rest of the chain sees a normal (un-flattened) image.
export function vlogToRec709(v: number): number {
  return Math.min(1, Math.max(0, linearToRec709(vlogToLinear(v))));
}

export function generateLut(profile: InputLutProfile): Float32Array {
  const n = LUT_SIZE;
  const out = new Float32Array(n * n * n * 3);
  const map = profile === "vlog" ? vlogToRec709 : (c: number) => c;
  let o = 0;
  for (let bi = 0; bi < n; bi++) {
    const bc = bi / (n - 1);
    const mb = map(bc);
    for (let gi = 0; gi < n; gi++) {
      const gc = gi / (n - 1);
      const mg = map(gc);
      for (let ri = 0; ri < n; ri++) {
        const rc = ri / (n - 1);
        out[o++] = map(rc);
        out[o++] = mg;
        out[o++] = mb;
      }
    }
  }
  return out;
}

type ParamDict = Record<string, string | number | boolean | undefined>;

export function inputLutProfile(params: ParamDict): InputLutProfile {
  return params["input-lut-profile"] === "vlog" ? "vlog" : "rec709";
}

export function isInputLutActive(params: ParamDict): boolean {
  if (params["no-input-lut"] === true) return false;
  // rec709 is identity — nothing to do, skip the pass for byte-for-byte passthrough.
  return inputLutProfile(params) === "vlog";
}

// Returns the baked LUT as a plain number array for JSON transport to the
// sidecar, or null when the pre-LUT pass should be skipped entirely.
export function lutDataForParams(params: ParamDict): number[] | null {
  if (!isInputLutActive(params)) return null;
  return Array.from(generateLut(inputLutProfile(params)));
}
