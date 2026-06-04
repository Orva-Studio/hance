import { describe, expect, test } from "bun:test";
import { PROXY_MIME, computeBufferedProgress } from "../useProxyStream";

describe("PROXY_MIME", () => {
  test("matches the pinned high-profile H.264 + AAC codec string", () => {
    expect(PROXY_MIME).toBe('video/mp4; codecs="avc1.640028, mp4a.40.2"');
  });
});

describe("computeBufferedProgress", () => {
  test("is 0 when nothing is buffered or duration unknown", () => {
    expect(computeBufferedProgress(0, 0)).toBe(0);
    expect(computeBufferedProgress(5, 0)).toBe(0);
  });

  test("is the buffered-end over duration, clamped to 1", () => {
    expect(computeBufferedProgress(3, 12)).toBeCloseTo(0.25, 5);
    expect(computeBufferedProgress(15, 12)).toBe(1);
  });
});
