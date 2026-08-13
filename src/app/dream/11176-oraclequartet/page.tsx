"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createSafeMaster, type SafeMaster } from "../_shared/visionary/safeMaster";
import { PrototypeNav } from "../_shared/prototype-nav";
import { FactorOracle, oracleStep, mulberry32, type WalkHead } from "./oracle";

// ════════════════════════════════════════════════════════════════════════════
// Oracle Quartet (11176)
//
// THE ONE QUESTION: "What if a whole jazz combo — soloist, walking bass, comping
// — grew itself from a melody you give it and improvised over it endlessly,
// never repeating?"
//
// A faithful Factor Oracle (the OMax engine — Assayag & Dubnov, IRCAM) drives
// the SOLO line. The oracle is fed a bebop head on mount (or YOUR melody, dropped
// as an audio file), and thereafter improvises by walking its automaton: replay
// forward, or follow a suffix link to recombine into a new-but-coherent phrase.
//
// Around that soloist plays a self-generating trio over a looping ii–V–I in C:
//   • a walking upright bass (quarter notes, roots on the "one", approach tones),
//   • sparse rootless comping stabs on the off-beats,
//   • a soft synthesized ride/hat for swing.
// One shared look-ahead scheduler sequences all four voices on a swung eighth
// grid; the oracle's emitted scale degree is decoded into C major so the solo
// always sits over the changes.
//
// The stage is rendered in Canvas2D as a cool jazz-noir room: the solo as a
// scrolling brass-gold contour ribbon up top, bass as cyan pulses below, comp as
// soft teal blocks in the middle. Alive on mount with no gesture (visual-only
// transport); the first tap unlocks audio.
// ════════════════════════════════════════════════════════════════════════════

const SLUG = "11176-oraclequartet";
const SEED = 0x11176;

const BPM = 132;
const SWING = 0.6; // down-eighth gets 60% of the beat
const EIGHTHS_PER_LOOP = 32; // 4 bars × 4 beats × 2

// ── The C-major scale as semitone offsets. One tonal center keeps the FO solo
//    coherent over every chord of the ii–V–I. ─────────────────────────────────
const MAJOR = [0, 2, 4, 5, 7, 9, 11];

/** Decode a diatonic scale-step (…-1,0,1…) into MIDI, base = step 0. */
function stepToMidi(step: number, baseMidi: number): number {
  const oct = Math.floor(step / 7);
  const idx = ((step % 7) + 7) % 7;
  return baseMidi + oct * 12 + MAJOR[idx];
}

/** Quantize a MIDI note to the nearest C-major scale-step (relative to C). */
function midiToStep(midi: number): number {
  const rel = Math.round(midi) - 60; // C4 = 60 = step 0
  const oct = Math.floor(rel / 12);
  const semi = ((rel % 12) + 12) % 12;
  let best = 0;
  let bd = 99;
  for (let i = 0; i < 7; i++) {
    const d = Math.abs(MAJOR[i] - semi);
    if (d < bd) {
      bd = d;
      best = i;
    }
  }
  return oct * 7 + best;
}

function midiToFreq(m: number): number {
  return 440 * Math.pow(2, (m - 69) / 12);
}

// ── The changes: a 4-bar ii–V–I in C, one chord per bar. ─────────────────────
interface Chord {
  name: string;
  rootPc: number; // pitch class of the root
  tonesPc: number[]; // chord-tone pitch classes
  voicing: number[]; // rootless-ish comp voicing, absolute MIDI (mid register)
}
const PROGRESSION: Chord[] = [
  { name: "Dm7", rootPc: 2, tonesPc: [2, 5, 9, 0], voicing: [65, 69, 72, 76] }, // F A C E
  { name: "G7", rootPc: 7, tonesPc: [7, 11, 2, 5], voicing: [65, 71, 74, 77] }, //  F B D F
  { name: "Cmaj7", rootPc: 0, tonesPc: [0, 4, 7, 11], voicing: [64, 67, 71, 74] }, // E G B D
  { name: "Cmaj7", rootPc: 0, tonesPc: [0, 4, 7, 11], voicing: [64, 67, 71, 74] },
];

/** MIDI of pitch-class `pc` nearest to a reference note. */
function nearestMidi(pc: number, ref: number): number {
  let best = ref;
  let bd = 1e9;
  for (let m = ref - 12; m <= ref + 12; m++) {
    if (((m % 12) + 12) % 12 === pc) {
      const d = Math.abs(m - ref);
      if (d < bd) {
        bd = d;
        best = m;
      }
    }
  }
  return best;
}

/** Build a smooth 16-note (4 bars × 4 beats) walking bass line. */
function buildWalkingBass(rng: () => number): number[] {
  const out: number[] = [];
  let ref = 38; // D2-ish
  for (let b = 0; b < PROGRESSION.length; b++) {
    const cur = PROGRESSION[b];
    const nxt = PROGRESSION[(b + 1) % PROGRESSION.length];
    // beat 1 — the root
    const b1 = clampBass(nearestMidi(cur.rootPc, ref));
    out.push(b1);
    ref = b1;
    // beat 4 — chromatic approach to the next root
    const nextRoot = nearestMidi(nxt.rootPc, ref);
    const approach = clampBass(nextRoot + (rng() < 0.5 ? -1 : 1));
    // beats 2 & 3 — chord tones interpolating from root toward the approach
    const t2 = pickTone(cur.tonesPc, Math.round(b1 + (approach - b1) * 0.4));
    const t3 = pickTone(cur.tonesPc, Math.round(b1 + (approach - b1) * 0.72));
    out.push(clampBass(t2), clampBass(t3), approach);
    ref = approach;
  }
  return out;
}
function clampBass(m: number): number {
  while (m < 33) m += 12;
  while (m > 52) m -= 12;
  return m;
}
function pickTone(pcs: number[], ref: number): number {
  let best = ref;
  let bd = 1e9;
  for (const pc of pcs) {
    const m = nearestMidi(pc, ref);
    const d = Math.abs(m - ref);
    if (d < bd) {
      bd = d;
      best = m;
    }
  }
  return best;
}

/** A ~56-note modal/bebop head over C major, seeded and deterministic. */
function buildHead(rng: () => number): number[] {
  const steps: number[] = [];
  let s = 0; // start on C
  const N = 56;
  for (let i = 0; i < N; i++) {
    steps.push(s);
    // mostly stepwise, occasional third/fourth leap, gentle pull to center
    const r = rng();
    let mv: number;
    if (r < 0.5) mv = rng() < 0.5 ? 1 : -1;
    else if (r < 0.78) mv = rng() < 0.5 ? 2 : -2;
    else if (r < 0.9) mv = rng() < 0.5 ? 3 : -3;
    else mv = 0; // repeat / enclosure
    s += mv;
    // keep within a playable ~2-octave band, pull back toward center
    if (s > 11) s -= 5;
    if (s < -3) s += 5;
  }
  return steps;
}

// ── Synth voices ──────────────────────────────────────────────────────────────
interface AudioRig {
  ctx: AudioContext;
  safe: SafeMaster;
  bus: GainNode; // master trim into safe
  voices: Array<{ g: GainNode; end: number }>;
  muted: boolean;
}
const MAX_VOICES = 26;

/** Prune finished voices and steal the oldest if we're over the cap. */
function reserveVoice(rig: AudioRig, g: GainNode, end: number): void {
  const now = rig.ctx.currentTime;
  rig.voices = rig.voices.filter((v) => v.end > now - 0.05);
  if (rig.voices.length >= MAX_VOICES) {
    const victim = rig.voices.shift();
    if (victim) {
      try {
        victim.g.gain.cancelScheduledValues(now);
        victim.g.gain.setTargetAtTime(0, now, 0.02);
      } catch {
        /* noop */
      }
    }
  }
  rig.voices.push({ g, end });
}

function playBass(rig: AudioRig, midi: number, when: number, dur: number): void {
  const { ctx } = rig;
  const f = midiToFreq(midi);
  const osc = ctx.createOscillator();
  osc.type = "triangle";
  osc.frequency.value = f;
  const osc2 = ctx.createOscillator();
  osc2.type = "sine";
  osc2.frequency.value = f * 0.5; // sub
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 900;
  lp.Q.value = 0.6;
  const g = ctx.createGain();
  const peak = 0.5;
  g.gain.setValueAtTime(0.0001, when);
  g.gain.exponentialRampToValueAtTime(peak, when + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, when + dur * 0.95);
  osc.connect(lp);
  osc2.connect(lp);
  lp.connect(g);
  g.connect(rig.bus);
  osc.start(when);
  osc2.start(when);
  osc.stop(when + dur);
  osc2.stop(when + dur);
  reserveVoice(rig, g, when + dur);
}

function playComp(rig: AudioRig, voicing: number[], when: number, dur: number): void {
  const { ctx } = rig;
  const g = ctx.createGain();
  const peak = 0.11;
  g.gain.setValueAtTime(0.0001, when);
  g.gain.exponentialRampToValueAtTime(peak, when + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, when + dur * 0.9);
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 2400;
  lp.Q.value = 0.5;
  lp.connect(g);
  g.connect(rig.bus);
  for (const midi of voicing) {
    const o = ctx.createOscillator();
    o.type = "triangle";
    o.frequency.value = midiToFreq(midi);
    const od = ctx.createOscillator();
    od.type = "sine";
    od.frequency.value = midiToFreq(midi) * 1.003; // gentle chorus
    const vg = ctx.createGain();
    vg.gain.value = 0.5 / voicing.length + 0.06;
    o.connect(vg);
    od.connect(vg);
    vg.connect(lp);
    o.start(when);
    od.start(when);
    o.stop(when + dur);
    od.stop(when + dur);
  }
  reserveVoice(rig, g, when + dur);
}

function playSolo(rig: AudioRig, midi: number, when: number, dur: number): void {
  const { ctx } = rig;
  const f = midiToFreq(midi);
  const osc = ctx.createOscillator();
  osc.type = "sawtooth";
  osc.frequency.value = f;
  // a singing vibrato
  const vib = ctx.createOscillator();
  vib.type = "sine";
  vib.frequency.value = 5.2;
  const vibg = ctx.createGain();
  vibg.gain.value = f * 0.006;
  vib.connect(vibg);
  vibg.connect(osc.frequency);
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 2600;
  lp.Q.value = 0.9;
  const g = ctx.createGain();
  const peak = 0.2;
  g.gain.setValueAtTime(0.0001, when);
  g.gain.exponentialRampToValueAtTime(peak, when + 0.02);
  g.gain.setTargetAtTime(peak * 0.7, when + 0.05, 0.12);
  g.gain.exponentialRampToValueAtTime(0.0001, when + dur * 0.98);
  osc.connect(lp);
  lp.connect(g);
  g.connect(rig.bus);
  osc.start(when);
  vib.start(when);
  osc.stop(when + dur);
  vib.stop(when + dur);
  reserveVoice(rig, g, when + dur);
}

let noiseBufferCache: AudioBuffer | null = null;
function noiseBuffer(ctx: AudioContext): AudioBuffer {
  if (noiseBufferCache && noiseBufferCache.sampleRate === ctx.sampleRate) {
    return noiseBufferCache;
  }
  const len = Math.floor(ctx.sampleRate * 0.4);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  noiseBufferCache = buf;
  return buf;
}

function playRide(rig: AudioRig, when: number, accent: boolean): void {
  const { ctx } = rig;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx);
  const hp = ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 7000;
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = 9000;
  bp.Q.value = 0.7;
  const g = ctx.createGain();
  const peak = accent ? 0.05 : 0.03;
  const dur = accent ? 0.14 : 0.07;
  g.gain.setValueAtTime(peak, when);
  g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
  src.connect(hp);
  hp.connect(bp);
  bp.connect(g);
  g.connect(rig.bus);
  src.start(when);
  src.stop(when + dur + 0.02);
  reserveVoice(rig, g, when + dur);
}

// ── Visual event pools (fed by the scheduler, drawn in the rAF loop) ──────────
interface SoloDot {
  perf: number; // wall-clock time the note sounds (ms)
  y: number; // 0..1 pitch position
  jumped: boolean;
}
interface Pulse {
  perf: number;
  strength: number;
}
interface CompFlash {
  perf: number;
  y: number;
}

// ── Transport state (survives across scheduler ticks) ─────────────────────────
interface Transport {
  stepIndex: number; // running eighth counter
  nextTime: number; // next eighth boundary, in the ACTIVE clock domain (s)
  head: WalkHead; // oracle read-head
  lastState: number;
}

interface Params {
  pRecombine: number;
  soloDensity: number;
}

export default function OracleQuartetPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef(0);
  const rigRef = useRef<AudioRig | null>(null);
  const oracleRef = useRef<FactorOracle | null>(null);
  const rngRef = useRef<() => number>(mulberry32(SEED ^ 0x9e3779b9));
  const walkBassRef = useRef<number[]>([]);
  const transportRef = useRef<Transport>({
    stepIndex: 0,
    nextTime: 0,
    head: { p: 1 },
    lastState: 1,
  });
  const paramsRef = useRef<Params>({ pRecombine: 0.3, soloDensity: 0.62 });
  const reducedRef = useRef(false);

  // visual pools
  const soloDotsRef = useRef<SoloDot[]>([]);
  const bassPulseRef = useRef<Pulse[]>([]);
  const compFlashRef = useRef<CompFlash[]>([]);
  const beatPulseRef = useRef<Pulse[]>([]);
  const lastChordRef = useRef(0);

  const [audioOn, setAudioOn] = useState(false);
  const [muted, setMuted] = useState(false);
  const [pRecombine, setPRecombine] = useState(0.3);
  const [soloDensity, setSoloDensity] = useState(0.62);
  const [oracleSize, setOracleSize] = useState(0);
  const [jumps, setJumps] = useState(0);
  const [chordName, setChordName] = useState(PROGRESSION[0].name);
  const [showNotes, setShowNotes] = useState(false);
  const [status, setStatus] = useState<string>("seeded head — tap to hear it");
  const [error, setError] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);

  const jumpsRef = useRef(0);

  // ── Build the oracle + band once ─────────────────────────────────────────────
  useEffect(() => {
    const rng = mulberry32(SEED);
    const fo = new FactorOracle();
    fo.feed(buildHead(rng));
    oracleRef.current = fo;
    walkBassRef.current = buildWalkingBass(mulberry32(SEED ^ 0x51ed));
    transportRef.current.head.p = 1 + Math.floor(rng() * Math.max(1, fo.length - 1));
    rngRef.current = mulberry32(SEED ^ 0x9e3779b9);
    setOracleSize(fo.length);
    reducedRef.current =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);

  useEffect(() => {
    paramsRef.current.pRecombine = pRecombine;
  }, [pRecombine]);
  useEffect(() => {
    paramsRef.current.soloDensity = soloDensity;
  }, [soloDensity]);

  // ── The one look-ahead scheduler. Runs always; before audio it drives visuals
  //    on the performance clock, after audio it schedules real notes on the ctx
  //    clock. Both share the same transport + generative logic. ────────────────
  const scheduleStep = useCallback((idx: number, whenActive: number, audio: boolean) => {
    const fo = oracleRef.current;
    if (!fo) return;
    const rig = rigRef.current;
    const rng = rngRef.current;
    const params = paramsRef.current;
    const beatDur = 60 / BPM;

    // wall-clock time (ms) this event sounds, for the visuals
    let perf: number;
    if (audio && rig) {
      perf = performance.now() + (whenActive - rig.ctx.currentTime) * 1000;
    } else {
      perf = whenActive * 1000;
    }

    const pos = ((idx % EIGHTHS_PER_LOOP) + EIGHTHS_PER_LOOP) % EIGHTHS_PER_LOOP;
    const bar = Math.floor(pos / 8);
    const beat = Math.floor((pos % 8) / 2);
    const isDown = pos % 2 === 0;
    const chord = PROGRESSION[bar];

    if (bar !== lastChordRef.current) {
      lastChordRef.current = bar;
      setChordName(chord.name);
    }

    // — beat pulse (background), on every downbeat —
    if (isDown) {
      beatPulseRef.current.push({ perf, strength: beat === 0 ? 1 : 0.55 });
    }

    // — walking bass: a quarter note on each beat downbeat —
    if (isDown) {
      const midi = walkBassRef.current[bar * 4 + beat] ?? 38;
      if (audio && rig) playBass(rig, midi, whenActive, beatDur * 0.92);
      bassPulseRef.current.push({ perf, strength: beat === 0 ? 1 : 0.7 });
    }

    // — ride/hat: a soft tick on every eighth, accent on the beat —
    if (audio && rig) playRide(rig, whenActive, isDown);

    // — comping: sparse rootless stabs on the "and" of 2 and 4 —
    if (!isDown && (beat === 1 || beat === 3) && rng() < 0.62) {
      if (audio && rig) playComp(rig, chord.voicing, whenActive, beatDur * 0.9);
      const vy = chord.voicing[0];
      compFlashRef.current.push({ perf, y: 1 - (vy - 40) / 52 });
    }

    // — the Factor Oracle soloist —
    if (rng() < params.soloDensity) {
      const res = oracleStep(fo, transportRef.current.head, params.pRecombine, 2, rng);
      transportRef.current.lastState = res.state;
      // decode scale-step → MIDI, seated above the comp (base = C5 = 72)
      let midi = stepToMidi(res.symbol, 72);
      while (midi > 88) midi -= 12;
      while (midi < 64) midi += 12;
      const swung = isDown ? beatDur * SWING : beatDur * (1 - SWING);
      const dur = Math.min(beatDur * 0.9, swung * 1.6);
      if (audio && rig) playSolo(rig, midi, whenActive, dur * 0.95);
      soloDotsRef.current.push({
        perf,
        y: 1 - (midi - 60) / 30, // MIDI 60..90 → bottom..top
        jumped: res.jumped,
      });
      if (res.jumped) {
        jumpsRef.current += 1;
      }
    }
  }, []);

  // scheduler interval
  useEffect(() => {
    const LOOKAHEAD = 0.12;
    const beatDur = 60 / BPM;
    const tick = () => {
      const rig = rigRef.current;
      const audio = !!rig;
      const now = audio ? rig.ctx.currentTime : performance.now() / 1000;
      const t = transportRef.current;
      if (t.nextTime === 0) t.nextTime = now + 0.06;
      // if we fell far behind (tab was backgrounded), resync
      if (t.nextTime < now - 0.5) t.nextTime = now + 0.05;
      while (t.nextTime < now + LOOKAHEAD) {
        scheduleStep(t.stepIndex, t.nextTime, audio);
        const pos = t.stepIndex % EIGHTHS_PER_LOOP;
        const isDown = pos % 2 === 0;
        const dur = isDown ? beatDur * SWING : beatDur * (1 - SWING);
        t.nextTime += dur;
        t.stepIndex += 1;
      }
    };
    const id = window.setInterval(tick, 25);
    return () => window.clearInterval(id);
  }, [scheduleStep]);

  // periodic readout refresh (off the hot paths)
  useEffect(() => {
    const id = window.setInterval(() => {
      const fo = oracleRef.current;
      if (fo) setOracleSize(fo.length);
      setJumps(jumpsRef.current);
    }, 400);
    return () => window.clearInterval(id);
  }, []);

  // ── Canvas render loop ────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx2d = canvas.getContext("2d");
    if (!ctx2d) return;
    const g = ctx2d;

    let w = 0;
    let h = 0;
    let dpr = 1;
    const resize = () => {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      const rect = canvas.getBoundingClientRect();
      w = Math.max(320, rect.width);
      h = Math.max(320, rect.height);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    // scroll window: dots enter at the right, glide left, expire off the left
    const WINDOW_MS = 6000;

    const draw = () => {
      const now = performance.now();
      const reduced = reducedRef.current;

      // prune pools
      const cutoff = now - WINDOW_MS - 400;
      soloDotsRef.current = soloDotsRef.current.filter((d) => d.perf > cutoff);
      bassPulseRef.current = bassPulseRef.current.filter((p) => now - p.perf < 700);
      compFlashRef.current = compFlashRef.current.filter((p) => now - p.perf < 900);
      beatPulseRef.current = beatPulseRef.current.filter((p) => now - p.perf < 600);

      // ── background: deep blue-black vertical gradient ──
      const bg = g.createLinearGradient(0, 0, 0, h);
      bg.addColorStop(0, "#05070d");
      bg.addColorStop(0.6, "#070c16");
      bg.addColorStop(1, "#04060c");
      g.fillStyle = bg;
      g.fillRect(0, 0, w, h);

      // gentle beat bloom (eased, small amplitude — luminance-calm)
      let beatGlow = 0;
      for (const p of beatPulseRef.current) {
        const age = (now - p.perf) / 600;
        if (age < 0 || age > 1) continue;
        beatGlow += (1 - age) * (1 - age) * p.strength;
      }
      beatGlow = Math.min(1, beatGlow) * (reduced ? 0.05 : 0.11);
      if (beatGlow > 0.001) {
        const rg = g.createRadialGradient(w / 2, h * 0.62, 0, w / 2, h * 0.62, h * 0.7);
        rg.addColorStop(0, `rgba(53,201,216,${beatGlow})`);
        rg.addColorStop(1, "rgba(53,201,216,0)");
        g.fillStyle = rg;
        g.fillRect(0, 0, w, h);
      }

      // faint horizontal register lines
      g.strokeStyle = "rgba(30,64,84,0.28)";
      g.lineWidth = 1;
      for (let i = 1; i < 6; i++) {
        const y = (h * i) / 6;
        g.beginPath();
        g.moveTo(0, y);
        g.lineTo(w, y);
        g.stroke();
      }

      const rightX = w * 0.97;
      const leftX = w * 0.04;
      const spanX = rightX - leftX;
      const xFor = (perf: number) => {
        const age = (now - perf) / WINDOW_MS; // 0 = now (right), 1 = old (left)
        return rightX - age * spanX;
      };

      // ── comp flashes: soft teal blocks mid-field ──
      for (const c of compFlashRef.current) {
        const age = (now - c.perf) / 900;
        if (age < 0 || age > 1) continue;
        const a = (1 - age) * 0.22;
        const x = xFor(c.perf);
        const cy = h * (0.42 + c.y * 0.16);
        g.fillStyle = `rgba(42,143,158,${a})`;
        const bw = 46;
        const bh = 26;
        g.fillRect(x - bw / 2, cy - bh / 2, bw, bh);
      }

      // ── bass pulses: cyan blooms low ──
      for (const p of bassPulseRef.current) {
        const age = (now - p.perf) / 700;
        if (age < 0 || age > 1) continue;
        const x = xFor(p.perf);
        const by = h * 0.86;
        const rad = (18 + p.strength * 30) * (0.5 + 0.5 * (1 - age));
        const a = (1 - age) * (reduced ? 0.3 : 0.45) * p.strength;
        const rg = g.createRadialGradient(x, by, 0, x, by, rad);
        rg.addColorStop(0, `rgba(53,201,216,${a})`);
        rg.addColorStop(1, "rgba(53,201,216,0)");
        g.fillStyle = rg;
        g.beginPath();
        g.arc(x, by, rad, 0, Math.PI * 2);
        g.fill();
      }

      // ── solo contour ribbon: brass-gold, connecting recent notes ──
      const dots = soloDotsRef.current.filter((d) => d.perf <= now);
      if (dots.length > 1) {
        g.lineWidth = 2;
        g.strokeStyle = "rgba(232,180,92,0.42)";
        g.beginPath();
        for (let i = 0; i < dots.length; i++) {
          const d = dots[i];
          const x = xFor(d.perf);
          const y = h * (0.06 + d.y * 0.5);
          if (i === 0) g.moveTo(x, y);
          else g.lineTo(x, y);
        }
        g.stroke();
      }
      for (const d of dots) {
        const age = (now - d.perf) / WINDOW_MS;
        const x = xFor(d.perf);
        const y = h * (0.06 + d.y * 0.5);
        const fade = 1 - age;
        const glow = d.jumped ? 1 : 0.55;
        const rad = 3 + glow * 4;
        const rg = g.createRadialGradient(x, y, 0, x, y, rad * 4);
        rg.addColorStop(0, `rgba(240,200,120,${0.85 * fade})`);
        rg.addColorStop(0.4, `rgba(232,180,92,${0.4 * fade * glow})`);
        rg.addColorStop(1, "rgba(232,180,92,0)");
        g.fillStyle = rg;
        g.beginPath();
        g.arc(x, y, rad * 4, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = `rgba(255,232,190,${0.95 * fade})`;
        g.beginPath();
        g.arc(x, y, rad * 0.7, 0, Math.PI * 2);
        g.fill();
        // a recombination ring marks a suffix-link jump
        if (d.jumped && age < 0.25) {
          g.strokeStyle = `rgba(240,210,140,${0.5 * (1 - age / 0.25)})`;
          g.lineWidth = 1.5;
          g.beginPath();
          g.arc(x, y, rad + age * 40, 0, Math.PI * 2);
          g.stroke();
        }
      }

      // now-line (the "reed") at the right edge
      g.strokeStyle = "rgba(232,180,92,0.3)";
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(rightX, h * 0.05);
      g.lineTo(rightX, h * 0.6);
      g.stroke();

      rafRef.current = requestAnimationFrame(draw);
    };
    rafRef.current = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
    };
  }, []);

  // ── audio teardown on unmount ─────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      const rig = rigRef.current;
      if (rig) {
        try {
          rig.safe.disconnect();
        } catch {
          /* noop */
        }
        try {
          void rig.ctx.close();
        } catch {
          /* noop */
        }
      }
    };
  }, []);

  // ── start audio on gesture ────────────────────────────────────────────────────
  const startAudio = useCallback(async () => {
    if (rigRef.current) return;
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AC();
    try {
      await ctx.resume();
    } catch {
      /* resumes on gesture */
    }
    const safe = createSafeMaster(ctx, { gain: 0.85 });
    const bus = ctx.createGain();
    bus.gain.value = 0.9;
    bus.connect(safe.input);
    rigRef.current = { ctx, safe, bus, voices: [], muted: false };
    // hand the transport a fresh boundary in the ctx domain
    transportRef.current.nextTime = 0;
    setAudioOn(true);
    setStatus("live — the quartet is improvising");
  }, []);

  const toggleMute = useCallback(() => {
    const rig = rigRef.current;
    if (!rig) return;
    rig.muted = !rig.muted;
    rig.bus.gain.setTargetAtTime(rig.muted ? 0 : 0.9, rig.ctx.currentTime, 0.05);
    setMuted(rig.muted);
  }, []);

  // ── file drop → analyze → feed the oracle YOUR melody ────────────────────────
  const analyzeFile = useCallback(async (file: File) => {
    setError(null);
    setAnalyzing(true);
    setStatus(`listening to "${file.name}"…`);
    try {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const tmp = new AC();
      const arr = await file.arrayBuffer();
      const audioBuf = await tmp.decodeAudioData(arr);
      void tmp.close();
      const steps = extractMelody(audioBuf);
      if (steps.length < 6) {
        setError("Couldn't find a clear melody — keeping the seeded head.");
        setStatus("live — seeded head (drop was unclear)");
        setAnalyzing(false);
        return;
      }
      const fo = new FactorOracle();
      fo.feed(steps);
      oracleRef.current = fo;
      transportRef.current.head.p = 1;
      jumpsRef.current = 0;
      setOracleSize(fo.length);
      setStatus(`improvising your melody — ${steps.length} notes fed`);
    } catch {
      setError("Couldn't decode that file — the quartet plays on.");
      setStatus("live — seeded head (decode failed)");
    } finally {
      setAnalyzing(false);
    }
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const f = e.dataTransfer.files?.[0];
      if (f) {
        void startAudio();
        void analyzeFile(f);
      }
    },
    [analyzeFile, startAudio],
  );
  const onFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      if (f) {
        void startAudio();
        void analyzeFile(f);
      }
    },
    [analyzeFile, startAudio],
  );

  // ── click / key to add live solo material to the oracle ──────────────────────
  const addLiveNote = useCallback((step: number) => {
    const fo = oracleRef.current;
    if (!fo) return;
    fo.addLetter(step);
    setOracleSize(fo.length);
  }, []);

  const onCanvasClick = useCallback(
    (e: React.MouseEvent) => {
      if (!audioOn) {
        void startAudio();
        return;
      }
      const rect = (e.target as HTMLElement).getBoundingClientRect();
      const rel = 1 - (e.clientY - rect.top) / rect.height; // bottom..top → low..high
      const midi = 64 + Math.round(rel * 24);
      addLiveNote(midiToStep(midi));
    },
    [audioOn, startAudio, addLiveNote],
  );

  useEffect(() => {
    const keys = "asdfghjk"; // 8 scale steps
    const onKey = (e: KeyboardEvent) => {
      const idx = keys.indexOf(e.key.toLowerCase());
      if (idx >= 0) {
        if (!rigRef.current) void startAudio();
        addLiveNote(idx);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [addLiveNote, startAudio]);

  return (
    <main className="min-h-dvh bg-background text-foreground">
      <div className="mx-auto max-w-5xl px-5 py-8 sm:py-12">
        <header className="mb-6">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Dream 11176 · Factor Oracle · OMax
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
            Oracle Quartet
          </h1>
          <p className="mt-2 max-w-2xl text-base text-muted-foreground">
            A self-playing jazz combo that grows a soloist from a melody you give it and
            improvises over walking bass and comping — endlessly, never quite repeating.
          </p>
        </header>

        <section
          className="relative overflow-hidden rounded-lg border border-border"
          onDrop={onDrop}
          onDragOver={(e) => e.preventDefault()}
        >
          <canvas
            ref={canvasRef}
            onClick={onCanvasClick}
            className="block h-[52vh] max-h-[560px] min-h-[320px] w-full cursor-pointer"
            aria-label="Jazz-noir stage: brass-gold solo ribbon above, cyan bass pulses below."
          />
          {!audioOn && (
            <button
              type="button"
              onClick={() => void startAudio()}
              className="absolute inset-0 flex items-center justify-center bg-background/20 backdrop-blur-[1px]"
            >
              <span className="min-h-[44px] rounded-md bg-primary px-6 py-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90">
                Tap to play the quartet
              </span>
            </button>
          )}
        </section>

        {/* transport row */}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          {audioOn ? (
            <button
              type="button"
              onClick={toggleMute}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              {muted ? "Unmute" : "Mute"}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void startAudio()}
              className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Play
            </button>
          )}

          <label className="min-h-[44px] cursor-pointer rounded-md border border-border bg-background/60 px-4 py-3 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
            {analyzing ? "Listening…" : "Feed a melody (WAV/MP3)"}
            <input
              type="file"
              accept="audio/*"
              className="hidden"
              onChange={onFileInput}
            />
          </label>

          <button
            type="button"
            onClick={() => setShowNotes((s) => !s)}
            className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            Design notes
          </button>

          <span className="rounded-md bg-primary/20 px-2 py-1 font-mono text-xs uppercase tracking-[0.18em] text-primary">
            {chordName}
          </span>
        </div>

        {/* sliders */}
        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          <div>
            <label
              htmlFor="recombine"
              className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground"
            >
              Recombination · {(pRecombine * 100).toFixed(0)}%
            </label>
            <input
              id="recombine"
              type="range"
              min={0}
              max={0.6}
              step={0.01}
              value={pRecombine}
              onChange={(e) => setPRecombine(parseFloat(e.target.value))}
              className="mt-2 w-full accent-primary"
            />
          </div>
          <div>
            <label
              htmlFor="density"
              className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground"
            >
              Solo density · {(soloDensity * 100).toFixed(0)}%
            </label>
            <input
              id="density"
              type="range"
              min={0.2}
              max={0.95}
              step={0.01}
              value={soloDensity}
              onChange={(e) => setSoloDensity(parseFloat(e.target.value))}
              className="mt-2 w-full accent-primary"
            />
          </div>
        </div>

        {/* readouts */}
        <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2">
          <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            oracle states · <span className="text-foreground">{oracleSize}</span>
          </span>
          <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            recombinations · <span className="text-foreground">{jumps}</span>
          </span>
          <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            {status}
          </span>
          {error && (
            <span className="rounded-md bg-destructive/15 px-2 py-1 font-mono text-xs uppercase tracking-[0.18em] text-destructive">
              {error}
            </span>
          )}
        </div>

        <p className="mt-4 text-sm text-muted-foreground">
          Click the stage (height = pitch) or press{" "}
          <span className="font-mono text-foreground">a s d f g h j k</span> to feed the
          soloist live notes. Drop an audio file to make it improvise your melody.
        </p>

        {showNotes && (
          <div className="mt-6 rounded-lg border border-border bg-background p-6 text-sm leading-relaxed text-muted-foreground">
            <h2 className="text-xl font-semibold tracking-tight text-foreground">
              Design notes
            </h2>
            <p className="mt-3">
              The soloist is a genuine <strong className="text-foreground">Factor Oracle</strong>
              , the automaton behind IRCAM&rsquo;s OMax machine improviser (Assayag &amp;
              Dubnov, <em>Using Factor Oracles for Machine Improvisation</em>, 2004). Its
              melody — a seeded bebop head, or the melody you drop in — is consumed one
              quantized scale-degree at a time by the online <code>add_letter</code>
              construction (Allauzen–Crochemore–Raffinot). Each state gets a forward
              transition, back-filled factor transitions along its suffix chain, a suffix
              link, and an <code>lrs</code> (longest-repeated-suffix) length.
            </p>
            <p className="mt-3">
              To improvise, a read-head walks the graph. Most steps it continues forward
              (replaying what it heard); with the recombination probability, and only where
              a suffix link jumps into a context that shares at least two symbols, it
              follows that link — leaping to another point in the material that &ldquo;sounds
              like here&rdquo; and continuing from there. That is how it says new things out
              of old material and never quite repeats. Gold rings on the stage mark those
              recombination jumps.
            </p>
            <p className="mt-3">
              Around the soloist, a self-playing trio holds down a 4-bar ii&ndash;V&ndash;I
              in C (Dm7&nbsp;&ndash;&nbsp;G7&nbsp;&ndash;&nbsp;Cmaj7): a walking upright bass
              (roots on the &ldquo;one&rdquo;, chord tones and a chromatic approach into each
              new chord), sparse rootless comp stabs on the off-beats, and a soft
              synthesized ride for swing. One shared look-ahead scheduler sequences all four
              voices on a swung eighth grid; because the whole tune lives in one key, the
              oracle&rsquo;s emitted scale degree always sits over the changes.
            </p>
            <p className="mt-3 font-mono text-xs uppercase tracking-[0.18em]">
              palette: jazz-noir — deep blue-black · cyan/teal voices · brass-gold soloist ·
              tags: factor-oracle, omax, machine-improvisation, generative-jazz, web-audio
            </p>
            <p className="mt-3">
              Next cycle: per-chord scale swapping (real modal interchange), a form-aware
              solo that builds and releases tension across choruses, trading fours between
              two oracles, and a bass line that reharmonizes.
            </p>
          </div>
        )}
      </div>
      <PrototypeNav slugs={[SLUG]} />
    </main>
  );
}

// ── Melody extraction: onset + autocorrelation pitch → scale steps ────────────
function extractMelody(buf: AudioBuffer): number[] {
  const sr = buf.sampleRate;
  const data = buf.getChannelData(0);
  const frame = 2048;
  const hop = 1024;
  const steps: number[] = [];
  let prevMidi = -1;
  let prevRms = 0;
  const maxNotes = 220;

  for (let i = 0; i + frame < data.length && steps.length < maxNotes; i += hop) {
    // RMS for onset gating
    let sum = 0;
    for (let j = 0; j < frame; j++) {
      const s = data[i + j];
      sum += s * s;
    }
    const rms = Math.sqrt(sum / frame);
    const onset = rms > 0.02 && rms > prevRms * 1.3;
    prevRms = rms;
    if (rms < 0.015) continue;

    const freq = autocorrelate(data, i, frame, sr);
    if (freq <= 0) continue;
    const midi = Math.round(69 + 12 * Math.log2(freq / 440));
    if (midi < 40 || midi > 96) continue;

    // record a note on onset, or a clear pitch change
    if (onset || (prevMidi >= 0 && Math.abs(midi - prevMidi) >= 1)) {
      steps.push(midiToStep(midi));
      prevMidi = midi;
    } else if (prevMidi < 0) {
      steps.push(midiToStep(midi));
      prevMidi = midi;
    }
  }
  return steps;
}

/** Simple autocorrelation pitch estimate for one frame. Returns Hz or -1. */
function autocorrelate(
  data: Float32Array,
  offset: number,
  size: number,
  sr: number,
): number {
  let rms = 0;
  for (let i = 0; i < size; i++) {
    const v = data[offset + i];
    rms += v * v;
  }
  rms = Math.sqrt(rms / size);
  if (rms < 0.01) return -1;

  const minLag = Math.floor(sr / 1000); // up to 1000 Hz
  const maxLag = Math.floor(sr / 70); // down to 70 Hz
  let bestLag = -1;
  let bestCorr = 0;
  for (let lag = minLag; lag <= maxLag && lag < size; lag++) {
    let corr = 0;
    for (let i = 0; i < size - lag; i++) {
      corr += data[offset + i] * data[offset + i + lag];
    }
    corr /= size - lag;
    if (corr > bestCorr) {
      bestCorr = corr;
      bestLag = lag;
    }
  }
  if (bestLag <= 0 || bestCorr < 0.0008) return -1;
  return sr / bestLag;
}
