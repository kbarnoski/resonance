"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import {
  developMotif,
  estimateKey,
  type KeyEstimate,
  midiToFreq,
  type Motif,
  mulberry32,
  type NoteEvent,
  pcName,
  scoreSalience,
  type Transform,
  transformLabel,
} from "./engine";

// ── Manuscript palette (SVG art only — never on UI chrome classNames) ─────────
const CREAM = "#f3e7cb";
const CREAM_EDGE = "#e7d4ab";
const INK = "#4a3a24";
const STAFF = "#d8c39a";
const ORIG = "#8a5a2b"; // sienna — the phrase as heard
const DEV = "#a23b1e"; // terracotta — the phrase quoted back
const AXIS = "#c98a3a";
const GLOW = "#d99b2e";

// ── SVG ribbon geometry ───────────────────────────────────────────────────
const VIEW_W = 1000;
const VIEW_H = 420;
const PX_PER_SEC = 150;
const CELL_PAD = 14;
const CELL_GAP = 22;
const START_X = 44;
const ORIG_TOP = 74;
const DEV_TOP = 240;
const BAND_H = 118;

// ── Listener thresholds ─────────────────────────────────────────────────────
const ON_ENERGY = 0.1; // above this = a note is sounding
const REST_ENERGY = 0.06; // below this for a while = a rest
const REST_HOLD = 0.35; // seconds of rest that ends a phrase
const PHRASE_CAP = 4.0; // hard phrase length cap
const MIN_NOTE = 0.05; // shortest kept note
const DEV_GATE = 0.25; // rest held before we answer
const DEV_COOLDOWN = 1.6; // min seconds between answers
const BANK_CAP = 10;

const TRANSFORMS: Transform[] = [
  "transpose",
  "invert",
  "augment",
  "retrograde",
];

const nowSec = () => performance.now() / 1000;

// ── Deterministic demo melody (mulberry32(0x9080) — no Math.random) ─────────
interface DemoNote {
  midi: number;
  dur: number;
  gap: number;
}
function buildDemoMelody(rng: () => number): DemoNote[] {
  // A natural-minor scale around A3–A5, walked as short singable phrases.
  const scale = [57, 59, 60, 62, 64, 65, 67, 69, 71, 72, 74, 76];
  const out: DemoNote[] = [];
  // First phrase is deliberately short + quick so the ribbon draws < 1s.
  const phraseLens = [3, 4, 5, 4, 3, 5, 4];
  let deg = 5;
  for (let p = 0; p < phraseLens.length; p++) {
    const len = phraseLens[p];
    const fast = p === 0;
    for (let i = 0; i < len; i++) {
      deg += Math.floor(rng() * 5) - 2;
      deg = Math.max(0, Math.min(scale.length - 1, deg));
      const dur = fast ? 0.16 : 0.19 + rng() * 0.08;
      const last = i === len - 1;
      out.push({
        midi: scale[deg],
        dur,
        gap: last ? 0.42 + rng() * 0.08 : 0.05,
      });
    }
  }
  return out;
}

// ── Audio: the answer voice (never routed into the analyser) ────────────────
interface AudioNodes {
  ctx: AudioContext;
  master: GainNode;
}
function scheduleAnswer(
  a: AudioNodes,
  freq: number,
  when: number,
  dur: number,
) {
  const { ctx, master } = a;
  const carrier = ctx.createOscillator();
  carrier.type = "triangle";
  carrier.frequency.value = freq;
  // A soft FM shimmer — a listening partner's distinct timbre.
  const mod = ctx.createOscillator();
  mod.type = "sine";
  mod.frequency.value = freq * 2.0;
  const modGain = ctx.createGain();
  modGain.gain.value = freq * 0.6;
  mod.connect(modGain).connect(carrier.frequency);

  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, when);
  env.gain.exponentialRampToValueAtTime(0.9, when + 0.015);
  env.gain.exponentialRampToValueAtTime(0.0001, when + dur + 0.18);
  carrier.connect(env).connect(master);

  carrier.start(when);
  mod.start(when);
  carrier.stop(when + dur + 0.24);
  mod.stop(when + dur + 0.24);
}
function scheduleInput(a: AudioNodes, freq: number, when: number, dur: number) {
  // The seeded-demo "input" voice — a plain sine, clearly not the partner.
  const { ctx, master } = a;
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.value = freq;
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, when);
  env.gain.exponentialRampToValueAtTime(0.42, when + 0.01);
  env.gain.exponentialRampToValueAtTime(0.0001, when + dur + 0.06);
  osc.connect(env).connect(master);
  osc.start(when);
  osc.stop(when + dur + 0.1);
}

// ── Fine listener: autocorrelation pitch on a time-domain frame ─────────────
function detectPitch(buf: Float32Array, sampleRate: number): number | null {
  const size = Math.min(buf.length, 1024);
  let rms = 0;
  for (let i = 0; i < size; i++) rms += buf[i] * buf[i];
  rms = Math.sqrt(rms / size);
  if (rms < 0.008) return null;

  const minLag = Math.floor(sampleRate / 1000); // ~1000 Hz ceiling
  const maxLag = Math.min(size - 1, Math.floor(sampleRate / 80)); // 80 Hz floor
  let bestLag = -1;
  let bestCorr = 0;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let corr = 0;
    for (let i = 0; i < size - lag; i++) corr += buf[i] * buf[i + lag];
    if (corr > bestCorr) {
      bestCorr = corr;
      bestLag = lag;
    }
  }
  if (bestLag <= 0 || bestCorr <= 0) return null;
  const freq = sampleRate / bestLag;
  const midi = Math.round(69 + 12 * Math.log2(freq / 440));
  if (midi < 36 || midi > 96) return null;
  return midi;
}

interface Frame {
  midi: number | null;
  energy: number;
  onset: boolean;
}

type Listening = "idle" | "mic" | "demo";

export default function Page() {
  const [listening, setListening] = useState<Listening>("idle");
  const [note, setNote] = useState<string | null>(null);
  const [motifs, setMotifs] = useState<Motif[]>([]);
  const [preview, setPreview] = useState<NoteEvent[]>([]);
  const [keyEst, setKeyEst] = useState<KeyEstimate>({
    tonic: 9,
    mode: "minor",
    strength: 0,
  });
  const [highlightId, setHighlightId] = useState<number | null>(null);
  const [lastDev, setLastDev] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(false);

  // Audio graph
  const audioRef = useRef<AudioNodes | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const srcRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const timeBufRef = useRef<Float32Array | null>(null);
  const freqBufRef = useRef<Float32Array | null>(null);
  const prevFreqRef = useRef<Float32Array | null>(null);
  const sampleRateRef = useRef(44100);

  // Loop + deterministic RNG
  const rafRef = useRef<number | null>(null);
  const rngRef = useRef<() => number>(mulberry32(0x9080));
  const modeRef = useRef<Listening>("idle");
  const idRef = useRef(0);

  // Fine-listener state
  const chromaRef = useRef<number[]>(new Array(12).fill(0));
  const keyRef = useRef<KeyEstimate>({ tonic: 9, mode: "minor", strength: 0 });
  const lastOnsetRef = useRef(0);
  const energyRef = useRef(0);
  const frameCountRef = useRef(0);

  // Coarse-listener (phrase segmenter) state
  const segRef = useRef({
    events: [] as NoteEvent[],
    phraseStart: 0,
    lastActive: 0,
    cur: null as { midi: number; start: number } | null,
    active: false,
  });

  // Motif bank + development scheduler
  const bankRef = useRef<Motif[]>([]);
  const devRef = useRef({ last: -10, gateStart: -1, seq: 0 });
  const highlightUntilRef = useRef(0);

  // Demo sequencer state
  const demoRef = useRef({
    notes: [] as DemoNote[],
    idx: 0,
    started: false,
    noteStart: 0,
    phase: "note" as "note" | "gap",
    firedOnset: false,
  });

  const resetPipeline = useCallback(() => {
    rngRef.current = mulberry32(0x9080);
    idRef.current = 0;
    chromaRef.current = new Array(12).fill(0);
    keyRef.current = { tonic: 9, mode: "minor", strength: 0 };
    energyRef.current = 0;
    frameCountRef.current = 0;
    segRef.current = {
      events: [],
      phraseStart: nowSec(),
      lastActive: nowSec(),
      cur: null,
      active: false,
    };
    bankRef.current = [];
    devRef.current = { last: -10, gateStart: -1, seq: 0 };
    highlightUntilRef.current = 0;
    demoRef.current = {
      notes: buildDemoMelody(mulberry32(0x9080)),
      idx: 0,
      started: false,
      noteStart: 0,
      phase: "note",
      firedOnset: false,
    };
    setMotifs([]);
    setPreview([]);
    setHighlightId(null);
    setLastDev(null);
    setKeyEst({ tonic: 9, mode: "minor", strength: 0 });
    setNote(null);
  }, []);

  // ── the two-time-scale loop (refs only → stable, no stale closures) ──────
  const tick = useCallback(() => {
    const now = nowSec();
    const mode = modeRef.current;
    if (mode === "idle") return;

    // 1. produce a unified frame from whichever front-end is active.
    let frame: Frame = { midi: null, energy: 0, onset: false };
    if (mode === "mic") {
      frame = readMicFrame();
    } else {
      frame = stepDemo(now);
    }
    energyRef.current = frame.energy;

    // fine: chroma accumulation (with slow decay) + Krumhansl–Schmuckler key
    const chroma = chromaRef.current;
    for (let i = 0; i < 12; i++) chroma[i] *= 0.997;
    if (frame.midi != null && frame.energy > REST_ENERGY) {
      chroma[((frame.midi % 12) + 12) % 12] += frame.energy;
    }
    frameCountRef.current++;
    if (frameCountRef.current % 20 === 0) {
      const k = estimateKey(chroma);
      keyRef.current = k;
      setKeyEst((prev) =>
        prev.tonic === k.tonic && prev.mode === k.mode ? prev : k,
      );
    }

    // coarse: segment into phrases → motifs
    stepSegment(frame, now);

    // the answer: develop a remembered motif in the gaps
    stepDevelopment(now);

    // expire the "both highlighted" flash
    if (highlightUntilRef.current > 0 && now > highlightUntilRef.current) {
      highlightUntilRef.current = 0;
      setHighlightId(null);
    }

    rafRef.current = requestAnimationFrame(tick);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- front-end: microphone ---
  const readMicFrame = useCallback((): Frame => {
    const an = analyserRef.current;
    const tbuf = timeBufRef.current;
    const fbuf = freqBufRef.current;
    const pbuf = prevFreqRef.current;
    if (!an || !tbuf || !fbuf || !pbuf) {
      return { midi: null, energy: 0, onset: false };
    }
    an.getFloatTimeDomainData(tbuf as unknown as Float32Array<ArrayBuffer>);
    let rms = 0;
    for (let i = 0; i < tbuf.length; i++) rms += tbuf[i] * tbuf[i];
    rms = Math.sqrt(rms / tbuf.length);
    const energy = Math.min(1, rms * 4.5);

    // spectral flux onset (positive spectral change) + refractory window
    an.getFloatFrequencyData(fbuf as unknown as Float32Array<ArrayBuffer>);
    const bins = Math.min(256, fbuf.length);
    let flux = 0;
    for (let i = 0; i < bins; i++) {
      const cur = Math.max(-120, fbuf[i]);
      const prev = pbuf[i];
      const d = cur - prev;
      if (d > 0) flux += d;
      pbuf[i] = cur;
    }
    const t = nowSec();
    let onset = false;
    if (flux > 40 && energy > ON_ENERGY && t - lastOnsetRef.current > 0.12) {
      onset = true;
      lastOnsetRef.current = t;
    }
    const midi = energy > REST_ENERGY ? detectPitch(tbuf, sampleRateRef.current) : null;
    return { midi, energy, onset };
  }, []);

  // --- front-end: seeded procedural demo (same downstream pipeline) ---
  const stepDemo = useCallback((now: number): Frame => {
    const d = demoRef.current;
    if (d.notes.length === 0) return { midi: null, energy: 0, onset: false };
    if (!d.started) {
      d.started = true;
      d.idx = 0;
      d.noteStart = now;
      d.phase = "note";
      d.firedOnset = false;
    }
    const n = d.notes[d.idx % d.notes.length];
    const elapsed = now - d.noteStart;
    if (d.phase === "note") {
      let onset = false;
      if (!d.firedOnset) {
        d.firedOnset = true;
        onset = true;
        const a = audioRef.current;
        if (a) scheduleInput(a, midiToFreq(n.midi), a.ctx.currentTime, n.dur);
      }
      if (elapsed < n.dur) {
        return { midi: n.midi, energy: 0.55, onset };
      }
      d.phase = "gap";
      d.noteStart = now;
      d.firedOnset = false;
      return { midi: null, energy: 0.02, onset: false };
    }
    // gap
    if (elapsed >= n.gap) {
      d.idx++;
      d.phase = "note";
      d.noteStart = now;
      d.firedOnset = false;
    }
    return { midi: null, energy: 0.02, onset: false };
  }, []);

  // --- coarse: phrase segmenter → motif capture ---
  const stepSegment = useCallback((frame: Frame, now: number) => {
    const seg = segRef.current;
    const closeNote = () => {
      if (seg.cur) {
        const dur = now - seg.cur.start;
        if (dur >= MIN_NOTE) {
          seg.events.push({
            midi: seg.cur.midi,
            t: seg.cur.start - seg.phraseStart,
            dur,
          });
          setPreview(seg.events.slice());
        }
        seg.cur = null;
      }
    };
    const capture = () => {
      if (seg.events.length < 2) {
        seg.events = [];
        seg.active = false;
        setPreview([]);
        return;
      }
      const k = keyRef.current;
      const motif: Motif = {
        id: idRef.current++,
        events: seg.events.slice(),
        key: k.tonic,
        mode: k.mode,
        salience: scoreSalience(seg.events),
      };
      let bank = [...bankRef.current, motif];
      if (bank.length > BANK_CAP) {
        // keep the most salient — this is a bank of memorable ideas
        bank = bank.sort((a, b) => b.salience - a.salience).slice(0, BANK_CAP);
        bank.sort((a, b) => a.id - b.id);
      }
      bankRef.current = bank;
      setMotifs(bank.slice());
      seg.events = [];
      seg.cur = null;
      seg.active = false;
      setPreview([]);
    };

    if (frame.midi != null && frame.energy > ON_ENERGY) {
      seg.lastActive = now;
      if (!seg.active) {
        if (seg.events.length === 0) seg.phraseStart = now;
        seg.active = true;
      }
      const m = frame.midi;
      if (!seg.cur || Math.abs(m - seg.cur.midi) >= 1) {
        closeNote();
        seg.cur = { midi: m, start: now };
      }
    } else {
      if (seg.cur) closeNote();
      if (seg.events.length >= 2 && now - seg.lastActive > REST_HOLD) capture();
      seg.active = false;
    }
    if (seg.events.length >= 2 && now - seg.phraseStart > PHRASE_CAP) {
      closeNote();
      capture();
    }
  }, []);

  // --- the answer: development engine, fired in the player's gaps ---
  const stepDevelopment = useCallback((now: number) => {
    const dev = devRef.current;
    const bank = bankRef.current;
    const low = energyRef.current < REST_ENERGY;
    if (low) {
      if (dev.gateStart < 0) dev.gateStart = now;
    } else {
      dev.gateStart = -1;
    }
    if (
      bank.length === 0 ||
      dev.gateStart < 0 ||
      now - dev.gateStart < DEV_GATE ||
      now - dev.last < DEV_COOLDOWN
    ) {
      return;
    }

    // pick a motif to develop — prefer the undeveloped & salient
    const rng = rngRef.current;
    const undev = bank.filter((m) => !m.development);
    const pool = undev.length > 0 ? undev : bank;
    let choice = pool[0];
    if (rng() < 0.4) {
      choice = pool[Math.floor(rng() * pool.length)];
    } else {
      for (const m of pool) if (m.salience > choice.salience) choice = m;
    }

    const transform = TRANSFORMS[Math.floor(rng() * TRANSFORMS.length)];
    const k = keyRef.current;
    const events = developMotif(choice, k.tonic, k.mode, transform);
    dev.seq++;
    choice.development = { transform, events, seq: dev.seq };
    bankRef.current = bank.slice();
    setMotifs(bankRef.current.slice());

    const a = audioRef.current;
    if (a) {
      const t0 = a.ctx.currentTime + 0.03;
      for (const e of events) {
        scheduleAnswer(a, midiToFreq(e.midi), t0 + e.t, e.dur);
      }
    }

    dev.last = now;
    highlightUntilRef.current = now + 1.4;
    setHighlightId(choice.id);
    setLastDev(`${transformLabel(transform)}  ·  motif #${choice.id + 1}`);
  }, []);

  const ensureAudio = useCallback((): AudioNodes => {
    if (audioRef.current) return audioRef.current;
    const Ctx: typeof AudioContext =
      window.AudioContext ||
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).webkitAudioContext;
    const ctx = new Ctx();
    const master = ctx.createGain();
    master.gain.value = 0.18;
    const comp = ctx.createDynamicsCompressor();
    master.connect(comp).connect(ctx.destination);
    const nodes: AudioNodes = { ctx, master };
    audioRef.current = nodes;
    sampleRateRef.current = ctx.sampleRate;
    return nodes;
  }, []);

  const startLoop = useCallback(() => {
    if (rafRef.current == null) rafRef.current = requestAnimationFrame(tick);
  }, [tick]);

  const stopMicGraph = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    try {
      srcRef.current?.disconnect();
    } catch {
      /* already gone */
    }
    srcRef.current = null;
    analyserRef.current = null;
  }, []);

  const stopAll = useCallback(() => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    modeRef.current = "idle";
    stopMicGraph();
    setListening("idle");
  }, [stopMicGraph]);

  const startDemo = useCallback(() => {
    const a = ensureAudio();
    void a.ctx.resume();
    resetPipeline();
    modeRef.current = "demo";
    setListening("demo");
    startLoop();
  }, [ensureAudio, resetPipeline, startLoop]);

  const startMic = useCallback(async () => {
    setNote(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
      const a = ensureAudio();
      await a.ctx.resume();
      streamRef.current = stream;
      const src = a.ctx.createMediaStreamSource(stream);
      const an = a.ctx.createAnalyser();
      an.fftSize = 2048;
      an.smoothingTimeConstant = 0.4;
      src.connect(an); // analyser is a dead-end — the answer voice never reaches it
      srcRef.current = src;
      analyserRef.current = an;
      timeBufRef.current = new Float32Array(an.fftSize);
      freqBufRef.current = new Float32Array(an.frequencyBinCount);
      const pf = new Float32Array(an.frequencyBinCount);
      pf.fill(-120);
      prevFreqRef.current = pf;
      sampleRateRef.current = a.ctx.sampleRate;
      resetPipeline();
      modeRef.current = "mic";
      setListening("mic");
      startLoop();
    } catch {
      setNote(
        "Microphone unavailable or denied — falling back to the seeded demo so you can still watch the memory ribbon work.",
      );
      startDemo();
    }
  }, [ensureAudio, resetPipeline, startLoop, startDemo]);

  // teardown on unmount
  useEffect(() => {
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      void audioRef.current?.ctx.close();
      audioRef.current = null;
    };
  }, []);

  // ── SVG layout (derived from state each render) ──────────────────────────
  const allMidi: number[] = [];
  for (const m of motifs) {
    for (const e of m.events) allMidi.push(e.midi);
    if (m.development) for (const e of m.development.events) allMidi.push(e.midi);
  }
  for (const e of preview) allMidi.push(e.midi);
  let lo = allMidi.length ? Math.min(...allMidi) : 57;
  let hi = allMidi.length ? Math.max(...allMidi) : 76;
  if (hi - lo < 10) {
    const mid = (hi + lo) / 2;
    lo = mid - 5;
    hi = mid + 5;
  }
  lo -= 2;
  hi += 2;
  const pitchToY = (midi: number, top: number) =>
    top + BAND_H - ((midi - lo) / (hi - lo)) * BAND_H;

  const endOf = (evs: NoteEvent[]) =>
    evs.reduce((mx, e) => Math.max(mx, e.t + e.dur), 0);

  interface Cell {
    m: Motif;
    x: number;
    w: number;
  }
  const cells: Cell[] = [];
  let cx = START_X;
  for (const m of motifs) {
    const span = Math.max(endOf(m.events), m.development ? endOf(m.development.events) : 0);
    const w = Math.max(84, CELL_PAD * 2 + span * PX_PER_SEC);
    cells.push({ m, x: cx, w });
    cx += w + CELL_GAP;
  }
  // pending phrase (live) cell
  const previewSpan = endOf(preview);
  const pendingW =
    preview.length > 0 ? Math.max(84, CELL_PAD * 2 + previewSpan * PX_PER_SEC) : 0;
  const contentRight = cx + pendingW + 40;
  const scrollX = Math.min(0, VIEW_W - contentRight);

  const keyLabel = `${pcName(keyEst.tonic)} ${keyEst.mode}`;

  return (
    <main className="min-h-screen bg-background px-5 py-10 text-foreground sm:px-8">
      <style>{`
        @keyframes mnem-pop { from { opacity: 0; transform: scale(0.2); } to { opacity: 1; transform: scale(1); } }
        @keyframes mnem-draw { from { stroke-dashoffset: 1400; } to { stroke-dashoffset: 0; } }
        @keyframes mnem-flash { 0% { opacity: 0; } 25% { opacity: 0.9; } 100% { opacity: 0.32; } }
        .mnem-note { animation: mnem-pop 0.45s cubic-bezier(.2,.8,.3,1) both; transform-box: fill-box; transform-origin: center; }
        .mnem-path { stroke-dasharray: 1400; animation: mnem-draw 0.65s ease-out both; }
        .mnem-flash { animation: mnem-flash 0.5s ease-out both; }
        .mnem-scroll { transition: transform 0.6s cubic-bezier(.2,.7,.2,1); }
      `}</style>

      <div className="mx-auto max-w-5xl">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          dream · 9080 · mnemonic
        </p>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">
          Watch your musical memory being written
        </h1>
        <p className="mt-3 max-w-2xl text-base leading-relaxed text-muted-foreground">
          Play or hum into the mic. A listening partner captures your phrases as
          motifs, inks them onto a living memory ribbon, and in your gaps quotes
          them back transformed — drawing each variation right beside the
          original so you see your idea developed.
        </p>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={listening === "mic" ? stopAll : startMic}
            className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            {listening === "mic" ? "Stop listening" : "Start listening"}
          </button>
          <button
            type="button"
            onClick={listening === "demo" ? stopAll : startDemo}
            className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            {listening === "demo" ? "Stop demo" : "Play a seeded demo"}
          </button>
          <button
            type="button"
            onClick={() => setShowNotes((s) => !s)}
            className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            Design notes
          </button>
        </div>

        {note && <p className="mt-4 text-base text-destructive">{note}</p>}

        {/* live readouts */}
        <div className="mt-6 flex flex-wrap gap-x-8 gap-y-2">
          <Readout label="state">
            {listening === "idle"
              ? "waiting"
              : listening === "mic"
                ? "listening · mic"
                : "listening · seeded demo"}
          </Readout>
          <Readout label="estimated key">{keyLabel}</Readout>
          <Readout label="motifs remembered">{String(motifs.length)}</Readout>
          <Readout label="last development">{lastDev ?? "—"}</Readout>
        </div>

        {/* the living score */}
        <div
          className="mt-6 overflow-hidden rounded-lg border"
          style={{ borderColor: CREAM_EDGE, background: CREAM }}
        >
          <svg
            viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
            width="100%"
            role="img"
            aria-label="Memory ribbon of captured motifs and their developments"
            style={{ display: "block" }}
          >
            <rect x={0} y={0} width={VIEW_W} height={VIEW_H} fill={CREAM} />
            {/* row labels */}
            <text
              x={16}
              y={ORIG_TOP - 22}
              fill={INK}
              style={{
                fontSize: 12,
                letterSpacing: 2,
                fontFamily: "ui-monospace, monospace",
              }}
            >
              MOTIF — as heard
            </text>
            <text
              x={16}
              y={DEV_TOP - 22}
              fill={DEV}
              style={{
                fontSize: 12,
                letterSpacing: 2,
                fontFamily: "ui-monospace, monospace",
              }}
            >
              DEVELOPMENT — quoted back, transformed
            </text>

            <g
              className="mnem-scroll"
              transform={`translate(${scrollX} 0)`}
            >
              {/* staff lines for both bands, spanning the content */}
              {[0, 1, 2].map((i) => {
                const yO = ORIG_TOP + (BAND_H / 2) * i;
                const yD = DEV_TOP + (BAND_H / 2) * i;
                const x2 = Math.max(contentRight, VIEW_W);
                return (
                  <g key={`staff-${i}`}>
                    <line x1={16} y1={yO} x2={x2} y2={yO} stroke={STAFF} strokeWidth={1} />
                    <line x1={16} y1={yD} x2={x2} y2={yD} stroke={STAFF} strokeWidth={1} />
                  </g>
                );
              })}

              {cells.map(({ m, x, w }) => {
                const active = m.id === highlightId;
                return (
                  <g key={m.id}>
                    {active && (
                      <rect
                        className="mnem-flash"
                        x={x - 8}
                        y={ORIG_TOP - 14}
                        width={w + 16}
                        height={DEV_TOP + BAND_H - ORIG_TOP + 26}
                        rx={8}
                        fill={GLOW}
                        opacity={0.32}
                      />
                    )}
                    {/* motif index */}
                    <text
                      x={x}
                      y={ORIG_TOP - 4}
                      fill={INK}
                      style={{ fontSize: 11, fontFamily: "ui-monospace, monospace" }}
                    >
                      #{m.id + 1}
                    </text>

                    {drawPhrase(m.events, x, ORIG_TOP, ORIG, pitchToY, `o${m.id}`)}

                    {m.development && (
                      <g key={`dev-${m.id}-${m.development.seq}`}>
                        {/* connector: idea handed down to its variation */}
                        <path
                          d={`M ${x + 2} ${ORIG_TOP + BAND_H + 6} L ${x + 2} ${DEV_TOP - 6}`}
                          stroke={DEV}
                          strokeWidth={1.4}
                          strokeDasharray="3 3"
                          opacity={0.7}
                        />
                        {/* inversion axis guide (only meaningful for invert) */}
                        {m.development.transform === "invert" && (
                          <line
                            x1={x}
                            y1={pitchToY(m.events[0].midi, DEV_TOP)}
                            x2={x + w}
                            y2={pitchToY(m.events[0].midi, DEV_TOP)}
                            stroke={AXIS}
                            strokeWidth={1}
                            strokeDasharray="2 4"
                            opacity={0.8}
                          />
                        )}
                        {drawPhrase(
                          m.development.events,
                          x,
                          DEV_TOP,
                          DEV,
                          pitchToY,
                          `d${m.id}-${m.development.seq}`,
                          true,
                        )}
                        <text
                          x={x}
                          y={DEV_TOP + BAND_H + 16}
                          fill={DEV}
                          style={{ fontSize: 11, fontFamily: "ui-monospace, monospace" }}
                        >
                          {transformLabel(m.development.transform)}
                        </text>
                      </g>
                    )}
                  </g>
                );
              })}

              {/* live phrase being written */}
              {preview.length > 0 &&
                drawPhrase(preview, cx, ORIG_TOP, INK, pitchToY, "live", false, 0.45)}
              {preview.length > 0 && (
                <text
                  x={cx}
                  y={ORIG_TOP - 4}
                  fill={INK}
                  opacity={0.7}
                  style={{ fontSize: 11, fontFamily: "ui-monospace, monospace" }}
                >
                  …listening
                </text>
              )}
            </g>
          </svg>
        </div>

        {motifs.length === 0 && listening === "idle" && (
          <p className="mt-4 text-base text-muted-foreground">
            Press <span className="text-foreground">Start listening</span> and
            sing a short phrase, or press{" "}
            <span className="text-foreground">Play a seeded demo</span> to watch
            motifs get captured and developed with no mic needed.
          </p>
        )}

        {showNotes && (
          <div className="mt-6 rounded-lg border border-border bg-background/60 p-5 text-base leading-relaxed text-muted-foreground">
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              design notes
            </p>
            <p className="mt-3">
              Two time-scales listen at once. A <em>fine</em> pass tracks pitch
              (autocorrelation), onsets (spectral flux), and energy every frame,
              feeding a chroma histogram scored against the Krumhansl–Schmuckler
              key profiles. A <em>coarse</em> pass segments the stream into
              phrases at rests, snapshotting each as a motif into a bank of the
              ten most salient ideas.
            </p>
            <p className="mt-3">
              In your silences the partner picks a remembered motif and quotes it
              back <em>transformed</em> — transposed into the estimated key,
              inverted around its first note, augmented to twice its length, or
              reversed — and inks the variation on the lower stave directly below
              its original. Inversion flips vertically, augmentation stretches
              wider, retrograde runs the contour backward: the transformation is
              legible as a picture.
            </p>
          </div>
        )}
      </div>

      <PrototypeNav slugs={["9080-mnemonic"]} />
    </main>
  );
}

function Readout({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-base text-foreground">{children}</p>
    </div>
  );
}

// Draw a phrase as noteheads + contour on a band. Named draw* (not a hook).
function drawPhrase(
  events: NoteEvent[],
  cellX: number,
  bandTop: number,
  color: string,
  pitchToY: (midi: number, top: number) => number,
  keyPrefix: string,
  animate = false,
  opacity = 1,
): React.ReactNode {
  if (events.length === 0) return null;
  const pts = events.map((e) => ({
    x: cellX + CELL_PAD + e.t * PX_PER_SEC,
    y: pitchToY(e.midi, bandTop),
    w: Math.max(6, e.dur * PX_PER_SEC),
  }));
  const d = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  return (
    <g opacity={opacity}>
      <path
        d={d}
        className={animate ? "mnem-path" : undefined}
        fill="none"
        stroke={color}
        strokeWidth={1.6}
        strokeLinejoin="round"
        strokeLinecap="round"
        opacity={0.75}
      />
      {pts.map((p, i) => (
        <g key={`${keyPrefix}-${i}`}>
          {/* duration tail — makes augmentation read as literal stretch */}
          <line
            x1={p.x}
            y1={p.y}
            x2={p.x + p.w}
            y2={p.y}
            stroke={color}
            strokeWidth={3}
            strokeLinecap="round"
            opacity={0.35}
          />
          <circle
            className={animate ? "mnem-note" : undefined}
            style={animate ? { animationDelay: `${i * 0.05}s` } : undefined}
            cx={p.x}
            cy={p.y}
            r={5}
            fill={color}
          />
        </g>
      ))}
    </g>
  );
}
