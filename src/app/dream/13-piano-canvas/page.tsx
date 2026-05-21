"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";

// ── pitch helpers ────────────────────────────────────────────────────────────

/** McLeod Pitch Method (simplified) via autocorrelation. Returns frequency in
 *  Hz, or 0 if confidence is below threshold. Works well for monophonic pitched
 *  audio (piano, voice, single instrument). */
function detectPitch(buf: Float32Array, sampleRate: number): number {
  const n = buf.length;
  // RMS gate — don't detect pitch in silence
  let rms = 0;
  for (let i = 0; i < n; i++) rms += buf[i] * buf[i];
  rms = Math.sqrt(rms / n);
  if (rms < 0.012) return 0;

  // Autocorrelation
  const ac = new Float32Array(n);
  for (let lag = 0; lag < n; lag++) {
    let s = 0;
    for (let i = 0; i < n - lag; i++) s += buf[i] * buf[i + lag];
    ac[lag] = s;
  }
  if (ac[0] === 0) return 0;

  // Normalize by zero-lag
  const acn = new Float32Array(n);
  for (let i = 0; i < n; i++) acn[i] = ac[i] / ac[0];

  // Find first trough then first peak above threshold
  let minBin = 0;
  while (minBin < n - 1 && acn[minBin + 1] < acn[minBin]) minBin++;

  let maxVal = 0;
  let maxBin = minBin;
  for (let i = minBin; i < n; i++) {
    if (acn[i] > maxVal) { maxVal = acn[i]; maxBin = i; }
  }
  if (maxVal < 0.82) return 0; // low confidence

  // Parabolic interpolation for sub-bin precision
  const y0 = acn[Math.max(0, maxBin - 1)];
  const y1 = acn[maxBin];
  const y2 = acn[Math.min(n - 1, maxBin + 1)];
  const denom = 2 * (2 * y1 - y0 - y2);
  const refined = denom !== 0 ? maxBin + (y0 - y2) / denom : maxBin;

  const freq = sampleRate / refined;
  // Piano range: A0=27.5 Hz → C8=4186 Hz; add some slack
  if (freq < 24 || freq > 4500) return 0;
  return freq;
}

/** Map frequency to hue (0–360). A4=440 Hz = 0°. Each octave = 60° shift. */
function freqToHue(freq: number): number {
  if (freq <= 0) return 0;
  // A4 = 440 Hz as hue anchor. Log2 * 60° per octave, full wheel every 6 octaves.
  const semitones = 12 * Math.log2(freq / 440);
  return ((semitones * 5 + 360 * 10) % 360);
}

/** Map frequency to approximate MIDI note number (for display). */
function freqToNoteName(freq: number): string {
  if (freq <= 0) return "—";
  const midi = Math.round(69 + 12 * Math.log2(freq / 440));
  const names = ["C","C♯","D","D♯","E","F","F♯","G","G♯","A","A♯","B"];
  const note = names[((midi % 12) + 12) % 12];
  const octave = Math.floor(midi / 12) - 1;
  return `${note}${octave}`;
}

// ── stroke types ─────────────────────────────────────────────────────────────

interface Stroke {
  x: number;
  y: number;
  dx: number; // direction accumulated during note
  dy: number;
  hue: number;
  weight: number;
  length: number;
  alpha: number;
  segments: Array<{ x: number; y: number }>;
}

// ── demo synth (no mic needed) ───────────────────────────────────────────────

const DEMO_SCALE = [
  261.63, 293.66, 329.63, 349.23, 392.00, 440.00, 493.88, // C4–B4
  523.25, 587.33, 659.25, 698.46, 783.99, 880.00, 987.77, // C5–B5
  1046.50, 1174.66, 1318.51, 1396.91, // C6–E6
];
const DEMO_BASS = [130.81, 146.83, 164.81, 174.61, 196.00, 220.00]; // C3–A3

// ── main component ───────────────────────────────────────────────────────────

export default function PianoCanvas() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const paintRef = useRef<HTMLCanvasElement | null>(null); // persistent painting layer
  const animRef = useRef(0);

  // Audio refs
  const actxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const timeBufRef = useRef<Float32Array | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Stroke tracking
  const activeStrokeRef = useRef<Stroke | null>(null);
  const strokeCountRef = useRef(0);
  const strokesRef = useRef<Stroke[]>([]);
  const lastPitchRef = useRef(0);
  const silenceFramesRef = useRef(0);

  // Demo refs
  const demoOscRef = useRef<OscillatorNode | null>(null);
  const demoGainRef = useRef<GainNode | null>(null);
  const demoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [mode, setMode] = useState<"idle" | "mic" | "demo">("idle");
  const [error, setError] = useState<string | null>(null);
  const [currentNote, setCurrentNote] = useState("—");
  const [strokeCount, setStrokeCount] = useState(0);

  // ── canvas setup ──────────────────────────────────────────────────────────

  const setupCanvases = useCallback(() => {
    const display = canvasRef.current;
    const paint = paintRef.current;
    if (!display || !paint) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = window.innerWidth;
    const h = window.innerHeight;
    for (const c of [display, paint]) {
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
      c.style.width = `${w}px`;
      c.style.height = `${h}px`;
    }
    const pCtx = paint.getContext("2d");
    if (pCtx) {
      pCtx.scale(dpr, dpr);
      pCtx.fillStyle = "#050508";
      pCtx.fillRect(0, 0, w, h);
    }
    const dCtx = display.getContext("2d");
    if (dCtx) dCtx.scale(dpr, dpr);
  }, []);

  useEffect(() => {
    setupCanvases();
    const onResize = () => setupCanvases();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [setupCanvases]);

  // ── demo mode: play a wandering melody via Web Audio ──────────────────────

  const scheduleDemo = useCallback((actx: AudioContext, dest: AudioNode) => {
    const playNote = (freq: number, duration: number, volume: number) => {
      const osc = actx.createOscillator();
      const g = actx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      g.gain.setValueAtTime(0, actx.currentTime);
      g.gain.linearRampToValueAtTime(volume, actx.currentTime + 0.02);
      g.gain.setValueAtTime(volume, actx.currentTime + duration - 0.05);
      g.gain.linearRampToValueAtTime(0, actx.currentTime + duration);
      osc.connect(g);
      g.connect(dest);
      osc.start(actx.currentTime);
      osc.stop(actx.currentTime + duration + 0.05);
      demoOscRef.current = osc;
      demoGainRef.current = g;
    };

    const runPhrase = () => {
      // Mix treble + bass notes for a two-hand feel
      const usesBass = Math.random() < 0.3;
      const pool = usesBass ? DEMO_BASS : DEMO_SCALE;
      const freq = pool[Math.floor(Math.random() * pool.length)];
      const dur = 0.3 + Math.random() * 0.9;
      const vol = 0.06 + Math.random() * 0.08;
      playNote(freq, dur, vol);
      const gap = dur * 1000 + 80 + Math.random() * 200;
      demoTimerRef.current = setTimeout(runPhrase, gap);
    };

    runPhrase();
  }, []);

  // ── start mic ─────────────────────────────────────────────────────────────

  const startMic = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      streamRef.current = stream;
      const Ctx: typeof AudioContext =
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        window.AudioContext || (window as any).webkitAudioContext;
      const actx = new Ctx();
      actxRef.current = actx;
      const src = actx.createMediaStreamSource(stream);
      const analyser = actx.createAnalyser();
      analyser.fftSize = 4096;
      analyser.smoothingTimeConstant = 0.0;
      analyserRef.current = analyser;
      timeBufRef.current = new Float32Array(new ArrayBuffer(analyser.fftSize * 4));
      src.connect(analyser);
      setMode("mic");
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Mic unavailable. Check permissions.");
    }
  }, []);

  // ── start demo ────────────────────────────────────────────────────────────

  const startDemo = useCallback(() => {
    const Ctx: typeof AudioContext =
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      window.AudioContext || (window as any).webkitAudioContext;
    const actx = new Ctx();
    actxRef.current = actx;
    const analyser = actx.createAnalyser();
    analyser.fftSize = 4096;
    analyser.smoothingTimeConstant = 0.0;
    analyserRef.current = analyser;
    timeBufRef.current = new Float32Array(new ArrayBuffer(analyser.fftSize * 4));
    // Demo notes go into analyser but NOT to speakers
    scheduleDemo(actx, analyser);
    setMode("demo");
    setError(null);
  }, [scheduleDemo]);

  // ── stop ──────────────────────────────────────────────────────────────────

  const stop = useCallback(() => {
    cancelAnimationFrame(animRef.current);
    if (demoTimerRef.current) clearTimeout(demoTimerRef.current);
    demoOscRef.current?.stop?.();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    void actxRef.current?.close();
    actxRef.current = null;
    analyserRef.current = null;
    timeBufRef.current = null;
    activeStrokeRef.current = null;
    setMode("idle");
  }, []);

  // ── drawing helpers ───────────────────────────────────────────────────────

  const commitStroke = useCallback((stroke: Stroke) => {
    const paint = paintRef.current;
    if (!paint) return;
    const ctx = paint.getContext("2d");
    if (!ctx || stroke.segments.length < 2) return;

    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.strokeStyle = `hsla(${stroke.hue},85%,60%,${stroke.alpha})`;
    ctx.lineWidth = stroke.weight;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.shadowColor = `hsl(${stroke.hue},90%,70%)`;
    ctx.shadowBlur = stroke.weight * 3;
    ctx.beginPath();
    ctx.moveTo(stroke.segments[0].x, stroke.segments[0].y);
    for (let i = 1; i < stroke.segments.length; i++) {
      ctx.lineTo(stroke.segments[i].x, stroke.segments[i].y);
    }
    ctx.stroke();
    ctx.restore();

    strokesRef.current.push(stroke);
    strokeCountRef.current++;
  }, []);

  // ── main animation loop ───────────────────────────────────────────────────

  useEffect(() => {
    if (mode === "idle") return;
    const display = canvasRef.current;
    const paint = paintRef.current;
    if (!display || !paint) return;
    const dCtx = display.getContext("2d");
    if (!dCtx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = () => display.width / dpr;
    const H = () => display.height / dpr;

    // Stroke path evolves left-to-right with slight vertical wander
    // based on pitch oscillation so higher notes arc upward
    let pathX = W() * (0.05 + Math.random() * 0.1);
    let pathY = H() * (0.2 + Math.random() * 0.6);
    let pathDy = 0; // vertical drift velocity

    let lastHudUpdate = 0;

    const render = (now: number) => {
      animRef.current = requestAnimationFrame(render);
      const analyser = analyserRef.current;
      const buf = timeBufRef.current;
      if (!analyser || !buf) return;

      analyser.getFloatTimeDomainData(buf as unknown as Float32Array<ArrayBuffer>);
      const freq = detectPitch(buf, analyser.context.sampleRate);

      // Amplitude for velocity proxy
      let rms = 0;
      for (let i = 0; i < buf.length; i++) rms += buf[i] * buf[i];
      rms = Math.sqrt(rms / buf.length);
      const velocity = Math.min(1, rms / 0.1);

      const w = W();
      const h = H();
      const SILENCE_GATE = 8; // frames of silence before ending a stroke

      if (freq > 0) {
        silenceFramesRef.current = 0;
        const hue = freqToHue(freq);

        if (!activeStrokeRef.current) {
          // New note onset — start a new stroke at current path position
          const weight = 1.5 + velocity * 6;
          activeStrokeRef.current = {
            x: pathX,
            y: pathY,
            dx: 0,
            dy: 0,
            hue,
            weight,
            length: 0,
            alpha: 0.55 + velocity * 0.35,
            segments: [{ x: pathX, y: pathY }],
          };
        } else {
          // Extend the active stroke
          // Horizontal advance: faster for short notes (staccato → short strokes)
          const advance = 2.5 + velocity * 3.5;
          // Vertical drift: higher pitch = drift up, lower = drift down vs previous
          const pitchDelta = freq - lastPitchRef.current;
          pathDy += pitchDelta * 0.0003;
          pathDy *= 0.88; // damping
          pathDy = Math.max(-4, Math.min(4, pathDy));

          pathX += advance;
          pathY += pathDy;

          // Wrap vertically, keep 10% margins
          pathY = Math.max(h * 0.08, Math.min(h * 0.92, pathY));

          // Wrap horizontally — when we reach the right edge, jump down a line
          if (pathX > w * 0.95) {
            pathX = w * 0.05;
            pathY += h * 0.08 + Math.random() * h * 0.04;
            pathY = Math.max(h * 0.08, Math.min(h * 0.92, pathY));
            pathDy = 0;
          }

          activeStrokeRef.current.segments.push({ x: pathX, y: pathY });
          activeStrokeRef.current.length += advance;
        }

        lastPitchRef.current = freq;
      } else {
        silenceFramesRef.current++;
        if (silenceFramesRef.current >= SILENCE_GATE && activeStrokeRef.current) {
          commitStroke(activeStrokeRef.current);
          activeStrokeRef.current = null;
          setStrokeCount(strokeCountRef.current);
        }
      }

      // ── render display frame ──────────────────────────────────────────────
      // Copy persistent paint layer
      dCtx.clearRect(0, 0, w, h);
      dCtx.drawImage(paint, 0, 0, paint.width, paint.height, 0, 0, w, h);

      // Draw the active (in-progress) stroke live with a glow
      const active = activeStrokeRef.current;
      if (active && active.segments.length >= 2) {
        dCtx.save();
        dCtx.globalCompositeOperation = "lighter";
        dCtx.strokeStyle = `hsla(${active.hue},90%,70%,${active.alpha})`;
        dCtx.lineWidth = active.weight;
        dCtx.lineCap = "round";
        dCtx.lineJoin = "round";
        dCtx.shadowColor = `hsl(${active.hue},95%,75%)`;
        dCtx.shadowBlur = active.weight * 5;
        dCtx.beginPath();
        dCtx.moveTo(active.segments[0].x, active.segments[0].y);
        for (let i = 1; i < active.segments.length; i++) {
          dCtx.lineTo(active.segments[i].x, active.segments[i].y);
        }
        dCtx.stroke();
        dCtx.restore();

        // Bright cursor dot at tip
        dCtx.save();
        dCtx.fillStyle = `hsl(${active.hue},100%,85%)`;
        dCtx.shadowColor = `hsl(${active.hue},100%,90%)`;
        dCtx.shadowBlur = 12;
        dCtx.beginPath();
        const tip = active.segments[active.segments.length - 1];
        dCtx.arc(tip.x, tip.y, active.weight * 0.9, 0, Math.PI * 2);
        dCtx.fill();
        dCtx.restore();
      }

      // HUD update at ~8 Hz
      if (now - lastHudUpdate > 125) {
        lastHudUpdate = now;
        setCurrentNote(freq > 0 ? freqToNoteName(freq) : (mode === "demo" ? "·" : "—"));
      }
    };

    animRef.current = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animRef.current);
  }, [mode, commitStroke]);

  // ── download painting as PNG ──────────────────────────────────────────────

  const download = useCallback(() => {
    const paint = paintRef.current;
    if (!paint) return;
    const link = document.createElement("a");
    link.download = `piano-canvas-${Date.now()}.png`;
    link.href = paint.toDataURL("image/png");
    link.click();
  }, []);

  // ── clear canvas ──────────────────────────────────────────────────────────

  const clearCanvas = useCallback(() => {
    const paint = paintRef.current;
    if (!paint) return;
    const ctx = paint.getContext("2d");
    if (!ctx) return;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#050508";
    ctx.fillRect(0, 0, paint.width, paint.height);
    ctx.restore();
    strokesRef.current = [];
    strokeCountRef.current = 0;
    activeStrokeRef.current = null;
    setStrokeCount(0);
  }, []);

  // ── render ────────────────────────────────────────────────────────────────

  return (
    <div className="relative w-full" style={{ height: "calc(100vh - 3rem)" }}>
      {/* Persistent painting layer (off-screen accumulator, hidden) */}
      <canvas
        ref={paintRef}
        className="absolute inset-0"
        style={{ display: "none" }}
      />
      {/* Display canvas */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        style={{ background: "#050508" }}
      />

      {/* ── Idle screen ── */}
      {mode === "idle" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6">
          <h1 className="text-2xl md:text-3xl mb-3 tracking-tight">Piano Canvas</h1>
          <p className="text-sm text-white/55 max-w-md mb-8 leading-relaxed">
            Play something. Each note becomes a glowing brush stroke — pitch sets
            the hue, loudness the weight, duration the length. Your improvisation
            accumulates as a painting you can save.
          </p>
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
          <Link
            href="/dream"
            className="mt-12 text-[11px] text-white/30 hover:text-white/60"
          >
            ← back to dream sandbox
          </Link>
        </div>
      )}

      {/* ── Running HUD ── */}
      {mode !== "idle" && (
        <>
          {/* Top-left: note name + stroke count */}
          <div className="absolute top-4 left-4 text-[11px] tracking-widest text-white/50 space-y-1 pointer-events-none">
            <div>
              NOTE <span className="text-white font-mono text-base">{currentNote}</span>
            </div>
            <div>
              STROKES <span className="text-white">{strokeCount}</span>
            </div>
            <div className="text-white/30 text-[10px]">
              {mode === "demo" ? "demo" : "mic"}
            </div>
          </div>

          {/* Top-right: hue legend */}
          <div className="absolute top-4 right-4 pointer-events-none">
            <div
              style={{
                width: 100,
                height: 6,
                borderRadius: 3,
                background: "linear-gradient(to right, hsl(0,80%,55%), hsl(60,80%,55%), hsl(120,80%,55%), hsl(180,80%,55%), hsl(240,80%,55%), hsl(300,80%,55%), hsl(360,80%,55%))",
                opacity: 0.6,
              }}
            />
            <div className="flex justify-between text-[9px] text-white/30 mt-1">
              <span>low</span><span>high</span>
            </div>
          </div>

          {/* Bottom controls */}
          <div className="absolute bottom-4 right-4 flex flex-col items-end gap-2">
            <button
              onClick={download}
              className="text-[10px] tracking-wider uppercase text-white/55 hover:text-white border border-white/20 hover:border-white/60 px-3 py-1 rounded transition"
            >
              save PNG
            </button>
            <button
              onClick={clearCanvas}
              className="text-[10px] tracking-wider uppercase text-white/40 hover:text-white/70 border border-white/15 hover:border-white/40 px-3 py-1 rounded transition"
            >
              clear
            </button>
            <button
              onClick={stop}
              className="text-[10px] tracking-wider uppercase text-white/40 hover:text-white/70 border border-white/15 hover:border-white/40 px-3 py-1 rounded transition"
            >
              stop
            </button>
            <Link
              href="/dream"
              className="text-[10px] text-white/30 hover:text-white/60"
            >
              ← back
            </Link>
          </div>

          {/* Design notes link */}
          <a
            href="/dream/13-piano-canvas/readme"
            className="absolute bottom-4 left-4 text-[10px] text-white/25 hover:text-white/50 transition"
          >
            design notes ↗
          </a>
        </>
      )}
    </div>
  );
}
