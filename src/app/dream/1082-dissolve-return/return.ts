/* ── 1082-dissolve-return · the luminous void + the KURAMOTO RE-SYNC engine ──
 *
 *  Canvas2D only. Cycle-2 deepening of 1063-dissolve-void. Where 1063 built the
 *  lab's first audio-visual DESYNC engine (three streams given three different,
 *  drifting lags so cause/effect come unglued — the ketamine K-hole), this
 *  prototype makes the RE-BINDING the star: something you *do* and can *see and
 *  hear lock*, not a hidden one-frame flash.
 *
 *  THE KURAMOTO RE-SYNC ENGINE
 *  ---------------------------
 *  The three streams — CONTROL (your hand), VISUAL (the camera), AUDIO — are
 *  modelled as three coupled phase oscillators (Kuramoto 1975). Each carries its
 *  own drifting natural frequency offset (the "lag"). A single global coupling
 *  strength K governs how strongly the three phases pull toward their common
 *  mean phase:
 *
 *      dθ_i/dt  =  ω_i  +  (K / N) · Σ_j sin(θ_j − θ_i)
 *
 *  The Kuramoto ORDER PARAMETER r ∈ [0,1] measures coherence:
 *
 *      r · e^{iψ}  =  (1/N) · Σ_j e^{iθ_j}
 *
 *  r → 0 : the three phases drift freely, visibly/audibly out of sync (1063's
 *          un-binding, now explicit).
 *  r → 1 : all three phases lock — the void FUSES into one hyper-lucid, sharp,
 *          bright, re-bound instant (the gamma "binding-by-synchrony" event).
 *
 *  THE USER PARTICIPATES: K rises when the hand is held STILL / moved slowly and
 *  smoothly (low control velocity = "settling the mind"); frantic motion keeps K
 *  low. So re-coupling is something you play, not something you wait for. A gentle
 *  baseline K also lifts near the end of the arc so the piece always resolves,
 *  even hands-off (headless demo).
 *
 *  MAKING THE DRIFT PERCEPTIBLE (the key deepening):
 *  A faint "true-position ghost" layer is rendered where things would sit with
 *  ZERO lag, beneath the phase-lagged layer. Out of phase → a beating / moiré
 *  DOUBLING between ghost and lagged; as the phases lock the two fuse into one
 *  crisp image. A phase-ring (three dots orbiting a ring) reads the live state.
 *
 *  This module owns the visual + the shared Kuramoto state, and exposes r, the
 *  per-stream phases, and the lagged/true camera so the page can hand the audio
 *  engine the SAME coupling state (which turns phase-mismatch into an audible
 *  beat frequency).
 */

export interface Control {
  /** raw control, −1..1, x = left/right, y = up/down (drag or tilt). */
  x: number;
  y: number;
}

export interface ArcState {
  /** 0..1 progress through the whole arc. */
  t: number;
  /** dissociation depth 0..1 (how far apart the natural frequencies spread). */
  depth: number;
  /** overall luminance 0..1, drifts slowly (no strobe). */
  luma: number;
  /** vignette tightness 0..1 (1 = tunnel almost closed). */
  vignette: number;
  /** baseline coupling floor the arc lifts near the end (hands-off resolve). */
  baseK: number;
}

/** Live state of the three coupled oscillators. */
export interface Kuramoto {
  /** phases θ of CONTROL, VISUAL, AUDIO (radians). */
  theta: [number, number, number];
  /** natural frequency offsets ω_i (rad/s), slowly drifting. */
  omega: [number, number, number];
  /** current global coupling strength K. */
  K: number;
  /** order parameter r ∈ [0,1] — coherence of the three phases. */
  r: number;
  /** mean phase ψ. */
  psi: number;
  /** smoothed control velocity (0 = perfectly still). */
  vel: number;
  /** 0..1 lock indicator, eased from r past a threshold — used for the bloom. */
  lock: number;
}

interface Mote {
  x: number;
  y: number;
  z: number; // depth, 0 (far) .. 1 (near)
  hue: number;
  size: number;
  vx: number;
  vy: number;
  vz: number;
  twinkle: number;
}

interface Ring {
  z: number; // recedes over time
  hue: number;
  spin: number;
  ax: number; // tilt of the ring plane
}

export interface VoidField {
  /** seconds of (time-dilated) clock elapsed. */
  elapsed: number;
  /** raw control stream (set by the page from tilt/drag). */
  control: Control;
  /** previous control, for velocity. */
  prevControl: Control;
  /** TRUE (zero-lag) camera — the ghost target. */
  trueCam: { x: number; y: number };
  /** phase-LAGGED VISUAL camera (what the lagged layer follows). */
  cam: { x: number; y: number };
  /** the Kuramoto oscillator state (read by the page for audio coupling). */
  osc: Kuramoto;
  /** the arc state computed each step. */
  arc: ArcState;
  /** extra user-driven settle command (a "let it settle" button press → decays). */
  settleAssist: number;
  /** true once the user has actually interacted (moved / dragged / tilted or
   *  pressed settle). Before this, coupling comes ONLY from the slow arc floor,
   *  so a hands-off glance experiences the full un-bind → re-bind arc rather
   *  than snapping to lock instantly (perfect stillness ≠ active settling). */
  engaged: boolean;
}

const TWO_PI = Math.PI * 2;

/* total arc length in time-dilated seconds. At the page's TIME_SCALE (0.6) this
 * is a ~4-minute hands-off traverse of un-bind → re-bind, with the baseline-K
 * floor crossing the lock threshold ~3 min in — so a passive glance actually
 * SEES the resolve, not just the drift. (Active stillness locks in ~3 s, far
 * sooner; the arc floor is only the hands-off safety net.) */
export const ARC_SECONDS = 150;

export function makeVoidField(): VoidField {
  return {
    elapsed: 0,
    control: { x: 0, y: 0 },
    prevControl: { x: 0, y: 0 },
    trueCam: { x: 0, y: 0 },
    cam: { x: 0, y: 0 },
    osc: {
      // start the three phases spread apart → visibly out of sync from frame 1.
      theta: [0, TWO_PI / 3, (2 * TWO_PI) / 3],
      // natural frequency offsets: CONTROL ~0, VISUAL/AUDIO detuned in opposite
      // directions so with K≈0 they beat against each other and never lock —
      // only coupling K well above the critical K_c can pull them together.
      omega: [0.0, 2.0, -2.6],
      K: 0.05,
      r: 0,
      psi: 0,
      vel: 0,
      lock: 0,
    },
    arc: { t: 0, depth: 0, luma: 0.35, vignette: 0.2, baseK: 0.02 },
    settleAssist: 0,
    engaged: false,
  };
}

/* ── the arc: how deep the dissociation runs and the hands-off resolve floor ── */
function stepArc(field: VoidField): ArcState {
  const t = Math.min(1, field.elapsed / ARC_SECONDS);

  // dissociation depth: rises (slow onset), plateaus, eases toward the return.
  let depth: number;
  if (t < 0.5) {
    depth = (t / 0.5) * 0.85; // onset — streams spread apart
  } else if (t < 0.8) {
    depth = 0.85 + 0.1 * Math.sin(((t - 0.5) / 0.3) * Math.PI); // deep plateau
  } else {
    depth = 0.9 * (1 - (t - 0.8) / 0.2) * 0.7 + 0.12; // soft return
  }
  depth = Math.max(0, Math.min(1, depth));

  // baseline coupling floor: near-zero early (frantic or not, it stays loose),
  // then a slow lift in the last third so the arc always resolves hands-off —
  // but stillness can reach lock much sooner. At the end this floor alone
  // exceeds K_c enough to bloom a soft lock even with no interaction.
  const baseK = t < 0.55 ? 0.02 : 0.02 + ((t - 0.55) / 0.45) * 8.0;

  // luminance drifts slowly; the lock bloom itself is added in draw from osc.lock.
  const luma = 0.3 + 0.16 * (0.5 + 0.5 * Math.sin(field.elapsed * 0.05)) + depth * 0.1;

  // vignette constricts as dissociation deepens (tunnel); the lock opens it in draw.
  const vignette = Math.max(0, Math.min(1, 0.18 + depth * 0.5));

  return { t, depth, luma, vignette, baseK };
}

/* ── Kuramoto step: couple the three phase oscillators toward a common phase ── */
function stepKuramoto(field: VoidField, dt: number, arc: ArcState): void {
  const osc = field.osc;

  // control velocity: how fast the hand is moving right now (smoothed).
  const dx = field.control.x - field.prevControl.x;
  const dy = field.control.y - field.prevControl.y;
  const inst = Math.sqrt(dx * dx + dy * dy) / Math.max(dt, 1 / 120);
  osc.vel += (inst - osc.vel) * (1 - Math.pow(0.001, dt)); // ~fast smoothing
  field.prevControl.x = field.control.x;
  field.prevControl.y = field.control.y;
  // any real motion marks the user as engaged → stillness becomes the live
  // coupling instrument from here on (see settleTerm below).
  if (inst > 0.02) field.engaged = true;

  // STILLNESS → COUPLING. A low velocity gives near-1 stillness; frantic motion
  // pushes it to ~0. This is the participatory knob: settle your hand, K climbs.
  const stillness = Math.exp(-osc.vel * 2.6);
  // "let it settle" button adds a temporary boost that decays away.
  field.settleAssist *= Math.pow(0.35, dt); // ~1.5s half-life-ish
  // stillness only counts as active settling once the user has ENGAGED — a pure
  // hands-off glance rides the slow arc floor instead of snapping to lock.
  const settleTerm = field.engaged ? stillness : 0;
  const settle = Math.min(1, settleTerm + field.settleAssist);

  // Target coupling: the arc's baseline floor + a big stillness-driven term.
  // Held still, K climbs well above the critical coupling K_c (~ω-spread) and
  // drives r → 1; frantic motion keeps K near the floor and the phases scatter.
  const targetK = arc.baseK + settle * 8.0;
  // ease K so coupling itself feels like it has inertia (settling takes a moment).
  osc.K += (targetK - osc.K) * (1 - Math.pow(0.06, dt));

  // slowly drift the natural frequency spread with dissociation depth — deeper
  // dissociation = wider ω-spread = harder to lock (needs more stillness).
  const spread = 0.6 + arc.depth * 0.45;
  const baseOmega = [0.0, 2.0, -2.6];
  for (let i = 0; i < 3; i++) {
    // gentle wander so the un-bound state breathes rather than sits static.
    const wander = 0.18 * Math.sin(field.elapsed * (0.05 + i * 0.017) + i);
    osc.omega[i] = baseOmega[i] * spread + wander;
  }

  // mean-field Kuramoto update. Compute order parameter (r, ψ) from current θ.
  let sumC = 0;
  let sumS = 0;
  for (let i = 0; i < 3; i++) {
    sumC += Math.cos(osc.theta[i]);
    sumS += Math.sin(osc.theta[i]);
  }
  const r = Math.sqrt(sumC * sumC + sumS * sumS) / 3;
  const psi = Math.atan2(sumS, sumC);
  osc.r = r;
  osc.psi = psi;

  // integrate each phase: dθ_i = ω_i + K·r·sin(ψ − θ_i)  (mean-field form).
  for (let i = 0; i < 3; i++) {
    const dTheta = osc.omega[i] + osc.K * r * Math.sin(psi - osc.theta[i]);
    osc.theta[i] += dTheta * dt;
    // keep in [0, 2π)
    osc.theta[i] = ((osc.theta[i] % TWO_PI) + TWO_PI) % TWO_PI;
  }

  // lock indicator: ease SLOWLY past a high-coherence threshold so the fusion
  // bloom needs SUSTAINED coherence (a transient r-peak during frantic motion
  // won't falsely bloom). r must hold high for ~a second to fully lock.
  const lockTarget = Math.max(0, (r - 0.9) / 0.1); // 0 at r=0.9, 1 at r=1
  osc.lock += (Math.min(1, lockTarget) - osc.lock) * (1 - Math.pow(0.5, dt));
}

/* ── per-frame integration of cameras + autonomous drift ──────────────────── */
export function stepVoid(field: VoidField, dt: number): void {
  field.elapsed += dt;
  const arc = stepArc(field);
  field.arc = arc;

  stepKuramoto(field, dt, arc);

  // TRUE camera: eases toward the raw control quickly — the zero-lag ghost.
  const kt = 1 - Math.pow(1 - 0.14, dt * 60);
  field.trueCam.x += (field.control.x - field.trueCam.x) * kt;
  field.trueCam.y += (field.control.y - field.trueCam.y) * kt;

  // LAGGED VISUAL camera: its effective smoothing is derived from the VISUAL
  // oscillator's phase relative to the CONTROL oscillator. When the two phases
  // are locked (Δθ→0), the lagged camera tracks the true one tightly (fusion).
  // When they drift apart, a phase-driven offset pushes the lagged camera away
  // from the true one → the visible DOUBLING / beating between the two layers.
  const dPhase = phaseDiff(field.osc.theta[1], field.osc.theta[0]); // −π..π
  const coherence = field.osc.r; // 0..1
  // base tracking gets tighter with coherence; loose when incoherent.
  const track = 0.02 + coherence * 0.16;
  const kv = 1 - Math.pow(1 - track, dt * 60);
  field.cam.x += (field.control.x - field.cam.x) * kv;
  field.cam.y += (field.control.y - field.cam.y) * kv;
  // phase-driven displacement: a slow orbital offset whose radius ∝ (1−r) and
  // whose angle IS the phase difference — this is what visibly beats.
  const offMag = (1 - coherence) * 0.55;
  field.cam.x += Math.cos(dPhase) * offMag * 0.35 * (0.4 + Math.abs(field.control.x));
  field.cam.y += Math.sin(dPhase) * offMag * 0.35 * (0.4 + Math.abs(field.control.y));
}

/** shortest signed difference a−b wrapped to −π..π. */
export function phaseDiff(a: number, b: number): number {
  let d = a - b;
  while (d > Math.PI) d -= TWO_PI;
  while (d < -Math.PI) d += TWO_PI;
  return d;
}

/* ── the visual field state (motes / rings), created once per run ─────────── */
export interface Scene {
  motes: Mote[];
  rings: Ring[];
}

export function makeScene(): Scene {
  const motes: Mote[] = [];
  for (let i = 0; i < 130; i++) {
    motes.push({
      x: Math.random() * 2 - 1,
      y: Math.random() * 2 - 1,
      z: Math.random(),
      hue: 200 + Math.random() * 120, // cyan → violet → magenta
      size: 0.5 + Math.random() * 2.2,
      vx: (Math.random() * 2 - 1) * 0.01,
      vy: (Math.random() * 2 - 1) * 0.01,
      vz: -(0.004 + Math.random() * 0.012),
      twinkle: Math.random() * TWO_PI,
    });
  }
  const rings: Ring[] = [];
  for (let i = 0; i < 7; i++) {
    rings.push({
      z: i / 7,
      hue: 210 + Math.random() * 90,
      spin: Math.random() * TWO_PI,
      ax: (Math.random() * 2 - 1) * 0.5,
    });
  }
  return { motes, rings };
}

function recycleMote(m: Mote): void {
  m.z = 1;
  m.x = Math.random() * 2 - 1;
  m.y = Math.random() * 2 - 1;
  m.hue = 200 + Math.random() * 120;
  m.size = 0.5 + Math.random() * 2.2;
}

function fog(z: number): number {
  return Math.exp(-3.0 * z) * Math.min(1, (1 - z) * 6 + 0.05);
}

/* ── draw the mote field for ONE camera (ghost or lagged) ─────────────────── */
function drawField(
  ctx: CanvasRenderingContext2D,
  scene: Scene,
  camX: number,
  camY: number,
  w: number,
  h: number,
  luma: number,
  lock: number,
  alphaMul: number,
  hueShift: number,
): void {
  const cx = w / 2;
  const cy = h / 2;
  const minDim = Math.min(w, h);

  for (const m of scene.motes) {
    const depthScale = 1 / (0.1 + m.z * 1.4);
    const par = (1 - m.z) * 1.0;
    const sx = cx + (m.x * minDim * 0.55 + camX * 160 * par) * depthScale * 0.5;
    const sy = cy + (m.y * minDim * 0.55 + camY * 160 * par) * depthScale * 0.5;
    if (sx < -50 || sx > w + 50 || sy < -50 || sy > h + 50) continue;

    const tw = 0.7 + 0.3 * Math.sin(m.twinkle);
    const a = fog(m.z) * tw * (0.5 + luma * 0.6) * alphaMul;
    if (a <= 0.003) continue;
    const rad = m.size * depthScale * (0.8 + lock * 0.6);
    const light = 60 + lock * 25;
    const hue = m.hue + hueShift;
    const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, rad * 4);
    g.addColorStop(0, `hsla(${hue}, 85%, ${light}%, ${a})`);
    g.addColorStop(0.4, `hsla(${hue}, 85%, ${light}%, ${a * 0.4})`);
    g.addColorStop(1, `hsla(${hue}, 85%, ${light}%, 0)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(sx, sy, rad * 4, 0, TWO_PI);
    ctx.fill();
  }
}

/* ── draw the phase-ring: three dots orbiting a ring, converging as they lock ─ */
function drawPhaseRing(
  ctx: CanvasRenderingContext2D,
  osc: Kuramoto,
  w: number,
  h: number,
): void {
  const dpr = Math.min(2, w / Math.max(1, window.innerWidth));
  const R = 34 * dpr;
  const cx = w - R - 26 * dpr;
  const cy = h - R - 26 * dpr;

  ctx.save();
  ctx.globalCompositeOperation = "source-over";
  // ring backdrop
  ctx.lineWidth = 1.4 * dpr;
  ctx.strokeStyle = "rgba(255,255,255,0.16)";
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, TWO_PI);
  ctx.stroke();

  // coherence arc (mean phase direction, length ∝ r)
  ctx.lineWidth = 3 * dpr;
  ctx.strokeStyle = `hsla(${190 + osc.r * 20}, 90%, ${60 + osc.r * 25}%, ${0.25 + osc.r * 0.7})`;
  ctx.beginPath();
  ctx.arc(cx, cy, R, osc.psi - osc.r * Math.PI, osc.psi + osc.r * Math.PI);
  ctx.stroke();

  // three dots on the ring at their phases
  const colours = ["#a5f3ff", "#c4b5fd", "#f0abfc"]; // control, visual, audio
  ctx.globalCompositeOperation = "lighter";
  for (let i = 0; i < 3; i++) {
    const px = cx + Math.cos(osc.theta[i]) * R;
    const py = cy + Math.sin(osc.theta[i]) * R;
    const rad = (3 + osc.lock * 2.5) * dpr;
    const g = ctx.createRadialGradient(px, py, 0, px, py, rad * 3);
    g.addColorStop(0, colours[i]);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(px, py, rad * 3, 0, TWO_PI);
    ctx.fill();
  }
  ctx.restore();
}

/* ── draw one frame: ghost layer + lagged layer + core + ring + vignette ──── */
export function drawVoid(
  ctx: CanvasRenderingContext2D,
  scene: Scene,
  field: VoidField,
  w: number,
  h: number,
  dt: number,
): void {
  const arc = field.arc;
  const osc = field.osc;
  const cx = w / 2;
  const cy = h / 2;
  const minDim = Math.min(w, h);

  // soft afterimage veil (never a hard clear) → luminous trails.
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = "rgba(2,3,8,0.16)";
  ctx.fillRect(0, 0, w, h);

  ctx.globalCompositeOperation = "lighter";

  // ── receding rings / filaments (drawn once, from the lagged camera) ──
  for (const r of scene.rings) {
    r.z -= dt * 0.018 * (0.6 + arc.depth * 0.8);
    r.spin += dt * 0.05 * (0.4 + arc.depth);
    if (r.z < 0) {
      r.z += 1;
      r.hue = 210 + Math.random() * 90;
      r.ax = (Math.random() * 2 - 1) * 0.5;
    }
    const depthScale = 1 / (0.12 + r.z * 1.3);
    const radius = minDim * 0.06 * depthScale;
    const px = cx + field.cam.x * 110 * (1 - r.z);
    const py = cy + field.cam.y * 110 * (1 - r.z);
    const a = fog(r.z) * (0.05 + arc.luma * 0.06);
    if (a <= 0.002 || radius > minDim * 2.2) continue;
    ctx.lineWidth = Math.max(0.4, 1.6 * depthScale * (0.3 + osc.lock));
    ctx.strokeStyle = `hsla(${r.hue}, 70%, ${55 + osc.lock * 25}%, ${a})`;
    ctx.beginPath();
    const segs = 48;
    for (let s = 0; s <= segs; s++) {
      const ang = (s / segs) * TWO_PI + r.spin;
      const ex = Math.cos(ang) * radius;
      const ey = Math.sin(ang) * radius * (0.25 + Math.abs(r.ax) * 0.6);
      if (s === 0) ctx.moveTo(px + ex, py + ey);
      else ctx.lineTo(px + ex, py + ey);
    }
    ctx.stroke();
  }

  // ── advance mote autonomous drift ONCE (shared by both layers) ──
  const driftMul = 0.4 + arc.depth * 1.1;
  for (const m of scene.motes) {
    m.x += m.vx * dt * driftMul;
    m.y += m.vy * dt * driftMul;
    m.z += m.vz * dt * (0.5 + arc.depth * 0.6);
    m.twinkle += dt * 0.6;
    if (m.z <= 0.02) recycleMote(m);
  }

  // ── THE GHOST LAYER: the TRUE (zero-lag) position, faint, hue-shifted ──
  // Its visibility fades as coherence rises: at lock it collapses INTO the
  // lagged layer, so the doubling fuses to a single crisp image.
  const ghostAlpha = (1 - osc.r) * 0.6;
  if (ghostAlpha > 0.01) {
    drawField(ctx, scene, field.trueCam.x, field.trueCam.y, w, h, arc.luma, 0, ghostAlpha, -22);
  }

  // ── THE LAGGED LAYER: what the void actually shows (main image) ──
  drawField(ctx, scene, field.cam.x, field.cam.y, w, h, arc.luma, osc.lock, 1, 0);

  // ── bright central core; the lock bloom brightens + swells it ──
  const coreA = 0.06 + arc.luma * 0.12 + osc.lock * 0.5;
  const coreR = minDim * (0.05 + osc.lock * 0.18);
  const cg = ctx.createRadialGradient(
    cx + field.cam.x * 30,
    cy + field.cam.y * 30,
    0,
    cx,
    cy,
    coreR * 6,
  );
  cg.addColorStop(0, `hsla(190, 90%, 92%, ${coreA})`);
  cg.addColorStop(0.5, `hsla(220, 80%, 70%, ${coreA * 0.3})`);
  cg.addColorStop(1, "hsla(240, 80%, 50%, 0)");
  ctx.fillStyle = cg;
  ctx.beginPath();
  ctx.arc(cx, cy, coreR * 6, 0, TWO_PI);
  ctx.fill();

  // ── vignette: constrict as dissociation deepens; the lock opens it ──
  ctx.globalCompositeOperation = "source-over";
  const vig = Math.max(0, arc.vignette - osc.lock * 0.5);
  const inner = minDim * (0.55 - vig * 0.42);
  const outer = minDim * 0.78;
  const vg = ctx.createRadialGradient(cx, cy, inner, cx, cy, outer);
  vg.addColorStop(0, "rgba(0,0,0,0)");
  vg.addColorStop(1, `rgba(0,0,2,${0.6 + vig * 0.38})`);
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, w, h);

  // ── the coherence meter / phase-ring (reads the state, no settings panel) ──
  drawPhaseRing(ctx, osc, w, h);
}
