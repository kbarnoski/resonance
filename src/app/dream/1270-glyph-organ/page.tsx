"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import {
  createSafeFlicker,
  prefersReducedMotion,
} from "../_shared/psych/safeFlicker";
import { useMicAnalyser } from "../_shared/use-mic-analyser";

// ─────────────────────────────────────────────────────────────────────────────
// 1270 · GLYPH ORGAN
// The whole visual field is a living monospace TERMINAL. A ~90×40 grid of
// fixed-width characters is the medium — not sprites, not a shader, but glyphs
// aged through an ASCII luminance ramp `" .:-=+*#%@"`. You PLAY it: QWERTY rows
// are a just-intonation organ, and each keypress fires a Web-Audio note AND
// injects a bright glyph "impulse" into the grid. The field is an excitable
// typographic medium — every frame cells diffuse into neighbors and decay, so
// the terminal KEEPS COMPOSING after you stop, and a delayed transposed ECHO
// answers your phrase a beat later. Optional mic lets you sing/hum into it:
// onsets drop glyphs whose column is the detected pitch and loud transients
// ripple outward. Phosphor duotone (cyan glyphs on deep terminal indigo).
//
// INPUT: keyboard (plays with no mic) + optional mic onsets.
// OUTPUT: monospace ASCII glyph-grid on Canvas2D (fillText per luminance bucket).
// TECHNIQUE: audio ↔ excitable typographic field with generative echo/answer.
// REFERENCE: Ryoji Ikeda datamatics/test pattern · John Cage Empty Words · teletype ASCII art.
// ─────────────────────────────────────────────────────────────────────────────

const COLS = 90;
const ROWS = 40;
const N = COLS * ROWS;
const RAMP = " .:-=+*#%@"; // 10 levels — index 0 is empty (dark cell).

// ── Deterministic PRNG (mulberry32) — no Math.random anywhere ────────────────
function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (x: number, lo: number, hi: number) =>
  x < lo ? lo : x > hi ? hi : x;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

// ── The scale: 7-note just intonation over a wandering root ──────────────────
const JUST = [1, 9 / 8, 5 / 4, 4 / 3, 3 / 2, 5 / 3, 15 / 8];
const BASE_HZ = 130.81; // C3
const OCT_MUL = [1, 2, 4]; // low / mid / high rows

interface Note {
  freq: number;
  col: number;
  rowBand: number; // canonical grid row for this pitch
  oct: number;
}

// 21 notes: 3 octave-rows × 7 degrees. Column tracks overall pitch order.
const NOTES: Note[] = [];
for (let oct = 0; oct < 3; oct++) {
  for (let deg = 0; deg < 7; deg++) {
    const idx = oct * 7 + deg;
    const freq = BASE_HZ * OCT_MUL[oct] * JUST[deg];
    const col = Math.round(((idx + 0.5) / 21) * (COLS - 1));
    const rowBand = Math.round([0.8, 0.5, 0.2][oct] * (ROWS - 1));
    NOTES.push({ freq, col, rowBand, oct });
  }
}

// QWERTY → note index. Three rows, low→high. Keyboard works with no mic.
const ROW_KEYS = ["zxcvbnm", "asdfghj", "qwertyu"];
const KEY_MAP: Record<string, number> = {};
for (let r = 0; r < 3; r++) {
  for (let d = 0; d < 7; d++) {
    KEY_MAP[ROW_KEYS[r][d]] = r * 7 + d;
  }
}

// ── Engine: all mutable runtime state lives here (kept out of React) ─────────
interface EchoEvent {
  due: number; // seconds (performance clock)
  note: number; // note index
  strength: number;
}
interface Engine {
  cur: Float32Array;
  nxt: Float32Array;
  rng: () => number;
  begun: boolean;
  stopped: boolean;
  reduced: boolean;
  // audio graph
  audio: AudioContext | null;
  master: GainNode | null;
  drone: { osc: OscillatorNode; lfo: OscillatorNode; filt: BiquadFilterNode } | null;
  voiceCount: number;
  // generative bookkeeping
  echoes: EchoEvent[];
  nextAuto: number; // next autonomous-composer time (seconds)
  autoDeg: number; // wandering scale degree for the idle melody
  cursor: number; // roaming write-head position (idle animation)
  lastKeyAt: Record<string, number>;
  activity: number; // rolling measure of how hard the player is playing
}

function makeEngine(): Engine {
  return {
    cur: new Float32Array(N),
    nxt: new Float32Array(N),
    rng: makeRng(0x9e3779b9),
    begun: false,
    stopped: false,
    reduced: prefersReducedMotion(),
    audio: null,
    master: null,
    drone: null,
    voiceCount: 0,
    echoes: [],
    nextAuto: 0,
    autoDeg: 2,
    cursor: (ROWS >> 1) * COLS + (COLS >> 1),
    lastKeyAt: {},
    activity: 0,
  };
}

// ── Inject a glyph impulse: bright center + radial splash ─────────────────────
function applyImpulse(
  eng: Engine,
  col: number,
  row: number,
  strength: number,
  radius: number,
) {
  const cur = eng.cur;
  const R = Math.max(0, Math.round(radius));
  for (let dy = -R; dy <= R; dy++) {
    for (let dx = -R; dx <= R; dx++) {
      const dist = Math.hypot(dx, dy);
      if (dist > R + 0.5) continue;
      const x = ((col + dx) % COLS + COLS) % COLS;
      const y = ((row + dy) % ROWS + ROWS) % ROWS;
      const fall = strength * Math.exp(-dist * dist * 0.55);
      const i = y * COLS + x;
      cur[i] = Math.min(1.4, cur[i] + fall);
    }
  }
}

// ── One step of the excitable typographic medium: diffuse + decay ────────────
// Bright glyphs bloom outward into neighbors and AGE down the ramp — the field
// keeps evolving on its own after the player stops touching it.
function stepField(eng: Engine) {
  const cur = eng.cur;
  const nxt = eng.nxt;
  for (let y = 0; y < ROWS; y++) {
    const up = ((y - 1 + ROWS) % ROWS) * COLS;
    const dn = ((y + 1) % ROWS) * COLS;
    const row = y * COLS;
    for (let x = 0; x < COLS; x++) {
      const xl = (x - 1 + COLS) % COLS;
      const xr = (x + 1) % COLS;
      const c = cur[row + x];
      const avg = (cur[row + xl] + cur[row + xr] + cur[up + x] + cur[dn + x]) * 0.25;
      let v = c + (avg - c) * 0.17; // diffusion / spread
      v *= 0.963; // decay — age through the glyph ramp
      if (v < 0.0009) v = 0;
      nxt[row + x] = v;
    }
  }
  eng.cur = nxt;
  eng.nxt = cur;
}

// ── Web Audio: a small FM voice, pitched from a glyph event ───────────────────
function playVoice(eng: Engine, freq: number, strength: number) {
  const ctx = eng.audio;
  const out = eng.master;
  if (!ctx || !out || eng.voiceCount > 22) return;
  const now = ctx.currentTime;
  const dur = 0.5 + strength * 0.9;

  const car = ctx.createOscillator();
  car.type = "sine";
  car.frequency.value = freq;

  const mod = ctx.createOscillator();
  mod.type = "sine";
  const ratios = [1, 1.5, 2, 3];
  mod.frequency.value = freq * ratios[Math.floor(eng.rng() * ratios.length)];

  const modGain = ctx.createGain();
  const index = 90 + strength * 380;
  modGain.gain.setValueAtTime(index, now);
  modGain.gain.exponentialRampToValueAtTime(1, now + dur);
  mod.connect(modGain);
  modGain.connect(car.frequency);

  const vca = ctx.createGain();
  const peak = 0.15 * strength;
  vca.gain.setValueAtTime(0.0001, now);
  vca.gain.linearRampToValueAtTime(peak, now + 0.008);
  vca.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  car.connect(vca);
  vca.connect(out);

  car.start(now);
  mod.start(now);
  car.stop(now + dur + 0.03);
  mod.stop(now + dur + 0.03);
  eng.voiceCount++;
  car.onended = () => {
    eng.voiceCount = Math.max(0, eng.voiceCount - 1);
    car.disconnect();
    vca.disconnect();
    modGain.disconnect();
    mod.disconnect();
  };
}

// ── Fire a note: glyph impulse + sound + schedule a transposed ECHO answer ────
function runNote(
  eng: Engine,
  noteIdx: number,
  strength: number,
  radius: number,
  nowSec: number,
  scheduleEcho: boolean,
) {
  const note = NOTES[noteIdx];
  const jitter = Math.round((eng.rng() - 0.5) * 3);
  const row = clamp(note.rowBand + jitter, 0, ROWS - 1);
  applyImpulse(eng, note.col, row, strength, radius);
  playVoice(eng, note.freq, strength);
  eng.activity = Math.min(1, eng.activity + 0.25);
  // Answer the phrase: a beat later, echo it transposed up the scale, shifted
  // rightward and quieter. The field replies rather than mirroring.
  if (scheduleEcho && eng.rng() < 0.8) {
    const shift = eng.rng() < 0.5 ? 2 : 4; // up a third / a fifth in the set
    const echoIdx = clamp(noteIdx + shift, 0, NOTES.length - 1);
    eng.echoes.push({
      due: nowSec + 0.42 + eng.rng() * 0.12,
      note: echoIdx,
      strength: strength * 0.62,
    });
  }
}

// ── Batched glyph render: only active cells, grouped by luminance bucket ──────
function drawField(
  ctx: CanvasRenderingContext2D,
  eng: Engine,
  w: number,
  h: number,
  cellW: number,
  cellH: number,
  glow: number,
) {
  ctx.fillStyle = "#060814";
  ctx.fillRect(0, 0, w, h);

  const cur = eng.cur;
  const levels = RAMP.length;
  // Bucket the active cells so we set fillStyle ~10 times, not 3600.
  const buckets: number[][] = [];
  for (let b = 0; b < levels; b++) buckets.push([]);
  for (let i = 0; i < N; i++) {
    const e = cur[i];
    if (e < 0.02) continue;
    let b = Math.floor(e * levels);
    if (b >= levels) b = levels - 1;
    if (b <= 0) continue;
    buckets[b].push(i);
  }

  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  const fontSize = Math.floor(cellH * 0.92);
  ctx.font = `${fontSize}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;

  for (let b = 1; b < levels; b++) {
    const cells = buckets[b];
    if (cells.length === 0) continue;
    const t = b / (levels - 1);
    const r = Math.round(lerp(22, 205, Math.pow(t, 0.7)));
    const g = Math.round(lerp(92, 255, Math.pow(t, 0.6)));
    const bl = Math.round(lerp(108, 255, Math.pow(t, 0.6)));
    const alpha = clamp(lerp(0.32, 1, t) * glow, 0, 1);
    ctx.fillStyle = `rgba(${r},${g},${bl},${alpha})`;
    const ch = RAMP[b];
    for (let k = 0; k < cells.length; k++) {
      const i = cells[k];
      const cx = (i % COLS) * cellW + cellW / 2;
      const cy = Math.floor(i / COLS) * cellH + cellH / 2;
      ctx.fillText(ch, cx, cy);
    }
  }

  // Phosphor CRT dressing: scanlines + soft vignette. Per-cell glyphs already
  // carry the motion, so this is static chrome — no full-frame luminance flip.
  ctx.fillStyle = "rgba(0,0,0,0.16)";
  for (let y = 0; y < h; y += 3) ctx.fillRect(0, y, w, 1);
  const vg = ctx.createRadialGradient(w / 2, h / 2, h * 0.35, w / 2, h / 2, h * 0.95);
  vg.addColorStop(0, "rgba(0,0,0,0)");
  vg.addColorStop(1, "rgba(2,4,12,0.55)");
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, w, h);
}

export default function GlyphOrgan() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engRef = useRef<Engine | null>(null);
  const flickerRef = useRef(
    createSafeFlicker({ maxHz: 3, defaultHz: 0.3, floor: 0.72 }),
  );

  const [begun, setBegun] = useState(false);
  const [stopped, setStopped] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [micWanted, setMicWanted] = useState(false);

  const mic = useMicAnalyser({ smoothing: 0.7, onsetThreshold: 1.8 });
  const micRef = useRef(mic);
  micRef.current = mic;

  // ── The always-on render loop (idle-alive before Begin, silent) ────────────
  useEffect(() => {
    if (!engRef.current) engRef.current = makeEngine();
    const eng = engRef.current;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    flickerRef.current.enable();

    let raf = 0;
    let w = 0;
    let h = 0;
    let cellW = 0;
    let cellH = 0;
    const dpr = Math.min(2, window.devicePixelRatio || 1);

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      w = Math.max(320, rect.width);
      h = Math.max(200, rect.height);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cellW = w / COLS;
      cellH = h / ROWS;
    };
    resize();
    window.addEventListener("resize", resize);

    let last = performance.now();
    let acc = 0;

    const frame = (nowMs: number) => {
      const tSec = nowMs / 1000;
      const dt = Math.min(0.05, (nowMs - last) / 1000);
      last = nowMs;

      // Fixed-step field evolution (reduced-motion slows the medium down).
      const stepHz = eng.reduced ? 24 : 45;
      acc += dt;
      let steps = 0;
      while (acc >= 1 / stepHz && steps < 3) {
        stepField(eng);
        acc -= 1 / stepHz;
        steps++;
      }

      // Roaming write-head keeps the terminal alive even at rest (idle art).
      const drift = eng.reduced ? 0.35 : 1;
      if (eng.rng() < 0.9 * drift) {
        eng.cursor =
          (eng.cursor + (eng.rng() < 0.5 ? 1 : COLS + (eng.rng() < 0.5 ? -1 : 1))) % N;
        if (eng.cursor < 0) eng.cursor += N;
        eng.cur[eng.cursor] = Math.min(1.4, eng.cur[eng.cursor] + 0.14);
      }

      // Autonomous composer: a slow generative melody that fills the quiet.
      // It thins out while you play, so the field answers rather than drones.
      if (eng.nextAuto === 0) eng.nextAuto = tSec + 1.2;
      if (tSec >= eng.nextAuto) {
        const quiet = 1 - eng.activity;
        eng.autoDeg = (eng.autoDeg + (eng.rng() < 0.5 ? -1 : 1) + 7) % 7;
        const oct = eng.rng() < 0.4 ? 0 : eng.rng() < 0.7 ? 1 : 2;
        const idx = oct * 7 + eng.autoDeg;
        runNote(eng, idx, 0.4 + quiet * 0.25, 1, tSec, false);
        eng.nextAuto = tSec + (eng.reduced ? 2.4 : 1.0) + eng.rng() * 1.8 + eng.activity * 1.5;
      }

      // Deliver scheduled echoes — the field's "answer" to recent phrases.
      for (let k = eng.echoes.length - 1; k >= 0; k--) {
        if (tSec >= eng.echoes[k].due) {
          const ev = eng.echoes[k];
          runNote(eng, ev.note, ev.strength, 1, tSec, false);
          eng.echoes.splice(k, 1);
        }
      }

      // Mic: onsets drop a glyph at the detected pitch's column; loud
      // transients ripple outward and the organ softly answers the sung pitch.
      if (eng.begun && !eng.stopped && micRef.current.running) {
        const f = micRef.current.getFrame();
        if (f && f.onset && f.centroid > 40) {
          let nearest = 0;
          let best = Infinity;
          for (let i = 0; i < NOTES.length; i++) {
            const d = Math.abs(Math.log2(NOTES[i].freq) - Math.log2(f.centroid));
            if (d < best) {
              best = d;
              nearest = i;
            }
          }
          const strength = clamp(0.5 + f.amplitude * 1.4, 0.4, 1.3);
          const radius = 1 + Math.round(f.amplitude * 4);
          runNote(eng, nearest, strength, radius, tSec, true);
        }
      }

      eng.activity *= 0.985; // decay the "how hard are you playing" measure

      const glow = flickerRef.current.value(tSec);
      drawField(ctx, eng, w, h, cellW, cellH, glow);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    // Keyboard organ — active after Begin, no mic required.
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const key = e.key.toLowerCase();
      const idx = KEY_MAP[key];
      if (idx === undefined) return;
      if (!eng.begun || eng.stopped) return;
      e.preventDefault();
      const nowMs = performance.now();
      // Throttle auto-repeat so a held key builds texture without runaway.
      if (nowMs - (eng.lastKeyAt[key] ?? 0) < 85) return;
      eng.lastKeyAt[key] = nowMs;
      runNote(eng, idx, 0.95, 1, nowMs / 1000, true);
    };
    window.addEventListener("keydown", onKeyDown);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  // ── Begin: unlock audio, build the master chain + sustained drone bed ──────
  const begin = useCallback(() => {
    const eng = engRef.current;
    if (!eng || eng.begun) return;
    const Ctx: typeof AudioContext =
      window.AudioContext ||
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).webkitAudioContext;
    const ctx = new Ctx();
    void ctx.resume();

    const master = ctx.createGain();
    master.gain.value = 0.9;
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -8;
    limiter.knee.value = 6;
    limiter.ratio.value = 12;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.12;
    master.connect(limiter);
    limiter.connect(ctx.destination);

    // Soft sustained bed so the instrument is never silent.
    const droneGain = ctx.createGain();
    droneGain.gain.value = 0.05;
    const filt = ctx.createBiquadFilter();
    filt.type = "lowpass";
    filt.frequency.value = 520;
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.value = BASE_HZ / 2;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.06;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 220;
    lfo.connect(lfoGain);
    lfoGain.connect(filt.frequency);
    osc.connect(filt);
    filt.connect(droneGain);
    droneGain.connect(master);
    osc.start();
    lfo.start();

    eng.audio = ctx;
    eng.master = master;
    eng.drone = { osc, lfo, filt };
    eng.begun = true;
    eng.stopped = false;
    setBegun(true);
    setStopped(false);
  }, []);

  // ── Stop: instant kill of all sound + the drone bed ────────────────────────
  const stop = useCallback(() => {
    const eng = engRef.current;
    if (!eng) return;
    eng.stopped = true;
    eng.begun = false;
    eng.echoes = [];
    if (micRef.current.running) micRef.current.stop();
    setMicWanted(false);
    try {
      eng.drone?.osc.stop();
      eng.drone?.lfo.stop();
    } catch {
      /* already stopped */
    }
    void eng.audio?.close();
    eng.audio = null;
    eng.master = null;
    eng.drone = null;
    eng.voiceCount = 0;
    setBegun(false);
    setStopped(true);
  }, []);

  const toggleMic = useCallback(() => {
    if (micRef.current.running) {
      micRef.current.stop();
      setMicWanted(false);
    } else {
      setMicWanted(true);
      void micRef.current.start();
    }
  }, []);

  const btn =
    "min-h-[44px] px-4 py-2.5 rounded-lg font-mono text-base transition-colors";

  return (
    <main className="relative min-h-screen w-full bg-[#060814] text-foreground">
      {/* The terminal — the entire art surface is a monospace glyph grid. */}
      <div className="absolute inset-0">
        <canvas ref={canvasRef} className="h-full w-full" aria-hidden />
      </div>

      {/* Header / title chrome */}
      <div className="pointer-events-none relative z-10 flex flex-col gap-1 p-5 sm:p-7">
        <h1 className="font-semibold text-2xl text-foreground sm:text-3xl">
          Glyph Organ
        </h1>
        <p className="max-w-xl text-base text-muted-foreground">
          The screen is a living{" "}
          <span className="font-mono text-violet-200/90">terminal</span> you play.
          Type on the home row to sound a just-intonation organ; each key writes
          a glyph that spreads, ages, and answers you a beat later.
        </p>
      </div>

      {/* Transport */}
      <div className="pointer-events-auto absolute left-0 right-0 top-28 z-20 flex flex-wrap items-center gap-3 px-5 sm:top-32 sm:px-7">
        {!begun ? (
          <button
            onClick={begin}
            className={`${btn} bg-violet-400/90 text-[#04121a] hover:bg-violet-300`}
          >
            ▶ Begin
          </button>
        ) : (
          <button
            onClick={stop}
            className={`${btn} bg-violet-500/85 text-foreground hover:bg-violet-400`}
          >
            ■ Stop
          </button>
        )}
        <button
          onClick={toggleMic}
          disabled={!begun}
          className={`${btn} border ${
            micRef.current.running
              ? "border-violet-300/70 bg-violet-400/15 text-violet-100"
              : "border-border bg-muted text-muted-foreground hover:bg-accent"
          } disabled:opacity-40`}
        >
          {micRef.current.running ? "● mic: singing in" : "○ sing / hum (mic)"}
        </button>
        <span className="font-mono text-base text-muted-foreground">
          keys: z x c v b n m · a s d f g h j · q w e r t y u
        </span>
      </div>

      {/* Mic errors */}
      {micWanted && mic.error ? (
        <p className="absolute left-5 top-44 z-20 max-w-md font-mono text-base text-violet-300 sm:left-7">
          mic: {mic.error} — keyboard still plays fully.
        </p>
      ) : null}

      {/* Corner "Design notes" affordance */}
      <button
        onClick={() => setShowNotes((s) => !s)}
        className="absolute bottom-16 right-4 z-30 min-h-[44px] rounded-lg border border-border bg-black/60 px-4 py-2.5 font-mono text-base text-muted-foreground backdrop-blur hover:bg-black/80"
      >
        {showNotes ? "× close" : "Design notes"}
      </button>

      {showNotes ? (
        <div className="absolute bottom-32 right-4 z-30 max-w-sm rounded-xl border border-border bg-[#070a18]/95 p-5 font-mono text-base text-muted-foreground backdrop-blur">
          <p className="mb-2 text-foreground">A terminal you play.</p>
          <p className="mb-2">
            The grid is an <span className="text-violet-200">excitable medium</span>
            : each frame every cell diffuses into its neighbors and decays down
            the ramp{" "}
            <span className="text-violet-200">{" .:-=+*#%@"}</span>, so glyphs
            bloom outward and age. The field keeps composing after you stop.
          </p>
          <p className="mb-2">
            Keys map QWERTY rows to three octaves of a just-intonation scale.
            Every note writes a glyph AND sounds an FM voice — you see what you
            hear. A beat later the field replies with a transposed echo.
          </p>
          <p className="text-muted-foreground">
            Ref: Ikeda · <i>datamatics</i> · Cage · <i>Empty Words</i> · teletype
            ASCII.
          </p>
        </div>
      ) : null}

      {stopped && !begun ? (
        <p className="absolute bottom-16 left-4 z-20 font-mono text-base text-muted-foreground sm:left-7">
          stopped — press Begin to play again.
        </p>
      ) : null}

      <PrototypeNav slugs={["1270-glyph-organ"]} />
    </main>
  );
}
