export function parseProgress(chunk: string, duration: number | null): number | null {
  if (duration === null || duration <= 0) return null;

  const match = chunk.match(/out_time_ms=(\d+)/);
  if (!match) return null;

  const timeMs = parseInt(match[1], 10);
  return timeMs / (duration * 1_000_000);
}
