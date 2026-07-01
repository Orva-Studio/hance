@group(0) @binding(0) var src: texture_2d<f32>;
@group(0) @binding(1) var samp: sampler;

struct FilmDensityParams {
  amount: f32,
  toe_r: f32,
  toe_g: f32,
  toe_b: f32,
  shoulder_r: f32,
  shoulder_g: f32,
  shoulder_b: f32,
  _pad: f32,
};
@group(0) @binding(2) var<uniform> params: FilmDensityParams;

// Toe/shoulder S-curve pivoted at 0.5, so toe and shoulder gamma tune shadows
// and highlights independently without moving midtones. Mirrors
// filmDensityCurve in packages/core/src/film-density.ts.
fn density_curve(x: f32, toe_gamma: f32, shoulder_gamma: f32) -> f32 {
  let xc = clamp(x, 0.0, 1.0);
  if (xc <= 0.5) {
    return 0.5 * pow(xc / 0.5, toe_gamma);
  }
  return 1.0 - 0.5 * pow((1.0 - xc) / 0.5, shoulder_gamma);
}

@fragment
fn fs(@location(0) uv: vec2f) -> @location(0) vec4f {
  let color = textureSample(src, samp, uv);
  let graded = vec3f(
    density_curve(color.r, params.toe_r, params.shoulder_r),
    density_curve(color.g, params.toe_g, params.shoulder_g),
    density_curve(color.b, params.toe_b, params.shoulder_b),
  );
  let rgb = mix(color.rgb, graded, params.amount);
  return vec4f(rgb, color.a);
}
