import { test, expect } from "bun:test";
import { existsSync } from "node:fs";
import { bakeLutCube } from "../src/lut-bake";
import { sidecarPath } from "../src/sidecar-path";
import { CUBE_SIZE } from "@hance/core";

// Needs the real Rust sidecar; skip rather than fail where it is not built.
const hasSidecar = existsSync(sidecarPath());
const maybe = hasSidecar ? test : test.skip;

function cubeEntries(cube: string): number[][] {
  return cube
    .split("\n")
    .filter(line => /^[\d.]+ [\d.]+ [\d.]+$/.test(line))
    .map(line => line.split(" ").map(v => Math.round(parseFloat(v) * 255)));
}

// The blit's TPDF dither is right for an image and wrong for a lattice: it
// shifted 505 of 35937 grid points by 1 LSB, and a LUT bakes that noise in
// permanently. A neutral look must come back as an exact identity cube.
maybe("a neutral look bakes to an exact identity cube", async () => {
  const entries = cubeEntries(await bakeLutCube({}, "neutral"));
  expect(entries.length).toBe(CUBE_SIZE ** 3);

  const step = 255 / (CUBE_SIZE - 1);
  const shifted: string[] = [];
  let i = 0;
  for (let b = 0; b < CUBE_SIZE; b++) {
    for (let g = 0; g < CUBE_SIZE; g++) {
      for (let r = 0; r < CUBE_SIZE; r++) {
        const want = [r, g, b].map(v => Math.round(v * step));
        const got = entries[i++]!;
        if (want.some((w, k) => w !== got[k])) shifted.push(`${want} -> ${got}`);
      }
    }
  }
  expect(shifted.slice(0, 5)).toEqual([]);
}, 60_000);

// One axis at a time: black and white endpoints alone survive a channel swap
// or a transposed walk, so they cannot prove the entry order is right.
maybe("bakes a colour grade without transposing the lattice", async () => {
  const entries = cubeEntries(await bakeLutCube({ "white-balance": 4000 }, "warm"));
  const mid = entries[Math.floor(entries.length / 2)]!;
  expect(mid[0]!).toBeGreaterThan(mid[2]!);
}, 60_000);
