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
}

const RENDER_CONSTANTS_JSON: &str = include_str!("../../core/constants/render.json");

pub fn render_constants() -> &'static RenderConstants {
    static CACHE: OnceLock<RenderConstants> = OnceLock::new();
    CACHE.get_or_init(|| {
        serde_json::from_str(RENDER_CONSTANTS_JSON).expect("valid render.json constants")
    })
}
