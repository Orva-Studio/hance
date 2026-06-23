import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EFFECT_SCHEMA, exportLook } from "@hance/core";
import { Canvas } from "@hance/ui/app/components/Canvas";
import { AdjustmentsPanel } from "@hance/ui/app/components/AdjustmentsPanel";
import { ViewModeToolbar, type ViewMode } from "@hance/ui/app/components/ViewModeToolbar";
import { CompareOverlay } from "@hance/ui/app/components/CompareOverlay";
import { useCanvasTransform } from "@hance/ui/app/hooks/useCanvasTransform";
import { useCanvasRect } from "@hance/ui/app/hooks/useCanvasRect";
import { useCanvasInput } from "@hance/ui/app/hooks/useCanvasInput";
import { useHistory } from "@hance/ui/app/hooks/useHistory";
import { useUndoRedo } from "@hance/ui/app/hooks/useUndoRedo";
import type { Renderer, PreviewParams } from "@hance/ui/app/gpu/renderer";
import { LOOKS, findLook } from "./looks";
import { Landing } from "./Landing";
import { LooksGrid } from "./LooksGrid";
import { useThumbnails } from "./useThumbnails";
import { downloadBlob, exportImageBlob } from "./download";

interface Snapshot {
  params: PreviewParams;
  activeLook: string;
}

const DEFAULT_LOOK = findLook("original") ? "original" : LOOKS[0]?.name;

interface Source {
  src: string;
  name: string; // original filename stem, for nicer download names
}

export function App() {
  // `"gpu" in navigator` only checks the property exists; a browser can expose
  // it and still fail to hand out an adapter (blocked GPU, software path off,
  // older Safari). Probe requestAdapter once so UnsupportedNotice fires when
  // WebGPU is actually unusable, not just absent. undefined = still probing.
  const [webgpu, setWebgpu] = useState<boolean | undefined>(undefined);
  useEffect(() => {
    let cancelled = false;
    async function probe() {
      if (typeof navigator === "undefined" || !("gpu" in navigator)) {
        if (!cancelled) setWebgpu(false);
        return;
      }
      try {
        const adapter = await navigator.gpu.requestAdapter();
        if (!cancelled) setWebgpu(!!adapter);
      } catch {
        if (!cancelled) setWebgpu(false);
      }
    }
    probe();
    return () => { cancelled = true; };
  }, []);
  const [source, setSource] = useState<Source | null>(null);
  const [activeLook, setActiveLook] = useState<string>(DEFAULT_LOOK);
  const [params, setParams] = useState<PreviewParams>(
    () => findLook(DEFAULT_LOOK)?.previewParams ?? {},
  );
  const [error, setError] = useState<string | null>(null);
  const rendererRef = useRef<Renderer | null>(null);

  // Pan/zoom, before/after split, and undo/redo — reused from the editor.
  const transform = useCanvasTransform();
  const [viewMode, setViewMode] = useState<ViewMode>("normal");
  const [comparePos, setComparePos] = useState(0.5);
  const [referenceImage, setReferenceImage] = useState<string | null>(null);
  const [canvasEl, setCanvasEl] = useState<HTMLCanvasElement | null>(null);
  const canvasRect = useCanvasRect(canvasEl);

  // Compare modes overlay the original at the fit-sized canvas rect, so force
  // the canvas back to "fit" on entry — otherwise a zoomed canvas and the
  // un-zoomed overlay drift apart.
  const onViewModeChange = useCallback((m: ViewMode) => {
    if (m !== "normal") {
      transform.setZoom("fit");
      transform.setPanMode(false);
    }
    setViewMode(m);
  }, [transform.setZoom, transform.setPanMode]);

  // Reference compare: drag the user's own image over the graded canvas to
  // match a target grade. The blob URL is revoked on replace/clear so it
  // doesn't pin the file for the life of the tab.
  const chooseReferenceImage = useCallback(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = () => {
      const f = input.files?.[0];
      if (!f) return;
      setReferenceImage(prev => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(f);
      });
    };
    input.click();
  }, []);

  const clearReferenceImage = useCallback(() => {
    setReferenceImage(prev => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
  }, []);
  const history = useHistory<Snapshot>({ params, activeLook });
  useCanvasInput(viewMode, transform, null);

  // Latest values for closures that feed the history without stale captures.
  const paramsRef = useRef(params);
  paramsRef.current = params;
  const activeLookRef = useRef(activeLook);
  activeLookRef.current = activeLook;

  // Generated client-side from the loaded image; empty until a source loads.
  const onThumbnailError = useCallback((message: string) => setError(message), []);
  const thumbnails = useThumbnails(source?.src ?? "", LOOKS, onThumbnailError);

  const look = findLook(activeLook);
  const dirty = useMemo(() => {
    if (!look) return false;
    return Object.keys(look.previewParams).some(
      k => params[k] !== look.previewParams[k],
    );
  }, [params, look]);

  // Free the previous blob URL before replacing it; orphaned object URLs pin
  // their File in memory (up to MAX_BYTES each) for the life of the tab.
  // revokeObjectURL is a no-op on the sample http(s) URLs, so they're safe.
  const loadSource = useCallback((src: string, name: string) => {
    setError(null);
    setSource(prev => {
      if (prev) URL.revokeObjectURL(prev.src);
      return { src, name };
    });
  }, []);

  const discardSource = useCallback(() => {
    setReferenceImage(prev => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setViewMode("normal");
    setSource(prev => {
      if (prev) URL.revokeObjectURL(prev.src);
      return null;
    });
  }, []);

  const selectLook = useCallback((name: string) => {
    const next = findLook(name);
    if (!next) return;
    setActiveLook(name);
    setParams(next.previewParams);
    history.commit({ params: next.previewParams, activeLook: name });
  }, [history]);

  // Live edits replace the present snapshot; the committed history entry lands
  // on pointer-up (onCommit), so one slider drag is a single undo step.
  const onChange = useCallback((key: string, value: string | number | boolean) => {
    const next = { ...paramsRef.current, [key]: value };
    setParams(next);
    history.replace({ params: next, activeLook: activeLookRef.current });
  }, [history]);

  const onCommit = useCallback(() => {
    history.commit({ params: paramsRef.current, activeLook: activeLookRef.current });
  }, [history]);

  const applySnapshot = useCallback((snap: Snapshot | null) => {
    if (!snap) return;
    setParams(snap.params);
    setActiveLook(snap.activeLook);
  }, []);
  useUndoRedo(history, applySnapshot);

  // Hover-preview: push the hovered look straight to the renderer without
  // committing it to state, then restore the live params on leave.
  const onLookHover = useCallback((name: string) => {
    const next = findLook(name);
    if (!next || !rendererRef.current) return;
    rendererRef.current.setParams(next.previewParams);
    rendererRef.current.renderFrame();
  }, []);

  const onLookHoverEnd = useCallback(() => {
    if (!rendererRef.current) return;
    rendererRef.current.setParams(params);
    rendererRef.current.renderFrame();
  }, [params]);

  const resetLook = useCallback(() => {
    if (!look) return;
    setParams(look.previewParams);
    history.commit({ params: look.previewParams, activeLook: look.name });
  }, [look, history]);

  const downloadImage = useCallback(async () => {
    const renderer = rendererRef.current;
    if (!renderer || !source) return;
    const blob = await exportImageBlob(renderer);
    const ext = blob.type === "image/jpeg" ? "jpg" : "png";
    downloadBlob(blob, `${source.name}-${activeLook}.${ext}`);
  }, [source, activeLook, look]);

  const downloadHlook = useCallback(() => {
    // Carry the user's exact tuned settings to the CLI / editor import.
    // exportLook spreads the params flat under the look name; importLook /
    // applyPreset read that shape directly.
    const json = exportLook(activeLook, params);
    downloadBlob(new Blob([json], { type: "application/json" }), `${activeLook}.hlook`);
  }, [activeLook, params]);

  if (webgpu === undefined) return null; // probing; brief, no flash of fallback
  if (!webgpu) return <UnsupportedNotice />;

  if (!source) {
    return <Landing onLoad={loadSource} samples={SAMPLES} />;
  }

  return (
    <div className="flex flex-col h-screen">
      <TopBar
        lookName={look?.label ?? activeLook}
        onChangeImage={discardSource}
        onDownloadImage={downloadImage}
        onDownloadHlook={downloadHlook}
      />
      {error && (
        <div className="bg-red-900/40 text-red-200 text-sm px-4 py-2">{error}</div>
      )}
      <div className="flex flex-1 min-h-0">
        <aside className="w-64 shrink-0 border-r border-zinc-800 bg-zinc-950 flex flex-col min-h-0">
          <LooksGrid
            active={activeLook}
            thumbnails={thumbnails}
            onSelect={selectLook}
            onHover={onLookHover}
            onHoverEnd={onLookHoverEnd}
          />
        </aside>
        <main className="relative flex-1 min-w-0 bg-zinc-900 flex flex-col overflow-hidden">
          <ViewModeToolbar
            mode={viewMode}
            onChange={onViewModeChange}
            canUndo={history.canUndo}
            canRedo={history.canRedo}
            onUndo={() => applySnapshot(history.undo())}
            onRedo={() => applySnapshot(history.redo())}
            zoom={transform.zoom}
            onZoomChange={transform.setZoom}
            panMode={transform.panMode}
            onPanModeChange={transform.setPanMode}
          />
          <Canvas
            key={source.src}
            src={source.src}
            isVideo={false}
            params={params}
            onRendererReady={r => (rendererRef.current = r)}
            onCanvasReady={setCanvasEl}
            onError={err => setError(err.message)}
            zoom={transform.zoom}
            pan={transform.pan}
            isPanning={transform.isPanning}
            panMode={transform.panMode}
            onPanMouseDown={transform.onMouseDown}
            onPanMouseMove={transform.onMouseMove}
            onPanMouseUp={transform.onMouseUp}
          />
          <CtaBar lookName={activeLook} />
        </main>
        <aside className="w-72 shrink-0 border-l border-zinc-800 bg-zinc-950 overflow-y-auto min-h-0">
          <AdjustmentsPanel
            schema={EFFECT_SCHEMA}
            values={params}
            onChange={onChange}
            onCommit={onCommit}
            onReset={resetLook}
            canReset={dirty}
            animating={false}
          />
        </aside>
      </div>
      {viewMode === "split" && (
        // Draggable before/after: the original (ungraded) image clipped over
        // the graded canvas. Rendered at the editor root so its viewport-based
        // coordinates line up with the canvas rect.
        <CompareOverlay
          mode="split"
          position={comparePos}
          onPositionChange={setComparePos}
          overlaySrc={source.src}
          isVideo={false}
          canvasRect={canvasRect}
        />
      )}
      {viewMode === "reference" && !referenceImage && canvasRect && (
        <div
          className="absolute bg-zinc-900/90 border border-zinc-700 px-4 py-3 z-30 flex flex-col items-center gap-2 rounded-md"
          style={{
            left: canvasRect.left + canvasRect.width / 2 - 110,
            top: canvasRect.top + canvasRect.height / 2 - 30,
          }}
        >
          <div className="text-xs text-zinc-300">Upload a reference image</div>
          <button
            onClick={chooseReferenceImage}
            className="text-xs text-white bg-accent hover:bg-accent-hover rounded-sm p-btn"
          >Choose image…</button>
        </div>
      )}
      {viewMode === "reference" && referenceImage && canvasRect && (
        <>
          <CompareOverlay
            mode="reference"
            position={comparePos}
            onPositionChange={setComparePos}
            overlaySrc={referenceImage}
            isVideo={false}
            canvasRect={canvasRect}
          />
          <button
            onClick={clearReferenceImage}
            className="absolute text-[11px] text-zinc-300 bg-zinc-800/90 border border-zinc-700 hover:bg-zinc-700 z-30 rounded-sm px-2.5 py-1"
            style={{
              right: `calc(100vw - ${canvasRect.left + canvasRect.width}px + 8px)`,
              top: canvasRect.top + 8,
            }}
          >Replace reference</button>
        </>
      )}
    </div>
  );
}

const SAMPLES = [
  { src: "/samples/neon-street.jpg", label: "Neon street" },
  { src: "/samples/portrait.jpg", label: "Golden hour" },
  { src: "/samples/landscape.jpg", label: "Sky & shadow" },
];

function TopBar(props: {
  lookName: string;
  onChangeImage: () => void;
  onDownloadImage: () => void;
  onDownloadHlook: () => void;
}) {
  return (
    <header className="flex items-center justify-between px-4 h-12 border-b border-zinc-800 bg-zinc-950 shrink-0">
      <div className="flex items-center gap-3">
        <span className="font-semibold tracking-tight">hance</span>
        <span className="text-xs text-zinc-500">try free online</span>
      </div>
      <div className="flex items-center gap-2 text-sm">
        <button
          onClick={props.onChangeImage}
          className="text-zinc-400 hover:text-zinc-200 p-btn"
        >
          New image
        </button>
        <button
          onClick={props.onDownloadHlook}
          className="text-zinc-300 hover:text-white border border-zinc-700 rounded-md p-btn"
        >
          Download .hlook
        </button>
        <button
          onClick={props.onDownloadImage}
          className="bg-accent hover:bg-accent-hover text-white rounded-md p-btn-primary font-medium"
        >
          Download image
        </button>
      </div>
    </header>
  );
}

function CtaBar(props: { lookName: string }) {
  const cmd = `npx @orva-studio/hance ui your-clip.mp4 --preset ${props.lookName}`;
  return (
    <div className="border-t border-zinc-800 bg-zinc-950 px-4 py-3">
      <p className="text-sm text-zinc-300 mb-2">
        Love it? Apply this look to your <strong>video</strong>:
      </p>
      <div className="flex items-center gap-2">
        <code className="flex-1 bg-zinc-900 border border-zinc-800 rounded px-3 py-2 text-xs text-cyan-300 overflow-x-auto whitespace-nowrap">
          {cmd}
        </code>
        <button
          onClick={() => navigator.clipboard?.writeText(cmd)}
          className="text-xs text-zinc-300 hover:text-white border border-zinc-700 rounded p-btn"
        >
          Copy
        </button>
      </div>
    </div>
  );
}

function UnsupportedNotice() {
  return (
    <div className="flex flex-col items-center justify-center h-screen text-center px-6 gap-4">
      <h1 className="text-2xl font-semibold">WebGPU not supported</h1>
      <p className="text-zinc-400 max-w-md">
        The in-browser editor renders on your GPU via WebGPU, which this browser
        doesn&apos;t support yet. Try the latest Chrome, Edge, or Safari 17.4+ —
        or grade locally with the CLI:
      </p>
      <code className="bg-zinc-900 border border-zinc-800 rounded px-4 py-2 text-cyan-300">
        npx @orva-studio/hance your-clip.mp4
      </code>
    </div>
  );
}
