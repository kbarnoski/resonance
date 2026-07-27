// ── 3192-bow · Schelleng playability envelope ─────────────────────────────
// The stakes, made into geometry.
//
// Schelleng, "The bowed string and the player" (JASA 53, 1973) showed that a
// bowed string only produces a clean ("Helmholtz") tone inside a wedge in the
// bow-force / bow-motion plane. Below a MINIMUM bow force the stick–slip cycle
// never captures — you get a thin surface / whistling sound. Above a MAXIMUM
// bow force the slip becomes irregular — you get a raucous crunch. Only between
// the two curves does the string sing.
//
// Schelleng's relations (at a fixed bow–bridge distance β):
//   F_min  ∝  v / β²        → minimum force RISES with bow speed
//   F_max  ∝  1 / (β v)     → maximum force FALLS with bow speed
// so plotted against bow speed the playable band is a wedge that narrows (and
// eventually closes) as you bow faster: fast bowing is unforgiving.
//
// This module works in a normalized plane so the same numbers drive both the
// SVG diagram and the friction synth:
//   speed  (x) ∈ [0,1]   left = slow, right = fast
//   force  (y) ∈ [0,1]   0 = feather-light (top), 1 = crushing (bottom)

export type Regime = "surface" | "singing" | "raucous";

export function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

/** Minimum bow force: rises with speed (Schelleng F_min ∝ v). */
export function minForce(speed: number): number {
  return clamp01(0.1 + 0.52 * speed);
}

/** Maximum bow force: falls with speed (Schelleng F_max ∝ 1/v). */
export function maxForce(speed: number): number {
  return clamp01(0.92 - 0.4 * speed);
}

/** Which of the three regimes a gesture sits in. */
export function classifyRegime(speed: number, force: number): Regime {
  const lo = minForce(speed);
  const hi = maxForce(speed);
  if (force < lo) return "surface";
  if (force > hi) return "raucous";
  return "singing";
}

/**
 * Signed distance into the singing wedge, roughly in force units.
 * Positive = inside (bigger = deeper / safer). Negative = outside
 * (how far below F_min or above F_max). Used for confidence shading.
 */
export function wedgeMargin(speed: number, force: number): number {
  const lo = minForce(speed);
  const hi = maxForce(speed);
  if (hi <= lo) {
    // Wedge has pinched shut (too fast to control at any force).
    return -(Math.abs(force - (lo + hi) / 2) + (lo - hi) / 2);
  }
  if (force < lo) return force - lo;
  if (force > hi) return hi - force;
  return Math.min(force - lo, hi - force);
}

/**
 * Map a normalized gesture to the two knobs the friction junction actually
 * reads: bow velocity amplitude and bow-table slope.
 *
 * The slope is the physical bow-force control of the McIntyre–Woodhouse
 * friction curve: a LARGE slope makes a narrow capture region (light bow, the
 * string struggles to lock — surface sound); a SMALL slope makes a wide capture
 * region (heavy bow — the string over-sticks and the release turns irregular,
 * a raucous crunch). The clean tone lives in between, exactly mirroring the
 * wedge above.
 */
export function bowParamsFor(
  speed: number,
  force: number,
): { maxVel: number; slope: number } {
  const s = clamp01(speed);
  const f = clamp01(force);
  return {
    maxVel: 0.03 + 0.3 * s, // bow velocity amplitude
    slope: 4.5 * (1 - f) + 0.1, // friction-curve slope (bow force)
  };
}

/** Human-facing copy for the current regime. */
export const REGIME_COPY: Record<Regime, { label: string; hint: string }> = {
  surface: {
    label: "surface",
    hint: "too light — the string never captures, only a thin whistle",
  },
  singing: {
    label: "singing",
    hint: "in the wedge — the string locks into steady Helmholtz motion",
  },
  raucous: {
    label: "raucous",
    hint: "too hard — the slip goes irregular, the tone crunches",
  },
};

/**
 * Sample the two boundary curves into SVG-space point strings for <path>/<polyline>.
 * `w`,`h` are the pixel size of the diagram; force y grows downward so a heavier
 * bow is lower on the plot, matching the pointer gesture.
 */
export function makeCurvePoints(
  curve: (speed: number) => number,
  w: number,
  h: number,
  steps = 64,
): string {
  const pts: string[] = [];
  for (let i = 0; i <= steps; i++) {
    const s = i / steps;
    const x = s * w;
    const y = curve(s) * h;
    pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
  }
  return pts.join(" ");
}

/**
 * The singing wedge as a closed SVG polygon: top edge = F_min, bottom edge =
 * F_max (reversed), clipped to where the wedge is actually open.
 */
export function makeWedgePolygon(w: number, h: number, steps = 64): string {
  const top: string[] = [];
  const bottom: string[] = [];
  for (let i = 0; i <= steps; i++) {
    const s = i / steps;
    const lo = minForce(s);
    const hi = maxForce(s);
    if (hi <= lo) break; // wedge pinched shut — stop drawing the fill
    const x = s * w;
    top.push(`${x.toFixed(1)},${(lo * h).toFixed(1)}`);
    bottom.push(`${x.toFixed(1)},${(hi * h).toFixed(1)}`);
  }
  return [...top, ...bottom.reverse()].join(" ");
}
