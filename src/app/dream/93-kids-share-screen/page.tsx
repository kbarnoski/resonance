"use client";

// **For**: kids (4+)
// Each finger gets its own glowing voice.
// Two fingers playing together always sound beautiful.

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

// ── Constants ──────────────────────────────────────────────────────────────────

const PENTA_HZ = [
  130.81, 146.83, 164.81, 196.00, 220.00,
  261.63, 293.66, 329.63, 392.00, 440.00,
  523.25,
] as const;

const PAD_FREQS = [130.81, 164.81, 196.00] as const;

// Two voice colors: violet (slot 0) and rose (slot 1)
const VOICE_HUE: readonly [number, number] = [270, 340];

function calcHz(y: number, h: number): number {
  const idx = Math.floor((1 - y / h) * PENTA_HZ.length);
  return PENTA_HZ[Math.max(0, Math.min(PENTA_HZ.length - 1, idx))];
}

// ── Types ──────────────────────────────────────────────────────────────────────

interface Spark {
  x: number; y: number;
  vx: number; vy: number;
  life: number;
  hue: number;
}

interface Voice {
  osc:  OscillatorNode;
  osc2: OscillatorNode;
  gain: GainNode;
  x:    number;
  y:    number;
  slot: 0 | 1;
  ring: number; // 0 = idle; 0.01 → 1 = expanding ring animation
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function KidsShareScreen() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const acxRef    = useRef<AudioContext | null>(null);
  const voicesRef = useRef(new Map<number, Voice>());
  const slotsRef  = useRef<[number | null, number | null]>([null, null]);
  const sparksRef = useRef<Spark[]>([]);
  const animRef   = useRef(0);
  const starsRef  = useRef<Array<{ x: number; y: number; r: number; a: number }>>([]);

  const [started, setStarted] = useState(false);

  // ── Audio helpers ──────────────────────────────────────────────────────────

  function initAudio() {
    if (acxRef.current) return;
    const acx = new AudioContext();
    acxRef.current = acx;
    PAD_FREQS.forEach((freq) => {
      const o = acx.createOscillator();
      const g = acx.createGain();
      o.type = "triangle";
      o.frequency.value = freq;
      g.gain.value = 0.018;
      o.connect(g).connect(acx.destination);
      o.start();
    });
  }

  function addVoice(pid: number, x: number, y: number) {
    const acx   = acxRef.current;
    const slots = slotsRef.current;
    if (!acx) return;

    // Claim the first free slot (max 2 simultaneous voices)
    const slot: 0 | 1 | null =
      slots[0] === null ? 0 : slots[1] === null ? 1 : null;
    if (slot === null) return;
    slots[slot] = pid;

    const freq = calcHz(y, window.innerHeight);
    const t    = acx.currentTime;

    const osc  = acx.createOscillator();
    const osc2 = acx.createOscillator();
    const gain = acx.createGain();
    const g2   = acx.createGain();

    osc.type  = "triangle";
    osc2.type = "sine";
    osc.frequency.value  = freq;
    osc2.frequency.value = freq * 2;
    g2.gain.value = 0.10;

    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.22, t + 0.05);

    osc2.connect(g2).connect(gain);
    osc.connect(gain).connect(acx.destination);
    osc.start(t);
    osc2.start(t);

    voicesRef.current.set(pid, { osc, osc2, gain, x, y, slot, ring: 0 });
  }

  function nudgeVoice(pid: number, x: number, y: number) {
    const acx = acxRef.current;
    const v   = voicesRef.current.get(pid);
    if (!acx || !v) return;

    const newFreq = calcHz(y, window.innerHeight);
    if (newFreq !== calcHz(v.y, window.innerHeight)) {
      v.osc.frequency.setTargetAtTime(newFreq, acx.currentTime, 0.04);
      v.osc2.frequency.setTargetAtTime(newFreq * 2, acx.currentTime, 0.04);
      v.ring = 0.01; // trigger expanding ring
    }

    // Emit sparkles on movement
    if (Math.abs(x - v.x) + Math.abs(y - v.y) > 4 && sparksRef.current.length < 120) {
      for (let i = 0; i < 2; i++) {
        const a = Math.random() * Math.PI * 2;
        const s = Math.random() * 1.6 + 0.4;
        sparksRef.current.push({
          x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
          life: 1, hue: VOICE_HUE[v.slot],
        });
      }
    }

    v.x = x;
    v.y = y;
  }

  function dropVoice(pid: number) {
    const acx = acxRef.current;
    const v   = voicesRef.current.get(pid);
    if (!acx || !v) return;

    const t = acx.currentTime;
    v.gain.gain.setTargetAtTime(0, t, 0.08);
    v.osc.stop(t + 0.5);
    v.osc2.stop(t + 0.5);

    slotsRef.current[v.slot] = null;
    voicesRef.current.delete(pid);
  }

  // ── Canvas loop ────────────────────────────────────────────────────────────

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;

    let W = window.innerWidth;
    let H = window.innerHeight;

    function resize() {
      if (!canvas) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = window.innerWidth;
      H = window.innerHeight;
      canvas.width  = W * dpr;
      canvas.height = H * dpr;
      canvas.style.width  = `${W}px`;
      canvas.style.height = `${H}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      starsRef.current = Array.from({ length: 60 }, () => ({
        x: Math.random() * W,
        y: Math.random() * H,
        r: Math.random() * 1.2 + 0.3,
        a: Math.random() * 0.35 + 0.12,
      }));
    }

    resize();
    window.addEventListener("resize", resize);

    const t0 = performance.now();

    function frame() {
      const tSec = (performance.now() - t0) / 1000;

      // Background
      ctx.fillStyle = "#060414";
      ctx.fillRect(0, 0, W, H);

      // Twinkling stars
      for (const s of starsRef.current) {
        ctx.globalAlpha = s.a * (0.6 + 0.4 * Math.sin(tSec * 0.7 + s.x * 0.01));
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // Sparkle particles
      const alive: Spark[] = [];
      for (const sp of sparksRef.current) {
        sp.x  += sp.vx;
        sp.y  += sp.vy;
        sp.vy += 0.05;
        sp.life -= 0.028;
        if (sp.life <= 0) continue;
        ctx.globalAlpha = sp.life * 0.80;
        ctx.fillStyle   = `hsl(${sp.hue},85%,78%)`;
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, 2.8 * sp.life, 0, Math.PI * 2);
        ctx.fill();
        alive.push(sp);
      }
      ctx.globalAlpha = 1;
      sparksRef.current = alive;

      const voices = Array.from(voicesRef.current.values());

      // Animated dashed line connecting two active voices
      if (voices.length === 2) {
        const [va, vb] = voices as [Voice, Voice];
        ctx.save();
        ctx.globalAlpha  = 0.26 + 0.10 * Math.sin(tSec * 3.0);
        const lg = ctx.createLinearGradient(va.x, va.y, vb.x, vb.y);
        lg.addColorStop(0, `hsl(${VOICE_HUE[va.slot]},80%,72%)`);
        lg.addColorStop(1, `hsl(${VOICE_HUE[vb.slot]},80%,72%)`);
        ctx.strokeStyle  = lg;
        ctx.lineWidth    = 1.5;
        ctx.setLineDash([6, 8]);
        ctx.lineDashOffset = -tSec * 14;
        ctx.shadowColor  = "rgba(200,150,255,0.35)";
        ctx.shadowBlur   = 10;
        ctx.beginPath();
        ctx.moveTo(va.x, va.y);
        ctx.lineTo(vb.x, vb.y);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
      }

      // Voice orbs
      for (const v of voices) {
        const hue = VOICE_HUE[v.slot];

        // Outer glow halo
        const grd = ctx.createRadialGradient(v.x, v.y, 0, v.x, v.y, 110);
        grd.addColorStop(0,   `hsla(${hue},85%,65%,0.38)`);
        grd.addColorStop(0.5, `hsla(${hue},85%,65%,0.10)`);
        grd.addColorStop(1,   `hsla(${hue},85%,65%,0.00)`);
        ctx.fillStyle = grd;
        ctx.beginPath();
        ctx.arc(v.x, v.y, 110, 0, Math.PI * 2);
        ctx.fill();

        // Expanding ring on pitch change
        if (v.ring > 0) {
          ctx.save();
          ctx.globalAlpha = (1 - v.ring) * 0.60;
          ctx.strokeStyle = `hsl(${hue},85%,78%)`;
          ctx.lineWidth   = 2;
          ctx.beginPath();
          ctx.arc(v.x, v.y, 28 + v.ring * 72, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
          v.ring = Math.min(v.ring + 0.04, 1);
          if (v.ring >= 1) v.ring = 0;
        }

        // Slow breathing orbit ring
        const breathe = 0.5 + 0.5 * Math.sin(tSec * 2.2 + v.slot * Math.PI);
        ctx.save();
        ctx.globalAlpha = 0.18 + breathe * 0.08;
        ctx.strokeStyle = `hsl(${hue},80%,72%)`;
        ctx.lineWidth   = 1.5;
        ctx.beginPath();
        ctx.arc(v.x, v.y, 38 + breathe * 10, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();

        // Core orb with glow + shine
        ctx.save();
        ctx.shadowColor = `hsl(${hue},85%,65%)`;
        ctx.shadowBlur  = 22;
        ctx.fillStyle   = `hsl(${hue},80%,68%)`;
        ctx.beginPath();
        ctx.arc(v.x, v.y, 26, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle  = `hsla(${hue},60%,92%,0.65)`;
        ctx.beginPath();
        ctx.arc(v.x - 7, v.y - 8, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // Idle hint: two pulsing orbs when no voices are active
      if (voices.length === 0) {
        const pulse = 0.5 + 0.5 * Math.sin(tSec * 1.8);
        const hints: [number, number, number][] = [
          [W * 0.34, H * 0.54, VOICE_HUE[0]],
          [W * 0.66, H * 0.54, VOICE_HUE[1]],
        ];
        for (const [cx, cy, hue] of hints) {
          const r  = 54 + pulse * 12;
          const ig = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
          ig.addColorStop(0, `hsla(${hue},80%,65%,${0.24 + pulse * 0.12})`);
          ig.addColorStop(1, `hsla(${hue},80%,65%,0)`);
          ctx.fillStyle = ig;
          ctx.beginPath();
          ctx.arc(cx, cy, r, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = `hsla(${hue},80%,70%,${0.55 + pulse * 0.25})`;
          ctx.beginPath();
          ctx.arc(cx, cy, 18 + pulse * 4, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      animRef.current = requestAnimationFrame(frame);
    }

    animRef.current = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener("resize", resize);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Pointer handlers ───────────────────────────────────────────────────────

  function handlePointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    e.preventDefault();
    if (!started) {
      setStarted(true);
      initAudio();
    }
    (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
    addVoice(e.pointerId, e.clientX, e.clientY);
  }

  function handlePointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    e.preventDefault();
    if (voicesRef.current.has(e.pointerId)) {
      nudgeVoice(e.pointerId, e.clientX, e.clientY);
    }
  }

  function handlePointerUp(e: React.PointerEvent<HTMLCanvasElement>) {
    e.preventDefault();
    dropVoice(e.pointerId);
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[#060414]">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 touch-none"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      />

      {/* Title + pre-play hint */}
      <div className="pointer-events-none absolute left-0 right-0 top-5 flex flex-col items-center gap-1.5 px-6 text-center">
        <h1 className="text-xl font-semibold tracking-wide text-white/90">
          Share the Screen
        </h1>
        {!started && (
          <p className="text-base text-white/70">
            Two fingers — two voices — always in harmony
          </p>
        )}
      </div>

      {/* Pitch guide (right edge) */}
      <div className="pointer-events-none absolute right-3 top-1/2 flex -translate-y-1/2 flex-col items-end gap-1">
        <span className="text-[11px] text-white/45">high</span>
        <div className="my-2 h-16 w-px rounded-full bg-white/15" />
        <span className="text-[11px] text-white/45">low</span>
      </div>

      <Link
        href="/dream"
        className="absolute bottom-4 right-4 text-xs text-white/55 transition-colors hover:text-white/80"
      >
        ← dream lab
      </Link>
    </div>
  );
}
