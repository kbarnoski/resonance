/* ── 3480-reverie · affective director ────────────────────────────────────
 *
 *  A rule-based (NO LLM, NO network) director in the spirit of two papers:
 *
 *    · NarraScore  (arXiv:2602.09070, Feb 2026) — hierarchical affective
 *      valence/arousal control that shapes a musical arc.
 *    · JenBridge   (arXiv:2606.01703, Jun 2026) — an agentic "director" that
 *      selects a TRANSITION STYLE for each narrative shift, synthesizing a
 *      generative bridge between two distinct segments.
 *
 *  Each act is an anchor point in an affective + force-field space. The
 *  director interpolates the CURRENT state toward the active target every
 *  frame (easing per channel). Across a transition it does not cut — it
 *  glides the target between the two acts' anchors, shaped by the chosen
 *  transition style, so both the music and the particle world continuously
 *  RE-FORM from one act into the next.
 *
 *  The force-field weights (drift / vortex / radial / turbulence) ARE part of
 *  the affective state: the particle substrate always computes a weighted sum
 *  of those primitive forces, so lerping the weights == morphing the world.
 */

import type { ArcState } from "./arc";

export interface Affect {
  /** dark ↔ bright (0..1); drives palette hue + harmony color */
  valence: number;
  /** calm ↔ intense (0..1) */
  arousal: number;
  /** sparse ↔ dense (0..1); pad voices + lead activity */
  density: number;
  /** slow ↔ fast (0..1); lead tempo */
  tempo: number;
  /** overall luminance (0..1) */
  brightness: number;
  // ── force-field weights for the particle substrate ──
  driftW: number; // Act I — slow drifting horizon field
  vortexW: number; // Act II — turbulent vortex / curl storm
  radialW: number; // Act III — collapsing / blooming radial burst
  turbW: number; // curl-noise turbulence overlay
  /** signed radial drive: −1 implode (collapse) … +1 explode (bloom) */
  radialDir: number;
}

// per-act anchors ---------------------------------------------------------
const ACT1: Affect = {
  valence: 0.34,
  arousal: 0.14,
  density: 0.22,
  tempo: 0.3,
  brightness: 0.42,
  driftW: 1.0,
  vortexW: 0.05,
  radialW: 0.0,
  turbW: 0.12,
  radialDir: 0.0,
};

const ACT2: Affect = {
  valence: 0.5,
  arousal: 0.82,
  density: 0.82,
  tempo: 0.74,
  brightness: 0.5,
  driftW: 0.08,
  vortexW: 1.0,
  radialW: 0.08,
  turbW: 0.92,
  radialDir: -0.12,
};

// Act III is not constant: a bloom-climax that denouements into stillness.
// These are the two poles of its internal envelope.
const ACT3_CLIMAX: Affect = {
  valence: 0.9,
  arousal: 0.72,
  density: 0.7,
  tempo: 0.58,
  brightness: 0.98,
  driftW: 0.05,
  vortexW: 0.12,
  radialW: 1.0,
  turbW: 0.25,
  radialDir: 0.95,
};

const ACT3_DENOUEMENT: Affect = {
  valence: 0.78,
  arousal: 0.12,
  density: 0.24,
  tempo: 0.32,
  brightness: 0.5,
  driftW: 0.55,
  vortexW: 0.05,
  radialW: 0.45,
  turbW: 0.08,
  radialDir: 0.15,
};

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function smooth(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
}

function blend(a: Affect, b: Affect, t: number): Affect {
  return {
    valence: lerp(a.valence, b.valence, t),
    arousal: lerp(a.arousal, b.arousal, t),
    density: lerp(a.density, b.density, t),
    tempo: lerp(a.tempo, b.tempo, t),
    brightness: lerp(a.brightness, b.brightness, t),
    driftW: lerp(a.driftW, b.driftW, t),
    vortexW: lerp(a.vortexW, b.vortexW, t),
    radialW: lerp(a.radialW, b.radialW, t),
    turbW: lerp(a.turbW, b.turbW, t),
    radialDir: lerp(a.radialDir, b.radialDir, t),
  };
}

function actAnchor(act: number, actProgress: number): Affect {
  if (act === 0) return ACT1;
  if (act === 1) return ACT2;
  // Act III: climax → denouement across the act's own progress
  return blend(ACT3_CLIMAX, ACT3_DENOUEMENT, smooth(actProgress));
}

/**
 * The TARGET affect the director is steering toward this frame, computed
 * purely from the arc. During a transition this is the crafted bridge: the
 * two acts' anchors blended by the transition curve, plus a style-specific
 * shaping (a riser overshoot, a collapse dip, a settling fall).
 */
export function targetAffect(arc: ArcState): Affect {
  if (!arc.inTransition) {
    return actAnchor(arc.fromAct, arc.segProgress);
  }

  const p = smooth(arc.segProgress);
  // for act III we sample its climax pole when entering, denouement when leaving
  const from = actAnchor(arc.fromAct, 0.85);
  const to = actAnchor(arc.toAct, 0.0);
  const base = blend(from, to, p);

  // ── style shaping: the signature of each bridge ──
  if (arc.transStyle === "rise") {
    // a riser: arousal/density/turbulence lift EARLY and overshoot, dragging
    // the calm world up into the storm before the harmony fully arrives.
    const lift = Math.sin(p * Math.PI) * 0.35;
    base.arousal = Math.min(1, base.arousal + lift);
    base.turbW = Math.min(1.4, base.turbW + lift * 0.6);
    base.density = Math.min(1, base.density + lift * 0.6);
    base.brightness = Math.min(1, base.brightness + lift * 0.15);
  } else if (arc.transStyle === "collapse") {
    // the climax bridge: the dense storm IMPLODES (radialDir dives negative,
    // brightness dips to a dissolve) then releases outward as it hands off to
    // Act III's bloom. A dark-fold-into-light gesture.
    const implode = Math.sin(p * Math.PI);
    base.radialW = Math.max(base.radialW, 0.6 + 0.4 * implode);
    base.radialDir = lerp(-0.9, 0.95, smooth(Math.max(0, p - 0.35) / 0.65));
    base.brightness = base.brightness * (1 - 0.45 * Math.sin(p * Math.PI));
    base.vortexW = Math.max(base.vortexW, (1 - p) * 0.6);
    base.arousal = Math.min(1, base.arousal + implode * 0.15);
  } else if (arc.transStyle === "settle") {
    // a fall: everything eases down, the relative-minor gravity pulls the
    // radial bloom back into the slow horizon drift of Act I.
    const fall = Math.sin(p * Math.PI) * 0.2;
    base.arousal = Math.max(0, base.arousal - fall);
    base.brightness = Math.max(0.3, base.brightness - fall * 0.4);
    base.radialDir = lerp(base.radialDir, 0, p);
  }
  return base;
}

export interface DirectorState {
  cur: Affect;
}

export function createDirector(): DirectorState {
  return { cur: { ...ACT1 } };
}

// per-channel easing rates (1/seconds). Field weights ease a touch faster so
// the visual morph tracks the bridge crisply; affect eases gently.
const EASE = {
  slow: 1.1,
  mid: 2.0,
  fast: 3.4,
};

function approach(cur: number, tgt: number, rate: number, dt: number): number {
  const k = 1 - Math.exp(-rate * dt);
  return cur + (tgt - cur) * k;
}

/**
 * Ease the director's current state toward the target, then overlay the
 * human's DWELL (linger deepens the moment: more bloom, brighter, denser)
 * and a global INTENSITY nudge. Returns the smoothed live state.
 */
export function stepDirector(
  d: DirectorState,
  arc: ArcState,
  dt: number,
  dwell: number,
  intensity: number,
): Affect {
  const t = targetAffect(arc);
  const c = d.cur;
  c.valence = approach(c.valence, t.valence, EASE.mid, dt);
  c.arousal = approach(c.arousal, t.arousal, EASE.mid, dt);
  c.density = approach(c.density, t.density, EASE.mid, dt);
  c.tempo = approach(c.tempo, t.tempo, EASE.slow, dt);
  c.brightness = approach(c.brightness, t.brightness, EASE.mid, dt);
  c.driftW = approach(c.driftW, t.driftW, EASE.fast, dt);
  c.vortexW = approach(c.vortexW, t.vortexW, EASE.fast, dt);
  c.radialW = approach(c.radialW, t.radialW, EASE.fast, dt);
  c.turbW = approach(c.turbW, t.turbW, EASE.fast, dt);
  c.radialDir = approach(c.radialDir, t.radialDir, EASE.mid, dt);

  // linger overlay — deepen without changing the story
  const dw = smooth(dwell);
  const out: Affect = {
    valence: Math.min(1, c.valence + dw * 0.05),
    arousal: Math.min(1, c.arousal + dw * 0.18 + intensity * 0.15),
    density: Math.min(1, c.density + dw * 0.35 + intensity * 0.12),
    tempo: c.tempo,
    brightness: Math.min(1, c.brightness + dw * 0.22 + intensity * 0.08),
    driftW: c.driftW,
    vortexW: c.vortexW,
    radialW: c.radialW,
    turbW: Math.min(1.5, c.turbW + dw * 0.2),
    radialDir: c.radialDir,
  };
  return out;
}
