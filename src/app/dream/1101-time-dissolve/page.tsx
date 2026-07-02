"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DissolveScene } from "./scene";
import { startAudio, type DissolveAudio } from "./audio";

type Phase = "idle" | "starting" | "running" | "error";

// How far back (seconds) the visual lags the audio when NOT re-bound. This lag
// is what breaks audio-visual binding: your eyes report a moment your ears have
// already left. The lag itself slowly warps, so the two never settle.
const MAX_LAG_S = 6;
const HIST_HZ = 60;
const HIST_LEN = MAX_LAG_S * HIST_HZ + 8;

export default function TimeDissolvePage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sceneRef = useRef<DissolveScene | null>(null);
  const audioRef = useRef<DissolveAudio | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number>(0);
  const lastRef = useRef<number>(0);

  // Env history ring buffer for the lagged/time-warped visual.
  const histRef = useRef<Float32Array>(new Float32Array(HIST_LEN));
  const histIdxRef = useRef<number>(0);
  const visEnvRef = useRef<number>(0.2);
  const warpRef = useRef<number>(0);

  // Re-bind lives in a ref (read every frame) mirrored by state (for the UI).
  const boundRef = useRef<boolean>(false);
  const [bound, setBound] = useState(false);

  const [phase, setPhase] = useState<Phase>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(false);

  const teardown = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
    sceneRef.current?.dispose();
    sceneRef.current = null;
    audioRef.current?.stop();
    audioRef.current = null;
    const ctx = ctxRef.current;
    ctxRef.current = null;
    if (ctx && ctx.state !== "closed") {
      window.setTimeout(() => {
        ctx.close().catch(() => {
          /* already closed */
        });
      }, 1400);
    }
  }, []);

  useEffect(() => teardown, [teardown]);

  // Keep the canvas sized to its container.
  useEffect(() => {
    const onResize = () => sceneRef.current?.resize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const frame = useCallback((now: number) => {
    const audio = audioRef.current;
    const scene = sceneRef.current;
    if (!audio || !scene) return;

    const last = lastRef.current || now;
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    lastRef.current = now;

    audio.step(dt);
    const s = audio.getState();

    // Push true audio env into the history ring.
    const hist = histRef.current;
    const idx = histIdxRef.current;
    hist[idx] = s.env;
    histIdxRef.current = (idx + 1) % HIST_LEN;

    // Choose the envelope that drives the visual.
    let target: number;
    if (boundRef.current) {
      // RE-BOUND: eyes track ears exactly.
      target = s.env;
    } else {
      // DESYNCED: read a warping delay into the past. Deeper dissolution =
      // longer, more slippery lag → the felt loss of temporal grip.
      warpRef.current += dt * 0.13;
      const lagSec =
        (0.6 + 4.6 * s.depth) * (0.7 + 0.3 * Math.sin(warpRef.current));
      const back = Math.max(1, Math.min(HIST_LEN - 2, Math.round(lagSec * HIST_HZ)));
      const ri = (histIdxRef.current - back + HIST_LEN) % HIST_LEN;
      target = hist[ri];
    }

    // The clarity snap always re-aligns eyes and ears, re-bound or not.
    const align = boundRef.current ? 0.5 : 0.06 + 0.9 * s.clarity;
    visEnvRef.current += (target - visEnvRef.current) * Math.min(1, align);

    scene.render(
      {
        visEnv: visEnvRef.current,
        clarity: s.clarity,
        progress: s.progress,
        bound: boundRef.current,
      },
      dt,
    );

    rafRef.current = requestAnimationFrame(frame);
  }, []);

  const begin = useCallback(async () => {
    if (phase === "starting" || phase === "running") return;
    setPhase("starting");
    setErrorMsg(null);

    const canvas = canvasRef.current;
    if (!canvas) {
      setPhase("error");
      setErrorMsg("Could not mount the canvas.");
      return;
    }

    try {
      sceneRef.current = new DissolveScene(canvas);
    } catch {
      setPhase("error");
      setErrorMsg("This browser could not open a 2D canvas.");
      return;
    }

    try {
      type WindowWithWebkit = Window & {
        webkitAudioContext?: typeof AudioContext;
      };
      const Ctor =
        window.AudioContext ??
        (window as WindowWithWebkit).webkitAudioContext;
      if (!Ctor) throw new Error("no AudioContext");
      const ctx = new Ctor();
      ctxRef.current = ctx;
      if (ctx.state === "suspended") await ctx.resume();
      audioRef.current = startAudio(ctx);
    } catch {
      setPhase("error");
      setErrorMsg("Audio could not start on this device.");
      return;
    }

    setPhase("running");
    lastRef.current = 0;
    rafRef.current = requestAnimationFrame(frame);
  }, [phase, frame]);

  const toggleBind = useCallback(() => {
    setBound((b) => {
      const nb = !b;
      boundRef.current = nb;
      return nb;
    });
  }, []);

  const running = phase === "running";

  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-[#04030a] text-white">
      {/* Canvas fills the viewport */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full"
        onClick={() => audioRef.current?.deepen()}
      />

      {/* Design-notes link, corner */}
      <button
        type="button"
        onClick={() => setShowNotes((s) => !s)}
        className="absolute right-4 top-4 z-20 min-h-[44px] rounded-full px-4 py-2.5 text-base text-white/75 underline decoration-white/30 underline-offset-4 transition hover:text-white/95"
      >
        Read the design notes
      </button>

      {/* Idle / start overlay */}
      {!running && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-5 px-6 text-center">
          <h1 className="font-serif text-4xl text-white/95 sm:text-5xl">
            Time, Dissolving
          </h1>
          <p className="max-w-xl text-base text-white/75 sm:text-lg">
            An audio-first descent that dissolves your sense of <em>when</em>. An
            endless falling tone, a swelling void, and a light that quietly
            refuses to keep time with the sound.
          </p>
          {phase === "error" ? (
            <p className="max-w-md text-base text-rose-300">{errorMsg}</p>
          ) : null}
          <button
            type="button"
            onClick={begin}
            disabled={phase === "starting"}
            className="mt-2 min-h-[44px] rounded-full border border-violet-300/40 bg-violet-500/15 px-6 py-2.5 text-base text-violet-300 transition hover:bg-violet-500/25 disabled:opacity-60"
          >
            {phase === "starting" ? "Descending…" : "Begin the descent"}
          </button>
          <p className="max-w-md text-base text-white/55">
            Best with headphones, eyes soft. Runs on its own for ~4 minutes —
            tap the void anytime to sink deeper.
          </p>
        </div>
      )}

      {/* Running HUD */}
      {running && (
        <div className="absolute inset-x-0 bottom-0 z-10 flex flex-col items-center gap-3 px-6 pb-8">
          <p className="max-w-2xl text-center text-base text-white/75">
            {bound
              ? "Re-bound: the light now tracks the sound exactly — eyes and ears agree."
              : "Desynced: the light lags and warps behind the sound, so what you see never quite matches what you hear. That mismatch is the dissolution."}
          </p>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={toggleBind}
              className={`min-h-[44px] rounded-full px-6 py-2.5 text-base transition ${
                bound
                  ? "border border-emerald-300/50 bg-emerald-500/20 text-emerald-300/95"
                  : "border border-white/25 bg-white/5 text-white/75 hover:text-white/95"
              }`}
            >
              {bound ? "Re-bound (sync ON)" : "Re-bind (sync OFF)"}
            </button>
            <button
              type="button"
              onClick={() => audioRef.current?.deepen()}
              className="min-h-[44px] rounded-full border border-violet-300/40 bg-violet-500/15 px-6 py-2.5 text-base text-violet-300 transition hover:bg-violet-500/25"
            >
              Sink deeper
            </button>
          </div>
        </div>
      )}

      {/* Design notes panel */}
      {showNotes && (
        <div className="absolute inset-0 z-30 flex items-start justify-center overflow-y-auto bg-black/80 px-6 py-16 backdrop-blur-sm">
          <div className="max-w-2xl space-y-4 text-left">
            <h2 className="font-serif text-2xl text-white/95">Design notes</h2>
            <p className="text-base text-white/75">
              <span className="text-violet-300">The question:</span> what if we
              could dissolve the felt flow and grain of <em>time</em> — the way
              ketamine / NDE time-dilation makes onset and echo merge and the
              floor of pitch drop away forever?
            </p>
            <p className="text-base text-white/75">
              <span className="text-violet-300">State · pole:</span> ketamine /
              NDE temporal dissolution &amp; oceanic boundlessness ·
              cosmic-ambient.
            </p>
            <p className="text-base text-white/75">
              The sound is a Shepard–Risset endless <em>descent</em> over a
              just-intoned drone, smeared by a granular time-stretch and poured
              into a swelling convolution void whose tail grows until each onset
              and its echo become one. A single global{" "}
              <span className="text-amber-300/95">timeScale</span> stretches the
              glide and the grain playhead together. A slowly closing low-pass
              re-opens at a brief hyper-lucid{" "}
              <span className="text-rose-300">clarity snap</span> near minute 3.3
              before a soft return.
            </p>
            <p className="text-base text-white/75">
              The visual is intentionally minimal and{" "}
              <em>deliberately desynced</em>: the bloom follows a heavily lagged,
              warping copy of the audio envelope, so eyes and ears quietly
              disagree. The <span className="text-emerald-300/95">Re-bind</span>{" "}
              toggle snaps them into sync so you can A/B the dissociation on and
              off.
            </p>
            <p className="text-base text-white/75">
              <span className="text-violet-300">References:</span> Pauline
              Oliveros&rsquo; <em>Deep Listening</em> (long reverb spaces); La
              Monte Young&rsquo;s sustained-drone / Dream House; the
              Shepard–Risset endless glissando; and the &ldquo;gamma surge&rdquo;
              hyper-lucidity finding (Borjigin, PNAS 2013/2023) as the
              clarity-snap. Phenomenology only — no medical claims.
            </p>
            <p className="text-base text-white/55">
              A full write-up lives in this prototype&rsquo;s README.md.
            </p>
            <button
              type="button"
              onClick={() => setShowNotes(false)}
              className="min-h-[44px] rounded-full border border-white/25 bg-white/5 px-6 py-2.5 text-base text-white/75 transition hover:text-white/95"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
