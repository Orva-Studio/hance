@group(0) @binding(0) var src: texture_2d<f32>;
@group(0) @binding(1) var samp: sampler;

struct GrainParams {
  size: f32,
  saturation: f32,
  time: f32,
  iso: f32,
};
@group(0) @binding(2) var<uniform> params: GrainParams;

// ISO that maps to full (1.0) overlay strength. ISO is the single intensity
// control: the legacy default (amount 0.125 at ISO 400) lands at the same
// effective strength, 400/3200 = 0.125.
const ISO_MAX: f32 = 3200.0;
// Grain amplitude weighting at the tonal extremes (linear luma).
const SHADOW_GAIN: f32 = 1.0;
const HIGHLIGHT_GAIN: f32 = 0.35;

fn hash(p: vec2f) -> f32 {
  var p3 = fract(vec3f(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

fn octave(coord: vec2f) -> vec3f {
  let r = hash(coord + vec2f(0.0, 0.0)) * 2.0 - 1.0;
  let g = hash(coord + vec2f(1.7, 3.1)) * 2.0 - 1.0;
  let b = hash(coord + vec2f(5.3, 2.9)) * 2.0 - 1.0;
  let mono = (r + g + b) / 3.0;
  return mix(vec3f(mono), vec3f(r, g, b), params.saturation);
}

// Multi-octave noise: sum three octaves at halving amplitude and doubling
// frequency for a more organic, film-like clump than a single hash lookup.
fn grain_noise(uv: vec2f, t: f32) -> vec3f {
  // Larger size = coarser grain: shrink the lattice density so each noise cell
  // covers more pixels. size 0 is the finest (per-pixel) grain.
  let scale = 1.0 / (1.0 + params.size);
  var sum = vec3f(0.0);
  var amp = 1.0;
  var freq = 1.0;
  var norm = 0.0;
  for (var i = 0; i < 3; i++) {
    // Reseed the noise field each frame instead of translating it: large,
    // mismatched per-axis multipliers on time make consecutive frames
    // independent, so grain boils in place rather than sliding diagonally.
    let jitter = vec2f(t * 71.7, t * 47.3);
    let coord = floor(uv * scale * freq) + jitter + f32(i) * 19.0;
    sum += octave(coord) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2.0;
  }
  return sum / norm;
}

// Linear-luma weighting: strong grain in shadows, fine grain in highlights.
fn luminance_weight(color: vec3f) -> f32 {
  let luma = clamp(dot(color, vec3f(0.2126, 0.7152, 0.0722)), 0.0, 1.0);
  return mix(SHADOW_GAIN, HIGHLIGHT_GAIN, sqrt(luma));
}

@fragment
fn fs(@location(0) uv: vec2f) -> @location(0) vec4f {
  let color = textureSample(src, samp, uv).rgb;
  let dims = vec2f(textureDimensions(src));
  // Weight grain by linear luminance so it clumps in shadows and stays fine in
  // highlights; overall strength comes straight from the virtual ISO.
  let n = grain_noise(uv * dims, params.time) * luminance_weight(color);
  let effAmount = clamp(params.iso / ISO_MAX, 0.0, 1.0);
  let overlay = select(
    2.0 * color * (0.5 + n * 0.5),
    1.0 - 2.0 * (1.0 - color) * (0.5 - n * 0.5),
    color > vec3f(0.5)
  );
  return vec4f(mix(color, overlay, effAmount), 1.0);
}
