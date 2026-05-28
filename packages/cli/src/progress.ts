export { parseProgress } from "@hance/core";

export function renderProgressBar(progress: number, width = 40): string {
  const clamped = Math.min(1, Math.max(0, progress));
  const filled = Math.round(clamped * width);
  const empty = width - filled;
  const bar = "█".repeat(filled) + "░".repeat(empty);
  const pct = (clamped * 100).toFixed(1);
  return `[${bar}] ${pct}%`;
}
