"use client";

// ════════════════════════════════════════════════════════════════════════════
// XY-Scope (2522) — "What if the sound WERE the picture?"
//
// A stereo dual-oscillator engine with NO pitch lattice. Voice A is the left
// channel (the scope's X axis), voice B is the right (Y). The glowing figure on
// screen is literally the plotted signal (L(t), R(t)) — oscilloscope music in
// the lineage of Jerobeam Fenderson. Because the ratio between the two voices
// is fully continuous (never snapped to a just / pentatonic lattice), the player
// can drive a clean consonant Lissajous loop straight into a beating, buzzing,
// screeching clash — and the vector shape warps in perfect lockstep, because the
// shape IS the waveform.
//
// Determinism: no Math.random / Date.now / argless Date anywhere. A seeded
// mulberry32 (0x2522) supplies fixed analog "phosphor noise". On load a silent,
// audio-free auto-demo animates the same L/R math so a screenshot already shows
// a morphing glowing figure; real audio starts only on the first gesture.
// ════════════════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useRef, useState } from "react";
import { ScopeEngine, getAudioContextCtor, shapeSample } from "./audio";
import { createScopeRenderer, type ScopeRenderer } from "./scope-gl";

const N = 2048; // samples per frame (matches analyser fftSize)
const SEED = 0x2522;

const RANGE = {
  base: { min: 40, max: 800, step: 1 },
  ratio: { min: 0.5, max: 8, step: 0.001 },
  phase: { min: 0, max: Math.PI * 2, step: 0.001 },
  drive: { min: 0, max: 1, step: 0.001 },
};

// Letter keys → continuous base pitches (a plain playable keyboard; the FREEDOM
// / dissonance lives in the ratio + drive, not here).
const PITCH_KEYS = "asdfghjkl".split("");
const pitchFor = (idx: number): number => 110 * Math.pow(2, idx / 12);

function mulberry32(seed: number): () => number {
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

interface Params {
  base: number;
  ratio: number;
  phase: number;
  drive: number;
}

const INITIAL: Params = { base: 110, ratio: 2.0, phase: Math.PI * 0.5, drive: 0 };

export default function XYScopePage() {
  const [params, setParams] = useState<Params>(INITIAL);
  const [running, setRunning] = useState(false);
  const [audioSupported, setAudioSupported] = useState(true);
  const [webglSupported, setWebglSupported] = useState(true);
  const [showNotes, setShowNotes] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const svgPathRef = useRef<SVGPolylineElement | null>(null);
  const engineRef = useRef<ScopeEngine | null>(null);
  const rendererRef = useRef<ScopeRenderer | null>(null);
  const rafRef = useRef<number | null>(null);
  const paramsRef = useRef<Params>(INITIAL);
  const boostRef = useRef(0); // Space-held danger boost, eased 0..1
  const boostHeldRef = useRef(false);
  const demoPhaseRef = useRef(0);

  // Reusable sample buffers + fixed phosphor-noise field.
  const xBuf = useRef(new Float32Array(N));
  const yBuf = useRef(new Float32Array(N));
  const noise = useRef<Float32Array | null>(null);
  if (noise.current === null) {
    const rng = mulberry32(SEED);
    const arr = new Float32Array(N);
    for (let i = 0; i < N; i++) arr[i] = rng() * 2 - 1;
    noise.current = arr;
  }

  useEffect(() => {
    paramsRef.current = params;
  }, [params]);

  // Fill the buffers from math (silent demo mode) — same L/R equations the audio
  // uses, so the figure looks identical whether or not sound is on.
  const fillDemo = useCallback(() => {
    demoPhaseRef.current += 0.02;
    const dp = demoPhaseRef.current;
    const p = paramsRef.current;
    const nz = noise.current!;
    const drive = clamp(Math.max(p.drive, boostRef.current), 0, 1);
    const rEff = p.ratio + 0.12 * Math.sin(dp * 0.25);
    const pEff = p.phase + dp;
    const cyc = 3; // base cycles across the window
    const x = xBuf.current;
    const y = yBuf.current;
    const TAU = Math.PI * 2;
    for (let i = 0; i < N; i++) {
      const t = i / N;
      const a = Math.sin(TAU * cyc * t);
      const b = Math.sin(TAU * cyc * rEff * t + pEff);
      x[i] = shapeSample(a, drive) + nz[i] * 0.006;
      y[i] = shapeSample(b, drive) + nz[(i + 511) % N] * 0.006;
    }
    return drive;
  }, []);

  // The render / physics loop.
  const frame = useCallback(() => {
    const eng = engineRef.current;
    const p = paramsRef.current;

    // Ease the Space-held danger boost.
    const target = boostHeldRef.current ? 1 : 0;
    boostRef.current += (target - boostRef.current) * 0.12;
    const effDrive = clamp(Math.max(p.drive, boostRef.current), 0, 1);

    let drive = effDrive;
    if (eng && eng.running) {
      eng.setParams({ ...p, drive: effDrive });
      eng.readScope(xBuf.current, yBuf.current);
    } else {
      drive = fillDemo();
    }

    const r = rendererRef.current;
    if (r) {
      r.draw(xBuf.current, yBuf.current, N, { drive, decay: 0.9 });
    } else if (svgPathRef.current) {
      // Minimal SVG fallback (no WebGL): downsampled polyline.
      const x = xBuf.current;
      const y = yBuf.current;
      let s = "";
      for (let i = 0; i < N; i += 6) {
        s += `${(x[i] * 0.9 * 50 + 50).toFixed(2)},${(-y[i] * 0.9 * 50 + 50).toFixed(2)} `;
      }
      svgPathRef.current.setAttribute("points", s);
    }

    rafRef.current = requestAnimationFrame(frame);
  }, [fillDemo]);

  // Mount: detect support, build renderer, start loop.
  useEffect(() => {
    if (typeof window === "undefined") return;
    setAudioSupported(getAudioContextCtor() !== null);

    const canvas = canvasRef.current;
    if (canvas) {
      const r = createScopeRenderer(canvas);
      if (r) {
        rendererRef.current = r;
        setWebglSupported(true);
      } else {
        setWebglSupported(false);
      }
    }

    const onResize = () => rendererRef.current?.resize();
    window.addEventListener("resize", onResize);
    rafRef.current = requestAnimationFrame(frame);

    return () => {
      window.removeEventListener("resize", onResize);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rendererRef.current?.dispose();
      rendererRef.current = null;
      void engineRef.current?.dispose();
      engineRef.current = null;
    };
  }, [frame]);

  const startAudio = useCallback(async () => {
    if (engineRef.current?.running) return;
    if (getAudioContextCtor() === null) {
      setAudioSupported(false);
      return;
    }
    const eng = new ScopeEngine(paramsRef.current);
    const ok = await eng.start();
    if (ok) {
      engineRef.current = eng;
      setRunning(true);
    } else {
      setAudioSupported(false);
    }
  }, []);

  // Keyboard control surface.
  useEffect(() => {
    if (typeof window === "undefined") return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();

      if (e.key === "Enter" || k === "p") {
        e.preventDefault();
        void startAudio();
        return;
      }
      if (e.code === "Space") {
        e.preventDefault();
        boostHeldRef.current = true;
        return;
      }
      const pIdx = PITCH_KEYS.indexOf(k);
      if (pIdx >= 0) {
        e.preventDefault();
        setParams((prev) => ({ ...prev, base: pitchFor(pIdx) }));
        return;
      }
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        const dir = e.key === "ArrowRight" ? 1 : -1;
        setParams((prev) => ({
          ...prev,
          ratio: clamp(prev.ratio + dir * 0.02, RANGE.ratio.min, RANGE.ratio.max),
        }));
        return;
      }
      if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        e.preventDefault();
        const dir = e.key === "ArrowUp" ? 1 : -1;
        setParams((prev) => {
          let ph = prev.phase + dir * 0.1;
          const TAU = Math.PI * 2;
          ph = ((ph % TAU) + TAU) % TAU;
          return { ...prev, phase: ph };
        });
        return;
      }
      if (k === "[" || k === "]") {
        e.preventDefault();
        const dir = k === "]" ? 1 : -1;
        setParams((prev) => ({
          ...prev,
          drive: clamp(prev.drive + dir * 0.05, 0, 1),
        }));
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") boostHeldRef.current = false;
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [startAudio]);

  const set = (key: keyof Params) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseFloat(e.target.value);
    setParams((prev) => ({ ...prev, [key]: v }));
  };

  const fB = params.base * params.ratio;

  return (
    <main className="min-h-screen bg-background px-5 py-8 text-foreground sm:px-8">
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <header className="flex flex-col gap-2">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Dream 2522 · oscilloscope music
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">XY-Scope</h1>
          <p className="max-w-prose text-base text-muted-foreground">
            The sound <em>is</em> the picture. Two raw oscillators are hard-panned
            — left draws X, right draws Y — so the glowing figure is literally the
            stereo waveform. Ratio and drive are continuous and un-tempered: push
            them and the tone turns dangerous while the vector shape warps in
            lockstep.
          </p>
        </header>

        {/* Scope surface */}
        <div className="relative aspect-square w-full overflow-hidden rounded-lg border border-border bg-black">
          <canvas
            ref={canvasRef}
            className="absolute inset-0 h-full w-full"
            aria-label="XY oscilloscope vector display"
          />
          {!webglSupported && (
            <>
              <svg
                viewBox="0 0 100 100"
                className="absolute inset-0 h-full w-full"
                preserveAspectRatio="xMidYMid meet"
              >
                <polyline
                  ref={svgPathRef}
                  fill="none"
                  stroke="#a78bfa"
                  strokeWidth="0.4"
                  strokeLinejoin="round"
                  points=""
                />
              </svg>
              <p className="absolute left-3 top-3 max-w-[70%] font-mono text-xs text-destructive">
                WebGL2 unavailable — showing a minimal SVG vector fallback.
              </p>
            </>
          )}
          {!running && (
            <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
              <span className="rounded-md bg-background/70 px-3 py-1 font-mono text-xs text-muted-foreground">
                silent auto-demo · press Enter or Play for sound
              </span>
            </div>
          )}
        </div>

        {/* Transport + status */}
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void startAudio()}
            disabled={!audioSupported || running}
            className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {running ? "Playing" : "Play"}
          </button>
          <button
            type="button"
            onClick={() => setShowNotes((s) => !s)}
            className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            {showNotes ? "Hide design notes" : "Read the design notes"}
          </button>
          <span className="font-mono text-xs text-muted-foreground">
            A {params.base.toFixed(0)}Hz · B {fB.toFixed(0)}Hz · {params.ratio.toFixed(3)}:1
          </span>
        </div>

        {!audioSupported && (
          <p className="font-mono text-xs text-destructive">
            No Web Audio API in this browser — the visual scope still runs, but
            there will be no sound.
          </p>
        )}

        {/* Controls */}
        <section className="flex flex-col gap-5 rounded-lg border border-border bg-muted/30 p-5">
          <Slider
            label="Base frequency"
            unit={`${params.base.toFixed(0)} Hz`}
            value={params.base}
            min={RANGE.base.min}
            max={RANGE.base.max}
            step={RANGE.base.step}
            onChange={set("base")}
          />
          <Slider
            label="Ratio (free — dissonance lives here)"
            unit={`${params.ratio.toFixed(3)} : 1`}
            value={params.ratio}
            min={RANGE.ratio.min}
            max={RANGE.ratio.max}
            step={RANGE.ratio.step}
            onChange={set("ratio")}
          />
          <Slider
            label="Phase offset"
            unit={`${((params.phase / (Math.PI * 2)) * 360).toFixed(0)}°`}
            value={params.phase}
            min={RANGE.phase.min}
            max={RANGE.phase.max}
            step={RANGE.phase.step}
            onChange={set("phase")}
          />
          <Slider
            label="Drive (danger — waveshape + FM)"
            unit={`${(params.drive * 100).toFixed(0)}%`}
            value={params.drive}
            min={RANGE.drive.min}
            max={RANGE.drive.max}
            step={RANGE.drive.step}
            onChange={set("drive")}
          />
        </section>

        {/* Key map */}
        <section className="flex flex-col gap-3 rounded-lg border border-border bg-muted/30 p-5">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Keyboard — play it
          </p>
          <ul className="grid grid-cols-1 gap-2 font-mono text-xs text-muted-foreground sm:grid-cols-2">
            <li><span className="text-foreground">Enter / P</span> — start audio</li>
            <li><span className="text-foreground">A S D F G H J K L</span> — base pitches</li>
            <li><span className="text-foreground">← / →</span> — sweep ratio</li>
            <li><span className="text-foreground">↑ / ↓</span> — sweep phase</li>
            <li><span className="text-foreground">Space (hold)</span> — ramp drive to full danger</li>
            <li><span className="text-foreground">[ / ]</span> — nudge drive down / up</li>
          </ul>
        </section>

        {showNotes && (
          <section className="flex flex-col gap-3 rounded-lg border border-border bg-muted/30 p-5 text-sm text-muted-foreground">
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Design notes
            </p>
            <p>
              An XY (Lissajous) oscilloscope plots one signal against another:
              the left channel deflects the beam horizontally, the right channel
              vertically. Feed it two related tones and the beam traces a standing
              figure. Simple frequency ratios (2:1, 3:2) lock into stable loops;
              irrational or complex ratios never close, so the figure precesses
              and the tones beat against each other. This piece keeps the ratio
              fully continuous on purpose — <em>free ratio is free dissonance</em>,
              a deliberate rejection of engines that snap every interval onto a
              consonant lattice.
            </p>
            <p>
              The trace you see is drawn from the real audio buffer (two{" "}
              <code>AnalyserNode</code>s, one per channel) via WebGL2 with additive
              blending and a fading persistence buffer — the phosphor glow of a
              CRT scope. Drive waveshapes each sine toward a spiky square and opens
              an FM index, so harsher timbre and sharper geometry arrive together.
            </p>
            <p>
              Lineage: Jerobeam Fenderson, <em>Oscilloscope Music</em> (audio-as-image
              on an XY scope); the Rutt–Etra video synthesizer (analog vector
              deflection); Ryoji Ikeda (data / signal aesthetic). Status: demoable.
            </p>
          </section>
        )}
      </div>
    </main>
  );
}

function Slider(props: {
  label: string;
  unit: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <label className="flex flex-col gap-2">
      <span className="flex items-baseline justify-between">
        <span className="text-sm text-foreground">{props.label}</span>
        <span className="font-mono text-xs text-muted-foreground">{props.unit}</span>
      </span>
      <input
        type="range"
        value={props.value}
        min={props.min}
        max={props.max}
        step={props.step}
        onChange={props.onChange}
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-border accent-primary"
      />
    </label>
  );
}
