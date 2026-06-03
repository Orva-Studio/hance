@group(0) @binding(0) var base_tex: texture_2d<f32>;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var scatter_tex: texture_2d<f32>;
@group(0) @binding(3) var core_tex: texture_2d<f32>;

// Ring extraction + additive recombine in linear light. Subtracting the
// thresholded core from the scatter leaves an edge ring rather than a filled
// disk; the result is added (re-exposure is additive energy), not screen-blended.
struct CombineParams {
  amount: f32,  // recombine strength
  ring: f32,    // core-subtraction strength: 0 = filled disk, 1 = full ring
  _pad: vec2f,
};
@group(0) @binding(4) var<uniform> p: CombineParams;

@fragment
fn fs(@location(0) uv: vec2f) -> @location(0) vec4f {
  let base = textureSample(base_tex, samp, uv).rgb;
  let scatter = textureSample(scatter_tex, samp, uv).rgb;
  let core = textureSample(core_tex, samp, uv).rgb;
  let ring = max(scatter - p.ring * core, vec3f(0.0));
  return vec4f(base + p.amount * ring, 1.0);
}
