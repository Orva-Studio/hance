import { useState, useCallback } from "react";

export const MAX_UPLOAD_BYTES = 16 * 1024 * 1024 * 1024;

export function formatBytes(bytes: number): string {
  const gb = bytes / (1024 ** 3);
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  const mb = bytes / (1024 ** 2);
  return `${mb.toFixed(0)} MB`;
}

export function validateUploadSize(size: number): string | null {
  if (size > MAX_UPLOAD_BYTES) {
    return `File is ${formatBytes(size)}. Maximum is ${formatBytes(MAX_UPLOAD_BYTES)}.`;
  }
  return null;
}

interface UploadState {
  file: File | null;
  objectUrl: string | null;
  proxyUrl: string | null;
  isVideo: boolean;
  error: string | null;
}

export function useUpload() {
  const [state, setState] = useState<UploadState>({
    file: null, objectUrl: null, proxyUrl: null, isVideo: false, error: null,
  });

  const upload = useCallback((file: File) => {
    const sizeError = validateUploadSize(file.size);
    if (sizeError) {
      setState(s => ({ ...s, error: sizeError }));
      return;
    }
    if (state.objectUrl) URL.revokeObjectURL(state.objectUrl);
    const url = URL.createObjectURL(file);
    const isVideo = file.type.startsWith("video/");
    setState({ file, objectUrl: url, proxyUrl: null, isVideo, error: null });
  }, [state.objectUrl]);

  const setProxyUrl = useCallback((proxyUrl: string) => {
    setState(s => ({ ...s, proxyUrl }));
  }, []);

  const clearError = useCallback(() => {
    setState(s => ({ ...s, error: null }));
  }, []);

  return { ...state, upload, setProxyUrl, clearError };
}
