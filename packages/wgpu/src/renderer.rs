use std::collections::HashMap;
use wgpu::*;

use crate::params::Params;
use crate::passes;

const VERT: &str = include_str!("../../core/shaders/fullscreen.vert.wgsl");
const COLOR_FRAG: &str = include_str!("../../core/shaders/color-settings.frag.wgsl");
const THRESHOLD_FRAG: &str = include_str!("../../core/shaders/threshold.frag.wgsl");
const BLUR_FRAG: &str = include_str!("../../core/shaders/blur.frag.wgsl");
const BLEND_FRAG: &str = include_str!("../../core/shaders/screen-blend.frag.wgsl");
const ABERRATION_FRAG: &str = include_str!("../../core/shaders/aberration.frag.wgsl");
const GRAIN_FRAG: &str = include_str!("../../core/shaders/grain.frag.wgsl");
const VIGNETTE_FRAG: &str = include_str!("../../core/shaders/vignette.frag.wgsl");
const SPLIT_TONE_FRAG: &str = include_str!("../../core/shaders/split-tone.frag.wgsl");
const SHAKE_FRAG: &str = include_str!("../../core/shaders/camera-shake.frag.wgsl");

const COLORSPACE_FRAG: &str = include_str!("../../core/shaders/colorspace.frag.wgsl");
const LUT_FRAG: &str = include_str!("../../core/shaders/lut.frag.wgsl");

const LUT_N: u32 = 33;

const INTERMEDIATE_FORMAT: TextureFormat = TextureFormat::Rgba16Float;
const OUTPUT_FORMAT: TextureFormat = TextureFormat::Rgba8Unorm;

pub struct GpuRenderer {
    device: Device,
    queue: Queue,
    width: u32,
    height: u32,
    params: Params,
    frame_count: u32,

    // Textures
    src_tex: Texture,
    tex_a: Texture,
    tex_b: Texture,
    half_a: Texture,
    half_b: Texture,
    output_tex: Texture,

    // Layouts
    std_layout: BindGroupLayout,
    blend_layout: BindGroupLayout,
    lut_layout: BindGroupLayout,
    sampler: Sampler,

    // Input/pre-LUT (None = identity/disabled, pass skipped)
    lut_pipeline: RenderPipeline,
    lut_tex: Option<Texture>,

    // Pipelines
    color_pipeline: RenderPipeline,
    threshold_pipeline: RenderPipeline,
    blur_pipeline: RenderPipeline,
    blend_pipeline: RenderPipeline,
    aberration_pipeline: RenderPipeline,
    grain_pipeline: RenderPipeline,
    vignette_pipeline: RenderPipeline,
    split_tone_pipeline: RenderPipeline,
    shake_pipeline: RenderPipeline,
    colorspace_pipeline: RenderPipeline,
    blit_pipeline: RenderPipeline,

    // Uniform buffers
    color_ub: Buffer,
    threshold_ub: Buffer,
    blur_ub1: Buffer,
    blur_ub2: Buffer,
    blend_ub: Buffer,
    aberration_ub: Buffer,
    grain_ub: Buffer,
    vignette_ub: Buffer,
    split_tone_ub: Buffer,
    shake_ub: Buffer,
    bloom_blur_ub1: Buffer,
    bloom_blur_ub2: Buffer,
    bloom_blend_ub: Buffer,
    decode_ub: Buffer,
    encode_ub: Buffer,
    color_ub_identity: Buffer,

    // Readback
    staging_buf: Buffer,
}

impl GpuRenderer {
    pub fn new(width: u32, height: u32, raw_params: &HashMap<String, serde_json::Value>, lut: Option<&[f32]>) -> Result<Self, String> {
        let instance = Instance::new(&InstanceDescriptor {
            backends: Backends::all(),
            ..Default::default()
        });

        let adapter = pollster::block_on(instance.request_adapter(&RequestAdapterOptions {
            power_preference: PowerPreference::HighPerformance,
            ..Default::default()
        }))
        .ok_or("No GPU adapter found")?;

        let (device, queue) = pollster::block_on(adapter.request_device(&DeviceDescriptor {
            label: Some("hance-gpu"),
            ..Default::default()
        }, None))
        .map_err(|e| format!("Device request failed: {e}"))?;

        let sampler = device.create_sampler(&SamplerDescriptor {
            mag_filter: FilterMode::Linear,
            min_filter: FilterMode::Linear,
            ..Default::default()
        });

        let std_layout = passes::create_standard_bind_group_layout(&device);
        let blend_layout = passes::create_blend_bind_group_layout(&device);
        let lut_layout = passes::create_lut_bind_group_layout(&device);

        let half_w = (width / 2).max(1);
        let half_h = (height / 2).max(1);

        let src_tex = device.create_texture(&TextureDescriptor {
            label: Some("src"),
            size: Extent3d { width, height, depth_or_array_layers: 1 },
            mip_level_count: 1,
            sample_count: 1,
            dimension: TextureDimension::D2,
            format: TextureFormat::Rgba8Unorm,
            usage: TextureUsages::TEXTURE_BINDING | TextureUsages::COPY_DST,
            view_formats: &[],
        });

        let tex_a = passes::create_texture(&device, width, height, INTERMEDIATE_FORMAT);
        let tex_b = passes::create_texture(&device, width, height, INTERMEDIATE_FORMAT);
        let half_a = passes::create_texture(&device, half_w, half_h, INTERMEDIATE_FORMAT);
        let half_b = passes::create_texture(&device, half_w, half_h, INTERMEDIATE_FORMAT);
        let output_tex = passes::create_texture(&device, width, height, OUTPUT_FORMAT);

        let color_pipeline = passes::create_pipeline(&device, VERT, COLOR_FRAG, &std_layout, INTERMEDIATE_FORMAT);
        let threshold_pipeline = passes::create_pipeline(&device, VERT, THRESHOLD_FRAG, &std_layout, INTERMEDIATE_FORMAT);
        let blur_pipeline = passes::create_pipeline(&device, VERT, BLUR_FRAG, &std_layout, INTERMEDIATE_FORMAT);
        let blend_pipeline = passes::create_pipeline(&device, VERT, BLEND_FRAG, &blend_layout, INTERMEDIATE_FORMAT);
        let aberration_pipeline = passes::create_pipeline(&device, VERT, ABERRATION_FRAG, &std_layout, INTERMEDIATE_FORMAT);
        let grain_pipeline = passes::create_pipeline(&device, VERT, GRAIN_FRAG, &std_layout, INTERMEDIATE_FORMAT);
        let vignette_pipeline = passes::create_pipeline(&device, VERT, VIGNETTE_FRAG, &std_layout, INTERMEDIATE_FORMAT);
        let split_tone_pipeline = passes::create_pipeline(&device, VERT, SPLIT_TONE_FRAG, &std_layout, INTERMEDIATE_FORMAT);
        let shake_pipeline = passes::create_pipeline(&device, VERT, SHAKE_FRAG, &std_layout, INTERMEDIATE_FORMAT);
        let colorspace_pipeline = passes::create_pipeline(&device, VERT, COLORSPACE_FRAG, &std_layout, INTERMEDIATE_FORMAT);
        let blit_pipeline = passes::create_pipeline(&device, VERT, COLOR_FRAG, &std_layout, OUTPUT_FORMAT);
        let lut_pipeline = passes::create_pipeline(&device, VERT, LUT_FRAG, &lut_layout, INTERMEDIATE_FORMAT);

        // Upload the baked LUT as a 33^3 rgba16float 3D texture (alpha = 1).
        let lut_tex = lut.map(|data| {
            let n = LUT_N as usize;
            let mut texels: Vec<u8> = Vec::with_capacity(n * n * n * 4 * 2);
            let one = half::f16::from_f32(1.0).to_le_bytes();
            for px in data.chunks_exact(3) {
                for &c in px {
                    texels.extend_from_slice(&half::f16::from_f32(c).to_le_bytes());
                }
                texels.extend_from_slice(&one);
            }
            let tex = device.create_texture(&TextureDescriptor {
                label: Some("input-lut"),
                size: Extent3d { width: LUT_N, height: LUT_N, depth_or_array_layers: LUT_N },
                mip_level_count: 1,
                sample_count: 1,
                dimension: TextureDimension::D3,
                format: TextureFormat::Rgba16Float,
                usage: TextureUsages::TEXTURE_BINDING | TextureUsages::COPY_DST,
                view_formats: &[],
            });
            queue.write_texture(
                TexelCopyTextureInfo {
                    texture: &tex,
                    mip_level: 0,
                    origin: Origin3d::ZERO,
                    aspect: TextureAspect::All,
                },
                &texels,
                TexelCopyBufferLayout {
                    offset: 0,
                    bytes_per_row: Some(LUT_N * 4 * 2),
                    rows_per_image: Some(LUT_N),
                },
                Extent3d { width: LUT_N, height: LUT_N, depth_or_array_layers: LUT_N },
            );
            tex
        });

        let color_ub = passes::create_uniform_buffer(&device, 32);
        let threshold_ub = passes::create_uniform_buffer(&device, 16);
        let blur_ub1 = passes::create_uniform_buffer(&device, 16);
        let blur_ub2 = passes::create_uniform_buffer(&device, 16);
        let blend_ub = passes::create_uniform_buffer(&device, 16);
        let aberration_ub = passes::create_uniform_buffer(&device, 16);
        let grain_ub = passes::create_uniform_buffer(&device, 32);
        let vignette_ub = passes::create_uniform_buffer(&device, 16);
        let split_tone_ub = passes::create_uniform_buffer(&device, 32);
        let shake_ub = passes::create_uniform_buffer(&device, 16);
        let bloom_blur_ub1 = passes::create_uniform_buffer(&device, 16);
        let bloom_blur_ub2 = passes::create_uniform_buffer(&device, 16);
        let bloom_blend_ub = passes::create_uniform_buffer(&device, 16);
        let decode_ub = passes::create_uniform_buffer(&device, 16);
        queue.write_buffer(&decode_ub, 0, bytemuck_cast(&[0.0f32, 0.0, 0.0, 0.0])); // 0 = sRGB->linear
        let encode_ub = passes::create_uniform_buffer(&device, 16);
        queue.write_buffer(&encode_ub, 0, bytemuck_cast(&[1.0f32, 0.0, 0.0, 0.0])); // 1 = linear->sRGB
        let color_ub_identity = passes::create_uniform_buffer(&device, 32);
        queue.write_buffer(&color_ub_identity, 0, bytemuck_cast(&[1.0f32, 0.0, 1.0, 1.0, 6500.0, 0.0, 0.0, 0.0]));

        let bytes_per_row = ((width * 4 + 255) / 256) * 256;
        let staging_buf = device.create_buffer(&BufferDescriptor {
            label: Some("staging"),
            size: (bytes_per_row * height) as u64,
            usage: BufferUsages::COPY_DST | BufferUsages::MAP_READ,
            mapped_at_creation: false,
        });

        Ok(Self {
            device,
            queue,
            width,
            height,
            params: Params::new(raw_params.clone()),
            frame_count: 0,
            src_tex,
            tex_a,
            tex_b,
            half_a,
            half_b,
            output_tex,
            std_layout,
            blend_layout,
            lut_layout,
            sampler,
            lut_pipeline,
            lut_tex,
            color_pipeline,
            threshold_pipeline,
            blur_pipeline,
            blend_pipeline,
            aberration_pipeline,
            grain_pipeline,
            vignette_pipeline,
            split_tone_pipeline,
            shake_pipeline,
            colorspace_pipeline,
            blit_pipeline,
            color_ub,
            threshold_ub,
            blur_ub1,
            blur_ub2,
            blend_ub,
            aberration_ub,
            grain_ub,
            vignette_ub,
            split_tone_ub,
            shake_ub,
            bloom_blur_ub1,
            bloom_blur_ub2,
            bloom_blend_ub,
            decode_ub,
            encode_ub,
            color_ub_identity,
            staging_buf,
        })
    }

    fn write_uniform(&self, buffer: &Buffer, data: &[f32]) {
        self.queue.write_buffer(buffer, 0, bytemuck_cast(data));
    }

    pub fn render_frame(&mut self, input: &[u8]) -> Vec<u8> {
        self.frame_count += 1;

        // Upload source
        self.queue.write_texture(
            TexelCopyTextureInfo {
                texture: &self.src_tex,
                mip_level: 0,
                origin: Origin3d::ZERO,
                aspect: TextureAspect::All,
            },
            input,
            TexelCopyBufferLayout {
                offset: 0,
                bytes_per_row: Some(self.width * 4),
                rows_per_image: Some(self.height),
            },
            Extent3d { width: self.width, height: self.height, depth_or_array_layers: 1 },
        );

        let mut encoder = self.device.create_command_encoder(&CommandEncoderDescriptor { label: None });

        let mut current_is_b = false;

        macro_rules! current_tex { () => { if current_is_b { &self.tex_b } else { &self.tex_a } } }
        macro_rules! other_tex { () => { if current_is_b { &self.tex_a } else { &self.tex_b } } }
        macro_rules! swap { () => { current_is_b = !current_is_b; } }

        let half_w = (self.width / 2).max(1);
        let half_h = (self.height / 2).max(1);

        // --- Input/pre-LUT (first pass, src_tex -> tex_a) ---
        // Skipped entirely when identity/disabled (lut_tex is None) so the frame
        // passes through untouched. When active, Color Settings reads tex_a.
        let color_input = if let Some(lut_tex) = &self.lut_tex {
            let lut_view = lut_tex.create_view(&TextureViewDescriptor {
                dimension: Some(TextureViewDimension::D3),
                ..Default::default()
            });
            let bg = passes::make_lut_bind_group(
                &self.device, &self.lut_layout,
                &self.src_tex.create_view(&TextureViewDescriptor::default()),
                &self.sampler, &lut_view,
            );
            passes::run_pass(&mut encoder, &self.lut_pipeline, &bg,
                &self.tex_a.create_view(&TextureViewDescriptor::default()));
            // Color must write somewhere other than its tex_a input.
            current_is_b = true;
            self.tex_a.create_view(&TextureViewDescriptor::default())
        } else {
            self.src_tex.create_view(&TextureViewDescriptor::default())
        };

        // --- Color Settings ---
        if !self.params.bool("no-color-settings", false) {
            self.write_uniform(&self.color_ub, &self.params.color_settings_uniform());
        } else {
            self.write_uniform(&self.color_ub, &Params::color_settings_identity());
        }
        let bg = passes::make_std_bind_group(
            &self.device, &self.std_layout,
            &color_input,
            &self.sampler, &self.color_ub,
        );
        passes::run_pass(&mut encoder, &self.color_pipeline, &bg,
            &current_tex!().create_view(&TextureViewDescriptor::default()));

        // The light-transport group runs in linear light. Only bracket the chain
        // with decode/encode passes when at least one of those effects is active,
        // so a frame with the whole group disabled passes through byte-for-byte.
        let light_group_active = self.params.halation_enabled()
            || self.params.aberration_enabled()
            || self.params.bloom_enabled()
            || self.params.grain_enabled()
            || self.params.vignette_enabled();

        // --- Decode to linear light (start of light-transport bracket) ---
        if light_group_active {
            let bg = passes::make_std_bind_group(
                &self.device, &self.std_layout,
                &current_tex!().create_view(&TextureViewDescriptor::default()),
                &self.sampler, &self.decode_ub,
            );
            passes::run_pass(&mut encoder, &self.colorspace_pipeline, &bg,
                &other_tex!().create_view(&TextureViewDescriptor::default()));
            swap!();
        }

        // --- Halation ---
        if self.params.halation_enabled() {
            let amount = self.params.halation_amount();
            let radius = self.params.halation_radius();
            let consts = crate::render_constants::render_constants();
            let sigma = radius * consts.blur_sigma_factor;

            if self.params.halation_highlights_only() {
                self.write_uniform(&self.threshold_ub, &[consts.halation_threshold[0], consts.halation_threshold[1], 0.0, 0.0]);
                let bg = passes::make_std_bind_group(
                    &self.device, &self.std_layout,
                    &current_tex!().create_view(&TextureViewDescriptor::default()),
                    &self.sampler, &self.threshold_ub,
                );
                passes::run_pass(&mut encoder, &self.threshold_pipeline, &bg,
                    &self.half_a.create_view(&TextureViewDescriptor::default()));
            } else {
                self.write_uniform(&self.blur_ub1, &[0.0, 0.0, 0.001, 0.0]);
                let bg = passes::make_std_bind_group(
                    &self.device, &self.std_layout,
                    &current_tex!().create_view(&TextureViewDescriptor::default()),
                    &self.sampler, &self.blur_ub1,
                );
                passes::run_pass(&mut encoder, &self.blur_pipeline, &bg,
                    &self.half_a.create_view(&TextureViewDescriptor::default()));
            }

            self.write_uniform(&self.blur_ub1, &[1.0 / half_w as f32, 0.0, sigma, 0.0]);
            let h_bg = passes::make_std_bind_group(
                &self.device, &self.std_layout,
                &self.half_a.create_view(&TextureViewDescriptor::default()),
                &self.sampler, &self.blur_ub1,
            );
            passes::run_pass(&mut encoder, &self.blur_pipeline, &h_bg,
                &self.half_b.create_view(&TextureViewDescriptor::default()));

            self.write_uniform(&self.blur_ub2, &[0.0, 1.0 / half_h as f32, sigma, 0.0]);
            let v_bg = passes::make_std_bind_group(
                &self.device, &self.std_layout,
                &self.half_b.create_view(&TextureViewDescriptor::default()),
                &self.sampler, &self.blur_ub2,
            );
            passes::run_pass(&mut encoder, &self.blur_pipeline, &v_bg,
                &self.half_a.create_view(&TextureViewDescriptor::default()));

            let hue = self.params.halation_hue();
            let sat = self.params.halation_saturation();
            self.write_uniform(&self.blend_ub, &[amount, hue, sat, 0.0]);
            let blend_bg = passes::make_blend_bind_group(
                &self.device, &self.blend_layout,
                &current_tex!().create_view(&TextureViewDescriptor::default()),
                &self.sampler,
                &self.half_a.create_view(&TextureViewDescriptor::default()),
                &self.blend_ub,
            );
            passes::run_pass(&mut encoder, &self.blend_pipeline, &blend_bg,
                &other_tex!().create_view(&TextureViewDescriptor::default()));
            swap!();
        }

        // --- Chromatic Aberration ---
        if self.params.aberration_enabled() {
            let offset = self.params.aberration_offset();
            self.write_uniform(&self.aberration_ub, &[offset, 0.0, 0.0, 0.0]);
            let bg = passes::make_std_bind_group(
                &self.device, &self.std_layout,
                &current_tex!().create_view(&TextureViewDescriptor::default()),
                &self.sampler, &self.aberration_ub,
            );
            passes::run_pass(&mut encoder, &self.aberration_pipeline, &bg,
                &other_tex!().create_view(&TextureViewDescriptor::default()));
            swap!();
        }

        // --- Bloom ---
        if self.params.bloom_enabled() {
            let amount = self.params.bloom_amount();
            let radius = self.params.bloom_radius();
            let sigma = radius * crate::render_constants::render_constants().blur_sigma_factor;

            self.write_uniform(&self.blur_ub1, &[0.0, 0.0, 0.001, 0.0]);
            let ds_bg = passes::make_std_bind_group(
                &self.device, &self.std_layout,
                &current_tex!().create_view(&TextureViewDescriptor::default()),
                &self.sampler, &self.blur_ub1,
            );
            passes::run_pass(&mut encoder, &self.blur_pipeline, &ds_bg,
                &self.half_a.create_view(&TextureViewDescriptor::default()));

            self.write_uniform(&self.bloom_blur_ub1, &[1.0 / half_w as f32, 0.0, sigma, 0.0]);
            let h_bg = passes::make_std_bind_group(
                &self.device, &self.std_layout,
                &self.half_a.create_view(&TextureViewDescriptor::default()),
                &self.sampler, &self.bloom_blur_ub1,
            );
            passes::run_pass(&mut encoder, &self.blur_pipeline, &h_bg,
                &self.half_b.create_view(&TextureViewDescriptor::default()));

            self.write_uniform(&self.bloom_blur_ub2, &[0.0, 1.0 / half_h as f32, sigma, 0.0]);
            let v_bg = passes::make_std_bind_group(
                &self.device, &self.std_layout,
                &self.half_b.create_view(&TextureViewDescriptor::default()),
                &self.sampler, &self.bloom_blur_ub2,
            );
            passes::run_pass(&mut encoder, &self.blur_pipeline, &v_bg,
                &self.half_a.create_view(&TextureViewDescriptor::default()));

            self.write_uniform(&self.bloom_blend_ub, &[amount, 0.0, 1.0, 0.0]);
            let blend_bg = passes::make_blend_bind_group(
                &self.device, &self.blend_layout,
                &current_tex!().create_view(&TextureViewDescriptor::default()),
                &self.sampler,
                &self.half_a.create_view(&TextureViewDescriptor::default()),
                &self.bloom_blend_ub,
            );
            passes::run_pass(&mut encoder, &self.blend_pipeline, &blend_bg,
                &other_tex!().create_view(&TextureViewDescriptor::default()));
            swap!();
        }

        // --- Grain ---
        if self.params.grain_enabled() {
            self.write_uniform(&self.grain_ub, &self.params.grain_uniform(self.frame_count, self.width, self.height));
            let bg = passes::make_std_bind_group(
                &self.device, &self.std_layout,
                &current_tex!().create_view(&TextureViewDescriptor::default()),
                &self.sampler, &self.grain_ub,
            );
            passes::run_pass(&mut encoder, &self.grain_pipeline, &bg,
                &other_tex!().create_view(&TextureViewDescriptor::default()));
            swap!();
        }

        // --- Vignette ---
        if self.params.vignette_enabled() {
            self.write_uniform(&self.vignette_ub, &self.params.vignette_uniform());
            let bg = passes::make_std_bind_group(
                &self.device, &self.std_layout,
                &current_tex!().create_view(&TextureViewDescriptor::default()),
                &self.sampler, &self.vignette_ub,
            );
            passes::run_pass(&mut encoder, &self.vignette_pipeline, &bg,
                &other_tex!().create_view(&TextureViewDescriptor::default()));
            swap!();
        }

        // --- Encode back to sRGB (end of light-transport bracket) ---
        if light_group_active {
            let bg = passes::make_std_bind_group(
                &self.device, &self.std_layout,
                &current_tex!().create_view(&TextureViewDescriptor::default()),
                &self.sampler, &self.encode_ub,
            );
            passes::run_pass(&mut encoder, &self.colorspace_pipeline, &bg,
                &other_tex!().create_view(&TextureViewDescriptor::default()));
            swap!();
        }

        // --- Split Tone ---
        if self.params.split_tone_enabled() {
            self.write_uniform(&self.split_tone_ub, &self.params.split_tone_uniform());
            let bg = passes::make_std_bind_group(
                &self.device, &self.std_layout,
                &current_tex!().create_view(&TextureViewDescriptor::default()),
                &self.sampler, &self.split_tone_ub,
            );
            passes::run_pass(&mut encoder, &self.split_tone_pipeline, &bg,
                &other_tex!().create_view(&TextureViewDescriptor::default()));
            swap!();
        }

        // --- Camera Shake ---
        if self.params.camera_shake_enabled() {
            self.write_uniform(&self.shake_ub, &self.params.camera_shake_uniform(self.frame_count, self.width));
            let bg = passes::make_std_bind_group(
                &self.device, &self.std_layout,
                &current_tex!().create_view(&TextureViewDescriptor::default()),
                &self.sampler, &self.shake_ub,
            );
            passes::run_pass(&mut encoder, &self.shake_pipeline, &bg,
                &other_tex!().create_view(&TextureViewDescriptor::default()));
            swap!();
        }

        // --- Final blit to 8-bit output ---
        {
            let bg = passes::make_std_bind_group(
                &self.device, &self.std_layout,
                &current_tex!().create_view(&TextureViewDescriptor::default()),
                &self.sampler, &self.color_ub_identity,
            );
            passes::run_pass(&mut encoder, &self.blit_pipeline, &bg,
                &self.output_tex.create_view(&TextureViewDescriptor::default()));
        }

        // --- Readback ---
        let bytes_per_row = ((self.width * 4 + 255) / 256) * 256;
        encoder.copy_texture_to_buffer(
            TexelCopyTextureInfo {
                texture: &self.output_tex,
                mip_level: 0,
                origin: Origin3d::ZERO,
                aspect: TextureAspect::All,
            },
            TexelCopyBufferInfo {
                buffer: &self.staging_buf,
                layout: TexelCopyBufferLayout {
                    offset: 0,
                    bytes_per_row: Some(bytes_per_row),
                    rows_per_image: Some(self.height),
                },
            },
            Extent3d { width: self.width, height: self.height, depth_or_array_layers: 1 },
        );

        self.queue.submit(std::iter::once(encoder.finish()));

        let slice = self.staging_buf.slice(..);
        slice.map_async(MapMode::Read, |_| {});
        self.device.poll(Maintain::Wait);

        let mapped = slice.get_mapped_range();
        let mut result = vec![0u8; (self.width * self.height * 4) as usize];
        for y in 0..self.height {
            let src_offset = (y * bytes_per_row) as usize;
            let dst_offset = (y * self.width * 4) as usize;
            let row_bytes = (self.width * 4) as usize;
            result[dst_offset..dst_offset + row_bytes]
                .copy_from_slice(&mapped[src_offset..src_offset + row_bytes]);
        }
        drop(mapped);
        self.staging_buf.unmap();

        result
    }
}

/// Cast &[f32] to &[u8] for uniform buffer writes
fn bytemuck_cast(data: &[f32]) -> &[u8] {
    unsafe { std::slice::from_raw_parts(data.as_ptr() as *const u8, data.len() * 4) }
}
