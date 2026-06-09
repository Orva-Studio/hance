use serde::Deserialize;
use std::collections::HashMap;

#[derive(Deserialize)]
pub struct InitMessage {
    pub width: u32,
    pub height: u32,
    pub params: HashMap<String, serde_json::Value>,
    // Baked input/pre-LUT (33^3 * 3 floats, RGB-major, R fastest). None when the
    // pre-LUT is identity (rec709) or disabled — the pass is skipped entirely.
    #[serde(default)]
    pub lut: Option<Vec<f32>>,
}

/// Fully-saturated RGB for a hue in degrees (HSV with s=v=1).
pub fn hue_to_rgb(h_deg: f32) -> [f32; 3] {
    let h = h_deg.rem_euclid(360.0) / 60.0;
    let x = 1.0 - (h % 2.0 - 1.0).abs();
    match h as i32 {
        0 => [1.0, x, 0.0],
        1 => [x, 1.0, 0.0],
        2 => [0.0, 1.0, x],
        3 => [0.0, x, 1.0],
        4 => [x, 0.0, 1.0],
        _ => [1.0, 0.0, x],
    }
}

pub struct Params {
    map: HashMap<String, serde_json::Value>,
}

impl Params {
    pub fn new(map: HashMap<String, serde_json::Value>) -> Self {
        Self { map }
    }

    pub fn num(&self, key: &str, fallback: f32) -> f32 {
        self.map
            .get(key)
            .and_then(|v| v.as_f64())
            .map(|v| v as f32)
            .unwrap_or(fallback)
    }

    pub fn bool(&self, key: &str, fallback: bool) -> bool {
        self.map
            .get(key)
            .and_then(|v| v.as_bool())
            .unwrap_or(fallback)
    }

    pub fn str(&self, key: &str, fallback: &str) -> String {
        self.map
            .get(key)
            .and_then(|v| v.as_str())
            .map(|s| s.to_string())
            .unwrap_or_else(|| fallback.to_string())
    }

    /// Color settings uniform:
    /// [contrast, brightness, saturation, gamma, whiteBalance, tint, bleachBypass, _pad,
    ///  liftR, liftG, liftB, _pad]
    pub fn color_settings_uniform(&self) -> [f32; 12] {
        let fade = self.num("fade", 0.0);
        let contrast = self.num("contrast", 1.0) * (1.0 - fade);
        let brightness = self.num("exposure", 0.0) * 0.1;
        let saturation = self.num("subtractive-sat", 1.0) * self.num("richness", 1.0);
        let gamma = 1.0 - self.num("highlights", 0.0) * 0.5;
        let wb = self.num("white-balance", 6500.0);
        let tint = self.num("tint", 0.0) / 100.0;
        let bleach = self.num("bleach-bypass", 0.0);

        // Tintable black lift. Neutral (white) tint reproduces the legacy fade.
        let lift_base = fade * 0.05;
        let fade_tint = self.num("fade-tint", 0.0);
        let hue = hue_to_rgb(self.num("fade-hue", 0.0));
        let lift = [
            lift_base * (1.0 + fade_tint * (hue[0] - 1.0)),
            lift_base * (1.0 + fade_tint * (hue[1] - 1.0)),
            lift_base * (1.0 + fade_tint * (hue[2] - 1.0)),
        ];
        [
            contrast, brightness, saturation, gamma, wb, tint, bleach, 0.0,
            lift[0], lift[1], lift[2], 0.0,
        ]
    }

    /// Identity color settings (passthrough)
    pub fn color_settings_identity() -> [f32; 12] {
        [1.0, 0.0, 1.0, 1.0, 6500.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0]
    }

    pub fn halation_enabled(&self) -> bool {
        !self.bool("no-halation", false) && self.num("halation-amount", 0.25) > 0.0
    }

    pub fn halation_amount(&self) -> f32 {
        self.num("halation-amount", 0.25)
    }

    pub fn halation_radius(&self) -> f32 {
        self.num("halation-radius", 4.0)
    }

    pub fn halation_highlights_only(&self) -> bool {
        self.bool("halation-highlights-only", true)
    }

    pub fn aberration_enabled(&self) -> bool {
        !self.bool("no-aberration", false) && self.num("aberration", 0.3) > 0.0
    }

    pub fn aberration_offset(&self) -> f32 {
        self.num("aberration", 0.3) * 0.02
    }

    pub fn bloom_enabled(&self) -> bool {
        !self.bool("no-bloom", false) && self.num("bloom-amount", 0.25) > 0.0
    }

    pub fn bloom_amount(&self) -> f32 {
        self.num("bloom-amount", 0.25)
    }

    pub fn bloom_radius(&self) -> f32 {
        self.num("bloom-radius", 10.0)
    }

    pub fn grain_enabled(&self) -> bool {
        !self.bool("no-grain", false) && self.num("grain-amount", 0.125) > 0.0
    }

    /// Grain uniform: [amount, size, softness, saturation, defocus, time, texelW, texelH]
    pub fn grain_uniform(&self, frame_count: u32, width: u32, height: u32) -> [f32; 8] {
        [
            self.num("grain-amount", 0.125),
            self.num("grain-size", 0.0),
            self.num("grain-softness", 0.1),
            self.num("grain-saturation", 0.3),
            self.num("grain-defocus", 1.0),
            frame_count as f32,
            1.0 / width as f32,
            1.0 / height as f32,
        ]
    }

    pub fn vignette_enabled(&self) -> bool {
        !self.bool("no-vignette", false) && self.num("vignette-amount", 0.25) > 0.0
    }

    /// Vignette uniform: [angle, aspect, 0, 0]
    pub fn vignette_uniform(&self) -> [f32; 4] {
        let amount = self.num("vignette-amount", 0.25);
        let angle = amount * std::f32::consts::FRAC_PI_2;
        let aspect = 1.0 - self.num("vignette-size", 0.25) * 0.5;
        [angle, aspect, 0.0, 0.0]
    }

    pub fn split_tone_enabled(&self) -> bool {
        !self.bool("no-split-tone", false) && self.num("split-tone-amount", 0.0) > 0.0
    }

    /// Split tone uniform:
    /// [shadowR, shadowB, shadowG, _pad, highlightR, highlightB, highlightG, _pad,
    ///  midR, amount, protect, _pad]
    pub fn split_tone_uniform(&self) -> [f32; 12] {
        let amount = self.num("split-tone-amount", 0.0);
        let hue = self.num("split-tone-hue", 20.0);
        let pivot = self.num("split-tone-pivot", 0.3);
        let mode = self.str("split-tone-mode", "natural");
        let protect = if self.bool("split-tone-protect-neutrals", false) { 1.0 } else { 0.0 };

        // Centered hue wheel: a fully-saturated hue minus its own mean, so the
        // tint is mean-neutral — its channels sum to zero (a neutral gray gets no
        // shift). Not luma-weighted, so a pure hue still nudges brightness slightly.
        let rgb = hue_to_rgb(hue);
        let mean = (rgb[0] + rgb[1] + rgb[2]) / 3.0;
        let tint = [rgb[0] - mean, rgb[1] - mean, rgb[2] - mean];
        let shadow_r = tint[0] * amount * 0.3;
        let shadow_g = tint[1] * amount * 0.3;
        let shadow_b = tint[2] * amount * 0.3;

        let highlight_scale = if mode == "complementary" { 0.3 } else { 0.15 };
        let sign = if mode == "complementary" { -1.0 } else { 1.0 };
        let highlight_r = sign * tint[0] * amount * highlight_scale;
        let highlight_g = sign * tint[1] * amount * highlight_scale;
        let highlight_b = sign * tint[2] * amount * highlight_scale;
        let mid_r = pivot * -0.1;

        [
            shadow_r, shadow_b, shadow_g, 0.0,
            highlight_r, highlight_b, highlight_g, 0.0,
            mid_r, amount, protect, 0.0,
        ]
    }

    pub fn camera_shake_enabled(&self) -> bool {
        !self.bool("no-camera-shake", false) && self.num("camera-shake-amount", 0.25) > 0.0
    }

    /// Camera shake uniform: [amplitude, period1, period2, frame]
    pub fn camera_shake_uniform(&self, frame_count: u32, width: u32) -> [f32; 4] {
        let amount = self.num("camera-shake-amount", 0.25);
        let rate = self.num("camera-shake-rate", 0.5);
        let amplitude = (amount * 3.0) / width as f32;
        let period1 = (30.0 / (rate + 0.01)).max(1.0);
        let period2 = period1 * 1.3;
        [amplitude, period1, period2, frame_count as f32]
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_params(pairs: &[(&str, serde_json::Value)]) -> Params {
        let map: HashMap<String, serde_json::Value> = pairs
            .iter()
            .map(|(k, v)| (k.to_string(), v.clone()))
            .collect();
        Params::new(map)
    }

    #[test]
    fn color_settings_defaults() {
        let p = make_params(&[]);
        let u = p.color_settings_uniform();
        assert_eq!(u[0], 1.0);
        assert_eq!(u[1], 0.0);
        assert_eq!(u[2], 1.0);
        assert_eq!(u[3], 1.0);
        assert_eq!(u[4], 6500.0);
    }

    #[test]
    fn color_settings_with_fade() {
        // Fade lifts blacks via the lift vector (neutral by default), not brightness.
        let p = make_params(&[("fade", serde_json::json!(0.5))]);
        let u = p.color_settings_uniform();
        assert!((u[0] - 0.5).abs() < 0.001); // contrast = 1 * (1 - 0.5)
        assert!((u[1] - 0.0).abs() < 0.001); // brightness no longer carries fade
        assert!((u[8] - 0.025).abs() < 0.001); // liftR = 0.5 * 0.05
        assert!((u[9] - 0.025).abs() < 0.001); // liftG
        assert!((u[10] - 0.025).abs() < 0.001); // liftB
    }

    #[test]
    fn color_settings_fade_tint_teal() {
        // A teal fade hue tints the lift toward green/blue, leaving red untouched.
        let p = make_params(&[
            ("fade", serde_json::json!(1.0)),
            ("fade-tint", serde_json::json!(1.0)),
            ("fade-hue", serde_json::json!(180.0)),
        ]);
        let u = p.color_settings_uniform();
        assert!((u[8] - 0.0).abs() < 0.001); // liftR: hue 180 has no red
        assert!((u[9] - 0.05).abs() < 0.001); // liftG: full
        assert!((u[10] - 0.05).abs() < 0.001); // liftB: full
    }

    #[test]
    fn split_tone_natural_mode() {
        // Hue 0 (red) on the centered wheel: shadows warm (R up, G/B down).
        // hue_to_rgb(0) = [1,0,0], mean 1/3, centered [2/3,-1/3,-1/3] * 0.3.
        let p = make_params(&[
            ("split-tone-amount", serde_json::json!(1.0)),
            ("split-tone-hue", serde_json::json!(0.0)),
            ("split-tone-pivot", serde_json::json!(0.3)),
        ]);
        let u = p.split_tone_uniform();
        assert!((u[0] - 0.2).abs() < 0.001); // shadowR
        assert!((u[1] - (-0.1)).abs() < 0.001); // shadowB
        assert!((u[2] - (-0.1)).abs() < 0.001); // shadowG
        assert!((u[4] - 0.1).abs() < 0.001); // highlightR (scale 0.15)
        // Tint is mean-neutral: channels sum to zero.
        assert!((u[0] + u[1] + u[2]).abs() < 0.001);
    }

    #[test]
    fn split_tone_complementary_mode() {
        // Complementary mirrors the shadow tint into highlights at scale 0.3.
        let p = make_params(&[
            ("split-tone-amount", serde_json::json!(1.0)),
            ("split-tone-hue", serde_json::json!(0.0)),
            ("split-tone-mode", serde_json::json!("complementary")),
            ("split-tone-pivot", serde_json::json!(0.3)),
        ]);
        let u = p.split_tone_uniform();
        assert!((u[4] - (-0.2)).abs() < 0.001); // highlightR flips: -2/3 * 0.3
        assert!((u[5] - 0.1).abs() < 0.001); // highlightB
        assert!((u[6] - 0.1).abs() < 0.001); // highlightG
    }

    #[test]
    fn split_tone_teal_hue() {
        // Teal hue 180 = hue_to_rgb [0,1,1], centered [-2/3,1/3,1/3] * 0.3:
        // shadows get low R, high G+B.
        let p = make_params(&[
            ("split-tone-amount", serde_json::json!(1.0)),
            ("split-tone-hue", serde_json::json!(180.0)),
        ]);
        let u = p.split_tone_uniform();
        assert!((u[0] - (-0.2)).abs() < 0.001); // shadowR low
        assert!((u[1] - 0.1).abs() < 0.001); // shadowB high
        assert!((u[2] - 0.1).abs() < 0.001); // shadowG high
        assert!(u[2] > u[0]); // green clearly above red
    }

    #[test]
    fn camera_shake_uniform_values() {
        let p = make_params(&[
            ("camera-shake-amount", serde_json::json!(1.0)),
            ("camera-shake-rate", serde_json::json!(0.5)),
        ]);
        let u = p.camera_shake_uniform(10, 1920);
        let expected_amplitude = 3.0 / 1920.0;
        assert!((u[0] - expected_amplitude).abs() < 0.0001);
        let expected_period1 = 30.0 / 0.51;
        assert!((u[1] - expected_period1).abs() < 0.1);
        assert_eq!(u[3], 10.0);
    }

    #[test]
    fn init_message_deserialize() {
        let json = r#"{"width":1920,"height":1080,"params":{"contrast":1.2}}"#;
        let msg: InitMessage = serde_json::from_str(json).unwrap();
        assert_eq!(msg.width, 1920);
        assert_eq!(msg.height, 1080);
        assert_eq!(msg.params.get("contrast").unwrap().as_f64().unwrap(), 1.2);
    }
}
