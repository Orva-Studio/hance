@group(0) @binding(0) var base_tex: texture_2d<f32>;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var coarser_tex: texture_2d<f32>;

struct UpsampleParams {
  weight: f32,
  texel_w: f32,
  texel_h: f32,
  _pad: f32,
};
@group(0) @binding(3) var<uniform> params: UpsampleParams;

@fragment
fn fs(@location(0) uv: vec2f) -> @location(0) vec4f {
  let tw = params.texel_w;
  let th = params.texel_h;

  let s00 = textureSample(coarser_tex, samp, uv + vec2f(-tw, -th));
  let s10 = textureSample(coarser_tex, samp, uv + vec2f(0.0, -th));
  let s20 = textureSample(coarser_tex, samp, uv + vec2f( tw, -th));
  let s01 = textureSample(coarser_tex, samp, uv + vec2f(-tw, 0.0));
  let s11 = textureSample(coarser_tex, samp, uv);
  let s21 = textureSample(coarser_tex, samp, uv + vec2f( tw, 0.0));
  let s02 = textureSample(coarser_tex, samp, uv + vec2f(-tw,  th));
  let s12 = textureSample(coarser_tex, samp, uv + vec2f(0.0,  th));
  let s22 = textureSample(coarser_tex, samp, uv + vec2f( tw,  th));

  let upsampled = (s00 + s20 + s02 + s22) * (1.0 / 16.0)
                + (s10 + s01 + s21 + s12) * (2.0 / 16.0)
                + s11 * (4.0 / 16.0);

  let current = textureSample(base_tex, samp, uv);
  return current * params.weight + upsampled;
}
