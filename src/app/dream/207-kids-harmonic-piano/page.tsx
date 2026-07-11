"use client";
import { useEffect, useRef } from "react";
import Link from "next/link";

// **For**: kids (4+)
// Tap the glowing circles to add their voices — hear the timbre change as harmonics blend.

const DEFS = [
  { freq: 130.81, hue: 270, r: 76, gain: 0.90 }, // C3  — violet  (fundamental)
  { freq: 261.63, hue: 195, r: 60, gain: 0.45 }, // C4  — cyan    (2nd harmonic)
  { freq: 392.00, hue: 145, r: 48, gain: 0.30 }, // G4  — emerald (3rd harmonic)
  { freq: 523.25, hue:  42, r: 38, gain: 0.22 }, // C5  — amber   (4th harmonic)
];

// Relative positions in canvas (0..1)
const POS: [number, number][] = [
  [0.30, 0.31],
  [0.70, 0.31],
  [0.30, 0.69],
  [0.70, 0.69],
];

// Visual pulse rates (Hz) — much slower than audio, readable as glow
const VIS_HZ = [0.45, 0.68, 0.92, 1.20];

type Ripple = { rCss: number; life: number };
type Spark  = { x: number; y: number; vx: number; vy: number; life: number; hue: number };

type VoiceState = {
  on: boolean;
  env: GainNode | null;
  rippleTimer: number;
  ripples: Ripple[];
  tapScale: number;
};

type St = {
  actx: AudioContext | null;
  voices: VoiceState[];
  sparks: Spark[];
  awake: boolean;
  lastTs: number;
};

function makeVoice(): VoiceState {
  return { on: false, env: null, rippleTimer: 0, ripples: [], tapScale: 1.0 };
}

export default function HarmonicPiano() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stRef = useRef<St>({
    actx: null,
    voices: DEFS.map(makeVoice),
    sparks: [],
    awake: false,
    lastTs: 0,
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const st = stRef.current;

    function initAudio(): void {
      if (st.actx) return;
      const actx = new AudioContext();
      const master = actx.createGain();
      master.gain.value = 0.20;
      master.connect(actx.destination);
      st.actx = actx;

      for (let i = 0; i < DEFS.length; i++) {
        const d = DEFS[i];
        const osc = actx.createOscillator();
        const env = actx.createGain();
        osc.type = "triangle";
        osc.frequency.value = d.freq;
        env.gain.value = 0.0001;
        osc.connect(env).connect(master);
        osc.start();
        st.voices[i].env = env;
      }
    }

    function enableVoice(i: number): void {
      const v = st.voices[i];
      if (v.on || !v.env || !st.actx) return;
      v.on = true;
      v.env.gain.setTargetAtTime(DEFS[i].gain, st.actx.currentTime, 0.04);
      v.tapScale = 1.35;
      emitBurst(i);
      v.ripples.push({ rCss: DEFS[i].r, life: 1.0 });
    }

    function disableVoice(i: number): void {
      const v = st.voices[i];
      if (!v.on || !v.env || !st.actx) return;
      v.on = false;
      v.env.gain.setTargetAtTime(0.0001, st.actx.currentTime, 0.06);
      v.tapScale = 0.82;
    }

    function emitBurst(i: number): void {
      const canvas2 = canvasRef.current;
      if (!canvas2) return;
      const W = canvas2.offsetWidth;
      const H = canvas2.offsetHeight;
      const cx = POS[i][0] * W;
      const cy = POS[i][1] * H;
      const hue = DEFS[i].hue;
      for (let k = 0; k < 10; k++) {
        const a = (Math.PI * 2 * k) / 10;
        const spd = 28 + Math.random() * 30;
        st.sparks.push({
          x: cx, y: cy,
          vx: Math.cos(a) * spd,
          vy: Math.sin(a) * spd - 10,
          life: 1.0, hue,
        });
      }
    }

    function resize(): void {
      if (!canvas) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 3);
      canvas.width  = canvas.offsetWidth  * dpr;
      canvas.height = canvas.offsetHeight * dpr;
    }
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    function onPointerDown(e: PointerEvent): void {
      if (!canvas) return;
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      const W  = canvas.offsetWidth;
      const H  = canvas.offsetHeight;

      initAudio();

      if (!st.awake) {
        // First tap — wake up and activate all voices
        st.awake = true;
        for (let i = 0; i < DEFS.length; i++) enableVoice(i);
        return;
      }

      // Hit-test circles
      for (let i = 0; i < DEFS.length; i++) {
        const px   = POS[i][0] * W;
        const py   = POS[i][1] * H;
        const dist = Math.hypot(cx - px, cy - py);
        if (dist <= DEFS[i].r + 18) {
          if (st.voices[i].on) {
            // Keep at least one voice active
            const activeCount = st.voices.filter(v => v.on).length;
            if (activeCount > 1) {
              disableVoice(i);
            } else {
              st.voices[i].tapScale = 1.25; // bounce to indicate can't remove last
            }
          } else {
            enableVoice(i);
          }
          return;
        }
      }
    }
    canvas.addEventListener("pointerdown", onPointerDown);

    let rafId = 0;
    const animate = (ts: number): void => {
      rafId = requestAnimationFrame(animate);
      if (!canvas) return;
      const W   = canvas.offsetWidth;
      const H   = canvas.offsetHeight;
      if (W === 0 || H === 0) return;
      const dpr  = canvas.width / W;
      const dtMs = Math.min(ts - st.lastTs, 50);
      st.lastTs  = ts;
      const dtS  = dtMs / 1000;
      const tS   = ts / 1000;

      ctx.fillStyle = "#06101f";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      for (let i = 0; i < DEFS.length; i++) {
        const d  = DEFS[i];
        const v  = st.voices[i];
        const px = POS[i][0] * W;
        const py = POS[i][1] * H;

        // Animate tap scale back to 1
        v.tapScale += (1.0 - v.tapScale) * Math.min(1, dtS * 9);

        // Ripple emission while on
        if (v.on) {
          const period = 1.6 - i * 0.18;
          v.rippleTimer += dtS;
          if (v.rippleTimer >= period) {
            v.rippleTimer -= period;
            v.ripples.push({ rCss: d.r * 0.9, life: 1.0 });
          }
        }

        // Update & draw ripples
        for (const rp of v.ripples) {
          rp.rCss += (d.r * 4 - rp.rCss) * dtS * 1.4;
          rp.life  -= 0.85 * dtS;
          if (rp.life > 0) {
            ctx.save();
            ctx.globalAlpha  = rp.life * 0.50;
            ctx.strokeStyle  = `hsl(${d.hue},82%,65%)`;
            ctx.lineWidth    = 1.8 * dpr;
            ctx.shadowColor  = `hsl(${d.hue},90%,60%)`;
            ctx.shadowBlur   = 6 * dpr;
            ctx.beginPath();
            ctx.arc(px * dpr, py * dpr, rp.rCss * dpr, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
          }
        }
        v.ripples = v.ripples.filter(rp => rp.life > 0);

        // Visual pulse envelope
        const pulse  = v.on
          ? 0.75 + 0.25 * Math.sin(tS * VIS_HZ[i] * Math.PI * 2)
          : 0.20;
        const rDraw  = d.r * v.tapScale;
        const bright = v.on ? 50 + pulse * 18 : 22;
        const alpha  = v.on ? 0.50 + pulse * 0.48 : 0.28;

        const cpx = px * dpr;
        const cpy = py * dpr;
        const crp = rDraw * dpr;

        // Outer glow
        ctx.save();
        ctx.shadowColor = `hsl(${d.hue},90%,${bright}%)`;
        ctx.shadowBlur  = (v.on ? 28 : 10) * dpr;
        ctx.globalAlpha = alpha;

        ctx.beginPath();
        ctx.arc(cpx, cpy, crp, 0, Math.PI * 2);
        ctx.fillStyle = `hsl(${d.hue},65%,${bright * 0.38}%)`;
        ctx.fill();

        ctx.strokeStyle = `hsl(${d.hue},88%,${bright}%)`;
        ctx.lineWidth   = (v.on ? 3.2 : 2) * dpr;
        ctx.stroke();

        ctx.restore();

        // Inner glint highlight
        if (v.on) {
          const hx = cpx - crp * 0.28;
          const hy = cpy - crp * 0.30;
          const hr = crp * 0.26;
          const grd = ctx.createRadialGradient(hx, hy, 0, hx, hy, hr);
          grd.addColorStop(0, `rgba(255,255,255,${(0.38 * pulse).toFixed(2)})`);
          grd.addColorStop(1, "rgba(255,255,255,0)");
          ctx.save();
          ctx.globalAlpha = pulse;
          ctx.beginPath();
          ctx.arc(hx, hy, hr, 0, Math.PI * 2);
          ctx.fillStyle = grd;
          ctx.fill();
          ctx.restore();
        }

        // Center dot
        ctx.save();
        ctx.globalAlpha  = v.on ? 0.88 + pulse * 0.12 : 0.32;
        ctx.shadowColor  = `hsl(${d.hue},90%,80%)`;
        ctx.shadowBlur   = (v.on ? 10 : 4) * dpr;
        ctx.fillStyle    = v.on
          ? `hsl(${d.hue},95%,82%)`
          : `rgba(200,200,220,0.60)`;
        ctx.beginPath();
        ctx.arc(cpx, cpy, (v.on ? 7 : 5) * dpr, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // Sparkles
      for (const sp of st.sparks) {
        sp.x    += sp.vx * dtS;
        sp.y    += sp.vy * dtS;
        sp.vy   += 32 * dtS;
        sp.life -= 1.4 * dtS;
        if (sp.life <= 0) continue;
        ctx.save();
        ctx.globalAlpha = sp.life * 0.85;
        ctx.shadowColor = `hsl(${sp.hue},90%,70%)`;
        ctx.shadowBlur  = 5 * dpr;
        ctx.fillStyle   = `hsl(${sp.hue},95%,80%)`;
        ctx.beginPath();
        ctx.arc(sp.x * dpr, sp.y * dpr, 2.5 * dpr, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      st.sparks = st.sparks.filter(sp => sp.life > 0);

      // Pre-wake hint
      if (!st.awake) {
        const alpha = Math.min(0.80, tS * 0.6);
        ctx.save();
        ctx.globalAlpha  = alpha;
        ctx.fillStyle    = "white";
        ctx.font         = `bold ${Math.round(17 * dpr)}px sans-serif`;
        ctx.textAlign    = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("tap to wake the voices", canvas.width / 2, canvas.height * 0.91);
        ctx.restore();
      }
    };
    rafId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(rafId);
      ro.disconnect();
      canvas.removeEventListener("pointerdown", onPointerDown);
      st.actx?.close().catch(() => undefined);
    };
  }, []);

  return (
    <div className="flex flex-col items-center min-h-screen bg-black text-foreground select-none">
      <div className="w-full max-w-lg px-4 pt-6 pb-8 flex flex-col items-center gap-4">
        <div className="text-center">
          <h1 className="text-2xl font-mono font-bold">Voice Circles</h1>
          <p className="text-muted-foreground text-base mt-1">
            Tap a circle to add or remove its voice — hear the sound change as they blend
          </p>
        </div>

        <canvas
          ref={canvasRef}
          className="w-full aspect-[3/4] rounded-xl touch-none cursor-pointer"
        />

        <p className="text-muted-foreground text-sm text-center">
          Four voices · each circle a harmonic · BANDIMAL: bigger = deeper
        </p>

        <Link
          href="/dream"
          className="text-muted-foreground/70 text-sm hover:text-muted-foreground transition"
        >
          ← dream lab
        </Link>
      </div>
    </div>
  );
}
