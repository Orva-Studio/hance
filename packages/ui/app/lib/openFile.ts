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

// Fetch a server-vetted local path back as a File for the upload pipeline.
export async function fetchLocalFile(path: string, name: string): Promise<File> {
  const res = await fetch(`/api/local-file?path=${encodeURIComponent(path)}`);
  if (!res.ok) throw new Error(`could not read file (${res.status})`);
  const blob = await res.blob();
  return new File([blob], name, { type: blob.type });
}
