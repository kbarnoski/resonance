"use client";
import { useEffect, useRef } from "react";
import Link from "next/link";

// **For**: kids (4+)
// Three glowing caterpillars crawl across the dark canvas.
// Each body segment = one pentatonic note. Head = C4 (small/bright). Tail = C3 (big/deep).
// Tap any segment to ring it. Auto-beats play after first tap.

/* ── pentatonic notes: head=highest, tail=lowest (BANDIMAL rule) ── */
const SEG_FREQS = [261.63, 220.00, 196.00, 164.81, 130.81]; // C4 A3 G3 E3 C3
const SEG_HUES  = [195,    270,    160,    42,     345];     // cyan violet teal amber rose
const N_SEGS    = 5;
const SEG_LEN   = 30;                                        // CSS px between segment centers
const SEG_RADS  = [19, 22, 25, 28, 31];                     // CSS px radius — tail bigger

const WORM_HUES  = [270, 175,  38]; // violet teal amber
const WORM_PANS  = [-0.52, 0, 0.52];
const WORM_YFRAC = [0.28, 0.50, 0.72]; // relative Y position
const WORM_SPDS  = [0.70, 0.55, 0.85]; // CSS px/frame at ~60fps
const WORM_BEATS = [2400, 2900, 2100]; // auto-beat interval (ms)

type Seg = { x: number; y: number; flash: number };
type Worm = {
  segs:         Seg[];
  headingPhase: number;
  yFrac:        number;
  spd:          number;
  pan:          number;
  hue:          number;
  beatMs:       number;
  lastBeat:     number;
};
type St = { actx: AudioContext | null; worms: Worm[]; awake: boolean; lastTs: number };

// ── Build three worms at initial positions ───────────────────────────────────
function buildWorms(W: number, H: number): Worm[] {
  return Array.from({ length: 3 }, (_, i) => {
    const baseY  = H * WORM_YFRAC[i];
    const startX = -(SEG_LEN * (N_SEGS + 4) + i * W * 0.30);
    return {
      segs: Array.from({ length: N_SEGS }, (_, s) => ({
        x: startX - s * SEG_LEN,
        y: baseY,
        flash: 0,
      })),
      headingPhase: i * 2.09,
      yFrac:   WORM_YFRAC[i],
      spd:     WORM_SPDS[i],
      pan:     WORM_PANS[i],
      hue:     WORM_HUES[i],
      beatMs:  WORM_BEATS[i],
      lastBeat: -(i * 800),            // stagger initial beats
    };
  });
}

// ── Advance worm physics one frame ───────────────────────────────────────────
function advanceWorm(w: Worm, W: number, H: number, dtMs: number): void {
  const dtFr = dtMs / 16.67;
  w.headingPhase += 0.020 * dtFr;

  const head = w.segs[0];
  head.x += w.spd * dtFr;
  head.y  = H * w.yFrac + Math.sin(w.headingPhase) * H * 0.11;

  // Wrap head when fully past right edge
  if (head.x > W + SEG_LEN * (N_SEGS + 3)) {
    head.x = -(SEG_LEN * (N_SEGS + 3));
    head.y = H * w.yFrac;
    w.headingPhase = 0;
    for (let s = 1; s < N_SEGS; s++) {
      w.segs[s].x = head.x - s * SEG_LEN;
      w.segs[s].y = head.y;
    }
  }

  // Chain: each segment follows the one ahead
  for (let s = 1; s < N_SEGS; s++) {
    const prev = w.segs[s - 1];
    const cur  = w.segs[s];
    const dx   = cur.x - prev.x;
    const dy   = cur.y - prev.y;
    const dist = Math.hypot(dx, dy);
    if (dist > SEG_LEN) {
      cur.x = prev.x + (dx / dist) * SEG_LEN;
      cur.y = prev.y + (dy / dist) * SEG_LEN;
    }
  }

  for (const seg of w.segs) {
    if (seg.flash > 0) seg.flash = Math.max(0, seg.flash - dtMs / 450);
  }
}

// ── Draw one worm onto the canvas ────────────────────────────────────────────
function paintWorm(ctx: CanvasRenderingContext2D, w: Worm, dpr: number): void {
  const segs  = w.segs;
  let maxFl = 0;
  for (const s of segs) if (s.flash > maxFl) maxFl = s.flash;

  // Smooth body tube
  ctx.save();
  ctx.lineCap     = "round";
  ctx.lineJoin    = "round";
  ctx.lineWidth   = SEG_RADS[2] * 2.1 * dpr;
  ctx.shadowColor = `hsl(${w.hue},80%,65%)`;
  ctx.shadowBlur  = (8 + maxFl * 10) * dpr;
  ctx.strokeStyle = `hsl(${w.hue},65%,26%)`;
  ctx.beginPath();
  ctx.moveTo(segs[0].x * dpr, segs[0].y * dpr);
  for (let s = 1; s < N_SEGS; s++) ctx.lineTo(segs[s].x * dpr, segs[s].y * dpr);
  ctx.stroke();
  ctx.restore();

  // Glowing segment bumps
  for (let s = 0; s < N_SEGS; s++) {
    const seg = segs[s];
    const r   = SEG_RADS[s] * dpr;
    const fl  = seg.flash;
    const lit = 52 - s * 4;

    ctx.save();
    ctx.shadowColor = `hsl(${SEG_HUES[s]},95%,72%)`;
    ctx.shadowBlur  = (14 + fl * 22) * dpr;
    ctx.fillStyle   = `hsl(${SEG_HUES[s]},88%,${lit + fl * 20}%)`;
    ctx.beginPath();
    ctx.arc(seg.x * dpr, seg.y * dpr, r, 0, Math.PI * 2);
    ctx.fill();
    if (fl > 0.08) {
      ctx.fillStyle = `rgba(255,255,255,${fl * 0.48})`;
      ctx.beginPath();
      ctx.arc(seg.x * dpr, seg.y * dpr, r * 0.35, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // Eyes on head segment
  const head  = segs[0];
  const next  = segs[1];
  const ang   = Math.atan2(head.y - next.y, head.x - next.x);
  const eyeR  = SEG_RADS[0] * 0.30 * dpr;
  const eyeD  = SEG_RADS[0] * 0.42 * dpr;
  const px    = Math.cos(ang + Math.PI / 2);
  const py    = Math.sin(ang + Math.PI / 2);
  const hx    = head.x * dpr;
  const hy    = head.y * dpr;

  ctx.save();
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.beginPath();
  ctx.arc(hx + px * eyeD, hy + py * eyeD, eyeR,       0, Math.PI * 2);
  ctx.arc(hx - px * eyeD, hy - py * eyeD, eyeR,       0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(0,0,0,0.88)";
  ctx.beginPath();
  ctx.arc(hx + px * eyeD, hy + py * eyeD, eyeR * 0.5, 0, Math.PI * 2);
  ctx.arc(hx - px * eyeD, hy - py * eyeD, eyeR * 0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// ── Triangle-wave note with stereo pan ───────────────────────────────────────
function ringNote(actx: AudioContext, freq: number, panVal: number): void {
  const now = actx.currentTime;
  const osc = actx.createOscillator();
  const env = actx.createGain();
  const pan = actx.createStereoPanner();
  osc.type = "triangle";
  osc.frequency.value = freq;
  env.gain.setValueAtTime(0.001, now);
  env.gain.linearRampToValueAtTime(0.30, now + 0.018);
  env.gain.exponentialRampToValueAtTime(0.001, now + 1.5);
  pan.pan.value = panVal;
  osc.connect(env);
  env.connect(pan);
  pan.connect(actx.destination);
  osc.start(now);
  osc.stop(now + 1.6);
}

// ────────────────────────────────────────────────────────────────────────────
export default function GlowWorm() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stRef = useRef<St>({ actx: null, worms: [], awake: false, lastTs: 0 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const st = stRef.current;

    // ── Audio init (first tap) ───────────────────────────────────────────
    function initAudio() {
      if (st.actx) return;
      const actx = new AudioContext();
      st.actx = actx;
      // Soft ambient pad C2 + G2
      for (const freq of [65.41, 98.00]) {
        const osc = actx.createOscillator();
        const g   = actx.createGain();
        osc.type = "sine";
        osc.frequency.value = freq;
        g.gain.value = 0.007;
        osc.connect(g).connect(actx.destination);
        osc.start();
      }
    }

    // ── Canvas resize ────────────────────────────────────────────────────
    function resize() {
      if (!canvas) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 3);
      canvas.width  = canvas.offsetWidth  * dpr;
      canvas.height = canvas.offsetHeight * dpr;
      const W = canvas.offsetWidth;
      const H = canvas.offsetHeight;
      st.worms = buildWorms(W, H);
    }
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    // ── Pointer handler ──────────────────────────────────────────────────
    function onPointerDown(e: PointerEvent) {
      if (!canvas) return;
      initAudio();
      st.awake = true;

      const rect = canvas.getBoundingClientRect();
      const tapX = e.clientX - rect.left;
      const tapY = e.clientY - rect.top;

      // Find nearest segment (50 CSS px tolerance)
      let bestDist = 50;
      let bestWorm: Worm | null = null;
      let bestSeg  = 0;

      for (const w of st.worms) {
        for (let s = 0; s < N_SEGS; s++) {
          const d = Math.hypot(w.segs[s].x - tapX, w.segs[s].y - tapY);
          if (d < bestDist) { bestDist = d; bestWorm = w; bestSeg = s; }
        }
      }

      if (bestWorm && st.actx) {
        bestWorm.segs[bestSeg].flash = 1.0;
        ringNote(st.actx, SEG_FREQS[bestSeg], bestWorm.pan);
      }
    }

    canvas.addEventListener("pointerdown", onPointerDown);

    // ── Animation loop ───────────────────────────────────────────────────
    let rafId = 0;

    const animate = (ts: number) => {
      rafId = requestAnimationFrame(animate);
      if (!canvas) return;
      const W = canvas.offsetWidth;
      const H = canvas.offsetHeight;
      if (W === 0 || H === 0) return;
      const dpr  = canvas.width / W;
      const dtMs = Math.min(ts - st.lastTs, 50);
      st.lastTs  = ts;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Advance worm physics
      for (const w of st.worms) advanceWorm(w, W, H, dtMs);

      // Auto-beats (visual flash + optional audio)
      for (const w of st.worms) {
        if (ts - w.lastBeat > w.beatMs * 2) w.lastBeat = ts - w.beatMs;
        if (ts - w.lastBeat >= w.beatMs) {
          w.segs[0].flash = st.awake ? 1.0 : 0.55;
          if (st.actx) ringNote(st.actx, SEG_FREQS[0], w.pan);
          w.lastBeat = ts;
        }
      }

      // Paint worms
      for (const w of st.worms) paintWorm(ctx, w, dpr);

      // Pre-start hint
      if (!st.awake) {
        ctx.save();
        ctx.fillStyle    = "rgba(255,255,255,0.52)";
        ctx.font         = `${Math.round(16 * dpr)}px sans-serif`;
        ctx.textAlign    = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("tap a worm  🐛", canvas.width / 2, canvas.height * 0.88);
        ctx.restore();
      }
    }

    rafId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(rafId);
      ro.disconnect();
      canvas.removeEventListener("pointerdown", onPointerDown);
      st.actx?.close().catch(() => undefined);
    };
  }, []);

  return (
    <div className="flex flex-col items-center min-h-screen bg-black text-white select-none">
      <div className="w-full max-w-lg px-4 pt-6 pb-8 flex flex-col items-center gap-4">
        <div className="text-center">
          <h1 className="text-2xl font-mono font-bold">Glow Worms</h1>
          <p className="text-white/75 text-base mt-1">
            Tap any worm to ring its note — head is high, tail is low
          </p>
        </div>

        <canvas
          ref={canvasRef}
          className="w-full aspect-[4/3] rounded-xl touch-none"
        />

        <Link
          href="/dream"
          className="text-white/40 text-sm hover:text-white/60 transition mt-1"
        >
          ← dream lab
        </Link>
      </div>
    </div>
  );
}
