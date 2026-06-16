// Build/drop ARC state machine for the Pulse Cathedral.
// Phases cycle: BUILD -> DROP -> SUSTAIN -> BUILD ...
// The machine is clock-agnostic: it advances by *bars*, which the scheduler
// feeds it. It exposes a normalized intensity (0..1) used by both synth and GL.

export type Phase = "BUILD" | "DROP" | "SUSTAIN";

export interface ArcState {
  phase: Phase;
  // bar index within the current phase (0-based, fractional allowed for visuals)
  barInPhase: number;
  // total bars elapsed since start
  totalBars: number;
  // 0..1 musical intensity (density / brightness / pump depth)
  intensity: number;
  // 0..1 riser sweep progress (only meaningful during BUILD)
  riser: number;
  // octave fold index for the Shepard-bass (increments each loop)
  foldStep: number;
}

export const PHASE_BARS: Record<Phase, number> = {
  BUILD: 8,
  DROP: 4,
  SUSTAIN: 4,
};

export function createArc(): ArcState {
  return {
    phase: "BUILD",
    barInPhase: 0,
    totalBars: 0,
    intensity: 0,
    riser: 0,
    foldStep: 0,
  };
}

// Smoothstep helper for lifting curves.
function smooth(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
}

// Recompute derived fields (intensity, riser) from the current bar position.
export function applyArcDerived(a: ArcState): void {
  const frac = a.barInPhase / PHASE_BARS[a.phase];
  if (a.phase === "BUILD") {
    // Intensity climbs from a low floor toward the brink.
    a.intensity = 0.12 + 0.68 * smooth(frac);
    // Riser accelerates near the end of the build.
    a.riser = smooth(frac * frac);
  } else if (a.phase === "DROP") {
    // Full energy, gently easing.
    a.intensity = 1.0 - 0.12 * frac;
    a.riser = 0;
  } else {
    // SUSTAIN: ride the groove a touch below the drop.
    a.intensity = 0.82 - 0.18 * frac;
    a.riser = 0;
  }
}

// Advance the arc by one whole bar. Returns true if a phase boundary was
// just crossed (so callers can fire impacts / crashes). Forced drop bypasses
// the boundary logic by jumping straight to DROP.
export function stepArcBar(a: ArcState): { crossed: boolean; entered: Phase | null } {
  a.totalBars += 1;
  a.barInPhase += 1;
  let crossed = false;
  let entered: Phase | null = null;

  if (a.barInPhase >= PHASE_BARS[a.phase]) {
    a.barInPhase = 0;
    crossed = true;
    if (a.phase === "BUILD") {
      a.phase = "DROP";
      a.foldStep += 1; // climb the Shepard ladder each cycle
    } else if (a.phase === "DROP") {
      a.phase = "SUSTAIN";
    } else {
      a.phase = "BUILD";
    }
    entered = a.phase;
  }
  applyArcDerived(a);
  return { crossed, entered };
}

// Force an early drop: collapse the remaining build and enter DROP next bar.
// Returns true if a drop was actually armed (only meaningful outside DROP).
export function armForcedDrop(a: ArcState): boolean {
  if (a.phase === "DROP") return false;
  // Jump near the end of BUILD so the next stepArcBar crosses into DROP.
  a.phase = "BUILD";
  a.barInPhase = PHASE_BARS.BUILD - 1;
  applyArcDerived(a);
  return true;
}
