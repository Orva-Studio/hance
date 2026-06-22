import { useCallback, useRef, useState } from "react";

interface Sample {
  src: string;
  label: string;
}

interface Props {
  onLoad: (src: string, name: string) => void;
  samples: Sample[];
}

const MAX_BYTES = 40 * 1024 * 1024; // sane client-side guard; full render is GPU-bound

export function Landing({ onLoad, samples }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // Touch devices have spotty WebGPU + tight GPU memory; hint, don't block.
  const mobile = typeof matchMedia !== "undefined" && matchMedia("(pointer: coarse)").matches;

  const takeFile = useCallback(
    (file: File) => {
      if (!file.type.startsWith("image/")) {
        setErr("That's not an image. The browser editor handles stills only — use the CLI for video.");
        return;
      }
      if (file.size > MAX_BYTES) {
        setErr("Image is over 40 MB. Try a smaller file.");
        return;
      }
      setErr(null);
      const stem = file.name.replace(/\.[^.]+$/, "") || "image";
      onLoad(URL.createObjectURL(file), stem);
    },
    [onLoad],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files?.[0];
      if (file) takeFile(file);
    },
    [takeFile],
  );

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-12 gap-8">
      <div className="text-center max-w-xl">
        <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight">
          Try a cinematic film look, free
        </h1>
        <p className="text-zinc-400 mt-3">
          Drop in a photo, tune the look live on your GPU, download the result.
          No upload, no install — everything happens locally in your browser.
        </p>
      </div>

      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={e => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`w-full max-w-xl rounded-xl border-2 border-dashed cursor-pointer transition-colors px-6 py-12 text-center ${
          dragging ? "border-accent bg-accent/5" : "border-zinc-700 hover:border-zinc-500"
        }`}
      >
        <p className="text-zinc-200 font-medium">Drag &amp; drop an image</p>
        <p className="text-zinc-500 text-sm mt-1">or click to browse — PNG or JPEG</p>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={e => {
            const file = e.target.files?.[0];
            if (file) takeFile(file);
          }}
        />
      </div>

      {err && <p className="text-red-400 text-sm max-w-xl text-center">{err}</p>}

      <div className="w-full max-w-xl">
        <p className="text-xs uppercase tracking-wide text-zinc-500 mb-3 text-center">
          or try a sample
        </p>
        <div className="grid grid-cols-3 gap-3">
          {samples.map(s => (
            <button
              key={s.src}
              onClick={() => onLoad(s.src, s.label.toLowerCase().replace(/\s+/g, "-"))}
              className="group relative aspect-[4/3] rounded-lg overflow-hidden border border-zinc-800 hover:border-zinc-600"
            >
              <img
                src={s.src}
                alt={s.label}
                loading="lazy"
                className="w-full h-full object-cover group-hover:scale-105 transition-transform"
              />
              <span className="absolute inset-x-0 bottom-0 bg-black/60 text-xs text-zinc-200 py-1">
                {s.label}
              </span>
            </button>
          ))}
        </div>
      </div>

      {mobile && (
        <p className="text-amber-400/80 text-xs text-center max-w-md">
          Heads up: WebGPU and GPU memory are limited on mobile. A desktop browser
          is recommended for the best experience.
        </p>
      )}
    </div>
  );
}
