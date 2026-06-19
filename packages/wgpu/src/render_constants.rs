use serde::Deserialize;
use std::sync::OnceLock;

/// Internal renderer constants shared with the TS preview renderer. Loaded from
/// the single source `packages/core/constants/render.json` (the same file the
/// TS side imports) so the two renderers cannot drift. See
/// packages/core/src/render-constants.ts.
#[derive(Deserialize)]
pub struct RenderConstants {
    #[serde(rename = "halationThreshold")]
    pub halation_threshold: [f32; 2],
    #[serde(rename = "blurSigmaFactor")]
    pub blur_sigma_factor: f32,
    #[serde(rename = "halationChannelSigma")]
    pub halation_channel_sigma: [f32; 3],
    #[serde(rename = "halationPsf")]
    pub halation_psf: [[f32; 2]; 2],
    #[serde(rename = "halationRing")]
    pub halation_ring: f32,
    #[serde(rename = "referenceHeight")]
    pub reference_height: f32,
    #[serde(rename = "fadeColorHues")]
    pub fade_color_hues: std::collections::HashMap<String, f32>,
    #[serde(rename = "fadeTintStrength")]
    pub fade_tint_strength: f32,
    #[serde(rename = "dofMaxRadius")]
    pub dof_max_radius: f32,
}

const RENDER_CONSTANTS_JSON: &str = include_str!("../../core/constants/render.json");

/// Factor to scale pixel-space blur sigmas so halation/bloom keep the same
/// relative size at any resolution. Mirrors resolutionScale in
/// packages/core/src/render-constants.ts.
pub fn resolution_scale(frame_height: u32) -> f32 {
    if frame_height == 0 {
        return 1.0;
    }
    frame_height as f32 / render_constants().reference_height
}

pub fn render_constants() -> &'static RenderConstants {
    static CACHE: OnceLock<RenderConstants> = OnceLock::new();
    CACHE.get_or_init(|| {
        serde_json::from_str(RENDER_CONSTANTS_JSON).expect("valid render.json constants")
    })
}
