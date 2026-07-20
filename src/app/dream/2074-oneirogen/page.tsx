"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from "react";

// ── Oneirogen ──────────────────────────────────────────────────────────────
// A single dial α interpolates the whole audio-visual field from
//   α=0  "wake"  — bottom-up, sensory-driven: the phosphene flow TRACKS the
//                  actual sound (dropped file or built-in pad) via an FFT.
//   α=1  "sleep" — top-down, internally-generated: the field DETACHES and
//                  replays a slowly-mutating curl-noise memory of what it heard,
//                  while the sound crossfades to a generative "replay" pad.
// Everything is Web Audio + Canvas 2D. No strobe: all luminance changes are
// slow (<1 Hz) drifts; phosphenes fade gently and the field never flashes.

type Phase = "idle" | "running" | "error";

// A single drifting phosphene stream.
interface Stream {
  x: number;
  y: number;
  hue: number;
  life: number;
  seed: number;
}

// Live per-frame band energies read from the analyser (the "world").
interface Bands {
  bass: number;
  mid: number;
  high: number;
  overall: number;
}

// The engine's mutable state, kept out of React so rAF never re-renders.
interface Engine {
  raf: number;
  last: number;
  t: number;
  streams: Stream[];
  bands: Bands;
  // Circular memory of recent band energies — recorded at wake, replayed at sleep.
  memory: Float32Array;
  memWrite: number;
  memRead: number;
  // Slowly drifting phases for the autonomous ("dream") potential field.
  ph1: number;
  ph2: number;
  ph3: number;
  lumPhase: number;
}

interface AudioRig {
  ctx: AudioContext;
  analyser: AnalyserNode;
  freq: Uint8Array<ArrayBuffer>;
  liveBus: GainNode; // world sound → faded out by α
  replayBus: GainNode; // dream sound → faded in by α
  builtinGain: GainNode; // autonomous ambient pad
  fileGain: GainNode; // dropped track (optional)
  fileSource: AudioBufferSourceNode | null;
  replayOscs: OscillatorNode[];
  stop: () => void;
}

const MEM_LEN = 256;
const STREAM_COUNT = 220;

function makeStream(w: number, h: number): Stream {
  return {
    x: Math.random() * w,
    y: Math.random() * h,
    hue: 250 + Math.random() * 45, // indigo → violet → soft lilac
    life: Math.random(),
    seed: Math.random() * 1000,
  };
}

// Scalar potential for the SENSORY field — its amplitudes swell with the
// live audio bands, so the flow visibly answers to the sound at α≈0.
function sensoryPotential(nx: number, ny: number, t: number, b: Bands): number {
  return (
    Math.sin(nx * 1.3 + t * 0.06 + b.bass * 5) * (0.5 + b.bass * 2.4) +
    Math.sin(ny * 1.7 - t * 0.05 + b.mid * 5) * (0.45 + b.mid * 2.2) +
    Math.sin((nx + ny) * 0.9 + t * 0.04 + b.high * 6) * (0.4 + b.high * 1.8)
  );
}

// Scalar potential for the AUTONOMOUS field — phases drift on their own and
// its swell is fed by the replayed MEMORY, not by any live input.
function autoPotential(
  nx: number,
  ny: number,
  t: number,
  e: number,
  ph1: number,
  ph2: number,
  ph3: number,
): number {
  return (
    Math.sin(nx * 1.05 + t * 0.014 + ph1) * (0.55 + e * 1.6) +
    Math.sin(ny * 1.35 + t * 0.011 + ph2) * (0.5 + e * 1.4) +
    Math.sin((nx - ny) * 0.8 + t * 0.009 + ph3) * 0.5
  );
}

// Blended potential at a point (world → dream by α), sampled to derive a
// divergence-free curl flow (perpendicular gradient of the scalar field).
function potentialAt(
  x: number,
  y: number,
  eng: Engine,
  memEnergy: number,
  alpha: number,
): number {
  const nx = x * 0.0038;
  const ny = y * 0.0038;
  const s = sensoryPotential(nx, ny, eng.t, eng.bands);
  const a = autoPotential(
    nx,
    ny,
    eng.t,
    memEnergy,
    eng.ph1,
    eng.ph2,
    eng.ph3,
  );
  return s * (1 - alpha) + a * alpha;
}

export default function OneirogenPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<Engine | null>(null);
  const audioRef = useRef<AudioRig | null>(null);
  const alphaRef = useRef(0);
  const rampRef = useRef(false);
  const rampPhaseRef = useRef(0);
  const stateThrottleRef = useRef(0);

  const [phase, setPhase] = useState<Phase>("idle");
  const [alpha, setAlpha] = useState(0);
  const [autoRamp, setAutoRamp] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [showNotes, setShowNotes] = useState(false);

  const setAlphaBoth = useCallback((v: number) => {
    alphaRef.current = v;
    setAlpha(v);
  }, []);

  // ── Build the audio graph (called from inside the Begin click handler) ────
  const startAudio = useCallback((): AudioRig | null => {
    if (typeof window === "undefined") return null;
    let ctx: AudioContext;
    try {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      ctx = new Ctor();
    } catch {
      return null;
    }

    const master = ctx.createGain();
    master.gain.value = 0.9;
    master.connect(ctx.destination);

    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.82;
    const freq = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount));

    // World bus: the live sound the wake-field tracks. Fades out with α.
    const liveBus = ctx.createGain();
    liveBus.gain.value = 1;
    liveBus.connect(master);
    liveBus.connect(analyser); // analyser always reads the actual world sound

    // Dream bus: the internally generated replay. Fades in with α.
    const replayBus = ctx.createGain();
    replayBus.gain.value = 0;
    replayBus.connect(master);

    // Built-in autonomous ambient pad — soft evolving chord (the default world).
    const builtinGain = ctx.createGain();
    builtinGain.gain.value = 0;
    const padFilter = ctx.createBiquadFilter();
    padFilter.type = "lowpass";
    padFilter.frequency.value = 900;
    padFilter.Q.value = 0.6;
    builtinGain.connect(padFilter);
    padFilter.connect(liveBus);
    builtinGain.gain.setTargetAtTime(0.16, ctx.currentTime, 3);

    const padFreqs = [110, 164.81, 220, 277.18];
    padFreqs.forEach((f, i) => {
      const osc = ctx.createOscillator();
      osc.type = i % 2 === 0 ? "sine" : "triangle";
      osc.frequency.value = f;
      const g = ctx.createGain();
      g.gain.value = 0.25;
      // Slow detune LFO so the pad drifts (sub-Hz — never rhythmic).
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.03 + i * 0.017;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 4 + i;
      lfo.connect(lfoGain);
      lfoGain.connect(osc.detune);
      osc.connect(g);
      g.connect(builtinGain);
      osc.start();
      lfo.start();
    });

    // Optional dropped track routes here (ducks the built-in pad when present).
    const fileGain = ctx.createGain();
    fileGain.gain.value = 0;
    fileGain.connect(liveBus);

    // Generative replay pad — a slightly-detuned voicing of the same harmony,
    // its detune nudged by the memory buffer so the "dream" sound self-mutates.
    const replayOscs: OscillatorNode[] = [];
    const replayFreqs = [82.41, 123.47, 164.81, 246.94];
    const replayFilter = ctx.createBiquadFilter();
    replayFilter.type = "lowpass";
    replayFilter.frequency.value = 700;
    replayFilter.connect(replayBus);
    replayFreqs.forEach((f, i) => {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = f;
      const g = ctx.createGain();
      g.gain.value = 0.22;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.019 + i * 0.013;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 6 + i * 2;
      lfo.connect(lfoGain);
      lfoGain.connect(osc.detune);
      osc.connect(g);
      g.connect(replayFilter);
      osc.start();
      lfo.start();
      replayOscs.push(osc);
    });

    const stop = () => {
      try {
        master.gain.setTargetAtTime(0, ctx.currentTime, 0.4);
      } catch {
        /* context may be closing */
      }
    };

    return {
      ctx,
      analyser,
      freq,
      liveBus,
      replayBus,
      builtinGain,
      fileGain,
      fileSource: null,
      replayOscs,
      stop,
    };
  }, []);

  // ── The render + audio-crossfade loop ─────────────────────────────────────
  const step = useCallback(
    (now: number) => {
      const eng = engineRef.current;
      const canvas = canvasRef.current;
      if (!eng || !canvas) return;
      const ctx2d = canvas.getContext("2d");
      if (!ctx2d) return;

      const dt = Math.min(0.05, (now - eng.last) / 1000 || 0.016);
      eng.last = now;
      eng.t += dt;

      // Autonomous α ramp: a very slow triangle drift between world and dream.
      if (rampRef.current) {
        rampPhaseRef.current += dt / 70; // ~140 s round trip
        const tri = Math.abs(((rampPhaseRef.current % 2) + 2) % 2 - 1);
        alphaRef.current = tri;
        stateThrottleRef.current += dt;
        if (stateThrottleRef.current > 0.12) {
          stateThrottleRef.current = 0;
          setAlpha(tri);
        }
      }
      const a = alphaRef.current;

      // ── Read the world (analyser) into three bands ─────────────────────────
      const rig = audioRef.current;
      if (rig) {
        rig.analyser.getByteFrequencyData(rig.freq);
        const n = rig.freq.length;
        let bass = 0;
        let mid = 0;
        let high = 0;
        const bassEnd = Math.floor(n * 0.08);
        const midEnd = Math.floor(n * 0.35);
        for (let i = 0; i < n; i++) {
          const v = rig.freq[i] / 255;
          if (i < bassEnd) bass += v;
          else if (i < midEnd) mid += v;
          else high += v;
        }
        bass /= bassEnd || 1;
        mid /= midEnd - bassEnd || 1;
        high /= n - midEnd || 1;
        // Ease toward the new values so the field drifts rather than jumps.
        eng.bands.bass += (bass - eng.bands.bass) * 0.2;
        eng.bands.mid += (mid - eng.bands.mid) * 0.2;
        eng.bands.high += (high - eng.bands.high) * 0.2;
        eng.bands.overall =
          (eng.bands.bass + eng.bands.mid + eng.bands.high) / 3;

        // Crossfade sound: world out, dream in, smoothed.
        const t = rig.ctx.currentTime;
        rig.liveBus.gain.setTargetAtTime(1 - a * 0.92, t, 0.3);
        rig.replayBus.gain.setTargetAtTime(a * 0.85, t, 0.3);
      }

      // ── Memory: record at wake, replay at sleep ────────────────────────────
      let memEnergy: number;
      if (a < 0.5) {
        // Recording the world's energy into the loop.
        eng.memory[eng.memWrite] = eng.bands.overall;
        eng.memWrite = (eng.memWrite + 1) % MEM_LEN;
        memEnergy = eng.bands.overall;
      } else {
        // Replaying the remembered motif, cycling the buffer autonomously.
        eng.memRead = (eng.memRead + 0.35) % MEM_LEN;
        memEnergy = eng.memory[Math.floor(eng.memRead)] || 0.15;
        // Nudge the replay pad's colour from the same memory value.
        const r = audioRef.current;
        if (r) {
          const detune = (memEnergy - 0.2) * 40;
          r.replayOscs.forEach((osc, i) => {
            osc.detune.setTargetAtTime(
              detune + (i - 1.5) * 3,
              r.ctx.currentTime,
              1.5,
            );
          });
        }
      }
      // Blend the driving energy across the handoff so it is never a hard cut.
      const driveEnergy = eng.bands.overall * (1 - a) + memEnergy * a;

      // Drift the autonomous phases (slow — sub-Hz, safe).
      eng.ph1 += dt * 0.05;
      eng.ph2 += dt * 0.037;
      eng.ph3 += dt * 0.028;
      eng.lumPhase += dt * 0.9; // ~0.14 Hz global luminance breath

      const w = canvas.width;
      const h = canvas.height;

      // Gentle trail fade (never clears — phosphenes dissolve softly).
      ctx2d.globalCompositeOperation = "source-over";
      ctx2d.fillStyle = "rgba(8, 6, 18, 0.10)";
      ctx2d.fillRect(0, 0, w, h);

      // Slow global luminance drift (<1 Hz) — the whole field breathes.
      const lum = 0.62 + 0.32 * Math.sin(eng.lumPhase * 0.16);

      ctx2d.globalCompositeOperation = "lighter";
      const eps = 3;
      const flowScale = 26 + a * 10;

      for (const s of eng.streams) {
        // Curl of the blended potential = perpendicular gradient.
        const p = potentialAt(s.x, s.y, eng, memEnergy, a);
        const px = potentialAt(s.x + eps, s.y, eng, memEnergy, a);
        const py = potentialAt(s.x, s.y + eps, eng, memEnergy, a);
        const gx = (px - p) / eps;
        const gy = (py - p) / eps;
        const vx = gy;
        const vy = -gx;

        s.x += vx * flowScale * dt * 6;
        s.y += vy * flowScale * dt * 6;
        s.life -= dt * 0.14;

        // Wrap softly around the edges.
        if (s.x < -20) s.x = w + 20;
        if (s.x > w + 20) s.x = -20;
        if (s.y < -20) s.y = h + 20;
        if (s.y > h + 20) s.y = -20;

        // Respawn faded streams as new half-emerging forms.
        if (s.life <= 0) {
          s.x = Math.random() * w;
          s.y = Math.random() * h;
          s.hue = 250 + Math.random() * 45;
          s.life = 0.6 + Math.random() * 0.6;
          s.seed = Math.random() * 1000;
        }

        // Brightness tracks the driving energy (world at wake, memory at sleep),
        // modulated by each stream's own slow fade and the global breath.
        const emerge = Math.sin(s.life * Math.PI); // fade in and out over life
        const bright =
          (0.06 + driveEnergy * 0.9) * emerge * lum;
        if (bright <= 0.004) continue;

        // Hue drifts toward lilac as we sink into the dream.
        const hue = s.hue + a * 18 + Math.sin(eng.t * 0.1 + s.seed) * 6;
        const radius = 14 + driveEnergy * 40 + a * 10;
        const g = ctx2d.createRadialGradient(s.x, s.y, 0, s.x, s.y, radius);
        g.addColorStop(0, `hsla(${hue}, 85%, 72%, ${bright})`);
        g.addColorStop(0.5, `hsla(${hue + 10}, 80%, 55%, ${bright * 0.4})`);
        g.addColorStop(1, "hsla(265, 80%, 40%, 0)");
        ctx2d.fillStyle = g;
        ctx2d.beginPath();
        ctx2d.arc(s.x, s.y, radius, 0, Math.PI * 2);
        ctx2d.fill();
      }

      eng.raf = requestAnimationFrame(step);
    },
    [],
  );

  // ── Canvas sizing (device-pixel-ratio aware) ──────────────────────────────
  const sizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    canvas.height = Math.max(1, Math.floor(rect.height * dpr));
  }, []);

  const begin = useCallback(async () => {
    if (phase === "running") return;
    if (typeof window === "undefined") return;
    const canvas = canvasRef.current;
    if (!canvas) {
      setPhase("error");
      return;
    }
    if (!canvas.getContext("2d")) {
      setPhase("error");
      return;
    }

    sizeCanvas();

    // Audio is optional — the visual field must run even with no audio device.
    const rig = startAudio();
    if (rig) {
      audioRef.current = rig;
      try {
        if (rig.ctx.state === "suspended") await rig.ctx.resume();
      } catch {
        /* headless / no device — visuals still run */
      }
    }

    const w = canvas.width;
    const h = canvas.height;
    engineRef.current = {
      raf: 0,
      last: performance.now(),
      t: 0,
      streams: Array.from({ length: STREAM_COUNT }, () => makeStream(w, h)),
      bands: { bass: 0.1, mid: 0.1, high: 0.1, overall: 0.1 },
      memory: new Float32Array(MEM_LEN).fill(0.15),
      memWrite: 0,
      memRead: 0,
      ph1: Math.random() * 10,
      ph2: Math.random() * 10,
      ph3: Math.random() * 10,
      lumPhase: 0,
    };

    setPhase("running");
    engineRef.current.raf = requestAnimationFrame(step);
  }, [phase, sizeCanvas, startAudio, step]);

  // Handle a dropped / picked audio file — fully client-side, no network.
  const loadFile = useCallback(async (file: File) => {
    setFileError(null);
    const rig = audioRef.current;
    if (!rig) {
      setFileError("Press Begin first, then drop a track.");
      return;
    }
    try {
      const buf = await file.arrayBuffer();
      const decoded = await rig.ctx.decodeAudioData(buf.slice(0));
      // Replace any prior source.
      if (rig.fileSource) {
        try {
          rig.fileSource.stop();
        } catch {
          /* already stopped */
        }
      }
      const src = rig.ctx.createBufferSource();
      src.buffer = decoded;
      src.loop = true;
      src.connect(rig.fileGain);
      src.start();
      rig.fileSource = src;
      const t = rig.ctx.currentTime;
      rig.fileGain.gain.setTargetAtTime(0.9, t, 1.2);
      rig.builtinGain.gain.setTargetAtTime(0.03, t, 1.2); // duck the pad
      setFileName(file.name);
    } catch {
      setFileError("Could not decode that file. Try a WAV, MP3, or OGG.");
    }
  }, []);

  const onDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files?.[0];
      if (file) void loadFile(file);
    },
    [loadFile],
  );

  const onPick = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) void loadFile(file);
    },
    [loadFile],
  );

  const onSlider = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      if (rampRef.current) {
        rampRef.current = false;
        setAutoRamp(false);
      }
      setAlphaBoth(Number(e.target.value));
    },
    [setAlphaBoth],
  );

  const toggleRamp = useCallback(() => {
    setAutoRamp((prev) => {
      const next = !prev;
      rampRef.current = next;
      if (next) rampPhaseRef.current = alphaRef.current; // start from current α
      return next;
    });
  }, []);

  // Keep the canvas sized to its box while running.
  useEffect(() => {
    if (phase !== "running") return;
    const onResize = () => sizeCanvas();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [phase, sizeCanvas]);

  // Full teardown on unmount.
  useEffect(() => {
    return () => {
      const eng = engineRef.current;
      if (eng?.raf) cancelAnimationFrame(eng.raf);
      const rig = audioRef.current;
      if (rig) {
        rig.stop();
        if (rig.fileSource) {
          try {
            rig.fileSource.stop();
          } catch {
            /* already stopped */
          }
        }
        const ctx = rig.ctx;
        window.setTimeout(() => {
          if (ctx.state !== "closed") ctx.close().catch(() => undefined);
        }, 600);
      }
      audioRef.current = null;
      engineRef.current = null;
    };
  }, []);

  const pct = Math.round(alpha * 100);
  const stateLabel =
    alpha < 0.15 ? "wake" : alpha > 0.85 ? "sleep" : "hypnagogia";

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-background text-foreground">
      {/* The phosphene field. */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full"
        style={{ background: "#08060f" }}
      />

      {/* Drop target overlay (whole stage accepts a track once running). */}
      {phase === "running" && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          className={`absolute inset-0 transition-colors ${
            dragOver ? "bg-primary/20" : "bg-transparent"
          }`}
        />
      )}

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 p-6">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Oneirogen
        </h1>
        <p className="mt-1 max-w-xl text-base text-muted-foreground">
          One dial hands the wheel from the world to the dream — watch and hear
          perception detach from what is actually there.
        </p>
      </div>

      {/* Read the design notes — corner affordance. */}
      <button
        type="button"
        onClick={() => setShowNotes(true)}
        className="absolute right-6 top-6 z-20 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        Read the design notes
      </button>

      {/* ── Idle: primary Begin ────────────────────────────────────────── */}
      {phase !== "running" && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4">
          <button
            type="button"
            onClick={() => void begin()}
            className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Begin
          </button>
          <p className="max-w-sm text-center text-sm text-muted-foreground">
            Starts silent. Begin resumes audio and lights a soft ambient pad —
            then drift the α dial from wake to sleep.
          </p>
          {phase === "error" && (
            <p className="text-sm text-destructive">
              This device could not provide a 2D canvas.
            </p>
          )}
        </div>
      )}

      {/* ── Running: controls ──────────────────────────────────────────── */}
      {phase === "running" && (
        <div className="absolute inset-x-0 bottom-0 z-20 flex flex-col gap-4 p-6">
          <div className="mx-auto w-full max-w-2xl rounded-lg border border-border bg-background/70 p-5 backdrop-blur-sm">
            <div className="flex items-baseline justify-between">
              <label
                htmlFor="alpha"
                className="text-sm font-medium text-foreground"
              >
                α — wake ↔ sleep · world ↔ dream
              </label>
              <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                α {pct}% · {stateLabel}
              </span>
            </div>
            <input
              id="alpha"
              type="range"
              min={0}
              max={1}
              step={0.001}
              value={alpha}
              onChange={onSlider}
              className="mt-3 h-2 w-full cursor-pointer appearance-none rounded-full bg-muted accent-primary"
            />
            <div className="mt-1 flex justify-between font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              <span>wake · sensory</span>
              <span>sleep · replay</span>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={toggleRamp}
                aria-pressed={autoRamp}
                className={`min-h-[44px] rounded-md border px-4 text-sm transition-colors ${
                  autoRamp
                    ? "border-primary bg-primary/20 text-foreground"
                    : "border-border bg-background/60 text-muted-foreground hover:bg-accent hover:text-foreground"
                }`}
              >
                {autoRamp ? "Drifting under…" : "Let it drift under"}
              </button>

              <label className="min-h-[44px] cursor-pointer rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground inline-flex items-center">
                {fileName ? "Change track" : "Drop a track (optional)"}
                <input
                  type="file"
                  accept="audio/*"
                  onChange={onPick}
                  className="hidden"
                />
              </label>

              <span className="text-sm text-muted-foreground">
                {fileName
                  ? `Tracking: ${fileName}`
                  : "or drop an audio file anywhere"}
              </span>
            </div>
            {fileError && (
              <p className="mt-2 text-sm text-destructive">{fileError}</p>
            )}
          </div>
        </div>
      )}

      {/* ── Design notes modal ─────────────────────────────────────────── */}
      {showNotes && (
        <div
          className="absolute inset-0 z-30 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-semibold tracking-tight text-foreground">
              Design notes
            </h2>
            <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                A single parameter <span className="text-foreground">α</span>{" "}
                interpolates the whole field from{" "}
                <span className="text-foreground">wake</span> (α=0, bottom-up,
                sensory-driven inference) to{" "}
                <span className="text-foreground">sleep</span> (α=1, top-down,
                internally-generated replay) — the{" "}
                <span className="text-primary">oneirogen hypothesis</span>{" "}
                (eLife 105968, Version of Record 2026-04-21) and the Wake–Sleep
                algorithm&rsquo;s α interpolation.
              </p>
              <p>
                At α≈0 an FFT of the actual sound — a dropped track or the
                built-in ambient pad — steers a curl-noise flow field, so the
                phosphenes visibly track what you hear. As α rises the field
                detaches: it replays a memory buffer of the energy it recorded,
                drifting on its own slow phases, while the sound crossfades to a
                generative replay pad. The handoff is a smooth morph, not a cut.
              </p>
              <p>
                Phenomenology: soft, drifting closed-eye phosphene fields at
                sleep onset — forms half-emerge and dissolve, gentle and
                boundless.
              </p>
              <p className="text-foreground">
                Safety: no strobe, no flicker. All luminance changes are slow
                (&lt;1 Hz) drifts; phosphenes fade in and out and the field is
                never flashed.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowNotes(false)}
              className="mt-5 min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
