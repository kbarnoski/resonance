"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 1562-constant-q-spiral — "What if you played your voice through a resonant
// constant-Q filterbank and watched the energy climb a glowing PITCH HELIX
// where every octave is one turn of a spiral and every partial lands as a bead
// of light you can hear ring?"
//
// INPUT     mic-voice, PLAYED (sing / hum / whistle) + a deterministic seeded
//           synth-carrier idle self-demo so it is never blank or silent.
// OUTPUT    Canvas2D pitch helix / chroma spiral (headless-verifiable).
// TECHNIQUE the lab's first Constant-Q Transform + first IIRFilterNode — a real
//           bank of 60 resonant bandpass filters, one per semitone (audio.ts /
//           cqt.ts). NEVER an FFT.
// WELD      the summed filterbank output is what you HEAR; the same 60 RMS
//           numbers are the beads you SEE. Picture and sound are one array.
// GEOMETRY  angle = pitch-class (chroma wraps every octave), radius = octave —
//           so a note and all its octaves line up on one radial arm (Shepard /
//           Drobisch pitch helix; octave equivalence).
//
// See README.md for references and honest limits.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import { prefersReducedMotion } from "../_shared/psych/safeFlicker";
import { CqtEngine } from "./audio";
import { BANDS_PER_OCTAVE } from "./cqt";

const SLUG = "1562-constant-q-spiral";

type Status = "idle" | "running";

export default function ConstantQSpiralPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<CqtEngine | null>(null);
  const rafRef = useRef(0);

  const [status, setStatus] = useState<Status>("idle");
  const [micDenied, setMicDenied] = useState(false);
  const [noAudio, setNoAudio] = useState(false);
  const [showNotes, setShowNotes] = useState(false);

  const start = useCallback(async () => {
    if (engineRef.current) return;
    const engine = new CqtEngine();
    engine.reduced = prefersReducedMotion();
    engineRef.current = engine;
    const res = await engine.start();
    if (res.error === "no-audiocontext") {
      setNoAudio(true);
      engine.dispose();
      engineRef.current = null;
      return;
    }
    setMicDenied(!res.mic);
    setStatus("running");
  }, []);

  const stop = useCallback(() => {
    engineRef.current?.dispose();
    engineRef.current = null;
    setStatus("idle");
  }, []);

  // Render loop — runs whenever mounted; draws idle backdrop before start so
  // the canvas is never a blank rectangle.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduced = prefersReducedMotion();
    let disposed = false;
    let firstFrame = true;

    // Persisted trail brightness per band so beads leave glowing tails.
    let trail: Float32Array | null = null;

    const resize = () => {
      const dpr = Math.min(1.75, window.devicePixelRatio || 1);
      const w = Math.max(2, Math.floor(canvas.clientWidth * dpr));
      const h = Math.max(2, Math.floor(canvas.clientHeight * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        firstFrame = true;
      }
    };

    // Slow luminance drift, well under 3 Hz (photosensitive-safe, no strobe).
    const lumAt = (t: number) => 0.86 + 0.14 * Math.sin(t * 2 * Math.PI * 0.22);

    const frame = () => {
      if (disposed) return;
      resize();
      const w = canvas.width;
      const h = canvas.height;
      const t = performance.now() / 1000;

      const engine = engineRef.current;
      const bands = engine?.bands ?? null;
      const nBands = bands?.length ?? 60;
      if (!trail || trail.length !== nBands) trail = new Float32Array(nBands);

      engine?.update();

      // Feedback fade: paint a translucent floor instead of clearing, so the
      // previous frame lingers as a glow trail. Solid on the first frame.
      if (firstFrame) {
        ctx.globalCompositeOperation = "source-over";
        ctx.fillStyle = "#05030c";
        ctx.fillRect(0, 0, w, h);
        firstFrame = false;
      } else {
        ctx.globalCompositeOperation = "source-over";
        ctx.fillStyle = "rgba(5,3,12,0.30)";
        ctx.fillRect(0, 0, w, h);
      }

      const cx = w / 2;
      const cy = h / 2;
      const maxR = Math.min(w, h) * 0.46;
      const r0 = maxR * 0.1;
      const octaves = nBands / BANDS_PER_OCTAVE;
      const dr = (maxR - r0) / (octaves + 0.5);
      const rot = reduced ? t * 0.02 : t * 0.06; // slow global rotation
      const lum = lumAt(t);

      // Faint spiral guide + radial chroma arms (octave-equivalence lines).
      ctx.globalCompositeOperation = "lighter";
      ctx.lineWidth = Math.max(1, maxR * 0.004);
      for (let pc = 0; pc < BANDS_PER_OCTAVE; pc++) {
        const ang = (pc / BANDS_PER_OCTAVE) * Math.PI * 2 + rot;
        const x0 = cx + Math.cos(ang) * r0;
        const y0 = cy + Math.sin(ang) * r0;
        const x1 = cx + Math.cos(ang) * maxR;
        const y1 = cy + Math.sin(ang) * maxR;
        ctx.strokeStyle = `rgba(120,90,200,${0.05 * lum})`;
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.stroke();
      }

      // Continuous helix ribbon (the spine of the vortex).
      ctx.strokeStyle = `rgba(90,60,180,${0.14 * lum})`;
      ctx.lineWidth = Math.max(1, maxR * 0.006);
      ctx.beginPath();
      for (let i = 0; i <= nBands; i++) {
        const oct = i / BANDS_PER_OCTAVE;
        const pc = i % BANDS_PER_OCTAVE;
        const ang = (pc / BANDS_PER_OCTAVE) * Math.PI * 2 + rot;
        const rr = r0 + oct * dr;
        const x = cx + Math.cos(ang) * rr;
        const y = cy + Math.sin(ang) * rr;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // Beads. Position for band i, brightness = its (trailed) CQT energy.
      const levels = engine?.levels;
      const posOf = (i: number, energy: number) => {
        const oct = Math.floor(i / BANDS_PER_OCTAVE);
        const pc = i % BANDS_PER_OCTAVE;
        const ang = (pc / BANDS_PER_OCTAVE) * Math.PI * 2 + rot;
        const rr = r0 + oct * dr + energy * dr * 0.28; // small energy push out
        return {
          x: cx + Math.cos(ang) * rr,
          y: cy + Math.sin(ang) * rr,
          ang,
          rr,
        };
      };

      for (let i = 0; i < nBands; i++) {
        const raw = levels ? Math.min(1, levels[i] * 3.2) : 0;
        // decay the trail, then lift toward the live level
        trail[i] = Math.max(trail[i] * (reduced ? 0.9 : 0.85), raw);
        const e = trail[i];
        if (e < 0.015) continue;

        const { x, y } = posOf(i, e);
        const oct = Math.floor(i / BANDS_PER_OCTAVE);
        // Hue climbs violet(270) → magenta(310) → cyan(190) with octave + energy.
        const climb = oct / Math.max(1, octaves - 1);
        const hue = 270 + climb * 60 - e * 90; // pushes toward magenta then cyan
        const sat = 85;
        const light = 45 + e * 40 * lum;
        const rad = Math.max(1.2, maxR * (0.012 + e * 0.05));

        const grad = ctx.createRadialGradient(x, y, 0, x, y, rad);
        grad.addColorStop(0, `hsla(${hue},${sat}%,${light}%,${0.9 * lum})`);
        grad.addColorStop(0.5, `hsla(${hue},${sat}%,${light}%,${0.4 * lum})`);
        grad.addColorStop(1, `hsla(${hue},${sat}%,${light}%,0)`);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(x, y, rad, 0, Math.PI * 2);
        ctx.fill();
      }

      // Octave-equivalence threads: connect the loudest beads that share a
      // chroma across octaves — a note lit with its octaves lights a full arm.
      ctx.lineWidth = Math.max(1, maxR * 0.005);
      for (let pc = 0; pc < BANDS_PER_OCTAVE; pc++) {
        let prev: { x: number; y: number } | null = null;
        for (let oct = 0; oct < octaves; oct++) {
          const i = oct * BANDS_PER_OCTAVE + pc;
          if (i >= nBands) break;
          const e = trail[i];
          if (e < 0.08) {
            prev = null;
            continue;
          }
          const p = posOf(i, e);
          if (prev) {
            const hue = 300 - e * 100;
            ctx.strokeStyle = `hsla(${hue},80%,60%,${0.35 * e * lum})`;
            ctx.beginPath();
            ctx.moveTo(prev.x, prev.y);
            ctx.lineTo(p.x, p.y);
            ctx.stroke();
          }
          prev = { x: p.x, y: p.y };
        }
      }

      ctx.globalCompositeOperation = "source-over";
      rafRef.current = requestAnimationFrame(frame);
    };

    rafRef.current = requestAnimationFrame(frame);
    return () => {
      disposed = true;
      cancelAnimationFrame(rafRef.current);
    };
  }, []);

  // Teardown on unmount.
  useEffect(() => {
    return () => {
      engineRef.current?.dispose();
      engineRef.current = null;
    };
  }, []);

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-3xl px-5 py-8">
        <header className="mb-4">
          <div className="mb-2 flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">
              Constant-Q Spiral
            </h1>
            <span className="rounded-full border border-border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              CQT · IIR filterbank
            </span>
          </div>
          <p className="text-base text-muted-foreground">
            Sing, hum, or whistle through a bank of 60 resonant bandpass filters
            — one per semitone — and watch the energy climb a glowing pitch
            helix. Every octave is one turn of the spiral; a note and all its
            octaves line up on one radial arm. What you hear is the filterbank
            ringing back.
          </p>
        </header>

        <div className="relative aspect-square w-full overflow-hidden rounded-lg border border-border bg-black">
          <canvas ref={canvasRef} className="h-full w-full touch-none" />
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          {status === "idle" ? (
            <button
              onClick={start}
              className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Start — voice + sound
            </button>
          ) : (
            <button
              onClick={stop}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Stop
            </button>
          )}
          <button
            onClick={() => setShowNotes((v) => !v)}
            className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            {showNotes ? "Hide design notes" : "Read the design notes"}
          </button>
        </div>

        <div className="mt-3 space-y-1 text-base text-muted-foreground">
          {status === "running" && !micDenied && (
            <p>
              Mic is live — a held tone draws one calm arm; a chord or rich voice
              blazes the whole spiral. Whistle up an octave and watch the bead
              jump one turn out along the same radial.
            </p>
          )}
          {status === "idle" && (
            <p>
              Press start. A seeded synth carrier plays through the same
              filterbank until your mic takes over, so the vortex is never blank
              or silent.
            </p>
          )}
          {micDenied && status === "running" && (
            <p className="text-destructive">
              Microphone unavailable — the deterministic synth carrier keeps the
              helix climbing and ringing on its own.
            </p>
          )}
          {noAudio && (
            <p className="text-destructive">
              This browser has no Web Audio support, so the resonant filterbank
              can&apos;t run here.
            </p>
          )}
        </div>

        {showNotes && (
          <div className="mt-6 space-y-3 rounded-lg border border-border bg-background/40 p-4 text-base text-muted-foreground">
            <p>
              <span className="text-foreground">The technique.</span> This is the
              lab&apos;s first Constant-Q Transform and its first use of Web
              Audio&apos;s <span className="font-mono text-sm">IIRFilterNode</span>
              — every other piece analyses with an FFT (AnalyserNode). Here the
              analysis is a real bank of 60 second-order RBJ bandpass biquads,
              geometrically spaced 12 per octave from C2 (65 Hz) to C7, all
              sharing the same quality factor Q. Constant Q means a constant
              number of cycles per band, so pitch is uniform on a log axis and
              octaves stack cleanly. Each band&apos;s RMS is read from a tiny
              time-domain tap — never an FFT.
            </p>
            <p>
              <span className="text-foreground">The geometry.</span> Angle =
              pitch-class (chroma wraps every octave); radius = octave. A note and
              all of its octaves therefore land on one radial arm — Drobisch and
              Shepard&apos;s pitch helix, octave equivalence made visible. The
              summed filterbank output is exactly what you hear, so the beads you
              see and the ring you hear are the same 60 numbers.
            </p>
            <p>
              <span className="text-foreground">References.</span> Constant-Q
              Transform (Judith Brown, 1991); the Morlet wavelet and the
              scalogram = CQT equivalence; the Drobisch / Shepard pitch helix;
              Bressloff–Cowan cortical form constants for the spiral / vortex.
            </p>
            <p>
              <span className="text-foreground">Honest limits.</span> A real-time
              resonant filterbank is a CQT approximation: sharp bands ring and add
              latency, softer bands blur pitch — we run Q ≈ 14 as a compromise.
              This is a multi-cycle piece: cycle-1 is the helix and played mic;
              cycle-2 adds a proper CQT sharpening pass and Karel&apos;s real Path
              piano as the carrier.
            </p>
          </div>
        )}
      </div>
      <PrototypeNav slugs={[SLUG]} />
    </main>
  );
}
