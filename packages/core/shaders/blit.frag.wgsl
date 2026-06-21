@group(0) @binding(0) var src: texture_2d<f32>;
@group(0) @binding(1) var samp: sampler;

// Unused, kept so this shader fits the standard 3-binding layout. The final
// blit needs no parameters; the uniform is bound but never read.
struct Unused {
  a: vec4f,
  b: vec4f,
  c: vec4f,
};
@group(0) @binding(2) var<uniform> _unused: Unused;

// Cheap hash -> [0,1). Good enough for dither, no texture lookup needed.
fn hash12(p: vec2f) -> f32 {
  var p3 = fract(vec3f(p.x, p.y, p.x) * 0.1031);
  p3 += dot(p3, vec3f(p3.y, p3.z, p3.x) + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

@fragment
fn fs(@location(0) uv: vec2f, @builtin(position) frag: vec4f) -> @location(0) vec4f {
  let c = textureSample(src, samp, uv).rgb;
  // Triangular-PDF dither at the 8-bit quantization step. Two independent
  // uniform samples subtracted give a triangular distribution in (-1/255,
  // 1/255), which breaks up the contour banding that smooth, low-slope
  // gradients (e.g. large-radius halation halos) otherwise posterize into
  // when written to an 8-bit output.
  let r1 = hash12(frag.xy);
  let r2 = hash12(frag.xy + vec2f(11.7, 3.1));
  let dither = (r1 - r2) / 255.0;
  return vec4f(c + vec3f(dither), 1.0);
}
