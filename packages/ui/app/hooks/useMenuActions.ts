import { useEffect, useRef } from "react";

// Web-side half of the desktop shell's native-menu bridge. The shell forwards
// application menu clicks into the webview as "hance:menu" CustomEvents whose
// detail is the action id (see packages/desktop/src/bun/index.ts and the
// MENU_ACTIONS map in packages/desktop/src/bun/menu.ts); this hook dispatches
// them to the caller's handlers. Handlers live in a ref so the mount-time
// listener always sees current state, and each render may pass a fresh map.
// In a plain browser the event never fires and the hook is inert.
export function useMenuActions(handlers: Record<string, () => void>): void {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    function onMenu(e: Event) {
      handlersRef.current[(e as CustomEvent<string>).detail]?.();
    }
    window.addEventListener("hance:menu", onMenu);
    return () => window.removeEventListener("hance:menu", onMenu);
  }, []);
}
