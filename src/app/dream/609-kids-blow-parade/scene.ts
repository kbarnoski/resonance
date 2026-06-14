// ─────────────────────────────────────────────────────────────────────────────
// scene.ts — balloon-creature parade state + inflation/release physics.
//
// A continuous parade of googly balloon-creatures. The FRONT balloon is the
// "active" one being inflated by breath. Each balloon cycles through:
//   idle  → grows while blowing (radius up, squeak pitch up)
//   release → raspberry: zooms + tumbles erratically, slowly shrinking
//   gone  → recycled to the back of the parade as a fresh idle balloon
//
// Pure data + step(). No DOM, no audio — caller wires sound + render to it.
// ─────────────────────────────────────────────────────────────────────────────

export type BalloonPhase = "idle" | "inflating" | "flying";

export interface Balloon {
  id: number;
  // Bold saturated creature color (HSL hue 0..360).
  hue: number;
  x: number; // 0..1 normalized
  y: number; // 0..1 normalized
  vx: number;
  vy: number;
  radius: number; // current visual radius, normalized to min screen dim
  baseRadius: number;
  targetRadius: number; // where inflation is pushing it
  phase: BalloonPhase;
  spin: number; // rotation (radians)
  spinV: number;
  squash: number; // 1 = round, >1 wide, <1 tall (jiggle)
  wobble: number; // phase accumulator for jelly wobble
  eyeBlink: number; // 0..1, 1 = closed
  blinkTimer: number;
  // How "big it got" when released — drives raspberry size.
  releaseSize: number;
}

export interface ParadeState {
  balloons: Balloon[];
  activeId: number | null;
  nextId: number;
}

// Bold, saturated, toddler-friendly palette (Toca-Boca-ish).
const HUES = [350, 30, 50, 120, 190, 265, 310, 15];

export function makeParade(count = 6): ParadeState {
  const balloons: Balloon[] = [];
  let nextId = 0;
  for (let i = 0; i < count; i++) {
    balloons.push(makeBalloon(nextId++, i / count));
  }
  return { balloons, activeId: balloons[0]?.id ?? null, nextId };
}

let hueCursor = 0;
function makeBalloon(id: number, slot: number): Balloon {
  const hue = HUES[hueCursor++ % HUES.length];
  const base = 0.06 + Math.random() * 0.02;
  return {
    id,
    hue,
    // Parade marches left→right; idle balloons wait on the left, queued.
    x: 0.16 + slot * 0.02,
    y: 0.62 + (Math.random() - 0.5) * 0.08,
    vx: 0,
    vy: 0,
    radius: base,
    baseRadius: base,
    targetRadius: base,
    phase: "idle",
    spin: 0,
    spinV: 0,
    squash: 1,
    wobble: Math.random() * Math.PI * 2,
    eyeBlink: 0,
    blinkTimer: 1 + Math.random() * 3,
    releaseSize: 0,
  };
}

export interface StepResult {
  /** A balloon just released — fire raspberry with this size. */
  released: { size: number } | null;
}

/**
 * step — advance physics one frame.
 * @param st        parade state (mutated in place)
 * @param dt        seconds since last frame (clamped by caller)
 * @param blowing   is the kid currently blowing?
 * @param strength  blow strength 0..1
 * @param aspect    width/height of canvas (to keep motion even)
 */
export function step(
  st: ParadeState,
  dt: number,
  blowing: boolean,
  strength: number,
  aspect: number
): StepResult {
  const result: StepResult = { released: null };
  const active = st.balloons.find((b) => b.id === st.activeId) || null;

  // ── Active balloon: inflate while blowing ────────────────────────────────
  if (active && active.phase !== "flying") {
    if (blowing && strength > 0.02) {
      active.phase = "inflating";
      // Grow target radius with sustained blow. Cap so it can't fill screen.
      active.targetRadius = Math.min(
        0.34,
        active.targetRadius + strength * dt * 0.55
      );
      // Excited jiggle while inflating.
      active.squash = 1 + Math.sin(active.wobble * 5) * 0.05 * (0.5 + strength);
    } else if (active.phase === "inflating") {
      // Blow stopped while inflating (and it grew) → RELEASE!
      if (active.radius > active.baseRadius * 1.35) {
        release(active, aspect);
        result.released = { size: clamp01(active.releaseSize) };
      } else {
        // Barely grew — gently deflate back to idle, no raspberry.
        active.phase = "idle";
        active.targetRadius = active.baseRadius;
      }
    }
  }

  // ── Per-balloon integration ──────────────────────────────────────────────
  for (const b of st.balloons) {
    b.wobble += dt * (2 + b.radius * 4);

    // Radius easing toward target.
    b.radius += (b.targetRadius - b.radius) * Math.min(1, dt * 8);

    // Idle/queued march: slow drift right + gentle bob.
    if (b.phase === "idle") {
      b.x += dt * 0.012;
      b.y += Math.sin(b.wobble) * dt * 0.01;
      b.squash += (1 - b.squash) * Math.min(1, dt * 6);
      b.spin += (0 - b.spin) * Math.min(1, dt * 4);
    }

    if (b.phase === "flying") {
      // Erratic zoom + tumble. Add little random thrust puffs.
      b.vx += (Math.random() - 0.5) * dt * 1.2;
      b.vy += (Math.random() - 0.5) * dt * 1.2;
      // Air drag.
      b.vx *= 0.985;
      b.vy *= 0.985;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.spin += b.spinV * dt;
      b.spinV *= 0.99;
      // Deflate while flying.
      b.targetRadius = Math.max(b.baseRadius * 0.7, b.targetRadius - dt * 0.18);
      // Floppy squash as it flails.
      b.squash = 1 + Math.sin(b.wobble * 7) * 0.22;

      // Bounce off edges (playful, no exit).
      const r = b.radius;
      if (b.x < r) {
        b.x = r;
        b.vx = Math.abs(b.vx) * 0.8;
      }
      if (b.x > 1 - r) {
        b.x = 1 - r;
        b.vx = -Math.abs(b.vx) * 0.8;
      }
      if (b.y < r) {
        b.y = r;
        b.vy = Math.abs(b.vy) * 0.8;
      }
      if (b.y > 1 - r) {
        b.y = 1 - r;
        b.vy = -Math.abs(b.vy) * 0.8;
      }

      // When deflated enough + slow → recycle.
      const speed = Math.hypot(b.vx, b.vy);
      if (b.radius <= b.baseRadius * 0.78 && speed < 0.06) {
        recycle(b);
      }
    }

    // Blink animation (googly + occasional blink).
    b.blinkTimer -= dt;
    if (b.blinkTimer <= 0) {
      b.eyeBlink = 1;
      b.blinkTimer = 1.5 + Math.random() * 4;
    }
    b.eyeBlink += (0 - b.eyeBlink) * Math.min(1, dt * 14);
  }

  // ── Pick the active balloon: the idle one furthest along the parade ───────
  if (!active || active.phase === "flying") {
    const candidate = st.balloons
      .filter((b) => b.phase === "idle")
      .sort((a, b) => b.x - a.x)[0];
    st.activeId = candidate ? candidate.id : null;
    // Nudge the chosen one into the spotlight (center-bottom stage).
    if (candidate) {
      candidate.targetRadius = candidate.baseRadius;
    }
  }

  return result;
}

function release(b: Balloon, aspect: number) {
  b.phase = "flying";
  // Bigger balloon → bigger raspberry & faster zoom.
  b.releaseSize = clamp01((b.radius - b.baseRadius) / (0.34 - b.baseRadius));
  const speed = 0.5 + b.releaseSize * 1.1;
  const ang = Math.random() * Math.PI * 2;
  // Compensate x for aspect so zoom feels even on wide screens.
  b.vx = (Math.cos(ang) * speed) / Math.max(1, aspect * 0.6);
  b.vy = Math.sin(ang) * speed - 0.3; // bias upward — balloons fly up
  b.spinV = (Math.random() - 0.5) * 18;
  b.targetRadius = b.radius; // start deflating from current size
}

function recycle(b: Balloon) {
  const fresh = makeBalloon(b.id, 0);
  Object.assign(b, fresh);
}

function clamp01(v: number) {
  return Math.max(0, Math.min(1, v));
}
