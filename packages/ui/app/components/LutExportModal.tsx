import { useState } from "react";
import { activeLossyEffects, cubeFilename, type LossyEffect } from "@hance/core";

interface Props {
  lookName: string | null;
  params: Record<string, string | number | boolean>;
  onCancel: () => void;
  onExport: (filename: string) => Promise<void> | void;
}

// A .cube is a colour-to-colour mapping, so the spatial and temporal passes
// cannot come along. Say so plainly before the export rather than letting the
// look quietly arrive wrong in Camera Hub or OBS.
export function LutExportModal({ lookName, params, onCancel, onExport }: Props) {
  const [filename, setFilename] = useState(() => cubeFilename(lookName));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dropped: LossyEffect[] = activeLossyEffects(params);

  async function submit() {
    const trimmed = filename.trim() || cubeFilename(lookName);
    const withExt = /\.cube$/i.test(trimmed) ? trimmed : `${trimmed}.cube`;
    setBusy(true);
    setError(null);
    try {
      await onExport(withExt);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={busy ? undefined : onCancel}>
      <div
        className="bg-zinc-800 border border-zinc-700 max-w-md w-full mx-4 shadow-2xl rounded-md p-modal"
        onClick={e => e.stopPropagation()}
      >
        <h3 className="text-sm font-semibold text-zinc-200 mb-2">Export LUT</h3>
        <p className="text-xs text-zinc-400 mb-4">
          Saves the colour grade as a .cube file, for anything with a LUT slot —
          Elgato Camera Hub, OBS, Resolve, Premiere.
        </p>

        {dropped.length > 0 ? (
          <div className="border border-zinc-700 bg-zinc-900/60 rounded-sm p-3 mb-4">
            <p className="text-xs text-zinc-300 mb-2">
              A LUT can only map colour to colour, so these won't be included:
            </p>
            <ul className="text-xs text-zinc-400 space-y-1">
              {dropped.map(effect => (
                <li key={effect.enableKey}>
                  <span className="text-zinc-300">{effect.label}</span> — {effect.reason}
                </li>
              ))}
            </ul>
            <p className="text-xs text-zinc-500 mt-2">
              Everything else — exposure, contrast, white balance, split tone,
              colour wheels, film density — is baked in.
            </p>
          </div>
        ) : (
          <p className="text-xs text-zinc-400 mb-4">
            This look uses only colour adjustments, so the LUT will match it exactly.
          </p>
        )}

        <label className="block text-xs text-zinc-400 mb-1">Filename</label>
        <input
          value={filename}
          onChange={e => setFilename(e.target.value)}
          disabled={busy}
          className="w-full text-xs text-zinc-200 bg-zinc-900 border border-zinc-700 rounded-sm px-2 py-1.5 mb-4 disabled:opacity-50"
        />

        {error && <p className="text-xs text-danger mb-3">{error}</p>}

        <div className="flex gap-2 justify-end">
          <button
            onClick={onCancel}
            disabled={busy}
            className="text-xs text-zinc-300 bg-zinc-700 hover:bg-zinc-600 transition-colors rounded-sm p-btn disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={busy}
            className="text-xs text-white bg-accent hover:bg-accent-hover transition-colors rounded-sm p-btn-primary disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {busy ? "Exporting…" : "Export LUT"}
          </button>
        </div>
      </div>
    </div>
  );
}
