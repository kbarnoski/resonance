"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";

// ── pitch detection ────────────────────────────────────────────────────────────

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
  midi: number;
  hue: number;
  startMs: number;
  endMs: number;
  who: "user" | "aria";
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

  // Dry path
  const dryGain = actx.createGain();
  dryGain.gain.value = 0.32;
  osc.connect(gain);
  gain.connect(dryGain);
  dryGain.connect(actx.destination);
  // Wet (reverb) path
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

// ── piano roll constants ────────────────────────────────────────────────────────

const MIDI_MIN = 36; // C2
const MIDI_MAX = 84; // C7
const MIDI_RANGE = MIDI_MAX - MIDI_MIN;

// ── demo phrase ─────────────────────────────────────────────────────────────────

const DEMO_PHRASE: Array<{ midi: number; durMs: number }> = [
  { midi: 60, durMs: 280 }, // C4
  { midi: 64, durMs: 280 }, // E4
  { midi: 67, durMs: 280 }, // G4
  { midi: 65, durMs: 280 }, // F4
  { midi: 69, durMs: 380 }, // A4
  { midi: 67, durMs: 280 }, // G4
  { midi: 65, durMs: 280 }, // F4
  { midi: 64, durMs: 580 }, // E4 (held)
  { midi: 62, durMs: 280 }, // D4
  { midi: 60, durMs: 680 }, // C4 (held, ends phrase)
];

// ── main component ──────────────────────────────────────────────────────────────

type Phase = "idle" | "listening" | "processing" | "responding";

export default function AriaCompanion() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animRef = useRef(0);

  // Audio refs
  const actxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const timeBufRef = useRef<Float32Array | null>(null);
  const convolverRef = useRef<ConvolverNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Phase & UI state
  const [phase, setPhase] = useState<Phase>("idle");
  const phaseRef = useRef<Phase>("idle");
  const [statusText, setStatusText] = useState("Ready");
  const [noteCount, setNoteCount] = useState(0);
  useEffect(() => { phaseRef.current = phase; }, [phase]);

  // Note / Markov state
  const userPhraseRef = useRef<NoteEvent[]>([]);
  const sessionNotesRef = useRef<NoteEvent[]>([]);
  const markovTableRef = useRef<Map<number, Map<number, number>>>(new Map());
  const rollBarsRef = useRef<RollBar[]>([]);

  // Pitch tracking refs (mic mode)
  const lastFreqRef = useRef(0);
  const noteStartMsRef = useRef(0);
  const silenceStartMsRef = useRef(0);
  const triggeredRef = useRef(false);

  // ── trigger aria response ──────────────────────────────────────────────────────

  const triggerResponse = useCallback(() => {
    const userNotes = userPhraseRef.current;
    if (userNotes.length === 0) return;

    // Merge session history with current phrase for richer transitions
    const newTable = buildTransitions([...sessionNotesRef.current, ...userNotes]);
    markovTableRef.current = newTable;
    sessionNotesRef.current.push(...userNotes);

    const responseLen = Math.max(8, Math.min(16, userNotes.length));
    const responseMidis = generateResponse(userNotes, newTable, responseLen);

    setPhase("responding");
    phaseRef.current = "responding";
    setStatusText("Aria is responding...");

    const actx = actxRef.current;
    const convolver = convolverRef.current;
    if (!actx || !convolver) return;

    const noteDur = 0.40;
    const noteGap = 0.07;
    const nowMs = performance.now();

    responseMidis.forEach((midi, i) => {
      const delay = i * (noteDur + noteGap);
      playAriaNote(actx, convolver, midi, delay, noteDur);

      const bar: RollBar = {
        midi,
        hue: 210,
        startMs: nowMs + delay * 1000,
        endMs: nowMs + (delay + noteDur) * 1000,
        who: "aria",
      };
      rollBarsRef.current.push(bar);
    });

    const totalMs = responseMidis.length * (noteDur + noteGap) * 1000;
    setTimeout(() => {
      userPhraseRef.current = [];
      triggeredRef.current = false;
      silenceStartMsRef.current = performance.now();
      setPhase("listening");
      phaseRef.current = "listening";
      setNoteCount(0);
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
    setPhase("listening");
    phaseRef.current = "listening";
    setStatusText("— demo phrase playing...");

    // Inject demo note events directly (no mic pitch detection)
    let offset = 350;
    DEMO_PHRASE.forEach(({ midi, durMs }) => {
      setTimeout(() => {
        const freq = 440 * Math.pow(2, (midi - 69) / 12);
        const now = performance.now();
        const note: NoteEvent = { midi, hue: freqToHue(freq), startMs: now, endMs: now + durMs };
        userPhraseRef.current.push(note);
        sessionNotesRef.current.push(note);
        rollBarsRef.current.push({ ...note, who: "user" });
        setNoteCount(userPhraseRef.current.length);
      }, offset);
      offset += durMs + 80;
    });

    // After phrase + 2s silence → trigger response
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
                rollBarsRef.current.push({ ...note, who: "user" });
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
      const WIN = 9000; // 9-second time window
      const pxPerMs = ROLL_W / WIN;

      // Pitch grid (C notes only)
      ctx.strokeStyle = "rgba(255,255,255,0.04)";
      ctx.lineWidth = 0.5;
      for (let m = MIDI_MIN; m <= MIDI_MAX; m++) {
        if (m % 12 !== 0) continue;
        const uy = uBot - ((m - MIDI_MIN) / MIDI_RANGE) * (uBot - uTop);
        const ay = aBot - ((m - MIDI_MIN) / MIDI_RANGE) * (aBot - aTop);
        ctx.beginPath(); ctx.moveTo(LEFT, uy); ctx.lineTo(RIGHT, uy); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(LEFT, ay); ctx.lineTo(RIGHT, ay); ctx.stroke();
      }

      // Note bars
      const bars = rollBarsRef.current;
      const cutoff = nowMs - 28000;
      while (bars.length > 0 && bars[0].endMs < cutoff) bars.shift();

      for (const bar of bars) {
        const isUser = bar.who === "user";
        const top = isUser ? uTop : aTop;
        const bot = isUser ? uBot : aBot;

        const y = bot - ((bar.midi - MIDI_MIN) / MIDI_RANGE) * (bot - top);
        const rowH = Math.max(4, (bot - top) / MIDI_RANGE);

        const sx = LEFT + (bar.startMs - (nowMs - WIN)) * pxPerMs;
        const ex = LEFT + (bar.endMs - (nowMs - WIN)) * pxPerMs;
        const bx = Math.max(LEFT, sx);
        const bw = Math.max(2, Math.min(ex, RIGHT) - bx);
        if (bx > RIGHT || ex < LEFT) continue;

        const ageSec = (nowMs - bar.endMs) / 1000;
        const alpha = Math.max(0.1, 1 - ageSec / 14);

        if (isUser) {
          ctx.shadowColor = `hsla(${bar.hue}, 80%, 65%, 0.55)`;
          ctx.shadowBlur = 9;
          ctx.fillStyle = `hsla(${bar.hue}, 78%, 65%, ${alpha})`;
        } else {
          const isPlaying = nowMs >= bar.startMs && nowMs <= bar.endMs;
          ctx.shadowColor = isPlaying ? "rgba(80,160,255,0.85)" : "rgba(80,160,255,0.4)";
          ctx.shadowBlur = isPlaying ? 18 : 7;
          ctx.fillStyle = `rgba(80,160,255,${alpha * (isPlaying ? 1.0 : 0.72)})`;
        }
        ctx.fillRect(bx, y - rowH / 2, bw, rowH);
        ctx.shadowBlur = 0;
      }

      // Pitch axis labels (C notes)
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

      // Panel labels
      ctx.textAlign = "left";
      ctx.font = "bold 11px monospace";
      ctx.fillStyle = "rgba(255,170,60,0.8)";
      ctx.fillText("YOU", LEFT + 6, uTop + 14);
      ctx.fillStyle = "rgba(80,160,255,0.8)";
      ctx.fillText("ARIA", LEFT + 6, aTop + 14);

      // Divider
      ctx.strokeStyle = "rgba(255,255,255,0.10)";
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, halfH); ctx.lineTo(W, halfH); ctx.stroke();

      // "Now" cursor
      ctx.strokeStyle = "rgba(255,255,255,0.07)";
      ctx.setLineDash([3, 5]);
      ctx.beginPath(); ctx.moveTo(RIGHT, uTop); ctx.lineTo(RIGHT, aBot); ctx.stroke();
      ctx.setLineDash([]);
    };

    animRef.current = requestAnimationFrame(render);
    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(animRef.current);
    };
  }, [triggerResponse]);

  // ── cleanup on unmount ────────────────────────────────────────────────────────

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
          <span style={{ fontSize: 17, fontWeight: "bold", letterSpacing: 2 }}>ARIA COMPANION</span>
          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.38)" }}>dialogue · cycle 36</span>
        </div>
        <div style={{ marginTop: 5, fontSize: 12, color: "rgba(255,255,255,0.5)" }}>
          {statusText}
          {phase === "listening" && noteCount > 0 && ` · ${noteCount} note${noteCount !== 1 ? "s" : ""} · need 8 to respond`}
        </div>
      </div>

      {/* Start overlay */}
      {phase === "idle" && (
        <div style={{ position: "fixed", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", zIndex: 20, gap: 16 }}>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.50)", textAlign: "center", maxWidth: 380, lineHeight: 1.75, margin: "0 0 8px" }}>
            Play any melody on piano, sing, or hum.<br />
            After 2 seconds of silence, Aria responds with<br />
            a phrase learned from your musical vocabulary.<br />
            Each exchange teaches Aria your style.
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

      {/* Processing indicator */}
      {phase === "processing" && (
        <div style={{ position: "fixed", bottom: 56, left: "50%", transform: "translateX(-50%)", zIndex: 10, fontSize: 12, color: "rgba(80,160,255,0.65)", letterSpacing: 2 }}>
          ▸ aria thinking...
        </div>
      )}

      {/* Footer */}
      <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 10, padding: "10px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", background: "linear-gradient(to top, rgba(5,5,8,0.88) 0%, transparent 100%)" }}>
        <span style={{ fontSize: 10, color: "rgba(255,255,255,0.20)" }}>
          top = you (warm) · bottom = aria (blue) · pitch C2–C7 · time →
        </span>
        <Link href="/dream" style={{ fontSize: 10, color: "rgba(255,255,255,0.22)", textDecoration: "none" }}>
          ← dream index
        </Link>
      </div>
    </div>
  );
}
