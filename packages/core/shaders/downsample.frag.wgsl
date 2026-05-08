@group(0) @binding(0) var src: texture_2d<f32>;
@group(0) @binding(1) var samp: sampler;

struct DownsampleParams {
  texel_size: vec2f,
  _pad: vec2f,
};
@group(0) @binding(2) var<uniform> params: DownsampleParams;

@fragment
fn fs(@location(0) uv: vec2f) -> @location(0) vec4f {
  let t = params.texel_size;

  let a = textureSample(src, samp, uv + t * vec2f(-1.0, -1.0));
  let b = textureSample(src, samp, uv + t * vec2f( 0.0, -1.0));
  let c = textureSample(src, samp, uv + t * vec2f( 1.0, -1.0));
  let d = textureSample(src, samp, uv + t * vec2f(-0.5, -0.5));
  let e = textureSample(src, samp, uv + t * vec2f( 0.5, -0.5));
  let f = textureSample(src, samp, uv + t * vec2f(-1.0,  0.0));
  let g = textureSample(src, samp, uv);
  let h = textureSample(src, samp, uv + t * vec2f( 1.0,  0.0));
  let i = textureSample(src, samp, uv + t * vec2f(-0.5,  0.5));
  let j = textureSample(src, samp, uv + t * vec2f( 0.5,  0.5));
  let k = textureSample(src, samp, uv + t * vec2f(-1.0,  1.0));
  let l = textureSample(src, samp, uv + t * vec2f( 0.0,  1.0));
  let m = textureSample(src, samp, uv + t * vec2f( 1.0,  1.0));

  let center = (d + e + i + j) * 0.125;
  let tl = (a + b + f + g) * 0.03125;
  let tr = (b + c + g + h) * 0.03125;
  let bl = (f + g + k + l) * 0.03125;
  let br = (g + h + l + m) * 0.03125;

  return center + tl + tr + bl + br;
}
