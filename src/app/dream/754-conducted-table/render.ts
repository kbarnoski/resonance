// render.ts — Canvas2D "conductor's score table" (deliberately Canvas2D; the lab
// is thin on it this window). BRIGHT, warm, top-down: a glowing parchment table,
// a semicircle of ensemble seats facing the conductor, animated arcs from the
// conductor to a seat when it plays, and a bloom at the seat.
//
// Pure drawing — no audio, no React. The page drives it each rAF frame with the
// current ensemble state.

export interface SeatView {
  /** Display name. */
  label: string;
  /** Voice register hint, for color. -1 (bass) .. +1 (treble). */
  register: number;
  /** True if this voice is IN the ensemble. */
  on: boolean;
  /** A remote player holds this seat. */
  remote: boolean;
  /** 0..1 bloom intensity, decays after each hit. */
  bloom: number;
  /** Phase 0..1 of a slow idle pulse so seats breathe even when silent. */
  pulse: number;
}

/** A travelling conductor→seat arc (a "cue"). */
export interface CueView {
  seat: number;
  /** 0..1 progress of the cue ripple. */
  prog: number;
  /** velocity 0..1 — controls thickness/brightness. */
  vel: number;
}

export interface TableState {
  seats: SeatView[];
  cues: CueView[];
  /** 0..1 master tempo (left slow → right fast). */
  tempo: number;
  /** 0..1 master dynamics (low soft → high loud). */
  dynamics: number;
  /** elapsed seconds (for slow ambient motion). */
  elapsed: number;
  /** harmonic center 0..1 — slowly migrates; tints the table warmth. */
  center: number;
  /** overall density 0..1 — breathes over minutes. */
  density: number;
}

interface SeatGeom {
  x: number;
  y: number;
  r: number;
}

/** Warm-to-bright HSL for a seat by register. */
function seatColor(register: number, l: number): string {
  // register -1 → amber/rose (bass); +1 → gold/cream (treble).
  const hue = 38 + register * 14; // ~24..52 — warm band
  const sat = 70;
  return `hsl(${hue} ${sat}% ${l}%)`;
}

export interface Renderer {
  /** Layout geometry for hit-testing seats from pointer coords. */
  seatGeom: SeatGeom[];
  conductor: { x: number; y: number };
  resize: (w: number, h: number, dpr: number) => void;
  draw: (state: TableState) => void;
  /** Hit-test a seat index from canvas (CSS px) coords, or -1. */
  hitSeat: (cx: number, cy: number) => number;
}

export function makeRenderer(
  ctx: CanvasRenderingContext2D,
  seatCount: number,
): Renderer {
  let W = 0;
  let H = 0;
  let DPR = 1;
  const seatGeom: SeatGeom[] = [];
  let conductor = { x: 0, y: 0 };

  function layout() {
    seatGeom.length = 0;
    const cx = W / 2;
    // Conductor sits near the bottom-center; seats arc above facing down.
    conductor = { x: cx, y: H * 0.84 };
    const radius = Math.min(W, H) * 0.46;
    const seatR = Math.max(26, Math.min(W, H) * 0.062);
    // Spread across the upper semicircle: angles from ~200° to ~340°.
    const a0 = Math.PI * 1.12;
    const a1 = Math.PI * 1.88;
    for (let i = 0; i < seatCount; i++) {
      const t = seatCount === 1 ? 0.5 : i / (seatCount - 1);
      const ang = a0 + (a1 - a0) * t;
      const x = conductor.x + Math.cos(ang) * radius;
      const y = conductor.y + Math.sin(ang) * radius;
      seatGeom.push({ x, y, r: seatR });
    }
  }

  function resize(w: number, h: number, dpr: number) {
    W = w;
    H = h;
    DPR = dpr;
    ctx.canvas.width = Math.floor(w * dpr);
    ctx.canvas.height = Math.floor(h * dpr);
    ctx.canvas.style.width = `${w}px`;
    ctx.canvas.style.height = `${h}px`;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    layout();
  }

  function drawBackground(s: TableState) {
    // Bright warm parchment table, subtly tinted by harmonic center.
    const hue = 36 + s.center * 18; // amber → gold migration
    const g = ctx.createRadialGradient(
      W / 2,
      H * 0.5,
      Math.min(W, H) * 0.1,
      W / 2,
      H * 0.5,
      Math.max(W, H) * 0.8,
    );
    g.addColorStop(0, `hsl(${hue} 78% 92%)`);
    g.addColorStop(0.6, `hsl(${hue} 64% 84%)`);
    g.addColorStop(1, `hsl(${hue + 6} 50% 72%)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // Faint concentric "score" rings around the conductor — breathing with density.
    ctx.save();
    ctx.lineWidth = 1.5;
    const rings = 5;
    for (let i = 1; i <= rings; i++) {
      const base = (Math.min(W, H) * 0.46) * (i / rings);
      const wobble = Math.sin(s.elapsed * 0.4 + i) * 4 * (0.4 + s.density);
      ctx.beginPath();
      ctx.strokeStyle = `hsla(${hue - 8} 45% 55% / ${0.1 + s.density * 0.08})`;
      ctx.arc(conductor.x, conductor.y, base + wobble, Math.PI * 1.05, Math.PI * 1.95);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawCue(c: CueView) {
    const seat = seatGeom[c.seat];
    if (!seat) return;
    const x = conductor.x + (seat.x - conductor.x) * c.prog;
    const y = conductor.y + (seat.y - conductor.y) * c.prog;
    // travelling arc line
    ctx.save();
    ctx.lineCap = "round";
    ctx.strokeStyle = `hsla(28 90% 52% / ${0.5 * (1 - c.prog) + 0.25})`;
    ctx.lineWidth = 2 + c.vel * 5;
    ctx.beginPath();
    ctx.moveTo(conductor.x, conductor.y);
    ctx.lineTo(x, y);
    ctx.stroke();
    // moving spark head
    const sparkR = 4 + c.vel * 8;
    const sg = ctx.createRadialGradient(x, y, 0, x, y, sparkR * 2);
    sg.addColorStop(0, "hsla(45 100% 96% / 0.95)");
    sg.addColorStop(1, "hsla(36 95% 60% / 0)");
    ctx.fillStyle = sg;
    ctx.beginPath();
    ctx.arc(x, y, sparkR * 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawSeat(view: SeatView, geom: SeatGeom) {
    const { x, y } = geom;
    const breathe = 1 + Math.sin(view.pulse * Math.PI * 2) * 0.04;
    const r = geom.r * breathe;

    // bloom ripple when active
    if (view.bloom > 0.01) {
      const br = r * (1 + view.bloom * 1.6);
      const bg = ctx.createRadialGradient(x, y, r * 0.5, x, y, br);
      bg.addColorStop(0, `hsla(45 100% 92% / ${0.6 * view.bloom})`);
      bg.addColorStop(1, "hsla(40 95% 70% / 0)");
      ctx.fillStyle = bg;
      ctx.beginPath();
      ctx.arc(x, y, br, 0, Math.PI * 2);
      ctx.fill();
    }

    // seat disc
    ctx.save();
    const lit = view.on;
    const baseL = lit ? 64 : 80;
    const grad = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.2, x, y, r);
    grad.addColorStop(0, seatColor(view.register, lit ? 80 : 86));
    grad.addColorStop(1, seatColor(view.register, baseL));
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();

    // ring — solid warm if ON, dashed muted grey if OFF
    ctx.lineWidth = lit ? 3.5 : 2;
    if (lit) {
      ctx.strokeStyle = view.remote ? "hsl(200 70% 45%)" : "hsl(24 85% 42%)";
      ctx.setLineDash([]);
    } else {
      ctx.strokeStyle = "hsl(30 12% 48%)";
      ctx.setLineDash([5, 6]);
    }
    ctx.beginPath();
    ctx.arc(x, y, r + 3, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // remote-player badge (cool dot, top-right)
    if (view.remote) {
      ctx.fillStyle = "hsl(200 80% 50%)";
      ctx.beginPath();
      ctx.arc(x + r * 0.7, y - r * 0.7, 6, 0, Math.PI * 2);
      ctx.fill();
    }

    // label — high contrast, legible
    ctx.fillStyle = lit ? "hsl(20 40% 18%)" : "hsl(25 12% 40%)";
    ctx.font = `600 ${Math.max(13, r * 0.34)}px ui-sans-serif, system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(view.label, x, y);

    // ON/OFF chip below
    ctx.font = `700 ${Math.max(10, r * 0.24)}px ui-sans-serif, system-ui, sans-serif`;
    ctx.fillStyle = lit ? "hsl(140 55% 30%)" : "hsl(0 45% 45%)";
    ctx.fillText(lit ? (view.remote ? "LIVE" : "IN") : "OUT", x, y + r * 0.62);
    ctx.restore();
  }

  function drawConductor(s: TableState) {
    const { x, y } = conductor;
    const pulse = 1 + Math.sin(s.elapsed * (1 + s.tempo * 3)) * 0.08 * (0.4 + s.dynamics);
    const r = (Math.min(W, H) * 0.05) * pulse;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r * 1.8);
    g.addColorStop(0, "hsl(45 100% 98%)");
    g.addColorStop(0.5, "hsl(36 95% 70%)");
    g.addColorStop(1, "hsla(30 90% 60% / 0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r * 1.8, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "hsl(28 70% 38%)";
    ctx.font = "700 13px ui-sans-serif, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("YOU · conductor", x, y + r * 1.9 + 8);
  }

  function draw(s: TableState) {
    if (W === 0 || H === 0) return;
    drawBackground(s);
    for (const c of s.cues) drawCue(c);
    for (let i = 0; i < s.seats.length; i++) {
      const g = seatGeom[i];
      if (g) drawSeat(s.seats[i], g);
    }
    drawConductor(s);
  }

  function hitSeat(cx: number, cy: number): number {
    for (let i = 0; i < seatGeom.length; i++) {
      const g = seatGeom[i];
      const dx = cx - g.x;
      const dy = cy - g.y;
      if (dx * dx + dy * dy <= (g.r + 6) * (g.r + 6)) return i;
    }
    return -1;
  }

  return { seatGeom, conductor, resize, draw, hitSeat };
}
