"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import { ART_BLACK, VIOLET, INDIGO, MAGENTA } from "../_shared/palette";
import {
  detectPitch,
  freqToNorm,
  makeRng,
  VoxEngine,
  VOX_SEED,
  type Control,
  type EmittedNote,
  type EngineReadout,
} from "./engine";

// A bloom mark left on the canvas when the ensemble emits a note.
interface Bloom {
  x: number;
  y: number;
  r: number;
  life: number;
  color: string;
}

type Mode = "demo" | "mic";

export default function VoxGlyphPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);

  // Audio / mic
  const ctxRef = useRef<AudioContext | null>(null);
  const engineRef = useRef<VoxEngine | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const timeBufRef = useRef<Float32Array | null>(null);
  const modeRef = useRef<Mode>("demo");
  const audioOnRef = useRef(false);

  // Emitted notes waiting to be drawn as blooms.
  const noteQueueRef = useRef<EmittedNote[]>([]);
  const bloomsRef = useRef<Bloom[]>([]);

  // Control-derivation state
  const demoRng = useRef(makeRng(VOX_SEED ^ 0x51));
  const demoPhaseRef = useRef<number[]>([]);
  const prevLogRef = useRef<number | null>(null);
  const prevDirRef = useRef(0);
  const densityRef = useRef(0);
  const lastTurnRef = useRef(0);
  const voicedRunRef = useRef(0);
  const unvoicedRunRef = useRef(0);
  const cadencedRef = useRef(false);
  const lastPointRef = useRef<{ y: number; voiced: boolean } | null>(null);
  const startTimeRef = useRef(0);
  const lastReadoutTRef = useRef(0);

  const reducedRef = useRef(false);

  const [showNotes, setShowNotes] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const [canvasError, setCanvasError] = useState(false);
  const [singing, setSinging] = useState(false);
  const [demoPlaying, setDemoPlaying] = useState(false);
  const [readout, setReadout] = useState<EngineReadout>({
    note: "—",
    chord: "D",
    density: 0,
    energy: 0,
  });

  // Seed the demo contour's oscillator phases once.
  if (demoPhaseRef.current.length === 0) {
    const r = demoRng.current;
    demoPhaseRef.current = [r() * 6.28, r() * 6.28, r() * 6.28, r() * 6.28, r() * 6.28];
  }

  // A synthetic vocal-like contour so the page self-demos without a mic.
  const sampleDemo = useCallback((t: number) => {
    const p = demoPhaseRef.current;
    const wander = 0.55 * Math.sin(0.33 * t + p[0]) + 0.32 * Math.sin(0.128 * t + p[1]);
    const base = 300 * Math.pow(2, wander);
    const vib = 1 + 0.028 * Math.sin(8.5 * t + p[2]);
    const breath = Math.sin(0.42 * t + p[3]);
    const voiced = breath > -0.55;
    const rms = voiced ? 0.14 + 0.11 * (0.5 + 0.5 * Math.sin(0.7 * t + p[4])) : 0;
    return {
      freq: voiced ? base * vib : 0,
      rms,
      voiced,
      clarity: voiced ? 0.9 : 0,
    };
  }, []);

  // Derive the Calliphony control layer from one contour frame, fire turn /
  // cadence events, and advance the engine.
  const advanceControls = useCallback(
    (
      frame: { freq: number; rms: number; voiced: boolean },
      now: number,
      dt: number,
    ): Control => {
      const engine = engineRef.current;

      if (frame.voiced && frame.freq > 0) {
        voicedRunRef.current += dt;
        unvoicedRunRef.current = 0;
        cadencedRef.current = false;
        const logF = Math.log2(frame.freq);
        const prev = prevLogRef.current;
        if (prev !== null && dt > 0) {
          const delta = logF - prev; // octaves
          // Density: rate of pitch change (melisma dense, held tone sparse).
          const slope = Math.abs(delta) / dt; // octaves / sec
          const targetDensity = Math.min(1, slope / 3.2);
          densityRef.current = densityRef.current * 0.86 + targetDensity * 0.14;

          // Turn: a direction reversal or a leap activates the accompaniment.
          const dir = Math.sign(delta);
          const leap = Math.abs(delta) * 12; // semitones
          const reversed = dir !== 0 && prevDirRef.current !== 0 && dir !== prevDirRef.current;
          if (dir !== 0) prevDirRef.current = dir;
          if (engine && now - lastTurnRef.current > 0.32 && (leap > 2.5 || (reversed && leap > 0.7))) {
            engine.turn();
            lastTurnRef.current = now;
          }
        }
        prevLogRef.current = logF;
      } else {
        unvoicedRunRef.current += dt;
        densityRef.current *= 0.94;
        // Sustained breath after a phrase → cadence toward home, once.
        if (
          engine &&
          !cadencedRef.current &&
          voicedRunRef.current > 0.4 &&
          unvoicedRunRef.current > 0.22
        ) {
          engine.cadence();
          cadencedRef.current = true;
          voicedRunRef.current = 0;
        }
        prevLogRef.current = null;
      }

      return {
        pitchHz: frame.freq,
        voiced: frame.voiced,
        rms: frame.rms,
        density: densityRef.current,
      };
    },
    [],
  );

  // ── Main animation loop — alive on load, mic optional ──────────────────────
  const loop = useCallback(
    (tsMs: number) => {
      rafRef.current = requestAnimationFrame(loop);
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const cw = canvas.clientWidth;
      const ch = canvas.clientHeight;
      if (canvas.width !== Math.floor(cw * dpr) || canvas.height !== Math.floor(ch * dpr)) {
        canvas.width = Math.floor(cw * dpr);
        canvas.height = Math.floor(ch * dpr);
      }
      const W = canvas.width;
      const H = canvas.height;

      if (startTimeRef.current === 0) startTimeRef.current = tsMs;
      const tSec = (tsMs - startTimeRef.current) / 1000;

      // Read a contour frame from mic or the seeded demo.
      let frame: { freq: number; rms: number; voiced: boolean };
      if (modeRef.current === "mic" && analyserRef.current && timeBufRef.current && ctxRef.current) {
        const buf = timeBufRef.current;
        analyserRef.current.getFloatTimeDomainData(buf as unknown as Float32Array<ArrayBuffer>);
        const pr = detectPitch(buf, ctxRef.current.sampleRate);
        frame = { freq: pr.freq, rms: pr.rms, voiced: pr.voiced };
      } else {
        frame = sampleDemo(tSec);
      }

      const audioNow = ctxRef.current ? ctxRef.current.currentTime : tSec;
      const dt = 1 / 60;
      const control = advanceControls(frame, audioNow, dt);
      if (engineRef.current && audioOnRef.current) {
        engineRef.current.step(audioNow, control);
      }

      // ── draw ────────────────────────────────────────────────────────────
      const reduced = reducedRef.current;
      const scroll = Math.round((reduced ? 0.8 : 1.6) * dpr);

      // Scroll the whole field left, carrying blooms + ink with it.
      ctx.globalCompositeOperation = "copy";
      ctx.drawImage(canvas, -scroll, 0);
      ctx.globalCompositeOperation = "source-over";

      // Breathing dim so old ink lingers then fades (strobe-safe, slow).
      ctx.fillStyle = reduced ? "rgba(8,4,18,0.05)" : "rgba(8,4,18,0.035)";
      ctx.fillRect(W - scroll - 2 * dpr, 0, scroll + 3 * dpr, H);
      // Very gentle global fade for the whole canvas.
      ctx.fillStyle = "rgba(8,4,18,0.012)";
      ctx.fillRect(0, 0, W, H);

      const xNow = W - 6 * dpr;
      const yFromNorm = (n: number) => H * (1 - n) * 0.9 + H * 0.05;

      // Blooms — draw newly emitted notes at the leading edge.
      const queue = noteQueueRef.current;
      while (queue.length) {
        const n = queue.shift()!;
        const y = yFromNorm(freqToNorm(n.freq));
        const color =
          n.layer === "lead" ? VIOLET[300] : n.layer === "pad" ? INDIGO : MAGENTA;
        const r = (n.layer === "pad" ? 26 : n.layer === "bass" ? 20 : 12) * dpr * (0.6 + n.vel);
        bloomsRef.current.push({ x: xNow, y, r, life: 1, color });
      }
      for (const b of bloomsRef.current) {
        const a = b.life;
        const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r);
        g.addColorStop(0, hexA(b.color, 0.5 * a));
        g.addColorStop(0.5, hexA(b.color, 0.16 * a));
        g.addColorStop(1, hexA(b.color, 0));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
        ctx.fill();
        b.life -= reduced ? 0.02 : 0.03;
      }
      bloomsRef.current = bloomsRef.current.filter((b) => b.life > 0.02);

      // The vocal ink stroke itself (y = pitch, thickness = RMS).
      const prevPt = lastPointRef.current;
      if (frame.voiced && frame.freq > 0) {
        const y = yFromNorm(freqToNorm(frame.freq));
        const thick = (2 + 12 * Math.min(1, frame.rms * 3)) * dpr;
        if (prevPt && prevPt.voiced) {
          const prevX = xNow - scroll;
          const prevY = prevPt.y;
          ctx.lineCap = "round";
          ctx.lineJoin = "round";
          // Soft outer glow.
          ctx.strokeStyle = hexA(VIOLET[400], 0.22);
          ctx.lineWidth = thick + 8 * dpr;
          ctx.beginPath();
          ctx.moveTo(prevX, prevY);
          ctx.lineTo(xNow, y);
          ctx.stroke();
          // Bright core.
          ctx.strokeStyle = hexA(VIOLET[200], 0.95);
          ctx.lineWidth = thick;
          ctx.beginPath();
          ctx.moveTo(prevX, prevY);
          ctx.lineTo(xNow, y);
          ctx.stroke();
        }
        lastPointRef.current = { y, voiced: true };
      } else {
        lastPointRef.current = { y: prevPt ? prevPt.y : H / 2, voiced: false };
      }

      // Publish a light readout ~6x/sec.
      if (engineRef.current && audioOnRef.current && tSec - lastReadoutTRef.current > 0.16) {
        lastReadoutTRef.current = tSec;
        setReadout(engineRef.current.getReadout(densityRef.current));
      }
    },
    [advanceControls, sampleDemo],
  );

  // Start the rAF loop + reduced-motion detection on mount.
  useEffect(() => {
    reducedRef.current =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const canvas = canvasRef.current;
    if (canvas && !canvas.getContext("2d")) {
      setCanvasError(true);
      return;
    }
    // Paint the initial dark ground.
    if (canvas) {
      const ctx = canvas.getContext("2d");
      if (ctx) {
        canvas.width = Math.floor(canvas.clientWidth * (window.devicePixelRatio || 1));
        canvas.height = Math.floor(canvas.clientHeight * (window.devicePixelRatio || 1));
        ctx.fillStyle = ART_BLACK;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
    }
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [loop]);

  // Ensure the AudioContext + engine exist (created on a user gesture).
  const ensureEngine = useCallback(async () => {
    if (!ctxRef.current) {
      const Ctor: typeof AudioContext =
        window.AudioContext ||
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (window as any).webkitAudioContext;
      ctxRef.current = new Ctor();
    }
    if (ctxRef.current.state === "suspended") await ctxRef.current.resume();
    if (!engineRef.current) {
      engineRef.current = new VoxEngine(ctxRef.current, (n) => {
        noteQueueRef.current.push(n);
      });
    }
    audioOnRef.current = true;
  }, []);

  const handlePlayDemo = useCallback(async () => {
    setMicError(null);
    await ensureEngine();
    setDemoPlaying(true);
  }, [ensureEngine]);

  const handleSing = useCallback(async () => {
    setMicError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
      streamRef.current = stream;
      await ensureEngine();
      const ctx = ctxRef.current!;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      analyserRef.current = analyser;
      timeBufRef.current = new Float32Array(new ArrayBuffer(analyser.fftSize * 4));
      source.connect(analyser); // NOT to destination — no feedback loop.
      modeRef.current = "mic";
      setSinging(true);
      setDemoPlaying(true);
    } catch (e) {
      setMicError(
        e instanceof Error && e.message
          ? `Microphone unavailable — ${e.message}. The seeded demo keeps playing.`
          : "Microphone unavailable. The seeded demo keeps playing.",
      );
    }
  }, [ensureEngine]);

  // Full teardown on unmount.
  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      try {
        analyserRef.current?.disconnect();
      } catch {
        // ignore
      }
      analyserRef.current = null;
      engineRef.current?.dispose();
      engineRef.current = null;
      const ctx = ctxRef.current;
      ctxRef.current = null;
      if (ctx && ctx.state !== "closed") void ctx.close();
    };
  }, []);

  const primaryBtn =
    "min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90";
  const secondaryBtn =
    "min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground";
  const monoLabel = "font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground";

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-background text-foreground">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full"
        style={{ background: ART_BLACK }}
      />

      {/* Hero / controls */}
      <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-5 sm:p-8">
        <div className="pointer-events-auto max-w-xl">
          <p className={monoLabel}>VoxGlyph · calliphony of the voice</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
            Your voice is the brush.
          </h1>
          <p className="mt-2 max-w-md text-base leading-relaxed text-muted-foreground">
            Hum or sing a continuous line. Its pitch-contour becomes a
            calligraphic stroke that conducts a living ensemble — density,
            register and harmony bloom from how your voice moves.
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button className={primaryBtn} onClick={handleSing}>
              {singing ? "Singing — listening" : "Sing to compose"}
            </button>
            {!demoPlaying ? (
              <button className={secondaryBtn} onClick={handlePlayDemo}>
                Play demo
              </button>
            ) : (
              <span className={monoLabel}>
                {singing ? "mic · live" : "demo · seeded"}
              </span>
            )}
            <button className={secondaryBtn} onClick={() => setShowNotes(true)}>
              Design notes
            </button>
          </div>

          {micError && (
            <p className="mt-3 max-w-md text-sm leading-relaxed text-destructive">
              {micError}
            </p>
          )}
          {canvasError && (
            <p className="mt-3 max-w-md text-sm leading-relaxed text-destructive">
              Canvas 2D is unavailable in this browser, so the visual cannot
              render.
            </p>
          )}
        </div>

        {/* Live readout */}
        <div className="pointer-events-none flex items-end justify-between gap-4">
          <div className="flex flex-wrap gap-x-6 gap-y-1">
            <Readout label="lead" value={readout.note} />
            <Readout label="chord" value={readout.chord} />
            <Readout label="density" value={bar(readout.density)} />
            <Readout label="energy" value={bar(readout.energy)} />
          </div>
        </div>
      </div>

      {/* Design notes overlay */}
      {showNotes && (
        <div
          className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <p className={monoLabel}>Design notes</p>
            <h2 className="mt-2 text-xl font-semibold tracking-tight">
              Stroke-dynamics, not paint-to-pitch
            </h2>
            <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                Following Calliphony (Wu, Yu &amp; Xia, arXiv 2608.03040), a
                continuous performative stroke is read for its kinematics and
                used as a live control layer over a generative engine. Here the
                stroke is your <span className="text-foreground">vocal pitch-contour</span>.
              </p>
              <p>
                A hand-rolled autocorrelation extracts f0 each frame. Its shape
                steers the ensemble:{" "}
                <span className="text-foreground">how fast your pitch moves</span>{" "}
                sets note density, <span className="text-foreground">where you sing</span>{" "}
                picks the register window, <span className="text-foreground">turns and leaps</span>{" "}
                shift the harmony, and <span className="text-foreground">breath</span>{" "}
                cadences the phrase toward home.
              </p>
              <p>
                The ensemble is a distinct synth timbre (D-Dorian, seeded with
                mulberry32) so it feels like accompaniment blooming around your
                line, not a pitch-shifter. It runs alive on load with a seeded
                demo contour — a mic is optional.
              </p>
            </div>
            <button className={`mt-5 ${primaryBtn}`} onClick={() => setShowNotes(false)}>
              Close
            </button>
          </div>
        </div>
      )}

      <PrototypeNav slugs={["7096-voxglyph"]} />
    </main>
  );
}

function Readout({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </span>
      <span className="font-mono text-sm text-foreground">{value}</span>
    </div>
  );
}

// Tiny 8-cell meter rendered as text so it needs no layout.
function bar(v: number): string {
  const n = Math.round(Math.min(1, Math.max(0, v)) * 8);
  return "█".repeat(n) + "·".repeat(8 - n);
}

// Add alpha to a #rrggbb hex string → rgba().
function hexA(hex: string, a: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}
