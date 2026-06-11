@group(0) @binding(0) var base_tex: texture_2d<f32>;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var scatter_tex: texture_2d<f32>;
@group(0) @binding(3) var core_tex: texture_2d<f32>;

// Ring extraction + headroom-limited recombine in linear light. Subtracting
// the thresholded core from the scatter leaves an edge ring rather than a
// filled disk. The ring is added scaled by per-channel headroom (a linear-
// light screen blend): near-white pixels receive almost no extra light, so
// large bright areas (a white shirt) keep their shading instead of being
// filled flat, while glow onto dark neighbors is effectively unchanged.
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
  let headroom = max(vec3f(1.0) - base, vec3f(0.0));
  return vec4f(base + p.amount * ring * headroom, 1.0);
}
