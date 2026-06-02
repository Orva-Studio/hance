@group(0) @binding(0) var src: texture_2d<f32>;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var lut_tex: texture_3d<f32>;

const LUT_SIZE: f32 = 33.0;

// Samples the 3D input LUT using the pixel's RGB as UVW coordinates, with the
// standard half-texel scale/offset so the grid endpoints land on texel centres.
@fragment
fn fs(@location(0) uv: vec2f) -> @location(0) vec4f {
  let color = textureSample(src, samp, uv);
  let c = clamp(color.rgb, vec3f(0.0), vec3f(1.0));
  let scale = (LUT_SIZE - 1.0) / LUT_SIZE;
  let offset = 1.0 / (2.0 * LUT_SIZE);
  let coord = c * scale + offset;
  let outc = textureSample(lut_tex, samp, coord).rgb;
  return vec4f(outc, color.a);
}
