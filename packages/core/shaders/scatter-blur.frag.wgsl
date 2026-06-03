@group(0) @binding(0) var src: texture_2d<f32>;
@group(0) @binding(1) var samp: sampler;

// Per-channel separable scatter blur. Each channel uses its own sigma so the
// warm halo emerges from wavelength-dependent scatter (R widest, B narrowest).
// Each channel's kernel is a weighted sum of two Gaussians (sharp core + long
// tail) approximating a point-spread function.
struct ScatterBlurParams {
  dir: vec2f,    // texel step for this pass (H = (1/w,0), V = (0,1/h))
  _pad: vec2f,
  sigma: vec4f,  // per-channel base sigma in .xyz (.w unused)
  psf0: vec2f,   // core  Gaussian: (scale, weight)
  psf1: vec2f,   // tail  Gaussian: (scale, weight)
};
@group(0) @binding(2) var<uniform> p: ScatterBlurParams;

fn gauss(i: f32, s: f32) -> f32 {
  let ss = max(s, 0.001);
  return exp(-(i * i) / (2.0 * ss * ss));
}

@fragment
fn fs(@location(0) uv: vec2f) -> @location(0) vec4f {
  let sigma = max(p.sigma.xyz, vec3f(0.001));
  let max_sigma = max(sigma.x, max(sigma.y, sigma.z));
  let max_scale = max(p.psf0.x, p.psf1.x);
  let radius = i32(ceil(max_sigma * max_scale * 3.0));
  var color = vec3f(0.0);
  var wsum = vec3f(0.0);
  for (var i = -radius; i <= radius; i = i + 1) {
    let fi = f32(i);
    let s = textureSample(src, samp, uv + p.dir * fi).rgb;
    let w = vec3f(
      p.psf0.y * gauss(fi, sigma.x * p.psf0.x) + p.psf1.y * gauss(fi, sigma.x * p.psf1.x),
      p.psf0.y * gauss(fi, sigma.y * p.psf0.x) + p.psf1.y * gauss(fi, sigma.y * p.psf1.x),
      p.psf0.y * gauss(fi, sigma.z * p.psf0.x) + p.psf1.y * gauss(fi, sigma.z * p.psf1.x),
    );
    color += s * w;
    wsum += w;
  }
  return vec4f(color / wsum, 1.0);
}
