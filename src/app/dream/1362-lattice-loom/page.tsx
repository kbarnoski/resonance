"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import { startDroneBank, type DroneBank } from "../_shared/psych/droneBank";
import {
  createSafeFlicker,
  prefersReducedMotion,
} from "../_shared/psych/safeFlicker";

// ─────────────────────────────────────────────────────────────────────────────
// 1362 · LATTICE LOOM   (cycle-2 of 1272 · Lattice Tracker)
//
// A crystalline lattice woven from real DOM cells floating in CSS-3D space —
// NO canvas, NO WebGL. Three metric layers (lengths 3 / 5 / 7) stack into a
// slowly-rotating tilted volume. Each layer has its OWN phase-cursor sweeping
// at its OWN period; as a cursor crosses a seeded cell it LIGHTS the cell and
// sounds that column's just-intonation pitch. Because the three lengths are
// coprime, the lit pattern continuously de-phases and re-aligns — Steve Reich
// phase music made SPATIAL across the DOM. TIME here is carried by the drift of
// the sweeps, not by a 4/4 beat. Homage to Ryoji Ikeda's *datamatics* grids.
// ─────────────────────────────────────────────────────────────────────────────

const COLS = 7; // pitch columns (a full just-intonation scale)
const LAYERS = 3; // three metric layers = three "row-groups"
const LEN = [3, 5, 7]; // coprime pattern-lengths (LCM = 105 steps to re-align)
const OCT = [1, 2, 4]; // per-layer octave multiplier — layer 0 lowest
const ROOT = 110; // A2

// One consonant lattice: every column is a rational ratio of the same root.
const JI = [1, 9 / 8, 5 / 4, 4 / 3, 3 / 2, 5 / 3, 15 / 8];
const RATIO_LABEL = ["1", "9/8", "5/4", "4/3", "3/2", "5/3", "15/8"];

// Each layer sweeps at its own pulse → Reich-style continuous drift.
const BASE_PULSE = [0.4, 0.5, 0.6]; // seconds per step (slowed under reduced motion)

// Geometry (px) for the CSS-3D scene.
const CELL = 52;
const CELL_PITCH = 66;
const LAYER_GAP_Y = 118;
const LAYER_GAP_Z = 66;

const FIRE_DECAY = 0.72; // seconds a struck cell stays lit

// Physical key rows → the three metric layers (position in row = column = pitch).
const KEY_ROWS = [
  ["1", "2", "3", "4", "5", "6", "7"], // layer 0
  ["q", "w", "e", "r", "t", "y", "u"], // layer 1
  ["a", "s", "d", "f", "g", "h", "j"], // layer 2
];

const clamp = (x: number, lo: number, hi: number) =>
  x < lo ? lo : x > hi ? hi : x;

const hueFor = (layer: number) => 190 + layer * 12; // cyan → pale blue, clinical
const freqFor = (layer: number, col: number) =>
  ROOT * OCT[layer] * JI[col];
const velFor = (layer: number) => 0.95 - layer * 0.14;

// x-offset of a column, shared across layers so pitches align as a vertical
// lattice (short layers stay left-anchored — a visible warp that widens).
const xForCol = (col: number) => (col - (COLS - 1) / 2) * CELL_PITCH;
const yForLayer = (i: number) => (1 - i) * LAYER_GAP_Y; // layer 0 at bottom
const zForLayer = (i: number) => (i - 1) * LAYER_GAP_Z; // fan into depth

// ── seeded PRNG (deterministic idle auto-demo) ───────────────────────────────
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

function makeSeeds(all: boolean): boolean[][] {
  return LEN.map((l) => new Array<boolean>(l).fill(all));
}

// A gentle woven default so the loom is never blank on first glance.
function defaultSeeds(): boolean[][] {
  const s = makeSeeds(false);
  [0, 2].forEach((c) => (s[0][c] = true));
  [0, 2, 4].forEach((c) => (s[1][c] = true));
  [0, 1, 3, 4, 6].forEach((c) => (s[2][c] = true));
  return s;
}

function cloneSeeds(s: boolean[][]): boolean[][] {
  return s.map((row) => row.slice());
}

// ── Web Audio engine ─────────────────────────────────────────────────────────
interface Voice {
  osc1: OscillatorNode;
  osc2: OscillatorNode;
  filter: BiquadFilterNode;
  gain: GainNode;
}

interface Engine {
  ctx: AudioContext;
  drone: DroneBank;
  trigger: (freq: number, vel: number, when: number) => void;
  setDrive: (d: number) => void;
  start: () => void;
  stop: () => void;
  dispose: () => void;
}

function buildEngine(): Engine | null {
  const AC =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!AC) return null;
  const ctx = new AC();

  // master limiter chain — cap ≤ 0.22, compressor as safety limiter.
  const master = ctx.createGain();
  master.gain.value = 0.0001;
  master.connect(ctx.destination);

  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.knee.value = 22;
  comp.ratio.value = 4;
  comp.attack.value = 0.005;
  comp.release.value = 0.25;
  comp.connect(master);

  const pre = ctx.createGain();
  pre.gain.value = 1;
  pre.connect(comp);

  // just-intonation drone bed (shared primitive), sitting under the bells.
  const drone = startDroneBank(ctx, pre, { root: 55, peakGain: 0.1 });
  drone.setDrive(0.12);

  // persistent bell-voice pool — gate the gain, no per-hit allocation.
  const voices: Voice[] = [];
  for (let i = 0; i < 14; i++) {
    const osc1 = ctx.createOscillator();
    osc1.type = "triangle";
    const osc2 = ctx.createOscillator();
    osc2.type = "sine";
    osc2.detune.value = 6;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 1400;
    filter.Q.value = 0.8;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(gain);
    gain.connect(pre);
    osc1.start();
    osc2.start();
    voices.push({ osc1, osc2, filter, gain });
  }
  let vi = 0;

  const trigger = (freq: number, vel: number, when: number) => {
    const v = voices[vi];
    vi = (vi + 1) % voices.length;
    v.osc1.frequency.setValueAtTime(freq, when);
    v.osc2.frequency.setValueAtTime(freq, when);
    v.filter.frequency.setValueAtTime(Math.min(freq * 4 + 600, 9000), when);
    const g = v.gain.gain;
    const peak = clamp(0.13 * vel, 0.001, 0.16);
    try {
      g.cancelAndHoldAtTime(when);
    } catch {
      g.cancelScheduledValues(when);
      g.setValueAtTime(Math.max(g.value, 0.0001), when);
    }
    g.linearRampToValueAtTime(peak, when + 0.008);
    g.exponentialRampToValueAtTime(0.0006, when + 1.4);
  };

  const start = () => {
    void ctx.resume();
    const now = ctx.currentTime;
    master.gain.cancelScheduledValues(now);
    master.gain.setValueAtTime(Math.max(master.gain.value, 0.0001), now);
    master.gain.exponentialRampToValueAtTime(0.22, now + 1.4);
  };

  const stop = () => {
    const now = ctx.currentTime;
    master.gain.cancelScheduledValues(now);
    master.gain.setValueAtTime(Math.max(master.gain.value, 0.0001), now);
    master.gain.exponentialRampToValueAtTime(0.0001, now + 0.4);
    window.setTimeout(() => void ctx.suspend(), 480);
  };

  const dispose = () => {
    try {
      drone.stop();
    } catch {
      /* noop */
    }
    try {
      void ctx.close();
    } catch {
      /* noop */
    }
  };

  return {
    ctx,
    drone,
    trigger,
    setDrive: (d) => drone.setDrive(d),
    start,
    stop,
    dispose,
  };
}

// ─────────────────────────────────────────────────────────────────────────────

type Phase = "idle" | "playing";

export default function LatticeLoom() {
  const [seeds, setSeeds] = useState<boolean[][]>(() => defaultSeeds());
  const [phase, setPhase] = useState<Phase>("idle");
  const [supported, setSupported] = useState(true);
  const [infoOpen, setInfoOpen] = useState(false);

  // imperative animation path (refs — no React re-render per frame)
  const engineRef = useRef<Engine | null>(null);
  const rafRef = useRef<number>(0);
  const baseRef = useRef<number>(0); // clock value when the phase-cursors began
  const lastTRef = useRef<number>(0);
  const nextStepRef = useRef<number[]>(new Array(LAYERS).fill(0));
  const lastFireRef = useRef<number[][]>(
    LEN.map((l) => new Array<number>(l).fill(-999)),
  );
  const activityRef = useRef<number>(0.12);
  const lastInteractRef = useRef<number>(0);
  const nextDemoRef = useRef<number>(6);
  const demoRandRef = useRef<() => number>(mulberry32(1362));

  const seedsRef = useRef<boolean[][]>(seeds);
  const rotorRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<HTMLDivElement | null>(null);
  const sweepRefs = useRef<Array<HTMLDivElement | null>>(
    new Array(LAYERS).fill(null),
  );
  const cellRefs = useRef<Array<Array<HTMLButtonElement | null>>>(
    LEN.map((l) => new Array<HTMLButtonElement | null>(l).fill(null)),
  );

  const reducedRef = useRef(false);
  const pulsesRef = useRef<number[]>(BASE_PULSE);
  const rotSpeedRef = useRef<number>(9); // degrees / second
  const flickerRef = useRef(
    createSafeFlicker({ maxHz: 3, defaultHz: 0.09, floor: 0.82 }),
  );

  // keep the audio scheduler reading a live mirror of the grid
  useEffect(() => {
    seedsRef.current = seeds;
  }, [seeds]);

  // ── the single animation + scheduler loop ──────────────────────────────────
  const frame = useCallback(() => {
    rafRef.current = requestAnimationFrame(frame);
    const engine = engineRef.current;
    const t = engine ? engine.ctx.currentTime : performance.now() / 1000;
    const dt = Math.min(0.1, Math.max(0, t - lastTRef.current));
    lastTRef.current = t;
    const elapsed = t - baseRef.current;

    // slow, continuous rotation of the whole lattice (CSS transform, rAF-driven)
    const spin = (elapsed * rotSpeedRef.current) % 360;
    const tilt = reducedRef.current ? 8 : 14;
    if (rotorRef.current) {
      rotorRef.current.style.transform = `rotateX(${tilt}deg) rotateY(${spin.toFixed(2)}deg)`;
    }
    // gentle global luminance breathing (photosensitive-safe engine)
    if (sceneRef.current) {
      sceneRef.current.style.setProperty(
        "--breath",
        flickerRef.current.value(t).toFixed(3),
      );
    }

    // idle auto-demo — if nobody has touched it, drift the pattern deterministically
    if (t - lastInteractRef.current > 7 && t > nextDemoRef.current) {
      nextDemoRef.current = t + (reducedRef.current ? 2.6 : 1.7);
      mutateSeed();
    }

    const pulses = pulsesRef.current;
    for (let i = 0; i < LAYERS; i++) {
      const pulse = pulses[i];
      const L = LEN[i];
      const pf = elapsed / pulse;

      // schedule audio strikes exactly on the audio clock
      if (engine) {
        const floorStep = Math.floor(pf);
        while (nextStepRef.current[i] <= floorStep) {
          const step = nextStepRef.current[i];
          const col = ((step % L) + L) % L;
          const when = Math.max(baseRef.current + step * pulse, t);
          if (seedsRef.current[i][col]) {
            engine.trigger(freqFor(i, col), velFor(i), when);
            lastFireRef.current[i][col] = when;
            activityRef.current = Math.min(1, activityRef.current + 0.14);
          }
          nextStepRef.current[i] = step + 1;
        }
      }

      // fractional cursor position → move the sweep bar continuously
      const cursor = ((pf % L) + L) % L;
      const sx = xForCol(cursor);
      const sweep = sweepRefs.current[i];
      if (sweep) {
        sweep.style.transform = `translate(-50%, -50%) translateX(${sx.toFixed(1)}px)`;
      }

      // light each cell: proximity glow as the sweep nears + strike decay
      for (let col = 0; col < L; col++) {
        const el = cellRefs.current[i][col];
        if (!el) continue;
        let d = Math.abs(cursor - col);
        d = Math.min(d, L - d); // wrap distance around the loop
        const near = Math.max(0, 1 - d / 0.9);
        const fired = engine
          ? Math.max(0, 1 - (t - lastFireRef.current[i][col]) / FIRE_DECAY)
          : seedsRef.current[i][col]
            ? near
            : 0; // preview mode: light seeded cells as the cursor passes
        el.style.setProperty("--near", near.toFixed(3));
        el.style.setProperty("--fire", fired.toFixed(3));
      }
    }

    if (engine) {
      // drive the drone from recent strike density
      activityRef.current = Math.max(
        0.1,
        activityRef.current * Math.pow(0.5, dt / 0.7),
      );
      engine.setDrive(activityRef.current);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // deterministic idle mutation — nudges toward a pleasant density
  const mutateSeed = useCallback(() => {
    const rand = demoRandRef.current;
    setSeeds((prev) => {
      const total = prev.reduce((n, row) => n + row.length, 0);
      const on = prev.reduce(
        (n, row) => n + row.filter(Boolean).length,
        0,
      );
      const layer = Math.floor(rand() * LAYERS);
      const col = Math.floor(rand() * LEN[layer]);
      const next = cloneSeeds(prev);
      // keep it breathing around ~45% density
      next[layer][col] = on / total < 0.45 ? true : !next[layer][col];
      seedsRef.current = next;
      return next;
    });
  }, []);

  // detect environment, start the silent preview loop
  useEffect(() => {
    const reduced = prefersReducedMotion();
    reducedRef.current = reduced;
    pulsesRef.current = reduced ? BASE_PULSE.map((p) => p * 1.7) : BASE_PULSE;
    rotSpeedRef.current = reduced ? 3 : 9;
    flickerRef.current.enable();

    const AC =
      typeof window !== "undefined" &&
      (window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext);
    if (!AC) setSupported(false);

    baseRef.current = performance.now() / 1000;
    lastTRef.current = baseRef.current;
    lastInteractRef.current = baseRef.current;
    nextDemoRef.current = baseRef.current + 6;
    rafRef.current = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(rafRef.current);
      engineRef.current?.dispose();
      engineRef.current = null;
    };
  }, [frame]);

  const markInteract = useCallback(() => {
    const eng = engineRef.current;
    lastInteractRef.current = eng
      ? eng.ctx.currentTime
      : performance.now() / 1000;
  }, []);

  const begin = useCallback(() => {
    if (!supported) return;
    let eng = engineRef.current;
    if (!eng) {
      eng = buildEngine();
      engineRef.current = eng;
      if (!eng) {
        setSupported(false);
        return;
      }
    }
    eng.start();
    // switch the clock to the audio timebase and reset the phase cursors
    baseRef.current = eng.ctx.currentTime;
    lastTRef.current = eng.ctx.currentTime;
    lastInteractRef.current = eng.ctx.currentTime;
    nextDemoRef.current = eng.ctx.currentTime + 7;
    nextStepRef.current = new Array(LAYERS).fill(0);
    lastFireRef.current = LEN.map((l) => new Array<number>(l).fill(-999));
    setPhase("playing");
  }, [supported]);

  const stop = useCallback(() => {
    engineRef.current?.stop();
    setPhase("idle");
  }, []);

  const toggleCell = useCallback(
    (layer: number, col: number) => {
      markInteract();
      setSeeds((prev) => {
        const next = cloneSeeds(prev);
        const now = !next[layer][col];
        next[layer][col] = now;
        seedsRef.current = next;
        // immediate audible feedback when seeding a cell on
        const eng = engineRef.current;
        if (now && eng) {
          eng.trigger(freqFor(layer, col), velFor(layer), eng.ctx.currentTime);
          lastFireRef.current[layer][col] = eng.ctx.currentTime;
        }
        return next;
      });
    },
    [markInteract],
  );

  // keyboard: three physical key rows drive the three metric layers
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      for (let layer = 0; layer < LAYERS; layer++) {
        const col = KEY_ROWS[layer].indexOf(k);
        if (col >= 0 && col < LEN[layer]) {
          toggleCell(layer, col);
          e.preventDefault();
          return;
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleCell]);

  const clearGrid = useCallback(() => {
    markInteract();
    const next = makeSeeds(false);
    seedsRef.current = next;
    setSeeds(next);
  }, [markInteract]);

  const reweave = useCallback(() => {
    markInteract();
    const rand = mulberry32((Date.now() & 0xffff) | 1);
    const next = LEN.map((l, i) =>
      Array.from({ length: l }, () => rand() < (i === 0 ? 0.55 : 0.42)),
    );
    seedsRef.current = next;
    setSeeds(next);
  }, [markInteract]);

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-[#05070c] text-white">
      <StyleBlock />

      {/* cosmic vignette */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 90% at 50% 38%, rgba(18,40,58,0.4) 0%, rgba(6,9,14,0.25) 44%, #04060a 80%)",
        }}
      />

      {/* ── header ─────────────────────────────────────────────────────── */}
      <header className="relative z-30 px-5 pt-5 sm:px-8">
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
          <div>
            <h1 className="font-serif text-2xl tracking-tight text-white sm:text-3xl">
              Lattice Loom
            </h1>
            <p className="mt-1 max-w-2xl text-base text-white/80">
              A crystalline lattice of real DOM cells floating in CSS-3D space —
              three metric layers (lengths 3 / 5 / 7) whose phase-cursors sweep
              at their own periods, weaving polymetric light and just-intonation
              tone as they de-phase and re-align.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setInfoOpen((o) => !o)}
            className="min-h-[44px] shrink-0 rounded-lg border border-white/15 bg-white/[0.04] px-4 py-2.5 text-base text-white/85 transition-colors hover:bg-white/[0.1]"
          >
            {infoOpen ? "Hide notes" : "Design notes"}
          </button>
        </div>

        {/* controls */}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          {phase === "idle" ? (
            <button
              type="button"
              onClick={begin}
              disabled={!supported}
              className="min-h-[44px] rounded-lg bg-[#7fe9ff] px-6 py-2.5 text-base font-semibold text-[#04141a] shadow-[0_0_24px_rgba(127,233,255,0.35)] transition-colors hover:bg-[#a8f1ff] disabled:cursor-not-allowed disabled:bg-white/20 disabled:text-white/75"
            >
              ▶ Begin
            </button>
          ) : (
            <button
              type="button"
              onClick={stop}
              className="min-h-[44px] rounded-lg bg-rose-400/90 px-6 py-2.5 text-base font-semibold text-[#1a0508] transition-colors hover:bg-rose-300"
            >
              ■ Stop
            </button>
          )}

          <button
            type="button"
            onClick={reweave}
            className="min-h-[44px] rounded-lg border border-white/15 bg-white/[0.04] px-4 py-2.5 text-base text-white/85 transition-colors hover:bg-white/[0.1]"
          >
            ⟲ Reweave
          </button>
          <button
            type="button"
            onClick={clearGrid}
            className="min-h-[44px] rounded-lg border border-white/15 bg-white/[0.04] px-4 py-2.5 text-base text-white/85 transition-colors hover:bg-white/[0.1]"
          >
            Clear
          </button>
        </div>

        {!supported && (
          <p className="mt-3 text-base text-rose-300">
            Web Audio is unavailable in this browser — the lattice will still
            weave, but there is no sound.
          </p>
        )}

        {infoOpen && (
          <div className="mt-4 max-w-3xl rounded-xl border border-white/12 bg-black/55 p-4 text-base leading-relaxed text-white/80 backdrop-blur-sm">
            <p>
              <span className="text-white">Columns are pitches</span> — a
              just-intonation scale (1, 9/8, 5/4, 4/3, 3/2, 5/3, 15/8) above a
              110&nbsp;Hz root, so every cell is a rational ratio and the whole
              lattice stays consonant.{" "}
              <span className="text-white">
                Rows are three metric layers
              </span>{" "}
              of length 3, 5 and 7, each an octave apart. A phase-cursor sweeps
              each layer at its own period; when it crosses a lit cell the cell
              flares and its tone sounds. Because 3, 5 and 7 are coprime, the
              sweeps drift out of step and slowly re-align — Reich phase music
              spread across space rather than a beat. Type the{" "}
              <code className="rounded bg-white/10 px-1 py-0.5 text-sm text-white/90">
                1-7
              </code>
              ,{" "}
              <code className="rounded bg-white/10 px-1 py-0.5 text-sm text-white/90">
                q-u
              </code>{" "}
              and{" "}
              <code className="rounded bg-white/10 px-1 py-0.5 text-sm text-white/90">
                a-j
              </code>{" "}
              key rows (one row per layer) or tap the cells to weave. Full notes
              in{" "}
              <code className="rounded bg-white/10 px-1 py-0.5 text-sm text-white/90">
                README.md
              </code>
              .
            </p>
          </div>
        )}
      </header>

      {/* ── the loom ───────────────────────────────────────────────────── */}
      <div className="loom-stage relative z-10 mx-auto mt-2">
        <div ref={sceneRef} className="loom-scene" style={sceneStyle}>
          <div ref={rotorRef} className="loom-rotor">
            {Array.from({ length: LAYERS }).map((_, i) => {
              const hue = hueFor(i);
              const L = LEN[i];
              // horizontal weft thread spanning the layer's used columns
              const threadCenter = (xForCol(0) + xForCol(L - 1)) / 2;
              const threadW = (L - 1) * CELL_PITCH + CELL + 24;
              return (
                <div
                  key={`layer-${i}`}
                  className="loom-layer"
                  style={{
                    transform: `translate3d(0px, ${yForLayer(i)}px, ${zForLayer(i)}px)`,
                  }}
                >
                  <div
                    aria-hidden
                    className="loom-thread"
                    style={
                      {
                        "--h": hue,
                        width: `${threadW}px`,
                        transform: `translate(-50%, -50%) translateX(${threadCenter}px)`,
                      } as React.CSSProperties
                    }
                  />
                  <div
                    ref={(el) => {
                      sweepRefs.current[i] = el;
                    }}
                    aria-hidden
                    className="loom-sweep"
                    style={{ "--h": hue } as React.CSSProperties}
                  />
                  {Array.from({ length: L }).map((__, col) => {
                    const lit = seeds[i][col];
                    return (
                      <button
                        key={col}
                        type="button"
                        ref={(el) => {
                          cellRefs.current[i][col] = el;
                        }}
                        onClick={() => toggleCell(i, col)}
                        aria-label={`Layer ${i + 1}, pitch ${RATIO_LABEL[col]}: ${
                          lit ? "lit" : "off"
                        }`}
                        title={`Layer ${i + 1} · ×${OCT[i]} · ratio ${RATIO_LABEL[col]} · ${freqFor(
                          i,
                          col,
                        ).toFixed(1)} Hz`}
                        className={`loom-cell${lit ? " lit" : ""}`}
                        style={
                          {
                            "--h": hue,
                            "--x": `${xForCol(col)}px`,
                            "--seed": lit ? 1 : 0,
                          } as React.CSSProperties
                        }
                      >
                        <span>{RATIO_LABEL[col]}</span>
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* keymap legend */}
      <div className="relative z-30 mx-auto mt-1 flex max-w-xl flex-wrap justify-center gap-2 px-4 text-center">
        {["1-7", "q-u", "a-j"].map((row, i) => (
          <span
            key={row}
            className="rounded-md border px-2.5 py-1 text-sm tabular-nums"
            style={{
              borderColor: `hsl(${hueFor(i)} 60% 50% / 0.4)`,
              color: `hsl(${hueFor(i)} 75% 78%)`,
              background: `hsl(${hueFor(i)} 55% 12% / 0.5)`,
            }}
          >
            layer {i + 1} · keys {row} · len {LEN[i]}
          </span>
        ))}
      </div>

      <p className="relative z-30 mx-auto mb-16 mt-2 max-w-xl px-4 text-center text-base text-white/75">
        Tap cells or press the key rows to weave · press Begin for sound
      </p>

      <PrototypeNav slugs={["1362-lattice-loom"]} />
    </div>
  );
}

const sceneStyle: React.CSSProperties = {
  filter: "brightness(var(--breath,1))",
};

// ── scoped styles for the CSS-3D lattice ─────────────────────────────────────
function StyleBlock() {
  return (
    <style>{`
      .loom-stage {
        width: 100%;
        transform: scale(var(--fit, 1));
        transform-origin: top center;
      }
      @media (max-width: 640px) { .loom-stage { --fit: 0.62; } }
      @media (min-width: 641px) and (max-width: 900px) { .loom-stage { --fit: 0.82; } }
      .loom-scene {
        position: relative;
        width: 100%;
        height: 58vh;
        min-height: 360px;
        perspective: 1000px;
        perspective-origin: 50% 46%;
      }
      .loom-rotor {
        position: absolute;
        top: 50%;
        left: 50%;
        width: 0;
        height: 0;
        transform-style: preserve-3d;
        transform: rotateX(14deg) rotateY(0deg);
        will-change: transform;
      }
      .loom-layer {
        position: absolute;
        top: 0;
        left: 0;
        width: 0;
        height: 0;
        transform-style: preserve-3d;
      }
      .loom-thread {
        position: absolute;
        top: 0;
        left: 0;
        height: 1px;
        pointer-events: none;
        background: linear-gradient(
          90deg,
          transparent,
          hsl(var(--h,196) 70% 58% / 0.45),
          transparent
        );
      }
      .loom-sweep {
        position: absolute;
        top: 0;
        left: 0;
        width: 3px;
        height: ${CELL + 10}px;
        border-radius: 3px;
        transform: translate(-50%, -50%);
        background: linear-gradient(
          hsl(var(--h,196) 95% 80% / 0.95),
          hsl(var(--h,196) 90% 60% / 0.15)
        );
        box-shadow: 0 0 16px hsl(var(--h,196) 95% 68% / 0.75);
        pointer-events: none;
        will-change: transform;
      }
      .loom-cell {
        position: absolute;
        top: 0;
        left: 0;
        width: ${CELL}px;
        height: ${CELL}px;
        transform:
          translate(-50%, -50%)
          translateX(var(--x, 0px))
          translateZ(calc(var(--fire,0) * 26px))
          scale(calc(1 + var(--fire,0) * 0.14));
        display: grid;
        place-items: center;
        border-radius: 12px;
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        font-size: 13px;
        font-weight: 600;
        line-height: 1;
        cursor: pointer;
        -webkit-tap-highlight-color: transparent;
        user-select: none;
        color: hsl(var(--h,196) 45% calc(62% + var(--fire,0) * 34%)
          / calc(0.55 + var(--seed,0) * 0.4));
        background: hsl(var(--h,196) 60% 9%
          / calc(0.28 + var(--seed,0) * 0.24 + var(--fire,0) * 0.42));
        border: 1px solid hsl(var(--h,196) 75% 58%
          / calc(0.2 + var(--seed,0) * 0.32
                 + var(--seed,0) * var(--near,0) * 0.4
                 + var(--fire,0) * 0.5));
        box-shadow:
          0 0 calc(4px + var(--fire,0) * 30px
                   + var(--seed,0) * var(--near,0) * 12px)
          hsl(var(--h,196) 92% 62%
            / calc(var(--fire,0) * 0.7 + var(--seed,0) * var(--near,0) * 0.26));
        text-shadow: 0 0 calc(2px + var(--fire,0) * 12px)
          hsl(var(--h,196) 95% 78% / calc(0.3 + var(--fire,0) * 0.6));
        will-change: transform;
      }
      .loom-cell > span { opacity: calc(0.5 + var(--seed,0) * 0.45); }
      .loom-cell:focus-visible {
        outline: 2px solid #eafcff;
        outline-offset: 3px;
      }
    `}</style>
  );
}
