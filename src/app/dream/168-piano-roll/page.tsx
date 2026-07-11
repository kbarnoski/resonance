"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

// ── AMDF pitch detection (same algorithm as 167-aria-companion) ──────────────
function calcPitch(buf: Float32Array, sr: number): number {
  const half = buf.length >> 1;
  let rms = 0;
  for (let i = 0; i < buf.length; i++) rms += buf[i] * buf[i];
  if (rms / buf.length < 0.00014) return -1;
  const lo = Math.ceil(sr / 1050);
  const hi = Math.min(half, Math.floor(sr / 58));
  let best = -1, bestC = 0, lastC = 1, found = false;
  for (let o = lo; o < hi; o++) {
    let c = 0;
    for (let i = 0; i < half; i++) c += Math.abs(buf[i] - buf[i + o]);
    c = 1 - c / half;
    if (c > 0.9 && c > lastC) {
      found = true;
      if (c > bestC) { bestC = c; best = o; }
    } else if (found) break;
    lastC = c;
  }
  return best > 0 && bestC > 0.965 ? sr / best : -1;
}

function toMidi(freq: number): number { return Math.round(12 * Math.log2(freq / 440) + 69); }
function toFreq(midi: number): number { return 440 * 2 ** ((midi - 69) / 12); }

// ── constants ────────────────────────────────────────────────────────────────
const MIDI_LO = 36; // C2
const MIDI_HI = 84; // C6
const MIDI_SPAN = MIDI_HI - MIDI_LO; // 48
const NOTE_NAMES = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];
const BLACK_CLASSES = new Set([1, 3, 6, 8, 10]);

// ── pitch → RGB: violet(C2) → cyan → green → amber → red(C6) ─────────────────
function rgbAt(midi: number): [number, number, number] {
  const t = Math.max(0, Math.min(1, (midi - MIDI_LO) / MIDI_SPAN));
  const hDeg = 260 - t * 260; // 260° (violet) → 0° (red)
  const h = hDeg / 360;
  const s = 0.78, l = 0.63;
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const ch = (p2: number, q2: number, t2: number): number => {
    const n = ((t2 % 1) + 1) % 1;
    if (n < 1 / 6) return p2 + (q2 - p2) * 6 * n;
    if (n < 1 / 2) return q2;
    if (n < 2 / 3) return p2 + (q2 - p2) * (2 / 3 - n) * 6;
    return p2;
  };
  return [
    Math.round(ch(p, q, h + 1 / 3) * 255),
    Math.round(ch(p, q, h) * 255),
    Math.round(ch(p, q, h - 1 / 3) * 255),
  ];
}

// ── triangle-wave piano synthesis ────────────────────────────────────────────
function synthNote(actx: AudioContext, midi: number, t0: number, dur: number) {
  const f = toFreq(midi);
  const gain = actx.createGain();
  gain.connect(actx.destination);
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(0.18, t0 + 0.016);
  gain.gain.setTargetAtTime(0.07, t0 + 0.016, 0.09);
  gain.gain.setTargetAtTime(0.001, t0 + dur, 0.24);
  const end = t0 + dur + 1.2;
  [1, 2].forEach((harmonic, idx) => {
    const osc = actx.createOscillator();
    osc.type = "triangle";
    osc.frequency.value = f * harmonic;
    const hg = actx.createGain();
    hg.gain.value = idx === 0 ? 1 : 0.22;
    osc.connect(hg);
    hg.connect(gain);
    osc.start(t0);
    osc.stop(end);
  });
}

// ── demo melody: C major ascending/descending passage ────────────────────────
const DEMO: [number, number][] = [
  [60, 0.22], [62, 0.22], [64, 0.22], [65, 0.22],
  [67, 0.33], [65, 0.22], [64, 0.22], [62, 0.22],
  [60, 0.44],
  [55, 0.22], [57, 0.22], [59, 0.22], [60, 0.22],
  [62, 0.22], [64, 0.22], [65, 0.22],
  [67, 0.33], [64, 0.22], [60, 0.22], [64, 0.22],
  [67, 0.44], [69, 0.22], [67, 0.22],
  [65, 0.22], [64, 0.44], [60, 0.66],
];

// ── types ────────────────────────────────────────────────────────────────────
type NoteBar = { midi: number; startMs: number; endMs: number };
type Phase = "idle" | "running" | "demo";

// ── component ────────────────────────────────────────────────────────────────
export default function PianoRoll() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [bpm, setBpm] = useState(72);
  const [micError, setMicError] = useState<string | null>(null);

  const phaseRef = useRef<Phase>("idle");
  const bpmRef = useRef(72);
  const actxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const timeBufRef = useRef<Float32Array | null>(null);
  const curMidiRef = useRef(-1);
  const curStartRef = useRef(0);
  const lastSoundRef = useRef(0);
  const rollRef = useRef<NoteBar[]>([]);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef(0);
  const noteDisplayRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => { bpmRef.current = bpm; }, [bpm]);

  const stop = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach(t => t.stop());
    void actxRef.current?.close();
    actxRef.current = null;
    streamRef.current = null;
    analyserRef.current = null;
    timeBufRef.current = null;
    rollRef.current = [];
    curMidiRef.current = -1;
    lastSoundRef.current = 0;
    phaseRef.current = "idle";
    setPhase("idle");
  }, []);

  const startMic = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      streamRef.current = stream;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const Ctx: typeof AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      const actx = new Ctx();
      actxRef.current = actx;
      const src = actx.createMediaStreamSource(stream);
      const analyser = actx.createAnalyser();
      analyser.fftSize = 4096;
      analyser.smoothingTimeConstant = 0;
      analyserRef.current = analyser;
      timeBufRef.current = new Float32Array(4096);
      src.connect(analyser);
      phaseRef.current = "running";
      setPhase("running");
      setMicError(null);
    } catch (e) {
      setMicError(e instanceof Error ? e.message : "Microphone unavailable.");
    }
  }, []);

  const startDemo = useCallback(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const Ctx: typeof AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    const actx = new Ctx();
    actxRef.current = actx;
    const GAP = 0.04;
    let t = actx.currentTime + 0.08;
    let msT = performance.now() + 80;
    for (const [midi, dur] of DEMO) {
      synthNote(actx, midi, t, dur);
      rollRef.current.push({ midi, startMs: msT, endMs: msT + dur * 1000 });
      t += dur + GAP;
      msT += (dur + GAP) * 1000;
    }
    phaseRef.current = "demo";
    setPhase("demo");
  }, []);

  // ── render + pitch detection loop ─────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let dpr = 1, w = 0, h = 0;
    const resize = () => {
      dpr = Math.min(window.devicePixelRatio ?? 1, 2);
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.scale(dpr, dpr);
    };
    resize();
    window.addEventListener("resize", resize);

    const draw = () => {
      // ── pitch detection ──────────────────────────────────────────────────
      if (phaseRef.current === "running") {
        const analyser = analyserRef.current;
        const buf = timeBufRef.current;
        const sr = actxRef.current?.sampleRate ?? 44100;
        if (analyser && buf) {
          analyser.getFloatTimeDomainData(buf as unknown as Float32Array<ArrayBuffer>);
          const freq = calcPitch(buf, sr);
          const midi = freq > 0 ? toMidi(freq) : -1;
          const nowMs = performance.now();

          if (midi >= MIDI_LO && midi <= MIDI_HI) {
            lastSoundRef.current = nowMs;
            if (curMidiRef.current !== midi) {
              if (curMidiRef.current >= 0) {
                const d = (nowMs - curStartRef.current) / 1000;
                if (d > 0.05) {
                  rollRef.current.push({
                    midi: curMidiRef.current,
                    startMs: curStartRef.current,
                    endMs: nowMs,
                  });
                }
              }
              curMidiRef.current = midi;
              curStartRef.current = nowMs;
            }
          } else if (curMidiRef.current >= 0 && nowMs - lastSoundRef.current > 80) {
            const d = (lastSoundRef.current - curStartRef.current) / 1000;
            if (d > 0.05) {
              rollRef.current.push({
                midi: curMidiRef.current,
                startMs: curStartRef.current,
                endMs: lastSoundRef.current,
              });
            }
            curMidiRef.current = -1;
          }
        }
      }

      // ── note name display (DOM update, avoids React re-render) ───────────
      if (noteDisplayRef.current) {
        if (phaseRef.current === "running" && curMidiRef.current >= 0) {
          const m = curMidiRef.current;
          noteDisplayRef.current.textContent =
            NOTE_NAMES[m % 12] + String(Math.floor(m / 12) - 1);
        } else {
          noteDisplayRef.current.textContent = "";
        }
      }

      const nowMs = performance.now();
      const pxPerSec = (bpmRef.current / 60) * 80;
      const LBL = 44;
      const CURSOR = w - 22;

      // ── background ───────────────────────────────────────────────────────
      ctx.fillStyle = "#06070a";
      ctx.fillRect(0, 0, w, h);

      const rowH = h / (MIDI_SPAN + 1);

      // black key row shading
      for (let m = MIDI_LO; m <= MIDI_HI; m++) {
        if (BLACK_CLASSES.has(m % 12)) {
          const y = (MIDI_HI - m) * rowH;
          ctx.fillStyle = "rgba(0,0,0,0.22)";
          ctx.fillRect(LBL, y, w - LBL, rowH);
        }
      }

      // octave (C note) lines + labels
      for (let oct = 2; oct <= 6; oct++) {
        const m = oct * 12 + 12; // C2=36, C3=48, C4=60, C5=72, C6=84
        const y = (MIDI_HI - m) * rowH;
        ctx.strokeStyle = "rgba(255,255,255,0.09)";
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(LBL, y); ctx.lineTo(w, y); ctx.stroke();
        const [r, g, b] = rgbAt(m);
        ctx.fillStyle = `rgba(${r},${g},${b},0.6)`;
        ctx.font = "bold 10px monospace";
        ctx.textBaseline = "middle";
        ctx.textAlign = "right";
        ctx.fillText(`C${oct}`, LBL - 5, y + rowH * 0.5);
      }

      // subtle semitone dividers
      ctx.strokeStyle = "rgba(255,255,255,0.022)";
      ctx.lineWidth = 0.5;
      for (let m = MIDI_LO + 1; m < MIDI_HI; m++) {
        if (m % 12 === 0) continue;
        const y = (MIDI_HI - m) * rowH;
        ctx.beginPath(); ctx.moveTo(LBL, y); ctx.lineTo(w, y); ctx.stroke();
      }

      // label strip background
      ctx.fillStyle = "rgba(0,0,0,0.45)";
      ctx.fillRect(0, 0, LBL, h);

      // trim stale notes (keep ~55s of history)
      while (rollRef.current.length && nowMs - rollRef.current[0].endMs > 55000) {
        rollRef.current.shift();
      }

      // ── note bars ────────────────────────────────────────────────────────
      ctx.save();
      ctx.beginPath();
      ctx.rect(LBL, 0, w - LBL, h);
      ctx.clip();

      for (const note of rollRef.current) {
        const x1 = CURSOR - (nowMs - note.endMs) / 1000 * pxPerSec;
        if (x1 < LBL) continue;
        const x0 = CURSOR - (nowMs - note.startMs) / 1000 * pxPerSec;
        if (x0 > w) continue;
        const nw = Math.max(3, x1 - x0);
        const noteRow = rowH * 0.82;
        const ny = (MIDI_HI - note.midi) * rowH + rowH * 0.09;
        const [r, g, b] = rgbAt(note.midi);
        ctx.shadowColor = `rgba(${r},${g},${b},0.5)`;
        ctx.shadowBlur = 5;
        ctx.fillStyle = `rgba(${r},${g},${b},0.88)`;
        ctx.beginPath();
        ctx.roundRect(x0, ny, nw, noteRow, 2);
        ctx.fill();
      }

      // live tail: current note extends to cursor
      if (phaseRef.current === "running" && curMidiRef.current >= 0) {
        const midi = curMidiRef.current;
        const x0 = CURSOR - (nowMs - curStartRef.current) / 1000 * pxPerSec;
        const noteRow = rowH * 0.82;
        const ny = (MIDI_HI - midi) * rowH + rowH * 0.09;
        const [r, g, b] = rgbAt(midi);
        ctx.shadowColor = `rgba(${r},${g},${b},0.7)`;
        ctx.shadowBlur = 12;
        ctx.fillStyle = `rgba(${r},${g},${b},0.95)`;
        ctx.beginPath();
        ctx.roundRect(Math.max(x0, LBL), ny, CURSOR - Math.max(x0, LBL), noteRow + 1, 2);
        ctx.fill();
      }

      ctx.restore();
      ctx.shadowBlur = 0;

      // cursor line
      ctx.strokeStyle = "rgba(255,255,255,0.1)";
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(CURSOR, 0); ctx.lineTo(CURSOR, h); ctx.stroke();

      rafRef.current = requestAnimationFrame(draw);
    };
    rafRef.current = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
    };
  }, []); // refs only — intentionally empty deps

  useEffect(() => () => stop(), [stop]);

  return (
    <div className="relative w-full" style={{ height: "calc(100vh - 3rem)" }}>
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />

      {phase === "idle" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6">
          <h1 className="text-3xl font-light mb-3 tracking-tight">Piano Roll</h1>
          <p className="text-base text-muted-foreground max-w-md mb-2 leading-relaxed">
            Play piano into your mic. Each note appears as a glowing bar scrolling left —
            pitch sets the row, color shifts from violet (low) to red (high).
          </p>
          <p className="text-sm text-muted-foreground max-w-md mb-8">
            A real-time visual record of everything you play.
          </p>
          <div className="flex gap-3 mb-4">
            <button
              onClick={startMic}
              className="px-6 py-3 text-sm tracking-wider uppercase border border-border rounded hover:bg-accent hover:border-border transition min-h-[44px]"
            >
              Start mic
            </button>
            <button
              onClick={startDemo}
              className="px-5 py-3 text-sm tracking-wider uppercase border border-border text-muted-foreground rounded hover:bg-accent hover:text-foreground transition min-h-[44px]"
            >
              Demo
            </button>
          </div>
          {micError && (
            <p className="mt-2 text-sm text-violet-300 max-w-sm">{micError}</p>
          )}
          <Link href="/dream" className="mt-10 text-xs text-muted-foreground/70 hover:text-muted-foreground">
            ← back to dream sandbox
          </Link>
        </div>
      )}

      {phase !== "idle" && (
        <>
          <div
            className="absolute top-0 left-0 right-0 h-10 flex items-center justify-between px-4 pointer-events-none"
            style={{ background: "linear-gradient(to bottom, rgba(6,7,10,0.88), transparent)" }}
          >
            <span className="text-sm font-light text-foreground tracking-wide">Piano Roll</span>
            <div className="flex items-center gap-4 pointer-events-auto">
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="w-16 text-right">{bpm} BPM</span>
                <input
                  type="range" min={30} max={200} value={bpm}
                  onChange={e => setBpm(Number(e.target.value))}
                  className="w-20 accent-violet-400"
                />
              </label>
              {phase === "running" && (
                <span className="text-xs text-violet-300/80 tracking-wider">
                  ● <span ref={noteDisplayRef} className="font-mono" />
                </span>
              )}
              {phase === "demo" && (
                <span className="text-xs text-violet-300/80 tracking-wider">▶ demo</span>
              )}
            </div>
          </div>
          <div
            className="absolute bottom-0 left-0 right-0 flex items-center justify-between px-4"
            style={{ height: 36, background: "linear-gradient(to top, rgba(6,7,10,0.88), transparent)" }}
          >
            <Link href="/dream" className="text-xs text-muted-foreground/70 hover:text-muted-foreground">
              ← back
            </Link>
            <button
              onClick={stop}
              className="text-xs tracking-wider uppercase text-muted-foreground hover:text-foreground border border-border hover:border-border px-3 py-1.5 rounded min-h-[36px]"
            >
              stop
            </button>
          </div>
        </>
      )}
    </div>
  );
}
