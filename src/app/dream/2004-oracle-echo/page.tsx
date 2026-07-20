"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { prefersReducedMotion } from "../_shared/psych/safeFlicker";
import { createField, type FieldRenderer } from "./gl";
import {
  OracleAudio,
  MicInput,
  centroidToValence,
  resampleTo16k,
  rmsOf,
} from "./audio";
import { OracleML, cleanTranscript, isMeaningful } from "./ml";

type Path = "idle" | "loading" | "full" | "spectral" | "demo";

interface WordToken {
  id: number;
  text: string;
  x: number; // 0..1 across the field
  y: number; // 0..1 down the field
  warmth: number; // 0..1 sentiment color
}

// The oracle's own murmurs when it has no transcript to answer with (demo mode,
// or the spectral fallback). Evocative single words — never presented as speech
// recognition; the status line always names the active path.
const MURMURS = [
  "listen",
  "room",
  "light",
  "tone",
  "warm",
  "near",
  "echo",
  "hold",
  "drift",
  "breathe",
  "answer",
  "still",
];

const WORD_LIFE_MS = 3200;
const BURST_AT_MS = 1500;

function warmthColor(warmth: number, alpha: number): string {
  // cool-slate (negative) → warm amber (positive); canvas-art color, not chrome
  const r = Math.round((0.4 + warmth * 0.6) * 255);
  const g = Math.round((0.55 + warmth * 0.3) * 255);
  const b = Math.round((0.95 - warmth * 0.5) * 255);
  return `rgba(${r},${g},${b},${alpha})`;
}

export default function OracleEchoPage() {
  const [phase, setPhase] = useState<"idle" | "running">("idle");
  const [status, setStatus] = useState<string>("");
  const [pathKind, setPathKind] = useState<Path>("idle");
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"webgl2" | "canvas2d">("webgl2");
  const [words, setWords] = useState<WordToken[]>([]);
  const [lastLine, setLastLine] = useState<string>("");
  const [showNotes, setShowNotes] = useState(false);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<FieldRenderer | null>(null);
  const audioRef = useRef<OracleAudio | null>(null);
  const micRef = useRef<MicInput | null>(null);
  const mlRef = useRef<OracleML | null>(null);

  const rafRef = useRef<number>(0);
  const pathRef = useRef<Path>("idle");
  const driveCur = useRef({ v: 0.5, a: 0.4 });
  const driveTarget = useRef({ v: 0.5, a: 0.4 });
  const levelRef = useRef(0);
  const reducedRef = useRef(false);
  const wordIdRef = useRef(0);
  const startedRef = useRef(false);

  const transcribeTimerRef = useRef<number | undefined>(undefined);
  const murmurTimerRef = useRef<number | undefined>(undefined);
  const wordTimersRef = useRef<Set<number>>(new Set());

  // reduced-motion preference
  useEffect(() => {
    reducedRef.current = prefersReducedMotion();
  }, []);

  const setPath = useCallback((p: Path, label: string) => {
    pathRef.current = p;
    setPathKind(p);
    setStatus(label);
  }, []);

  // spawn a luminous word that drifts, fades, and dissolves into a mote burst
  const spawnWord = useCallback((text: string, warmth: number) => {
    const id = wordIdRef.current++;
    const x = 0.12 + Math.random() * 0.76;
    const y = 0.16 + Math.random() * 0.44;
    setWords((prev) => [...prev.slice(-9), { id, text, x, y, warmth }]);

    const burstT = window.setTimeout(() => {
      rendererRef.current?.burst(x, y, warmth);
      wordTimersRef.current.delete(burstT);
    }, BURST_AT_MS);
    wordTimersRef.current.add(burstT);

    const rmT = window.setTimeout(() => {
      setWords((prev) => prev.filter((w) => w.id !== id));
      wordTimersRef.current.delete(rmT);
    }, WORD_LIFE_MS);
    wordTimersRef.current.add(rmT);
  }, []);

  // ambient murmur loop (demo + spectral paths)
  const startMurmurs = useCallback(() => {
    if (murmurTimerRef.current !== undefined) return;
    const tick = () => {
      const p = pathRef.current;
      if (p === "demo" || p === "spectral") {
        const w = MURMURS[Math.floor(Math.random() * MURMURS.length)];
        spawnWord(w, driveCur.current.v);
      }
      murmurTimerRef.current = window.setTimeout(tick, 2200 + Math.random() * 1600);
    };
    murmurTimerRef.current = window.setTimeout(tick, 900);
  }, [spawnWord]);

  const stopMurmurs = useCallback(() => {
    if (murmurTimerRef.current !== undefined) {
      clearTimeout(murmurTimerRef.current);
      murmurTimerRef.current = undefined;
    }
  }, []);

  // the two-model transcription → sentiment loop (full path)
  const startTranscription = useCallback(() => {
    if (transcribeTimerRef.current !== undefined) return;
    const run = () => {
      const mic = micRef.current;
      const ml = mlRef.current;
      if (mic && ml && !ml.busy && pathRef.current === "full") {
        const win = mic.getWindow(4.2);
        if (win.length > 0 && rmsOf(win) > 0.006) {
          const pcm = resampleTo16k(win, mic.sampleRate);
          ml.busy = true;
          ml
            .transcribe(pcm)
            .then((raw) => {
              const text = cleanTranscript(raw);
              if (!isMeaningful(text)) {
                ml.busy = false;
                return;
              }
              return ml.sentiment(text).then((s) => {
                driveTarget.current.v = s.valence;
                const tokens = text.split(/\s+/).filter(Boolean);
                const rate = tokens.length / 4.2;
                driveTarget.current.a = Math.max(
                  0,
                  Math.min(1, 0.2 + rate * 0.28 + levelRef.current * 0.3),
                );
                setLastLine(
                  `${text} · ${s.label.toLowerCase()} ${Math.round(s.score * 100)}%`,
                );
                tokens.slice(-10).forEach((w, i) => {
                  const t = window.setTimeout(() => {
                    spawnWord(w, s.valence);
                    wordTimersRef.current.delete(t);
                  }, i * 240);
                  wordTimersRef.current.add(t);
                });
                ml.busy = false;
              });
            })
            .catch(() => {
              ml.busy = false;
            });
        }
      }
      transcribeTimerRef.current = window.setTimeout(run, 3500);
    };
    transcribeTimerRef.current = window.setTimeout(run, 3500);
  }, [spawnWord]);

  // create renderer + run the single animation loop
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    let made: { renderer: FieldRenderer; mode: "webgl2" | "canvas2d" };
    try {
      made = createField(canvas);
    } catch {
      setError("This browser cannot provide a drawing surface for the field.");
      return;
    }
    rendererRef.current = made.renderer;
    setMode(made.mode);

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const applySize = () => {
      const w = container.clientWidth;
      const h = Math.max(280, Math.round(w * 0.6));
      canvas.style.height = `${h}px`;
      made.renderer.resize(w * dpr, h * dpr);
    };
    applySize();
    const ro = new ResizeObserver(applySize);
    ro.observe(container);

    let last = performance.now();
    const t0 = last;
    let frame = 0;
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const t = (now - t0) / 1000;
      frame++;

      const p = pathRef.current;
      if (p === "spectral" && micRef.current) {
        const f = micRef.current.getFeatures();
        driveTarget.current.v = centroidToValence(f.centroid);
        driveTarget.current.a = Math.min(1, f.rms * 7);
        levelRef.current = Math.min(1, f.rms * 5);
      } else if (p === "full" && micRef.current) {
        const f = micRef.current.getFeatures();
        levelRef.current = Math.min(1, f.rms * 5);
        // arousal drifts up a touch with live loudness between transcripts
        driveTarget.current.a = Math.max(
          driveTarget.current.a * 0.98,
          Math.min(1, levelRef.current * 0.8),
        );
      } else if (p === "demo") {
        driveTarget.current.v = Math.max(
          0,
          Math.min(1, 0.5 + 0.4 * Math.sin(t * 0.13) + 0.1 * Math.sin(t * 0.37)),
        );
        driveTarget.current.a = Math.max(
          0,
          Math.min(1, 0.45 + 0.32 * Math.sin(t * 0.19 + 1)),
        );
        levelRef.current = 0.28 + 0.2 * (0.5 + 0.5 * Math.sin(t * 0.7));
      }

      driveCur.current.v += (driveTarget.current.v - driveCur.current.v) * 0.03;
      driveCur.current.a += (driveTarget.current.a - driveCur.current.a) * 0.05;

      if (audioRef.current && frame % 6 === 0) {
        audioRef.current.setDrive(
          driveCur.current.v,
          driveCur.current.a,
          levelRef.current,
        );
      }

      rendererRef.current?.render(
        {
          valence: driveCur.current.v,
          arousal: driveCur.current.a,
          level: levelRef.current,
          reduced: reducedRef.current,
        },
        dt,
        t,
      );
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      ro.disconnect();
      cancelAnimationFrame(rafRef.current);
      made.renderer.dispose();
      rendererRef.current = null;
    };
  }, []);

  // full teardown on unmount
  useEffect(() => {
    const wordTimers = wordTimersRef.current;
    return () => {
      cancelAnimationFrame(rafRef.current);
      if (transcribeTimerRef.current !== undefined) clearTimeout(transcribeTimerRef.current);
      if (murmurTimerRef.current !== undefined) clearTimeout(murmurTimerRef.current);
      wordTimers.forEach((t) => clearTimeout(t));
      wordTimers.clear();
      micRef.current?.stop();
      micRef.current = null;
      audioRef.current?.dispose();
      const ctx = audioRef.current?.ctx;
      audioRef.current = null;
      mlRef.current = null;
      void ctx?.close().catch(() => {});
    };
  }, []);

  const begin = useCallback(async () => {
    if (startedRef.current) return;
    startedRef.current = true;
    setPhase("running");
    setError(null);

    // audio always starts, so there is always sound
    const Ctx: typeof AudioContext =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const audio = new OracleAudio(new Ctx());
    audioRef.current = audio;
    try {
      await audio.start();
    } catch {
      /* master will still be scheduled once resumed by a gesture */
    }

    // try the microphone
    let mic: MicInput | null = null;
    try {
      mic = new MicInput(audio.ctx);
      await mic.start();
      micRef.current = mic;
    } catch {
      mic = null;
    }

    if (!mic) {
      // no mic → gentle self-playing demo (still sound + visuals + words)
      setPath("demo", "demo mode · self-playing oracle");
      startMurmurs();
      return;
    }

    // mic is live → spectral fallback is immediately active while models load
    setPath("spectral", "listening · loading models…");
    startMurmurs();

    const ml = new OracleML();
    mlRef.current = ml;
    ml.load((s) => {
      if (pathRef.current === "spectral") setStatus(`listening · ${s}`);
    })
      .then(() => {
        if (!mlRef.current) return; // unmounted mid-load
        stopMurmurs();
        setPath("full", "listening · whisper-tiny + distilbert loaded");
        startTranscription();
      })
      .catch(() => {
        setPath("spectral", "fallback: spectral features (models unavailable)");
      });
  }, [setPath, startMurmurs, stopMurmurs, startTranscription]);

  return (
    <main className="min-h-screen bg-background px-4 py-8 text-foreground sm:px-6">
      <div className="mx-auto max-w-3xl">
        <header className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
              Oracle Echo
            </h1>
            <p className="mt-2 max-w-prose text-base text-muted-foreground">
              Speak, and the room answers in light and tone. Two machine-learning
              models run in your browser — whisper hears your words, distilbert
              reads their mood — and turn the sentence into a living field of
              motes and a harmony that brightens or darkens with your feeling.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowNotes(true)}
            className="shrink-0 text-sm text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
          >
            Read the design notes
          </button>
        </header>

        <div
          ref={containerRef}
          className="relative overflow-hidden rounded-lg border border-border bg-black"
        >
          <canvas
            ref={canvasRef}
            className="block w-full select-none"
            style={{ height: 320 }}
            aria-label="A generative field of light motes that flows and warms or cools with the sentiment of spoken words."
          />

          {/* luminous words dissolving into the field */}
          <div className="pointer-events-none absolute inset-0">
            {words.map((w) => (
              <span
                key={w.id}
                className="absolute -translate-x-1/2 text-lg font-medium"
                style={{
                  left: `${w.x * 100}%`,
                  top: `${w.y * 100}%`,
                  color: warmthColor(w.warmth, 0.96),
                  textShadow: `0 0 18px ${warmthColor(w.warmth, 0.7)}`,
                  animation: `oracleWord ${WORD_LIFE_MS}ms ease-out forwards`,
                }}
              >
                {w.text}
              </span>
            ))}
          </div>

          {/* pre-Begin overlay */}
          {phase === "idle" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/55 px-6 text-center backdrop-blur-[1px]">
              <p className="max-w-sm text-base text-foreground">
                Put on headphones, allow the microphone, and speak a sentence.
                The oracle listens and answers. No mic or network? It plays
                itself.
              </p>
              <button
                type="button"
                onClick={begin}
                className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Start listening
              </button>
            </div>
          )}

          {/* status chip */}
          {phase === "running" && status && (
            <div className="pointer-events-none absolute left-3 top-3 flex flex-col gap-1.5">
              <span className="rounded-full bg-background/70 px-3 py-1 font-mono text-xs uppercase tracking-[0.12em] text-muted-foreground backdrop-blur-sm">
                {status}
              </span>
            </div>
          )}
        </div>

        {/* readout row */}
        <div className="mt-4 flex flex-col gap-1.5">
          {pathKind === "full" && lastLine && (
            <p className="text-sm leading-relaxed text-muted-foreground">
              heard: <span className="text-foreground">{lastLine}</span>
            </p>
          )}
          {pathKind === "spectral" && phase === "running" && (
            <p className="text-sm leading-relaxed text-muted-foreground">
              Running the spectral-feature fallback: brightness of your voice sets
              the color, loudness sets the pace. The murmurs are the oracle&rsquo;s
              own, not a transcript.
            </p>
          )}
          {pathKind === "demo" && (
            <p className="text-sm leading-relaxed text-muted-foreground">
              Demo mode — no microphone, so the field plays itself. Reload with
              mic access to let it hear you.
            </p>
          )}
          {mode === "canvas2d" && phase === "running" && (
            <p className="text-sm leading-relaxed text-muted-foreground">
              WebGL2 was unavailable, so the field is drawing on a 2D canvas
              instead. The sound and the sentiment chain are unaffected.
            </p>
          )}
          {error && <p className="text-base text-destructive">{error}</p>}
        </div>
      </div>

      {/* design-notes overlay */}
      {showNotes && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Design notes
            </p>
            <h2 className="mt-2 text-xl font-semibold tracking-tight text-foreground">
              Oracle Echo
            </h2>
            <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                The lab&rsquo;s first real two-model in-browser AI pipeline.
                Live mic audio is transcribed by{" "}
                <span className="text-foreground">whisper-tiny.en</span> (ASR),
                and that text is scored by{" "}
                <span className="text-foreground">
                  distilbert-sst-2
                </span>{" "}
                (sentiment). POSITIVE/NEGATIVE + confidence becomes a musical
                valence that morphs a tempered chord major↔dark; word rate and
                loudness become arousal (tempo, register, filter). Both models
                run entirely client-side via Transformers.js v4, dynamic-imported
                from a CDN at runtime — nothing added to the build, $0.
              </p>
              <p>
                Transcribed words surface as luminous text that dissolves into a
                WebGL2 particle/flow field. Sentiment warms the palette (amber
                for positive) or cools it (slate for negative); arousal quickens
                the flow. Everything degrades: no models → Web-Audio spectral
                features (centroid→brightness, RMS→tempo); no mic → a self-playing
                ambient demo; no WebGL2 → the same simulation on a 2D canvas. It
                always makes sound and light.
              </p>
              <p className="text-muted-foreground">
                Reference: Memo Akten, <em>Learning to See</em> (real-time ML
                re-seeing the world), and the Transformers.js v4 in-browser-ML
                release (2026).
              </p>
              <p className="font-mono text-xs text-muted-foreground">
                INPUT mic speech · OUTPUT WebGL2 particle/flow field · TECHNIQUE
                2-model ML chain (ASR→sentiment) → cross-modal harmony · PALETTE
                sentiment-driven warm↔cool-slate
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowNotes(false)}
              className="mt-5 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Close
            </button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes oracleWord {
          0% { opacity: 0; transform: translate(-50%, 6px) scale(0.96); filter: blur(0px); }
          18% { opacity: 1; transform: translate(-50%, 0) scale(1); }
          55% { opacity: 0.9; filter: blur(0px); }
          100% { opacity: 0; transform: translate(-50%, -26px) scale(1.08); filter: blur(6px); }
        }
      `}</style>
    </main>
  );
}
