// ─────────────────────────────────────────────────────────────────────────────
// 10536-inkmirror — contour.ts
//
// THE TECHNIQUE, in one file: silhouette → contour → self-writing calligraphy.
//
// A live source (camera or a seeded synthetic "ghost figure") is reduced to a
// foreground PRESENCE mask on a small grid. From the mask centroid we cast
// N_ANGLES rays outward and read the boundary radius r(θ) — an ordered, closed
// silhouette outline that both the camera path and the fallback share. This is
// the single "contour" representation; everything downstream is identical.
//
// A calligraphic "pen" sweeps continuously around that loop. Each index it
// crosses it lays down a fresh broad-nib gold stroke tangent to the edge; where
// the contour has MOVED since last frame it lays denser, brighter strokes and
// fires a pluck. Older strokes illuminate then fade — so the figure is forever
// being re-written. NOT a physics sim, NOT particles, NOT a fluid — image
// processing → contour tracing → generative stroke rendering.
// ─────────────────────────────────────────────────────────────────────────────

export const N_ANGLES = 144;
export const MAX_STROKES = 780;

/** Floats per instance uploaded to the GPU (see page.tsx stroke VAO). */
export const STROKE_STRIDE = 10;

export interface PluckEvent {
  /** fig-space x in [0,1] (0 left, 1 right). */
  x: number;
  /** fig-space y in [0,1] (0 bottom, 1 top) — drives pitch. */
  y: number;
  /** local contour speed / illumination 0..~1 — drives velocity. */
  speed: number;
  /** 0 gold, 1 ultramarine, 2 vermilion — accent voices differ slightly. */
  hue: number;
}

interface Stroke {
  cx: number;
  cy: number;
  dx: number; // unit tangent
  dy: number;
  hlen: number; // half length (fig units)
  hwid: number; // half width (fig units)
  birth: number; // seconds
  life: number; // seconds
  hue: number;
  shimmer: number;
  illum: number;
}

const TAU = Math.PI * 2;
const NIB_ANGLE = Math.PI * 0.28; // broad-nib held at a fixed rake

function smooth1D(r: Float32Array, passes: number): void {
  const n = r.length;
  const tmp = new Float32Array(n);
  for (let p = 0; p < passes; p++) {
    for (let i = 0; i < n; i++) {
      const a = r[(i - 1 + n) % n];
      const b = r[i];
      const c = r[(i + 1) % n];
      tmp[i] = a * 0.25 + b * 0.5 + c * 0.25;
    }
    r.set(tmp);
  }
}

export class ContourEngine {
  radii = new Float32Array(N_ANGLES).fill(0.22);
  private prevRadii = new Float32Array(N_ANGLES).fill(0.22);
  cx = 0.5;
  cy = 0.49;

  // camera presence buffer (persists a recently-seen silhouette ~1.5s)
  private gw = 0;
  private gh = 0;
  private bg: Float32Array | null = null;
  private presence: Float32Array | null = null;

  private strokes: Stroke[] = [];
  private penPos = 0;
  private nextPluckAt = 0;
  private inst = new Float32Array(MAX_STROKES * STROKE_STRIDE);

  private rnd: () => number;
  constructor(rnd: () => number) {
    this.rnd = rnd;
  }

  // ── camera path: luminance grid → presence mask → radii ────────────────────
  updateFromLuma(luma: Float32Array, gw: number, gh: number): void {
    if (this.gw !== gw || this.gh !== gh || !this.bg) {
      this.gw = gw;
      this.gh = gh;
      this.bg = new Float32Array(luma); // seed background = first frame
      this.presence = new Float32Array(gw * gh);
    }
    const bg = this.bg;
    const pres = this.presence!;
    let sx = 0;
    let sy = 0;
    let sw = 0;
    for (let y = 0; y < gh; y++) {
      for (let x = 0; x < gw; x++) {
        const i = y * gw + x;
        const diff = Math.abs(luma[i] - bg[i]);
        const motion = diff > 0.1 ? 1 : 0;
        // presence decays slowly so a briefly-still figure lingers, then fades
        pres[i] = Math.max(pres[i] * 0.94, motion);
        bg[i] += (luma[i] - bg[i]) * 0.02; // slow background adaptation
        if (pres[i] > 0.3) {
          const w = pres[i];
          sx += x * w;
          sy += y * w;
          sw += w;
        }
      }
    }
    if (sw > gw * 0.5) {
      this.cx = sx / sw / gw;
      this.cy = 1 - sy / sw / gh; // flip to y-up
    } else {
      // too little presence — drift back toward frame centre
      this.cx += (0.5 - this.cx) * 0.05;
      this.cy += (0.49 - this.cy) * 0.05;
    }
    this.marchRadii((fx, fy) => {
      const px = Math.round(fx * gw);
      const py = Math.round((1 - fy) * gh);
      if (px < 0 || py < 0 || px >= gw || py >= gh) return 0;
      return pres[py * gw + px];
    });
  }

  // ── fallback path: analytic breathing "ghost figure" (head + torso) ────────
  private syn = {
    p0: 0,
    p1: 0,
    p2: 0,
    p3: 0,
    seeded: false,
  };
  updateSynthetic(t: number): void {
    const s = this.syn;
    if (!s.seeded) {
      s.p0 = this.rnd() * TAU;
      s.p1 = this.rnd() * TAU;
      s.p2 = this.rnd() * TAU;
      s.p3 = this.rnd() * TAU;
      s.seeded = true;
    }
    // gentle sway of the whole figure
    this.cx = 0.5 + 0.03 * Math.sin(t * 0.4 + s.p0);
    this.cy = 0.49 + 0.02 * Math.sin(t * 0.33 + s.p1);
    const breath = 1 + 0.045 * Math.sin(t * 0.9 + s.p2);
    // moving "arms": travelling bumps near the shoulder angles
    const armPhase = t * 0.7 + s.p3;
    for (let i = 0; i < N_ANGLES; i++) {
      const th = (i / N_ANGLES) * TAU;
      const c = Math.cos(th);
      const sn = Math.sin(th); // y-up
      // torso ellipse radius
      const rx = 0.19;
      const ry = 0.33;
      const rEll = (rx * ry) / Math.hypot(ry * c, rx * sn);
      // head lobe near θ = +π/2 (up)
      let dHead = th - Math.PI / 2;
      dHead = Math.atan2(Math.sin(dHead), Math.cos(dHead));
      const head = 0.1 * Math.exp(-(dHead * dHead) / 0.14);
      // neck pinch just below the head
      const neck = -0.03 * Math.exp(-((dHead - 0.55) * (dHead - 0.55)) / 0.03);
      // arms: bumps sweeping around the shoulders (±θ near horizontal)
      const arm =
        0.05 *
        Math.sin(armPhase) *
        Math.exp(-(Math.pow(Math.abs(c) - 0.85, 2)) / 0.02) *
        (sn > -0.2 ? 1 : 0.3);
      this.radii[i] = (rEll + head + neck + arm) * breath;
    }
    smooth1D(this.radii, 1);
  }

  private marchRadii(sample: (fx: number, fy: number) => number): void {
    for (let i = 0; i < N_ANGLES; i++) {
      const th = (i / N_ANGLES) * TAU;
      const c = Math.cos(th);
      const sn = Math.sin(th);
      let found = 0.05;
      for (let r = 0.04; r < 0.72; r += 0.006) {
        const v = sample(this.cx + c * r, this.cy + sn * r);
        if (v > 0.3) found = r;
      }
      // contract smoothly toward the newly-found edge (no popping)
      this.radii[i] = this.radii[i] * 0.55 + found * 0.45;
    }
    smooth1D(this.radii, 2);
  }

  // ── the pen: deposit strokes along the contour, emit pluck events ──────────
  advance(now: number, dt: number, reduced: boolean): PluckEvent[] {
    const events: PluckEvent[] = [];
    const n = N_ANGLES;
    const life = reduced ? 4.2 : 2.7;

    // precompute boundary points + local speed
    const px = new Float32Array(n);
    const py = new Float32Array(n);
    const spd = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const th = (i / n) * TAU;
      px[i] = this.cx + Math.cos(th) * this.radii[i];
      py[i] = this.cy + Math.sin(th) * this.radii[i];
      spd[i] = Math.abs(this.radii[i] - this.prevRadii[i]);
    }

    // pen sweep: one full loop every ~period seconds
    const period = reduced ? 5.4 : 3.6;
    const penSpeed = (n / period) * dt;
    let steps = Math.min(10, Math.max(1, Math.ceil(penSpeed)));
    const inc = penSpeed / steps;
    while (steps-- > 0) {
      this.penPos = (this.penPos + inc) % n;
      const i = Math.floor(this.penPos) % n;
      const ip = (i + 1) % n;
      const im = (i - 1 + n) % n;
      let tx = px[ip] - px[im];
      let ty = py[ip] - py[im];
      const tl = Math.hypot(tx, ty) || 1e-4;
      tx /= tl;
      ty /= tl;
      // curvature: angle change of the tangent across the neighbourhood
      const a0 = Math.atan2(py[i] - py[im], px[i] - px[im]);
      const a1 = Math.atan2(py[ip] - py[i], px[ip] - px[i]);
      let curv = Math.abs(Math.atan2(Math.sin(a1 - a0), Math.cos(a1 - a0)));
      curv = Math.min(1, curv / 0.9);

      const sp = Math.min(1, spd[i] * 26);
      const illum = Math.min(1, 0.22 + sp * 1.3 + curv * 0.25);

      // broad-nib width: thick perpendicular to the nib, thin parallel
      const strokeAngle = Math.atan2(ty, tx);
      const nib = Math.abs(Math.sin(strokeAngle - NIB_ANGLE));
      const hwid = 0.006 + 0.02 * nib + 0.006 * curv;
      const seg = Math.hypot(px[ip] - px[i], py[ip] - py[i]);
      const hlen = Math.min(0.05, Math.max(0.012, seg * 1.7));

      // hue: gold dominant, jewel accents on high curvature / rare chance
      let hue = 0;
      const roll = this.rnd();
      if (curv > 0.45 && roll < 0.28) hue = roll < 0.14 ? 1 : 2;
      else if (roll < 0.05) hue = roll < 0.025 ? 1 : 2;

      this.pushStroke({
        cx: px[i],
        cy: py[i],
        dx: tx,
        dy: ty,
        hlen,
        hwid,
        birth: now,
        life: life * (0.8 + this.rnd() * 0.4),
        hue,
        shimmer: this.rnd(),
        illum,
      });

      // pluck: melodic, throttled — denser & brighter where the edge moves
      if (now >= this.nextPluckAt && (sp > 0.12 || this.rnd() < 0.22)) {
        events.push({ x: px[i], y: py[i], speed: illum, hue });
        const gap = 0.055 + (1 - sp) * 0.16 + this.rnd() * 0.06;
        this.nextPluckAt = now + gap;
      }
    }

    this.prevRadii.set(this.radii);

    // cull dead strokes, cap the pool (drop oldest)
    const alive: Stroke[] = [];
    for (const s of this.strokes) {
      if ((now - s.birth) / s.life < 1) alive.push(s);
    }
    if (alive.length > MAX_STROKES) alive.splice(0, alive.length - MAX_STROKES);
    this.strokes = alive;
    return events;
  }

  private pushStroke(s: Stroke): void {
    this.strokes.push(s);
    if (this.strokes.length > MAX_STROKES) this.strokes.shift();
  }

  /** Fill the instance buffer for the GPU. Returns active instance count. */
  buildInstances(now: number): { data: Float32Array; count: number } {
    const inst = this.inst;
    let k = 0;
    for (const s of this.strokes) {
      const age = (now - s.birth) / s.life;
      if (age < 0 || age >= 1) continue;
      const o = k * STROKE_STRIDE;
      inst[o] = s.cx;
      inst[o + 1] = s.cy;
      inst[o + 2] = s.dx;
      inst[o + 3] = s.dy;
      inst[o + 4] = s.hlen;
      inst[o + 5] = s.hwid;
      inst[o + 6] = age;
      inst[o + 7] = s.hue;
      inst[o + 8] = s.shimmer;
      inst[o + 9] = s.illum;
      k++;
      if (k >= MAX_STROKES) break;
    }
    return { data: inst, count: k };
  }
}
