"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";

// C-major pentatonic: C3, E3, G3, A3, C4
const PENTA_HZ    = [130.81, 164.81, 196.00, 220.00, 261.63];
const JELLY_HUES  = [270,    210,    185,    155,    130   ]; // violet → teal
const JELLY_RADII = [46,     40,     32,     28,     22    ];
const BASE_VY     = [-0.26, -0.22,  -0.30,  -0.23,  -0.35 ]; // base upward drift

interface Jelly {
  x: number; y: number; r: number;
  hue: number; noteHz: number;
  vx: number; vy: number; baseVy: number;
  phase: number; wSpeed: number; wAmp: number;
  tentPhase: number; flash: number;
}

export default function KidsJellyfish() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const acRef     = useRef<AudioContext | null>(null);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !started) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const ac = acRef.current;
    if (!ac) return;

    // ── Reverb impulse ─────────────────────────────────────────────
    const sr  = ac.sampleRate;
    const impulse = ac.createBuffer(2, Math.floor(sr * 1.8), sr);
    for (let ch = 0; ch < 2; ch++) {
      const d = impulse.getChannelData(ch);
      for (let i = 0; i < d.length; i++)
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 2.5);
    }

    // ── Ambient pad (C3 · E3 · G3) — stopped in cleanup ───────────
    const ambOscs: OscillatorNode[] = [];
    [130.81, 164.81, 196.00].forEach(f => {
      const osc = ac.createOscillator();
      const g   = ac.createGain();
      osc.type = "sine"; osc.frequency.value = f;
      g.gain.value = 0.013;
      osc.connect(g); g.connect(ac.destination);
      osc.start();
      ambOscs.push(osc);
    });

    // ── Bell tone ──────────────────────────────────────────────────
    const playBell = (hz: number) => {
      const now  = ac.currentTime;
      const osc  = ac.createOscillator();
      const env  = ac.createGain();
      const conv = ac.createConvolver();
      const revG = ac.createGain();
      osc.type = "triangle"; osc.frequency.value = hz;
      env.gain.setValueAtTime(0, now);
      env.gain.linearRampToValueAtTime(0.26, now + 0.015);
      env.gain.exponentialRampToValueAtTime(0.001, now + 1.0);
      conv.buffer = impulse; revG.gain.value = 0.33;
      osc.connect(env);
      env.connect(ac.destination);
      env.connect(conv); conv.connect(revG); revG.connect(ac.destination);
      osc.start(now); osc.stop(now + 1.1);
    };

    // ── Canvas / DPR ───────────────────────────────────────────────
    let dpr = Math.min(window.devicePixelRatio || 1, 3);

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 3);
      canvas.width  = canvas.offsetWidth  * dpr;
      canvas.height = canvas.offsetHeight * dpr;
      ctx.scale(dpr, dpr);
    };
    resize();
    window.addEventListener("resize", resize);

    const cW = () => canvas.offsetWidth;
    const cH = () => canvas.offsetHeight;

    // ── Jellyfish state ────────────────────────────────────────────
    const jellies: Jelly[] = PENTA_HZ.map((hz, i) => ({
      x:         (i + 0.5) / PENTA_HZ.length * (canvas.offsetWidth  || 400),
      y:         (canvas.offsetHeight || 600) * (0.25 + Math.random() * 0.65),
      r:         JELLY_RADII[i] ?? 30,
      hue:       JELLY_HUES[i]  ?? 200,
      noteHz:    hz,
      vx:        0,
      vy:        BASE_VY[i] ?? -0.25,
      baseVy:    BASE_VY[i] ?? -0.25,
      phase:     i * 1.3,
      wSpeed:    0.018 + i * 0.005,
      wAmp:      22 - i * 2,
      tentPhase: i * 0.9,
      flash:     0,
    }));

    // ── Draw one jellyfish ─────────────────────────────────────────
    const drawJelly = (j: Jelly) => {
      const { x, y, r, hue, flash, tentPhase } = j;
      const ga = 0.52 + flash * 0.38;

      // Tentacles
      for (let i = 0; i < 7; i++) {
        const tx   = x + (i - 3) * (r * 0.26);
        const tLen = r * (0.88 + 0.24 * Math.sin(tentPhase + i * 0.85));
        ctx.beginPath();
        ctx.moveTo(tx, y);
        ctx.bezierCurveTo(
          tx + Math.sin(tentPhase * 1.4 + i * 0.70) * 8, y + tLen * 0.38,
          tx + Math.cos(tentPhase * 0.9 + i * 1.20) * 9, y + tLen * 0.70,
          tx + Math.sin(tentPhase * 1.8 + i * 0.50) * 6, y + tLen
        );
        ctx.strokeStyle = `hsla(${hue + 20},65%,78%,${(ga * 0.48).toFixed(2)})`;
        ctx.lineWidth   = 1.5;
        ctx.shadowBlur  = flash > 0.05 ? 5 + flash * 12 : 2;
        ctx.shadowColor = `hsl(${hue},80%,85%)`;
        ctx.stroke();
      }

      // Bell dome (top half of a squashed ellipse)
      ctx.beginPath();
      ctx.ellipse(x, y, r, r * 0.58, 0, Math.PI, 0, false);
      ctx.closePath();
      const grad = ctx.createRadialGradient(x, y - r * 0.22, r * 0.08, x, y, r);
      grad.addColorStop(0,    `hsla(${hue + 30},75%,92%,${(ga * 0.72).toFixed(2)})`);
      grad.addColorStop(0.55, `hsla(${hue},65%,74%,${(ga * 0.42).toFixed(2)})`);
      grad.addColorStop(1,    `hsla(${hue - 20},55%,55%,${(ga * 0.10).toFixed(2)})`);
      ctx.fillStyle   = grad;
      ctx.shadowBlur  = 10 + flash * 22;
      ctx.shadowColor = `hsl(${hue},90%,82%)`;
      ctx.fill();

      // Inner bioluminescent highlight ring
      ctx.beginPath();
      ctx.ellipse(x, y, r * 0.72, r * 0.42, 0, Math.PI, 0, false);
      ctx.closePath();
      ctx.strokeStyle = `hsla(${hue + 45},90%,97%,${(ga * 0.28).toFixed(2)})`;
      ctx.lineWidth   = 1.2;
      ctx.shadowBlur  = 6;
      ctx.stroke();

      ctx.shadowBlur = 0;
    };

    // ── Animation loop ─────────────────────────────────────────────
    let rafId = 0;

    const tick = () => {
      rafId = requestAnimationFrame(tick);
      const w = cW(); const h = cH();

      // Fade to deep ocean blue (persistent glow trails)
      ctx.fillStyle = "rgba(3,8,28,0.15)";
      ctx.fillRect(0, 0, w, h);

      for (const j of jellies) {
        j.phase     += j.wSpeed;
        j.tentPhase += 0.032;
        j.flash      = Math.max(0, j.flash - 0.032);
        j.vx        *= 0.93;
        j.vy        += (j.baseVy - j.vy) * 0.015; // EMA back to base upward speed

        j.x += Math.sin(j.phase) * j.wAmp * 0.028 + j.vx;
        j.y += j.vy;

        // Horizontal wrap
        if (j.x < -j.r * 1.5) j.x = w + j.r * 1.5;
        if (j.x > w + j.r * 1.5) j.x = -j.r * 1.5;
        // Vertical wrap: exit top → respawn at bottom
        if (j.y < -j.r * 3) {
          j.y = h + j.r * 1.5;
          j.x = j.r + Math.random() * Math.max(1, w - j.r * 2);
        }

        drawJelly(j);
      }
    };
    tick();

    // ── Touch interaction ──────────────────────────────────────────
    const onPointerDown = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const px   = e.clientX - rect.left;
      const py   = e.clientY - rect.top;

      // Find nearest jellyfish
      let best: Jelly | null = null;
      let bestDist = Infinity;
      for (const j of jellies) {
        const d = Math.hypot(j.x - px, j.y - py);
        if (d < bestDist) { bestDist = d; best = j; }
      }
      if (!best) return;

      const dx  = best.x - px;
      const dy  = best.y - py;
      const len = Math.max(1, Math.hypot(dx, dy));
      // Strength scales with proximity; generous hit area (3× radius for 4yo)
      const str = bestDist < best.r * 3 ? Math.max(2, 6 - bestDist / best.r) : 2.2;
      best.vx  += (dx / len) * str * 0.65;
      best.vy  += (dy / len) * str * 0.35 - 2.6; // always bias upward
      best.flash = 1.0;
      playBell(best.noteHz);
    };

    canvas.addEventListener("pointerdown", onPointerDown);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", resize);
      canvas.removeEventListener("pointerdown", onPointerDown);
      ambOscs.forEach(o => { try { o.stop(); } catch (_) {} });
    };
  }, [started]);

  const handleStart = () => {
    if (acRef.current) return;
    const ac = new AudioContext();
    void ac.resume();
    acRef.current = ac;
    setStarted(true);
  };

  return (
    <main className="flex flex-col items-center min-h-screen bg-[#03081c] text-foreground px-4 py-6">
      <div className="w-full max-w-2xl">
        <h1 className="text-2xl font-mono font-bold mb-1 text-foreground">
          Jellyfish Song
        </h1>
        <p className="text-base text-muted-foreground mb-2">
          Touch a jellyfish to nudge it — each one sings its own bell note.
        </p>
        <p className="text-sm text-muted-foreground mb-4">
          5 jellyfish · pentatonic C-major · no microphone needed
        </p>

        {!started ? (
          <div className="flex flex-col items-center gap-8 mt-10">
            {/* Jellyfish silhouette preview */}
            <div className="flex gap-5 items-end justify-center">
              {JELLY_RADII.map((r, i) => (
                <div
                  key={i}
                  className="rounded-t-full"
                  style={{
                    width:     r * 1.7,
                    height:    r * 1.05,
                    background: `hsl(${JELLY_HUES[i] ?? 200},55%,62%)`,
                    opacity:   0.72,
                    boxShadow: `0 0 ${r * 0.6}px hsl(${JELLY_HUES[i] ?? 200},80%,70%)`,
                  }}
                />
              ))}
            </div>
            <button
              onClick={handleStart}
              className="bg-violet-400/15 border border-violet-300/40 text-violet-100/95 text-xl font-semibold px-10 py-4 rounded-2xl min-h-[64px] min-w-[200px] active:scale-95 transition-transform"
            >
              🪼 Begin
            </button>
          </div>
        ) : (
          <canvas
            ref={canvasRef}
            className="w-full rounded-2xl touch-none"
            style={{ height: "68vh", display: "block", background: "#03081c" }}
          />
        )}

        <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
          <span>For kids 4+ · zero permissions · multi-touch OK</span>
          <Link href="/dream" className="underline">
            ← dream lab
          </Link>
        </div>
      </div>
    </main>
  );
}
