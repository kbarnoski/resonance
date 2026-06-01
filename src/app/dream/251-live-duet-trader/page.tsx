'use client';

import { useRef, useEffect, useState, useCallback } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

type NoteEvent = { midi: number; startMs: number; endMs: number };
type MTable = Map<number, Map<number, number>>;

// ─── Constants ────────────────────────────────────────────────────────────────

const MIDI_LO = 40;
const MIDI_HI = 84;
const MIDI_R = MIDI_HI - MIDI_LO;
const WIN_MS = 7000; // seconds visible in the scrolling roll
const GAP_MS = 320; // silence before PARTNER darts in
const MIN_HISTORY = 3; // notes of your playing before partner answers
const PITCH_HOP_MS = 16; // pitch-detect cadence (~60 Hz)
const RMS_GATE = 0.0008; // reject silence / noise floor
const NOTE_DEBOUNCE_MS = 70; // pitch must hold this long to count as a new note

// Major-scale interval set (semitone classes) keyed for scale inference.
const MAJOR_PCS = [0, 2, 4, 5, 7, 9, 11];
const PENTA_OFFSETS = [0, 2, 4, 7, 9]; // major pentatonic degrees within a key

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

// ─── Pure audio helpers ───────────────────────────────────────────────────────

function freqToMidi(f: number): number {
  return Math.round(12 * Math.log2(f / 440) + 69);
}

function midiToFreq(m: number): number {
  return 440 * Math.pow(2, (m - 69) / 12);
}

// NSDF / McLeod-style monophonic pitch detection over a time-domain frame.
function detectPitch(buf: Float32Array, sr: number): number {
  const N = buf.length;
  let rms = 0;
  for (let i = 0; i < N; i++) rms += buf[i] * buf[i];
  if (rms / N < RMS_GATE) return 0;

  const minP = Math.floor(sr / 1200);
  const maxP = Math.min(Math.floor(sr / 70), N >> 1);
  let best = -Infinity;
  let bestP = -1;
  for (let p = minP; p <= maxP; p++) {
    let corr = 0;
    let norm = 0;
    for (let i = 0; i < N - p; i++) {
      corr += buf[i] * buf[i + p];
      norm += buf[i] * buf[i] + buf[i + p] * buf[i + p];
    }
    const nsdf = norm > 0 ? (2 * corr) / norm : 0;
    if (nsdf > best) {
      best = nsdf;
      bestP = p;
    }
  }
  return bestP > 0 && best > 0.55 ? sr / bestP : 0;
}

// Infer a key (root pitch class) from a pitch-class histogram by best major fit.
function inferKey(hist: number[]): number {
  let bestRoot = 0;
  let bestScore = -Infinity;
  for (let root = 0; root < 12; root++) {
    let score = 0;
    for (const pc of MAJOR_PCS) score += hist[(root + pc) % 12];
    // Tonic + dominant weighted — they anchor a key.
    score += hist[root] * 1.4 + hist[(root + 7) % 12] * 0.6;
    if (score > bestScore) {
      bestScore = score;
      bestRoot = root;
    }
  }
  return bestRoot;
}

// Snap a midi note to the nearest tone of the major-pentatonic in `key`.
function snapToKey(midi: number, key: number): number {
  let best = midi;
  let bestD = Infinity;
  for (let oct = -1; oct <= 1; oct++) {
    for (const off of PENTA_OFFSETS) {
      const candidate = Math.round(midi / 12) * 12 + (((key + off) % 12) + 12) % 12 + oct * 12;
      const d = Math.abs(candidate - midi);
      if (d < bestD) {
        bestD = d;
        best = candidate;
      }
    }
  }
  return Math.max(MIDI_LO, Math.min(MIDI_HI, best));
}

function buildTable(notes: number[]): MTable {
  const t: MTable = new Map();
  for (let i = 0; i < notes.length - 1; i++) {
    const a = notes[i];
    const b = notes[i + 1];
    if (!t.has(a)) t.set(a, new Map());
    const row = t.get(a)!;
    row.set(b, (row.get(b) ?? 0) + 1);
  }
  return t;
}

// Walk the Markov table to generate a fill; fall back to a key-constrained
// random step when the table is sparse so the answer always sounds right.
function generateFill(seed: number, t: MTable, len: number, key: number): number[] {
  const out: number[] = [];
  let cur = snapToKey(seed, key);
  for (let i = 0; i < len; i++) {
    const row = t.get(cur);
    let next: number;
    if (row && row.size > 0 && Math.random() > 0.25) {
      const total = Array.from(row.values()).reduce((a, b) => a + b, 0);
      let rv = Math.random() * total;
      next = cur;
      for (const [p, c] of row) {
        rv -= c;
        if (rv <= 0) {
          next = p;
          break;
        }
      }
    } else {
      const stepUp = Math.random() < 0.55;
      const jump = (Math.floor(Math.random() * 2) + 1) * (stepUp ? 2 : -2);
      next = snapToKey(cur + jump, key);
    }
    out.push(next);
    cur = next;
  }
  return out;
}

// Lively rhythm: a sequence of step durations (seconds) for the fill.
function makeRhythm(n: number): number[] {
  const palette = [0.18, 0.24, 0.24, 0.3, 0.36, 0.48];
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(palette[Math.floor(Math.random() * palette.length)]);
  return out;
}

// ─── Voices ─────────────────────────────────────────────────────────────────

interface PartnerVoice {
  master: GainNode; // ducks to 0 on your re-entry
  delay: DelayNode;
  pad: OscillatorNode;
}

function makePartnerVoice(ac: AudioContext): PartnerVoice {
  const master = ac.createGain();
  master.gain.value = 1;
  master.connect(ac.destination);

  // Shimmer delay tap for a touch of jazz-club air.
  const delay = ac.createDelay(0.5);
  delay.delayTime.value = 0.22;
  const fb = ac.createGain();
  fb.gain.value = 0.28;
  const wet = ac.createGain();
  wet.gain.value = 0.32;
  delay.connect(fb);
  fb.connect(delay);
  delay.connect(wet);
  wet.connect(master);

  // Low pad so the room is never fully silent.
  const pad = ac.createOscillator();
  pad.type = 'sine';
  pad.frequency.value = midiToFreq(MIDI_LO - 12);
  const padGain = ac.createGain();
  padGain.gain.value = 0.02;
  pad.connect(padGain);
  padGain.connect(master);
  pad.start();

  return { master, delay, pad };
}

// One warm partner tone: triangle + slightly inharmonic partials, soft env.
function partnerTone(ac: AudioContext, voice: PartnerVoice, midi: number, when: number, dur: number): void {
  const f = midiToFreq(midi);
  const env = ac.createGain();
  env.connect(voice.master);
  env.connect(voice.delay);
  env.gain.setValueAtTime(0, when);
  env.gain.linearRampToValueAtTime(0.22, when + 0.018);
  env.gain.exponentialRampToValueAtTime(0.001, when + dur);
  const partials: [number, number][] = [
    [1, 1.0],
    [2.01, 0.4],
    [3.02, 0.16],
    [4.04, 0.06],
  ];
  for (const [h, g] of partials) {
    const o = ac.createOscillator();
    o.type = h === 1 ? 'triangle' : 'sine';
    o.frequency.setValueAtTime(f * h, when);
    const og = ac.createGain();
    og.gain.setValueAtTime(g, when);
    o.connect(og);
    og.connect(env);
    o.start(when);
    o.stop(when + dur + 0.15);
  }
}

// Faint confirmation echo of your own detected note (amber side).
function echoTone(ac: AudioContext, midi: number, when: number): void {
  const o = ac.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(midiToFreq(midi), when);
  const g = ac.createGain();
  g.gain.setValueAtTime(0, when);
  g.gain.linearRampToValueAtTime(0.05, when + 0.01);
  g.gain.exponentialRampToValueAtTime(0.001, when + 0.25);
  o.connect(g);
  g.connect(ac.destination);
  o.start(when);
  o.stop(when + 0.3);
}

// ─── Canvas helpers ───────────────────────────────────────────────────────────

function noteY(midi: number, y0: number, h: number): number {
  return y0 + h * (1 - (midi - MIDI_LO) / MIDI_R);
}

function drawPanel(
  ctx: CanvasRenderingContext2D,
  notes: NoteEvent[],
  nowMs: number,
  y0: number,
  h: number,
  fill: string,
  glow: string,
  label: string,
  active: boolean,
  W: number,
): void {
  ctx.strokeStyle = 'rgba(255,255,255,0.045)';
  ctx.lineWidth = 1;
  for (let m = MIDI_LO; m <= MIDI_HI; m += 12) {
    const gy = noteY(m, y0, h);
    ctx.beginPath();
    ctx.moveTo(0, gy);
    ctx.lineTo(W, gy);
    ctx.stroke();
  }

  ctx.fillStyle = active ? fill : 'rgba(255,255,255,0.35)';
  ctx.font = '13px ui-monospace, monospace';
  ctx.textAlign = 'left';
  ctx.fillText(label, 12, y0 + 17);

  const rh = Math.max(5, h / MIDI_R);
  for (const n of notes) {
    const eMs = n.endMs > 0 ? n.endMs : nowMs;
    const x1 = W * (1 - (nowMs - n.startMs) / WIN_MS);
    const x2 = W * (1 - (nowMs - eMs) / WIN_MS);
    if (x2 < 0 || x1 > W) continue;
    const nx = Math.max(0, x1);
    const nw = Math.max(4, Math.min(W, x2) - nx);
    const ny = noteY(n.midi, y0, h) - rh / 2;
    ctx.shadowColor = glow;
    ctx.shadowBlur = 12;
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.roundRect(nx, ny, nw, rh, 2);
    ctx.fill();
  }
  ctx.shadowBlur = 0;
}

// ─── Scene state shared with the render loop ───────────────────────────────────

type TraderState = 'idle' | 'listening' | 'answering';

interface Scene {
  userNotes: NoteEvent[];
  partnerNotes: NoteEvent[];
  state: TraderState;
  liveMidi: number; // your currently-sounding note (0 = none)
  gapMs: number; // ms since your last onset
  keyRoot: number; // inferred key pitch class
  exchanges: number;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function LiveDuetTrader() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const acRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const voiceRef = useRef<PartnerVoice | null>(null);
  const rafRef = useRef<number>(0);
  const pitchTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fillTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const demoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pitchBufRef = useRef<Float32Array | null>(null);

  // Live mutable state read inside rAF / timers.
  const sceneRef = useRef<Scene>({
    userNotes: [],
    partnerNotes: [],
    state: 'idle',
    liveMidi: 0,
    gapMs: 0,
    keyRoot: 0,
    exchanges: 0,
  });
  const userMidiSeqRef = useRef<number[]>([]); // training sequence (snapped)
  const pcHistRef = useRef<number[]>(new Array(12).fill(0));
  const tableRef = useRef<MTable>(new Map());
  const lastOnsetMsRef = useRef<number>(0);
  const activeMidiRef = useRef<number>(0);
  const candidateMidiRef = useRef<number>(0);
  const candidateSinceRef = useRef<number>(0);

  const [uiState, setUiState] = useState<TraderState>('idle');
  const [keyLabel, setKeyLabel] = useState<string>('—');
  const [exchanges, setExchanges] = useState(0);
  const [err, setErr] = useState('');
  const [demoMode, setDemoMode] = useState(false);
  const [showNotes, setShowNotes] = useState(false);

  // Duck the partner: fast gain fade + cancel its scheduled phrase.
  const duckPartner = useCallback(() => {
    const ac = acRef.current;
    const voice = voiceRef.current;
    if (!ac || !voice) return;
    voice.master.gain.cancelScheduledValues(ac.currentTime);
    voice.master.gain.setValueAtTime(voice.master.gain.value, ac.currentTime);
    voice.master.gain.linearRampToValueAtTime(0, ac.currentTime + 0.05);
    if (fillTimerRef.current) {
      clearTimeout(fillTimerRef.current);
      fillTimerRef.current = null;
    }
    if (sceneRef.current.state === 'answering') {
      sceneRef.current.state = 'listening';
      setUiState('listening');
    }
  }, []);

  // PARTNER darts into the detected gap with a generated phrase.
  const launchFill = useCallback(() => {
    const ac = acRef.current;
    const voice = voiceRef.current;
    if (!ac || !voice) return;
    if (sceneRef.current.state !== 'listening') return;
    if (userMidiSeqRef.current.length < MIN_HISTORY) return;

    // (Re)build the Markov table from everything you've played so far.
    tableRef.current = buildTable(userMidiSeqRef.current);
    const key = inferKey(pcHistRef.current);
    sceneRef.current.keyRoot = key;
    setKeyLabel(`${NOTE_NAMES[key]} pentatonic`);

    const seed = userMidiSeqRef.current[userMidiSeqRef.current.length - 1];
    const len = 4 + Math.floor(Math.random() * 4);
    const seq = generateFill(seed, tableRef.current, len, key);
    const rhythm = makeRhythm(len);

    // Un-duck for the answer.
    voice.master.gain.cancelScheduledValues(ac.currentTime);
    voice.master.gain.setValueAtTime(0, ac.currentTime);
    voice.master.gain.linearRampToValueAtTime(1, ac.currentTime + 0.04);

    sceneRef.current.state = 'answering';
    setUiState('answering');

    const now = ac.currentTime;
    const wallNow = Date.now();
    let t = 0;
    seq.forEach((midi, i) => {
      const dur = rhythm[i];
      partnerTone(ac, voice, midi, now + t, dur + 0.1);
      sceneRef.current.partnerNotes.push({
        midi,
        startMs: wallNow + t * 1000,
        endMs: wallNow + (t + dur) * 1000,
      });
      t += dur;
    });

    // After the phrase, hand the floor back. (If you re-enter sooner, the
    // pitch loop ducks immediately — that is the trading behaviour.)
    fillTimerRef.current = setTimeout(() => {
      if (sceneRef.current.state === 'answering') {
        sceneRef.current.state = 'listening';
        setUiState('listening');
        sceneRef.current.exchanges += 1;
        setExchanges((e) => e + 1);
        // Reset the gap clock so it doesn't instantly re-fire.
        lastOnsetMsRef.current = Date.now();
      }
      fillTimerRef.current = null;
    }, t * 1000 + 250);
  }, []);

  // Register a confirmed onset from your playing.
  const registerOnset = useCallback(
    (midi: number, nowMs: number) => {
      const scene = sceneRef.current;
      // Right of way: silence the partner the instant you re-enter.
      if (scene.state === 'answering') duckPartner();

      // Close the previous note.
      if (activeMidiRef.current > 0 && scene.userNotes.length > 0) {
        const last = scene.userNotes[scene.userNotes.length - 1];
        if (last.endMs === 0) last.endMs = nowMs;
      }

      const snapped = snapToKey(midi, scene.keyRoot || (midi % 12));
      scene.userNotes.push({ midi: snapped, startMs: nowMs, endMs: 0 });
      userMidiSeqRef.current.push(snapped);
      pcHistRef.current[((snapped % 12) + 12) % 12] += 1;
      activeMidiRef.current = snapped;
      scene.liveMidi = snapped;
      lastOnsetMsRef.current = nowMs;

      // Faint echo confirmation of your own note.
      const ac = acRef.current;
      if (ac && !demoMode) echoTone(ac, snapped, ac.currentTime);

      // Keep the key label fresh as you accumulate notes.
      if (userMidiSeqRef.current.length >= MIN_HISTORY) {
        const key = inferKey(pcHistRef.current);
        scene.keyRoot = key;
        setKeyLabel(`${NOTE_NAMES[key]} pentatonic`);
      }
    },
    [duckPartner, demoMode],
  );

  // Pitch-detect loop (mic mode): track stable notes, gaps, and trigger fills.
  const runPitchLoop = useCallback(() => {
    const analyser = analyserRef.current;
    const ac = acRef.current;
    const buf = pitchBufRef.current;
    if (!analyser || !ac || !buf) return;

    (analyser.getFloatTimeDomainData as (a: Float32Array) => void)(buf);
    const freq = detectPitch(buf, ac.sampleRate);
    const nowMs = Date.now();

    if (freq > 0) {
      const midi = freqToMidi(freq);
      if (midi >= MIDI_LO - 12 && midi <= MIDI_HI + 12) {
        // Debounce: pitch must hold briefly before it counts as a new note.
        if (candidateMidiRef.current !== midi) {
          candidateMidiRef.current = midi;
          candidateSinceRef.current = nowMs;
        }
        const held = nowMs - candidateSinceRef.current >= NOTE_DEBOUNCE_MS;
        const snapped = snapToKey(midi, sceneRef.current.keyRoot || midi % 12);
        if (held && snapped !== activeMidiRef.current) {
          registerOnset(midi, nowMs);
        }
      }
    } else {
      // No pitch this frame — your note (if any) has ended.
      if (activeMidiRef.current > 0) {
        const scene = sceneRef.current;
        if (scene.userNotes.length > 0) {
          const last = scene.userNotes[scene.userNotes.length - 1];
          if (last.endMs === 0) last.endMs = nowMs;
        }
        activeMidiRef.current = 0;
        scene.liveMidi = 0;
        candidateMidiRef.current = 0;
      }
    }

    // Gap detection — the heart. While you are listening and a silence opens
    // past the threshold, dart in.
    const gap = nowMs - lastOnsetMsRef.current;
    sceneRef.current.gapMs = gap;
    if (
      sceneRef.current.state === 'listening' &&
      activeMidiRef.current === 0 &&
      gap > GAP_MS &&
      !fillTimerRef.current &&
      userMidiSeqRef.current.length >= MIN_HISTORY
    ) {
      launchFill();
    }
  }, [registerOnset, launchFill]);

  // Demo: a synthesized melodic phrase that plays, pauses (so the partner
  // trades back), then repeats — fully mic-free.
  const startDemo = useCallback(() => {
    if (sceneRef.current.state !== 'idle') return;
    const ac = new AudioContext();
    acRef.current = ac;
    voiceRef.current = makePartnerVoice(ac);
    setDemoMode(true);
    sceneRef.current.state = 'listening';
    setUiState('listening');
    lastOnsetMsRef.current = Date.now();

    // A C-major pentatonic motif the "player" repeats with pauses between.
    const motif = [60, 64, 67, 64, 62, 67, 69, 67];

    const playMotif = () => {
      if (sceneRef.current.state === 'idle') return;
      const ac2 = acRef.current!;
      let t = 0;
      motif.forEach((midi) => {
        // Schedule the onset registration in wall time so gap detection runs.
        setTimeout(() => {
          if (sceneRef.current.state === 'idle') return;
          registerOnset(midi, Date.now());
          // Audible demo "player" voice (amber): a soft sine.
          const o = ac2.createOscillator();
          o.type = 'triangle';
          o.frequency.value = midiToFreq(midi);
          const g = ac2.createGain();
          g.gain.setValueAtTime(0, ac2.currentTime);
          g.gain.linearRampToValueAtTime(0.16, ac2.currentTime + 0.01);
          g.gain.exponentialRampToValueAtTime(0.001, ac2.currentTime + 0.32);
          o.connect(g);
          g.connect(ac2.destination);
          o.start();
          o.stop(ac2.currentTime + 0.36);
          // Close out the note shortly after.
          setTimeout(() => {
            const sc = sceneRef.current;
            if (activeMidiRef.current === snapToKey(midi, sc.keyRoot || midi % 12)) {
              activeMidiRef.current = 0;
              sc.liveMidi = 0;
            }
            const last = sc.userNotes[sc.userNotes.length - 1];
            if (last && last.endMs === 0) last.endMs = Date.now();
          }, 220);
        }, t * 1000);
        t += 0.26;
      });
      // After the motif, the demo "player" pauses ~1s so the gap opens and
      // the partner trades back. Then repeat.
      demoTimerRef.current = setTimeout(playMotif, t * 1000 + 1700);
    };
    playMotif();

    // Run the gap-detection loop in demo mode too (no analyser needed).
    pitchTimerRef.current = setInterval(() => {
      const nowMs = Date.now();
      const gap = nowMs - lastOnsetMsRef.current;
      sceneRef.current.gapMs = gap;
      if (
        sceneRef.current.state === 'listening' &&
        activeMidiRef.current === 0 &&
        gap > GAP_MS &&
        !fillTimerRef.current &&
        userMidiSeqRef.current.length >= MIN_HISTORY
      ) {
        launchFill();
      }
    }, PITCH_HOP_MS);
  }, [registerOnset, launchFill]);

  const startMic = useCallback(async () => {
    if (sceneRef.current.state !== 'idle') return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
        video: false,
      });
      streamRef.current = stream;
      const ac = new AudioContext();
      acRef.current = ac;
      const src = ac.createMediaStreamSource(stream);
      const analyser = ac.createAnalyser();
      analyser.fftSize = 2048;
      src.connect(analyser);
      analyserRef.current = analyser;
      pitchBufRef.current = new Float32Array(new ArrayBuffer(analyser.fftSize * 4));
      voiceRef.current = makePartnerVoice(ac);

      sceneRef.current.state = 'listening';
      setUiState('listening');
      lastOnsetMsRef.current = Date.now();
      pitchTimerRef.current = setInterval(runPitchLoop, PITCH_HOP_MS);
    } catch {
      setErr('Microphone unavailable or denied. Running the demo so you can see the trading.');
      startDemo();
    }
  }, [runPitchLoop, startDemo]);

  const stopAll = useCallback(() => {
    if (pitchTimerRef.current) clearInterval(pitchTimerRef.current);
    if (fillTimerRef.current) clearTimeout(fillTimerRef.current);
    if (demoTimerRef.current) clearTimeout(demoTimerRef.current);
    pitchTimerRef.current = null;
    fillTimerRef.current = null;
    demoTimerRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    voiceRef.current = null;
    void acRef.current?.close();
    acRef.current = null;
    analyserRef.current = null;
    pitchBufRef.current = null;

    sceneRef.current = {
      userNotes: [],
      partnerNotes: [],
      state: 'idle',
      liveMidi: 0,
      gapMs: 0,
      keyRoot: 0,
      exchanges: 0,
    };
    userMidiSeqRef.current = [];
    pcHistRef.current = new Array(12).fill(0);
    tableRef.current = new Map();
    activeMidiRef.current = 0;
    candidateMidiRef.current = 0;

    setUiState('idle');
    setKeyLabel('—');
    setExchanges(0);
    setErr('');
    setDemoMode(false);
  }, []);

  // Render loop.
  useEffect(() => {
    const tick = () => {
      rafRef.current = requestAnimationFrame(tick);
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const W = canvas.width;
      const H = canvas.height;
      if (!W || !H) return;

      ctx.clearRect(0, 0, W, H);
      const bg = ctx.createLinearGradient(0, 0, 0, H);
      bg.addColorStop(0, '#120c08');
      bg.addColorStop(1, '#0a0a10');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);

      const scene = sceneRef.current;
      const nowMs = Date.now();
      const labH = 24;
      const divY = Math.floor(H / 2);
      const panH = divY - labH - 6;

      drawPanel(
        ctx,
        scene.userNotes,
        nowMs,
        labH,
        panH,
        'rgba(251,191,36,0.92)',
        'rgba(251,146,60,0.65)',
        'YOU',
        scene.state === 'listening',
        W,
      );

      // Divider.
      ctx.strokeStyle = 'rgba(255,255,255,0.09)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, divY);
      ctx.lineTo(W, divY);
      ctx.stroke();

      drawPanel(
        ctx,
        scene.partnerNotes,
        nowMs,
        divY + labH,
        panH,
        'rgba(45,212,191,0.92)',
        'rgba(20,184,166,0.6)',
        'PARTNER',
        scene.state === 'answering',
        W,
      );

      // Live pitch dot (amber) at the right edge.
      if (scene.liveMidi > 0) {
        const py = noteY(scene.liveMidi, labH, panH);
        ctx.fillStyle = 'rgba(251,191,36,0.98)';
        ctx.shadowColor = 'rgba(251,191,36,0.85)';
        ctx.shadowBlur = 16;
        ctx.beginPath();
        ctx.arc(W - 14, py, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      // Gap timer bar near the divider — fills toward the trade threshold.
      if (scene.state === 'listening') {
        const frac = Math.min(1, scene.gapMs / GAP_MS);
        const barW = 120;
        const bx = W - barW - 14;
        const by = divY - 9;
        ctx.fillStyle = 'rgba(255,255,255,0.1)';
        ctx.fillRect(bx, by, barW, 5);
        ctx.fillStyle =
          frac >= 1 ? 'rgba(45,212,191,0.9)' : 'rgba(251,191,36,0.8)';
        ctx.fillRect(bx, by, barW * frac, 5);
        ctx.fillStyle = 'rgba(255,255,255,0.55)';
        ctx.font = '11px ui-monospace, monospace';
        ctx.textAlign = 'right';
        ctx.fillText('gap → trade', bx - 8, by + 5);
      }

      // State badge.
      ctx.textAlign = 'left';
      ctx.font = '600 13px ui-monospace, monospace';
      if (scene.state === 'listening') {
        ctx.fillStyle = 'rgba(251,191,36,0.95)';
        ctx.fillText('● LISTENING', 12, divY - 8);
      } else if (scene.state === 'answering') {
        ctx.fillStyle = 'rgba(45,212,191,0.95)';
        ctx.fillText('◆ ANSWERING', 12, divY + labH + 4);
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  // Resize canvas to fill its container.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ro = new ResizeObserver(() => {
      canvas.width = canvas.clientWidth;
      canvas.height = canvas.clientHeight;
    });
    ro.observe(canvas);
    canvas.width = canvas.clientWidth;
    canvas.height = canvas.clientHeight;
    return () => ro.disconnect();
  }, []);

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      if (pitchTimerRef.current) clearInterval(pitchTimerRef.current);
      if (fillTimerRef.current) clearTimeout(fillTimerRef.current);
      if (demoTimerRef.current) clearTimeout(demoTimerRef.current);
      cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      void acRef.current?.close();
    };
  }, []);

  const stateText =
    uiState === 'answering'
      ? 'Partner is darting into your gap — play to take the floor back'
      : uiState === 'listening'
        ? demoMode
          ? 'Demo: a phrase plays, pauses, and the partner trades back — repeat'
          : 'Play a pitched phrase, then pause — the partner answers in your key'
        : 'Real-time gap-detected trading · live Markov · zero deps · no AI calls';

  return (
    <div className="flex flex-col h-screen bg-[#0a0a10] text-white select-none">
      <div className="px-6 pt-5 pb-3 flex-shrink-0">
        <h1 className="text-2xl font-semibold text-white/95 tracking-tight">Live Duet Trader</h1>
        <p className="text-base text-white/75 mt-1 max-w-2xl">
          The instant you pause, it darts in with a melodic answer in your key. The instant you
          play again, it ducks out of the way. Interleaved trading — not turn-based waiting.
        </p>
      </div>

      <div className="flex-1 mx-4 mb-3 rounded-xl overflow-hidden border border-white/10 relative min-h-0">
        <canvas ref={canvasRef} className="w-full h-full block" />

        {uiState === 'idle' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 bg-[#0a0a10]/85 backdrop-blur-sm">
            <div className="max-w-md text-center px-6">
              <p className="text-base text-white/75 leading-relaxed mb-6">
                Play any pitched instrument (piano, voice, guitar) into your mic. After ~3 notes the
                partner starts learning your intervals; whenever a{' '}
                <span className="text-amber-300/95">~320 ms gap</span> opens it trades a phrase in
                your inferred key, and ducks the moment you re-enter.
              </p>
              <div className="flex gap-3 justify-center">
                <button
                  onClick={() => {
                    void startMic();
                  }}
                  className="px-5 py-2.5 min-h-[44px] rounded-lg bg-amber-500/20 border border-amber-500/40 text-amber-300 text-base font-medium hover:bg-amber-500/30 transition-colors"
                >
                  Start listening (mic)
                </button>
                <button
                  onClick={startDemo}
                  className="px-5 py-2.5 min-h-[44px] rounded-lg bg-white/5 border border-white/10 text-white/75 text-base hover:bg-white/10 transition-colors"
                >
                  Play demo
                </button>
              </div>
              {err && <p className="text-rose-300 text-base mt-4">{err}</p>}
            </div>
          </div>
        )}

        {uiState !== 'idle' && (
          <div className="absolute bottom-4 left-0 right-0 flex justify-center">
            <button
              onClick={stopAll}
              className="px-5 py-2.5 min-h-[44px] rounded-lg bg-white/5 border border-white/10 text-white/75 text-base hover:bg-white/10 transition-colors"
            >
              Stop
            </button>
          </div>
        )}
      </div>

      <div className="px-6 pb-2 flex-shrink-0 flex items-center justify-between text-sm gap-4">
        <span className="text-white/55">{stateText}</span>
        <span className="text-white/55 font-mono flex-shrink-0">
          key <span className="text-emerald-300/95">{keyLabel}</span>
          {exchanges > 0 && (
            <>
              {' · '}
              {exchanges} trade{exchanges !== 1 ? 's' : ''}
            </>
          )}
        </span>
      </div>

      {/* Design notes */}
      <div className="px-6 pb-4 flex-shrink-0">
        <button
          onClick={() => setShowNotes((s) => !s)}
          className="text-sm font-mono text-amber-300/95 hover:text-amber-200 transition-colors"
        >
          Design notes →
        </button>
        {showNotes && (
          <div className="mt-3 max-w-2xl text-base text-white/75 leading-relaxed space-y-2">
            <p>
              Each ~16 ms frame runs NSDF / McLeod-style autocorrelation pitch detection (RMS-gated)
              on the time-domain buffer. Stable pitches become note onsets; the time since the last
              onset is the <span className="text-amber-300/95">gap timer</span>. When it crosses{' '}
              ~320 ms and you have ≥3 notes of history, the partner generates a fill from a
              live-trained 1st-order Markov interval table, constrained to the key inferred from
              your pitch histogram.
            </p>
            <p>
              The instant a new onset is detected, the partner&apos;s master gain ramps to zero in
              ~50 ms and its scheduled phrase is cancelled — you always have right of way. That
              continuous duck-on-re-entry is what makes it feel like{' '}
              <span className="text-emerald-300/95">trading fours</span> rather than turn-taking.
              Full write-up in <code className="text-amber-300/95">README.md</code>.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
