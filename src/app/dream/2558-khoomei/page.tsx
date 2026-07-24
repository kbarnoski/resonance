"use client";

/**
 * 2558 · Khoomei — biphonic overtone singing by a physical vocal tract
 *
 * The one question: "What if one sustained note could split into two — a
 * droning fundamental and a piercing whistle overtone you sweep by hand, like a
 * Tuvan throat singer — synthesized by a real physical vocal tract?"
 *
 * The engine is a 1D Kelly–Lochbaum digital-waveguide vocal tract (the model
 * behind Pink Trombone), running in an AudioWorklet. A sustained glottal DRONE
 * at a continuous f0 excites the tube; a tight, movable CONSTRICTION forms a
 * sharp front-cavity resonance that isolates and amplifies ONE harmonic of the
 * drone. Sliding the constriction toward the lips climbs the harmonic ladder
 * (5f0 -> 6f0 -> 7f0 ...): a bright whistle rising over the steady low tone —
 * the two-pitch khoomei / sygyt effect. See ./worklet-source.ts for the DSP.
 *
 * Dissonance-capable: f0 is continuous and the emphasized overtone can be
 * detuned off the exact harmonic so it beats and clashes against the drone.
 * There is no scale, no pitch lattice.
 *
 * Visuals are SVG only (no Canvas2D): a vocal-tract cross-section whose
 * constriction visibly pinches and slides, plus a harmonic-ladder / spectral
 * column where the emphasized overtone glows and climbs. On load a silent,
 * deterministic auto-demo sweeps the constriction so a screenshot shows the
 * pinched tract and a glowing overtone mid-ladder; audio starts on first
 * gesture.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { VIOLET, MAGENTA, INDIGO, NEUTRAL } from "../_shared/palette";
import { WORKLET_SOURCE } from "./worklet-source";

// ── model constants ─────────────────────────────────────────────────────────
const N = 44; // tract sections
const NUM_HARMONICS = 14; // ladder bars
const F0_MIN = 100;
const F0_MAX = 160;
const H_MIN = 5; // lowest overtone the tube can sharply isolate
const H_MAX = 14;
const BREATH = 7; // drone particles drifting through the tube

// ── tract geometry (must match the worklet's shapeTract) ─────────────────────
function shapeDiameters(tongue: number, constrict: number, out: Float32Array) {
  const width = 2.6;
  for (let i = 0; i < N; i++) {
    let base = 2.6;
    if (i < 4) base = 1.0 + 0.4 * i;
    const dist = i - tongue;
    const well = Math.exp(-(dist * dist) / (2 * width * width));
    let dia = base - (base - constrict) * well;
    if (dia < 0.05) dia = 0.05;
    out[i] = dia;
  }
}

// map a desired formant frequency to the constriction section index.
// With OVERSAMPLE=2 the front cavity of `frontSections` sections quarter-wave
// resonates near sr / (2 * frontSections); invert that for the index.
function tongueFromFreq(freq: number, sr: number): number {
  let frontSections = sr / (2 * freq);
  if (frontSections < 3) frontSections = 3;
  if (frontSections > N - 4) frontSections = N - 4;
  return N - frontSections;
}

// deterministic PRNG (seeded) — used only for fixed breath-particle offsets
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

// SVG layout (both panels share a 640 x 220 viewBox)
const VB_W = 640;
const VB_H = 220;
const TRACT_LEFT = 44;
const TRACT_RIGHT = VB_W - 30;
const TRACT_CY = 108;
const DIA_SCALE = 13; // px per diameter unit (half-height)
const xOfSection = (i: number) =>
  TRACT_LEFT + (i / (N - 1)) * (TRACT_RIGHT - TRACT_LEFT);

type Engine = {
  ctx: AudioContext;
  node: AudioWorkletNode;
  analyser: AnalyserNode;
  master: GainNode;
  url: string;
};

export default function KhoomeiPage() {
  const [running, setRunning] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(false);

  // audio engine
  const engineRef = useRef<Engine | null>(null);
  const audioOnRef = useRef(false);
  const srRef = useRef(48000);
  const specRef = useRef<Float32Array<ArrayBuffer> | null>(null);

  // control state (refs — no re-render per frame)
  const hRef = useRef(9); // current emphasized harmonic (continuous, glides)
  const hTargetRef = useRef(9);
  const f0Ref = useRef(130);
  const f0TargetRef = useRef(130);
  const detuneRef = useRef(0); // -1..1, fraction of a harmonic spacing
  const detuneTargetRef = useRef(0);
  const constrictRef = useRef(0.5); // constriction diameter (small = tight/piercing)
  const constrictTargetRef = useRef(0.5);
  const userTookOverRef = useRef(false);

  // SVG element refs
  const tractPathRef = useRef<SVGPathElement | null>(null);
  const markerRef = useRef<SVGLineElement | null>(null);
  const markerCapRef = useRef<SVGCircleElement | null>(null);
  const breathRefs = useRef<(SVGCircleElement | null)[]>([]);
  const barRefs = useRef<(SVGRectElement | null)[]>([]);
  const glowRefs = useRef<(SVGRectElement | null)[]>([]);

  // readout refs
  const f0TextRef = useRef<HTMLSpanElement | null>(null);
  const harmTextRef = useRef<HTMLSpanElement | null>(null);
  const tightTextRef = useRef<HTMLSpanElement | null>(null);
  const detuneTextRef = useRef<HTMLSpanElement | null>(null);
  const modeTextRef = useRef<HTMLSpanElement | null>(null);

  // scratch buffers
  const diaBufRef = useRef<Float32Array>(new Float32Array(N));
  const breathSeed = useRef<{ phase: number; vy: number }[]>([]);
  if (breathSeed.current.length === 0) {
    const rnd = mulberry32(0x2558);
    for (let i = 0; i < BREATH; i++) {
      breathSeed.current.push({ phase: rnd(), vy: rnd() * 2 - 1 });
    }
  }

  // ── start audio (needs a user gesture; resumes the context) ───────────────
  const handleStart = useCallback(async () => {
    userTookOverRef.current = true;
    setRunning(true);
    if (engineRef.current) {
      try {
        await engineRef.current.ctx.resume();
      } catch {
        /* ignore */
      }
      audioOnRef.current = true;
      return;
    }
    const AC: typeof AudioContext | undefined =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AC) {
      setAudioError(
        "Web Audio is unavailable — showing the silent visual tract demo.",
      );
      return;
    }
    let ctx: AudioContext;
    try {
      ctx = new AC();
      await ctx.resume();
    } catch {
      setAudioError("Could not open an audio context.");
      return;
    }
    srRef.current = ctx.sampleRate;
    if (!ctx.audioWorklet) {
      setAudioError(
        "AudioWorklet is unavailable — the physical tract needs it; the silent visual demo keeps running.",
      );
      return;
    }
    try {
      const blob = new Blob([WORKLET_SOURCE], {
        type: "application/javascript",
      });
      const url = URL.createObjectURL(blob);
      await ctx.audioWorklet.addModule(url);
      const node = new AudioWorkletNode(ctx, "khoomei-tract-processor", {
        numberOfInputs: 0,
        numberOfOutputs: 1,
        outputChannelCount: [2],
      });
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 4096;
      analyser.smoothingTimeConstant = 0.72;
      specRef.current = new Float32Array(analyser.frequencyBinCount);

      const master = ctx.createGain();
      master.gain.value = 0.85;

      node.connect(analyser);
      analyser.connect(master);
      master.connect(ctx.destination);

      engineRef.current = { ctx, node, analyser, master, url };
      audioOnRef.current = true;
      setAudioError(null);
    } catch {
      setAudioError(
        "The vocal-tract worklet failed to load — the silent visual demo keeps running.",
      );
      audioOnRef.current = false;
    }
  }, []);

  const handleStop = useCallback(() => {
    audioOnRef.current = false;
    setRunning(false);
    const eng = engineRef.current;
    if (eng) {
      eng.node.port.postMessage({ type: "params", active: 0 });
      eng.ctx.suspend().catch(() => {});
    }
  }, []);

  // ── keyboard control ──────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      let handled = true;
      switch (e.key) {
        case "ArrowRight":
          hTargetRef.current = clamp(hTargetRef.current + 1, H_MIN, H_MAX);
          break;
        case "ArrowLeft":
          hTargetRef.current = clamp(hTargetRef.current - 1, H_MIN, H_MAX);
          break;
        case "ArrowUp":
          f0TargetRef.current = clamp(f0TargetRef.current + 3, F0_MIN, F0_MAX);
          break;
        case "ArrowDown":
          f0TargetRef.current = clamp(f0TargetRef.current - 3, F0_MIN, F0_MAX);
          break;
        case "z":
        case "Z":
          // tighter constriction -> purer, more piercing whistle
          constrictTargetRef.current = clamp(
            constrictTargetRef.current - 0.08,
            0.15,
            1.2,
          );
          break;
        case "x":
        case "X":
          constrictTargetRef.current = clamp(
            constrictTargetRef.current + 0.08,
            0.15,
            1.2,
          );
          break;
        case ",":
        case "<":
          detuneTargetRef.current = clamp(detuneTargetRef.current - 0.1, -1, 1);
          break;
        case ".":
        case ">":
          detuneTargetRef.current = clamp(detuneTargetRef.current + 0.1, -1, 1);
          break;
        case " ":
          if (audioOnRef.current) handleStop();
          else void handleStart();
          break;
        default:
          if (e.key >= "1" && e.key <= "9") {
            // number row jumps to a harmonic (5..13)
            hTargetRef.current = clamp(
              H_MIN + (Number(e.key) - 1),
              H_MIN,
              H_MAX,
            );
          } else {
            handled = false;
          }
      }
      if (handled) {
        userTookOverRef.current = true;
        e.preventDefault();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleStart, handleStop]);

  // ── pointer drag on the tract (secondary input) ───────────────────────────
  const onTractPointer = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    if (e.type === "pointerdown") {
      (e.currentTarget as SVGSVGElement).setPointerCapture(e.pointerId);
    } else if (e.buttons === 0) {
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const fx = clamp((e.clientX - rect.left) / rect.width, 0, 1);
    const fy = clamp((e.clientY - rect.top) / rect.height, 0, 1);
    // horizontal -> emphasized harmonic; vertical -> constriction tightness
    hTargetRef.current = H_MIN + fx * (H_MAX - H_MIN);
    constrictTargetRef.current = 0.15 + fy * (1.2 - 0.15);
    userTookOverRef.current = true;
  }, []);

  // ── animation loop (drives SVG directly via refs; no per-frame re-render) ──
  useEffect(() => {
    const dia = diaBufRef.current;
    let raf = 0;

    const frame = (now: number) => {
      // deterministic silent auto-demo until the user takes over
      if (!userTookOverRef.current) {
        const t = now / 1000;
        hTargetRef.current = 9.4 + 4.3 * Math.sin(t * 0.42);
        constrictTargetRef.current = 0.34 + 0.14 * Math.sin(t * 0.19 + 1.1);
      }

      // glide the controls
      hRef.current += (hTargetRef.current - hRef.current) * 0.07;
      f0Ref.current += (f0TargetRef.current - f0Ref.current) * 0.08;
      detuneRef.current += (detuneTargetRef.current - detuneRef.current) * 0.1;
      constrictRef.current +=
        (constrictTargetRef.current - constrictRef.current) * 0.08;

      const f0 = f0Ref.current;
      const detune = detuneRef.current;
      const effH = hRef.current + detune * 0.5; // detune drifts off the harmonic
      const fTarget = effH * f0;
      const tongue = tongueFromFreq(fTarget, srRef.current);

      // push controls to the worklet
      if (audioOnRef.current && engineRef.current) {
        engineRef.current.node.port.postMessage({
          type: "params",
          f0,
          tongue,
          constrict: constrictRef.current,
          active: 1,
        });
      }

      // ── draw the tract cross-section ──
      shapeDiameters(tongue, constrictRef.current, dia);
      if (tractPathRef.current) {
        let d = "M " + xOfSection(0).toFixed(1) + " ";
        d += (TRACT_CY - dia[0] * DIA_SCALE).toFixed(1);
        for (let i = 1; i < N; i++) {
          d +=
            " L " +
            xOfSection(i).toFixed(1) +
            " " +
            (TRACT_CY - dia[i] * DIA_SCALE).toFixed(1);
        }
        for (let i = N - 1; i >= 0; i--) {
          d +=
            " L " +
            xOfSection(i).toFixed(1) +
            " " +
            (TRACT_CY + dia[i] * DIA_SCALE).toFixed(1);
        }
        d += " Z";
        tractPathRef.current.setAttribute("d", d);
      }

      // constriction marker
      const mx = xOfSection(clamp(tongue, 0, N - 1));
      const ti = clamp(Math.round(tongue), 0, N - 1);
      const mh = dia[ti] * DIA_SCALE;
      if (markerRef.current) {
        markerRef.current.setAttribute("x1", mx.toFixed(1));
        markerRef.current.setAttribute("x2", mx.toFixed(1));
        markerRef.current.setAttribute("y1", (TRACT_CY - mh - 10).toFixed(1));
        markerRef.current.setAttribute("y2", (TRACT_CY + mh + 10).toFixed(1));
      }
      if (markerCapRef.current) {
        markerCapRef.current.setAttribute("cx", mx.toFixed(1));
        markerCapRef.current.setAttribute("cy", (TRACT_CY - mh - 14).toFixed(1));
      }

      // breath particles drifting glottis -> lips through the drone
      for (let b = 0; b < BREATH; b++) {
        const el = breathRefs.current[b];
        if (!el) continue;
        const seed = breathSeed.current[b];
        const p = (now / 3400 + seed.phase) % 1;
        const fx = p; // 0 at glottis, 1 at lips
        const secF = fx * (N - 1);
        const si = clamp(Math.round(secF), 0, N - 1);
        const bx = TRACT_LEFT + fx * (TRACT_RIGHT - TRACT_LEFT);
        const by = TRACT_CY + seed.vy * dia[si] * DIA_SCALE * 0.62;
        el.setAttribute("cx", bx.toFixed(1));
        el.setAttribute("cy", by.toFixed(1));
        // fade near the tight constriction (squeezed through)
        const near = Math.exp(-Math.pow(secF - tongue, 2) / 10);
        el.setAttribute("opacity", (0.12 + 0.34 * (1 - near)).toFixed(2));
      }

      // ── draw the harmonic ladder ──
      const spec = specRef.current;
      const haveSpec = audioOnRef.current && engineRef.current && spec;
      if (haveSpec && engineRef.current) {
        engineRef.current.analyser.getFloatFrequencyData(spec);
      }
      const binHz = haveSpec
        ? srRef.current / (engineRef.current!.analyser.fftSize)
        : 1;
      const barBase = 196;
      const maxBarH = 150;
      let peak = 1e-6;
      const mags = new Array(NUM_HARMONICS + 1).fill(0);
      for (let h = 1; h <= NUM_HARMONICS; h++) {
        let m: number;
        if (haveSpec && spec) {
          const bin = clamp(Math.round((h * f0) / binHz), 0, spec.length - 1);
          const db = spec[bin];
          m = Math.pow(10, db / 20); // dB -> linear
        } else {
          // modeled spectrum for the silent demo: 1/f tilt + a formant bump
          const tilt = 1 / Math.pow(h, 0.85);
          const bump =
            1.15 * Math.exp(-Math.pow(h - effH, 2) / (2 * 0.85 * 0.85));
          m = 0.5 * tilt + bump + (h === 1 ? 0.95 : 0);
        }
        mags[h] = m;
        if (m > peak) peak = m;
      }
      for (let h = 1; h <= NUM_HARMONICS; h++) {
        const bar = barRefs.current[h - 1];
        const glow = glowRefs.current[h - 1];
        const norm = clamp(mags[h] / peak, 0, 1);
        const hgt = 4 + norm * maxBarH;
        // emphasis: proximity of this harmonic to the boosted overtone
        const emph = Math.exp(-Math.pow(h - effH, 2) / (2 * 0.62 * 0.62));
        if (bar) {
          bar.setAttribute("y", (barBase - hgt).toFixed(1));
          bar.setAttribute("height", hgt.toFixed(1));
          const col =
            h === 1
              ? VIOLET[300]
              : emph > 0.06
                ? MAGENTA
                : INDIGO;
          bar.setAttribute("fill", col);
          bar.setAttribute("opacity", (0.34 + 0.6 * Math.max(emph, h === 1 ? 0.7 : norm * 0.4)).toFixed(2));
        }
        if (glow) {
          glow.setAttribute("y", (barBase - hgt - 4).toFixed(1));
          glow.setAttribute("height", (hgt + 8).toFixed(1));
          glow.setAttribute("opacity", (emph * 0.55).toFixed(2));
        }
      }

      // ── readouts ──
      if (f0TextRef.current) f0TextRef.current.textContent = f0.toFixed(0) + " Hz";
      if (harmTextRef.current) {
        const hRound = Math.round(hRef.current);
        harmTextRef.current.textContent =
          hRound + "·f0 ≈ " + Math.round(hRound * f0) + " Hz";
      }
      if (tightTextRef.current)
        tightTextRef.current.textContent = constrictRef.current.toFixed(2);
      if (detuneTextRef.current) {
        const dv = detune;
        detuneTextRef.current.textContent =
          (dv >= 0 ? "+" : "") + dv.toFixed(2) + (Math.abs(dv) > 0.03 ? "  (clashing)" : "");
      }
      if (modeTextRef.current)
        modeTextRef.current.textContent = audioOnRef.current
          ? "live · physical tract"
          : "silent visual demo";

      raf = requestAnimationFrame(frame);
    };

    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  // teardown on unmount
  useEffect(() => {
    return () => {
      const eng = engineRef.current;
      if (eng) {
        try {
          eng.node.disconnect();
          eng.analyser.disconnect();
          eng.master.disconnect();
          URL.revokeObjectURL(eng.url);
          eng.ctx.close();
        } catch {
          /* ignore */
        }
      }
    };
  }, []);

  // static ladder scaffold positions
  const ladderX = (h: number) =>
    36 + ((h - 1) / (NUM_HARMONICS - 1)) * (VB_W - 70);
  const barW = 22;

  return (
    <main className="relative min-h-screen bg-background px-5 py-8 text-foreground sm:px-8">
      {/* header */}
      <header className="mx-auto max-w-5xl">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          Dream 2558 · biphonic vocal tract
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          Khoomei — one note that splits in two
        </h1>
        <p className="mt-2 max-w-2xl text-base text-muted-foreground">
          A single sustained tone divides into a droning fundamental and a
          piercing whistle overtone you sweep by hand — a Tuvan sygyt effect
          synthesized by a real Kelly–Lochbaum vocal tract. Slide the tight
          constriction and the whistle climbs the harmonic ladder over the
          steady drone.
        </p>
      </header>

      {/* stage */}
      <section className="mx-auto mt-6 grid max-w-5xl gap-4 lg:grid-cols-2">
        {/* vocal-tract cross-section */}
        <div className="rounded-lg border border-border bg-background/60 p-4">
          <div className="flex items-center justify-between">
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Vocal tract · constriction
            </p>
            <span
              ref={modeTextRef}
              className="font-mono text-xs text-primary"
            >
              silent visual demo
            </span>
          </div>
          <svg
            viewBox={`0 0 ${VB_W} ${VB_H}`}
            className="mt-3 w-full touch-none select-none"
            style={{ aspectRatio: `${VB_W} / ${VB_H}` }}
            onPointerDown={onTractPointer}
            onPointerMove={onTractPointer}
          >
            <defs>
              <linearGradient id="tractFill" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0" stopColor={VIOLET[800]} />
                <stop offset="0.5" stopColor={VIOLET[600]} />
                <stop offset="1" stopColor={MAGENTA} />
              </linearGradient>
            </defs>
            <rect x="0" y="0" width={VB_W} height={VB_H} fill={VIOLET[950]} />
            {/* centerline */}
            <line
              x1={TRACT_LEFT}
              y1={TRACT_CY}
              x2={TRACT_RIGHT}
              y2={TRACT_CY}
              stroke={NEUTRAL[400]}
              strokeWidth="0.75"
              strokeDasharray="3 5"
              opacity="0.5"
            />
            {/* tube fill */}
            <path
              ref={tractPathRef}
              d=""
              fill="url(#tractFill)"
              stroke={VIOLET[300]}
              strokeWidth="1"
              strokeOpacity="0.7"
            />
            {/* breath particles */}
            {Array.from({ length: BREATH }).map((_, i) => (
              <circle
                key={i}
                ref={(el) => {
                  breathRefs.current[i] = el;
                }}
                r="2.4"
                fill={VIOLET[100]}
                opacity="0.3"
              />
            ))}
            {/* constriction marker */}
            <line
              ref={markerRef}
              x1="0"
              y1="0"
              x2="0"
              y2="0"
              stroke={VIOLET[100]}
              strokeWidth="1.5"
              opacity="0.85"
            />
            <circle
              ref={markerCapRef}
              cx="0"
              cy="0"
              r="3"
              fill={VIOLET[100]}
            />
            {/* end labels (SVG art — raw hex allowed) */}
            <text
              x={TRACT_LEFT}
              y={VB_H - 8}
              fontSize="11"
              fill={NEUTRAL[600]}
              fontFamily="monospace"
            >
              glottis · drone
            </text>
            <text
              x={TRACT_RIGHT}
              y={VB_H - 8}
              fontSize="11"
              fill={NEUTRAL[600]}
              fontFamily="monospace"
              textAnchor="end"
            >
              lips
            </text>
          </svg>
        </div>

        {/* harmonic ladder */}
        <div className="rounded-lg border border-border bg-background/60 p-4">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Harmonic ladder · overtone
          </p>
          <svg
            viewBox={`0 0 ${VB_W} ${VB_H}`}
            className="mt-3 w-full select-none"
            style={{ aspectRatio: `${VB_W} / ${VB_H}` }}
          >
            <rect x="0" y="0" width={VB_W} height={VB_H} fill={VIOLET[950]} />
            {/* baseline */}
            <line
              x1="24"
              y1="196"
              x2={VB_W - 20}
              y2="196"
              stroke={NEUTRAL[400]}
              strokeWidth="0.75"
              opacity="0.5"
            />
            {Array.from({ length: NUM_HARMONICS }).map((_, idx) => {
              const h = idx + 1;
              const x = ladderX(h);
              return (
                <g key={h}>
                  <rect
                    ref={(el) => {
                      glowRefs.current[idx] = el;
                    }}
                    x={x - barW / 2 - 3}
                    y="196"
                    width={barW + 6}
                    height="0"
                    rx="4"
                    fill={MAGENTA}
                    opacity="0"
                  />
                  <rect
                    ref={(el) => {
                      barRefs.current[idx] = el;
                    }}
                    x={x - barW / 2}
                    y="196"
                    width={barW}
                    height="0"
                    rx="3"
                    fill={INDIGO}
                    opacity="0.4"
                  />
                  <text
                    x={x}
                    y="210"
                    fontSize="10"
                    fill={NEUTRAL[600]}
                    fontFamily="monospace"
                    textAnchor="middle"
                  >
                    {h === 1 ? "f0" : h + "·"}
                  </text>
                </g>
              );
            })}
          </svg>
          <p className="mt-1 text-center text-xs text-muted-foreground">
            steady fundamental (left) + a bright overtone that climbs as you
            sweep
          </p>
        </div>
      </section>

      {/* readouts */}
      <section className="mx-auto mt-4 grid max-w-5xl grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-md border border-border bg-background/60 p-3">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Drone f0
          </p>
          <span
            ref={f0TextRef}
            className="mt-1 block font-mono text-base text-foreground"
          >
            130 Hz
          </span>
        </div>
        <div className="rounded-md border border-border bg-background/60 p-3">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Overtone
          </p>
          <span
            ref={harmTextRef}
            className="mt-1 block font-mono text-base text-primary"
          >
            9·f0
          </span>
        </div>
        <div className="rounded-md border border-border bg-background/60 p-3">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Tightness
          </p>
          <span
            ref={tightTextRef}
            className="mt-1 block font-mono text-base text-foreground"
          >
            0.50
          </span>
        </div>
        <div className="rounded-md border border-border bg-background/60 p-3">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Detune / clash
          </p>
          <span
            ref={detuneTextRef}
            className="mt-1 block font-mono text-base text-foreground"
          >
            +0.00
          </span>
        </div>
      </section>

      {/* controls */}
      <section className="mx-auto mt-5 flex max-w-5xl flex-wrap items-center gap-3">
        {!running ? (
          <button
            type="button"
            onClick={handleStart}
            className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Start the drone
          </button>
        ) : (
          <button
            type="button"
            onClick={handleStop}
            className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            Silence
          </button>
        )}
        <p className="text-base text-muted-foreground">
          <span className="font-mono text-xs text-foreground">← →</span> sweep
          overtone ·{" "}
          <span className="font-mono text-xs text-foreground">↑ ↓</span> drone
          pitch ·{" "}
          <span className="font-mono text-xs text-foreground">z / x</span>{" "}
          tightness ·{" "}
          <span className="font-mono text-xs text-foreground">, / .</span>{" "}
          detune ·{" "}
          <span className="font-mono text-xs text-foreground">1–9</span> jump
          harmonic · drag the tract too
        </p>
      </section>

      {audioError && (
        <p className="mx-auto mt-4 max-w-5xl text-base text-destructive">
          {audioError}
        </p>
      )}

      {/* design notes affordance */}
      <button
        type="button"
        onClick={() => setShowNotes(true)}
        className="fixed bottom-4 right-4 z-30 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        Read the design notes
      </button>

      {showNotes && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Design notes · 2558 khoomei
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight">
              Two pitches from one tube
            </h2>
            <div className="mt-3 space-y-3 text-base text-muted-foreground">
              <p>
                The engine is a 1D Kelly–Lochbaum digital-waveguide vocal tract:
                44 cylindrical sections, each with an area, coupled by
                one-multiply scattering junctions — the model behind Neil
                Thapen&apos;s <em>Pink Trombone</em>. A sustained glottal drone
                excites the tube; the tube filters it.
              </p>
              <p>
                Squeezing one section to a near-pinch creates a sharp front-cavity
                resonance that isolates and amplifies a single harmonic of the
                drone. Sliding that constriction toward the lips shortens the
                front cavity, so the boosted harmonic climbs the series — a bright
                whistle rising over the low tone. That is the khoomei / sygyt
                biphonic effect, produced by the physics, not by adding a second
                oscillator.
              </p>
              <p>
                There is no scale and no pitch lattice: f0 is continuous, and the{" "}
                <span className="font-mono text-xs">detune</span> control drifts
                the emphasized overtone off the exact harmonic so it beats and
                clashes against the drone. The instrument is meant to be able to
                sound alien.
              </p>
              <p>
                References: Kelly &amp; Lochbaum, &ldquo;Speech synthesis&rdquo;
                (1962); Neil Thapen, <em>Pink Trombone</em> (2017); arXiv:2606.04943,
                differentiable articulatory copy-synthesis of biphonic singing
                (2026); the Tuvan khoomei / sygyt tradition. Honest caveat: the
                model runs headless — whether the overtone audibly splits cleanly
                from the drone has not been verified by ear.
              </p>
            </div>
            <button
              type="button"
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
