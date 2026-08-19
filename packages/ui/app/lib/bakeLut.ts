// The bake runs in the GPU sidecar via /api/lut, not in the webview: it is the
// same renderer that produces final exports, so a LUT matches what Hance
// actually renders. LUT export is desktop-only, where that sidecar is bundled.
export async function fetchLutCube(
  params: Record<string, string | number | boolean>,
  title: string,
): Promise<string> {
  const res = await fetch("/api/lut", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ params, title }),
  });
  if (!res.ok) {
    throw new Error((await res.text()) || `LUT export failed (${res.status})`);
  }
  return res.text();
}

/** Hands the .cube to the user as a download. */
export function downloadCube(text: string, filename: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
