"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";

// ── pitch detection (McLeod autocorrelation, same as 13-piano-canvas / 24-piano-roll) ─────

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

  let maxVal = 0, maxBin = minBin;
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

function midiToNoteName(midi: number): string {
  const names = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];
  const note = names[((Math.round(midi) % 12) + 12) % 12];
  const oct = Math.floor(Math.round(midi) / 12) - 1;
  return `${note}${oct}`;
}

// ── score constants ───────────────────────────────────────────────────────────

const MIDI_MIN = 36;
const MIDI_MAX = 84;
const MIDI_RANGE = MIDI_MAX - MIDI_MIN;
const PX_PER_BEAT = 80;
const CURSOR_FRAC = 0.28; // cursor at 28% from left edge of the grid area

// ── score data (Bach BWV 772 opening, same fragment as 24-piano-roll) ─────────

interface ScoreNote { midi: number; freq: number; beats: number; startX: number; }

function buildScore(): ScoreNote[] {
  const s: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const mk = (name: string, oct: number, beats: number): ScoreNote => {
    const midi = (oct + 1) * 12 + s[name];
    return { midi, freq: 440 * Math.pow(2, (midi - 69) / 12), beats, startX: 0 };
  };
  const raw = [
    mk("C",4,.5), mk("D",4,.5), mk("E",4,.5), mk("F",4,.5),
    mk("G",4,.5), mk("A",4,.5), mk("B",4,.5), mk("C",5,.5),
    mk("D",5,.5), mk("B",4,.5), mk("C",5,.5), mk("D",5,.5),
    mk("G",4,.5), mk("D",5,.5), mk("C",5,.5), mk("B",4,.5),
    mk("A",4,.5), mk("G",4,.5), mk("A",4,.5), mk("B",4,.5),
    mk("C",5,.5), mk("B",4,.5), mk("A",4,.5), mk("G",4,.5),
    mk("F",4,.5), mk("G",4,.5), mk("A",4,.5), mk("G",4,.5),
    mk("F",4,.5), mk("E",4,.5), mk("D",4,.5), mk("C",4,.5),
    mk("E",4,1),  mk("G",4,1),  mk("C",4,2),
  ];
  let x = 0;
  for (const r of raw) { r.startX = x; x += r.beats * PX_PER_BEAT; }
  return raw;
}

const TOTAL_NOTES = buildScore().length; // = 35

// ── main component ────────────────────────────────────────────────────────────

export default function ScoreFollow() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animRef = useRef(0);

  // Audio
  const actxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const timeBufRef = useRef<Float32Array | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Score follow state (mutable refs — hot path avoids re-renders)
  const scoreRef = useRef<ScoreNote[]>([]);
  const totalWidthRef = useRef(0);
  const scrollXRef = useRef(0);
  const targetScrollRef = useRef(0);
  const cursorOffsetRef = useRef(0); // CURSOR_X - KEYS_W, updated each frame
  const cursorIdxRef = useRef(0);   // index of the next note to match
  const matchedRef = useRef(new Set<number>());
  const waitSilenceRef = useRef(false); // after a match, wait for silence before next
  const wrongFramesRef = useRef(0);     // frames of sustained wrong-note playing
  const detectedMidiRef = useRef(0);
  const pulseRef = useRef(0);

  // Demo sequencer
  const demoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const demoIdxRef = useRef(0);
  const demoFreqRef = useRef(0);
  const demoFreqEndRef = useRef(0);

  const [mode, setMode] = useState<"idle" | "mic" | "demo">("idle");
  const [error, setError] = useState<string | null>(null);
  const [bpm, setBpm] = useState(72);
  const [matchCount, setMatchCount] = useState(0);
  const [isDone, setIsDone] = useState(false);
  const bpmRef = useRef(72);

  useEffect(() => { bpmRef.current = bpm; }, [bpm]);

  // ── canvas sizing ──────────────────────────────────────────────────────────

  const resizeCanvas = useCallback(() => {
    const c = canvasRef.current;
    if (!c) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    c.width = Math.round(window.innerWidth * dpr);
    c.height = Math.round(window.innerHeight * dpr);
    c.style.width = `${window.innerWidth}px`;
    c.style.height = `${window.innerHeight}px`;
  }, []);

  useEffect(() => {
    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);
    return () => window.removeEventListener("resize", resizeCanvas);
  }, [resizeCanvas]);

  // ── score initialisation ───────────────────────────────────────────────────

  const initScore = useCallback(() => {
    const score = buildScore();
    scoreRef.current = score;
    totalWidthRef.current = score[score.length - 1].startX + score[score.length - 1].beats * PX_PER_BEAT;
    cursorIdxRef.current = 0;
    matchedRef.current = new Set();
    waitSilenceRef.current = false;
    wrongFramesRef.current = 0;
    // Position first note at the cursor: scrollX = score[0].startX - cursorOffset = -cursorOffset
    const initOffset = (window.innerWidth - 44) * CURSOR_FRAC;
    scrollXRef.current = -initOffset;
    targetScrollRef.current = -initOffset;
  }, []);

  // ── demo sequencer ─────────────────────────────────────────────────────────

  const scheduleDemo = useCallback((actx: AudioContext, analyser: AnalyserNode) => {
    const score = scoreRef.current;
    if (demoIdxRef.current >= score.length) return;
    const note = score[demoIdxRef.current];
    demoIdxRef.current++;

    const dur = note.beats * (60 / bpmRef.current);

    const osc = actx.createOscillator();
    const g = actx.createGain();
    osc.type = "triangle";
    osc.frequency.value = note.freq;
    g.gain.setValueAtTime(0, actx.currentTime);
    g.gain.linearRampToValueAtTime(0.12, actx.currentTime + 0.02);
    g.gain.setValueAtTime(0.12, actx.currentTime + dur * 0.75);
    g.gain.linearRampToValueAtTime(0, actx.currentTime + dur);
    osc.connect(g);
    g.connect(analyser);
    osc.start(actx.currentTime);
    osc.stop(actx.currentTime + dur + 0.05);

    demoFreqRef.current = note.freq;
    demoFreqEndRef.current = actx.currentTime + dur;

    if (demoIdxRef.current < score.length) {
      demoTimerRef.current = setTimeout(
        () => scheduleDemo(actx, analyser),
        (dur + 0.04) * 1000
      );
    }
  }, []);

  // ── start mic ──────────────────────────────────────────────────────────────

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
      initScore();
      setMatchCount(0);
      setIsDone(false);
      setMode("mic");
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Mic unavailable. Check permissions.");
    }
  }, [initScore]);

  // ── start demo ─────────────────────────────────────────────────────────────

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
    initScore();
    demoIdxRef.current = 0;
    scheduleDemo(actx, analyser);
    setMatchCount(0);
    setIsDone(false);
    setMode("demo");
    setError(null);
  }, [initScore, scheduleDemo]);

  // ── stop ───────────────────────────────────────────────────────────────────

  const stop = useCallback(() => {
    cancelAnimationFrame(animRef.current);
    if (demoTimerRef.current) clearTimeout(demoTimerRef.current);
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    void actxRef.current?.close();
    actxRef.current = null;
    analyserRef.current = null;
    timeBufRef.current = null;
    detectedMidiRef.current = 0;
    setMode("idle");
  }, []);

  // ── main render loop ───────────────────────────────────────────────────────

  useEffect(() => {
    if (mode === "idle") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = () => canvas.width / dpr;
    const H = () => canvas.height / dpr;
    const KEYS_W = 44;
    const GRID_TOP = 24;
    const GRID_BOT = 24;

    let frameIdx = 0;

    const render = (now: number) => {
      animRef.current = requestAnimationFrame(render);
      frameIdx++;

      const analyser = analyserRef.current;
      const buf = timeBufRef.current;
      if (!analyser || !buf) return;

      const w = W(), h = H();
      const gridH = h - GRID_TOP - GRID_BOT;
      const rowH = gridH / MIDI_RANGE;
      const CURSOR_X = KEYS_W + (w - KEYS_W) * CURSOR_FRAC;
      cursorOffsetRef.current = CURSOR_X - KEYS_W;

      const score = scoreRef.current;
      if (score.length === 0) return;

      // ── pitch detection ────────────────────────────────────────────────
      analyser.getFloatTimeDomainData(buf as unknown as Float32Array<ArrayBuffer>);

      let detectedFreq = 0;
      if (mode === "demo" && actxRef.current) {
        detectedFreq = actxRef.current.currentTime < demoFreqEndRef.current
          ? demoFreqRef.current : 0;
      } else if (frameIdx % 2 === 0) {
        // Run full autocorrelation every other frame to halve CPU cost
        detectedFreq = detectPitch(buf, analyser.context.sampleRate);
      } else {
        // Interpolate from last known midi
        detectedFreq = detectedMidiRef.current > 0
          ? 440 * Math.pow(2, (detectedMidiRef.current - 69) / 12) : 0;
      }
      const detectedMidi = detectedFreq > 0 ? freqToMidi(detectedFreq) : 0;
      detectedMidiRef.current = detectedMidi;

      // ── score following ────────────────────────────────────────────────
      const curIdx = cursorIdxRef.current;

      if (curIdx < score.length) {
        if (waitSilenceRef.current) {
          // After a match: wait until silence before accepting the next note
          if (detectedFreq === 0) waitSilenceRef.current = false;
        } else if (detectedFreq > 0) {
          const semErr = Math.abs(detectedMidi - score[curIdx].midi);
          if (semErr < 1.5) {
            // ✓ Match
            matchedRef.current.add(curIdx);
            const nextIdx = curIdx + 1;
            cursorIdxRef.current = nextIdx;
            waitSilenceRef.current = true;
            wrongFramesRef.current = 0;

            if (nextIdx < score.length) {
              targetScrollRef.current = score[nextIdx].startX - cursorOffsetRef.current;
            } else {
              // Score complete: push cursor past the last bar
              targetScrollRef.current = totalWidthRef.current - cursorOffsetRef.current + PX_PER_BEAT;
              setIsDone(true);
            }
            setMatchCount(nextIdx);
          } else {
            // ✗ Wrong note — increment miss counter
            wrongFramesRef.current++;
            if (wrongFramesRef.current > 90 && cursorIdxRef.current > 0) {
              // Forgiveness: back up one note after ~1.5 s of wrong playing
              cursorIdxRef.current--;
              matchedRef.current.delete(cursorIdxRef.current);
              targetScrollRef.current = score[cursorIdxRef.current].startX - cursorOffsetRef.current;
              wrongFramesRef.current = 0;
              waitSilenceRef.current = false;
              setMatchCount(cursorIdxRef.current);
            }
          }
        } else {
          // Silence: reset wrong counter (user is thinking, not actively wrong)
          wrongFramesRef.current = 0;
        }
      }

      // Smooth scroll animation
      scrollXRef.current += (targetScrollRef.current - scrollXRef.current) * 0.12;
      pulseRef.current = (pulseRef.current + 0.05) % (Math.PI * 2);
      const scrollX = scrollXRef.current;

      // ── draw ───────────────────────────────────────────────────────────

      ctx.fillStyle = "#050508";
      ctx.fillRect(0, 0, w, h);

      // Horizontal pitch lines
      ctx.save();
      for (let m = MIDI_MIN; m <= MIDI_MAX; m++) {
        const y = GRID_TOP + gridH - (m - MIDI_MIN) * rowH;
        if (m % 12 === 0) {
          ctx.strokeStyle = "rgba(255,255,255,0.10)";
          ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(KEYS_W, y); ctx.lineTo(w, y); ctx.stroke();
          ctx.fillStyle = "rgba(255,255,255,0.20)";
          ctx.font = "9px monospace";
          ctx.textAlign = "right";
          ctx.fillText(`C${Math.floor(m / 12) - 1}`, KEYS_W - 4, y + 3);
        } else {
          ctx.strokeStyle = "rgba(255,255,255,0.025)";
          ctx.lineWidth = 0.5;
          ctx.beginPath(); ctx.moveTo(KEYS_W, y); ctx.lineTo(w, y); ctx.stroke();
        }
      }
      ctx.restore();

      // Vertical beat grid
      const firstBeat = Math.floor(scrollX / PX_PER_BEAT) * PX_PER_BEAT;
      ctx.save();
      ctx.strokeStyle = "rgba(255,255,255,0.05)";
      ctx.lineWidth = 0.5;
      for (let bx = firstBeat; bx < scrollX + w; bx += PX_PER_BEAT) {
        const sx = KEYS_W + (bx - scrollX);
        if (sx < KEYS_W || sx > w) continue;
        ctx.beginPath(); ctx.moveTo(sx, GRID_TOP); ctx.lineTo(sx, h - GRID_BOT); ctx.stroke();
      }
      ctx.restore();

      // ── Score note bars ────────────────────────────────────────────────
      ctx.save();
      ctx.beginPath();
      ctx.rect(KEYS_W, GRID_TOP, w - KEYS_W, gridH);
      ctx.clip();

      const currentIdx = cursorIdxRef.current;

      for (let i = 0; i < score.length; i++) {
        const note = score[i];
        const noteW = note.beats * PX_PER_BEAT - 3;
        const sx = KEYS_W + (note.startX - scrollX);
        if (sx + noteW < KEYS_W || sx > w) continue;

        const sy = GRID_TOP + gridH - (note.midi - MIDI_MIN) * rowH - rowH * 0.85;
        const sh = rowH * 0.78;
        const rw = Math.max(2, noteW);

        const isMatched = matchedRef.current.has(i);
        const isCurrent = i === currentIdx;

        ctx.beginPath();
        ctx.roundRect(sx, sy, rw, sh, 2);

        if (isMatched) {
          ctx.globalCompositeOperation = "lighter";
          ctx.fillStyle = "hsla(130,75%,48%,0.28)";
          ctx.shadowColor = "hsl(130,85%,58%)";
          ctx.shadowBlur = 8;
          ctx.fill();
          ctx.shadowBlur = 0;
          // Bright core
          ctx.fillStyle = "hsla(130,80%,68%,0.42)";
          ctx.beginPath();
          ctx.roundRect(sx + 1, sy + 1, Math.max(1, noteW - 2), sh - 2, 1);
          ctx.fill();
          ctx.globalCompositeOperation = "source-over";
        } else if (isCurrent) {
          // Pulsing target note
          const p = 0.5 + 0.5 * Math.sin(pulseRef.current);
          ctx.fillStyle = `rgba(255,255,255,${0.06 + p * 0.07})`;
          ctx.fill();
          ctx.strokeStyle = `rgba(255,255,255,${0.30 + p * 0.45})`;
          ctx.lineWidth = 1.5;
          ctx.shadowColor = `rgba(255,255,255,${p * 0.20})`;
          ctx.shadowBlur = 8;
          ctx.beginPath();
          ctx.roundRect(sx, sy, rw, sh, 2);
          ctx.stroke();
          ctx.shadowBlur = 0;
          // Pitch label on target note
          if (rw > 20) {
            ctx.fillStyle = `rgba(255,255,255,${0.35 + p * 0.40})`;
            ctx.font = `${Math.min(9, sh * 0.65)}px monospace`;
            ctx.textAlign = "center";
            ctx.fillText(midiToNoteName(note.midi), sx + rw / 2, sy + sh * 0.65);
          }
        } else {
          ctx.fillStyle = "rgba(255,255,255,0.04)";
          ctx.fill();
          ctx.strokeStyle = "rgba(255,255,255,0.10)";
          ctx.lineWidth = 0.5;
          ctx.beginPath();
          ctx.roundRect(sx, sy, rw, sh, 2);
          ctx.stroke();
        }
      }
      ctx.restore();

      // ── Cursor line ────────────────────────────────────────────────────
      ctx.save();
      ctx.strokeStyle = "rgba(255,255,255,0.50)";
      ctx.lineWidth = 1.5;
      ctx.shadowColor = "rgba(255,255,255,0.20)";
      ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.moveTo(CURSOR_X, GRID_TOP);
      ctx.lineTo(CURSOR_X, h - GRID_BOT);
      ctx.stroke();
      ctx.restore();

      // ── Detected pitch indicator (yellow triangle at cursor height) ────
      if (detectedMidi > MIDI_MIN && detectedMidi < MIDI_MAX) {
        const py = GRID_TOP + gridH - (detectedMidi - MIDI_MIN) * rowH - rowH * 0.5;
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        ctx.fillStyle = "rgba(255,195,55,0.90)";
        ctx.shadowColor = "rgba(255,185,35,0.70)";
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.moveTo(CURSOR_X + 3, py);
        ctx.lineTo(CURSOR_X + 11, py - 5);
        ctx.lineTo(CURSOR_X + 11, py + 5);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }

      // Piano key sidebar
      drawPianoKeys(ctx, KEYS_W, GRID_TOP, gridH, rowH, detectedMidi);

      void now; // suppress unused warning
    };

    animRef.current = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animRef.current);
  }, [mode]);

  // ── render ─────────────────────────────────────────────────────────────────

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
          <h1 className="text-2xl md:text-3xl mb-3 tracking-tight">Score Follow</h1>
          <p className="text-sm text-white/55 max-w-md mb-2 leading-relaxed">
            Bach Invention No.1 appears as a piano roll. Play along —
            the score lights green as you match each note. The cursor
            advances only when you play the right pitch.
          </p>
          <p className="text-xs text-white/30 mb-2">
            Play the wrong note for too long and the score backs up one step.
          </p>
          <p className="text-xs text-white/25 mb-8">
            Demo mode plays the score and self-matches — cursor advances perfectly.
          </p>

          <div className="flex items-center gap-3 mb-6">
            <label className="text-xs text-white/40 uppercase tracking-wider">BPM</label>
            <input
              type="range" min={40} max={160} value={bpm}
              onChange={e => setBpm(Number(e.target.value))}
              className="w-32 accent-white/60"
            />
            <span className="text-xs text-white/60 font-mono w-8">{bpm}</span>
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
          {/* Progress */}
          <div className="absolute top-3 left-14 text-[11px] tracking-widest text-white/40 pointer-events-none select-none">
            <span className="font-mono text-white/70">{matchCount}</span>
            <span className="text-white/30"> / {TOTAL_NOTES} notes</span>
            <span className="ml-3 text-white/20 text-[10px]">{mode}</span>
          </div>

          {/* Controls */}
          <div className="absolute top-3 right-4 flex flex-col items-end gap-2">
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

          {/* Legend */}
          <div className="absolute bottom-6 right-4 text-[10px] text-white/25 space-y-1 pointer-events-none select-none">
            <div>
              <span className="inline-block w-3 h-2 rounded-sm bg-green-500/50 mr-1 align-middle" />
              matched
            </div>
            <div>
              <span className="inline-block w-3 h-2 rounded-sm border border-white/40 mr-1 align-middle" />
              target
            </div>
            <div>
              <span className="inline-block w-2 h-0 border-t border-yellow-400/70 mr-1 align-middle" />
              ▶ you
            </div>
          </div>

          {/* Score complete overlay */}
          {isDone && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="text-center bg-black/70 backdrop-blur-sm rounded-xl px-10 py-7 border border-white/10">
                <div className="text-4xl mb-2 text-green-400">✓</div>
                <p className="text-xl tracking-wider text-green-400/90">Score complete</p>
                <p className="text-xs text-white/40 mt-2">{TOTAL_NOTES} notes matched</p>
              </div>
            </div>
          )}

          <a
            href="/dream/26-score-follow/readme"
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
  activeMidi: number,
) {
  const BLACK = new Set([1, 3, 6, 8, 10]);
  ctx.save();
  ctx.fillStyle = "#0a0a12";
  ctx.fillRect(0, gridTop, keysW, gridH);

  for (let m = MIDI_MIN; m <= MIDI_MAX; m++) {
    const semi = ((m % 12) + 12) % 12;
    const isBlack = BLACK.has(semi);
    const y = gridTop + gridH - (m - MIDI_MIN) * rowH - rowH;
    const isActive = Math.abs(m - activeMidi) < 0.6;

    if (isBlack) {
      ctx.fillStyle = isActive ? `hsl(${(m * 13) % 360},80%,45%)` : "#1a1a22";
      ctx.fillRect(2, y + 1, keysW - 10, rowH - 1);
    } else {
      ctx.fillStyle = isActive ? `hsl(${(m * 13) % 360},70%,70%)` : "#e8e8f0";
      ctx.fillRect(2, y + 0.5, keysW - 4, rowH - 1);
    }
  }

  ctx.strokeStyle = "rgba(255,255,255,0.10)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(keysW, gridTop);
  ctx.lineTo(keysW, gridTop + gridH);
  ctx.stroke();
  ctx.restore();
}
