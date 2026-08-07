// huygens.ts — pure geometry for the Huygens / Wave-Field-Synthesis construction.
//
// A line array of secondary emitters sits along the top edge. A steerable
// virtual source S sets each emitter's emission timing tau_n = |S - P_n| / c.
// Every emitter throws expanding circular wavelets; the reconstructed
// wavefront is the common *tangent envelope* of all those wavelets, which —
// for these timings — is exactly a circle centred on S (see README for the
// derivation). When S sits far behind the array the envelope is a near-flat
// plane wave; pulled into the room with time-reversed timing it becomes a
// converging arc that collapses onto S (the focus).

export type TiltInput = { beta: number; gamma: number };

export type Wavelet = { x: number; y: number; r: number; age: number };
export type EnvArc = { cx: number; cy: number; r: number; lead: number };

export type FieldModel = {
  W: number;
  H: number;
  arrayY: number;
  emitters: { x: number; y: number }[];
  wavelets: Wavelet[];
  envelope: EnvArc[];
  source: { x: number; y: number; behind: boolean; onScreen: boolean };
  listener: { x: number; y: number };
  focus: number; // 0..1 focal-bloom intensity
  regime: "plane" | "converging" | "focus";
  // audio-facing scalars
  azimuth: number; // -1 left .. +1 right (source relative to listener)
  distance: number; // source->listener, normalised by room height
  present: number; // 0..1 closeness / presence
  launched: boolean; // a fresh wavefront left the array this frame
};

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (v: number, lo: number, hi: number) =>
  v < lo ? lo : v > hi ? hi : v;

const TAU = Math.PI * 2;

export class HuygensField {
  W = 1;
  H = 1;
  arrayY = 1;
  roomH = 1;
  emitters: { x: number; y: number }[] = [];
  listener = { x: 0, y: 0 };

  private readonly N = 40;
  private readonly T = 1.5; // seconds between wavefronts
  private lambda = 1; // wavelength (px) = c * T
  private c = 1; // wave speed (px/s)
  private maxWaveR = 1;

  // smoothed steer state (d in 0..1 depth, sx in 0..1 across width)
  private d = 0.15;
  private sx = 0.5;
  private seeded = false;

  private lastLaunch = -1;

  // deterministic drift constants (seed 0x7784)
  private readonly k: {
    dRate: number;
    dPhase: number;
    wobRate: number;
    wobPhase: number;
    sxRate: number;
    sxPhase: number;
    sx2Rate: number;
    sx2Phase: number;
  };

  constructor() {
    const r = mulberry32(0x7784);
    this.k = {
      dRate: 0.018 + r() * 0.006,
      dPhase: r() * TAU,
      wobRate: 0.08 + r() * 0.04,
      wobPhase: r() * TAU,
      sxRate: 0.012 + r() * 0.008,
      sxPhase: r() * TAU,
      sx2Rate: 0.033 + r() * 0.014,
      sx2Phase: r() * TAU,
    };
  }

  resize(W: number, H: number) {
    this.W = W;
    this.H = H;
    this.arrayY = Math.round(H * 0.16);
    this.roomH = H - this.arrayY;
    this.lambda = this.roomH / 3.4;
    this.c = this.lambda / this.T;
    this.maxWaveR = Math.hypot(W, this.roomH) * 1.05;
    const x0 = W * 0.06;
    const x1 = W * 0.94;
    this.emitters = [];
    for (let i = 0; i < this.N; i++) {
      const x = x0 + ((x1 - x0) * i) / (this.N - 1);
      this.emitters.push({ x, y: this.arrayY });
    }
    this.listener = { x: W * 0.5, y: this.arrayY + this.roomH * 0.92 };
  }

  private drift(t: number, reduced: boolean): { d: number; sx: number } {
    const s = reduced ? 0.5 : 1;
    const k = this.k;
    const d =
      0.5 -
      0.5 * Math.cos(TAU * k.dRate * t * s + k.dPhase) +
      0.05 * Math.sin(TAU * k.wobRate * t * s + k.wobPhase);
    const sx =
      0.5 +
      0.17 * Math.sin(TAU * k.sxRate * t * s + k.sxPhase) +
      0.07 * Math.sin(TAU * k.sx2Rate * t * s + k.sx2Phase);
    return { d: clamp(d, 0, 1), sx: clamp(sx, 0.1, 0.9) };
  }

  private tiltToSteer(inp: TiltInput): { d: number; sx: number } {
    const d = clamp(0.5 + (inp.beta - 45) / 110, 0, 1);
    const sx = clamp(0.5 + (inp.gamma / 70) * 0.5, 0.08, 0.92);
    return { d, sx };
  }

  step(
    tSec: number,
    input: TiltInput | null,
    reduced: boolean,
  ): FieldModel {
    const target = input ? this.tiltToSteer(input) : this.drift(tSec, reduced);
    if (!this.seeded) {
      this.d = target.d;
      this.sx = target.sx;
      this.seeded = true;
    }
    // drift is already smooth; tilt is jittery, so low-pass it
    const kf = input ? 0.08 : 1;
    this.d += (target.d - this.d) * kf;
    this.sx += (target.sx - this.sx) * kf;

    const { arrayY, roomH, c, T, lambda, maxWaveR, W, H } = this;

    // Virtual-source position from depth d (0 = far behind, 1 = focus on listener).
    let sy: number;
    let behind: boolean;
    if (this.d < 0.5) {
      const f = this.d / 0.5; // 0 far .. 1 just behind
      sy = arrayY - roomH * (7.5 * (1 - f) * (1 - f) + 0.04);
      behind = true;
    } else {
      const f = (this.d - 0.5) / 0.5; // 0 just in front .. 1 on listener
      sy = arrayY + roomH * (0.06 + f * 0.82);
      behind = false;
    }
    const sxp = this.sx * W;
    const S = { x: sxp, y: sy };

    // Per-emitter distances -> timing references.
    let dref = Infinity;
    let dmax = 0;
    const dist = new Array<number>(this.N);
    for (let i = 0; i < this.N; i++) {
      const e = this.emitters[i];
      const dd = Math.hypot(S.x - e.x, S.y - e.y);
      dist[i] = dd;
      if (dd < dref) dref = dd;
      if (dd > dmax) dmax = dd;
    }

    // Individual wavelets — newest three wavefronts per emitter.
    const wavelets: Wavelet[] = [];
    for (let i = 0; i < this.N; i++) {
      const tau = behind ? (dist[i] - dref) / c : (dmax - dist[i]) / c;
      const base = tSec - tau;
      if (base <= 0) continue;
      const jMax = Math.floor(base / T);
      for (let a = 0; a < 3; a++) {
        const j = jMax - a;
        if (j < 0) break;
        const r = c * (base - j * T);
        if (r <= 0 || r > maxWaveR) continue;
        wavelets.push({ x: this.emitters[i].x, y: arrayY, r, age: a });
      }
    }

    // Analytic envelope — concentric circles centred on S.
    const envelope: EnvArc[] = [];
    const rLo = arrayY - sy - 4; // circle must reach into the room
    const rHi = H - sy + W * 0.6;
    let focus = 0;
    if (behind) {
      const rho = c * tSec + dref; // leading envelope radius
      const jStart = Math.max(0, Math.floor((rho - rHi) / lambda));
      for (let j = jStart; j < jStart + 8; j++) {
        const r = rho - j * lambda;
        if (r < rLo) break;
        if (r > rHi) continue;
        const lead = clamp(1 - j * 0.28, 0.18, 1);
        envelope.push({ cx: S.x, cy: sy, r, lead });
      }
    } else {
      // converging: R_j = (dmax - c*t) + j*lambda, keep positive ones in room
      let rmin = Infinity;
      for (let j = 0; j < 12; j++) {
        const r = dmax - c * tSec + j * lambda;
        if (r <= 0) continue;
        if (r > rHi) break;
        if (r < rmin) rmin = r;
        const lead = clamp(1 - j * 0.26, 0.16, 1);
        envelope.push({ cx: S.x, cy: sy, r, lead });
      }
      if (rmin < Infinity && sy > arrayY && sy < H) {
        focus = clamp(1 - rmin / (lambda * 0.4), 0, 1);
      }
    }

    // Regime label.
    let regime: FieldModel["regime"];
    if (behind && this.d < 0.34) regime = "plane";
    else if (focus > 0.5) regime = "focus";
    else regime = "converging";

    // Wavefront-launch event (once per period).
    const launchIdx = Math.floor(tSec / T);
    const launched = launchIdx !== this.lastLaunch;
    this.lastLaunch = launchIdx;

    // Audio geometry relative to the listener.
    const azimuth = clamp((S.x - this.listener.x) / (W * 0.5), -1, 1);
    const distNorm =
      Math.hypot(S.x - this.listener.x, S.y - this.listener.y) / roomH;
    const present = clamp(1 - distNorm / 1.3, 0, 1) * 0.7 + focus * 0.6;

    return {
      W,
      H,
      arrayY,
      emitters: this.emitters,
      wavelets,
      envelope,
      source: {
        x: S.x,
        y: sy,
        behind,
        onScreen: sy > 0 && sy < H,
      },
      listener: this.listener,
      focus,
      regime,
      azimuth,
      distance: distNorm,
      present: clamp(present, 0, 1),
      launched,
    };
  }
}

// ── Drawing ──────────────────────────────────────────────────────────────
// The picture is drawn with strokes/arcs only (Canvas2D vector geometry),
// with additive blending for the luminous, cosmic look.

const VIOLET = "139,92,246"; // wavelets
const VIOLET_HI = "167,139,250"; // envelope
const VIOLET_LT = "196,181,253"; // emitters / markers
const BLOOM = "237,233,254"; // focal bloom

export function drawField(
  ctx: CanvasRenderingContext2D,
  m: FieldModel,
) {
  const { W, H, arrayY } = m;

  // Deep space background.
  const bg = ctx.createRadialGradient(
    W * 0.5,
    arrayY,
    0,
    W * 0.5,
    arrayY,
    Math.hypot(W, H) * 0.8,
  );
  bg.addColorStop(0, "#0b0a14");
  bg.addColorStop(1, "#050509");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Field (wavelets + envelope) — additive, clipped to the listening room.
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, arrayY, W, H - arrayY);
  ctx.clip();
  ctx.globalCompositeOperation = "lighter";

  // Secondary wavelets.
  ctx.lineWidth = 1;
  for (const w of m.wavelets) {
    const a = 0.14 * (1 - w.age * 0.28);
    ctx.strokeStyle = `rgba(${VIOLET},${a})`;
    ctx.beginPath();
    ctx.arc(w.x, w.y, w.r, 0, TAU);
    ctx.stroke();
  }

  // The reconstructed wavefront — the bright envelope.
  ctx.shadowColor = `rgba(${VIOLET_HI},0.9)`;
  for (const e of m.envelope) {
    ctx.lineWidth = 1.2 + 1.6 * e.lead;
    ctx.shadowBlur = 22 * e.lead;
    ctx.strokeStyle = `rgba(${VIOLET_HI},${0.85 * e.lead})`;
    ctx.beginPath();
    ctx.arc(e.cx, e.cy, e.r, 0, TAU);
    ctx.stroke();
  }
  ctx.shadowBlur = 0;

  // Focal bloom where the wavelets meet in phase.
  if (m.focus > 0.01 && m.source.onScreen) {
    const R = 14 + 46 * m.focus;
    const g = ctx.createRadialGradient(
      m.source.x,
      m.source.y,
      0,
      m.source.x,
      m.source.y,
      R,
    );
    g.addColorStop(0, `rgba(${BLOOM},${0.9 * m.focus})`);
    g.addColorStop(0.4, `rgba(${VIOLET_HI},${0.5 * m.focus})`);
    g.addColorStop(1, `rgba(${VIOLET},0)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(m.source.x, m.source.y, R, 0, TAU);
    ctx.fill();
  }
  ctx.restore();

  // ── Chrome geometry (opaque, over the field) ──────────────────────────
  // Array line.
  ctx.strokeStyle = `rgba(${VIOLET_HI},0.22)`;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(m.emitters[0].x, arrayY);
  ctx.lineTo(m.emitters[m.emitters.length - 1].x, arrayY);
  ctx.stroke();

  // Emitter dots.
  ctx.fillStyle = `rgba(${VIOLET_LT},0.85)`;
  for (const e of m.emitters) {
    ctx.beginPath();
    ctx.arc(e.x, arrayY, 1.7, 0, TAU);
    ctx.fill();
  }

  // Steering axis: virtual source -> listener.
  ctx.strokeStyle = `rgba(${VIOLET_HI},0.18)`;
  ctx.setLineDash([2, 6]);
  ctx.beginPath();
  ctx.moveTo(m.source.x, clamp(m.source.y, 6, H - 6));
  ctx.lineTo(m.listener.x, m.listener.y);
  ctx.stroke();
  ctx.setLineDash([]);

  // Virtual source marker.
  {
    const my = clamp(m.source.y, 8, H - 8);
    ctx.strokeStyle = `rgba(${VIOLET_LT},0.8)`;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(m.source.x, my, 5, 0, TAU);
    ctx.stroke();
    if (m.source.y < 8) {
      // source is above the frame — chevron hint
      ctx.beginPath();
      ctx.moveTo(m.source.x - 5, 14);
      ctx.lineTo(m.source.x, 8);
      ctx.lineTo(m.source.x + 5, 14);
      ctx.stroke();
    }
  }

  // Listener marker.
  ctx.fillStyle = `rgba(${VIOLET_LT},0.85)`;
  ctx.beginPath();
  ctx.arc(m.listener.x, m.listener.y, 3, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = `rgba(${VIOLET_LT},0.35)`;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(m.listener.x, m.listener.y, 8, 0, TAU);
  ctx.stroke();
}
