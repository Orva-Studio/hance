use std::io::Write;
use std::process::{Command, Stdio};

#[test]
fn sidecar_processes_one_frame() {
    let binary = env!("CARGO_BIN_EXE_hance-gpu");

    let width: u32 = 4;
    let height: u32 = 4;
    let frame_size = (width * height * 4) as usize;

    // Pass init JSON as CLI argument
    let init_json = serde_json::json!({
        "width": width,
        "height": height,
        "params": {}
    });

    let mut child = Command::new(binary)
        .arg(init_json.to_string())
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .expect("Failed to spawn sidecar");

    // Send one red frame on stdin
    let mut frame = vec![0u8; frame_size];
    for i in 0..(width * height) as usize {
        frame[i * 4] = 255;     // R
        frame[i * 4 + 1] = 0;   // G
        frame[i * 4 + 2] = 0;   // B
        frame[i * 4 + 3] = 255; // A
    }

    let stdin = child.stdin.as_mut().unwrap();
    stdin.write_all(&frame).unwrap();

    // Close stdin to signal end
    drop(child.stdin.take());

    let output = child.wait_with_output().expect("Failed to read output");

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        panic!("Sidecar failed: {stderr}");
    }

    assert_eq!(output.stdout.len(), frame_size, "Output frame size mismatch");
}

#[test]
fn halation_blooms_in_linear_light() {
    let binary = env!("CARGO_BIN_EXE_hance-gpu");
    let width: u32 = 8;
    let height: u32 = 8;
    let frame_size = (width * height * 4) as usize;

    let init_json = serde_json::json!({
        "width": width,
        "height": height,
        "params": { "halation-amount": 0.8, "halation-radius": 4 }
    });

    let mut child = Command::new(binary)
        .arg(init_json.to_string())
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .expect("Failed to spawn sidecar");

    // One bright pixel in the center, rest black.
    let mut frame = vec![0u8; frame_size];
    let center = ((height / 2) * width + width / 2) as usize;
    frame[center * 4] = 255;
    frame[center * 4 + 1] = 255;
    frame[center * 4 + 2] = 255;
    for i in 0..(width * height) as usize {
        frame[i * 4 + 3] = 255; // A
    }

    let stdin = child.stdin.as_mut().unwrap();
    stdin.write_all(&frame).unwrap();
    drop(child.stdin.take());

    let output = child.wait_with_output().expect("Failed to read output");
    assert!(output.status.success());

    // A neighbor of the bright pixel should now be non-zero (energy bloomed out).
    let neighbor = center + 1;
    let bloomed = output.stdout[neighbor * 4] as u32
        + output.stdout[neighbor * 4 + 1] as u32
        + output.stdout[neighbor * 4 + 2] as u32;
    assert!(bloomed > 0, "expected halation to bloom energy into neighboring pixels");
}
