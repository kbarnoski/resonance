"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";

// ── pitch helpers (same algorithm as 13-piano-canvas) ────────────────────────

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
  const names = ["C","C♯","D","D♯","E","F","F♯","G","G♯","A","A♯","B"];
  const note = names[((Math.round(midi) % 12) + 12) % 12];
  const octave = Math.floor(Math.round(midi) / 12) - 1;
  return `${note}${octave}`;
}

// ── piano roll constants ──────────────────────────────────────────────────────

// Display range: C2 (midi 36) to C7 (midi 84) — covers piano's useful range
const MIDI_MIN = 36;  // C2
const MIDI_MAX = 84;  // C7
const MIDI_RANGE = MIDI_MAX - MIDI_MIN;

// ── Bach BWV 772 demo (simplified, same fragment as 22-code-score) ────────────

interface DemoNote { freq: number; duration: number; }

function buildBachFragment(bpm: number): DemoNote[] {
  const beat = 60 / bpm;
  const E = beat * 0.5;  // eighth
  const Q = beat;        // quarter
  const H = beat * 2;    // half

  const note = (name: string, oct: number, dur: number): DemoNote => {
    const semis: Record<string, number> = {
      C:0, "C#":1, D:2, "D#":3, E:4, F:5, "F#":6, G:7, "G#":8, A:9, "A#":10, B:11
    };
    const midi = (oct + 1) * 12 + semis[name];
    return { freq: 440 * Math.pow(2, (midi - 69) / 12), duration: dur };
  };

  // Opening measures of BWV 772 (C major invention)
  return [
    note("C",4,E), note("D",4,E), note("E",4,E), note("F",4,E),
    note("G",4,E), note("A",4,E), note("B",4,E), note("C",5,E),
    note("D",5,E), note("B",4,E), note("C",5,E), note("D",5,E),
    note("G",4,E), note("D",5,E), note("C",5,E), note("B",4,E),
    note("A",4,E), note("G",4,E), note("A",4,E), note("B",4,E),
    note("C",5,E), note("B",4,E), note("A",4,E), note("G",4,E),
    note("F",4,E), note("G",4,E), note("A",4,E), note("G",4,E),
    note("F",4,E), note("E",4,E), note("D",4,E), note("C",4,E),
    note("E",4,Q), note("G",4,Q), note("C",4,H),
  ];
}

// ── note bar type ─────────────────────────────────────────────────────────────

interface NoteBar {
  midi: number;
  hue: number;
  startX: number;  // canvas x when note started (relative to scroll)
  width: number;   // grows while active
  active: boolean;
}

// ── main component ────────────────────────────────────────────────────────────

export default function PianoRoll() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animRef = useRef(0);

  // Audio
  const actxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const timeBufRef = useRef<Float32Array | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Piano roll state (all mutable, no react state in hot path)
  const notesRef = useRef<NoteBar[]>([]);
  const activeNoteRef = useRef<NoteBar | null>(null);
  const silenceFramesRef = useRef(0);
  const scrollXRef = useRef(0);    // pixels scrolled so far (increases at scroll speed)
  const lastFrameTimeRef = useRef(0);

  // Demo sequencer
  const demoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const demoIdxRef = useRef(0);
  const demoNotesRef = useRef<DemoNote[]>([]);
  const demoFreqRef = useRef(0);
  const demoFreqEndRef = useRef(0);

  const [mode, setMode] = useState<"idle" | "mic" | "demo">("idle");
  const [error, setError] = useState<string | null>(null);
  const [bpm, setBpm] = useState(72);
  const [currentNote, setCurrentNote] = useState("—");
  const bpmRef = useRef(72);

  useEffect(() => { bpmRef.current = bpm; }, [bpm]);

  // ── canvas sizing ─────────────────────────────────────────────────────────

  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(window.innerWidth * dpr);
    canvas.height = Math.round(window.innerHeight * dpr);
    canvas.style.width = `${window.innerWidth}px`;
    canvas.style.height = `${window.innerHeight}px`;
  }, []);

  useEffect(() => {
    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);
    return () => window.removeEventListener("resize", resizeCanvas);
  }, [resizeCanvas]);

  // ── demo sequencer ────────────────────────────────────────────────────────

  const scheduleDemoNote = useCallback((actx: AudioContext, analyser: AnalyserNode) => {
    const notes = demoNotesRef.current;
    const idx = demoIdxRef.current % notes.length;
    const { freq, duration } = notes[idx];
    demoIdxRef.current++;

    // Play silently into analyser (not destination)
    const osc = actx.createOscillator();
    const g = actx.createGain();
    osc.type = "triangle";
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0, actx.currentTime);
    g.gain.linearRampToValueAtTime(0.15, actx.currentTime + 0.02);
    g.gain.setValueAtTime(0.15, actx.currentTime + duration * 0.75);
    g.gain.linearRampToValueAtTime(0, actx.currentTime + duration);
    osc.connect(g);
    g.connect(analyser);
    osc.start(actx.currentTime);
    osc.stop(actx.currentTime + duration + 0.05);

    // Store freq so render loop can use it directly (avoids autocorrelation lag)
    demoFreqRef.current = freq;
    demoFreqEndRef.current = actx.currentTime + duration;

    demoTimerRef.current = setTimeout(
      () => scheduleDemoNote(actx, analyser),
      duration * 1000 + 40
    );
  }, []);

  // ── start mic ─────────────────────────────────────────────────────────────

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
      const analyser = actx.createAnalyser();
      analyser.fftSize = 4096;
      analyser.smoothingTimeConstant = 0.0;
      analyserRef.current = analyser;
      timeBufRef.current = new Float32Array(new ArrayBuffer(analyser.fftSize * 4));
      actx.createMediaStreamSource(stream).connect(analyser);
      setMode("mic");
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Mic unavailable. Check permissions.");
    }
  }, []);

  // ── start demo ────────────────────────────────────────────────────────────

  const startDemo = useCallback(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const Ctx: typeof AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    const actx = new Ctx();
    actxRef.current = actx;
    const analyser = actx.createAnalyser();
    analyser.fftSize = 4096;
    analyser.smoothingTimeConstant = 0.0;
    analyserRef.current = analyser;
    timeBufRef.current = new Float32Array(new ArrayBuffer(analyser.fftSize * 4));
    demoNotesRef.current = buildBachFragment(bpmRef.current);
    demoIdxRef.current = 0;
    scheduleDemoNote(actx, analyser);
    setMode("demo");
    setError(null);
  }, [scheduleDemoNote]);

  // ── stop ──────────────────────────────────────────────────────────────────

  const stop = useCallback(() => {
    cancelAnimationFrame(animRef.current);
    if (demoTimerRef.current) clearTimeout(demoTimerRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    void actxRef.current?.close();
    actxRef.current = null;
    analyserRef.current = null;
    timeBufRef.current = null;
    notesRef.current = [];
    activeNoteRef.current = null;
    scrollXRef.current = 0;
    demoFreqRef.current = 0;
    setCurrentNote("—");
    setMode("idle");
  }, []);

  // ── main render loop ──────────────────────────────────────────────────────

  useEffect(() => {
    if (mode === "idle") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = () => canvas.width / dpr;
    const H = () => canvas.height / dpr;

    // Layout constants
    const KEYS_W = 44;       // piano key column width
    const GRID_TOP = 28;     // top margin (labels)
    const GRID_BOT = 28;     // bottom margin
    const SCROLL_PX_PER_SEC = () => (bpmRef.current / 60) * 80; // 80px per beat

    let lastHudUpdate = 0;
    const SILENCE_GATE = 10;

    const render = (now: number) => {
      animRef.current = requestAnimationFrame(render);

      const analyser = analyserRef.current;
      const buf = timeBufRef.current;
      if (!analyser || !buf) return;

      const w = W();
      const h = H();
      const gridH = h - GRID_TOP - GRID_BOT;
      const rowH = gridH / MIDI_RANGE;
      const dt = lastFrameTimeRef.current > 0 ? Math.min((now - lastFrameTimeRef.current) / 1000, 0.1) : 0;
      lastFrameTimeRef.current = now;

      // Advance scroll
      const pxPerSec = SCROLL_PX_PER_SEC();
      scrollXRef.current += pxPerSec * dt;
      const scroll = scrollXRef.current;

      // Detect pitch
      analyser.getFloatTimeDomainData(buf as unknown as Float32Array<ArrayBuffer>);

      let freq = 0;
      if (mode === "demo" && actxRef.current) {
        // Use the known demo frequency while the note is still sounding
        freq = actxRef.current.currentTime < demoFreqEndRef.current ? demoFreqRef.current : 0;
      } else {
        freq = detectPitch(buf, analyser.context.sampleRate);
      }

      const midi = freq > 0 ? freqToMidi(freq) : 0;

      // ── note tracking ─────────────────────────────────────────────────────
      if (freq > 0 && midi >= MIDI_MIN - 0.5 && midi <= MIDI_MAX + 0.5) {
        silenceFramesRef.current = 0;
        const hue = freqToHue(freq);
        const clampedMidi = Math.max(MIDI_MIN, Math.min(MIDI_MAX, midi));

        if (!activeNoteRef.current) {
          const nb: NoteBar = {
            midi: clampedMidi,
            hue,
            startX: scroll,
            width: pxPerSec * dt,
            active: true,
          };
          activeNoteRef.current = nb;
          notesRef.current.push(nb);
        } else {
          activeNoteRef.current.width += pxPerSec * dt;
          activeNoteRef.current.midi = clampedMidi;
          activeNoteRef.current.hue = hue;
        }
      } else {
        silenceFramesRef.current++;
        if (silenceFramesRef.current >= SILENCE_GATE && activeNoteRef.current) {
          activeNoteRef.current.active = false;
          activeNoteRef.current = null;
        }
      }

      // Remove bars that have scrolled entirely off-screen left (keep memory bounded)
      const notes = notesRef.current;
      while (notes.length > 0) {
        const n0 = notes[0];
        const rightEdge = (n0.startX + n0.width) - scroll + (w - KEYS_W);
        if (rightEdge < -200) notes.shift();
        else break;
      }

      // ── draw ──────────────────────────────────────────────────────────────

      // Background
      ctx.fillStyle = "#050508";
      ctx.fillRect(0, 0, w, h);

      // Grid: horizontal pitch lines
      ctx.save();
      ctx.beginPath();
      for (let m = MIDI_MIN; m <= MIDI_MAX; m++) {
        const y = GRID_TOP + gridH - (m - MIDI_MIN) * rowH;
        // C notes: brighter line + label
        if (m % 12 === 0) {
          ctx.strokeStyle = "rgba(255,255,255,0.12)";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(KEYS_W, y);
          ctx.lineTo(w, y);
          ctx.stroke();
          ctx.fillStyle = "rgba(255,255,255,0.25)";
          ctx.font = "9px monospace";
          ctx.textAlign = "right";
          ctx.fillText(`C${Math.floor(m / 12) - 1}`, KEYS_W - 4, y + 3);
        } else {
          ctx.strokeStyle = "rgba(255,255,255,0.03)";
          ctx.lineWidth = 0.5;
          ctx.beginPath();
          ctx.moveTo(KEYS_W, y);
          ctx.lineTo(w, y);
          ctx.stroke();
        }
      }
      ctx.restore();

      // Vertical beat lines (every beat = 80px at 60BPM)
      const pxPerBeat = (bpmRef.current / 60) * 80;
      const firstBeat = Math.floor(scroll / pxPerBeat) * pxPerBeat;
      ctx.save();
      for (let bx = firstBeat; bx < scroll + w; bx += pxPerBeat) {
        const screenX = KEYS_W + (bx - scroll);
        if (screenX < KEYS_W) continue;
        ctx.strokeStyle = "rgba(255,255,255,0.07)";
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(screenX, GRID_TOP);
        ctx.lineTo(screenX, h - GRID_BOT);
        ctx.stroke();
      }
      ctx.restore();

      // Note bars
      ctx.save();
      ctx.beginPath();
      ctx.rect(KEYS_W, GRID_TOP, w - KEYS_W, gridH);
      ctx.clip();

      for (const nb of notes) {
        const barX = KEYS_W + (nb.startX - scroll);
        const barW = nb.width;
        const barY = GRID_TOP + gridH - (nb.midi - MIDI_MIN) * rowH - rowH * 0.85;
        const barH = rowH * 0.78;
        if (barX + barW < KEYS_W || barX > w) continue;

        ctx.globalCompositeOperation = "lighter";
        // Glow fill
        ctx.fillStyle = `hsla(${nb.hue},85%,55%,0.35)`;
        ctx.shadowColor = `hsl(${nb.hue},90%,65%)`;
        ctx.shadowBlur = nb.active ? 12 : 6;
        ctx.beginPath();
        ctx.roundRect(barX, barY, Math.max(2, barW), barH, 2);
        ctx.fill();

        // Brighter core
        ctx.fillStyle = `hsla(${nb.hue},90%,75%,0.55)`;
        ctx.shadowBlur = 0;
        ctx.beginPath();
        ctx.roundRect(barX + 1, barY + 1, Math.max(1, barW - 2), barH - 2, 1);
        ctx.fill();

        // Leading edge pulse on active notes
        if (nb.active) {
          ctx.fillStyle = `hsla(${nb.hue},100%,92%,0.9)`;
          ctx.shadowColor = `hsl(${nb.hue},100%,85%)`;
          ctx.shadowBlur = 16;
          ctx.fillRect(barX + barW - 2, barY, 2, barH);
        }
      }

      ctx.restore();

      // Cursor line (vertical, at right of roll - 200px)
      const cursorX = w - 200;
      ctx.save();
      ctx.strokeStyle = "rgba(255,255,255,0.15)";
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 8]);
      ctx.beginPath();
      ctx.moveTo(cursorX, GRID_TOP);
      ctx.lineTo(cursorX, h - GRID_BOT);
      ctx.stroke();
      ctx.restore();

      // Piano key column
      drawPianoKeys(ctx, KEYS_W, GRID_TOP, gridH, rowH, midi);

      // BPM scale bar at bottom
      ctx.fillStyle = "rgba(255,255,255,0.06)";
      ctx.fillRect(KEYS_W, h - GRID_BOT, w - KEYS_W, GRID_BOT);
      ctx.fillStyle = "rgba(255,255,255,0.2)";
      ctx.font = "9px monospace";
      ctx.textAlign = "left";
      ctx.fillText(`${bpmRef.current} BPM`, KEYS_W + 8, h - GRID_BOT + 17);

      // HUD update ~8 Hz
      if (now - lastHudUpdate > 125) {
        lastHudUpdate = now;
        const label = freq > 0 ? midiToNoteName(Math.round(midi)) : (mode === "demo" ? "·" : "—");
        setCurrentNote(label);
      }
    };

    lastFrameTimeRef.current = 0;
    animRef.current = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animRef.current);
  }, [mode]);

  return (
    <div className="relative w-full" style={{ height: "calc(100vh - 3rem)" }}>
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        style={{ background: "#050508" }}
      />

      {/* Idle screen */}
      {mode === "idle" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6">
          <h1 className="text-2xl md:text-3xl mb-3 tracking-tight">Piano Roll</h1>
          <p className="text-sm text-white/55 max-w-md mb-2 leading-relaxed">
            Play piano or sing — each note appears as a glowing bar scrolling left,
            placed at its pitch. The same representation every DAW uses, live from
            your mic.
          </p>
          <p className="text-xs text-white/30 mb-8">
            Demo plays Bach Invention No.1 silently and renders its own notes.
          </p>

          <div className="flex items-center gap-3 mb-6">
            <label className="text-xs text-white/40 uppercase tracking-wider">BPM</label>
            <input
              type="range" min={40} max={160} value={bpm}
              onChange={e => setBpm(Number(e.target.value))}
              className="w-32 accent-white/60"
            />
            <span className="text-xs text-white/60 font-mono w-6">{bpm}</span>
          </div>

          <div className="flex gap-4">
            <button
              onClick={startMic}
              className="px-6 py-3 text-sm tracking-wider uppercase border border-white/30 rounded hover:bg-white/5 hover:border-white/60 transition"
            >
              Start mic
            </button>
            <button
              onClick={startDemo}
              className="px-6 py-3 text-sm tracking-wider uppercase border border-white/20 rounded hover:bg-white/5 hover:border-white/50 transition text-white/70"
            >
              Demo mode
            </button>
          </div>
          {error && (
            <p className="mt-4 text-xs text-rose-300/80 max-w-sm">{error}</p>
          )}
          <Link href="/dream" className="mt-12 text-[11px] text-white/30 hover:text-white/60">
            ← back to dream sandbox
          </Link>
        </div>
      )}

      {/* Running HUD */}
      {mode !== "idle" && (
        <>
          <div className="absolute top-4 left-14 text-[11px] tracking-widest text-white/50 space-y-1 pointer-events-none">
            <div>
              NOTE <span className="text-white font-mono text-base">{currentNote}</span>
            </div>
            <div className="text-white/30 text-[10px]">{mode}</div>
          </div>

          <div className="absolute top-4 right-4 flex flex-col items-end gap-2">
            <div className="flex items-center gap-2">
              <label className="text-[10px] text-white/30 uppercase tracking-wider">BPM</label>
              <input
                type="range" min={40} max={160} value={bpm}
                onChange={e => setBpm(Number(e.target.value))}
                className="w-20 accent-white/60"
              />
              <span className="text-[10px] text-white/50 font-mono w-6">{bpm}</span>
            </div>
            <button
              onClick={stop}
              className="text-[10px] tracking-wider uppercase text-white/40 hover:text-white/70 border border-white/15 hover:border-white/40 px-3 py-1 rounded transition"
            >
              stop
            </button>
            <Link href="/dream" className="text-[10px] text-white/30 hover:text-white/60">
              ← back
            </Link>
          </div>

          <a
            href="/dream/24-piano-roll/readme"
            className="absolute bottom-4 left-14 text-[10px] text-white/25 hover:text-white/50 transition"
          >
            design notes ↗
          </a>
        </>
      )}
    </div>
  );
}

// ── piano key sidebar ─────────────────────────────────────────────────────────

function drawPianoKeys(
  ctx: CanvasRenderingContext2D,
  keysW: number,
  gridTop: number,
  gridH: number,
  rowH: number,
  activeMidi: number
) {
  const BLACK_KEYS = new Set([1, 3, 6, 8, 10]); // semitones within octave

  ctx.save();
  ctx.fillStyle = "#0a0a12";
  ctx.fillRect(0, gridTop, keysW, gridH);

  for (let m = MIDI_MIN; m <= MIDI_MAX; m++) {
    const semi = ((m % 12) + 12) % 12;
    const isBlack = BLACK_KEYS.has(semi);
    const y = gridTop + gridH - (m - MIDI_MIN) * rowH - rowH;
    const isActive = Math.abs(m - activeMidi) < 0.6;

    if (isBlack) {
      ctx.fillStyle = isActive ? `hsl(${((m * 13) % 360)},80%,45%)` : "#1a1a22";
      ctx.fillRect(2, y + 1, keysW - 10, rowH - 1);
    } else {
      ctx.fillStyle = isActive ? `hsl(${((m * 13) % 360)},70%,70%)` : "#e8e8f0";
      ctx.fillRect(2, y + 0.5, keysW - 4, rowH - 1);
    }
  }

  // Separator line
  ctx.strokeStyle = "rgba(255,255,255,0.1)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(keysW, gridTop);
  ctx.lineTo(keysW, gridTop + gridH);
  ctx.stroke();

  ctx.restore();
}
