"use client";
import { useEffect, useRef } from "react";
import Link from "next/link";

// **For**: kids (4+)
// Tap the night sky to launch a glowing rocket → it arcs upward →
// explodes into 22 pentatonic sparks. Color = pitch. Left = low, right = high.
// All notes are C major pentatonic — every explosion harmonizes.

const PAL = [
  { color: "#a78bfa", glow: "#6d28d9", freq: 261.63 }, // C4 violet
  { color: "#34d399", glow: "#047857", freq: 329.63 }, // E4 emerald
  { color: "#fbbf24", glow: "#b45309", freq: 392.00 }, // G4 amber
  { color: "#f472b6", glow: "#9d174d", freq: 440.00 }, // A4 rose
  { color: "#67e8f9", glow: "#0e7490", freq: 523.25 }, // C5 cyan
];

const RDUR  = 0.76; // s: rocket travel time to target
const SLIFE = 1.6;  // s: spark lifetime
const GRAV  = 290;  // px/s²: downward acceleration on sparks
const SC    = 22;   // sparks per explosion
const MAXR  = 7;    // max simultaneous rockets

type Rocket = { id: number; sx: number; sy: number; tx: number; ty: number; t: number; pi: number };
type Spark  = { x: number; y: number; vx: number; vy: number; pi: number; age: number };
type Star   = { fx: number; fy: number; r: number; ph: number };
type St     = { roks: Rocket[]; spks: Spark[]; nid: number; lt: number };

// Audio: triangle chord at fundamental + 2nd + 3rd harmonic, fast decay
function burstNote(pi: number, actx: AudioContext): void {
  const now = actx.currentTime;
  const f   = PAL[pi].freq;
  ([
    [f,     0.30],
    [f * 2, 0.11],
    [f * 3, 0.04],
  ] as [number, number][]).forEach(([hz, gain]) => {
    const o = actx.createOscillator();
    const g = actx.createGain();
    o.type = "triangle";
    o.frequency.value = hz;
    o.connect(g);
    g.connect(actx.destination);
    g.gain.setValueAtTime(gain, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 1.4);
    o.start(now);
    o.stop(now + 1.45);
  });
}

export default function KidsFireworks() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const acRef     = useRef<AudioContext | null>(null);
  const rafRef    = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let dpr   = Math.min(window.devicePixelRatio || 1, 2);
    const st: St = { roks: [], spks: [], nid: 0, lt: 0 };
    let stars: Star[] = [];

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width  = canvas.offsetWidth  * dpr;
      canvas.height = canvas.offsetHeight * dpr;
      stars = Array.from({ length: 72 }, () => ({
        fx: Math.random(),
        fy: Math.random() * 0.88,
        r:  0.4 + Math.random() * 1.5,
        ph: Math.random() * Math.PI * 2,
      }));
    };
    resize();
    window.addEventListener("resize", resize);

    // Launch a rocket from the bottom-center toward (px, py)
    function launchRocket(px: number, py: number) {
      if (!canvas || st.roks.length >= MAXR) return;
      const w = canvas.offsetWidth, h = canvas.offsetHeight;
      const pi = Math.min(4, Math.floor((px / w) * 5));
      st.roks.push({
        id: st.nid++,
        sx: w / 2, sy: h - 22,
        tx: px,    ty: Math.max(28, py),
        t:  0,     pi,
      });
    }

    const onPointer = (e: PointerEvent) => {
      e.preventDefault();
      if (!acRef.current) acRef.current = new AudioContext();
      const rect = canvas.getBoundingClientRect();
      launchRocket(e.clientX - rect.left, e.clientY - rect.top);
    };
    canvas.addEventListener("pointerdown", onPointer);

    const animate = (ts: number) => {
      const gc = canvas.getContext("2d");
      if (!gc) { rafRef.current = requestAnimationFrame(animate); return; }

      gc.setTransform(dpr, 0, 0, dpr, 0, 0);
      const dt = st.lt ? Math.min((ts - st.lt) / 1000, 0.05) : 0;
      st.lt = ts;
      const w = canvas.offsetWidth, h = canvas.offsetHeight;

      // ── advance rockets; explode finished ones ──
      const done: Rocket[] = [];
      for (const r of st.roks) { r.t += dt; if (r.t >= RDUR) done.push(r); }
      for (const r of done) {
        st.roks.splice(st.roks.indexOf(r), 1);
        if (acRef.current) burstNote(r.pi, acRef.current);
        for (let i = 0; i < SC; i++) {
          const angle = (i / SC) * Math.PI * 2;
          const spd   = 75 + Math.random() * 145;
          st.spks.push({
            x: r.tx, y: r.ty,
            vx: Math.cos(angle) * spd,
            vy: Math.sin(angle) * spd - 85,
            pi: r.pi, age: 0,
          });
        }
      }

      // ── advance sparks ──
      for (const sp of st.spks) {
        sp.x  += sp.vx * dt;
        sp.y  += sp.vy * dt;
        sp.vy += GRAV * dt;
        sp.age += dt;
      }
      st.spks = st.spks.filter(sp => sp.age < SLIFE && sp.y < h + 60);

      // ── draw ──────────────────────────────────────────────────────────

      // background
      gc.fillStyle = "#040112";
      gc.fillRect(0, 0, w, h);

      // twinkling stars
      for (const s of stars) {
        const a = 0.28 + 0.24 * Math.sin(ts * 0.00055 + s.ph);
        gc.beginPath();
        gc.arc(s.fx * w, s.fy * h, s.r, 0, Math.PI * 2);
        gc.fillStyle = `rgba(255,255,255,${a.toFixed(2)})`;
        gc.fill();
      }

      // rockets: glowing head + fading trail
      for (const r of st.roks) {
        const prog = r.t / RDUR;
        const col  = PAL[r.pi];
        // trail (6 dots stepping back along trajectory)
        for (let k = 1; k <= 6; k++) {
          const tp  = Math.max(0, prog - k * 0.042);
          const ta  = Math.round((1 - k / 6) * 150).toString(16).padStart(2, "0");
          gc.beginPath();
          gc.arc(
            r.sx + (r.tx - r.sx) * tp,
            r.sy + (r.ty - r.sy) * tp,
            2.4, 0, Math.PI * 2,
          );
          gc.fillStyle = `${col.color}${ta}`;
          gc.fill();
        }
        // glowing head
        gc.shadowColor = col.glow;
        gc.shadowBlur  = 22;
        gc.beginPath();
        gc.arc(
          r.sx + (r.tx - r.sx) * prog,
          r.sy + (r.ty - r.sy) * prog,
          5, 0, Math.PI * 2,
        );
        gc.fillStyle = col.color;
        gc.fill();
        gc.shadowBlur = 0;
      }

      // sparks: fade out + gravity
      for (const sp of st.spks) {
        const alpha = Math.max(0, 1 - sp.age / SLIFE);
        const col   = PAL[sp.pi];
        gc.shadowColor = col.glow;
        gc.shadowBlur  = 9;
        gc.beginPath();
        gc.arc(sp.x, sp.y, 1.4 + alpha * 2.4, 0, Math.PI * 2);
        gc.fillStyle = `${col.color}${Math.round(alpha * 255).toString(16).padStart(2, "0")}`;
        gc.fill();
      }
      gc.shadowBlur = 0;

      rafRef.current = requestAnimationFrame(animate);
    };
    rafRef.current = requestAnimationFrame(animate);

    // Auto-demo: 3 rockets so the mechanic is immediately visible
    const t1 = setTimeout(() => launchRocket(canvas.offsetWidth * 0.24, canvas.offsetHeight * 0.30), 900);
    const t2 = setTimeout(() => launchRocket(canvas.offsetWidth * 0.74, canvas.offsetHeight * 0.24), 1850);
    const t3 = setTimeout(() => launchRocket(canvas.offsetWidth * 0.50, canvas.offsetHeight * 0.16), 2800);

    return () => {
      cancelAnimationFrame(rafRef.current);
      clearTimeout(t1); clearTimeout(t2); clearTimeout(t3);
      window.removeEventListener("resize", resize);
      canvas.removeEventListener("pointerdown", onPointer);
      acRef.current?.close();
    };
  }, []);

  return (
    <div className="relative w-full h-screen bg-[#040112] overflow-hidden">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full touch-none"
      />

      <div className="absolute top-0 left-0 right-0 p-4 text-center pointer-events-none">
        <h1 className="text-2xl font-bold text-white/95">Fireworks</h1>
        <p className="text-base text-white/75 mt-1">
          Tap the sky — watch it fly, hear it burst ✦
        </p>
      </div>

      <div className="absolute top-4 right-4">
        <Link
          href="/dream"
          className="text-white/55 text-sm hover:text-white/80 transition-colors"
        >
          ← dream lab
        </Link>
      </div>
    </div>
  );
}
