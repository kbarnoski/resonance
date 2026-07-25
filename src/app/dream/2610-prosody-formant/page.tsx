"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import {
  makeDemoContour,
  trackEnvelope,
  trackF0,
  type Frame,
} from "./prosody";
import { makeSynth, type Synth } from "./synth";
import {
  buildRedaction,
  buildRibbon,
  rampColor,
  VIEW_H,
  VIEW_W,
  type RedactBlock,
  type RibbonGeom,
} from "./ribbon";

/* ------------------------------------------------------------------ *
 * 2610 — Prosody + Formant
 * A machine that listens only to HOW you speak and throws away WHAT you
 * say. Autocorrelation f0 + a coarse spectral envelope (F1/F2 + band
 * energies) are extracted per frame; a glottal source is driven through
 * a live formant BiquadFilter bank, so the playback hums your vowel-
 * melody with no words. Drawn as a scrolling SVG prosody + colour ribbon.
 * ------------------------------------------------------------------ */

const FFT_SIZE = 2048;
const BUF_FRAMES = 96; // ring-buffer length (geometry, not DOM nodes)

type Mode = "idle" | "mic" | "demo";

interface Readout {
  hz: number;
  f1: number;
  f2: number;
  voiced: boolean;
  rms: number;
}

interface AudioCtorWindow extends Window {
  webkitAudioContext?: typeof AudioContext;
}

function makeAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const w = window as AudioCtorWindow;
  const Ctor = window.AudioContext ?? w.webkitAudioContext;
  if (!Ctor) return null;
  return new Ctor();
}

const EMPTY_GEOM: RibbonGeom = {
  spinePath: "",
  centerPath: "",
  strata: [],
  headColor: rampColor(0.5),
};

export default function ProsodyFormantPage() {
  const [mode, setMode] = useState<Mode>("idle");
  const [micDenied, setMicDenied] = useState(false);
  const [noAudio, setNoAudio] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [geom, setGeom] = useState<RibbonGeom>(EMPTY_GEOM);
  const [redaction, setRedaction] = useState<RedactBlock[]>([]);
  const [readout, setReadout] = useState<Readout>({
    hz: 0,
    f1: 0,
    f2: 0,
    voiced: false,
    rms: 0,
  });

  // long-lived audio / loop handles
  const ctxRef = useRef<AudioContext | null>(null);
  const synthRef = useRef<Synth | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const framesRef = useRef<Frame[]>([]);
  const demoRef = useRef<ReturnType<typeof makeDemoContour> | null>(null);
  const demoStartRef = useRef(0);
  const tickCountRef = useRef(0);

  // scratch analysis buffers (typed to a plain ArrayBuffer so the AnalyserNode
  // read methods accept them across TS lib versions)
  const timeBufRef = useRef<Float32Array<ArrayBuffer>>(
    new Float32Array(new ArrayBuffer(FFT_SIZE * 4)),
  );
  const freqBufRef = useRef<Float32Array<ArrayBuffer>>(
    new Float32Array(new ArrayBuffer((FFT_SIZE / 2) * 4)),
  );

  const pushFrame = useCallback((f: Frame) => {
    const buf = framesRef.current;
    buf.push(f);
    if (buf.length > BUF_FRAMES) buf.shift();
  }, []);

  const renderFromBuffer = useCallback(() => {
    const buf = framesRef.current;
    setGeom(buildRibbon(buf));
    setRedaction(buildRedaction(buf));
    const head = buf[buf.length - 1];
    if (head) {
      setReadout({
        hz: head.hz,
        f1: head.f1,
        f2: head.f2,
        voiced: head.voiced,
        rms: head.rms,
      });
    }
  }, []);

  const stopLoop = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const teardown = useCallback(() => {
    stopLoop();
    synthRef.current?.silence();
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    analyserRef.current = null;
  }, [stopLoop]);

  // ── mic analysis loop ───────────────────────────────────────────────────────
  const runMicLoop = useCallback(() => {
    const analyser = analyserRef.current;
    const ctx = ctxRef.current;
    const synth = synthRef.current;
    if (!analyser || !ctx || !synth) return;

    const time = timeBufRef.current;
    const freq = freqBufRef.current;

    const tick = () => {
      analyser.getFloatTimeDomainData(time);
      analyser.getFloatFrequencyData(freq);

      const pitch = trackF0(time, ctx.sampleRate);
      const env = trackEnvelope(freq, ctx.sampleRate, FFT_SIZE);
      const voiced = pitch.hz > 0 && pitch.clarity > 0.55 && pitch.rms > 0.008;

      const frame: Frame = {
        t: performance.now(),
        voiced,
        hz: voiced ? pitch.hz : 0,
        clarity: pitch.clarity,
        rms: Math.min(1, pitch.rms * 3.2),
        centroid: env.centroid,
        f1: env.f1,
        f2: env.f2,
        bands: env.bands,
      };
      pushFrame(frame);
      synth.push(frame);

      tickCountRef.current++;
      if (tickCountRef.current % 2 === 0) renderFromBuffer();

      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [pushFrame, renderFromBuffer]);

  // ── seeded demo loop (no mic) ────────────────────────────────────────────────
  const runDemoLoop = useCallback(() => {
    const synth = synthRef.current;
    if (!synth) return;
    if (!demoRef.current) demoRef.current = makeDemoContour(0x2610);
    demoStartRef.current = performance.now();

    const tick = () => {
      const demo = demoRef.current;
      if (!demo) return;
      const clock = performance.now();
      const tSec = (clock - demoStartRef.current) / 1000;
      const frame = demo.frameAt(tSec, clock);
      pushFrame(frame);
      synth.push(frame);

      tickCountRef.current++;
      if (tickCountRef.current % 2 === 0) renderFromBuffer();

      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [pushFrame, renderFromBuffer]);

  const ensureSynth = useCallback((): Synth | null => {
    if (!ctxRef.current) {
      const ctx = makeAudioContext();
      if (!ctx) {
        setNoAudio(true);
        return null;
      }
      ctxRef.current = ctx;
    }
    const ctx = ctxRef.current;
    if (ctx.state === "suspended") void ctx.resume();
    if (!synthRef.current) synthRef.current = makeSynth(ctx);
    return synthRef.current;
  }, []);

  const startMic = useCallback(async () => {
    setMicDenied(false);
    const synth = ensureSynth();
    if (!synth || !ctxRef.current) return;
    const ctx = ctxRef.current;

    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices?.getUserMedia
    ) {
      setMicDenied(true);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = FFT_SIZE;
      analyser.smoothingTimeConstant = 0.4;
      src.connect(analyser);
      analyserRef.current = analyser;

      stopLoop();
      framesRef.current = [];
      setMode("mic");
      runMicLoop();
    } catch {
      setMicDenied(true);
    }
  }, [ensureSynth, runMicLoop, stopLoop]);

  const startDemo = useCallback(() => {
    const synth = ensureSynth();
    if (!synth) return;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    analyserRef.current = null;
    stopLoop();
    framesRef.current = [];
    setMode("demo");
    runDemoLoop();
  }, [ensureSynth, runDemoLoop, stopLoop]);

  const stopAll = useCallback(() => {
    teardown();
    setMode("idle");
    setReadout({ hz: 0, f1: 0, f2: 0, voiced: false, rms: 0 });
  }, [teardown]);

  // cleanup on unmount
  useEffect(() => {
    return () => {
      teardown();
      synthRef.current?.dispose();
      synthRef.current = null;
      if (ctxRef.current) {
        void ctxRef.current.close();
        ctxRef.current = null;
      }
    };
  }, [teardown]);

  const hz = readout.hz;
  const running = mode !== "idle";

  return (
    <main className="min-h-screen bg-background px-6 py-10 text-foreground sm:px-10">
      <div className="mx-auto flex max-w-3xl flex-col gap-6 pb-24">
        {/* hero */}
        <header className="flex flex-col gap-3">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            2610 · prosody + formant
          </p>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            The melody and colour of your voice, with the words thrown away
          </h1>
          <p className="text-base text-muted-foreground">
            What if a machine listened only to <em>how</em> you speak — the
            pitch, rhythm, loudness and vowel-colour — and never <em>what</em>{" "}
            you say? It hums back a wordless human made only of your prosody.
          </p>
        </header>

        {/* controls */}
        <div className="flex flex-wrap items-center gap-3">
          {!running || mode === "demo" ? (
            <button
              type="button"
              onClick={startMic}
              className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Start mic
            </button>
          ) : (
            <button
              type="button"
              onClick={stopAll}
              className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Stop
            </button>
          )}
          <button
            type="button"
            onClick={mode === "demo" ? stopAll : startDemo}
            className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            {mode === "demo" ? "Stop demo" : "Play demo"}
          </button>
          <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            {mode === "mic"
              ? "listening"
              : mode === "demo"
                ? "seeded demo"
                : "idle"}
          </span>
        </div>

        {micDenied && (
          <p className="text-sm text-destructive">
            Microphone unavailable or denied. Press{" "}
            <span className="font-medium">Play demo</span> to hear and see the
            seeded prosody instead.
          </p>
        )}
        {noAudio && (
          <p className="text-sm text-destructive">
            Web Audio is not available in this browser, so there is no sound to
            play.
          </p>
        )}

        {/* stage */}
        <figure className="flex flex-col gap-2">
          <svg
            viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
            className="w-full rounded-lg border border-border bg-[#0b0710]"
            role="img"
            aria-label="Scrolling ribbon of vocal prosody and vowel colour"
          >
            {/* discarded-words redaction stream */}
            <text
              x={14}
              y={26}
              className="font-mono"
              fontSize={13}
              letterSpacing={3}
              fill="#6b6478"
            >
              WORDS · DISCARDED
            </text>
            {redaction.map((b) => (
              <rect
                key={b.id}
                x={b.x}
                y={34}
                width={b.w}
                height={9}
                rx={2}
                fill="#5b5568"
                opacity={b.opacity}
              />
            ))}

            {/* kept: colour strata (spectral envelope) */}
            {geom.strata.map((s, i) => (
              <path key={i} d={s.path} fill={s.color} stroke="none" />
            ))}

            {/* kept: f0 spine (thickness = loudness) */}
            {geom.spinePath && (
              <path d={geom.spinePath} fill="url(#spineFill)" opacity={0.9} />
            )}
            {geom.centerPath && (
              <path
                d={geom.centerPath}
                fill="none"
                stroke="#f5edff"
                strokeWidth={1.4}
                strokeOpacity={0.85}
                strokeLinejoin="round"
              />
            )}

            <text
              x={14}
              y={VIEW_H - 12}
              className="font-mono"
              fontSize={13}
              letterSpacing={3}
              fill="#8a7fb0"
            >
              PROSODY + COLOUR · KEPT
            </text>

            <defs>
              <linearGradient id="spineFill" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0" stopColor="#a78bfa" stopOpacity={0.35} />
                <stop offset="1" stopColor="#e879f9" stopOpacity={0.75} />
              </linearGradient>
            </defs>
          </svg>

          {/* readouts */}
          <figcaption className="flex flex-wrap gap-x-6 gap-y-1 font-mono text-xs text-muted-foreground">
            <span>
              f0{" "}
              <span className="text-foreground">
                {hz > 0 ? `${hz.toFixed(1)} Hz` : "—"}
              </span>
            </span>
            <span>
              F1{" "}
              <span className="text-foreground">
                {readout.voiced ? `${Math.round(readout.f1)} Hz` : "—"}
              </span>
            </span>
            <span>
              F2{" "}
              <span className="text-foreground">
                {readout.voiced ? `${Math.round(readout.f2)} Hz` : "—"}
              </span>
            </span>
            <span>
              state{" "}
              <span className="text-foreground">
                {running ? (readout.voiced ? "voiced" : "unvoiced") : "—"}
              </span>
            </span>
            <span className="flex items-center gap-1">
              vowel
              <span
                className="inline-block h-3 w-3 rounded-sm align-middle"
                style={{ backgroundColor: geom.headColor }}
              />
            </span>
          </figcaption>
        </figure>

        {/* notes affordance */}
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setNotesOpen(true)}
            className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:text-foreground"
          >
            Read the design notes
          </button>
        </div>
      </div>

      {notesOpen && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm"
          onClick={() => setNotesOpen(false)}
        >
          <div
            className="max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-semibold tracking-tight">
              Design notes
            </h2>
            <div className="mt-3 flex flex-col gap-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                Shipping voice AI tracks the <em>lexical</em> stream and is
                largely deaf to prosody (arXiv:2606.26083, “Real-Time Voice AI
                Hears but Does Not Listen”). This inverts that: it keeps only the{" "}
                <em>how</em> and discards the words entirely.
              </p>
              <p>
                Per frame it estimates f0 by autocorrelation with parabolic
                interpolation — continuous, microtonal Hz, never snapped to a
                scale — and reduces the FFT magnitude spectrum to a coarse
                envelope (F1/F2 peaks + log-spaced band energies) that carries
                vowel colour.
              </p>
              <p>
                Resynthesis follows Fant’s source-filter model (
                <em>Acoustic Theory of Speech Production</em>, 1960): a glottal
                buzz at the tracked pitch is driven through a live bank of
                band-pass formant resonators, so /a/ vs /i/ vs /u/ survive
                without the word. Unvoiced frames pass filtered breath noise
                through the same bank.
              </p>
              <p>
                It is the mirror image of anonymisation work like
                arXiv:2603.06079 “StreamVoiceAnon+”, which keeps how you feel and
                discards who you are; here we keep how you speak and your vowel
                colour, and discard what you say.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setNotesOpen(false)}
              className="mt-5 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Close
            </button>
          </div>
        </div>
      )}

      <Link
        href="/dream"
        className="fixed left-4 top-4 z-30 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:text-foreground"
      >
        ← dream lab
      </Link>

      <PrototypeNav slugs={["2610-prosody-formant"]} />
    </main>
  );
}
