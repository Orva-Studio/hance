import { useEffect, useRef } from "react";
import type { HistoryApi } from "./useHistory";

// Wires Cmd/Ctrl+Z (undo) and Cmd/Ctrl+Shift+Z (redo) at the window level,
// applying the resulting snapshot via `applySnapshot`. Typing in inputs is
// ignored, except range inputs whose arrow-key commits benefit from undo.
export function useUndoRedo<T>(
  history: HistoryApi<T>,
  applySnapshot: (snap: T | null) => void,
) {
  const historyRef = useRef(history);
  historyRef.current = history;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod || e.key.toLowerCase() !== "z") return;
      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable) {
          // Exception: the range input's keyboard arrows fire commits already
          // and benefit from app-level undo. Let undo/redo work from range.
          const inputType = (target as HTMLInputElement).type;
          if (tag === "INPUT" && inputType === "range") {
            // fall through to app undo
          } else {
            return;
          }
        }
      }
      e.preventDefault();
      if (e.shiftKey) {
        applySnapshot(historyRef.current.redo());
      } else {
        applySnapshot(historyRef.current.undo());
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [applySnapshot]);
}
