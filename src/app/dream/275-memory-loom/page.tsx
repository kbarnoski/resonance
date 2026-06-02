"use client";

import { useRef, useState, useCallback, useEffect } from "react";

// ════════════════════════════════════════════════════════════════════════════
//  275 · MEMORY LOOM
//  A long-form generative LISTENER. It records verbatim phrases of what you
//  play, weaves them into incommensurate tape loops (Frippertronics), and a
//  10-minute state machine reweaves which memories sing — audibly different at
//  minute 10 than at minute 1. Never silent: a D-dorian pad plays until your
//  own sound gradually displaces it.
// ════════════════════════════════════════════════════════════════════════════

// ── Tunables ──────────────────────────────────────────────────────────────────

const MAX_PHRASES = 7; // size of the memory bank
const RING_SECONDS = 8; // rolling capture buffer length
const MAX_PHRASE_SECONDS = 4.5; // cap per captured phrase
const MIN_PHRASE_SECONDS = 0.6; // ignore blips
const ONSET_THRESH = 0.045; // RMS above this = active
const RELEASE_THRESH = 0.022; // RMS below this = phrase end
const MOVEMENT_MIN_S = 60; // state-machine dwell range
const MOVEMENT_MAX_S = 130;

// Consonant transposition ratios (octave / fifth / fourth / major third / unison)
const RATIOS = [1, 0.5, 1.5, 0.75, 1.25, 2];

// Incommensurate-ish loop rate multipliers (irrational-leaning, never aligning)
const LFO_RATES = [0.041, 0.057, 0.069, 0.083, 0.097, 0.113, 0.127];
const PLAYHEAD_RATES = [0.131, 0.149, 0.173, 0.191, 0.211, 0.233, 0.257];

// ── Types ───────────────────────────────────────────────────────────────────

interface Phrase {
  id: number;
  buf: AudioBuffer;
  peaks: number[]; // normalized waveform for viz
  capturedAt: number; // ctx time
  src: AudioBufferSourceNode | null;
  gain: GainNode | null;
  pan: StereoPannerNode | null;
  ratio: number;
  active: boolean;
  targetLevel: number; // crossfade target
  lfoRate: number;
  playheadRate: number;
  isDemo: boolean;
}

type Source = "demo" | "mic" | "file" | "track";

// ── Module-level helpers (NOT React hooks — never named use*) ─────────────────

function buildPeaks(data: Float32Array, n = 96): number[] {
  const step = Math.max(1, Math.floor(data.length / n));
  const out: number[] = [];
  let mx = 0.0001;
  for (let k = 0; k < n; k++) {
    let m = 0;
    for (let j = 0; j < step; j++) {
      const idx = k * step + j;
      if (idx < data.length) m = Math.max(m, Math.abs(data[idx]));
    }
    out.push(m);
    if (m > mx) mx = m;
  }
  return out.map((v) => v / mx);
}

function applyFades(buf: AudioBuffer, fadeS = 0.04) {
  const data = buf.getChannelData(0);
  const n = Math.min(Math.floor(fadeS * buf.sampleRate), (data.length >> 1) - 1);
  for (let i = 0; i < n; i++) {
    const t = i / n;
    data[i] *= t;
    data[data.length - 1 - i] *= t;
  }
}

// Build a procedural reverb impulse response (exponential-decay noise).
function makeImpulse(ctx: AudioContext, seconds = 3.4, decay = 2.6): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * seconds);
  const ir = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      const env = Math.pow(1 - i / len, decay);
      d[i] = (Math.random() * 2 - 1) * env;
    }
  }
  return ir;
}

// Synthesize a demo phrase: a gentle D-dorian tone-cluster fragment.
function makeDemoBuf(ctx: AudioContext, freqs: number[], seconds: number): AudioBuffer {
  const sr = ctx.sampleRate;
  const len = Math.floor(sr * seconds);
  const buf = ctx.createBuffer(1, len, sr);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) {
    const t = i / sr;
    let s = 0;
    for (let f = 0; f < freqs.length; f++) {
      // triangle-ish via summed odd harmonics, kept soft
      const ph = 2 * Math.PI * freqs[f] * t;
      s += (Math.sin(ph) + 0.18 * Math.sin(3 * ph) + 0.06 * Math.sin(5 * ph)) / freqs.length;
    }
    const env = Math.sin((Math.PI * i) / len); // gentle bell
    d[i] = s * env * 0.32;
  }
  applyFades(buf, 0.12);
  return buf;
}

// D-dorian: D F A C E G  (non-pentatonic, contemplative)
const DORIAN = [146.83, 174.61, 220.0, 261.63, 329.63, 392.0];

function pickFew<T>(arr: T[], min: number, max: number): T[] {
  const n = Math.min(arr.length, min + Math.floor(Math.random() * (max - min + 1)));
  const pool = [...arr];
  const out: T[] = [];
  while (out.length < n && pool.length) {
    out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  }
  return out;
}

function fmtAgo(s: number): string {
  if (s < 60) return `${Math.floor(s)}s ago`;
  return `${Math.floor(s / 60)}m${Math.floor(s % 60)}s ago`;
}

function fmtClock(s: number): string {
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${r.toString().padStart(2, "0")}`;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function MemoryLoom() {
  const [running, setRunning] = useState(false);
  const [source, setSource] = useState<Source>("demo");
  const [err, setErr] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [movement, setMovement] = useState(1);
  const [activeCount, setActiveCount] = useState(0);
  const [phraseCount, setPhraseCount] = useState(0);
  const [listening, setListening] = useState(false);
  const [trackId, setTrackId] = useState("");

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<{ filter: BiquadFilterNode; wet: GainNode; dry: GainNode } | null>(null);
  const phrasesRef = useRef<Phrase[]>([]);
  const idCounter = useRef(0);
  const rafRef = useRef<number | null>(null);
  const startTimeRef = useRef(0);
  const nextMovementRef = useRef(0);
  const movementRef = useRef(1);

  // Capture pipeline
  const micStreamRef = useRef<MediaStream | null>(null);
  const procRef = useRef<ScriptProcessorNode | null>(null);
  const ringRef = useRef<Float32Array | null>(null);
  const ringPosRef = useRef(0);
  const ringFilledRef = useRef(0);
  const inPhraseRef = useRef(false);
  const phraseLenRef = useRef(0);
  const rmsRef = useRef(0);
  const flashRef = useRef(0); // capture-flash animation

  // ── Audio graph construction ────────────────────────────────────────────────

  const buildGraph = useCallback((ctx: AudioContext) => {
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 2600;
    filter.Q.value = 0.4;

    const conv = ctx.createConvolver();
    conv.buffer = makeImpulse(ctx);

    const wet = ctx.createGain();
    wet.gain.value = 0.55;
    const dry = ctx.createGain();
    dry.gain.value = 0.7;

    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -8;
    limiter.knee.value = 6;
    limiter.ratio.value = 14;
    limiter.attack.value = 0.004;
    limiter.release.value = 0.25;

    // voices → filter → (dry + wet→conv) → limiter → out
    filter.connect(dry);
    filter.connect(conv);
    conv.connect(wet);
    dry.connect(limiter);
    wet.connect(limiter);
    limiter.connect(ctx.destination);

    masterRef.current = { filter, wet, dry };
    return filter;
  }, []);

  // Start a phrase playing as an incommensurate loop voice.
  const startVoice = useCallback((p: Phrase) => {
    const ctx = ctxRef.current;
    const master = masterRef.current;
    if (!ctx || !master) return;
    const src = ctx.createBufferSource();
    src.buffer = p.buf;
    src.loop = true;
    src.playbackRate.value = p.ratio;
    const gain = ctx.createGain();
    gain.gain.value = 0.0001;
    const pan = ctx.createStereoPanner();
    pan.pan.value = Math.random() * 1.6 - 0.8;
    src.connect(gain);
    gain.connect(pan);
    pan.connect(master.filter);
    // start at a random offset so loops never phase-align
    src.start(0, Math.random() * Math.max(0.01, p.buf.duration * 0.8));
    p.src = src;
    p.gain = gain;
    p.pan = pan;
  }, []);

  const stopVoice = useCallback((p: Phrase) => {
    try {
      p.src?.stop();
    } catch {
      /* already stopped */
    }
    p.src?.disconnect();
    p.gain?.disconnect();
    p.pan?.disconnect();
    p.src = null;
    p.gain = null;
    p.pan = null;
  }, []);

  // Add a phrase to the bank, displacing the oldest if full (decaying memory).
  const addPhrase = useCallback(
    (buf: AudioBuffer, peaks: number[], isDemo: boolean) => {
      const ctx = ctxRef.current;
      if (!ctx) return;
      const bank = phrasesRef.current;
      // displace oldest NON-demo first if full; else oldest demo
      if (bank.length >= MAX_PHRASES) {
        let victimIdx = bank.findIndex((p) => p.isDemo);
        if (victimIdx < 0) {
          victimIdx = 0;
          for (let i = 1; i < bank.length; i++) {
            if (bank[i].capturedAt < bank[victimIdx].capturedAt) victimIdx = i;
          }
        }
        stopVoice(bank[victimIdx]);
        bank.splice(victimIdx, 1);
      }
      const slot = bank.length % LFO_RATES.length;
      const p: Phrase = {
        id: idCounter.current++,
        buf,
        peaks,
        capturedAt: ctx.currentTime,
        src: null,
        gain: null,
        pan: null,
        ratio: RATIOS[Math.floor(Math.random() * RATIOS.length)],
        active: true,
        targetLevel: 0.5 + Math.random() * 0.3,
        lfoRate: LFO_RATES[slot],
        playheadRate: PLAYHEAD_RATES[slot],
        isDemo,
      };
      bank.push(p);
      startVoice(p);
      if (!isDemo) flashRef.current = 1;
      setPhraseCount(bank.length);
    },
    [startVoice, stopVoice]
  );

  // ── Phrase capture from rolling ring buffer ──────────────────────────────────

  const onAudioProcess = useCallback(
    (e: AudioProcessingEvent) => {
      const ring = ringRef.current;
      const ctx = ctxRef.current;
      if (!ring || !ctx) return;
      const input = e.inputBuffer.getChannelData(0);
      const N = input.length;

      // RMS for onset/release detection
      let sumSq = 0;
      for (let i = 0; i < N; i++) sumSq += input[i] * input[i];
      const rms = Math.sqrt(sumSq / N);
      rmsRef.current = rmsRef.current * 0.6 + rms * 0.4;

      // write into ring
      for (let i = 0; i < N; i++) {
        ring[ringPosRef.current] = input[i];
        ringPosRef.current = (ringPosRef.current + 1) % ring.length;
      }
      ringFilledRef.current = Math.min(ring.length, ringFilledRef.current + N);

      // phrase state machine
      const sr = ctx.sampleRate;
      if (!inPhraseRef.current) {
        if (rmsRef.current > ONSET_THRESH) {
          inPhraseRef.current = true;
          phraseLenRef.current = N;
        }
      } else {
        phraseLenRef.current += N;
        const tooLong = phraseLenRef.current > MAX_PHRASE_SECONDS * sr;
        if (rmsRef.current < RELEASE_THRESH || tooLong) {
          const lenSamples = Math.min(phraseLenRef.current, MAX_PHRASE_SECONDS * sr);
          if (lenSamples >= MIN_PHRASE_SECONDS * sr) {
            // slice the most-recent lenSamples out of the ring
            const out = new Float32Array(lenSamples);
            let pos = (ringPosRef.current - lenSamples + ring.length * 2) % ring.length;
            let peak = 0.0001;
            for (let i = 0; i < lenSamples; i++) {
              const v = ring[pos];
              out[i] = v;
              if (Math.abs(v) > peak) peak = Math.abs(v);
              pos = (pos + 1) % ring.length;
            }
            // normalize gently and make a loopable buffer
            const norm = Math.min(3, 0.7 / peak);
            const buf = ctx.createBuffer(1, lenSamples, sr);
            const d = buf.getChannelData(0);
            for (let i = 0; i < lenSamples; i++) d[i] = out[i] * norm;
            applyFades(buf, 0.05);
            addPhrase(buf, buildPeaks(d), false);
          }
          inPhraseRef.current = false;
          phraseLenRef.current = 0;
        }
      }
    },
    [addPhrase]
  );

  // ── State machine: reweave the memory bank into a new movement ───────────────

  const runMovement = useCallback(() => {
    const ctx = ctxRef.current;
    const master = masterRef.current;
    if (!ctx || !master) return;
    movementRef.current += 1;
    setMovement(movementRef.current);

    const bank = phrasesRef.current;
    // random-walk active set: 3-5 voices
    const chosen = new Set(pickFew(bank, Math.min(3, bank.length), 5).map((p) => p.id));
    let live = 0;
    const t = ctx.currentTime;
    for (const p of bank) {
      const wasActive = p.active;
      p.active = chosen.has(p.id);
      if (p.active) live++;
      // re-roll a fresh consonant transposition + level for variety
      if (p.active && !wasActive) {
        p.ratio = RATIOS[Math.floor(Math.random() * RATIOS.length)];
        if (p.src) p.src.playbackRate.setTargetAtTime(p.ratio, t, 1.2);
      }
      p.targetLevel = p.active ? 0.4 + Math.random() * 0.45 : 0;
    }
    setActiveCount(live);

    // random-walk timbre/space (filter, reverb, density)
    const cutoff = 900 + Math.random() * 3200;
    master.filter.frequency.setTargetAtTime(cutoff, t, 4.0);
    master.wet.gain.setTargetAtTime(0.3 + Math.random() * 0.45, t, 5.0);
    master.dry.gain.setTargetAtTime(0.45 + Math.random() * 0.35, t, 5.0);

    nextMovementRef.current =
      ctx.currentTime + MOVEMENT_MIN_S + Math.random() * (MOVEMENT_MAX_S - MOVEMENT_MIN_S);
  }, []);

  // ── Render loop: audio modulation + canvas visualization ─────────────────────

  const draw = useCallback(() => {
    const ctx = ctxRef.current;
    const canvas = canvasRef.current;
    if (!ctx || !canvas) {
      rafRef.current = requestAnimationFrame(draw);
      return;
    }
    const now = ctx.currentTime;
    const el = now - startTimeRef.current;
    setElapsed(el);

    // movement scheduler
    if (now >= nextMovementRef.current) runMovement();

    const bank = phrasesRef.current;

    // per-voice gain modulation: crossfade toward target + slow incommensurate LFO
    for (const p of bank) {
      if (!p.gain) continue;
      const lfo = 0.5 + 0.5 * Math.sin(2 * Math.PI * p.lfoRate * now + p.id);
      const lvl = p.targetLevel * (0.45 + 0.55 * lfo);
      // smooth crossfade
      p.gain.gain.setTargetAtTime(Math.max(0.0001, lvl), now, p.active ? 2.5 : 4.5);
    }

    // ── visualize ──
    const g = canvas.getContext("2d");
    if (!g) {
      rafRef.current = requestAnimationFrame(draw);
      return;
    }
    const W = canvas.width;
    const H = canvas.height;
    g.fillStyle = "#0b0a10";
    g.fillRect(0, 0, W, H);

    // soft warm vignette
    const grad = g.createRadialGradient(W / 2, H / 2, 40, W / 2, H / 2, W * 0.7);
    grad.addColorStop(0, "rgba(60,40,30,0.18)");
    grad.addColorStop(1, "rgba(10,8,14,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, W, H);

    const lanes = bank.length;
    const top = 24;
    const laneH = lanes > 0 ? (H - top - 24) / lanes : 0;

    flashRef.current *= 0.94;

    for (let li = 0; li < lanes; li++) {
      const p = bank[li];
      const y = top + li * laneH + laneH / 2;
      const curGain = p.gain ? p.gain.gain.value : 0;
      const bright = Math.min(1, 0.12 + curGain * 1.6);

      // warm hue by transposition; demos lean cooler
      const hue = p.isDemo ? 40 : 18 + ((p.id * 47) % 50);
      const sat = p.active ? 70 : 28;
      const lab = `${p.isDemo ? "demo" : "captured " + fmtAgo(now - p.capturedAt)}`;

      // lane baseline
      g.strokeStyle = `hsla(${hue},${sat}%,55%,${0.08 + bright * 0.12})`;
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(80, y);
      g.lineTo(W - 16, y);
      g.stroke();

      // waveform
      const wx0 = 80;
      const wW = W - 16 - wx0;
      const amp = laneH * 0.4;
      g.strokeStyle = `hsla(${hue},${sat}%,${55 + bright * 25}%,${0.25 + bright * 0.65})`;
      g.lineWidth = 1.4;
      g.beginPath();
      for (let i = 0; i < p.peaks.length; i++) {
        const x = wx0 + (i / (p.peaks.length - 1)) * wW;
        const v = p.peaks[i] * amp;
        if (i === 0) g.moveTo(x, y - v);
        else g.lineTo(x, y - v);
      }
      for (let i = p.peaks.length - 1; i >= 0; i--) {
        const x = wx0 + (i / (p.peaks.length - 1)) * wW;
        const v = p.peaks[i] * amp;
        g.lineTo(x, y + v);
      }
      g.stroke();

      // playhead sweeping at its own incommensurate rate
      const ph = ((now * p.playheadRate) % 1 + 1) % 1;
      const px = wx0 + ph * wW;
      g.fillStyle = `hsla(${hue},90%,${60 + bright * 30}%,${0.3 + bright * 0.7})`;
      g.fillRect(px - 1, y - amp - 3, 2, amp * 2 + 6);

      // capture flash on newest lane
      if (li === lanes - 1 && flashRef.current > 0.02 && !p.isDemo) {
        g.fillStyle = `rgba(255,210,150,${flashRef.current * 0.25})`;
        g.fillRect(wx0, y - laneH / 2, wW, laneH);
      }

      // label
      g.fillStyle = `rgba(255,255,255,${0.4 + bright * 0.5})`;
      g.font = "11px monospace";
      g.textAlign = "left";
      g.fillText(lab, 8, y + 4);
    }

    // live input meter (when listening)
    if (listening) {
      const m = Math.min(1, rmsRef.current * 6);
      g.fillStyle = inPhraseRef.current ? "rgba(255,180,120,0.9)" : "rgba(140,200,255,0.6)";
      g.fillRect(W - 14, H - 16 - m * (H - 40), 8, m * (H - 40));
    }

    rafRef.current = requestAnimationFrame(draw);
  }, [runMovement, listening]);

  // ── Teardown ──────────────────────────────────────────────────────────────────

  const teardown = useCallback(() => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    for (const p of phrasesRef.current) {
      try {
        p.src?.stop();
      } catch {
        /* noop */
      }
      p.src?.disconnect();
      p.gain?.disconnect();
      p.pan?.disconnect();
    }
    phrasesRef.current = [];
    try {
      procRef.current?.disconnect();
    } catch {
      /* noop */
    }
    procRef.current = null;
    micStreamRef.current?.getTracks().forEach((t) => t.stop());
    micStreamRef.current = null;
    const c = ctxRef.current;
    ctxRef.current = null;
    if (c && c.state !== "closed") c.close().catch(() => {});
  }, []);

  useEffect(() => () => teardown(), [teardown]);

  // ── Seed the demo pad (always-on so it's never silent) ────────────────────────

  const seedDemo = useCallback(
    (ctx: AudioContext) => {
      // three soft D-dorian chord fragments at incommensurate lengths
      const chords = [
        [DORIAN[0], DORIAN[2], DORIAN[4]],
        [DORIAN[1], DORIAN[3], DORIAN[5]],
        [DORIAN[0], DORIAN[3], DORIAN[5] / 2],
      ];
      const lens = [3.7, 4.9, 5.8];
      for (let i = 0; i < chords.length; i++) {
        const buf = makeDemoBuf(ctx, chords[i], lens[i]);
        addPhrase(buf, buildPeaks(buf.getChannelData(0)), true);
      }
    },
    [addPhrase]
  );

  // ── Capture wiring for a given input node ─────────────────────────────────────

  const wireCapture = useCallback(
    (ctx: AudioContext, inputNode: AudioNode) => {
      ringRef.current = new Float32Array(Math.floor(ctx.sampleRate * RING_SECONDS));
      ringPosRef.current = 0;
      ringFilledRef.current = 0;
      const proc = ctx.createScriptProcessor(4096, 1, 1);
      proc.onaudioprocess = onAudioProcess;
      inputNode.connect(proc);
      // ScriptProcessor needs a destination connection to run; route through a
      // muted gain so the raw input is NOT heard (only captured loops play).
      const sink = ctx.createGain();
      sink.gain.value = 0;
      proc.connect(sink);
      sink.connect(ctx.destination);
      procRef.current = proc;
      setListening(true);
    },
    [onAudioProcess]
  );

  // ── Boot sequence shared by all sources ───────────────────────────────────────

  const boot = useCallback((): AudioContext | null => {
    try {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) {
        setErr("Web Audio is not available in this browser.");
        return null;
      }
      const ctx = new AC();
      ctxRef.current = ctx;
      buildGraph(ctx);
      seedDemo(ctx);
      startTimeRef.current = ctx.currentTime;
      movementRef.current = 1;
      setMovement(1);
      nextMovementRef.current =
        ctx.currentTime + MOVEMENT_MIN_S + Math.random() * (MOVEMENT_MAX_S - MOVEMENT_MIN_S);
      setRunning(true);
      rafRef.current = requestAnimationFrame(draw);
      return ctx;
    } catch {
      setErr("Could not initialize audio.");
      return null;
    }
  }, [buildGraph, seedDemo, draw]);

  // ── Source: microphone ────────────────────────────────────────────────────────

  const startMic = useCallback(async () => {
    setErr(null);
    const ctx = ctxRef.current ?? boot();
    if (!ctx) return;
    await ctx.resume();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      micStreamRef.current = stream;
      const srcNode = ctx.createMediaStreamSource(stream);
      wireCapture(ctx, srcNode);
      setSource("mic");
    } catch {
      setErr("Microphone denied. The synthesized demo pad keeps playing — drop a file or load a track to feed it phrases.");
    }
  }, [boot, wireCapture]);

  // ── Source: demo only ─────────────────────────────────────────────────────────

  const startDemo = useCallback(async () => {
    setErr(null);
    const ctx = ctxRef.current ?? boot();
    if (!ctx) return;
    await ctx.resume();
    setSource("demo");
  }, [boot]);

  // ── Source: decode a buffer, loop & capture its onsets ────────────────────────

  const feedFromBuffer = useCallback(
    (ctx: AudioContext, audioBuf: AudioBuffer) => {
      const player = ctx.createBufferSource();
      player.buffer = audioBuf;
      player.loop = true;
      const tap = ctx.createGain();
      tap.gain.value = 1;
      player.connect(tap);
      // route into capture pipeline (not directly audible)
      wireCapture(ctx, tap);
      player.start();
    },
    [wireCapture]
  );

  const onFile = useCallback(
    async (file: File) => {
      setErr(null);
      const ctx = ctxRef.current ?? boot();
      if (!ctx) return;
      await ctx.resume();
      try {
        const ab = await file.arrayBuffer();
        const audioBuf = await ctx.decodeAudioData(ab);
        feedFromBuffer(ctx, audioBuf);
        setSource("file");
      } catch {
        setErr("Could not decode that file. The demo pad continues.");
      }
    },
    [boot, feedFromBuffer]
  );

  const loadTrack = useCallback(async () => {
    const id = trackId.trim();
    if (!id) return;
    setErr(null);
    const ctx = ctxRef.current ?? boot();
    if (!ctx) return;
    await ctx.resume();
    try {
      const res = await fetch("/api/audio/" + encodeURIComponent(id));
      const ct = res.headers.get("content-type") || "";
      let buf: ArrayBuffer;
      if (ct.includes("application/json")) {
        const { url } = await res.json();
        buf = await (await fetch(url)).arrayBuffer();
      } else {
        buf = await res.arrayBuffer();
      }
      const audioBuf = await ctx.decodeAudioData(buf);
      feedFromBuffer(ctx, audioBuf);
      setSource("track");
    } catch {
      setErr("Could not load that track. The demo pad continues.");
    }
  }, [trackId, boot, feedFromBuffer]);

  // ── Canvas sizing ──────────────────────────────────────────────────────────────

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const resize = () => {
      const r = c.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      c.width = Math.floor(r.width * dpr);
      c.height = Math.floor(r.height * dpr);
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [running]);

  // ── UI ──────────────────────────────────────────────────────────────────────

  return (
    <main className="min-h-screen bg-[#0b0a10] text-white px-5 py-6 md:px-10 md:py-8 flex flex-col gap-5">
      <a
        href="https://github.com/kbarnoski/resonance/blob/main/src/app/dream/275-memory-loom/README.md"
        className="fixed top-4 right-5 z-10 text-sm text-white/60 hover:text-white/90 underline underline-offset-4"
      >
        Read the design notes
      </a>

      <header className="flex flex-col gap-2 max-w-3xl">
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-white">
          Memory Loom
        </h1>
        <p className="text-base text-white/75 leading-relaxed">
          A piece that <span className="text-violet-300">listens to you play</span>, captures verbatim
          phrases, and weaves them into an endless Frippertronics tape-loop room built from your own
          sound — audibly different at minute 10 than at minute 1.
        </p>
      </header>

      {err && (
        <p className="text-base text-rose-300 max-w-3xl" role="alert">
          {err}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        {!running ? (
          <>
            <button
              onClick={startMic}
              className="min-h-[44px] px-5 py-2.5 rounded-lg bg-violet-500/90 hover:bg-violet-400 text-white font-medium transition"
            >
              Use mic + start
            </button>
            <button
              onClick={startDemo}
              className="min-h-[44px] px-4 py-2.5 rounded-lg bg-white/10 hover:bg-white/15 text-white/90 transition"
            >
              Start demo only
            </button>
          </>
        ) : (
          <>
            {source !== "mic" && (
              <button
                onClick={startMic}
                className="min-h-[44px] px-4 py-2.5 rounded-lg bg-violet-500/90 hover:bg-violet-400 text-white font-medium transition"
              >
                Add mic
              </button>
            )}
            <label className="min-h-[44px] px-4 py-2.5 rounded-lg bg-white/10 hover:bg-white/15 text-white/90 transition cursor-pointer flex items-center">
              Feed a file
              <input
                type="file"
                accept="audio/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onFile(f);
                }}
              />
            </label>
            <div className="flex items-center gap-2">
              <input
                value={trackId}
                onChange={(e) => setTrackId(e.target.value)}
                placeholder="Welcome Home track id"
                className="min-h-[44px] px-3 py-2 rounded-lg bg-black/40 border border-white/15 text-base text-white/90 placeholder:text-white/45 w-52"
              />
              <button
                onClick={loadTrack}
                className="min-h-[44px] px-4 py-2.5 rounded-lg bg-white/10 hover:bg-white/15 text-white/90 transition"
              >
                Load
              </button>
            </div>
            <button
              onClick={teardown}
              className="min-h-[44px] px-4 py-2.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 transition ml-auto"
            >
              Stop
            </button>
          </>
        )}
      </div>

      {running && (
        <div className="flex flex-wrap gap-x-6 gap-y-1 font-mono text-sm text-white/70">
          <span>
            elapsed <span className="text-emerald-300/95">{fmtClock(elapsed)}</span>
          </span>
          <span>
            movement <span className="text-amber-300/95">#{movement}</span>
          </span>
          <span>
            voices <span className="text-violet-300">{activeCount}</span>/{phraseCount}
          </span>
          <span>
            input{" "}
            <span className={listening ? "text-emerald-300/95" : "text-white/55"}>
              {listening ? source : "demo pad"}
            </span>
          </span>
          {listening && (
            <span className="text-white/55">
              {inPhraseRef.current ? "capturing phrase…" : "waiting for a phrase…"}
            </span>
          )}
        </div>
      )}

      <div className="flex-1 min-h-[340px] rounded-xl overflow-hidden border border-white/10 bg-black/30">
        <canvas ref={canvasRef} className="w-full h-full block" style={{ height: "60vh" }} />
      </div>

      <p className="text-sm text-white/55 max-w-3xl leading-relaxed">
        The loom shows your memory bank: each lane is a captured phrase, its waveform drawn in,
        a playhead sweeping at its own incommensurate rate, brightness = how loud it is right now.
        Newly captured phrases displace the oldest — a decaying memory after Eno &amp; Fripp.
      </p>
    </main>
  );
}
