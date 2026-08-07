// ─────────────────────────────────────────────────────────────────────────────
// swarm.ts — a NON-RECIPROCAL VISION-CONE PERCEPTION SWARM.
//
//   ~2000 autonomous agents drift as a diffuse shimmer. Each agent has a FORWARD
//   vision cone (half-angle θ, radius R) and only perceives the neighbours — and
//   the moving "focus point" — that fall inside that cone. Steering (separation /
//   alignment / cohesion) is computed over the VISIBLE set only, plus a ONE-WAY
//   attraction toward the focus. The asymmetry is the whole point: agents attend
//   to the focus; the focus (the viewer) cannot attend back. This is the
//   Barberis/Peruani-lineage vision-cone active matter (arXiv:2412.19297), NOT
//   isotropic Reynolds averaging.
//
//   An autonomous event scheduler runs a ~3.6 s cycle: the focus attraction
//   ("pull") ramps up, agents whose cone contains the focus swing to face it and
//   cohere into a transient symmetric gaze-figure with a bright pupil-cluster on
//   the focus (the *being-met*), holds ~1.3 s, then decays back to shimmer.
//
//   One COHERENCE scalar in [0,1] is measured from the actual sim (how many
//   agents face the focus + how tightly they cluster on it) and drives BOTH the
//   audio voice-swell and the visual figure brightness — the same event.
//
//   Determinism: all randomness is mulberry32(0x7816); timing is passed in from
//   performance.now() by the caller (no wall-clock, no unseeded randomness).
// ─────────────────────────────────────────────────────────────────────────────

/** Seeded PRNG — the piece performs itself with zero sensors. */
export function mulberry32(a: number): () => number {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Simulation constants (world is the unit square [0,1] x [0,1]).
const N = 2000;
const THETA = 1.95; // vision-cone half-angle (rad) ≈ 112°, forward-biased
const R = 0.085; // perception radius
const SEP_R = 0.02; // separation radius
const FOCUS_R = 0.62; // how far an agent can perceive the focus
const PUPIL_R = 0.12; // distance that counts as "on the pupil"
const MAX_SPEED = 0.11;
const MIN_SPEED = 0.006;

// Steering weights.
const W_SEP = 1.7;
const W_ALI = 0.85;
const W_COH = 0.55;
const W_FOCUS = 2.6;
const RESPONSE = 3.4; // how quickly velocity chases the steer sum

// Event scheduler durations (seconds).
const T_DRIFT = 0.6;
const T_GATHER = 0.7;
const T_MET = 1.3;
const T_RELEASE = 1.0;

const COS_THETA = Math.cos(THETA);

export type Phase = "drift" | "gather" | "met" | "release";

export interface SwarmState {
  n: number;
  x: Float32Array;
  y: Float32Array;
  vx: Float32Array;
  vy: Float32Array;
  /** Per-agent attention (0..1): faces + near the focus. Drives sprite color/size. */
  att: Float32Array;
  // focus point + event envelope
  focusX: number;
  focusY: number;
  targetX: number;
  targetY: number;
  pull: number; // focus-attraction strength / event envelope (0..1)
  coherence: number; // measured order parameter (0..1) — the ONE scalar
  phase: Phase;
  phaseT: number;
  // tilt input (world coords, already mapped); null when unused
  tiltX: number | null;
  tiltY: number | null;
  // spatial hash
  cols: number;
  head: Int32Array;
  next: Int32Array;
  rand: () => number;
}

export function createSwarm(): SwarmState {
  const rand = mulberry32(0x7816);
  const x = new Float32Array(N);
  const y = new Float32Array(N);
  const vx = new Float32Array(N);
  const vy = new Float32Array(N);
  const att = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    x[i] = rand();
    y[i] = rand();
    const a = rand() * Math.PI * 2;
    const sp = MIN_SPEED + rand() * (MAX_SPEED - MIN_SPEED);
    vx[i] = Math.cos(a) * sp;
    vy[i] = Math.sin(a) * sp;
  }
  const cols = Math.max(1, Math.floor(1 / R));
  return {
    n: N,
    x,
    y,
    vx,
    vy,
    att,
    focusX: 0.5,
    focusY: 0.5,
    targetX: 0.5,
    targetY: 0.5,
    pull: 0,
    coherence: 0,
    phase: "drift",
    // start most of the way through the first drift so the first "met" lands fast
    phaseT: T_DRIFT * 0.55,
    tiltX: null,
    tiltY: null,
    cols,
    head: new Int32Array(cols * cols),
    next: new Int32Array(N),
    rand,
  };
}

function smoothstep(t: number): number {
  const c = t < 0 ? 0 : t > 1 ? 1 : t;
  return c * c * (3 - 2 * c);
}

/** Advance the autonomous focus + event envelope one step. */
function stepFocus(s: SwarmState, dt: number): void {
  s.phaseT += dt;
  switch (s.phase) {
    case "drift":
      s.pull = 0;
      if (s.phaseT >= T_DRIFT) {
        s.phaseT = 0;
        s.phase = "gather";
        // choose the next gaze target (seeded), unless tilt is steering it
        if (s.tiltX === null) {
          s.targetX = 0.28 + s.rand() * 0.44;
          s.targetY = 0.28 + s.rand() * 0.44;
        }
      }
      break;
    case "gather":
      s.pull = smoothstep(s.phaseT / T_GATHER);
      if (s.phaseT >= T_GATHER) {
        s.phaseT = 0;
        s.phase = "met";
      }
      break;
    case "met":
      s.pull = 1;
      if (s.phaseT >= T_MET) {
        s.phaseT = 0;
        s.phase = "release";
      }
      break;
    case "release":
      s.pull = 1 - smoothstep(s.phaseT / T_RELEASE);
      if (s.phaseT >= T_RELEASE) {
        s.phaseT = 0;
        s.phase = "drift";
      }
      break;
  }

  // Where the focus wants to be: tilt (if live) else the seeded gaze target.
  let tx = s.targetX;
  let ty = s.targetY;
  if (s.tiltX !== null && s.tiltY !== null) {
    tx = s.tiltX;
    ty = s.tiltY;
    // when tilt is live, the target follows the lean so gathers land on it
    s.targetX = tx;
    s.targetY = ty;
  }
  // Ease the focus toward its target — fast during a gather so the figure snaps.
  const rate = s.phase === "gather" || s.phase === "met" ? 6 : 1.4;
  const k = 1 - Math.exp(-rate * dt);
  s.focusX += (tx - s.focusX) * k;
  s.focusY += (ty - s.focusY) * k;
}

function buildGrid(s: SwarmState): void {
  const { cols, head, next, x, y, n } = s;
  head.fill(-1);
  for (let i = 0; i < n; i++) {
    let cx = (x[i] * cols) | 0;
    let cy = (y[i] * cols) | 0;
    if (cx < 0) cx = 0;
    else if (cx >= cols) cx = cols - 1;
    if (cy < 0) cy = 0;
    else if (cy >= cols) cy = cols - 1;
    const c = cy * cols + cx;
    next[i] = head[c];
    head[c] = i;
  }
}

/** One simulation step. `dt` in seconds. */
export function stepSwarm(s: SwarmState, dt: number): void {
  // clamp dt so a stalled tab can't explode the integration
  const h = Math.min(0.05, Math.max(0.001, dt));
  stepFocus(s, h);
  buildGrid(s);

  const { x, y, vx, vy, att, cols, head, next, n } = s;
  const fx = s.focusX;
  const fy = s.focusY;
  const pull = s.pull;

  let orderSum = 0; // agents facing the focus (order parameter)
  let tightCount = 0; // agents clustered on the pupil

  const R2 = R * R;
  const SEP2 = SEP_R * SEP_R;

  for (let i = 0; i < n; i++) {
    const xi = x[i];
    const yi = y[i];
    let hx = vx[i];
    let hy = vy[i];
    let hl = Math.hypot(hx, hy);
    if (hl < 1e-6) {
      hx = 1;
      hy = 0;
      hl = 1;
    }
    const hnx = hx / hl;
    const hny = hy / hl;

    // accumulators over the VISIBLE (in-cone) set
    let sepx = 0,
      sepy = 0;
    let alix = 0,
      aliy = 0;
    let cohx = 0,
      cohy = 0;
    let visCount = 0;

    let cx = (xi * cols) | 0;
    let cy = (yi * cols) | 0;
    if (cx < 0) cx = 0;
    else if (cx >= cols) cx = cols - 1;
    if (cy < 0) cy = 0;
    else if (cy >= cols) cy = cols - 1;

    for (let gy = cy - 1; gy <= cy + 1; gy++) {
      if (gy < 0 || gy >= cols) continue;
      for (let gx = cx - 1; gx <= cx + 1; gx++) {
        if (gx < 0 || gx >= cols) continue;
        let j = head[gy * cols + gx];
        while (j !== -1) {
          if (j !== i) {
            const dx = x[j] - xi;
            const dy = y[j] - yi;
            const d2 = dx * dx + dy * dy;
            if (d2 < R2 && d2 > 1e-10) {
              const d = Math.sqrt(d2);
              // VISION CONE: only perceive j if it lies within ±θ of heading
              const dot = (dx * hnx + dy * hny) / d;
              if (dot > COS_THETA) {
                visCount++;
                // alignment: match visible neighbours' heading
                alix += vx[j];
                aliy += vy[j];
                // cohesion: steer toward their centroid
                cohx += dx;
                cohy += dy;
                // separation: push away from the very close ones
                if (d2 < SEP2) {
                  const w = (SEP_R - d) / SEP_R;
                  sepx -= (dx / d) * w;
                  sepy -= (dy / d) * w;
                }
              }
            }
          }
          j = next[j];
        }
      }
    }

    // desired-velocity steering (Reynolds) over the visible set
    let ax = 0;
    let ay = 0;
    if (visCount > 0) {
      // separation
      const sl = Math.hypot(sepx, sepy);
      if (sl > 1e-6) {
        ax += W_SEP * (((sepx / sl) * MAX_SPEED) - vx[i]);
        ay += W_SEP * (((sepy / sl) * MAX_SPEED) - vy[i]);
      }
      // alignment
      const al = Math.hypot(alix, aliy);
      if (al > 1e-6) {
        ax += W_ALI * (((alix / al) * MAX_SPEED) - vx[i]);
        ay += W_ALI * (((aliy / al) * MAX_SPEED) - vy[i]);
      }
      // cohesion
      const cl = Math.hypot(cohx, cohy);
      if (cl > 1e-6) {
        ax += W_COH * (((cohx / cl) * MAX_SPEED) - vx[i]);
        ay += W_COH * (((cohy / cl) * MAX_SPEED) - vy[i]);
      }
    }

    // ONE-WAY focus attraction — only if the focus is inside the vision cone.
    const dfx = fx - xi;
    const dfy = fy - yi;
    const df = Math.hypot(dfx, dfy);
    let facing = 0;
    let onPupil = 0;
    if (df > 1e-6 && df < FOCUS_R) {
      const fdot = (dfx * hnx + dfy * hny) / df;
      if (fdot > COS_THETA) {
        facing = fdot > 0 ? fdot : 0;
        // swing to face + move toward the focus
        const desired = W_FOCUS * pull;
        ax += desired * (((dfx / df) * MAX_SPEED) - vx[i]);
        ay += desired * (((dfy / df) * MAX_SPEED) - vy[i]);
        // pupil tightening: extra inward cohesion when close, so a core forms
        if (df < PUPIL_R) {
          const t = 1 - df / PUPIL_R;
          ax += pull * t * ((dfx / df) * MAX_SPEED - vx[i]) * 1.5;
          ay += pull * t * ((dfy / df) * MAX_SPEED - vy[i]) * 1.5;
          onPupil = t;
        }
        orderSum += facing;
        if (df < PUPIL_R) tightCount++;
      }
    }

    // soft containment: steer back inside a margin instead of wrapping
    const M = 0.04;
    if (xi < M) ax += (MAX_SPEED) * (1 - xi / M);
    else if (xi > 1 - M) ax -= (MAX_SPEED) * (1 - (1 - xi) / M);
    if (yi < M) ay += (MAX_SPEED) * (1 - yi / M);
    else if (yi > 1 - M) ay -= (MAX_SPEED) * (1 - (1 - yi) / M);

    // integrate velocity toward the steer sum, then clamp speed
    vx[i] += ax * RESPONSE * h;
    vy[i] += ay * RESPONSE * h;
    let sp = Math.hypot(vx[i], vy[i]);
    // gathered agents may slow toward the pupil; drifting ones keep a floor
    const minS = MIN_SPEED * (1 - 0.9 * pull * onPupil);
    if (sp > MAX_SPEED) {
      vx[i] = (vx[i] / sp) * MAX_SPEED;
      vy[i] = (vy[i] / sp) * MAX_SPEED;
      sp = MAX_SPEED;
    } else if (sp < minS && sp > 1e-6) {
      vx[i] = (vx[i] / sp) * minS;
      vy[i] = (vy[i] / sp) * minS;
      sp = minS;
    }

    x[i] = xi + vx[i] * h;
    y[i] = yi + vy[i] * h;
    // hard clamp as a backstop
    if (x[i] < 0) x[i] = 0;
    else if (x[i] > 1) x[i] = 1;
    if (y[i] < 0) y[i] = 0;
    else if (y[i] > 1) y[i] = 1;

    // per-agent attention drives sprite brightness/size; gated by the event
    const near = df < FOCUS_R ? 1 - df / FOCUS_R : 0;
    att[i] = Math.min(1, pull * (0.35 * facing + 0.85 * onPupil + 0.25 * near));
  }

  // measured coherence (the ONE scalar): facing-fraction + pupil-tightness
  const op = Math.min(
    1,
    (orderSum / n) * 1.7 + (tightCount / n) * 6.0,
  );
  // smooth so audio/figure move together without jitter
  const k = 1 - Math.exp(-5 * h);
  s.coherence += (op - s.coherence) * k;
}
