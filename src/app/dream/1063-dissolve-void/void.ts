/* ── 1063-dissolve-void · the luminous void + the DESYNC engine ───────────
 *
 *  Canvas2D only. A dark, vast void seeded with sparse luminous structures:
 *  drifting motes at varied depths, faint receding rings, and thin filaments.
 *  Everything is drawn with additive blending (`globalCompositeOperation =
 *  "lighter"`) over a soft afterimage (a low-alpha fill, never a hard clear),
 *  with exponential depth fog, parallax, and a vignette that slowly
 *  constricts toward a bright centre — the hypoxic tunnel-vision feel.
 *
 *  THE DESYNC ENGINE (the lab's first):
 *  -----------------------------------
 *  Normally your motion, the image, and the sound are bound together. Here we
 *  deliberately un-bind them. The raw control stream (tilt / drag) is the
 *  ground truth. The VISUAL camera follows it through a slowly-modulating lag,
 *  and the AUDIO follows it through a DIFFERENT lag (handled in audio.ts), so
 *  cause and effect drift out of phase — the documented sensory-motor
 *  uncoupling of the dissociated brain state (Bera et al. 2026).
 *
 *  The desync AMOUNT itself drifts across the ~4.5-min arc: binding loosens
 *  toward the peak (~70%), then a brief "clarity snap" near the end where the
 *  lag collapses to ~0, the field sharpens and brightens (the gamma surge),
 *  before a soft return.
 *
 *  This module owns the visual + shared desync state. It exposes the desynced
 *  camera so the page can hand the SAME control stream to audio.ts (which
 *  applies its own, different lag).
 */

export interface Control {
  /** raw control, −1..1, x = left/right, y = up/down (drag or tilt). */
  x: number;
  y: number;
}

export interface ArcState {
  /** 0..1 progress through the whole arc. */
  t: number;
  /** dissociation depth 0..1 (loose binding, vast space). */
  depth: number;
  /** 0..1, momentary clarity snap (gamma surge) near the end. */
  clarity: number;
  /** smoothing factor used for the VISUAL lag this frame (smaller = laggier). */
  visualLag: number;
  /** overall luminance 0..1, drifts slowly (no strobe). */
  luma: number;
  /** vignette tightness 0..1 (1 = tunnel almost closed). */
  vignette: number;
}

interface Mote {
  /** position in a normalised 3D-ish field. */
  x: number;
  y: number;
  z: number; // depth, 0 (far) .. 1 (near)
  hue: number;
  size: number;
  /** slow autonomous drift velocity. */
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
  /** desynced VISUAL camera (what the image actually follows). */
  cam: { x: number; y: number };
  /** the arc state computed each step (read by the page for audio coupling). */
  arc: ArcState;
}

const TWO_PI = Math.PI * 2;

/* total arc length in time-dilated seconds (~4.5 min of wall clock at the
 * page's TIME_SCALE). The clarity snap lands near the very end. */
export const ARC_SECONDS = 270;

export function makeVoidField(): VoidField {
  return {
    elapsed: 0,
    control: { x: 0, y: 0 },
    cam: { x: 0, y: 0 },
    arc: {
      t: 0,
      depth: 0,
      clarity: 0,
      visualLag: 0.05,
      luma: 0.35,
      vignette: 0.2,
    },
  };
}

/* ── the arc: how binding loosens, peaks, snaps, returns ─────────────────── */
function stepArc(field: VoidField): ArcState {
  const t = Math.min(1, field.elapsed / ARC_SECONDS);

  // dissociation depth: rises (slow onset), plateaus near the peak, then the
  // clarity snap pulls it back for the soft return.
  // a smooth onset curve to ~0.85, plateau, then ease down after 0.9.
  let depth: number;
  if (t < 0.55) {
    depth = (t / 0.55) * 0.85; // onset
  } else if (t < 0.86) {
    depth = 0.85 + 0.12 * Math.sin(((t - 0.55) / 0.31) * Math.PI * 0.5); // peak
  } else {
    depth = 0.97 * (1 - (t - 0.86) / 0.14) * 0.7 + 0.1; // return
  }
  depth = Math.max(0, Math.min(1, depth));

  // gamma-surge clarity snap: a short bright window centred at t≈0.9.
  const snapCentre = 0.9;
  const snapWidth = 0.05;
  const clarity = Math.exp(-((t - snapCentre) ** 2) / (snapWidth ** 2));

  // VISUAL lag: at rest the camera follows fairly tightly (0.06). As depth
  // grows the smoothing shrinks (laggier), modulating slowly so it breathes.
  // The clarity snap collapses the lag → near-instant re-binding (re-sync).
  const breathe = 0.5 + 0.5 * Math.sin(field.elapsed * 0.07);
  const looseness = depth * (0.7 + 0.3 * breathe);
  let visualLag = 0.065 * (1 - 0.93 * looseness);
  visualLag = visualLag + clarity * 0.25; // snap → tight, instant tracking
  visualLag = Math.max(0.004, Math.min(0.3, visualLag));

  // luminance: slow drift, lifted by depth + a strong lift in the snap.
  const luma =
    0.32 +
    0.18 * (0.5 + 0.5 * Math.sin(field.elapsed * 0.05)) +
    depth * 0.12 +
    clarity * 0.45;

  // vignette constricts as dissociation deepens (tunnel), opens in the snap.
  const vignette = Math.max(0, Math.min(1, 0.2 + depth * 0.55 - clarity * 0.5));

  return { t, depth, clarity, visualLag, luma, vignette };
}

/* ── per-frame integration of camera + autonomous drift ──────────────────── */
export function stepVoid(field: VoidField, dt: number): void {
  field.elapsed += dt;
  const arc = stepArc(field);
  field.arc = arc;

  // The desync engine: ease the visual camera toward the raw control by the
  // (drifting) visual-lag factor. Frame-rate-aware so it behaves the same on
  // 60/120 Hz. Smaller factor → the image trails the hand → uncoupling.
  const k = 1 - Math.pow(1 - arc.visualLag, dt * 60);
  field.cam.x += (field.control.x - field.cam.x) * k;
  field.cam.y += (field.control.y - field.cam.y) * k;
}

/* ── the visual field state (motes / rings), created once per run ─────────── */
export interface Scene {
  motes: Mote[];
  rings: Ring[];
}

export function makeScene(): Scene {
  const motes: Mote[] = [];
  for (let i = 0; i < 140; i++) {
    motes.push({
      x: Math.random() * 2 - 1,
      y: Math.random() * 2 - 1,
      z: Math.random(),
      hue: 200 + Math.random() * 120, // cyan → violet → magenta
      size: 0.5 + Math.random() * 2.2,
      vx: (Math.random() * 2 - 1) * 0.01,
      vy: (Math.random() * 2 - 1) * 0.01,
      vz: -(0.004 + Math.random() * 0.012), // drift toward viewer
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
  m.z = 1; // send back to the far plane
  m.x = Math.random() * 2 - 1;
  m.y = Math.random() * 2 - 1;
  m.hue = 200 + Math.random() * 120;
  m.size = 0.5 + Math.random() * 2.2;
}

/* exponential depth fog: far = dim, near = bright then fades past the camera. */
function fog(z: number): number {
  // z 0 (far) .. 1 (near). brightest in the mid-near band.
  return Math.exp(-3.0 * z) * Math.min(1, (1 - z) * 6 + 0.05);
}

/* ── draw one frame ──────────────────────────────────────────────────────── */
export function drawVoid(
  ctx: CanvasRenderingContext2D,
  scene: Scene,
  field: VoidField,
  w: number,
  h: number,
  dt: number,
): void {
  const arc = field.arc;
  const cx = w / 2;
  const cy = h / 2;
  const minDim = Math.min(w, h);

  // soft afterimage: paint a low-alpha black veil instead of clearing, so
  // motion leaves luminous trails (the weightless smear of the void).
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = "rgba(2,3,8,0.16)";
  ctx.fillRect(0, 0, w, h);

  ctx.globalCompositeOperation = "lighter";

  // parallax from the DESYNCED camera (not the raw control → unglued feel).
  const camX = field.cam.x;
  const camY = field.cam.y;

  // ── receding rings / filaments ──
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
    const px = cx + camX * 110 * (1 - r.z);
    const py = cy + camY * 110 * (1 - r.z);
    const a = fog(r.z) * (0.05 + arc.luma * 0.06);
    if (a <= 0.002 || radius > minDim * 2.2) continue;
    ctx.lineWidth = Math.max(0.4, 1.6 * depthScale * (0.3 + arc.clarity));
    ctx.strokeStyle = `hsla(${r.hue}, 70%, ${55 + arc.clarity * 25}%, ${a})`;
    ctx.beginPath();
    // an elliptical ring (a ring seen at a tilt) → filament-like
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

  // ── drifting luminous motes ──
  const driftMul = 0.4 + arc.depth * 1.1; // time dilation: deeper = slower? no
  for (const m of scene.motes) {
    // autonomous drift so a glance is always alive
    m.x += m.vx * dt * driftMul;
    m.y += m.vy * dt * driftMul;
    m.z += m.vz * dt * (0.5 + arc.depth * 0.6);
    m.twinkle += dt * 0.6;
    if (m.z <= 0.02) recycleMote(m);

    const depthScale = 1 / (0.1 + m.z * 1.4);
    // parallax: nearer motes shift more with the desynced camera
    const par = (1 - m.z) * 1.0;
    const sx = cx + (m.x * minDim * 0.55 + camX * 160 * par) * depthScale * 0.5;
    const sy = cy + (m.y * minDim * 0.55 + camY * 160 * par) * depthScale * 0.5;
    if (sx < -50 || sx > w + 50 || sy < -50 || sy > h + 50) continue;

    const tw = 0.7 + 0.3 * Math.sin(m.twinkle);
    const a = fog(m.z) * tw * (0.5 + arc.luma * 0.6);
    if (a <= 0.003) continue;
    const rad = m.size * depthScale * (0.8 + arc.clarity * 0.6);
    const light = 60 + arc.clarity * 25;
    // soft radial glow via gradient
    const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, rad * 4);
    g.addColorStop(0, `hsla(${m.hue}, 85%, ${light}%, ${a})`);
    g.addColorStop(0.4, `hsla(${m.hue}, 85%, ${light}%, ${a * 0.4})`);
    g.addColorStop(1, `hsla(${m.hue}, 85%, ${light}%, 0)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(sx, sy, rad * 4, 0, TWO_PI);
    ctx.fill();
  }

  // ── bright central core (the place you are dissolving toward) ──
  const coreA = 0.06 + arc.luma * 0.12 + arc.clarity * 0.5;
  const coreR = minDim * (0.05 + arc.clarity * 0.18);
  const cg = ctx.createRadialGradient(
    cx + camX * 30,
    cy + camY * 30,
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

  // ── vignette: constrict toward a bright centre (tunnel vision) ──
  ctx.globalCompositeOperation = "source-over";
  const inner = minDim * (0.55 - arc.vignette * 0.42);
  const outer = minDim * 0.78;
  const vg = ctx.createRadialGradient(cx, cy, inner, cx, cy, outer);
  vg.addColorStop(0, "rgba(0,0,0,0)");
  vg.addColorStop(1, `rgba(0,0,2,${0.6 + arc.vignette * 0.38})`);
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, w, h);
}
