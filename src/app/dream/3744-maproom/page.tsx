"use client";

/**
 * 3744 · MAPROOM — the operator monitor of a many-surface Resonance install.
 *
 * A flattened grid of every projection surface as a live tile, plus a
 * Resolume-style cue bar. The load-bearing idea: all tiles read ONE
 * deterministic shared "now" (mulberry32 seed + a beat clock), so two browsers
 * given the same seed + synced wall-clock render the identical frame. This one
 * browser is therefore a preview of a synchronized N-wall / N-phone install.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CUES,
  GRID_COLS,
  GRID_ROWS,
  SURFACES,
  chordForBar,
  drawSurface,
  makeSurfaceConst,
  midiToHz,
  mulberry32,
  pluckMidiForEighth,
  rampColor,
  type SurfaceConst,
} from "./wall";

const SEED = 0x3744; // the shared seed — swap this + sync the clock to pair devices
const AUTO_SEED = 0x3744;

interface Clock {
  beat: number;
  lastPerf: number;
}

interface AutoStep {
  cue: number;
  hold: number; // ms
}

export default function MaproomPage() {
  const [started, setStarted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cueIdx, setCueIdx] = useState(0);
  const [master, setMaster] = useState(0.85);
  const [soloIdx, setSoloIdx] = useState<number | null>(null);
  const [showNotes, setShowNotes] = useState(false);
  const [auto, setAuto] = useState(true);
  const [status, setStatus] = useState("Idle — press Start.");
  const [bpm, setBpm] = useState(CUES[0].bpm);

  // refs read by the render/audio loops without triggering re-renders
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const acRef = useRef<AudioContext | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const freqRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const padOscRef = useRef<OscillatorNode[]>([]);
  const padGainRef = useRef<GainNode | null>(null);
  const padFilterRef = useRef<BiquadFilterNode | null>(null);
  const rafRef = useRef<number>(0);

  const clockRef = useRef<Clock>({ beat: 0, lastPerf: 0 });
  const nextEighthRef = useRef<number>(0);
  const lastBarRef = useRef<number>(-1);
  const cueRef = useRef<number>(0);
  const masterRef = useRef<number>(0.85);
  const soloRef = useRef<number | null>(null);
  const autoRef = useRef<boolean>(true);
  const autoSeqRef = useRef<AutoStep[]>([]);
  const autoStepRef = useRef<number>(0);
  const autoSwitchAtRef = useRef<number>(0);
  const constsRef = useRef<SurfaceConst[]>(
    SURFACES.map((_, i) => makeSurfaceConst(SEED, i)),
  );
  const bandsRef = useRef<number[]>(new Array(16).fill(0));

  useEffect(() => {
    cueRef.current = cueIdx;
  }, [cueIdx]);
  useEffect(() => {
    masterRef.current = master;
  }, [master]);
  useEffect(() => {
    soloRef.current = soloIdx;
  }, [soloIdx]);

  /* ── human takes over from autopilot ──────────────────────────────── */
  const markHuman = useCallback(() => {
    if (autoRef.current) {
      autoRef.current = false;
      setAuto(false);
      setStatus("AUTO → YOU · you have the room");
    }
  }, []);

  const selectCue = useCallback(
    (i: number, human: boolean) => {
      if (human) markHuman();
      cueRef.current = i;
      setCueIdx(i);
      setBpm(CUES[i].bpm);
    },
    [markHuman],
  );

  /* ── audio: one deterministic hit ─────────────────────────────────── */
  const playKick = useCallback((when: number, gain: number) => {
    const ac = acRef.current;
    const dest = masterGainRef.current;
    if (!ac || !dest) return;
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(125, when);
    osc.frequency.exponentialRampToValueAtTime(45, when + 0.12);
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(gain, when + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 0.26);
    osc.connect(g);
    g.connect(dest);
    osc.start(when);
    osc.stop(when + 0.3);
  }, []);

  const playPluck = useCallback((midi: number, when: number, gain: number) => {
    const ac = acRef.current;
    const dest = masterGainRef.current;
    if (!ac || !dest) return;
    const osc = ac.createOscillator();
    const g = ac.createGain();
    const hz = midiToHz(midi);
    osc.type = "triangle";
    osc.frequency.setValueAtTime(hz, when);
    // slight continuous glide up — protects continuous, non-quantized pitch
    osc.frequency.exponentialRampToValueAtTime(hz * 1.008, when + 0.18);
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(gain, when + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 0.28);
    osc.connect(g);
    g.connect(dest);
    osc.start(when);
    osc.stop(when + 0.32);
  }, []);

  /* ── the shared clock + scheduler + render, all one loop ──────────── */
  const runFrame = useCallback(
    (perfNow: number) => {
      const ac = acRef.current;
      const canvas = canvasRef.current;
      const analyser = analyserRef.current;
      const freq = freqRef.current;
      const ctx = canvas?.getContext("2d");
      if (!ac || !canvas || !ctx || !analyser || !freq) return;

      const cue = CUES[cueRef.current];
      const beatMs = 60000 / cue.bpm;
      const clock = clockRef.current;
      // advance the ONE shared clock — beat is a pure integral of wall time
      clock.beat += (perfNow - clock.lastPerf) / beatMs;
      clock.lastPerf = perfNow;
      const beat = clock.beat;

      /* autopilot: walk the seeded cue sequence on a performance.now timer */
      if (autoRef.current && perfNow >= autoSwitchAtRef.current) {
        const seq = autoSeqRef.current;
        const step = seq[autoStepRef.current % seq.length];
        cueRef.current = step.cue;
        setCueIdx(step.cue);
        setBpm(CUES[step.cue].bpm);
        autoStepRef.current += 1;
        autoSwitchAtRef.current = perfNow + step.hold;
      }

      /* audio scheduler — schedule eighth-notes anchored to the shared beat */
      const beatSec = beatMs / 1000;
      const lookahead = 0.3;
      // if the tab was backgrounded and the clock leapt, skip stale eighths
      // forward rather than firing a burst of past-due notes
      if (nextEighthRef.current * 0.5 < beat - 2) {
        nextEighthRef.current = Math.floor(beat * 2);
        lastBarRef.current = Math.floor(beat / 4);
      }
      while ((nextEighthRef.current * 0.5 - beat) * beatSec < lookahead) {
        const eighth = nextEighthRef.current;
        const beatVal = eighth * 0.5;
        const when = ac.currentTime + (beatVal - beat) * beatSec;
        const safeWhen = Math.max(when, ac.currentTime + 0.01);
        const isBeat = eighth % 2 === 0;
        const bar = Math.floor(beatVal / 4);

        if (bar !== lastBarRef.current) {
          lastBarRef.current = bar;
          const chord = chordForBar(SEED, bar);
          const pad = padOscRef.current;
          chord.forEach((m, i) => {
            const o = pad[i];
            if (o)
              o.frequency.setTargetAtTime(midiToHz(m), safeWhen, 0.09);
          });
          if (padGainRef.current)
            padGainRef.current.gain.setTargetAtTime(
              cue.padLevel * 0.14,
              safeWhen,
              0.15,
            );
          if (padFilterRef.current)
            padFilterRef.current.frequency.setTargetAtTime(
              420 + cue.intensity * 2200,
              safeWhen,
              0.2,
            );
        }

        if (isBeat && cue.kick) playKick(safeWhen, 0.9);
        const rng = mulberry32(
          (SEED ^ Math.imul(eighth, 0x2c1b3c6d)) >>> 0,
        );
        if (rng() < cue.density) {
          const midi = pluckMidiForEighth(SEED, eighth);
          playPluck(midi, safeWhen, 0.12 + cue.intensity * 0.06);
        }
        nextEighthRef.current += 1;
      }

      /* analyse the SAME audio the viewer hears → 16 bands */
      analyser.getByteFrequencyData(freq);
      const bands = bandsRef.current;
      const binPerBand = Math.floor(freq.length / bands.length);
      let levelSum = 0;
      for (let b = 0; b < bands.length; b++) {
        let s = 0;
        for (let j = 0; j < binPerBand; j++) s += freq[b * binPerBand + j];
        const v = s / (binPerBand * 255);
        bands[b] = v;
        levelSum += v;
      }
      const level = levelSum / bands.length;

      /* ── draw the wall ──────────────────────────────────────────── */
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const W = canvas.width / dpr;
      const H = canvas.height / dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = "#050308";
      ctx.fillRect(0, 0, W, H);

      const masterI = masterRef.current;
      const intensity = masterI * cue.intensity;
      const solo = soloRef.current;

      const drawOne = (
        i: number,
        x: number,
        y: number,
        tw: number,
        th: number,
      ) => {
        ctx.save();
        ctx.beginPath();
        ctx.rect(x, y, tw, th);
        ctx.clip();
        ctx.translate(x, y);
        drawSurface(SURFACES[i].pattern, {
          ctx,
          w: tw,
          h: th,
          beat,
          bands,
          level,
          k: constsRef.current[i],
          intensity,
          hot: cue.hot[i],
        });
        ctx.restore();
        // tile chrome (drawn in canvas — raw color allowed in art)
        ctx.strokeStyle = cue.hot[i]
          ? rampColor(0.6, 0.5)
          : "rgba(120,110,150,0.18)";
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 0.5, y + 0.5, tw - 1, th - 1);
        ctx.font = "10px ui-monospace, monospace";
        ctx.fillStyle = "rgba(230,225,245,0.72)";
        ctx.fillText(SURFACES[i].name, x + 7, y + 15);
        if (cue.hot[i]) {
          ctx.fillStyle = rampColor(0.7, 0.9);
          ctx.beginPath();
          ctx.arc(x + tw - 8, y + 9, 2.5, 0, Math.PI * 2);
          ctx.fill();
        }
      };

      if (solo != null) {
        drawOne(solo, 0, 0, W, H);
      } else {
        const tw = W / GRID_COLS;
        const th = H / GRID_ROWS;
        for (let i = 0; i < SURFACES.length; i++) {
          const col = i % GRID_COLS;
          const row = Math.floor(i / GRID_COLS);
          drawOne(i, col * tw, row * th, tw, th);
        }
      }

      /* ── the shared-now proof: downbeat sweep + beat flash across ALL ── */
      const posInBar = ((beat % 4) + 4) % 4; // 0..4
      const sweepX = (posInBar / 4) * W;
      const grad = ctx.createLinearGradient(sweepX - 60, 0, sweepX + 60, 0);
      grad.addColorStop(0, "rgba(167,139,250,0)");
      grad.addColorStop(0.5, `rgba(196,181,253,${0.14 * masterI})`);
      grad.addColorStop(1, "rgba(167,139,250,0)");
      ctx.fillStyle = grad;
      ctx.fillRect(sweepX - 60, 0, 120, H);

      const frac = ((beat % 1) + 1) % 1;
      const onBeat = 1 - frac;
      const isDown = posInBar < 1;
      const flash = Math.pow(onBeat, 3) * (isDown ? 0.16 : 0.06) * masterI;
      if (flash > 0.002) {
        ctx.fillStyle = `rgba(196,181,253,${flash})`;
        ctx.fillRect(0, 0, W, H);
      }

      rafRef.current = requestAnimationFrame(runFrame);
    },
    [playKick, playPluck],
  );

  /* ── resize handling ──────────────────────────────────────────────── */
  useEffect(() => {
    if (!started) return;
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    if (!canvas.getContext("2d")) {
      setError("Canvas2D is unavailable in this browser.");
      return;
    }
    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const r = wrap.getBoundingClientRect();
      canvas.width = Math.max(1, Math.floor(r.width * dpr));
      canvas.height = Math.max(1, Math.floor(r.height * dpr));
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [started]);

  /* ── keyboard: cues 1..N, S = clear solo, Esc = clear solo ───────── */
  useEffect(() => {
    if (!started) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key >= "1" && e.key <= String(CUES.length)) {
        selectCue(parseInt(e.key, 10) - 1, true);
      } else if (e.key === "Escape" || e.key.toLowerCase() === "s") {
        markHuman();
        setSoloIdx(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [started, selectCue, markHuman]);

  /* ── start (AudioContext created INSIDE the gesture) ──────────────── */
  const start = useCallback(() => {
    if (started) return;
    let ac: AudioContext;
    try {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      ac = new Ctor();
    } catch {
      setError("Web Audio is unavailable in this browser.");
      return;
    }
    acRef.current = ac;

    const masterGain = ac.createGain();
    masterGain.gain.value = 0.9;
    const analyser = ac.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.72;
    masterGain.connect(analyser);
    analyser.connect(ac.destination);
    masterGainRef.current = masterGain;
    analyserRef.current = analyser;
    freqRef.current = new Uint8Array(
      new ArrayBuffer(analyser.frequencyBinCount),
    );

    // continuous pad bed: 3 detuned oscillators → lowpass → master
    const padGain = ac.createGain();
    padGain.gain.value = 0.05;
    const filter = ac.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 600;
    filter.Q.value = 0.7;
    padGain.connect(filter);
    filter.connect(masterGain);
    const chord = chordForBar(SEED, 0);
    const pad: OscillatorNode[] = [];
    for (let i = 0; i < 3; i++) {
      const o = ac.createOscillator();
      o.type = i === 0 ? "sawtooth" : "triangle";
      o.frequency.value = midiToHz(chord[i]);
      o.detune.value = (i - 1) * 5;
      o.connect(padGain);
      o.start();
      pad.push(o);
    }
    padOscRef.current = pad;
    padGainRef.current = padGain;
    padFilterRef.current = filter;

    // seeded autopilot sequence (mulberry32(0x3744), performance.now timing)
    const rng = mulberry32(AUTO_SEED);
    const seq: AutoStep[] = [];
    for (let i = 0; i < 10; i++) {
      seq.push({
        cue: Math.floor(rng() * CUES.length),
        hold: 4600 + rng() * 3600,
      });
    }
    // open on a deliberate arc so the first ~20s reads clearly
    seq[0] = { cue: 0, hold: 5200 };
    seq[1] = { cue: 1, hold: 5200 };
    seq[2] = { cue: 2, hold: 6000 };
    autoSeqRef.current = seq;
    autoStepRef.current = 0;

    const now = performance.now();
    clockRef.current = { beat: 0, lastPerf: now };
    nextEighthRef.current = 0;
    lastBarRef.current = -1;
    autoSwitchAtRef.current = now; // switch to seq[0] immediately
    autoRef.current = true;
    setAuto(true);
    cueRef.current = 0;
    setCueIdx(0);
    setBpm(CUES[0].bpm);
    setStarted(true);
    setStatus("AUTO — self-demo running · press 1–5 or click to take over");

    if (ac.state === "suspended") void ac.resume();
    rafRef.current = requestAnimationFrame(runFrame);
  }, [started, runFrame]);

  /* ── full teardown on unmount ─────────────────────────────────────── */
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      padOscRef.current.forEach((o) => {
        try {
          o.stop();
        } catch {
          /* already stopped */
        }
      });
      const ac = acRef.current;
      if (ac && ac.state !== "closed") void ac.close();
      acRef.current = null;
    };
  }, []);

  const cue = CUES[cueIdx];

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      {/* hero */}
      <div className="mb-5">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          3744 · Operator Monitor
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
          Maproom
        </h1>
        <p className="mt-2 max-w-2xl text-base text-muted-foreground">
          Every projection surface of a venue install as one live wall — each
          tile a different audio-reactive pattern, all locked to one
          deterministic shared &ldquo;now.&rdquo; Same seed + synced clock ⇒
          any number of screens render the identical frame.
        </p>
      </div>

      {error && (
        <p className="mb-4 text-base text-destructive" role="alert">
          {error}
        </p>
      )}

      {!started ? (
        <div className="flex flex-col items-start gap-4">
          <button
            onClick={start}
            className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Start the wall
          </button>
          <p className="font-mono text-xs text-muted-foreground">{status}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {/* the video wall */}
          <div
            ref={wrapRef}
            className="relative aspect-video w-full overflow-hidden rounded-lg border border-border bg-[#050308]"
          >
            <canvas
              ref={canvasRef}
              onPointerDown={(e) => {
                markHuman();
                if (soloRef.current != null) {
                  setSoloIdx(null);
                  return;
                }
                const wrap = wrapRef.current;
                if (!wrap) return;
                const r = wrap.getBoundingClientRect();
                const col = Math.floor(
                  ((e.clientX - r.left) / r.width) * GRID_COLS,
                );
                const row = Math.floor(
                  ((e.clientY - r.top) / r.height) * GRID_ROWS,
                );
                const i = row * GRID_COLS + col;
                if (i >= 0 && i < SURFACES.length) setSoloIdx(i);
              }}
              className="h-full w-full cursor-pointer"
            />
            <div className="pointer-events-none absolute right-2 top-2 flex items-center gap-2 rounded-md border border-border bg-background/70 px-2 py-1 backdrop-blur-sm">
              <span
                className={`font-mono text-[10px] uppercase tracking-[0.14em] ${
                  auto ? "text-primary" : "text-muted-foreground"
                }`}
              >
                {auto ? "AUTO" : "YOU"}
              </span>
              <span className="font-mono text-[10px] text-muted-foreground">
                {bpm} BPM
              </span>
              {soloIdx != null && (
                <span className="font-mono text-[10px] text-muted-foreground">
                  SOLO · {SURFACES[soloIdx].name}
                </span>
              )}
            </div>
          </div>

          {/* operator bar */}
          <div className="flex flex-col gap-3 rounded-lg border border-border bg-background/60 p-3">
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                Cue list
              </span>
              <span className="font-mono text-[10px] text-muted-foreground">
                seed 0x{SEED.toString(16)} · shared now
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {CUES.map((c, i) => {
                const active = i === cueIdx;
                return (
                  <button
                    key={c.id}
                    onClick={() => selectCue(i, true)}
                    className={
                      active
                        ? "min-h-[44px] rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                        : "min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    }
                  >
                    <span className="font-mono text-[10px] opacity-70">
                      {i + 1}
                    </span>{" "}
                    {c.name}
                  </button>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center gap-4 pt-1">
              <label className="flex items-center gap-2">
                <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                  Master
                </span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={master}
                  onChange={(e) => {
                    markHuman();
                    setMaster(parseFloat(e.target.value));
                  }}
                  className="accent-primary"
                  aria-label="Master intensity"
                />
                <span className="w-8 font-mono text-[10px] text-muted-foreground">
                  {Math.round(master * 100)}%
                </span>
              </label>
              <span className="font-mono text-[10px] text-muted-foreground">
                scene: {cue.name} · {cue.hot.filter(Boolean).length}/
                {SURFACES.length} surfaces hot
              </span>
              {soloIdx != null && (
                <button
                  onClick={() => {
                    markHuman();
                    setSoloIdx(null);
                  }}
                  className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  ← back to wall
                </button>
              )}
            </div>
            <p className="font-mono text-[10px] text-muted-foreground">
              {status} · click a tile to solo it
            </p>
          </div>
        </div>
      )}

      {/* design notes trigger */}
      <button
        onClick={() => setShowNotes(true)}
        className="fixed bottom-16 right-3 z-30 rounded-md border border-border bg-background/70 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground backdrop-blur-sm transition-colors hover:bg-accent hover:text-foreground"
      >
        Design notes
      </button>

      {showNotes && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-h-[80vh] max-w-lg overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-2xl font-semibold tracking-tight">
              Maproom — design notes
            </h2>
            <div className="mt-4 space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                <strong className="text-foreground">The provocation.</strong>{" "}
                What if a Resonance install ran across many surfaces at once —
                N projection walls, N phones on N walls — all showing{" "}
                <em>different</em> audio-reactive content but locked to one
                deterministic shared &ldquo;now,&rdquo; so the whole room
                breathes together?
              </p>
              <p>
                <strong className="text-foreground">The shared now.</strong>{" "}
                Every tile reads one beat clock:{" "}
                <code className="font-mono text-xs">
                  beat += Δt / beatMs
                </code>
                . All content is a pure function of{" "}
                <code className="font-mono text-xs">
                  (surfaceIndex, beat, seed)
                </code>{" "}
                via <code className="font-mono text-xs">mulberry32</code> — no
                per-tile randomness that isn&rsquo;t derived from the shared
                seed. The downbeat sweep crossing the wall every bar and the
                beat flash prove every tile shares one clock. Two browsers with
                the same seed + a synced wall-clock would render the identical
                frame — that is the multi-wall / N-phone substrate.
              </p>
              <p>
                <strong className="text-foreground">The audio.</strong> A
                seeded, BPM-locked Web Audio bed (continuous-pitch diatonic pad
                + deterministic pluck/kick) is analysed live, so the tiles
                react to the same sound you hear, in lockstep with the clock.
              </p>
              <p>
                <strong className="text-foreground">Operator bar.</strong>{" "}
                Resolume-style cue list (keys 1–5 / buttons) remaps which
                surfaces are hot, the palette energy and the tempo. A master
                intensity fader, a BPM readout, and click-a-tile-to-solo for
                previewing one wall.
              </p>
              <p>
                <strong className="text-foreground">References.</strong>{" "}
                Resolume Arena (VJ mixer: audio analysis + BPM sync + surface
                mapping + cue list) and teamLab Borderless (many synchronized
                surfaces forming one world).
              </p>
              <p>
                <strong className="text-foreground">Faked vs real.</strong> The
                deterministic-function-of-shared-time is real and reproducible.
                No networking is implemented — the point is that networking is
                unnecessary to demonstrate the substrate: give two devices the
                same seed + synced clock and they converge without talking.
              </p>
            </div>
            <button
              onClick={() => setShowNotes(false)}
              className="mt-5 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
