// True when running inside the desktop shell, which loads the app with
// ?desktop=1 (set in packages/desktop/src/bun/server.ts). The shell uses a
// hiddenInset titlebar, so chrome-adjacent UI must clear the traffic lights.
// A function (not a module-load-time const) so tests can simulate either
// environment by stubbing `location` before calling it.
export function isDesktop(): boolean {
  return typeof location !== "undefined" && new URLSearchParams(location.search).has("desktop");
}
