@group(0) @binding(0) var src: texture_2d<f32>;
@group(0) @binding(1) var samp: sampler;

struct ColorspaceParams {
  direction: f32, // 0.0 = sRGB->linear, 1.0 = linear->sRGB
  _pad0: f32,
  _pad1: f32,
  _pad2: f32,
};
@group(0) @binding(2) var<uniform> params: ColorspaceParams;

fn srgb_to_linear(c: vec3f) -> vec3f {
  let lo = c / 12.92;
  let hi = pow((c + 0.055) / 1.055, vec3f(2.4));
  return select(hi, lo, c <= vec3f(0.04045));
}

fn linear_to_srgb(c: vec3f) -> vec3f {
  let lo = c * 12.92;
  let hi = 1.055 * pow(c, vec3f(1.0 / 2.4)) - vec3f(0.055);
  return select(hi, lo, c <= vec3f(0.0031308));
}

@fragment
fn fs(@location(0) uv: vec2f) -> @location(0) vec4f {
  let color = textureSample(src, samp, uv);
  let rgb = select(srgb_to_linear(color.rgb), linear_to_srgb(color.rgb), params.direction > 0.5);
  return vec4f(rgb, color.a);
}
