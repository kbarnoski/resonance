"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 2422-chladni — "What are the hidden shapes of a vibrating surface, and can
// you play them?"
//
// A Chladni plate. A square plate is driven at a frequency; its surface settles
// into a STANDING WAVE. Sand sprinkled on top is thrown off the moving areas
// and piles up on the NODAL LINES — the places that stay still — revealing the
// vibration mode as a crisp geometric figure. Turn the dial (or drag across the
// plate) and the resonant mode changes, so the figure reorganises and the sand
// re-migrates. A gentle Web Audio tone drives the plate at the same frequency:
// you hear what you see.
//
// The math is done for real, per particle, every frame:
//   figure:  f(x,y) = cos(nπx)cos(mπy) − cos(mπx)cos(nπy)   over the unit square
//   nodes:   the curves where f ≈ 0
//   sand:    each grain takes a Newton step downhill on |f| toward the nearest
//            node, plus a jitter that scales with |f| (grains in high-motion
//            regions get kicked around; grains at a node settle).
//
// Reference: Ernst Chladni, "Entdeckungen über die Theorie des Klanges" (1787).
// Canvas2D + Web Audio only. No three.js, no WebGL. See README.md.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";

// ── Resonant-mode table. Each frequency lands on a clean, recognisable figure
// (like a real plate's resonances). Between table entries the field is blended
// so the pattern morphs continuously as you sweep. n ≠ m always (f ≡ 0 if n=m).
type Mode = { f: number; n: number; m: number };
const MODES: Mode[] = [
  { f: 120, n: 1, m: 2 },
  { f: 180, n: 2, m: 3 },
  { f: 240, n: 1, m: 4 },
  { f: 300, n: 3, m: 4 },
  { f: 360, n: 2, m: 5 },
  { f: 440, n: 3, m: 5 },
  { f: 520, n: 4, m: 5 },
  { f: 600, n: 3, m: 6 },
  { f: 680, n: 5, m: 6 },
];
const FREQ_MIN = MODES[0].f;
const FREQ_MAX = MODES[MODES.length - 1].f;

// Deterministic idle self-demo: dwell on a clean figure, then morph to the next.
const DEMO_FREQS = [120, 240, 300, 440, 520, 180];
const DEMO_SEG = 5.0; // seconds per figure (≈3s hold, ≈2s morph)

const N_PARTICLES = 6500;
const BUF = 512; // internal canvas resolution (square)
const PI = Math.PI;

// gradient-descent / deposition tuning
const LR = 0.42; // Newton step toward the nodal line
const JITTER = 0.0075; // max jitter, scaled by local |f|
const FADE = 0.8; // density trail decay per frame
const DEPOSIT = 0.55; // brightness a grain lays down per frame
const EXPOSURE = 1.15; // tone-mapping exposure

// plate → violet → warm sand colour ramp (raw hex lives only in this art layer)
const PLATE = [13, 11, 19];
const VIOLET = [150, 122, 226];
const SAND = [248, 244, 236];

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

// Which (blended) mode does this frequency correspond to?
function modeAt(freq: number): {
  nA: number;
  mA: number;
  nB: number;
  mB: number;
  t: number;
} {
  const f = Math.min(FREQ_MAX, Math.max(FREQ_MIN, freq));
  let i = 0;
  while (i < MODES.length - 2 && f > MODES[i + 1].f) i++;
  const lo = MODES[i];
  const hi = MODES[i + 1];
  const t = (f - lo.f) / (hi.f - lo.f);
  return { nA: lo.n, mA: lo.m, nB: hi.n, mB: hi.m, t };
}

function labelFor(freq: number): string {
  const { nA, mA, nB, mB, t } = modeAt(freq);
  const dom = t < 0.5 ? [nA, mA] : [nB, mB];
  const morphing = t > 0.12 && t < 0.88 && (nA !== nB || mA !== mB);
  return morphing
    ? `mode (${nA},${mA}) → (${nB},${mB})`
    : `mode (${dom[0]},${dom[1]})`;
}

// Advance every grain one step downhill on |f| toward the nearest nodal line.
// Mutates px / py in place. `agit` (0..1) adds extra kick during re-migration.
function stepParticles(
  px: Float32Array,
  py: Float32Array,
  count: number,
  nA: number,
  mA: number,
  nB: number,
  mB: number,
  t: number,
  agit: number
) {
  const w0 = 1 - t;
  const Aa = nA * PI;
  const Ba = mA * PI;
  const Ab = nB * PI;
  const Bb = mB * PI;
  const jit = JITTER * (1 + 2.2 * agit);

  for (let k = 0; k < count; k++) {
    const x = px[k];
    const y = py[k];

    // mode A field + gradient
    const cAx = Math.cos(Aa * x);
    const cAy = Math.cos(Aa * y);
    const cBx = Math.cos(Ba * x);
    const cBy = Math.cos(Ba * y);
    const fAa = cAx * cBy - cBx * cAy;
    const gxA =
      -Aa * Math.sin(Aa * x) * cBy + Ba * Math.sin(Ba * x) * cAy;
    const gyA =
      -Ba * cAx * Math.sin(Ba * y) + Aa * cBx * Math.sin(Aa * y);

    let f = w0 * fAa;
    let gx = w0 * gxA;
    let gy = w0 * gyA;

    // mode B field + gradient (blended in)
    if (t > 0.001) {
      const dAx = Math.cos(Ab * x);
      const dAy = Math.cos(Ab * y);
      const dBx = Math.cos(Bb * x);
      const dBy = Math.cos(Bb * y);
      const fBb = dAx * dBy - dBx * dAy;
      const gxB =
        -Ab * Math.sin(Ab * x) * dBy + Bb * Math.sin(Bb * x) * dAy;
      const gyB =
        -Bb * dAx * Math.sin(Bb * y) + Ab * dBx * Math.sin(Ab * y);
      f += t * fBb;
      gx += t * gxB;
      gy += t * gyB;
    }

    // Newton step toward the level set f = 0 (descends |f|), lr-scaled.
    const g2 = gx * gx + gy * gy + 1e-3;
    const step = (LR * f) / g2;
    let nx = x - step * gx;
    let ny = y - step * gy;

    // jitter proportional to how much this spot is still moving
    const kick = jit * Math.min(1, Math.abs(f));
    nx += (Math.random() - 0.5) * kick;
    ny += (Math.random() - 0.5) * kick;

    // guard NaN / Inf, then reflect back into the unit square
    if (!Number.isFinite(nx)) nx = x;
    if (!Number.isFinite(ny)) ny = y;
    if (nx < 0) nx = -nx;
    else if (nx > 1) nx = 2 - nx;
    if (ny < 0) ny = -ny;
    else if (ny > 1) ny = 2 - ny;

    px[k] = nx;
    py[k] = ny;
  }
}

export default function ChladniPlate() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // mutable state read by the animation loop (avoids re-running the effect)
  const freqRef = useRef(240);
  const autoDemoRef = useRef(true);
  const agitRef = useRef(1);
  const lastFreqRef = useRef(240);

  // audio graph
  const audioRef = useRef<{
    ctx: AudioContext;
    osc: OscillatorNode;
    partial: OscillatorNode;
    shimmer: GainNode;
    master: GainNode;
  } | null>(null);

  // UI state
  const [frequency, setFrequency] = useState(240);
  const [autoDemo, setAutoDemo] = useState(true);
  const [audioOn, setAudioOn] = useState(false);
  const [modeLabel, setModeLabel] = useState(() => labelFor(240));
  const [showNotes, setShowNotes] = useState(false);

  // ── audio: gentle sine + soft partial, driven at the plate frequency. Created
  // only after a user gesture; a shimmer gain rises during re-migration.
  const startAudio = useCallback(() => {
    if (audioRef.current) {
      void audioRef.current.ctx.resume();
      return;
    }
    if (typeof window === "undefined") return;
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor();
    const now = ctx.currentTime;
    const f = freqRef.current;

    const master = ctx.createGain();
    master.gain.setValueAtTime(0.0001, now);
    master.gain.exponentialRampToValueAtTime(0.11, now + 0.8); // soft attack
    master.connect(ctx.destination);

    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(f, now);
    const oscGain = ctx.createGain();
    oscGain.gain.value = 0.7;
    osc.connect(oscGain).connect(master);

    // faint octave partial for body
    const partial = ctx.createOscillator();
    partial.type = "triangle";
    partial.frequency.setValueAtTime(f * 2, now);
    const shimmer = ctx.createGain();
    shimmer.gain.value = 0.0001;
    partial.connect(shimmer).connect(master);

    osc.start();
    partial.start();
    audioRef.current = { ctx, osc, partial, shimmer, master };
    setAudioOn(true);
  }, []);

  // ── manual frequency changes: stop the self-demo, re-energise the sand.
  const setFreq = useCallback((f: number) => {
    const clamped = Math.min(FREQ_MAX, Math.max(FREQ_MIN, f));
    freqRef.current = clamped;
    autoDemoRef.current = false;
    agitRef.current = 1;
    setFrequency(Math.round(clamped));
    setAutoDemo(false);
  }, []);

  // pointer on the plate: x-position scrubs frequency, also drives the tone
  const dragRef = useRef(false);
  const plateToFreq = useCallback((clientX: number) => {
    const cv = canvasRef.current;
    if (!cv) return;
    const r = cv.getBoundingClientRect();
    const u = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
    setFreq(FREQ_MIN + u * (FREQ_MAX - FREQ_MIN));
  }, [setFreq]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      dragRef.current = true;
      e.currentTarget.setPointerCapture(e.pointerId);
      startAudio();
      plateToFreq(e.clientX);
    },
    [plateToFreq, startAudio]
  );
  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!dragRef.current) return;
      plateToFreq(e.clientX);
    },
    [plateToFreq]
  );
  const onPointerUp = useCallback(() => {
    dragRef.current = false;
  }, []);

  const resumeDemo = useCallback(() => {
    autoDemoRef.current = true;
    agitRef.current = 1;
    setAutoDemo(true);
  }, []);

  // ── the simulation + render loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = BUF;
    canvas.height = BUF;
    const ctx2d = canvas.getContext("2d");
    if (!ctx2d) return;

    const px = new Float32Array(N_PARTICLES);
    const py = new Float32Array(N_PARTICLES);
    for (let k = 0; k < N_PARTICLES; k++) {
      px[k] = Math.random();
      py[k] = Math.random();
    }

    const density = new Float32Array(BUF * BUF);
    const image = ctx2d.createImageData(BUF, BUF);
    const data = image.data;

    let raf = 0;
    let start = 0;
    let lastUi = 0;
    let running = true;

    const frame = (now: number) => {
      if (!running) return;
      if (!start) start = now;
      const elapsed = (now - start) / 1000;

      // idle self-demo drives the frequency deterministically
      if (autoDemoRef.current) {
        const seg = elapsed / DEMO_SEG;
        const i = Math.floor(seg) % DEMO_FREQS.length;
        const j = (i + 1) % DEMO_FREQS.length;
        const local = seg - Math.floor(seg);
        const blend = smoothstep(0.6, 1.0, local);
        freqRef.current =
          DEMO_FREQS[i] + (DEMO_FREQS[j] - DEMO_FREQS[i]) * blend;
      }

      const freq = freqRef.current;

      // detect frequency motion → bump re-migration agitation
      const df = Math.abs(freq - lastFreqRef.current);
      if (df > 0.4) agitRef.current = Math.min(1, agitRef.current + df * 0.02);
      lastFreqRef.current = freq;
      agitRef.current *= 0.95; // decay
      const agit = agitRef.current;

      const { nA, mA, nB, mB, t } = modeAt(freq);
      stepParticles(px, py, N_PARTICLES, nA, mA, nB, mB, t, agit);

      // deposit grains into the density buffer
      for (let k = 0; k < N_PARTICLES; k++) {
        const xi = (px[k] * (BUF - 1)) | 0;
        const yi = (py[k] * (BUF - 1)) | 0;
        density[yi * BUF + xi] += DEPOSIT;
      }

      // tone-map density → colour, then fade for the next frame's trails
      for (let i = 0; i < density.length; i++) {
        const d = density[i];
        const b = 1 - Math.exp(-d * EXPOSURE);
        let r: number, g: number, bl: number;
        if (b < 0.5) {
          const u = b * 2;
          r = PLATE[0] + (VIOLET[0] - PLATE[0]) * u;
          g = PLATE[1] + (VIOLET[1] - PLATE[1]) * u;
          bl = PLATE[2] + (VIOLET[2] - PLATE[2]) * u;
        } else {
          const u = (b - 0.5) * 2;
          r = VIOLET[0] + (SAND[0] - VIOLET[0]) * u;
          g = VIOLET[1] + (SAND[1] - VIOLET[1]) * u;
          bl = VIOLET[2] + (SAND[2] - VIOLET[2]) * u;
        }
        const p = i * 4;
        data[p] = r;
        data[p + 1] = g;
        data[p + 2] = bl;
        data[p + 3] = 255;
        density[i] = d * FADE;
      }
      ctx2d.putImageData(image, 0, 0);

      // drive audio at the plate frequency; shimmer tracks re-migration
      const a = audioRef.current;
      if (a) {
        const nowT = a.ctx.currentTime;
        a.osc.frequency.setTargetAtTime(freq, nowT, 0.04);
        a.partial.frequency.setTargetAtTime(freq * 2, nowT, 0.04);
        a.shimmer.gain.setTargetAtTime(0.0001 + agit * 0.05, nowT, 0.06);
      }

      // throttled UI sync (label + slider during the self-demo)
      if (now - lastUi > 90) {
        lastUi = now;
        setModeLabel(labelFor(freq));
        if (autoDemoRef.current) setFrequency(Math.round(freq));
      }

      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      const a = audioRef.current;
      if (a) {
        try {
          a.osc.stop();
          a.partial.stop();
          a.osc.disconnect();
          a.partial.disconnect();
          a.shimmer.disconnect();
          a.master.disconnect();
          void a.ctx.close();
        } catch {
          // already torn down
        }
        audioRef.current = null;
      }
    };
  }, []);

  return (
    <main className="relative flex min-h-[calc(100vh-3rem)] flex-col items-center justify-start gap-6 overflow-hidden bg-background px-4 py-8">
      {/* design notes */}
      <button
        onClick={() => setShowNotes(true)}
        className="absolute right-4 top-4 z-20 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        Read the design notes
      </button>

      {/* hero */}
      <header className="mt-2 max-w-2xl text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          Chladni Plate
        </h1>
        <p className="mt-2 text-base text-muted-foreground">
          Drive a square plate at a frequency and the sand flees the moving
          surface, piling up on the still lines — the hidden shape of the
          vibration. Turn the dial and watch the geometry reorganise.
        </p>
      </header>

      {/* the plate */}
      <canvas
        ref={canvasRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className="aspect-square w-[min(64vh,92vw)] max-w-full touch-none rounded-md border border-border shadow-lg"
        style={{ cursor: "ew-resize" }}
        aria-label="Chladni plate — drag left/right to change the driving frequency"
      />

      {/* readouts + controls */}
      <div className="flex w-[min(64vh,92vw)] max-w-full flex-col gap-4">
        <div className="flex items-end justify-between">
          <div className="flex flex-col gap-1">
            <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              driving frequency
            </span>
            <span className="text-2xl font-semibold tabular-nums tracking-tight text-foreground">
              {frequency} Hz
            </span>
          </div>
          <div className="flex flex-col items-end gap-1">
            <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              standing wave
            </span>
            <span className="font-mono text-sm text-primary">{modeLabel}</span>
          </div>
        </div>

        <input
          type="range"
          min={FREQ_MIN}
          max={FREQ_MAX}
          step={1}
          value={frequency}
          onChange={(e) => setFreq(Number(e.target.value))}
          onPointerDown={startAudio}
          className="h-11 w-full cursor-pointer accent-primary"
          aria-label="Driving frequency"
        />

        <div className="flex flex-wrap items-center gap-3">
          {audioOn ? (
            <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              sound on — the tone drives the plate
            </span>
          ) : (
            <button
              onClick={startAudio}
              className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Play the plate
            </button>
          )}
          <button
            onClick={resumeDemo}
            disabled={autoDemo}
            className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
          >
            {autoDemo ? "Auto-sweeping…" : "Resume auto-sweep"}
          </button>
          <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            drag the plate to scrub
          </span>
        </div>
      </div>

      {/* design-notes modal */}
      {showNotes && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-semibold tracking-tight text-foreground">
              Chladni Plate — design notes
            </h2>
            <div className="mt-4 space-y-3 text-base text-muted-foreground">
              <p>
                In 1787 Ernst Chladni bowed the edge of a sand-strewn metal
                plate and watched the grains leap into sharp geometric figures.
                They were tracing the plate&apos;s <em>nodal lines</em> — the
                curves that don&apos;t move while the rest of the surface
                vibrates. Each figure is a different resonant mode.
              </p>
              <p>
                This plate is simulated for real. The standing-wave displacement
                on the unit square is{" "}
                <span className="font-mono text-sm text-foreground">
                  f = cos(nπx)cos(mπy) − cos(mπx)cos(nπy)
                </span>
                , and the nodal lines are where <em>f ≈ 0</em>. Each of ~6,500
                sand grains takes a Newton step downhill on |f| toward the
                nearest node, plus a jitter that scales with |f| — grains over
                the moving areas get kicked around, grains at a node settle.
              </p>
              <p>
                Frequency maps to a table of resonant modes, blended between
                entries so the figure morphs continuously as you sweep. The Web
                Audio tone is driven at the very same frequency, so what you hear
                and what you see share one number.
              </p>
              <p className="text-sm">
                Reference: Ernst Chladni,{" "}
                <em>Entdeckungen über die Theorie des Klanges</em> (1787). See
                also Hans Jenny, <em>Cymatics</em> (1967).
              </p>
            </div>
            <button
              onClick={() => setShowNotes(false)}
              className="mt-5 min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
