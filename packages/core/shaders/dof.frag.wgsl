// Depth-driven bokeh. Per-pixel blur radius grows with distance from the focus
// plane in normalized depth, clamped by a max-blur cap. Single-pass disc gather
// with a fixed golden-angle tap set.
//
// ponytail: uniform-weight disc, no per-tap depth test, no scatter/cat-eye
// bokeh, no occlusion handling. Known ceilings: edge bleeding across the focus
// boundary; foreground halo. Upgrade to multi-layer / scatter or SAM-refined
// edges only if the look demands it.
@group(0) @binding(0) var scene: texture_2d<f32>;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var depth_tex: texture_2d<f32>;

struct DofParams {
  // focus plane (0–1), radius coefficient (px), max blur (px), pad
  focus_coeff_maxblur: vec4f,
  // 1/width, 1/height, pad, pad
  texel: vec4f,
};
@group(0) @binding(3) var<uniform> p: DofParams;

const TAPS: i32 = 24;
const GOLDEN: f32 = 2.3999632; // ~137.5° in radians

@fragment
fn fs(@location(0) uv: vec2f) -> @location(0) vec4f {
  let focus = p.focus_coeff_maxblur.x;
  let coeff = p.focus_coeff_maxblur.y;
  let max_blur = p.focus_coeff_maxblur.z;
  let texel = p.texel.xy;

  // textureSampleLevel (explicit LOD) so the gather is legal in the
  // non-uniform control flow below — textureSample needs uniform flow.
  let d = textureSampleLevel(depth_tex, samp, uv, 0.0).r;
  let radius_px = min(coeff * abs(d - focus), max_blur);

  let center = textureSampleLevel(scene, samp, uv, 0.0);
  if (radius_px < 0.5) {
    return center; // in focus — leave sharp
  }

  var sum = center.rgb;
  var wsum = 1.0;
  for (var i = 0; i < TAPS; i = i + 1) {
    let fi = f32(i) + 0.5;
    // sqrt spacing spreads taps evenly across the disc area.
    let r = sqrt(fi / f32(TAPS)) * radius_px;
    let a = fi * GOLDEN;
    let off = vec2f(cos(a), sin(a)) * r * texel;
    sum += textureSampleLevel(scene, samp, uv + off, 0.0).rgb;
    wsum += 1.0;
  }
  return vec4f(sum / wsum, center.a);
}
