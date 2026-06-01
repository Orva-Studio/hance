// Standard sRGB piecewise transfer function (IEC 61966-2-1).
// Operates per channel on a single component in [0, 1].
// Reference implementation mirroring the WGSL shader; exercised by the unit tests.
#![allow(dead_code)]

pub fn srgb_to_linear(c: f32) -> f32 {
    if c <= 0.04045 {
        c / 12.92
    } else {
        ((c + 0.055) / 1.055).powf(2.4)
    }
}

pub fn linear_to_srgb(c: f32) -> f32 {
    if c <= 0.0031308 {
        c * 12.92
    } else {
        1.055 * c.powf(1.0 / 2.4) - 0.055
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn known_midpoint() {
        assert!((srgb_to_linear(0.5) - 0.21404).abs() < 1e-4);
    }

    #[test]
    fn round_trips() {
        for i in 0..=20 {
            let x = i as f32 / 20.0;
            assert!((linear_to_srgb(srgb_to_linear(x)) - x).abs() < 1e-5);
        }
    }
}
