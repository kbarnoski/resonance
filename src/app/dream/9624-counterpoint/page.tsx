"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import {
  type Answer,
  developSubject,
  estimateBeat,
  estimateKey,
  type KeyEstimate,
  midiToFreq,
  mulberry32,
  type NoteEvent,
  pcName,
  quantizeTime,
  reinforceTheme,
  scoreSalience,
  type Theme,
  type Voice,
  voiceCountForStrength,
} from "./engine";

// ── Manuscript palette (SVG art layer only — never on UI chrome classNames) ──
// Clinical ink-on-high-key: pale ground, thin dark ink staves + noteheads, and
// ONE restrained accent — the brand violet (matches the `--primary` token) for
// the voice currently entering. This piece is meant to look like engraved fugue
// manuscript, deliberately wrong next to the lab's warm glow.
const PAPER = "#f7f6f2";
const PAPER_EDGE = "#e4e3dd";
const STAFF = "#c7c6c0"; // thin engraved staff lines
const BAR = "#b7b6af"; // barlines
const INK = "#232227"; // noteheads + contour ink
const INK_SOFT = "#6b6a72"; // secondary ink (labels, brackets)
const ACCENT = "#8b5cf6"; // brand violet — the entering voice only

// ── SVG geometry ────────────────────────────────────────────────────────────
const VIEW_W = 1000;
const LEFT = 150; // room for a voice caption gutter
const RIGHT_PAD = 40;
const PX_PER_SEC = 150;
const TOP = 96; // above the first staff
const VOICE_H = 96; // vertical stride between voice staves
const STAFF_GAP = 8; // between the 5 staff lines
const STAFF_H = STAFF_GAP * 4;
const NOTE_R = 4.4;
const PITCH_PAD = STAFF_GAP * 1.4; // how far above/below the staff pitches may sit

// ── Listener thresholds (same DSP shape as cycle 1) ─────────────────────────
const ON_ENERGY = 0.1;
const REST_ENERGY = 0.06;
const REST_HOLD = 0.35;
const PHRASE_CAP = 4.0;
const MIN_NOTE = 0.05;
const BEATS_PER_BAR = 4;

const nowSec = () => performance.now() / 1000;

// ── Deterministic demo subject (mulberry32(0x9624) — no Math.random) ────────
// A single memorable subject, RE-STATED several times so its theme strength
// climbs fast: the muted reviewer watches the exposition thicken 2 → 3 → 4
// voices within a couple of seconds, with no mic and no audio required.
interface DemoNote {
  midi: number;
  dur: number;
  gap: number;
}
function buildDemoSubjects(rng: () => number): DemoNote[] {
  // A minor subject: a rising arch that turns — A4 C5 B4 E5 D5 C5.
  const subject = [69, 72, 71, 76, 74, 72];
  const out: DemoNote[] = [];
  const statements = 4; // return to the SAME shape → theme strengthens
  for (let s = 0; s < statements; s++) {
    const fast = s === 0; // first statement quick so the first answer lands < 1s
    for (let i = 0; i < subject.length; i++) {
      const last = i === subject.length - 1;
      // tiny deterministic jitter so it reads as played, not typed
      const jit = (rng() - 0.5) * 0.02;
      out.push({
        midi: subject[i],
        dur: (fast ? 0.15 : 0.18) + jit,
        gap: last ? 0.5 : 0.05,
      });
    }
  }
  return out;
}

// ── Audio: a soft polyphonic voice per contrapuntal line ────────────────────
interface AudioNodes {
  ctx: AudioContext;
  master: GainNode;
}
function timbreFor(kind: Voice["kind"]): {
  type: OscillatorType;
  fm: number;
  pan: number;
  gain: number;
} {
  switch (kind) {
    case "subject":
      return { type: "sine", fm: 0, pan: 0, gain: 0.5 };
    case "canon":
      return { type: "triangle", fm: 2.0, pan: 0.55, gain: 0.42 };
    case "inversion":
      return { type: "triangle", fm: 1.5, pan: -0.55, gain: 0.42 };
    case "octave":
      return { type: "sine", fm: 3.0, pan: -0.12, gain: 0.36 };
  }
}
function scheduleVoiceNote(
  a: AudioNodes,
  kind: Voice["kind"],
  freq: number,
  when: number,
  dur: number,
  voiceGain: number,
) {
  const { ctx, master } = a;
  const tb = timbreFor(kind);
  const carrier = ctx.createOscillator();
  carrier.type = tb.type;
  carrier.frequency.value = freq;

  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, when);
  env.gain.exponentialRampToValueAtTime(tb.gain * voiceGain, when + 0.014);
  env.gain.exponentialRampToValueAtTime(0.0001, when + dur + 0.16);

  const pan = ctx.createStereoPanner();
  pan.pan.value = tb.pan;

  carrier.connect(env).connect(pan).connect(master);
  carrier.start(when);
  carrier.stop(when + dur + 0.22);

  // A soft FM shimmer gives each answering line a distinct grain.
  if (tb.fm > 0) {
    const mod = ctx.createOscillator();
    mod.type = "sine";
    mod.frequency.value = freq * tb.fm;
    const modGain = ctx.createGain();
    modGain.gain.value = freq * 0.4;
    mod.connect(modGain).connect(carrier.frequency);
    mod.start(when);
    mod.stop(when + dur + 0.22);
  }
}
function scheduleInputNote(a: AudioNodes, freq: number, when: number, dur: number) {
  // The seeded-demo "you" voice — a plain, dry sine as you play.
  const { ctx, master } = a;
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.value = freq;
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, when);
  env.gain.exponentialRampToValueAtTime(0.34, when + 0.01);
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

  const minLag = Math.floor(sampleRate / 1000);
  const maxLag = Math.min(size - 1, Math.floor(sampleRate / 80));
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
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [preview, setPreview] = useState<NoteEvent[]>([]);
  const [keyEst, setKeyEst] = useState<KeyEstimate>({
    tonic: 9,
    mode: "minor",
    strength: 0,
  });
  const [themes, setThemes] = useState<Theme[]>([]);
  const [activeTheme, setActiveTheme] = useState<number | null>(null);
  const [captureCount, setCaptureCount] = useState(0);
  const [showNotes, setShowNotes] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);

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
  const rngRef = useRef<() => number>(mulberry32(0x9624));
  const modeRef = useRef<Listening>("idle");
  const idRef = useRef(0);
  const seqRef = useRef(0);

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

  // Long-horizon theme memory
  const themesRef = useRef<Theme[]>([]);
  const themeIdRef = useRef(0);

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
    rngRef.current = mulberry32(0x9624);
    idRef.current = 0;
    seqRef.current = 0;
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
    themesRef.current = [];
    themeIdRef.current = 0;
    demoRef.current = {
      notes: buildDemoSubjects(mulberry32(0x9624)),
      idx: 0,
      started: false,
      noteStart: 0,
      phase: "note",
      firedOnset: false,
    };
    setAnswer(null);
    setPreview([]);
    setThemes([]);
    setActiveTheme(null);
    setCaptureCount(0);
    setKeyEst({ tonic: 9, mode: "minor", strength: 0 });
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
    if (flux > 40 && energy > ON_ENERGY && t - lastOnsetRef.current > 0.1) {
      onset = true;
      lastOnsetRef.current = t;
    }
    const midi =
      energy > REST_ENERGY ? detectPitch(tbuf, sampleRateRef.current) : null;
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
        if (a && a.ctx.state === "running") {
          scheduleInputNote(a, midiToFreq(n.midi), a.ctx.currentTime, n.dur);
        }
      }
      if (elapsed < n.dur) return { midi: n.midi, energy: 0.55, onset };
      d.phase = "gap";
      d.noteStart = now;
      d.firedOnset = false;
      return { midi: null, energy: 0.02, onset: false };
    }
    if (elapsed >= n.gap) {
      d.idx++;
      d.phase = "note";
      d.noteStart = now;
      d.firedOnset = false;
    }
    return { midi: null, energy: 0.02, onset: false };
  }, []);

  // --- the answer: build & sound a fugue-exposition from a captured subject ---
  const answerSubject = useCallback((rawEvents: NoteEvent[], now: number) => {
    const k = keyRef.current;
    const beat = estimateBeat(rawEvents);
    const subject = quantizeTime(rawEvents, beat, 2);

    // Long-horizon memory: returning to a shape strengthens its theme.
    const r = reinforceTheme(
      themesRef.current,
      subject,
      k.tonic,
      k.mode,
      now,
      themeIdRef.current,
    );
    themesRef.current = r.themes;
    if (r.themeId >= themeIdRef.current) themeIdRef.current = r.themeId + 1;
    setThemes(r.themes.slice());
    setActiveTheme(r.themeId);

    // Theme strength drives how many voices enter (2 → 3 → 4).
    seqRef.current++;
    const ans = developSubject(
      subject,
      k.tonic,
      k.mode,
      beat,
      r.strength,
      seqRef.current,
    );
    setAnswer(ans);
    setCaptureCount((c) => c + 1);

    // Sound the whole exposition in the player's gap: every voice, staggered
    // by its metered entry, each a distinct timbre/pan through the limiter.
    const a = audioRef.current;
    if (a && a.ctx.state === "running") {
      const voiceGain = 1 / Math.max(2, ans.total); // keep the sum safe
      const t0 = a.ctx.currentTime + 0.05;
      for (const v of ans.voices) {
        for (const e of v.events) {
          scheduleVoiceNote(
            a,
            v.kind,
            midiToFreq(e.midi),
            t0 + e.t,
            e.dur,
            voiceGain,
          );
        }
      }
    }
  }, []);

  // --- coarse: phrase segmenter → subject capture ---
  const stepSegment = useCallback(
    (frame: Frame, now: number) => {
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
        // salience gate: only reasonably shaped phrases become subjects
        if (scoreSalience(seg.events) >= 2) {
          answerSubject(seg.events.slice(), now);
        }
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
    },
    [answerSubject],
  );

  // ── the multi-time-scale loop (refs only → stable, no stale closures) ─────
  const tick = useCallback(() => {
    const now = nowSec();
    const mode = modeRef.current;
    if (mode === "idle") return;

    let frame: Frame = { midi: null, energy: 0, onset: false };
    if (mode === "mic") frame = readMicFrame();
    else frame = stepDemo(now);
    energyRef.current = frame.energy;

    // fine: chroma (with slow decay) → Krumhansl–Schmuckler key
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

    // coarse: segment into subjects, then answer each in counterpoint
    stepSegment(frame, now);

    rafRef.current = requestAnimationFrame(tick);
  }, [readMicFrame, stepDemo, stepSegment]);

  const ensureAudio = useCallback((): AudioNodes => {
    if (audioRef.current) return audioRef.current;
    const Ctx: typeof AudioContext =
      window.AudioContext ||
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).webkitAudioContext;
    const ctx = new Ctx();
    const master = ctx.createGain();
    master.gain.value = 0.18; // hard master ceiling
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
      src.connect(an); // analyser is a dead-end — the answer voices never reach it
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
        "Microphone unavailable or denied — falling back to the seeded demo so you can still watch the fugue-exposition assemble.",
      );
      startDemo();
    }
  }, [ensureAudio, resetPipeline, startLoop, startDemo]);

  // reduced-motion preference + AUTO-RUN the seeded fallback on mount, so a
  // muted / mic-less reviewer sees a canon enter and the staves stack in ~1–2s.
  useEffect(() => {
    if (typeof window !== "undefined" && window.matchMedia) {
      setReduceMotion(
        window.matchMedia("(prefers-reduced-motion: reduce)").matches,
      );
    }
    resetPipeline();
    modeRef.current = "demo";
    setListening("demo");
    startLoop();
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      void audioRef.current?.ctx.close();
      audioRef.current = null;
    };
    // mount-only: the pipeline is driven entirely through refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── SVG layout (derived from state each render) ──────────────────────────
  const voices = answer?.voices ?? [];
  const allMidi: number[] = [];
  for (const v of voices) for (const e of v.events) allMidi.push(e.midi);
  for (const e of preview) allMidi.push(e.midi);
  let lo = allMidi.length ? Math.min(...allMidi) : 60;
  let hi = allMidi.length ? Math.max(...allMidi) : 79;
  if (hi - lo < 12) {
    const mid = (hi + lo) / 2;
    lo = mid - 6;
    hi = mid + 6;
  }

  const nStaves = Math.max(voices.length, 1);
  const VIEW_H = TOP + nStaves * VOICE_H + 48;

  const staffTop = (vi: number) => TOP + vi * VOICE_H;
  // pitch → y within a given staff (higher pitch = higher on the staff)
  const pitchToY = (midi: number, top: number) => {
    const frac = (midi - lo) / (hi - lo);
    return top + STAFF_H + PITCH_PAD - frac * (STAFF_H + 2 * PITCH_PAD);
  };
  const timeToX = (t: number) => LEFT + t * PX_PER_SEC;

  // total time extent for barlines + staff length
  let maxT = 0;
  for (const v of voices) for (const e of v.events) maxT = Math.max(maxT, e.t + e.dur);
  for (const e of preview) maxT = Math.max(maxT, e.t + e.dur);
  const contentRight = Math.min(
    VIEW_W - RIGHT_PAD,
    Math.max(LEFT + 220, timeToX(maxT) + 40),
  );

  const beat = answer?.beat ?? 0.4;
  const barlineTs: number[] = [];
  if (answer) {
    const barLen = beat * BEATS_PER_BAR;
    for (let t = barLen; timeToX(t) < contentRight; t += barLen) barlineTs.push(t);
  }

  const keyLabel = `${pcName(keyEst.tonic)} ${keyEst.mode}`;
  const active = activeTheme != null ? themes.find((t) => t.id === activeTheme) : null;
  const strength = active ? active.strength : 0;
  const totalVoices = answer?.total ?? voiceCountForStrength(strength || 1);
  const anim = !reduceMotion;

  const voiceCaption = (v: Voice): string => {
    switch (v.kind) {
      case "subject":
        return "SUBJECT · as played";
      case "canon":
        return "CANON";
      case "inversion":
        return "INVERSION";
      case "octave":
        return "CANON · 8ve";
    }
  };

  return (
    <main className="min-h-screen bg-background px-5 py-10 text-foreground sm:px-8">
      <style>{`
        @keyframes cpt-pop { from { opacity: 0; transform: scale(0.1); } to { opacity: 1; transform: scale(1); } }
        @keyframes cpt-draw { from { stroke-dashoffset: 1600; } to { stroke-dashoffset: 0; } }
        @keyframes cpt-enter { 0% { opacity: 0; } 100% { opacity: 1; } }
        .cpt-note { animation: cpt-pop 0.4s cubic-bezier(.2,.8,.3,1) both; transform-box: fill-box; transform-origin: center; }
        .cpt-path { stroke-dasharray: 1600; animation: cpt-draw 0.7s ease-out both; }
        .cpt-enter { animation: cpt-enter 0.5s ease-out both; }
        .cpt-staff { transition: opacity 0.5s ease; }
      `}</style>

      <div className="mx-auto max-w-5xl">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          dream · 9624 · counterpoint
        </p>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">
          The answering voice
        </h1>
        <p className="mt-3 max-w-2xl text-base leading-relaxed text-muted-foreground">
          Play or hum a phrase. A listening partner captures it as a{" "}
          <span className="text-foreground">subject</span> and answers in real
          counterpoint — a canon a fifth up, the subject inverted underneath —
          and the more you return to a shape, the stronger its theme grows and
          the more voices enter. You conduct a small fugue-exposition just by
          playing.
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
            {listening === "demo" ? "Restart seeded demo" : "Play the seeded demo"}
          </button>
          <button
            type="button"
            onClick={() => setShowNotes((s) => !s)}
            className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            Read the design notes
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
          <Readout label="theme strength">
            {strength > 0 ? strength.toFixed(1) : "—"}
          </Readout>
          <Readout label="voices in exposition">
            {answer ? String(totalVoices) : "—"}
          </Readout>
          <Readout label="subjects heard">{String(captureCount)}</Readout>
        </div>

        {/* the engraved fugue-exposition */}
        <div
          className="mt-6 overflow-x-auto rounded-lg border"
          style={{ borderColor: PAPER_EDGE, background: PAPER }}
        >
          <svg
            viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
            width="100%"
            role="img"
            aria-label="Fugue-exposition: a captured subject answered by canon and inversion on stacked staves"
            style={{ display: "block", minWidth: 640 }}
          >
            <rect x={0} y={0} width={VIEW_W} height={VIEW_H} fill={PAPER} />

            <text
              x={16}
              y={40}
              fill={INK}
              style={{ fontSize: 13, letterSpacing: 2, fontFamily: "ui-monospace, monospace" }}
            >
              FUGUE-EXPOSITION
            </text>
            <text
              x={16}
              y={60}
              fill={INK_SOFT}
              style={{ fontSize: 11, fontFamily: "ui-monospace, monospace" }}
            >
              {answer
                ? `${totalVoices} voices · entries ${answer.spacing.toFixed(2)} beats apart`
                : "listening for a subject…"}
            </text>

            {/* barlines across all staves (metered manuscript) */}
            {barlineTs.map((t, i) => (
              <line
                key={`bar-${i}`}
                x1={timeToX(t)}
                y1={TOP - 10}
                x2={timeToX(t)}
                y2={TOP + nStaves * VOICE_H - VOICE_H + STAFF_H + 20}
                stroke={BAR}
                strokeWidth={1}
                strokeDasharray="2 4"
              />
            ))}

            {/* one 5-line staff per voice, stacking downward */}
            {(voices.length > 0
              ? voices
              : ([{ kind: "subject" } as Partial<Voice>] as Voice[])
            ).map((v, vi) => {
              const top = staffTop(vi);
              const isAnswer = !!v.kind && v.kind !== "subject";
              const entryX = v.events && v.events.length ? timeToX(v.events[0].t) : LEFT;
              return (
                <g key={`voice-${vi}-${answer?.seq ?? 0}`} className="cpt-staff">
                  {/* staff lines */}
                  {[0, 1, 2, 3, 4].map((li) => (
                    <line
                      key={`sl-${li}`}
                      x1={LEFT - 8}
                      y1={top + li * STAFF_GAP}
                      x2={contentRight}
                      y2={top + li * STAFF_GAP}
                      stroke={STAFF}
                      strokeWidth={1}
                    />
                  ))}
                  {/* left brace tick */}
                  <line
                    x1={LEFT - 8}
                    y1={top}
                    x2={LEFT - 8}
                    y2={top + STAFF_H}
                    stroke={INK}
                    strokeWidth={1.4}
                  />
                  {/* voice caption in the gutter */}
                  <text
                    x={14}
                    y={top + STAFF_H / 2 - 3}
                    fill={isAnswer ? INK : INK}
                    style={{ fontSize: 11, letterSpacing: 1.5, fontFamily: "ui-monospace, monospace" }}
                  >
                    {v.kind ? voiceCaption(v) : "SUBJECT"}
                  </text>
                  {isAnswer && (
                    <text
                      x={14}
                      y={top + STAFF_H / 2 + 12}
                      fill={INK_SOFT}
                      style={{ fontSize: 9.5, fontFamily: "ui-monospace, monospace" }}
                    >
                      {v.label}
                    </text>
                  )}

                  {/* imitation offset, visibly drawn: dashed delay guide from
                      the subject's downbeat to this voice's entry, + arrow */}
                  {isAnswer && v.events && v.events.length > 0 && (
                    <g className={anim ? "cpt-enter" : undefined}>
                      <line
                        x1={LEFT}
                        y1={top - 12}
                        x2={entryX}
                        y2={top - 12}
                        stroke={ACCENT}
                        strokeWidth={1.2}
                        strokeDasharray="3 3"
                      />
                      <line
                        x1={LEFT}
                        y1={top - 16}
                        x2={LEFT}
                        y2={top - 8}
                        stroke={ACCENT}
                        strokeWidth={1.2}
                      />
                      <path
                        d={`M ${entryX - 6} ${top - 16} L ${entryX} ${top - 12} L ${entryX - 6} ${top - 8}`}
                        fill="none"
                        stroke={ACCENT}
                        strokeWidth={1.4}
                        strokeLinejoin="round"
                        strokeLinecap="round"
                      />
                    </g>
                  )}

                  {/* inversion axis guide */}
                  {v.inverted && v.axisMidi != null && (
                    <line
                      x1={LEFT}
                      y1={pitchToY(v.axisMidi, top)}
                      x2={contentRight}
                      y2={pitchToY(v.axisMidi, top)}
                      stroke={INK_SOFT}
                      strokeWidth={1}
                      strokeDasharray="1 5"
                      opacity={0.7}
                    />
                  )}

                  {/* the voice itself */}
                  {v.events &&
                    drawVoice(
                      v.events,
                      top,
                      isAnswer,
                      pitchToY,
                      timeToX,
                      `v${vi}-${answer?.seq ?? 0}`,
                      anim,
                      v.entryBeats * beat,
                    )}
                </g>
              );
            })}

            {/* live subject being written (no answer yet) */}
            {!answer &&
              preview.length > 0 &&
              drawVoice(
                preview,
                staffTop(0),
                false,
                pitchToY,
                timeToX,
                "live",
                false,
                0,
                0.5,
              )}
            {!answer && preview.length > 0 && (
              <text
                x={14}
                y={staffTop(0) + STAFF_H / 2 + 12}
                fill={INK_SOFT}
                style={{ fontSize: 9.5, fontFamily: "ui-monospace, monospace" }}
              >
                …listening
              </text>
            )}
          </svg>
        </div>

        {/* long-horizon theme memory — the DSMR "long window" made visible */}
        <div className="mt-4">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            theme memory · long horizon
          </p>
          <div className="mt-2 flex flex-wrap items-end gap-2">
            {themes.length === 0 && (
              <p className="text-base text-muted-foreground">
                No recurring themes yet — return to a shape to strengthen it.
              </p>
            )}
            {themes
              .slice()
              .sort((a, b) => b.strength - a.strength)
              .map((t) => {
                const isActive = t.id === activeTheme;
                const h = Math.min(56, 12 + t.strength * 14);
                return (
                  <div key={t.id} className="flex flex-col items-center gap-1">
                    <div
                      className={
                        isActive
                          ? "w-8 rounded-sm bg-primary"
                          : "w-8 rounded-sm bg-primary/20"
                      }
                      style={{ height: h }}
                      title={`theme #${t.id + 1} · strength ${t.strength.toFixed(1)} · seen ${t.count}×`}
                    />
                    <span className="font-mono text-[10px] text-muted-foreground">
                      {t.strength.toFixed(1)}
                    </span>
                  </div>
                );
              })}
          </div>
        </div>

        {listening === "idle" && !answer && (
          <p className="mt-4 text-base text-muted-foreground">
            Press <span className="text-foreground">Start listening</span> and
            play a short phrase, or press{" "}
            <span className="text-foreground">Play the seeded demo</span> to
            watch a subject get answered in counterpoint with no mic needed.
          </p>
        )}

        {showNotes && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
            <div className="max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg">
              <div className="flex items-start justify-between gap-4">
                <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  design notes · 9624 counterpoint
                </p>
                <button
                  type="button"
                  onClick={() => setShowNotes(false)}
                  className="min-h-[44px] rounded-md border border-border bg-background/60 px-3 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  Close
                </button>
              </div>
              <div className="mt-4 space-y-3 text-sm leading-relaxed text-muted-foreground">
                <p>
                  Cycle 1 (<span className="text-foreground">9080 mnemonic</span>)
                  quoted one motif back as a single transformed echo on the same
                  staff. This cycle asks: what if the machine answered your line
                  in <span className="text-foreground">real counterpoint</span> —
                  so a phrase returns as a canon against itself, the subject
                  inverted underneath, building into a small living
                  fugue-exposition you conduct just by playing?
                </p>
                <p>
                  Three listening horizons run at once. A{" "}
                  <em>fine</em> pass tracks pitch (autocorrelation), onsets
                  (spectral flux) and energy; a <em>phrase</em> pass segments the
                  stream at rests into subjects; and a new{" "}
                  <em>long-horizon theme memory</em> tracks each recurring shape
                  by its interval contour, its strength climbing every time you
                  return to it and decaying only over minutes.
                </p>
                <p>
                  Theme strength drives the counterpoint. A fresh subject earns a
                  dominant answer in canon a fifth up; as its theme strengthens
                  the subject is mirror-inverted underneath, then a further octave
                  canon enters, and the entries crowd closer together (stretto).
                  Each answering voice stacks on its own staff with the imitation
                  offset drawn as a violet arrow — you watch the fugue assemble.
                </p>
                <p>
                  This long window is the &ldquo;distributed memory horizon&rdquo;
                  of <span className="text-foreground">DSMR</span> (Depth-Structured
                  Music Recurrence, arXiv:2602.19816, Feb 2026): a long history
                  window carries motif repetition and developmental variation
                  while short windows stay local. Everything is deterministic
                  (one seeded PRNG); muted or mic-less, the exposition still
                  assembles silently.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      <PrototypeNav slugs={["9624-counterpoint"]} />
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

// Draw one contrapuntal voice as noteheads + contour on its staff. Named draw*
// (not a hook). `entryDelaySec` staggers the draw animation so voices appear to
// enter in imitative order.
function drawVoice(
  events: NoteEvent[],
  staffTop: number,
  isAnswer: boolean,
  pitchToY: (midi: number, top: number) => number,
  timeToX: (t: number) => number,
  keyPrefix: string,
  animate: boolean,
  entryDelaySec: number,
  opacity = 1,
): React.ReactNode {
  if (events.length === 0) return null;
  const pts = events.map((e) => ({
    x: timeToX(e.t),
    y: pitchToY(e.midi, staffTop),
    w: Math.max(6, e.dur * PX_PER_SEC),
  }));
  const d = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  const drawDelay = animate ? Math.max(0, entryDelaySec) : 0;
  return (
    <g opacity={opacity}>
      <path
        d={d}
        className={animate ? "cpt-path" : undefined}
        style={animate ? { animationDelay: `${drawDelay}s` } : undefined}
        fill="none"
        stroke={INK}
        strokeWidth={1.3}
        strokeLinejoin="round"
        strokeLinecap="round"
        opacity={0.55}
      />
      {pts.map((p, i) => {
        // the first notehead of an answering voice is the "entering" note → violet
        const entering = isAnswer && i === 0;
        return (
          <g key={`${keyPrefix}-${i}`}>
            {/* duration stem tail */}
            <line
              x1={p.x}
              y1={p.y}
              x2={p.x + p.w}
              y2={p.y}
              stroke={INK}
              strokeWidth={2}
              strokeLinecap="round"
              opacity={0.28}
            />
            <circle
              className={animate ? "cpt-note" : undefined}
              style={
                animate
                  ? { animationDelay: `${drawDelay + i * 0.04}s` }
                  : undefined
              }
              cx={p.x}
              cy={p.y}
              r={NOTE_R}
              fill={entering ? ACCENT : INK}
              stroke={entering ? ACCENT : "none"}
              strokeWidth={entering ? 2 : 0}
            />
          </g>
        );
      })}
    </g>
  );
}
