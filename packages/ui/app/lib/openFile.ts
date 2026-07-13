// Opening media through the desktop shell's native picker and the
// /api/local-file bridge. Shared by the landing screen and the File menu.

export interface PickedFile {
  path: string;
  name: string;
}

// Ask the server to show the native OS file dialog. Resolves to the picked
// file, null if the user cancelled, or "unsupported" when no native picker
// exists (browser/CLI mode) so callers can fall back to <input type=file>.
export async function pickNativeFile(): Promise<PickedFile | null | "unsupported"> {
  const res = await fetch("/api/pick-file", { method: "POST" });
  if (res.status === 404) return "unsupported";
  if (res.status === 204) return null;
  if (!res.ok) throw new Error(`picker failed (${res.status})`);
  return res.json();
}

// URL that serves a server-vetted local path with Range support, so <video>
// can play the original file (WKWebView decodes ProRes natively) without
// the file ever being copied into the page as a blob.
export function localFileUrl(path: string): string {
  return `/api/local-file?path=${encodeURIComponent(path)}`;
}

// MIME by extension for path-opened files, mirroring what a browser-picked
// File would carry in .type. Only needs to distinguish video from image and
// give <video>/<img> a sensible hint; unknown extensions fall through.
const EXT_MIME: Record<string, string> = {
  mov: "video/quicktime",
  mp4: "video/mp4",
  m4v: "video/mp4",
  webm: "video/webm",
  mkv: "video/x-matroska",
  avi: "video/x-msvideo",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  tif: "image/tiff",
  tiff: "image/tiff",
  bmp: "image/bmp",
};

export function mimeFromName(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return EXT_MIME[ext] ?? "application/octet-stream";
}
