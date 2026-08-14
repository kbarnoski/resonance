"use client";

/*
 * Spectral Hold — a phase-vocoder spectral-freeze instrument.
 *
 * The microphone is the primary instrument. A continuous STFT analyses your
 * voice or piano; a tap on FREEZE snapshots the current magnitude spectrum and
 * rings it forever via overlap-add IFFT with per-bin frozen phase-advance and
 * identity phase-locking (see pv.ts and README.md). Frozen instants stack into
 * a self-choir you conduct. Near-black Canvas 2D; the sound is the art.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { FreezeEngine, HALF, MAX_LAYERS } from "./pv";
import { VIOLET, ART_BLACK, NEUTRAL } from "../_shared/palette";
import { README } from "./readme-text";

type MicState = "idle" | "starting" | "live" | "fallback" | "denied";

/** A slowly drifting vowel-like source used when the mic is unavailable, so the
 * page is never dead — silent to the speakers, but analysable and freezable. */
function createVowelSource(ctx: AudioContext): { node: AudioNode; stop: () => void } {
  const out = ctx.createGain();
  out.gain.value = 0.9;
  // Formant-ish partials around a ~146 Hz fundamental (an "ah"-shaped stack).
  const partials = [146, 292, 438, 620, 780, 1100, 1460, 2200];
  const oscs: OscillatorNode[] = [];
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 0.07; // gentle formant drift
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 8;
  lfo.connect(lfoGain);
  partials.forEach((f, i) => {
    const o = ctx.createOscillator();
    o.type = "sawtooth";
    o.frequency.value = f;
    const g = ctx.createGain();
    g.gain.value = 0.5 / (i + 1);
    lfoGain.connect(o.frequency);
    o.connect(g).connect(out);
    o.start();
    oscs.push(o);
  });
  lfo.start();
  return {
    node: out,
    stop: () => {
      oscs.forEach((o) => {
        try {
          o.stop();
        } catch {
          /* noop */
        }
      });
      try {
        lfo.stop();
      } catch {
        /* noop */
      }
    },
  };
}

const F_MIN = 55;
const F_MAX = 6000;

export default function SpectralHoldPage() {
  const [micState, setMicState] = useState<MicState>("idle");
  const [count, setCount] = useState(0);
  const [master, setMaster] = useState(0.9);
  const [showNotes, setShowNotes] = useState(false);

  const ctxRef = useRef<AudioContext | null>(null);
  const engineRef = useRef<FreezeEngine | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const vowelStopRef = useRef<(() => void) | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number>(0);
  const specRef = useRef<Float32Array>(new Float32Array(HALF + 1));

  const started = micState === "live" || micState === "fallback";

  // ---- draw loop --------------------------------------------------------
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx2d = canvas.getContext("2d");
    if (!ctx2d) return;

    const freqToX = (f: number, w: number) => {
      const t = (Math.log(Math.max(f, F_MIN)) - Math.log(F_MIN)) / (Math.log(F_MAX) - Math.log(F_MIN));
      return Math.max(0, Math.min(1, t)) * w;
    };

    const render = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      const w = Math.max(1, Math.floor(rect.width * dpr));
      const h = Math.max(1, Math.floor(rect.height * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      const now = performance.now() / 1000;

      ctx2d.fillStyle = ART_BLACK;
      ctx2d.fillRect(0, 0, w, h);

      const engine = engineRef.current;

      // faint log-frequency gridlines
      ctx2d.strokeStyle = "rgba(120,110,150,0.06)";
      ctx2d.lineWidth = 1;
      [110, 220, 440, 880, 1760, 3520].forEach((f) => {
        const x = freqToX(f, w);
        ctx2d.beginPath();
        ctx2d.moveTo(x, 0);
        ctx2d.lineTo(x, h);
        ctx2d.stroke();
      });

      if (engine) {
        // ---- frozen layers as persistent horizontal shelves ----
        const layers = engine.getLayerViews();
        const shelfTop = h * 0.1;
        const shelfSpan = h * 0.62;
        const rowH = shelfSpan / MAX_LAYERS;
        layers.forEach((L, idx) => {
          const y = shelfTop + idx * rowH + rowH * 0.5;
          // shelf baseline
          ctx2d.strokeStyle = "rgba(139,92,246,0.10)";
          ctx2d.lineWidth = 1;
          ctx2d.beginPath();
          ctx2d.moveTo(0, y);
          ctx2d.lineTo(w, y);
          ctx2d.stroke();
          // thin bright lines at each partial, glowing + slowly shimmering
          for (const p of L.peaks) {
            const x = freqToX(p.freq, w);
            const shimmer = 0.72 + 0.28 * Math.sin(now * 1.3 + p.freq * 0.013 + idx);
            const a = Math.min(1, p.mag * L.gain * 1.4) * shimmer;
            if (a < 0.02) continue;
            const len = rowH * (0.35 + 0.55 * p.mag);
            const grad = ctx2d.createLinearGradient(0, y - len, 0, y + len);
            grad.addColorStop(0, "rgba(196,181,253,0)");
            grad.addColorStop(0.5, VIOLET[300]);
            grad.addColorStop(1, "rgba(196,181,253,0)");
            ctx2d.globalAlpha = a;
            ctx2d.strokeStyle = grad;
            ctx2d.lineWidth = 1.2 * dpr;
            ctx2d.beginPath();
            ctx2d.moveTo(x, y - len);
            ctx2d.lineTo(x, y + len);
            ctx2d.stroke();
          }
          ctx2d.globalAlpha = 1;
        });

        // ---- live spectrum: faint moving line along the bottom ----
        const level = engine.getLiveSpectrum(specRef.current);
        const spec = specRef.current;
        const base = h * 0.94;
        const amp = h * 0.28;
        ctx2d.beginPath();
        let startedPath = false;
        for (let k = 1; k <= HALF; k++) {
          const f = (k / HALF) * (engine.ctx.sampleRate / 2);
          if (f < F_MIN || f > F_MAX) continue;
          const x = freqToX(f, w);
          const y = base - Math.pow(spec[k], 0.65) * amp;
          if (!startedPath) {
            ctx2d.moveTo(x, y);
            startedPath = true;
          } else {
            ctx2d.lineTo(x, y);
          }
        }
        ctx2d.strokeStyle = started
          ? `rgba(167,139,250,${0.25 + Math.min(0.5, level * 4)})`
          : "rgba(167,139,250,0.18)";
        ctx2d.lineWidth = 1.2 * dpr;
        ctx2d.stroke();
      }

      rafRef.current = requestAnimationFrame(render);
    };
    rafRef.current = requestAnimationFrame(render);
    return () => cancelAnimationFrame(rafRef.current);
  }, [started]);

  // ---- unmount cleanup --------------------------------------------------
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      vowelStopRef.current?.();
      engineRef.current?.dispose();
      streamRef.current?.getTracks().forEach((t) => t.stop());
      const c = ctxRef.current;
      if (c && c.state !== "closed") c.close().catch(() => {});
    };
  }, []);

  const start = useCallback(async () => {
    if (started || micState === "starting") return;
    setMicState("starting");
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AC();
    ctxRef.current = ctx;
    if (ctx.state === "suspended") await ctx.resume().catch(() => {});
    const engine = new FreezeEngine(ctx);
    engine.setMaster(master);
    engineRef.current = engine;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      streamRef.current = stream;
      const src = ctx.createMediaStreamSource(stream);
      src.connect(engine.input);
      setMicState("live");
    } catch {
      // graceful degrade: drive the engine with a silent vowel synth
      const vowel = createVowelSource(ctx);
      vowel.node.connect(engine.input);
      vowelStopRef.current = vowel.stop;
      setMicState("fallback");
    }
  }, [started, micState, master]);

  const freeze = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.freeze();
    setCount(engine.activeCount());
  }, []);

  const releaseLast = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.releaseLast();
    setCount(engine.activeCount());
  }, []);

  const clear = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.clear();
    setCount(0);
  }, []);

  // spacebar = freeze
  useEffect(() => {
    if (!started) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space" && !e.repeat) {
        e.preventDefault();
        freeze();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [started, freeze]);

  const onMaster = useCallback((v: number) => {
    setMaster(v);
    engineRef.current?.setMaster(v);
  }, []);

  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-background text-foreground">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" style={{ background: NEUTRAL[0] }} />

      {/* corner: design notes */}
      <button
        type="button"
        onClick={() => setShowNotes(true)}
        className="absolute right-4 top-4 z-10 text-sm text-muted-foreground underline decoration-dotted underline-offset-4 hover:text-foreground"
      >
        Read the design notes
      </button>

      <div className="relative z-10 flex min-h-screen flex-col justify-between p-6 sm:p-10">
        <header className="max-w-xl">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Spectral Hold</h1>
          <p className="mt-2 text-base text-muted-foreground">
            Freeze a single instant of your own voice or piano into an endless, still chord — then stack
            those frozen instants into a self-choir you conduct.
          </p>
        </header>

        <div className="max-w-xl space-y-4">
          {micState === "fallback" && (
            <p className="text-base text-destructive">
              Microphone unavailable — running a silent vowel demo instead. You can still freeze it.
            </p>
          )}
          {micState === "denied" && (
            <p className="text-base text-destructive">Microphone was denied. Reload and allow access to play your own voice.</p>
          )}

          <div className="flex flex-wrap items-center gap-3">
            {!started ? (
              <button
                type="button"
                onClick={start}
                disabled={micState === "starting"}
                className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
              >
                {micState === "starting" ? "Starting…" : "Start mic"}
              </button>
            ) : (
              <button
                type="button"
                onClick={freeze}
                className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Freeze <span className="opacity-70">(space)</span>
              </button>
            )}
            <button
              type="button"
              onClick={releaseLast}
              disabled={!started || count === 0}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40"
            >
              Release last
            </button>
            <button
              type="button"
              onClick={clear}
              disabled={!started || count === 0}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40"
            >
              Clear
            </button>
          </div>

          <div className="flex items-center gap-6 text-sm text-muted-foreground">
            <span>
              Held layers: <span className="text-foreground">{count}</span> / {MAX_LAYERS}
            </span>
            {started && (
              <label className="flex items-center gap-2">
                <span>Volume</span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={master}
                  onChange={(e) => onMaster(parseFloat(e.target.value))}
                  className="accent-primary"
                />
              </label>
            )}
          </div>
        </div>
      </div>

      {showNotes && (
        <div
          className="fixed inset-0 z-20 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-h-[80vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-semibold tracking-tight text-foreground">Design notes</h2>
              <button
                type="button"
                onClick={() => setShowNotes(false)}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                Close
              </button>
            </div>
            <pre className="whitespace-pre-wrap text-base leading-relaxed text-muted-foreground">{README}</pre>
          </div>
        </div>
      )}
    </main>
  );
}
