"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

// ── 6-band palette (same hues as 1-live) ──────────────────────────────────

const BANDS = [
  { lo: 20,   hi: 60,    r: 124, g: 58,  b: 237, label: "sub-bass" },
  { lo: 60,   hi: 250,   r: 6,   g: 182, b: 212, label: "bass"     },
  { lo: 250,  hi: 500,   r: 34,  g: 197, b: 94,  label: "low-mid"  },
  { lo: 500,  hi: 2000,  r: 234, g: 179, b: 8,   label: "mid"      },
  { lo: 2000, hi: 4000,  r: 249, g: 115, b: 22,  label: "high-mid" },
  { lo: 4000, hi: 20000, r: 244, g: 63,  b: 94,  label: "high"     },
] as const;

// ── skeleton: [normalizedX, normalizedY, primaryBand] ────────────────────
// Positions multiplied by FH (figure height), offset from figure center

const JDEF: [number, number, number][] = [
  [ 0.000, -0.435, 5],  //  0  head      → high   (head nod)
  [-0.175, -0.295, 1],  //  1  lShoulder → bass   (chest bounce)
  [+0.175, -0.295, 1],  //  2  rShoulder → bass
  [-0.245, -0.110, 3],  //  3  lElbow    → mid    (arm swing)
  [+0.245, -0.110, 3],  //  4  rElbow    → mid
  [-0.215, +0.115, 4],  //  5  lHand     → hi-mid (wrist flutter)
  [+0.215, +0.115, 4],  //  6  rHand     → hi-mid
  [ 0.000,  0.000, 2],  //  7  hips      → lo-mid (body sway)
  [-0.120, +0.225, 0],  //  8  lKnee     → sub    (bounce)
  [+0.120, +0.225, 0],  //  9  rKnee     → sub
  [-0.140, +0.470, 0],  // 10  lFoot     → sub
  [+0.140, +0.470, 0],  // 11  rFoot     → sub
];

const BONES: [number, number][] = [
  [0, 1], [0, 2],    // head → shoulders
  [1, 2],            // shoulder beam
  [1, 3], [2, 4],    // shoulders → elbows
  [3, 5], [4, 6],    // elbows → hands
  [1, 7], [2, 7],    // spine sides
  [7, 8], [7, 9],    // hips → knees
  [8, 10], [9, 11],  // knees → feet
];

// LFO demo frequencies (incommensurable Hz, one per band)
const LFO_HZ = [0.31, 0.47, 0.63, 0.79, 0.97, 1.13];

// ── helpers ───────────────────────────────────────────────────────────────

function extractBands(fft: Uint8Array<ArrayBuffer>, sampleRate: number): number[] {
  const binHz = sampleRate / (fft.length * 2);
  return BANDS.map(({ lo, hi }) => {
    const a = Math.max(0, Math.floor(lo / binHz));
    const b = Math.min(fft.length - 1, Math.ceil(hi / binHz));
    if (b <= a) return 0;
    let s = 0;
    for (let k = a; k <= b; k++) s += fft[k] ?? 0;
    return s / ((b - a + 1) * 255);
  });
}

function audioOffset(
  i: number, fh: number, e: number[], t: number
): [number, number] {
  let dx = 0, dy = 0;
  const e0 = e[0] ?? 0, e1 = e[1] ?? 0, e2 = e[2] ?? 0;
  const e3 = e[3] ?? 0, e4 = e[4] ?? 0, e5 = e[5] ?? 0;
  switch (i) {
    case 0: // head: treble nod + mid sway
      dy += e5 * fh * 0.09;
      dx += e3 * fh * 0.05 * Math.sin(t * 1.1);
      break;
    case 1: case 2: { // shoulders: bass bounce + low-mid sway
      const s = i === 1 ? -1 : 1;
      dy -= e1 * fh * 0.08;
      dx += s * e2 * fh * 0.04 * Math.sin(t * 0.9);
      break;
    }
    case 3: case 4: { // elbows: mid arm swing (counter-phase)
      const s  = i === 3 ? -1 : 1;
      const ph = i === 3 ? 0 : Math.PI;
      dx += s * e3 * fh * 0.13 * Math.sin(t * 0.7 + ph);
      dy -= e1 * fh * 0.05;
      break;
    }
    case 5: case 6: { // hands: arm swing + high-mid flutter
      const s  = i === 5 ? -1 : 1;
      const ph = i === 5 ? 0 : Math.PI;
      const fp = i === 5 ? 1 : -1.3;
      dx += s * e3 * fh * 0.16 * Math.sin(t * 0.7 + ph);
      dy += e4 * fh * 0.08 * Math.sin(t * 3.7 * fp);
      dy -= e1 * fh * 0.04;
      break;
    }
    case 7: // hips: low-mid sway + sub-bass sink
      dx += e2 * fh * 0.09 * Math.sin(t * 0.9);
      dy += e0 * fh * 0.07;
      break;
    case 8: case 9: { // knees: bounce + sway
      const s = i === 8 ? -1 : 1;
      dy += e0 * fh * 0.12;
      dx += s * e2 * fh * 0.05 * Math.sin(t * 0.9);
      break;
    }
    case 10: case 11: { // feet: stomp + sway
      const s = i === 10 ? -1 : 1;
      dy += e0 * fh * 0.16;
      dx += s * e2 * fh * 0.04 * Math.sin(t * 0.9);
      break;
    }
  }
  return [dx, dy];
}

type Jt = { x: number; y: number; vx: number; vy: number };

function spawnJoints(cx: number, cy: number, fh: number): Jt[] {
  return JDEF.map(([nx, ny]) => ({ x: cx + nx * fh, y: cy + ny * fh, vx: 0, vy: 0 }));
}

type AvSt = {
  actx:     AudioContext | null;
  analyser: AnalyserNode | null;
  fftBuf:   Uint8Array<ArrayBuffer>;
  joints:   Jt[];
  cx: number; cy: number; fh: number;
  ema:      number[];
  t:        number;
  lastMs:   number;
};

function freshSt(W: number, H: number): AvSt {
  const fh = Math.min(W, H) * 0.72;
  const cx = W / 2;
  const cy = H * 0.47;
  return {
    actx: null, analyser: null,
    fftBuf: new Uint8Array(0) as Uint8Array<ArrayBuffer>,
    joints: spawnJoints(cx, cy, fh),
    cx, cy, fh,
    ema: [0, 0, 0, 0, 0, 0],
    t: 0, lastMs: 0,
  };
}

function paintFrame(
  ctx: CanvasRenderingContext2D, W: number, H: number, st: AvSt
) {
  // background
  ctx.fillStyle = "#08080e";
  ctx.fillRect(0, 0, W, H);

  ctx.save();
  ctx.globalCompositeOperation = "screen";

  // bones
  for (const [a, b] of BONES) {
    const jA = st.joints[a];
    const jB = st.joints[b];
    if (!jA || !jB) continue;
    const bA = JDEF[a]?.[2] ?? 0;
    const bB = JDEF[b]?.[2] ?? 0;
    const eA = st.ema[bA] ?? 0;
    const eB = st.ema[bB] ?? 0;
    const cA = BANDS[bA];
    const cB = BANDS[bB];
    if (!cA || !cB) continue;

    const grd = ctx.createLinearGradient(jA.x, jA.y, jB.x, jB.y);
    grd.addColorStop(0, `rgba(${cA.r},${cA.g},${cA.b},${(0.28 + eA * 0.62).toFixed(2)})`);
    grd.addColorStop(1, `rgba(${cB.r},${cB.g},${cB.b},${(0.28 + eB * 0.62).toFixed(2)})`);

    ctx.beginPath();
    ctx.moveTo(jA.x, jA.y);
    ctx.lineTo(jB.x, jB.y);
    ctx.strokeStyle = grd;
    ctx.lineWidth   = 2 + (eA + eB) * 2.5;
    ctx.lineCap     = "round";
    ctx.stroke();
  }

  // joints (radial glow + core)
  for (let i = 0; i < st.joints.length; i++) {
    const j = st.joints[i];
    if (!j) continue;
    const bi  = JDEF[i]?.[2] ?? 0;
    const e   = st.ema[bi] ?? 0;
    const c   = BANDS[bi];
    if (!c) continue;
    const isHead = i === 0;
    const coreR  = (isHead ? 13 : 6) + e * 5;
    const glowR  = coreR * 2.8;

    const g = ctx.createRadialGradient(j.x, j.y, 0, j.x, j.y, glowR);
    g.addColorStop(0,    `rgba(${c.r},${c.g},${c.b},${(0.50 + e * 0.40).toFixed(2)})`);
    g.addColorStop(0.40, `rgba(${c.r},${c.g},${c.b},${(0.15 + e * 0.12).toFixed(2)})`);
    g.addColorStop(1,    `rgba(${c.r},${c.g},${c.b},0)`);

    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(j.x, j.y, glowR, 0, Math.PI * 2);
    ctx.fill();
  }

  // head ring
  const head = st.joints[0];
  if (head) {
    const e  = st.ema[5] ?? 0;
    const hc = BANDS[5];
    if (hc) {
      ctx.strokeStyle = `rgba(${hc.r},${hc.g},${hc.b},${(0.40 + e * 0.50).toFixed(2)})`;
      ctx.lineWidth   = 1.5;
      ctx.beginPath();
      ctx.arc(head.x, head.y, 18 + e * 6, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  ctx.restore();

  // band energy bars — bottom right
  const barW = 5, gap = 2, barMaxH = 42;
  const ox = W - (barW + gap) * 6 - 10;
  const oy = H - 16 - barMaxH;
  for (let i = 0; i < 6; i++) {
    const e = st.ema[i] ?? 0;
    const c = BANDS[i];
    if (!c) continue;
    ctx.fillStyle = `rgba(${c.r},${c.g},${c.b},0.14)`;
    ctx.fillRect(ox + i * (barW + gap), oy, barW, barMaxH);
    const bh = barMaxH * e;
    ctx.fillStyle = `rgba(${c.r},${c.g},${c.b},0.72)`;
    ctx.fillRect(ox + i * (barW + gap), oy + barMaxH - bh, barW, bh);
  }
}

// ── component ─────────────────────────────────────────────────────────────

export default function DanceAvatarPage() {
  const cvRef  = useRef<HTMLCanvasElement>(null);
  const stRef  = useRef<AvSt | null>(null);
  const rafRef = useRef(0);
  const [micActive, setMicActive] = useState(false);
  const [micErr,    setMicErr]    = useState("");

  useEffect(() => {
    const cv = cvRef.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const W   = cv.offsetWidth;
      const H   = cv.offsetHeight;
      cv.width  = W * dpr;
      cv.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const st = stRef.current;
      if (st) {
        st.fh     = Math.min(W, H) * 0.72;
        st.cx     = W / 2;
        st.cy     = H * 0.47;
        st.joints = spawnJoints(st.cx, st.cy, st.fh);
      }
    };

    const W = cv.offsetWidth;
    const H = cv.offsetHeight;
    stRef.current = freshSt(W, H);
    resize();
    window.addEventListener("resize", resize);

    const frame = (ms: number) => {
      rafRef.current = requestAnimationFrame(frame);
      const st = stRef.current;
      if (!st) return;
      const cW = cv.offsetWidth;
      const cH = cv.offsetHeight;

      const dt = Math.min(st.lastMs > 0 ? (ms - st.lastMs) / 1000 : 0.0167, 0.05);
      st.lastMs  = ms;
      st.t      += dt;

      // compute raw band energies
      let raw: number[];
      if (st.analyser && st.fftBuf.length > 0) {
        st.analyser.getByteFrequencyData(st.fftBuf);
        raw = extractBands(st.fftBuf, st.actx?.sampleRate ?? 44100);
      } else {
        raw = LFO_HZ.map((hz) => 0.30 + 0.65 * Math.abs(Math.sin(st.t * hz * Math.PI * 2)));
      }

      // EMA smooth (τ ≈ 0.08 s)
      const alpha = 1 - Math.pow(0.01, dt / 0.08);
      for (let i = 0; i < 6; i++) {
        st.ema[i] = (st.ema[i] ?? 0) * (1 - alpha) + (raw[i] ?? 0) * alpha;
      }

      // spring physics
      const K = 140, D = 10;
      for (let i = 0; i < st.joints.length; i++) {
        const j = st.joints[i];
        if (!j) continue;
        const nx = JDEF[i]?.[0] ?? 0;
        const ny = JDEF[i]?.[1] ?? 0;
        const bx = st.cx + nx * st.fh;
        const by = st.cy + ny * st.fh;
        const [odx, ody] = audioOffset(i, st.fh, st.ema, st.t);
        const tx = bx + odx;
        const ty = by + ody;
        j.vx += ((tx - j.x) * K - j.vx * D) * dt;
        j.vy += ((ty - j.y) * K - j.vy * D) * dt;
        j.x  += j.vx * dt;
        j.y  += j.vy * dt;
      }

      paintFrame(ctx, cW, cH, st);
    };

    rafRef.current = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
      const st = stRef.current;
      if (st?.actx) void st.actx.close();
    };
  }, []);

  const enableMic = async () => {
    setMicErr("");
    try {
      const actx     = new AudioContext();
      const stream   = await navigator.mediaDevices.getUserMedia({ audio: true });
      const src      = actx.createMediaStreamSource(stream);
      const analyser = actx.createAnalyser();
      analyser.fftSize = 2048;
      src.connect(analyser);
      const fftBuf = new Uint8Array(analyser.frequencyBinCount) as Uint8Array<ArrayBuffer>;
      const st = stRef.current;
      if (st) {
        st.actx     = actx;
        st.analyser = analyser;
        st.fftBuf   = fftBuf;
      }
      setMicActive(true);
    } catch {
      setMicErr("Microphone access denied.");
    }
  };

  const stopMic = () => {
    const st = stRef.current;
    if (!st) return;
    if (st.actx) void st.actx.close();
    st.actx     = null;
    st.analyser = null;
    st.fftBuf   = new Uint8Array(0) as Uint8Array<ArrayBuffer>;
    setMicActive(false);
    setMicErr("");
  };

  return (
    <div className="relative w-full h-screen bg-[#08080e] overflow-hidden">
      <canvas ref={cvRef} className="absolute inset-0 w-full h-full touch-none" />

      {/* header */}
      <div className="absolute top-0 left-0 p-5 pointer-events-none select-none">
        <h1 className="text-2xl font-semibold text-white/95 tracking-tight leading-tight">
          Dance Avatar
        </h1>
        <p className="text-base text-white/75 mt-1 max-w-[280px] leading-snug">
          Spring-physics skeleton — each limb driven by its own frequency band.
        </p>
      </div>

      {/* controls */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-3">
        {micActive ? (
          <button
            onClick={stopMic}
            className="px-5 py-2.5 rounded-full text-base font-medium min-h-[44px] bg-rose-500/20 text-rose-300 ring-1 ring-rose-400/40 hover:bg-rose-500/30 transition-all"
          >
            ■ Stop Mic
          </button>
        ) : (
          <button
            onClick={enableMic}
            className="px-5 py-2.5 rounded-full text-base font-medium min-h-[44px] bg-violet-500/20 text-violet-200 ring-1 ring-violet-400/40 hover:bg-violet-500/35 transition-all"
          >
            ● Enable Mic
          </button>
        )}
      </div>

      {/* mic mode indicator */}
      {micActive && (
        <div className="absolute top-5 right-5 flex items-center gap-2 pointer-events-none">
          <span className="w-2 h-2 rounded-full bg-rose-400 animate-pulse" />
          <span className="text-sm text-rose-300/90">mic live</span>
        </div>
      )}

      {/* mic error */}
      {micErr && (
        <p className="absolute bottom-20 left-1/2 -translate-x-1/2 text-base text-rose-300 whitespace-nowrap">
          {micErr}
        </p>
      )}

      {/* band legend */}
      <div className="absolute bottom-6 right-5 flex flex-col gap-1 items-end pointer-events-none select-none">
        {BANDS.map((bd, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <span className="text-xs text-white/55">{bd.label}</span>
            <span
              className="w-2 h-2 rounded-full"
              style={{ background: `rgb(${bd.r},${bd.g},${bd.b})` }}
            />
          </div>
        ))}
      </div>

      {/* design notes */}
      <div className="absolute bottom-6 left-5">
        <Link
          href="/dream/217-dance-avatar/README.md"
          className="text-xs text-white/40 hover:text-white/65 transition-colors"
        >
          Design notes ↗
        </Link>
      </div>
    </div>
  );
}
