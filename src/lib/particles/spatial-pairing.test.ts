import { describe, expect, it } from "vitest";
import { pairOrder, PAIR_GROUPS } from "./spatial-pairing";

// a ring of samples around (0.6, 0.4) plus a dense centre
function samples(n: number): Float32Array {
  const uv = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    const a = (i * 2.399963) % (2 * Math.PI);
    const r = i % 3 === 0 ? 0.02 * ((i * 7919) % 97) / 97 : 0.2 + 0.1 * ((i * 104729) % 89) / 89;
    uv[i * 2] = 0.6 + r * Math.cos(a);
    uv[i * 2 + 1] = 0.4 + r * Math.sin(a);
  }
  return uv;
}

describe("spatial pairing — pairOrder", () => {
  const n = 9600;
  const uv = samples(n);
  const out = pairOrder(uv, PAIR_GROUPS);
  const cx = out[n * 2], cy = out[n * 2 + 1];

  it("keeps every sample exactly once (density unchanged)", () => {
    const key = (x: number, y: number) => `${x.toFixed(6)},${y.toFixed(6)}`;
    const a = new Map<string, number>(), b = new Map<string, number>();
    for (let i = 0; i < n; i++) {
      a.set(key(uv[i * 2], uv[i * 2 + 1]), (a.get(key(uv[i * 2], uv[i * 2 + 1])) ?? 0) + 1);
      b.set(key(out[i * 2], out[i * 2 + 1]), (b.get(key(out[i * 2], out[i * 2 + 1])) ?? 0) + 1);
    }
    expect(b).toEqual(a);
  });

  it("returns the centroid", () => {
    expect(cx).toBeCloseTo(0.6, 2);
    expect(cy).toBeCloseTo(0.4, 2);
  });

  it("orders wedges by angle and each wedge by radius", () => {
    let lastMaxAngle = -Infinity;
    for (let g = 0; g < PAIR_GROUPS; g++) {
      const s = Math.floor((g * n) / PAIR_GROUPS), e = Math.floor(((g + 1) * n) / PAIR_GROUPS);
      let prevR = -1, minA = Infinity, maxA = -Infinity;
      for (let k = s; k < e; k++) {
        const dx = out[k * 2] - cx, dy = out[k * 2 + 1] - cy;
        const r = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
        expect(r).toBeGreaterThanOrEqual(prevR - 1e-6); // (the sort keys are float32)
        prevR = r; minA = Math.min(minA, a); maxA = Math.max(maxA, a);
      }
      // wedges follow each other around the circle (4096-bin bucketing tolerance)
      expect(minA).toBeGreaterThanOrEqual(lastMaxAngle - (2 * Math.PI) / 4096);
      lastMaxAngle = maxA;
    }
  });
});
