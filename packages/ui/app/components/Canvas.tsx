import { useRef, useEffect, type MouseEvent } from "react";
import { createRenderer, type Renderer, type PreviewParams } from "../gpu/renderer";
import { fitPreviewSize } from "../mediaSizing";
import { PAN_ZERO, type ZoomLevel } from "../hooks/useCanvasTransform";

interface Props {
  src: string;
  isVideo: boolean;
  params: PreviewParams;
  onRendererReady: (renderer: Renderer) => void;
  onCanvasReady?: (canvas: HTMLCanvasElement) => void;
  onVideoReady?: (video: HTMLVideoElement) => void;
  getStartTime?: () => number;   // where to land the first-frame seek (sec); default 0
  onError?: (err: Error) => void;
  zoom?: ZoomLevel;
  pan?: { x: number; y: number };
  isPanning?: boolean;
  panMode?: boolean;
  onPanMouseDown?: (e: MouseEvent) => void;
  onPanMouseMove?: (e: MouseEvent) => void;
  onPanMouseUp?: () => void;
}

export function Canvas(props: Props) {
  const { src, isVideo, params, onRendererReady, onCanvasReady, onVideoReady, onError } = props;
  const zoom = props.zoom ?? "fit";
  const pan = props.pan ?? PAN_ZERO;
  const isPanning = props.isPanning ?? false;
  const panMode = props.panMode ?? false;
  const videoRef = useRef<HTMLVideoElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<Renderer | null>(null);
  const rafRef = useRef<number>(0);
  const paramsRef = useRef(params);
  paramsRef.current = params;
  const getStartTimeRef = useRef(props.getStartTime);
  getStartTimeRef.current = props.getStartTime;

  // WebGPU init — must be useEffect since it's an async external system
  useEffect(() => {
    if (!canvasRef.current) return;
    let cancelled = false;

    async function init() {
      const canvas = canvasRef.current!;

      if (isVideo) {
        const video = videoRef.current!;
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error("Video load timed out after 15s — file may be corrupt or use an unsupported codec"));
          }, 15000);
          video.onloadeddata = () => { clearTimeout(timeout); resolve(); };
          video.onerror = () => {
            clearTimeout(timeout);
            const code = video.error?.code;
            const msg = video.error?.message || "unknown error";
            reject(new Error(`Video load failed (code ${code ?? "?"}): ${msg}`));
          };
          if (video.readyState >= 2) { clearTimeout(timeout); resolve(); }
        });
        // Seek to startTime (0 on first load, or the preserved playhead when
        // swapping the streaming proxy for the finished file) to decode the
        // first visible frame there.
        const want = getStartTimeRef.current?.() ?? 0;
        const seekTarget = Math.min(want, Math.max(0, (video.duration || 0) - 0.05)) || 0;
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error("Video seek timed out after 5s"));
          }, 5000);
          video.onseeked = () => { clearTimeout(timeout); resolve(); };
          video.onerror = () => {
            clearTimeout(timeout);
            const code = video.error?.code;
            const msg = video.error?.message || "unknown error";
            reject(new Error(`Video failed during seek (code ${code ?? "?"}): ${msg}`));
          };
          video.currentTime = seekTarget;
        });
        const sourceWidth = video.videoWidth;
        const sourceHeight = video.videoHeight;
        const previewSize = fitPreviewSize(sourceWidth, sourceHeight);
        if (cancelled) return;

        const renderer = await createRenderer(canvas, {
          sourceWidth,
          sourceHeight,
          previewWidth: previewSize.width,
          previewHeight: previewSize.height,
        });
        await renderer.setSource(video);
        renderer.setParams(paramsRef.current);
        rendererRef.current = renderer;
        onRendererReady(renderer);
        if (onCanvasReady) onCanvasReady(canvas);
        if (onVideoReady) onVideoReady(video);

        function renderLoop() {
          if (cancelled) return;
          renderer.renderFrame();
          rafRef.current = requestAnimationFrame(renderLoop);
        }

        renderLoop();
      } else {
        const img = imgRef.current!;
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error("Image load timed out after 15s"));
          }, 15000);
          img.onload = () => { clearTimeout(timeout); resolve(); };
          img.onerror = () => {
            clearTimeout(timeout);
            reject(new Error("Image failed to load — file may be corrupt or use an unsupported format"));
          };
          if (img.complete && img.naturalWidth > 0) { clearTimeout(timeout); resolve(); }
        });
        await img.decode();
        const sourceWidth = img.naturalWidth;
        const sourceHeight = img.naturalHeight;
        const previewSize = fitPreviewSize(sourceWidth, sourceHeight);
        if (cancelled) return;

        const renderer = await createRenderer(canvas, {
          sourceWidth,
          sourceHeight,
          previewWidth: previewSize.width,
          previewHeight: previewSize.height,
        });
        await renderer.setSource(img);
        renderer.setParams(paramsRef.current);
        renderer.renderFrame();
        rendererRef.current = renderer;
        onRendererReady(renderer);
        if (onCanvasReady) onCanvasReady(canvas);
      }
    }

    init().catch((err: Error) => { if (!cancelled) onError?.(err); });

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafRef.current);
      rendererRef.current?.destroy();
      rendererRef.current = null;
    };
  }, [src, isVideo]);

  // Sync params to renderer — must be useEffect since renderer is an external system
  useEffect(() => {
    if (rendererRef.current) {
      rendererRef.current.setParams(params);
      if (!isVideo) rendererRef.current.renderFrame();
    }
  }, [params, isVideo]);

  const scale = zoom === "fit" ? undefined : zoom / 100;
  const hasTransform = scale !== undefined;
  const transformStyle = hasTransform
    ? { transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`, transformOrigin: "center center" }
    : undefined;

  return (
    <div
      className="relative flex-1 flex items-center justify-center flex-col"
      style={panMode ? { cursor: isPanning ? "grabbing" : "grab" } : undefined}
      onMouseDown={props.onPanMouseDown}
      onMouseMove={props.onPanMouseMove}
      onMouseUp={props.onPanMouseUp}
      onMouseLeave={props.onPanMouseUp}
    >
      {isVideo && (
        <video
          ref={videoRef}
          src={src}
          crossOrigin="anonymous"
          className="hidden"
          playsInline
        />
      )}
      {!isVideo && (
        <img
          ref={imgRef}
          src={src}
          crossOrigin="anonymous"
          className="hidden"
        />
      )}
      <canvas
        ref={canvasRef}
        className={hasTransform ? "" : "max-w-full max-h-[calc(100vh-140px)]"}
        style={transformStyle}
      />
    </div>
  );
}
