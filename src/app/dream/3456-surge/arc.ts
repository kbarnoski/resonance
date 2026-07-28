/* ── 3456-surge · arc state machine ──────────────────────────────────────
 *
 *  An EDM build-and-drop journey engine. Instead of the psychedelic 6-phase
 *  arc, this is the canonical dance-music song form:
 *
 *      intro → build → peak → DROP → groove → breakdown → (loop into build)
 *
 *  The human's role is RIDE-AND-RELEASE, not performance: during `build`
 *  they HOLD to charge (energy climbs, the riser sweeps up, visuals
 *  compress inward). RELEASE triggers the DROP. There is no fail-state —
 *  the drop ALWAYS lands. The human only shapes WHEN it lands and how
 *  charged it was (`dropPower`). A let-go at low charge still drops; it
 *  just hits softer.
 *
 *  The exact same engine is driven by the auto-pilot (see makeAutoPilot):
 *  it simply supplies the `holding` flag on a believable timer so a
 *  hands-off reviewer immediately hears build→drop→groove→breakdown.
 */

export type Phase =
  | "intro"
  | "build"
  | "peak"
  | "drop"
  | "groove"
  | "breakdown";

export interface ArcState {
  phase: Phase;
  /** seconds spent in the current phase */
  phaseT: number;
  /** monotonic seconds since the arc started */
  totalT: number;
  /** 0..1 charge level — climbs while holding during build */
  energy: number;
  /** how charged the most recent drop was, 0..1 (drives drop weight) */
  dropPower: number;
  /** 1.0 impulse at the instant of a drop, decays to 0 */
  dropFlash: number;
  /** whether the build is currently being charged */
  charging: boolean;
  /** internal: auto-pilot's chosen hold duration for this build */
  autoHold: number;
}

const INTRO_DUR = 3.2;
const PEAK_DUR = 0.42; // the tense gap before the slam
const DROP_DUR = 0.7;
const GROOVE_DUR = 11;
const BREAKDOWN_DUR = 4.6;

const CHARGE_RATE = 0.19; // ~5.3s of holding to reach full charge
const MIN_BUILD = 0.5; // shortest possible build before a release can drop

export function createArc(): ArcState {
  return {
    phase: "intro",
    phaseT: 0,
    totalT: 0,
    energy: 0,
    dropPower: 0,
    dropFlash: 0,
    charging: false,
    autoHold: 4,
  };
}

function enter(s: ArcState, phase: Phase) {
  s.phase = phase;
  s.phaseT = 0;
  if (phase === "build") {
    s.energy = 0;
    // auto-pilot picks a fresh, believable hold length per build
    s.autoHold = 2.6 + Math.random() * 3.8;
  }
  if (phase === "drop") {
    s.dropPower = s.energy;
    s.dropFlash = 1;
  }
}

/**
 * Advance the arc by `dt` seconds.
 * @param holding  is the charge input currently engaged (human OR auto-pilot)
 */
export function stepArc(s: ArcState, dt: number, holding: boolean): void {
  s.totalT += dt;
  s.phaseT += dt;
  s.dropFlash = Math.max(0, s.dropFlash - dt * 2.4);

  switch (s.phase) {
    case "intro":
      s.charging = false;
      s.energy = 0;
      if (s.phaseT >= INTRO_DUR) enter(s, "build");
      break;

    case "build": {
      s.charging = holding;
      if (holding) {
        s.energy = Math.min(1, s.energy + dt * CHARGE_RATE);
      } else {
        // a small sag while un-held, but never a fail — you can re-grab it
        s.energy = Math.max(0, s.energy - dt * 0.04);
      }
      const maxedOut = s.energy >= 1;
      const released = !holding && s.phaseT > MIN_BUILD;
      if (maxedOut || released) enter(s, "peak");
      break;
    }

    case "peak":
      s.charging = false;
      if (s.phaseT >= PEAK_DUR) enter(s, "drop");
      break;

    case "drop":
      s.charging = false;
      if (s.phaseT >= DROP_DUR) enter(s, "groove");
      break;

    case "groove":
      s.charging = false;
      // groove energy sits high (driven by dropPower) and slowly relaxes
      s.energy = Math.max(0.35 + s.dropPower * 0.4, s.energy - dt * 0.03);
      if (s.phaseT >= GROOVE_DUR) enter(s, "breakdown");
      break;

    case "breakdown":
      s.charging = false;
      s.energy = Math.max(0, s.energy - dt * 0.2);
      if (s.phaseT >= BREAKDOWN_DUR) enter(s, "build");
      break;
  }
}

/**
 * Auto-pilot: supplies the `holding` flag when no human is driving.
 * It rides the SAME arc — charging through each build for `autoHold`
 * seconds, then releasing to trigger the drop.
 */
export function autoHolding(s: ArcState): boolean {
  return s.phase === "build" && s.phaseT < s.autoHold;
}

export const PHASE_LABEL: Record<Phase, string> = {
  intro: "intro",
  build: "build · charging",
  peak: "tension peak",
  drop: "the drop",
  groove: "groove",
  breakdown: "breakdown",
};
