@group(0) @binding(0) var src: texture_2d<f32>;
@group(0) @binding(1) var samp: sampler;

// Final blit carries one parameter: the frame counter, used to decorrelate the
// dither noise across frames so video does not show a frozen grain overlay.
struct Blit {
  // x = frame_count; y/z/w unused (kept for the std 16-byte uniform layout).
  frame: vec4f,
};
@group(0) @binding(2) var<uniform> blit: Blit;

// Cheap hash -> [0,1). Good enough for dither, no texture lookup needed.
// 0.1031 and 33.33 are the standard Dave Hoskins / IQ integer-hash constants;
// they spread the input bits so nearby pixels get uncorrelated results.
fn hash12(p: vec2f) -> f32 {
  var p3 = fract(vec3f(p.x, p.y, p.x) * 0.1031);
  p3 += dot(p3, vec3f(p3.y, p3.z, p3.x) + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

@fragment
fn fs(@location(0) uv: vec2f, @builtin(position) frag: vec4f) -> @location(0) vec4f {
  let c = textureSample(src, samp, uv).rgb;
  // Offset the hash input by the frame counter so each frame draws a fresh
  // noise field. Frame N is still deterministic (reproducible renders), but
  // successive frames no longer share the same pattern, killing the "noise
  // glued to the glass" look on motion. 17.0 is an arbitrary stride large
  // enough to move past one pixel of correlation per frame.
  let o = blit.frame.x * 17.0;
  // Triangular-PDF dither at the 8-bit quantization step. Two independent
  // uniform samples subtracted give a triangular distribution; scaling by 0.5
  // puts it in (-0.5/255, 0.5/255) = +/-0.5 LSB, the standard TPDF magnitude
  // that breaks up contour banding in smooth, low-slope gradients (e.g.
  // large-radius halation halos) without adding visible noise.
  // 11.7 / 3.1 just decorrelate the second sample from the first.
  let r1 = hash12(frag.xy + vec2f(o, o));
  let r2 = hash12(frag.xy + vec2f(o + 11.7, o + 3.1));
  let dither = ((r1 - r2) * 0.5) / 255.0;
  return vec4f(c + vec3f(dither), 1.0);
}
