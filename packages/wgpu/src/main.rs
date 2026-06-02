mod colorspace;
mod params;
mod passes;
mod renderer;

use std::io::{self, Read, Write};

fn main() {
    let mut stdin = io::stdin().lock();
    let mut stdout = io::stdout().lock();

    let arg = match std::env::args().nth(1) {
        Some(arg) => arg,
        None => {
            eprintln!("Usage: hance-gpu <init-json|init-json-file>");
            std::process::exit(1);
        }
    };

    // The init payload carries the baked LUT (~1MB of JSON), which can exceed
    // the OS argv limit, so callers may pass a file path instead of inline JSON.
    let init_json = if arg.trim_start().starts_with('{') {
        arg
    } else {
        match std::fs::read_to_string(&arg) {
            Ok(contents) => contents,
            Err(e) => {
                eprintln!("Failed to read init JSON file {arg}: {e}");
                std::process::exit(1);
            }
        }
    };

    let init: params::InitMessage = match serde_json::from_str(&init_json) {
        Ok(msg) => msg,
        Err(e) => {
            eprintln!("Failed to parse init JSON: {e}");
            std::process::exit(1);
        }
    };

    let mut gpu = match renderer::GpuRenderer::new(init.width, init.height, &init.params, init.lut.as_deref()) {
        Ok(r) => r,
        Err(e) => {
            eprintln!("GPU init failed: {e}");
            std::process::exit(1);
        }
    };

    let frame_size = (init.width * init.height * 4) as usize;
    let mut frame_buf = vec![0u8; frame_size];

    loop {
        match stdin.read_exact(&mut frame_buf) {
            Ok(()) => {}
            Err(e) if e.kind() == io::ErrorKind::UnexpectedEof => break,
            Err(e) => {
                eprintln!("stdin read error: {e}");
                std::process::exit(1);
            }
        }

        let rendered = gpu.render_frame(&frame_buf);

        if let Err(e) = stdout.write_all(&rendered) {
            eprintln!("stdout write error: {e}");
            std::process::exit(1);
        }
        stdout.flush().unwrap();
    }
}
