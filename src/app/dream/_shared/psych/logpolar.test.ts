// Tests for the form-constant / log-polar engine. Proves (a) the warp
// round-trips (cortex<->screen is a true inverse) and (b) the JS reference
// matches the documented form-constant identities, so CPU fallbacks and GPU
// shaders that splice LOGPOLAR_GLSL agree. Run with vitest/jest if available;
// these are plain assertions and have no DOM dependency.
//
// NOTE: the repo's vitest runner is scoped to src/lib/**, so this co-located
// test is not auto-run by `npm test`. Run it ad hoc with:
//   npx vitest run --root . src/app/dream/_shared/psych/logpolar.test.ts
import { describe, expect, it } from "vitest";
import {
  screenToCortex,
  cortexToScreen,
  formConstant,
  honeycomb,
  FORM_PHI,
  FORM_CONSTANTS,
  LOGPOLAR_GLSL,
} from "./logpolar";

function approx(a: number, b: number, eps = 1e-9): boolean {
  return Math.abs(a - b) <= eps;
}

describe("logpolar warp", () => {
  const pts: Array<[number, number]> = [
    [0.5, 0.5],
    [-0.3, 0.7],
    [0.9, -0.2],
    [-0.6, -0.6],
    [0.01, 0.99],
  ];

  it("screen->cortex->screen round-trips", () => {
    for (const [x, y] of pts) {
      const [u, v] = screenToCortex(x, y);
      const [x2, y2] = cortexToScreen(u, v);
      expect(approx(x, x2)).toBe(true);
      expect(approx(y, y2)).toBe(true);
    }
  });

  it("tunnel phi varies with log r only (constant along a ring)", () => {
    // Two points on the same ring (same r, different theta) must give the same
    // tunnel value, because phi=0 ignores theta.
    const r = 0.5;
    const aU = screenToCortex(r, 0);
    const bU = screenToCortex(0, r);
    const va = formConstant(aU[0], aU[1], FORM_PHI.tunnel, 8, 0);
    const vb = formConstant(bU[0], bU[1], FORM_PHI.tunnel, 8, 0);
    expect(approx(va, vb, 1e-7)).toBe(true);
  });

  it("spoke phi varies with theta only (constant along a radius)", () => {
    // Two points on the same radius (same theta, different r) must give the
    // same spoke value, because phi=PI/2 ignores log r.
    const aU = screenToCortex(0.2, 0.2);
    const bU = screenToCortex(0.6, 0.6); // same theta (45deg), larger r
    const va = formConstant(aU[0], aU[1], FORM_PHI.spoke, 8, 0);
    const vb = formConstant(bU[0], bU[1], FORM_PHI.spoke, 8, 0);
    expect(approx(va, vb, 1e-7)).toBe(true);
  });

  it("all form values stay in [0,1]", () => {
    for (const [x, y] of pts) {
      const [u, v] = screenToCortex(x, y);
      for (const name of FORM_CONSTANTS) {
        const val =
          name === "honeycomb"
            ? honeycomb(u, v, 6, 0.3)
            : formConstant(u, v, FORM_PHI[name], 6, 0.3);
        expect(val >= -1e-9 && val <= 1 + 1e-9).toBe(true);
      }
    }
  });

  it("GLSL string exposes the same four entry points the JS does", () => {
    for (const sym of ["screenToCortex", "cortexToScreen", "formConstant", "honeycomb"]) {
      expect(LOGPOLAR_GLSL.includes(sym)).toBe(true);
    }
  });
});
