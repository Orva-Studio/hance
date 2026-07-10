import { useRef } from "react";

interface Props {
  onFile: (file: File) => void;
}

export function UploadZone({ onFile }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="flex-1 flex items-center justify-center">
      {/* Persistent hidden input: a detached input created on click can be
          GC'd by WKWebView while the file dialog is open, dropping onchange. */}
      <input
        ref={inputRef}
        type="file"
        accept="image/*,video/*"
        className="hidden"
        onChange={e => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
          e.target.value = "";
        }}
      />
      <button
        onClick={() => inputRef.current?.click()}
        className="text-xs text-white bg-accent hover:bg-accent-hover transition-colors rounded-sm p-btn-primary"
      >
        Import Image/Video
      </button>
    </div>
  );
}
