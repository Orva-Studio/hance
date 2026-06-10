@group(0) @binding(0) var src: texture_2d<f32>;
@group(0) @binding(1) var samp: sampler;

struct ColorWheelsParams {
  liftR: f32,
  liftG: f32,
  liftB: f32,
  _pad0: f32,
  gammaR: f32,
  gammaG: f32,
  gammaB: f32,
  _pad1: f32,
  gainR: f32,
  gainG: f32,
  gainB: f32,
  _pad2: f32,
};
@group(0) @binding(2) var<uniform> params: ColorWheelsParams;

// ASC CDL-style per-channel grade. Lift is an offset that falls off toward
// highlights, gain multiplies, gamma is applied as 1/gamma so values > 1
// brighten midtones (colorist convention).
fn grade_component(v: f32, lift: f32, gamma: f32, gain: f32) -> f32 {
  let lifted = clamp(v * gain + lift * (1.0 - v), 0.0, 1.0);
  return pow(lifted, 1.0 / max(gamma, 0.01));
}

@fragment
fn fs(@location(0) uv: vec2f) -> @location(0) vec4f {
  let color = textureSample(src, samp, uv).rgb;
  let graded = vec3f(
    grade_component(color.r, params.liftR, params.gammaR, params.gainR),
    grade_component(color.g, params.liftG, params.gammaG, params.gainG),
    grade_component(color.b, params.liftB, params.gammaB, params.gainB),
  );
  return vec4f(graded, 1.0);
}
