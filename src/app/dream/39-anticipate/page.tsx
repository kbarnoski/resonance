"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";

// ── pitch detection (NSDF autocorrelation) ─────────────────────────────────────

function detectPitch(buf: Float32Array, sampleRate: number): number {
  const n = buf.length;
  let rms = 0;
  for (let i = 0; i < n; i++) rms += buf[i] * buf[i];
  rms = Math.sqrt(rms / n);
  if (rms < 0.012) return 0;

  const ac = new Float32Array(n);
  for (let lag = 0; lag < n; lag++) {
    let s = 0;
    for (let i = 0; i < n - lag; i++) s += buf[i] * buf[i + lag];
    ac[lag] = s;
  }
  if (ac[0] === 0) return 0;

  const acn = new Float32Array(n);
  for (let i = 0; i < n; i++) acn[i] = ac[i] / ac[0];

  let minBin = 0;
  while (minBin < n - 1 && acn[minBin + 1] < acn[minBin]) minBin++;

  let maxVal = 0;
  let maxBin = minBin;
  for (let i = minBin; i < n; i++) {
    if (acn[i] > maxVal) { maxVal = acn[i]; maxBin = i; }
  }
  if (maxVal < 0.82) return 0;

  const y0 = acn[Math.max(0, maxBin - 1)];
  const y1 = acn[maxBin];
  const y2 = acn[Math.min(n - 1, maxBin + 1)];
  const denom = 2 * (2 * y1 - y0 - y2);
  const refined = denom !== 0 ? maxBin + (y0 - y2) / denom : maxBin;
  const freq = sampleRate / refined;
  if (freq < 24 || freq > 4500) return 0;
  return freq;
}

function freqToMidi(freq: number): number {
  return 69 + 12 * Math.log2(freq / 440);
}

function freqToHue(freq: number): number {
  if (freq <= 0) return 0;
  const semitones = 12 * Math.log2(freq / 440);
  return ((semitones * 5 + 3600) % 360);
}

function midiToNoteName(midi: number): string {
  const names = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];
  const note = names[((Math.round(midi) % 12) + 12) % 12];
  const octave = Math.floor(Math.round(midi) / 12) - 1;
  return `${note}${octave}`;
}

// ── types ──────────────────────────────────────────────────────────────────────

interface NoteEvent {
  midi: number;
  hue: number;
  startMs: number;
  endMs: number;
}

interface RollBar {
  id: number;
  midi: number;
  hue: number;
  startMs: number;
  endMs: number;
  who: "user" | "aria";
  ghost: boolean;       // true = planned but not yet sounding
  solidifyMs: number;   // 0 = not solidified; >0 = timestamp when ghost→solid
}

// ── markov chain ───────────────────────────────────────────────────────────────

function buildTransitions(notes: NoteEvent[]): Map<number, Map<number, number>> {
  const table = new Map<number, Map<number, number>>();
  for (let i = 0; i < notes.length - 1; i++) {
    const from = Math.round(notes[i].midi);
    const to = Math.round(notes[i + 1].midi);
    if (!table.has(from)) table.set(from, new Map());
    const inner = table.get(from)!;
    inner.set(to, (inner.get(to) || 0) + 1);
  }
  return table;
}

const PENTA_STEPS = [-7, -5, -3, 2, 3, 5, 7];

function generateResponse(
  lastNotes: NoteEvent[],
  table: Map<number, Map<number, number>>,
  length: number
): number[] {
  if (lastNotes.length === 0) return [];
  let current = Math.round(lastNotes[lastNotes.length - 1].midi);
  const result: number[] = [];

  for (let i = 0; i < length; i++) {
    const transitions = table.get(current);
    let next: number;

    if (transitions && transitions.size > 0 && Math.random() > 0.25) {
      const total = Array.from(transitions.values()).reduce((a, b) => a + b, 0);
      let r = Math.random() * total;
      next = current;
      for (const [midi, count] of transitions) {
        r -= count;
        if (r <= 0) { next = midi; break; }
      }
    } else {
      const step = PENTA_STEPS[Math.floor(Math.random() * PENTA_STEPS.length)];
      next = current + step;
    }

    next = Math.max(36, Math.min(84, next));
    result.push(next);
    current = next;
  }

  return result;
}

// ── audio synthesis ────────────────────────────────────────────────────────────

function playAriaNote(
  actx: AudioContext,
  convolver: ConvolverNode,
  midi: number,
  delayS: number,
  durationS: number
) {
  const freq = 440 * Math.pow(2, (midi - 69) / 12);
  const osc = actx.createOscillator();
  const gain = actx.createGain();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(freq, actx.currentTime + delayS);

  const t0 = actx.currentTime + delayS;
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(0.38, t0 + 0.009);
  gain.gain.exponentialRampToValueAtTime(0.13, t0 + 0.09);
  gain.gain.setValueAtTime(0.13, t0 + durationS - 0.06);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + durationS + 0.30);

  const dryGain = actx.createGain();
  dryGain.gain.value = 0.32;
  osc.connect(gain);
  gain.connect(dryGain);
  dryGain.connect(actx.destination);
  gain.connect(convolver);

  osc.start(t0);
  osc.stop(t0 + durationS + 0.65);
}

function buildRoomImpulse(actx: AudioContext): AudioBuffer {
  const sr = actx.sampleRate;
  const len = Math.floor(sr * 1.5);
  const buf = actx.createBuffer(2, len, sr);
  for (let c = 0; c < 2; c++) {
    const ch = buf.getChannelData(c);
    for (let i = 0; i < len; i++) {
      ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.0);
    }
  }
  return buf;
}

// ── constants ──────────────────────────────────────────────────────────────────

const MIDI_MIN = 36;
const MIDI_MAX = 84;
const MIDI_RANGE = MIDI_MAX - MIDI_MIN;

// Time window: 8s of history + 8s of future, "now" cursor sits at center
const WIN_PAST = 8000;
const WIN_FUTURE = 8000;
const WIN_TOTAL = WIN_PAST + WIN_FUTURE;

// Preview window before notes play
const ANTICIPATE_S = 0.8;

// Note timing
const NOTE_DUR = 0.40;
const NOTE_GAP = 0.07;
const STEP_MS = (NOTE_DUR + NOTE_GAP) * 1000;

// ── demo phrase ─────────────────────────────────────────────────────────────────

const DEMO_PHRASE: Array<{ midi: number; durMs: number }> = [
  { midi: 60, durMs: 280 },
  { midi: 64, durMs: 280 },
  { midi: 67, durMs: 280 },
  { midi: 65, durMs: 280 },
  { midi: 69, durMs: 380 },
  { midi: 67, durMs: 280 },
  { midi: 65, durMs: 280 },
  { midi: 64, durMs: 580 },
  { midi: 62, durMs: 280 },
  { midi: 60, durMs: 680 },
];

// ── main component ──────────────────────────────────────────────────────────────

type Phase = "idle" | "listening" | "processing" | "responding";

export default function AnticipateCompanion() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animRef = useRef(0);

  const actxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const timeBufRef = useRef<Float32Array | null>(null);
  const convolverRef = useRef<ConvolverNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [phase, setPhase] = useState<Phase>("idle");
  const phaseRef = useRef<Phase>("idle");
  const [statusText, setStatusText] = useState("Ready");
  const [noteCount, setNoteCount] = useState(0);
  const [ghostCount, setGhostCount] = useState(0);
  useEffect(() => { phaseRef.current = phase; }, [phase]);

  const barIdRef = useRef(0);
  const userPhraseRef = useRef<NoteEvent[]>([]);
  const sessionNotesRef = useRef<NoteEvent[]>([]);
  const rollBarsRef = useRef<RollBar[]>([]);

  const lastFreqRef = useRef(0);
  const noteStartMsRef = useRef(0);
  const silenceStartMsRef = useRef(0);
  const triggeredRef = useRef(false);

  // ── trigger aria response ──────────────────────────────────────────────────────

  const triggerResponse = useCallback(() => {
    const userNotes = userPhraseRef.current;
    if (userNotes.length === 0) return;

    const newTable = buildTransitions([...sessionNotesRef.current, ...userNotes]);
    sessionNotesRef.current.push(...userNotes);

    const responseLen = Math.max(8, Math.min(16, userNotes.length));
    const responseMidis = generateResponse(userNotes, newTable, responseLen);
    const nowMs = performance.now();

    // ── Step 1: Materialise ALL ghost bars immediately ─────────────────────────
    // All future notes appear as dashed outlines before a single note plays.
    // The 0.8s ANTICIPATE_S offset gives the user time to see the full plan.
    const ghostIds: number[] = [];
    responseMidis.forEach((midi, i) => {
      const id = ++barIdRef.current;
      const startMs = nowMs + ANTICIPATE_S * 1000 + i * STEP_MS;
      rollBarsRef.current.push({
        id, midi, hue: 210,
        startMs, endMs: startMs + NOTE_DUR * 1000,
        who: "aria", ghost: true, solidifyMs: 0,
      });
      ghostIds.push(id);
    });

    setGhostCount(responseMidis.length);
    setPhase("responding");
    phaseRef.current = "responding";
    setStatusText("Ghost notes planned — watch them solidify");

    const actx = actxRef.current;
    const convolver = convolverRef.current;
    if (!actx || !convolver) return;

    // ── Step 2: Schedule audio + solidification ────────────────────────────────
    // Each note plays at ANTICIPATE_S + i * step. The solidification timeout
    // fires at the same moment, flipping ghost→solid and recording solidifyMs.
    responseMidis.forEach((midi, i) => {
      const delay = ANTICIPATE_S + i * (NOTE_DUR + NOTE_GAP);
      playAriaNote(actx, convolver, midi, delay, NOTE_DUR);

      setTimeout(() => {
        const bar = rollBarsRef.current.find(b => b.id === ghostIds[i]);
        if (bar) { bar.ghost = false; bar.solidifyMs = performance.now(); }
        setGhostCount(prev => Math.max(0, prev - 1));
      }, delay * 1000);
    });

    const totalMs = ANTICIPATE_S * 1000 + responseMidis.length * STEP_MS;
    setTimeout(() => {
      userPhraseRef.current = [];
      triggeredRef.current = false;
      silenceStartMsRef.current = performance.now();
      setPhase("listening");
      phaseRef.current = "listening";
      setNoteCount(0);
      setGhostCount(0);
      setStatusText("— listening...");
    }, totalMs + 700);
  }, []);

  // ── start mic ──────────────────────────────────────────────────────────────────

  const startMic = useCallback(async () => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const Ctx: typeof AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      const actx = new Ctx();
      actxRef.current = actx;

      const convolver = actx.createConvolver();
      convolver.buffer = buildRoomImpulse(actx);
      const wetOut = actx.createGain();
      wetOut.gain.value = 0.20;
      convolver.connect(wetOut);
      wetOut.connect(actx.destination);
      convolverRef.current = convolver;

      const analyser = actx.createAnalyser();
      analyser.fftSize = 4096;
      analyser.smoothingTimeConstant = 0.0;
      analyserRef.current = analyser;
      timeBufRef.current = new Float32Array(new ArrayBuffer(analyser.fftSize * 4));

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      streamRef.current = stream;
      const src = actx.createMediaStreamSource(stream);
      const inputGain = actx.createGain();
      inputGain.gain.value = 2.0;
      src.connect(inputGain);
      inputGain.connect(analyser);

      userPhraseRef.current = [];
      rollBarsRef.current = [];
      lastFreqRef.current = 0;
      triggeredRef.current = false;
      silenceStartMsRef.current = performance.now();
      setNoteCount(0);
      setGhostCount(0);
      setPhase("listening");
      phaseRef.current = "listening";
      setStatusText("— listening...");
    } catch {
      setStatusText("Mic denied — use Demo mode");
    }
  }, []);

  // ── demo mode ──────────────────────────────────────────────────────────────────

  const startDemo = useCallback(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const Ctx: typeof AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    const actx = new Ctx();
    actxRef.current = actx;

    const convolver = actx.createConvolver();
    convolver.buffer = buildRoomImpulse(actx);
    const wetOut = actx.createGain();
    wetOut.gain.value = 0.20;
    convolver.connect(wetOut);
    wetOut.connect(actx.destination);
    convolverRef.current = convolver;

    userPhraseRef.current = [];
    rollBarsRef.current = [];
    triggeredRef.current = false;
    setNoteCount(0);
    setGhostCount(0);
    setPhase("listening");
    phaseRef.current = "listening";
    setStatusText("— demo phrase playing...");

    let offset = 350;
    DEMO_PHRASE.forEach(({ midi, durMs }) => {
      setTimeout(() => {
        const freq = 440 * Math.pow(2, (midi - 69) / 12);
        const now = performance.now();
        const note: NoteEvent = { midi, hue: freqToHue(freq), startMs: now, endMs: now + durMs };
        userPhraseRef.current.push(note);
        sessionNotesRef.current.push(note);
        const id = ++barIdRef.current;
        rollBarsRef.current.push({ id, ...note, who: "user", ghost: false, solidifyMs: 0 });
        setNoteCount(userPhraseRef.current.length);
      }, offset);
      offset += durMs + 80;
    });

    setTimeout(() => {
      if (!triggeredRef.current && phaseRef.current === "listening") {
        triggeredRef.current = true;
        setPhase("processing");
        phaseRef.current = "processing";
        setStatusText("Aria is thinking...");
        setTimeout(triggerResponse, 350);
      }
    }, offset + 2000);
  }, [triggerResponse]);

  // ── canvas render loop ─────────────────────────────────────────────────────────

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    let W = window.innerWidth;
    let H = window.innerHeight;

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = window.innerWidth;
      H = window.innerHeight;
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      canvas.style.width = `${W}px`;
      canvas.style.height = `${H}px`;
      const c = canvas.getContext("2d");
      if (c) c.scale(dpr, dpr);
    };
    resize();
    window.addEventListener("resize", resize);

    const ctx = canvas.getContext("2d")!;

    const render = () => {
      animRef.current = requestAnimationFrame(render);
      const ph = phaseRef.current;

      // ── mic pitch detection ───────────────────────────────────────────────────
      if (ph === "listening" && streamRef.current) {
        const analyser = analyserRef.current;
        const buf = timeBufRef.current;
        const actx = actxRef.current;
        if (analyser && buf && actx) {
          analyser.getFloatTimeDomainData(buf as unknown as Float32Array<ArrayBuffer>);
          const freq = detectPitch(buf, actx.sampleRate);
          const now = performance.now();

          if (freq > 0) {
            if (lastFreqRef.current === 0) noteStartMsRef.current = now;
            lastFreqRef.current = freq;
            silenceStartMsRef.current = now;
          } else {
            if (lastFreqRef.current > 0) {
              const midi = freqToMidi(lastFreqRef.current);
              const hue = freqToHue(lastFreqRef.current);
              const dur = now - noteStartMsRef.current;
              if (dur > 55) {
                const note: NoteEvent = { midi, hue, startMs: noteStartMsRef.current, endMs: now };
                userPhraseRef.current.push(note);
                sessionNotesRef.current.push(note);
                const id = ++barIdRef.current;
                rollBarsRef.current.push({ id, ...note, who: "user", ghost: false, solidifyMs: 0 });
                setNoteCount(userPhraseRef.current.length);
              }
              lastFreqRef.current = 0;
            }
            const silenceDur = now - silenceStartMsRef.current;
            if (silenceDur > 2000 && userPhraseRef.current.length >= 8 && !triggeredRef.current) {
              triggeredRef.current = true;
              setPhase("processing");
              phaseRef.current = "processing";
              setStatusText("Aria is thinking...");
              setTimeout(triggerResponse, 350);
            }
          }
        }
      }

      // ── draw ─────────────────────────────────────────────────────────────────
      ctx.fillStyle = "#050508";
      ctx.fillRect(0, 0, W, H);

      const LEFT = 48;
      const RIGHT = W - 14;
      const ROLL_W = RIGHT - LEFT;
      const halfH = H / 2;
      const PAD = 22;
      const uTop = PAD;
      const uBot = halfH - PAD;
      const aTop = halfH + PAD;
      const aBot = H - PAD;

      const nowMs = performance.now();
      const pxPerMs = ROLL_W / WIN_TOTAL;
      // "now" cursor position: WIN_PAST ms from the left edge of the roll
      const CURSOR_X = LEFT + WIN_PAST * pxPerMs;

      // ── pitch grid (C octave lines) ──────────────────────────────────────────
      ctx.strokeStyle = "rgba(255,255,255,0.04)";
      ctx.lineWidth = 0.5;
      for (let m = MIDI_MIN; m <= MIDI_MAX; m++) {
        if (m % 12 !== 0) continue;
        const uy = uBot - ((m - MIDI_MIN) / MIDI_RANGE) * (uBot - uTop);
        const ay = aBot - ((m - MIDI_MIN) / MIDI_RANGE) * (aBot - aTop);
        ctx.beginPath(); ctx.moveTo(LEFT, uy); ctx.lineTo(RIGHT, uy); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(LEFT, ay); ctx.lineTo(RIGHT, ay); ctx.stroke();
      }

      // ── future zone shading in ARIA panel when ghosts active ─────────────────
      const hasGhosts = rollBarsRef.current.some(b => b.ghost && b.who === "aria");
      if (hasGhosts) {
        // Subtle blue tint from cursor rightward in the ARIA panel
        ctx.fillStyle = "rgba(80,160,255,0.025)";
        ctx.fillRect(CURSOR_X, aTop, RIGHT - CURSOR_X, aBot - aTop);
      }

      // ── note bars ────────────────────────────────────────────────────────────
      const bars = rollBarsRef.current;
      // Only trim non-ghost bars that have aged past the left edge
      const cutoff = nowMs - WIN_PAST - 2000;
      let trimIdx = 0;
      while (
        trimIdx < bars.length &&
        bars[trimIdx].endMs < cutoff &&
        !bars[trimIdx].ghost
      ) trimIdx++;
      if (trimIdx > 0) bars.splice(0, trimIdx);

      for (const bar of bars) {
        const isUser = bar.who === "user";
        const top = isUser ? uTop : aTop;
        const bot = isUser ? uBot : aBot;

        const y = bot - ((bar.midi - MIDI_MIN) / MIDI_RANGE) * (bot - top);
        const rowH = Math.max(4, (bot - top) / MIDI_RANGE);

        // Position relative to (nowMs - WIN_PAST) = left edge of canvas
        const sx = LEFT + (bar.startMs - (nowMs - WIN_PAST)) * pxPerMs;
        const ex = LEFT + (bar.endMs - (nowMs - WIN_PAST)) * pxPerMs;
        const bx = Math.max(LEFT, sx);
        const bw = Math.max(2, Math.min(ex, RIGHT) - bx);
        if (bx > RIGHT || ex < LEFT) continue;

        const ageSec = (nowMs - bar.endMs) / 1000;
        const alpha = Math.max(0.1, 1 - ageSec / 14);

        if (isUser) {
          ctx.shadowColor = `hsla(${bar.hue}, 80%, 65%, 0.55)`;
          ctx.shadowBlur = 9;
          ctx.fillStyle = `hsla(${bar.hue}, 78%, 65%, ${alpha})`;
          ctx.fillRect(bx, y - rowH / 2, bw, rowH);
          ctx.shadowBlur = 0;
        } else if (bar.ghost) {
          // Ghost: dashed outline + very faint fill
          ctx.shadowBlur = 0;
          ctx.strokeStyle = "rgba(80,160,255,0.40)";
          ctx.lineWidth = 1;
          ctx.setLineDash([3, 3]);
          ctx.strokeRect(bx + 0.5, y - rowH / 2 + 0.5, Math.max(1, bw - 1), Math.max(1, rowH - 1));
          ctx.setLineDash([]);
          ctx.fillStyle = "rgba(80,160,255,0.10)";
          ctx.fillRect(bx, y - rowH / 2, bw, rowH);
        } else {
          // Solid aria note — flash if recently solidified
          const timeSinceSolidify = bar.solidifyMs > 0 ? (nowMs - bar.solidifyMs) : 9999999;
          const isFresh = timeSinceSolidify < 280;
          const isPlaying = nowMs >= bar.startMs && nowMs <= bar.endMs;

          let glowA: number;
          let blur: number;
          if (isFresh) {
            const t = timeSinceSolidify / 280;
            glowA = 1.0 - t * 0.45;   // flash: 1.0 → 0.55 over 280ms
            blur = 28 - t * 14;        // 28 → 14
          } else {
            glowA = isPlaying ? 0.85 : 0.4;
            blur = isPlaying ? 18 : 7;
          }

          ctx.shadowColor = `rgba(80,160,255,${glowA})`;
          ctx.shadowBlur = blur;
          ctx.fillStyle = `rgba(80,160,255,${alpha * (isFresh ? 1.0 : (isPlaying ? 1.0 : 0.72))})`;
          ctx.fillRect(bx, y - rowH / 2, bw, rowH);
          ctx.shadowBlur = 0;
        }
      }

      // ── pitch axis labels ─────────────────────────────────────────────────────
      ctx.font = "10px monospace";
      ctx.fillStyle = "rgba(255,255,255,0.32)";
      ctx.textAlign = "right";
      for (let m = MIDI_MIN; m <= MIDI_MAX; m += 12) {
        const name = midiToNoteName(m);
        const uy = uBot - ((m - MIDI_MIN) / MIDI_RANGE) * (uBot - uTop);
        const ay = aBot - ((m - MIDI_MIN) / MIDI_RANGE) * (aBot - aTop);
        ctx.fillText(name, LEFT - 4, uy + 4);
        ctx.fillText(name, LEFT - 4, ay + 4);
      }

      // ── panel labels ──────────────────────────────────────────────────────────
      ctx.textAlign = "left";
      ctx.font = "bold 11px monospace";
      ctx.fillStyle = "rgba(255,170,60,0.8)";
      ctx.fillText("YOU", LEFT + 6, uTop + 14);
      ctx.fillStyle = "rgba(80,160,255,0.8)";
      ctx.fillText("ARIA", LEFT + 6, aTop + 14);
      if (hasGhosts) {
        ctx.fillStyle = "rgba(80,160,255,0.5)";
        ctx.font = "10px monospace";
        ctx.fillText("▸ planned", LEFT + 38, aTop + 14);
      }

      // ── divider ───────────────────────────────────────────────────────────────
      ctx.strokeStyle = "rgba(255,255,255,0.10)";
      ctx.lineWidth = 1;
      ctx.setLineDash([]);
      ctx.beginPath(); ctx.moveTo(0, halfH); ctx.lineTo(W, halfH); ctx.stroke();

      // ── "now" cursor (vertical line at center of time window) ─────────────────
      ctx.strokeStyle = "rgba(255,255,255,0.14)";
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 5]);
      ctx.beginPath(); ctx.moveTo(CURSOR_X, uTop); ctx.lineTo(CURSOR_X, aBot); ctx.stroke();
      ctx.setLineDash([]);

      // ── past / future axis labels ─────────────────────────────────────────────
      ctx.font = "9px monospace";
      ctx.textAlign = "center";
      ctx.fillStyle = "rgba(255,255,255,0.12)";
      ctx.fillText("← past", LEFT + WIN_PAST * pxPerMs * 0.35, aBot + 12);
      ctx.fillStyle = hasGhosts ? "rgba(80,160,255,0.22)" : "rgba(255,255,255,0.08)";
      ctx.fillText("future →", LEFT + WIN_PAST * pxPerMs + WIN_FUTURE * pxPerMs * 0.55, aBot + 12);
    };

    animRef.current = requestAnimationFrame(render);
    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(animRef.current);
    };
  }, [triggerResponse]);

  // ── cleanup ────────────────────────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      cancelAnimationFrame(animRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      void actxRef.current?.close();
    };
  }, []);

  // ── render ────────────────────────────────────────────────────────────────────

  return (
    <div style={{ background: "#050508", minHeight: "100vh", color: "#fff", fontFamily: "monospace", overflow: "hidden", position: "relative" }}>
      <canvas ref={canvasRef} style={{ position: "fixed", inset: 0, width: "100%", height: "100%" }} />

      {/* Header */}
      <div style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 10, padding: "14px 20px", background: "linear-gradient(to bottom, rgba(5,5,8,0.92) 0%, transparent 100%)" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
          <span style={{ fontSize: 17, fontWeight: "bold", letterSpacing: 2 }}>ARIA ANTICIPATE</span>
          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.38)" }}>dialogue · anticipation · cycle 43</span>
        </div>
        <div style={{ marginTop: 5, fontSize: 12, color: "rgba(255,255,255,0.5)" }}>
          {statusText}
          {phase === "listening" && noteCount > 0 && ` · ${noteCount} note${noteCount !== 1 ? "s" : ""} · need 8 to respond`}
          {phase === "responding" && ghostCount > 0 && ` · ${ghostCount} ghost note${ghostCount !== 1 ? "s" : ""} pending`}
        </div>
      </div>

      {/* Start overlay */}
      {phase === "idle" && (
        <div style={{ position: "fixed", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", zIndex: 20, gap: 16 }}>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.50)", textAlign: "center", maxWidth: 440, lineHeight: 1.85, margin: "0 0 8px" }}>
            Play a melody on piano, sing, or hum.<br />
            After 2 seconds of silence, Aria&apos;s entire planned response<br />
            appears as ghost notes <em style={{ color: "rgba(80,160,255,0.7)" }}>before a single sound plays</em>.<br />
            Watch each note solidify as it sounds — left to right.
          </p>
          <p style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", textAlign: "center", maxWidth: 360, lineHeight: 1.7, margin: "0 0 4px" }}>
            From ReaLJam (CHI 2025): seeing the AI&apos;s intention before execution<br />
            dramatically improves perceived collaboration quality.
          </p>
          <div style={{ display: "flex", gap: 12 }}>
            <button
              onClick={() => void startMic()}
              style={{ padding: "11px 26px", background: "rgba(255,170,60,0.10)", border: "1px solid rgba(255,170,60,0.42)", borderRadius: 4, color: "#ffaa3c", fontSize: 13, letterSpacing: 1, cursor: "pointer" }}
            >
              START MIC
            </button>
            <button
              onClick={startDemo}
              style={{ padding: "11px 26px", background: "rgba(80,160,255,0.07)", border: "1px solid rgba(80,160,255,0.32)", borderRadius: 4, color: "#50a0ff", fontSize: 13, letterSpacing: 1, cursor: "pointer" }}
            >
              DEMO
            </button>
          </div>
        </div>
      )}

      {/* Ghost pulse indicator */}
      {phase === "responding" && ghostCount > 0 && (
        <div style={{ position: "fixed", bottom: 56, left: "50%", transform: "translateX(-50%)", zIndex: 10, fontSize: 12, color: "rgba(80,160,255,0.65)", letterSpacing: 2 }}>
          ◌ {ghostCount} note{ghostCount !== 1 ? "s" : ""} planned · solidifying
        </div>
      )}

      {/* Footer */}
      <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 10, padding: "10px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", background: "linear-gradient(to top, rgba(5,5,8,0.88) 0%, transparent 100%)" }}>
        <span style={{ fontSize: 10, color: "rgba(255,255,255,0.20)" }}>
          top = you (warm) · bottom = aria (dashed = ghost, solid = played) · center line = now
        </span>
        <Link href="/dream" style={{ fontSize: 10, color: "rgba(255,255,255,0.22)", textDecoration: "none" }}>
          ← dream index
        </Link>
      </div>
    </div>
  );
}
