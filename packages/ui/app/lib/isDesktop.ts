// True when running inside the desktop shell, which loads the app with
// ?desktop=1 (set in packages/desktop/src/bun/server.ts). The shell uses a
// hiddenInset titlebar, so chrome-adjacent UI must clear the traffic lights.
export const isDesktop =
  typeof location !== "undefined" && new URLSearchParams(location.search).has("desktop");
