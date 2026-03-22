import type { FilterResult, AberrationOptions } from "../types";

export function aberrationFilter(input: string, options: AberrationOptions): FilterResult {
  const offset = options.strength * 0.02;

  if (offset === 0) {
    // No aberration — pass through with format conversion round-trip
    const fragment = `[${input}]format=gbrp,format=yuv444p[ab_out]`;
    return { fragment, output: "ab_out" };
  }

  const scaleFactor = (1 + offset).toFixed(6);
  const scaleFactorInv = (1 - offset).toFixed(6);

  const fragment = [
    `[${input}]format=gbrp,setsar=1,split=3[ab_r_src][ab_g_src][ab_b_src];`,
    `[ab_r_src]extractplanes=r[ab_r];`,
    `[ab_g_src]extractplanes=g[ab_g];`,
    `[ab_b_src]extractplanes=b[ab_b];`,
    `[ab_r]scale=iw*${scaleFactor}:ih*${scaleFactor},crop=iw/${scaleFactor}:ih/${scaleFactor},setsar=1[ab_r_crop];`,
    `[ab_g]setsar=1[ab_g_ref];`,
    `[ab_r_crop][ab_g_ref]scale2ref[ab_r_raw][ab_g_sized];`,
    `[ab_r_raw]setsar=1[ab_r_shift];`,
    `[ab_b]scale=iw*${scaleFactorInv}:ih*${scaleFactorInv},setsar=1[ab_b_small];`,
    `[ab_b_small][ab_g_sized]scale2ref=flags=bilinear[ab_b_raw][ab_g_final];`,
    `[ab_b_raw]setsar=1[ab_b_shift];`,
    `[ab_g_final][ab_b_shift][ab_r_shift]mergeplanes=0x001020:gbrp,format=yuv444p[ab_out]`,
  ].join("");

  return { fragment, output: "ab_out" };
}
