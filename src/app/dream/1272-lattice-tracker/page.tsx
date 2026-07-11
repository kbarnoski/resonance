"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import {
  createSafeFlicker,
  prefersReducedMotion,
} from "../_shared/psych/safeFlicker";

// ─────────────────────────────────────────────────────────────────────────────
// 1272 · LATTICE TRACKER
// A music tracker living inside a live HTML spreadsheet whose rows recede into
// an infinite CSS-3D tunnel corridor. Columns are voices, rows are time steps.
// A playhead sweeps down; every filled cell in the struck row fires its voice
// through a just-intonation harmonic lattice. The DOM grid IS the instrument —
// no canvas, no WebGL. The whole surface is transformed with perspective +
// rotateX so upcoming rows stream toward you down a glowing corridor.
// ─────────────────────────────────────────────────────────────────────────────

const COLS = 8;
const ROWS = 16;

// Just-intonation degrees (7-note major-ish JI scale). Index by (deg-1).
const JI = [1, 9 / 8, 5 / 4, 4 / 3, 3 / 2, 5 / 3, 15 / 8];
const DEG_MAX = JI.length; // 7 usable degrees; 0 = rest

// Each column is a voice pinned to a pure harmonic of the root, so the whole
// grid is one consonant lattice (octaves × fifths × the harmonic series).
const ROOT = 55; // A1
const COL_MUL = [1, 3 / 2, 2, 3, 4, 6, 8, 12];
const COL_GAIN = [1.0, 0.86, 0.92, 0.74, 0.82, 0.62, 0.68, 0.52];
const DEG_LABEL = ["·", "1", "2", "3", "4", "5", "6", "7"];
const COL_RATIO_LABEL = ["1", "3/2", "2", "3", "4", "6", "8", "12"];

const FIRE_DECAY = 0.72; // seconds a fired row stays lit

const clamp = (x: number, lo: number, hi: number) =>
  x < lo ? lo : x > hi ? hi : x;

function freqFor(col: number, deg: number): number {
  return ROOT * COL_MUL[col] * JI[deg - 1];
}

// Column hue: teal (low registers) → lime (high). Cohesive terminal palette.
function colHue(col: number): number {
  return 158 - (col / (COLS - 1)) * 66; // ~158 → 92
}

// ── seeded PRNG ──────────────────────────────────────────────────────────────
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

// A gentle, consonant default arpeggio — favours chord tones (1,3,5), notes on
// downbeats, sparser in the bright upper voices.
function genPattern(seed: number): number[] {
  const rand = mulberry32(seed);
  const v = new Array<number>(ROWS * COLS).fill(0);
  const pool = [1, 3, 5, 1, 5, 3, 2, 6, 4, 7];
  for (let r = 0; r < ROWS; r++) {
    const onBeat = r % 4 === 0;
    for (let c = 0; c < COLS; c++) {
      const base = c < 2 ? 0.48 : c < 5 ? 0.32 : 0.2;
      const p = base * (onBeat ? 1.5 : 0.62);
      if (rand() < p) {
        v[r * COLS + c] = pool[Math.floor(rand() * pool.length)];
      }
    }
  }
  return v;
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
  trigger: (freq: number, vel: number, when: number) => void;
  start: () => void;
  stop: () => void;
  dispose: () => void;
}

function makeImpulseResponse(ctx: AudioContext, seed: number): AudioBuffer {
  const rand = mulberry32(seed);
  const rate = ctx.sampleRate;
  const len = Math.floor(rate * 2.4);
  const buf = ctx.createBuffer(2, len, rate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      const t = i / len;
      data[i] = (rand() * 2 - 1) * Math.pow(1 - t, 2.7) * 0.6;
    }
  }
  return buf;
}

function buildEngine(seed: number): Engine | null {
  const AC =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!AC) return null;
  const ctx = new AC();

  const master = ctx.createGain();
  master.gain.value = 0;
  master.connect(ctx.destination);

  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -18;
  comp.knee.value = 24;
  comp.ratio.value = 3.2;
  comp.attack.value = 0.006;
  comp.release.value = 0.28;
  comp.connect(master);

  // dry / wet (convolution reverb) split
  const dry = ctx.createGain();
  dry.gain.value = 0.82;
  dry.connect(comp);

  const conv = ctx.createConvolver();
  conv.buffer = makeImpulseResponse(ctx, seed);
  const wet = ctx.createGain();
  wet.gain.value = 0.55;
  conv.connect(wet);
  wet.connect(comp);

  const pre = ctx.createGain();
  pre.gain.value = 1;
  pre.connect(dry);
  pre.connect(conv);

  // voice pool — persistent oscillators, gate the gain (no per-hit alloc/leak)
  const voices: Voice[] = [];
  for (let i = 0; i < 16; i++) {
    const osc1 = ctx.createOscillator();
    osc1.type = "triangle";
    const osc2 = ctx.createOscillator();
    osc2.type = "sine";
    osc2.detune.value = 7;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 1200;
    filter.Q.value = 0.7;
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

  // drone bed — 3 detuned sines through a lowpass, always breathing softly
  const droneGain = ctx.createGain();
  droneGain.gain.value = 0.05;
  const droneLp = ctx.createBiquadFilter();
  droneLp.type = "lowpass";
  droneLp.frequency.value = 440;
  droneLp.connect(droneGain);
  droneGain.connect(pre);
  [ROOT, ROOT * 1.5, ROOT * 2].forEach((f, i) => {
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.value = f;
    o.detune.value = (i - 1) * 4;
    o.connect(droneLp);
    o.start();
  });
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 0.06;
  const lfoAmt = ctx.createGain();
  lfoAmt.gain.value = 0.022;
  lfo.connect(lfoAmt);
  lfoAmt.connect(droneGain.gain);
  lfo.start();

  const trigger = (freq: number, vel: number, when: number) => {
    const v = voices[vi];
    vi = (vi + 1) % voices.length;
    v.osc1.frequency.setValueAtTime(freq, when);
    v.osc2.frequency.setValueAtTime(freq, when);
    v.filter.frequency.setValueAtTime(Math.min(freq * 5 + 400, 9000), when);
    const g = v.gain.gain;
    const peak = clamp(0.11 * vel, 0.001, 0.2);
    try {
      g.cancelAndHoldAtTime(when);
    } catch {
      g.cancelScheduledValues(when);
      g.setValueAtTime(Math.max(g.value, 0.0001), when);
    }
    g.linearRampToValueAtTime(peak, when + 0.026);
    g.exponentialRampToValueAtTime(0.0006, when + 1.5);
  };

  const start = () => {
    void ctx.resume();
    const now = ctx.currentTime;
    master.gain.cancelScheduledValues(now);
    master.gain.setValueAtTime(Math.max(master.gain.value, 0.0001), now);
    master.gain.linearRampToValueAtTime(0.9, now + 0.4);
  };

  const stop = () => {
    const now = ctx.currentTime;
    master.gain.cancelScheduledValues(now);
    master.gain.setValueAtTime(Math.max(master.gain.value, 0.0001), now);
    master.gain.linearRampToValueAtTime(0, now + 0.06);
    window.setTimeout(() => {
      void ctx.suspend();
    }, 90);
  };

  const dispose = () => {
    try {
      void ctx.close();
    } catch {
      /* noop */
    }
  };

  return { ctx, trigger, start, stop, dispose };
}

// ─────────────────────────────────────────────────────────────────────────────

type Phase = "idle" | "playing";

export default function LatticeTracker() {
  const [values, setValues] = useState<number[]>(() => genPattern(1272));
  const [phase, setPhase] = useState<Phase>("idle");
  const [bpm, setBpm] = useState(66);
  const [focus, setFocus] = useState<number>(-1);
  const [supported, setSupported] = useState(true);
  const [infoOpen, setInfoOpen] = useState(false);
  const [seed, setSeed] = useState(1272);

  // refs (imperative animation path — no React re-render per frame)
  const engineRef = useRef<Engine | null>(null);
  const rafRef = useRef<number>(0);
  const startTimeRef = useRef<number>(0);
  const stepSecRef = useRef<number>(60 / 66);
  const nextStepRef = useRef<number>(0);
  const lastFireRef = useRef<number[]>(new Array(ROWS).fill(-999));
  const rowElsRef = useRef<Array<HTMLDivElement | null>>(
    new Array(ROWS).fill(null),
  );
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const valuesRef = useRef<number[]>(values);
  const flickerRef = useRef(
    createSafeFlicker({ maxHz: 3, defaultHz: 0.16, floor: 0.74 }),
  );
  const reducedRef = useRef(false);
  const rowDepthRef = useRef(66);

  // keep a live mirror of the grid for the audio scheduler
  useEffect(() => {
    valuesRef.current = values;
  }, [values]);

  // position every row along the tunnel for a given (fractional) playhead
  const positionAll = useCallback((pw: number, now: number) => {
    const depth = rowDepthRef.current;
    const vp = viewportRef.current;
    if (vp) {
      vp.style.setProperty(
        "--breath",
        flickerRef.current.value(now).toFixed(3),
      );
    }
    for (let r = 0; r < ROWS; r++) {
      const el = rowElsRef.current[r];
      if (!el) continue;
      // signed wrapped distance from the playhead → an infinite recycling tunnel
      let d = r - pw;
      d = d - ROWS * Math.round(d / ROWS);
      const y = -d * depth;
      const fire = Math.max(0, 1 - (now - lastFireRef.current[r]) / FIRE_DECAY);
      const near = Math.max(0, 1 - Math.abs(d) / 2);
      const op =
        d < 0 ? clamp(1 + d / 1.6, 0, 1) : clamp(1 - (d - 3) / 5.4, 0, 1);
      const z = fire * 30;
      el.style.transform = `translate3d(-50%, ${y.toFixed(
        1,
      )}px, ${z.toFixed(1)}px)`;
      el.style.opacity = op.toFixed(3);
      el.style.setProperty("--fire", fire.toFixed(3));
      el.style.setProperty("--near", near.toFixed(3));
      el.style.zIndex = String(2000 - Math.round(d * 12));
    }
  }, []);

  // main animation + scheduler loop
  const drawFrame = useCallback(() => {
    const eng = engineRef.current;
    if (!eng) return;
    const now = eng.ctx.currentTime;
    const step = stepSecRef.current;
    const pf = (now - startTimeRef.current) / step;
    const floorStep = Math.floor(pf);
    while (nextStepRef.current <= floorStep) {
      const idx = ((nextStepRef.current % ROWS) + ROWS) % ROWS;
      const when = Math.max(
        startTimeRef.current + nextStepRef.current * step,
        now,
      );
      const vals = valuesRef.current;
      for (let c = 0; c < COLS; c++) {
        const deg = vals[idx * COLS + c];
        if (deg > 0) {
          const f = freqFor(c, deg);
          const vel = COL_GAIN[c] * (0.7 + deg * 0.03);
          eng.trigger(f, vel, when);
        }
      }
      lastFireRef.current[idx] = when;
      nextStepRef.current++;
    }
    const pw = ((pf % ROWS) + ROWS) % ROWS;
    positionAll(pw, now);
    rafRef.current = requestAnimationFrame(drawFrame);
  }, [positionAll]);

  // detect environment on mount + lay out the resting tunnel preview
  useEffect(() => {
    const reduced = prefersReducedMotion();
    reducedRef.current = reduced;
    rowDepthRef.current = reduced ? 52 : 66;
    flickerRef.current.enable();
    const AC =
      typeof window !== "undefined" &&
      (window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext);
    if (!AC) setSupported(false);
    // resting preview: playhead near the top so rows recede ahead
    positionAll(0.5, 0);
    return () => {
      cancelAnimationFrame(rafRef.current);
      engineRef.current?.dispose();
      engineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const play = useCallback(() => {
    if (!supported) return;
    let eng = engineRef.current;
    if (!eng) {
      eng = buildEngine(424242);
      engineRef.current = eng;
      if (!eng) {
        setSupported(false);
        return;
      }
    }
    eng.start();
    startTimeRef.current = eng.ctx.currentTime + 0.08;
    nextStepRef.current = 0;
    for (let i = 0; i < ROWS; i++) lastFireRef.current[i] = -999;
    setPhase("playing");
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(drawFrame);
  }, [supported, drawFrame]);

  const stop = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    engineRef.current?.stop();
    setPhase("idle");
    positionAll(0.5, 0);
  }, [positionAll]);

  const onTempo = useCallback((v: number) => {
    setBpm(v);
    const newStep = 60 / v;
    const eng = engineRef.current;
    if (eng && rafRef.current) {
      const now = eng.ctx.currentTime;
      const pf = (now - startTimeRef.current) / stepSecRef.current;
      stepSecRef.current = newStep;
      startTimeRef.current = now - pf * newStep;
      nextStepRef.current = Math.floor(pf) + 1;
    } else {
      stepSecRef.current = newStep;
    }
  }, []);

  const cycleCell = useCallback((index: number) => {
    setValues((prev) => {
      const n = prev.slice();
      n[index] = (n[index] + 1) % (DEG_MAX + 1);
      return n;
    });
  }, []);

  const setCell = useCallback((index: number, val: number) => {
    setValues((prev) => {
      const n = prev.slice();
      n[index] = val;
      return n;
    });
  }, []);

  const onGridKey = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (focus < 0) return;
      const r = Math.floor(focus / COLS);
      const c = focus % COLS;
      if (e.key >= "0" && e.key <= "7") {
        setCell(focus, Number(e.key));
        e.preventDefault();
      } else if (e.key === "Backspace" || e.key === "Delete") {
        setCell(focus, 0);
        e.preventDefault();
      } else if (e.key === "ArrowRight") {
        setFocus(r * COLS + ((c + 1) % COLS));
        e.preventDefault();
      } else if (e.key === "ArrowLeft") {
        setFocus(r * COLS + ((c - 1 + COLS) % COLS));
        e.preventDefault();
      } else if (e.key === "ArrowDown") {
        setFocus((((r + 1) % ROWS) * COLS) + c);
        e.preventDefault();
      } else if (e.key === "ArrowUp") {
        setFocus((((r - 1 + ROWS) % ROWS) * COLS) + c);
        e.preventDefault();
      } else if (e.key === " " || e.key === "Enter") {
        cycleCell(focus);
        e.preventDefault();
      }
    },
    [focus, setCell, cycleCell],
  );

  const newPattern = useCallback(() => {
    const s = seed + 1;
    setSeed(s);
    setValues(genPattern(s));
  }, [seed]);

  const clearGrid = useCallback(() => {
    setValues(new Array(ROWS * COLS).fill(0));
  }, []);

  const reduced = reducedRef.current;
  const tilt = reduced ? 36 : 52;
  const cellW = 48;
  const maxBpm = reduced ? 96 : 132;

  return (
    <div
      className="relative min-h-screen w-full overflow-hidden bg-[#080b11] text-foreground"
      style={{
        // slow, safe global luminance breathing (gated by createSafeFlicker)
        filter: "brightness(var(--breath,1))",
      }}
      ref={viewportRef}
    >
      <StyleBlock />

      {/* corridor vignette */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(115% 85% at 50% 34%, rgba(30,54,52,0.35) 0%, rgba(8,11,17,0.2) 42%, #05070b 78%)",
        }}
      />

      {/* ── header ─────────────────────────────────────────────────────── */}
      <header className="relative z-30 px-5 pt-5 sm:px-8">
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
          <div>
            <h1 className="font-serif text-2xl tracking-tight text-foreground sm:text-3xl">
              Lattice Tracker
            </h1>
            <p className="mt-1 max-w-2xl text-base text-muted-foreground">
              A step-sequencer spreadsheet whose rows recede into a glowing 3D
              tunnel — type notes into cells and play the corridor as it streams
              toward you, tuned to a just-intonation harmonic lattice.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setInfoOpen((o) => !o)}
            className="min-h-[44px] shrink-0 rounded-lg border border-border bg-muted px-4 py-2.5 text-base text-foreground transition-colors hover:bg-accent"
          >
            {infoOpen ? "Hide notes" : "Design notes"}
          </button>
        </div>

        {/* controls */}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          {phase === "idle" ? (
            <button
              type="button"
              onClick={play}
              disabled={!supported}
              className="min-h-[44px] rounded-lg bg-[#b7ff4a] px-6 py-2.5 text-base font-semibold text-[#0b1206] shadow-[0_0_24px_rgba(183,255,74,0.35)] transition-colors hover:bg-[#c9ff74] disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
            >
              ▶ Play
            </button>
          ) : (
            <button
              type="button"
              onClick={stop}
              className="min-h-[44px] rounded-lg bg-violet-400/90 px-6 py-2.5 text-base font-semibold text-[#1a0508] transition-colors hover:bg-violet-300"
            >
              ■ Stop
            </button>
          )}

          <label className="flex min-h-[44px] items-center gap-2 rounded-lg border border-border bg-muted px-4 py-2 text-base text-muted-foreground">
            <span className="tabular-nums text-foreground">{bpm}</span>
            <span className="text-muted-foreground">bpm</span>
            <input
              type="range"
              min={40}
              max={maxBpm}
              value={bpm}
              onChange={(e) => onTempo(Number(e.target.value))}
              className="h-1.5 w-32 cursor-pointer accent-[#b7ff4a]"
              aria-label="Tempo in beats per minute"
            />
          </label>

          <button
            type="button"
            onClick={newPattern}
            className="min-h-[44px] rounded-lg border border-border bg-muted px-4 py-2.5 text-base text-foreground transition-colors hover:bg-accent"
          >
            ⟲ New pattern
          </button>
          <button
            type="button"
            onClick={clearGrid}
            className="min-h-[44px] rounded-lg border border-border bg-muted px-4 py-2.5 text-base text-foreground transition-colors hover:bg-accent"
          >
            Clear
          </button>
        </div>

        {!supported && (
          <p className="mt-3 text-base text-violet-300">
            Web Audio is unavailable in this browser — the tunnel will still
            move, but there is no sound.
          </p>
        )}

        {infoOpen && (
          <div className="mt-4 max-w-3xl rounded-xl border border-border bg-black/50 p-4 text-base leading-relaxed text-foreground backdrop-blur-sm">
            <p>
              <span className="text-foreground">Columns are voices</span>, pinned to
              pure harmonics of a 55&nbsp;Hz root (1, 3/2, 2, 3, 4, 6, 8, 12).{" "}
              <span className="text-foreground">Rows are time steps.</span> Click a
              cell to cycle its note 1→7 (a just-intonation scale degree), or
              focus a cell and type a digit. The playhead sweeps down; every
              filled cell in the struck row fires — and because every pitch is a
              rational ratio of the same root, the whole grid stays consonant.
              The table is a real DOM grid transformed into a receding corridor.
              Full design notes live in{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-sm text-foreground">
                README.md
              </code>
              .
            </p>
          </div>
        )}
      </header>

      {/* ── legend: column → voice register ────────────────────────────── */}
      <div className="relative z-30 mx-auto mt-4 flex max-w-[520px] flex-wrap justify-center gap-1.5 px-4">
        {Array.from({ length: COLS }).map((_, c) => (
          <span
            key={c}
            className="rounded-md border px-2 py-1 text-sm tabular-nums"
            style={
              {
                "--h": colHue(c),
                borderColor: `hsl(${colHue(c)} 60% 45% / 0.4)`,
                color: `hsl(${colHue(c)} 80% 72%)`,
                background: `hsl(${colHue(c)} 55% 12% / 0.5)`,
              } as React.CSSProperties
            }
            title={`Voice ${c + 1} · harmonic ×${COL_RATIO_LABEL[c]}`}
          >
            ×{COL_RATIO_LABEL[c]}
          </span>
        ))}
      </div>

      {/* ── the tunnel ─────────────────────────────────────────────────── */}
      <div
        className="lt-perspective relative z-10 mx-auto mt-2 w-full"
        style={{ height: "62vh", perspectiveOrigin: "50% 40%" }}
      >
        <div
          className="lt-stage"
          role="grid"
          aria-label="Lattice tracker step grid"
          tabIndex={0}
          onKeyDown={onGridKey}
          style={{ transform: `translateX(-50%) rotateX(${tilt}deg)` }}
        >
          {/* static corridor rails (the lattice walls) */}
          {Array.from({ length: COLS + 1 }).map((_, i) => {
            const off = (i - COLS / 2) * cellW;
            return (
              <div
                key={`rail-${i}`}
                aria-hidden
                className="lt-rail"
                style={{ transform: `translateX(${off}px)` }}
              />
            );
          })}

          {/* rows fly toward the camera */}
          {Array.from({ length: ROWS }).map((_, r) => (
            <div
              key={`row-${r}`}
              role="row"
              className="lt-row"
              ref={(el) => {
                rowElsRef.current[r] = el;
              }}
            >
              {Array.from({ length: COLS }).map((_, c) => {
                const index = r * COLS + c;
                const deg = values[index];
                const filled = deg > 0;
                return (
                  <div
                    key={c}
                    role="gridcell"
                    aria-label={`Voice ${c + 1}, step ${r + 1}: ${
                      filled ? `degree ${deg}` : "rest"
                    }`}
                    className={`lt-cell${filled ? " filled" : ""}${
                      focus === index ? " focus" : ""
                    }`}
                    style={{ "--h": colHue(c) } as React.CSSProperties}
                    onClick={() => {
                      setFocus(index);
                      cycleCell(index);
                    }}
                  >
                    {DEG_LABEL[deg]}
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        {/* fog that swallows the far end of the corridor */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 z-20 h-[45%]"
          style={{
            background:
              "linear-gradient(to bottom, #05070b 0%, rgba(5,7,11,0.75) 45%, rgba(5,7,11,0) 100%)",
          }}
        />
      </div>

      <p className="relative z-30 mx-auto mb-16 mt-1 max-w-xl px-4 text-center text-base text-muted-foreground">
        Click cells to compose · focus + type 0–7 · arrow keys to move
      </p>

      <PrototypeNav slugs={["1272-lattice-tracker"]} />
    </div>
  );
}

// ── scoped styles for the 3D grid ────────────────────────────────────────────
function StyleBlock() {
  return (
    <style>{`
      .lt-perspective { perspective: 640px; }
      .lt-stage {
        position: absolute;
        left: 50%;
        bottom: 8%;
        width: ${COLS * 48}px;
        transform-style: preserve-3d;
        transform-origin: 50% 100%;
        outline: none;
      }
      .lt-rail {
        position: absolute;
        left: 50%;
        bottom: 0;
        width: 2px;
        height: ${16 * 66 + 120}px;
        margin-left: -1px;
        transform-origin: 50% 100%;
        pointer-events: none;
        background: linear-gradient(
          to top,
          rgba(150,255,180,0.5) 0%,
          rgba(120,230,170,0.22) 35%,
          rgba(120,230,170,0) 82%
        );
      }
      .lt-row {
        position: absolute;
        left: 50%;
        bottom: 0;
        display: flex;
        gap: 4px;
        padding: 3px;
        border-radius: 10px;
        transform-style: preserve-3d;
        will-change: transform, opacity;
        background: rgba(120,255,180, calc(var(--near,0) * 0.05));
        box-shadow: 0 0 calc(var(--near,0) * 34px)
          rgba(180,255,150, calc(var(--near,0) * 0.28));
      }
      .lt-cell {
        width: 44px;
        height: 40px;
        display: grid;
        place-items: center;
        border-radius: 7px;
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        font-size: 16px;
        font-weight: 600;
        cursor: pointer;
        color: hsl(var(--h,120) 25% 55%);
        background: rgba(255,255,255,0.02);
        border: 1px solid hsl(var(--h,120) 35% 42% / 0.24);
        transition: box-shadow .18s ease, transform .12s ease,
          background .2s ease, color .2s ease, border-color .2s ease;
        user-select: none;
      }
      .lt-cell:hover { border-color: hsl(var(--h,120) 60% 55% / 0.6); }
      .lt-cell.filled {
        color: hsl(var(--h) 95% calc(60% + var(--fire,0) * 34%));
        background: hsl(var(--h) 60% 12% / calc(0.5 + var(--fire,0) * 0.4));
        border-color: hsl(var(--h) 90% 55% / calc(0.42 + var(--fire,0) * 0.5));
        box-shadow: 0 0 calc(4px + var(--fire,0) * 26px)
          hsl(var(--h) 95% 55% / calc(0.24 + var(--fire,0) * 0.62));
        text-shadow: 0 0 calc(2px + var(--fire,0) * 12px)
          hsl(var(--h) 95% 72% / 0.85);
        transform: translateZ(calc(var(--fire,0) * 22px))
          scale(calc(1 + var(--fire,0) * 0.12));
      }
      .lt-cell.focus {
        outline: 2px solid #eafff0;
        outline-offset: 2px;
        z-index: 1;
      }
    `}</style>
  );
}
