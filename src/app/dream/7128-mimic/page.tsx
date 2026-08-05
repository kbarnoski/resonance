"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import {
  BAND_COUNT,
  BAND_FREQS,
  makeSeedTarget,
  MimicSearch,
  MimicVoice,
  mulberry32,
  PARAM_NAMES,
  type SearchState,
} from "./engine";

// --- Geometric band edges for mapping the mic FFT into our log bands --------
const BAND_EDGES: number[] = (() => {
  const edges: number[] = [];
  for (let j = 0; j <= BAND_COUNT; j++) {
    if (j === 0) edges.push(BAND_FREQS[0] / 1.06);
    else if (j === BAND_COUNT) edges.push(BAND_FREQS[BAND_COUNT - 1] * 1.06);
    else edges.push(Math.sqrt(BAND_FREQS[j - 1] * BAND_FREQS[j]));
  }
  return edges;
})();

/** Fold the analyser's linear FFT bins into our log-spaced bands (unit sum). */
function buildMicTarget(
  freqBuf: Float32Array,
  sampleRate: number,
  fftSize: number,
  out: Float32Array
): Float32Array {
  const binHz = sampleRate / fftSize;
  let sum = 0;
  for (let j = 0; j < BAND_COUNT; j++) {
    const lo = Math.floor(BAND_EDGES[j] / binHz);
    const hi = Math.min(freqBuf.length, Math.ceil(BAND_EDGES[j + 1] / binHz));
    let acc = 0;
    let n = 0;
    for (let b = Math.max(0, lo); b < hi; b++) {
      acc += Math.pow(10, freqBuf[b] / 20); // dB → linear magnitude
      n += 1;
    }
    const v = n > 0 ? acc / n : 0;
    out[j] = v;
    sum += v;
  }
  if (sum > 1e-6) {
    const inv = 1 / sum;
    for (let j = 0; j < BAND_COUNT; j++) out[j] *= inv;
  }
  return out;
}

// --- Canvas drawing ---------------------------------------------------------

const COL_BG = "#0a0a0d";
const COL_GRID = "rgba(148,140,168,0.10)";
const COL_TARGET = "#e6e2f0";
const COL_BEST = "#a78bfa";
const COL_BEST_FILL = "rgba(124,58,237,0.22)";
const COL_POP = "rgba(167,139,250,0.10)";
const COL_SPARK = "#7c3aed";

function drawScene(
  g: CanvasRenderingContext2D,
  w: number,
  h: number,
  state: SearchState,
  target: Float32Array,
  scaleRef: { v: number }
) {
  g.fillStyle = COL_BG;
  g.fillRect(0, 0, w, h);

  const padL = 14;
  const padR = 14;
  const padT = 18;
  const plotH = h * 0.7;
  const plotBottom = padT + plotH;
  const plotW = w - padL - padR;

  // Auto-scale from the current target + best peaks (smoothed).
  let peak = 1e-4;
  for (let j = 0; j < BAND_COUNT; j++) {
    if (target[j] > peak) peak = target[j];
    if (state.best.spec[j] > peak) peak = state.best.spec[j];
  }
  scaleRef.v = scaleRef.v * 0.9 + (plotH * 0.86) / peak * 0.1;
  const scale = scaleRef.v;

  const xAt = (j: number) => padL + (j / (BAND_COUNT - 1)) * plotW;
  const yAt = (v: number) => plotBottom - Math.min(plotH, v * scale);

  // Baseline grid.
  g.strokeStyle = COL_GRID;
  g.lineWidth = 1;
  for (let k = 0; k <= 4; k++) {
    const y = padT + (plotH * k) / 4;
    g.beginPath();
    g.moveTo(padL, y);
    g.lineTo(w - padR, y);
    g.stroke();
  }

  // Faint cloud of the whole population.
  g.strokeStyle = COL_POP;
  g.lineWidth = 1;
  for (const ind of state.population) {
    g.beginPath();
    for (let j = 0; j < BAND_COUNT; j++) {
      const x = xAt(j);
      const y = yAt(ind.spec[j]);
      if (j === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.stroke();
  }

  // Best candidate — filled violet curve.
  g.beginPath();
  g.moveTo(xAt(0), plotBottom);
  for (let j = 0; j < BAND_COUNT; j++) g.lineTo(xAt(j), yAt(state.best.spec[j]));
  g.lineTo(xAt(BAND_COUNT - 1), plotBottom);
  g.closePath();
  g.fillStyle = COL_BEST_FILL;
  g.fill();

  g.strokeStyle = COL_BEST;
  g.lineWidth = 2;
  g.beginPath();
  for (let j = 0; j < BAND_COUNT; j++) {
    const x = xAt(j);
    const y = yAt(state.best.spec[j]);
    if (j === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  g.stroke();

  // Target — bright dashed reference curve.
  g.strokeStyle = COL_TARGET;
  g.lineWidth = 1.6;
  g.setLineDash([4, 3]);
  g.beginPath();
  for (let j = 0; j < BAND_COUNT; j++) {
    const x = xAt(j);
    const y = yAt(target[j]);
    if (j === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  g.stroke();
  g.setLineDash([]);

  // Fitness sparkline in the lower band.
  const sparkTop = plotBottom + 20;
  const sparkH = h - sparkTop - 10;
  if (sparkH > 8 && state.fitHistory.length > 1) {
    let lo = Infinity;
    let hi = -Infinity;
    for (const f of state.fitHistory) {
      if (f < lo) lo = f;
      if (f > hi) hi = f;
    }
    const span = hi - lo || 1;
    g.strokeStyle = COL_SPARK;
    g.lineWidth = 1.6;
    g.beginPath();
    const n = state.fitHistory.length;
    for (let i = 0; i < n; i++) {
      const x = padL + (i / (n - 1)) * plotW;
      const y = sparkTop + sparkH - ((state.fitHistory[i] - lo) / span) * sparkH;
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.stroke();
  }
}

// --- Component --------------------------------------------------------------

export default function MimicPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number>(0);
  const searchRef = useRef<MimicSearch | null>(null);
  const targetRef = useRef<Float32Array>(makeSeedTarget());
  const seedTargetRef = useRef<Float32Array>(makeSeedTarget());
  const scaleRef = useRef({ v: 400 });

  const audioCtxRef = useRef<AudioContext | null>(null);
  const voiceRef = useRef<MimicVoice | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const freqBufRef = useRef<Float32Array | null>(null);
  const micTargetRef = useRef<Float32Array>(new Float32Array(BAND_COUNT));

  const [canvasOk, setCanvasOk] = useState(true);
  const [audioOn, setAudioOn] = useState(false);
  const [micOn, setMicOn] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(false);
  const [readout, setReadout] = useState<{
    gen: number;
    fit: number;
    params: number[];
  }>({ gen: 0, fit: -Infinity, params: [] });

  // --- The evolution + render loop (runs on mount, no audio required) -------
  useEffect(() => {
    searchRef.current = new MimicSearch(targetRef.current, 24);

    const canvas = canvasRef.current;
    if (!canvas) return;
    const g = canvas.getContext("2d");
    if (!g) {
      setCanvasOk(false);
      return;
    }

    let frame = 0;
    const loop = () => {
      rafRef.current = requestAnimationFrame(loop);
      const search = searchRef.current;
      if (!search) return;

      // Resize backing store to the element (DPR-aware).
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const cw = canvas.clientWidth;
      const ch = canvas.clientHeight;
      if (cw > 0 && ch > 0) {
        const bw = Math.floor(cw * dpr);
        const bh = Math.floor(ch * dpr);
        if (canvas.width !== bw || canvas.height !== bh) {
          canvas.width = bw;
          canvas.height = bh;
        }
      }

      // Choose target: live mic if running, else the seeded chord.
      const analyser = analyserRef.current;
      const ctx = audioCtxRef.current;
      const freqBuf = freqBufRef.current;
      if (analyser && ctx && freqBuf) {
        analyser.getFloatFrequencyData(
          freqBuf as unknown as Float32Array<ArrayBuffer>
        );
        targetRef.current = buildMicTarget(
          freqBuf,
          ctx.sampleRate,
          analyser.fftSize,
          micTargetRef.current
        );
      } else {
        targetRef.current = seedTargetRef.current;
      }
      search.setTarget(targetRef.current);

      // Two generations per frame — brisk but stable convergence.
      let st = search.step();
      st = search.step();

      // Drive the audible voice with the best candidate.
      voiceRef.current?.update(st.best.params);

      g.save();
      g.scale(canvas.width / (canvas.clientWidth || 1), canvas.height / (canvas.clientHeight || 1));
      drawScene(g, canvas.clientWidth, canvas.clientHeight, st, targetRef.current, scaleRef.current);
      g.restore();

      // Throttled DOM readout.
      frame += 1;
      if (frame % 5 === 0) {
        setReadout({ gen: st.generation, fit: st.best.fit, params: [...st.best.params] });
      }
    };
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafRef.current);
    };
  }, []);

  // --- Full teardown on unmount ---------------------------------------------
  const teardownAudio = useCallback(() => {
    voiceRef.current?.stop();
    voiceRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    analyserRef.current = null;
    freqBufRef.current = null;
    const ctx = audioCtxRef.current;
    audioCtxRef.current = null;
    if (ctx && ctx.state !== "closed") void ctx.close();
  }, []);

  useEffect(() => () => teardownAudio(), [teardownAudio]);

  // --- Ensure an AudioContext + audible voice exists ------------------------
  const ensureAudio = useCallback(async (): Promise<AudioContext | null> => {
    let ctx = audioCtxRef.current;
    if (!ctx) {
      const Ctor: typeof AudioContext =
        window.AudioContext ||
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (window as any).webkitAudioContext;
      if (!Ctor) return null;
      ctx = new Ctor();
      audioCtxRef.current = ctx;
      const voice = new MimicVoice(ctx, mulberry32(0x7128));
      voice.start();
      voiceRef.current = voice;
    }
    if (ctx.state === "suspended") await ctx.resume();
    setAudioOn(true);
    return ctx;
  }, []);

  // --- Primary action: chase my voice (mic) ---------------------------------
  const startMic = useCallback(async () => {
    const ctx = await ensureAudio();
    if (!ctx) {
      setMicError("Web Audio is unavailable in this browser.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
      streamRef.current = stream;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.6;
      freqBufRef.current = new Float32Array(
        new ArrayBuffer(analyser.frequencyBinCount * 4)
      );
      source.connect(analyser); // analysis only — not to destination
      analyserRef.current = analyser;
      setMicOn(true);
      setMicError(null);
    } catch (e) {
      setMicError(
        (e instanceof Error ? e.message : "Microphone blocked") +
          " — the synth keeps chasing the seeded chord instead."
      );
      setMicOn(false);
    }
  }, [ensureAudio]);

  // --- Just make sound, no mic (drives the seeded target audibly) -----------
  const startAudioOnly = useCallback(async () => {
    await ensureAudio();
  }, [ensureAudio]);

  const stopMic = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    analyserRef.current = null;
    freqBufRef.current = null;
    setMicOn(false);
  }, []);

  const fmt = (n: number) => (Math.abs(n) >= 100 ? n.toFixed(0) : n.toFixed(2));

  return (
    <main className="min-h-screen bg-background px-5 py-8 sm:px-8">
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <header className="flex flex-col gap-2">
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-primary">
            7128 · mimic
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            The synth is trying to become you
          </h1>
          <p className="max-w-xl text-base text-muted-foreground">
            A small population of synth-parameter vectors competes every
            generation; the ones whose spectrum best matches the target survive
            and mutate. Watch the violet best-candidate curve climb toward the
            pale target, and hear the timbre converge.
          </p>
        </header>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={micOn ? stopMic : startMic}
            className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            {micOn ? "Stop listening" : "Chase my voice"}
          </button>
          {!audioOn && (
            <button
              type="button"
              onClick={startAudioOnly}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Just make sound
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowNotes((s) => !s)}
            className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            {showNotes ? "Hide design notes" : "Design notes"}
          </button>
        </div>

        {micError && (
          <p className="text-base text-destructive">{micError}</p>
        )}
        {!audioOn && !micError && (
          <p className="text-sm text-muted-foreground">
            The evolution is already running against a seeded formant chord.
            Press a button (browsers need a click before audio can play) to hear
            it, or hand it your voice.
          </p>
        )}

        {showNotes && (
          <div className="rounded-lg border border-border bg-background/60 p-4 text-sm text-muted-foreground">
            <p className="mb-2 text-foreground">How it works</p>
            <p className="mb-2">
              This is <span className="text-foreground">audio-synthesizer inversion</span>:
              given a target sound, recover the synth parameters that reproduce
              it. Instead of a neural network, a browser-native{" "}
              <span className="text-foreground">differential-evolution</span>{" "}
              search runs live — 24 candidate parameter vectors, fitness =
              negative log-spectral distance over {BAND_COUNT} log-spaced bands,
              rank-biased selection, DE/rand/1 breeding, Gaussian mutation,
              elitism. No ML.
            </p>
            <p>
              Every candidate is rendered analytically (three partials → a
              formant band-pass → spectral tilt + noise), so thousands of
              evaluations per second stay cheap. All randomness is seeded with{" "}
              <span className="font-mono text-foreground">mulberry32(0x7128)</span>,
              so the run replays identically.
            </p>
          </div>
        )}

        <div className="relative">
          <canvas
            ref={canvasRef}
            className="h-[340px] w-full rounded-lg border border-border sm:h-[400px]"
            style={{ display: "block" }}
          />
          {!canvasOk && (
            <div className="absolute inset-0 flex items-center justify-center rounded-lg border border-border bg-background p-6 text-center text-base text-destructive">
              Canvas 2D is unavailable in this browser, so the spectra can&apos;t
              be drawn. The evolutionary search and audio still run.
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="generation" value={String(readout.gen)} />
          <Stat
            label="best fitness"
            value={readout.fit === -Infinity ? "—" : readout.fit.toFixed(2)}
          />
          <Stat label="target" value={micOn ? "your voice" : "seeded chord"} />
          <Stat label="population" value="24" />
        </div>

        <div className="rounded-lg border border-border bg-background/60 p-4">
          <p className="mb-3 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            best candidate parameters
          </p>
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4">
            {PARAM_NAMES.map((name, i) => (
              <div key={name} className="flex flex-col">
                <span className="font-mono text-[11px] text-muted-foreground">
                  {name}
                </span>
                <span className="font-mono text-sm text-foreground">
                  {readout.params[i] === undefined ? "—" : fmt(readout.params[i])}
                </span>
              </div>
            ))}
          </div>
        </div>

        <footer className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
          <span>
            <span className="text-foreground">Legend:</span> pale dashed =
            target · violet = best candidate · faint = population · lower line =
            best-fitness history
          </span>
        </footer>
      </div>
      <PrototypeNav slugs={["7128-mimic"]} />
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-background/60 p-3">
      <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-base text-foreground">{value}</p>
    </div>
  );
}
