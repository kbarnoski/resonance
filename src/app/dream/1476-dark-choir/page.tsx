"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { startAudio, type ChoirAudio } from "./audio";
import { startVoice, type VoiceRig } from "./mic";
import { makeHalo, type Halo } from "./halo";

type Phase = "idle" | "starting" | "running" | "error";

export default function DarkChoirPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const haloRef = useRef<Halo | null>(null);
  const audioRef = useRef<ChoirAudio | null>(null);
  const voiceRef = useRef<VoiceRig | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const tickRef = useRef<number>(0);
  const lastRef = useRef<number>(0);

  const [phase, setPhase] = useState<Phase>("idle");
  const [mode, setMode] = useState<"mic" | "auto" | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(false);

  const teardown = useCallback(() => {
    if (tickRef.current) cancelAnimationFrame(tickRef.current);
    tickRef.current = 0;
    haloRef.current?.dispose();
    haloRef.current = null;
    voiceRef.current?.stop();
    voiceRef.current = null;
    audioRef.current?.stop();
    audioRef.current = null;
    const ctx = ctxRef.current;
    ctxRef.current = null;
    if (ctx && ctx.state !== "closed") {
      // Let the fade-outs ring before closing the context.
      window.setTimeout(() => {
        ctx.close().catch(() => {
          /* already closed */
        });
      }, 900);
    }
  }, []);

  // Full teardown on unmount.
  useEffect(() => teardown, [teardown]);

  const begin = useCallback(async () => {
    if (phase === "starting" || phase === "running") return;
    setPhase("starting");
    setErrorMsg(null);

    const canvas = canvasRef.current;
    if (!canvas) {
      setPhase("error");
      setErrorMsg("Could not mount the field.");
      return;
    }

    // ── Audio context (only after this user gesture) ──────────────────────────
    let ctx: AudioContext;
    try {
      const Ctx: typeof AudioContext =
        window.AudioContext ||
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (window as any).webkitAudioContext;
      ctx = new Ctx();
      if (ctx.state === "suspended") await ctx.resume();
    } catch {
      setPhase("error");
      setErrorMsg("Web Audio is unavailable on this device.");
      return;
    }
    ctxRef.current = ctx;
    audioRef.current = startAudio(ctx);

    // ── Voice controller (mic, or synthetic self-play — always resolves) ──────
    const rig = await startVoice({ ctx });
    voiceRef.current = rig;
    setMode(rig.mode);
    if (rig.mode === "auto") {
      setErrorMsg(
        "No microphone, so the choir is singing to itself. Allow mic access and reload to sing into the dark yourself.",
      );
    }

    // ── Visual field ──────────────────────────────────────────────────────────
    const reduced =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    haloRef.current = makeHalo(canvas, reduced);

    // ── Drive loop: read voice → feed choir + field ───────────────────────────
    lastRef.current = performance.now();
    const drive = () => {
      const now = performance.now();
      let dt = (now - lastRef.current) / 1000;
      lastRef.current = now;
      if (!Number.isFinite(dt) || dt < 0) dt = 0;
      dt = Math.min(dt, 0.05);

      const frame = voiceRef.current?.read() ?? { loudness: 0, pitch: null };
      audioRef.current?.setVoice(frame.loudness, frame.pitch);
      audioRef.current?.step(dt);
      haloRef.current?.setLevel(audioRef.current?.glow() ?? 0);
      haloRef.current?.draw(now);

      tickRef.current = requestAnimationFrame(drive);
    };
    tickRef.current = requestAnimationFrame(drive);

    setPhase("running");
  }, [phase]);

  // Keep the canvas sized to the window.
  useEffect(() => {
    const onResize = () => haloRef.current?.resize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return (
    <main className="relative h-dvh w-screen overflow-hidden bg-[#040308] text-foreground">
      {/* The near-black luminance field. */}
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" aria-hidden />

      {/* ── Idle / start panel ─────────────────────────────────────────────── */}
      {phase !== "running" && (
        <div className="absolute inset-0 flex items-center justify-center px-6">
          <div className="max-w-xl rounded-2xl bg-black/50 p-8 backdrop-blur-md ring-1 ring-border">
            <h1 className="font-serif text-3xl tracking-tight text-foreground sm:text-4xl">
              Dark Choir
            </h1>
            <p className="mt-3 text-base leading-relaxed text-foreground">
              Close your eyes and hum, sing, or breathe into the dark — the
              darkness answers. Your note lifts off into an endlessly rising choir
              of your own voice that never stops climbing.
            </p>
            <p className="mt-3 text-base leading-relaxed text-muted-foreground">
              This one is for the ears. The screen stays almost black on purpose —
              a single halo breathes with you. Best with headphones, eyes closed.
            </p>

            <button
              type="button"
              onClick={begin}
              disabled={phase === "starting"}
              className="mt-6 inline-flex min-h-[44px] items-center justify-center rounded-xl bg-card px-4 py-2.5 text-base font-medium text-black transition hover:bg-accent disabled:opacity-60"
            >
              {phase === "starting" ? "Listening…" : "Sing into the dark · allow mic"}
            </button>

            {errorMsg && (
              <p className="mt-4 text-base text-violet-300">{errorMsg}</p>
            )}

            <p className="mt-4 text-base text-muted-foreground">
              We listen only to steer the choir — nothing is recorded or sent
              anywhere. Without a mic, the choir sings to itself so it is never
              silent.
            </p>
          </div>
        </div>
      )}

      {/* ── Running status (sparse) ────────────────────────────────────────── */}
      {phase === "running" && (
        <div className="pointer-events-none absolute left-6 top-6 select-none">
          <h1 className="font-serif text-2xl text-foreground">Dark Choir</h1>
          {mode === "mic" && (
            <p className="mt-1 text-base text-violet-300/95">
              ● listening — sing, hum, or breathe
            </p>
          )}
          {mode === "auto" && (
            <p className="mt-1 text-base text-violet-300/95">
              ○ self-singing (no mic)
            </p>
          )}
          <p className="mt-1 text-base text-violet-300">
            Eyes closed. Headphones on.
          </p>
        </div>
      )}

      {/* ── Read the design notes (corner affordance) ──────────────────────── */}
      <button
        type="button"
        onClick={() => setShowNotes((s) => !s)}
        className="absolute right-6 top-6 inline-flex min-h-[44px] items-center justify-center rounded-xl bg-black/50 px-4 py-2.5 text-base text-foreground ring-1 ring-border backdrop-blur-md transition hover:text-foreground"
      >
        {showNotes ? "Close notes" : "Read the design notes"}
      </button>

      {showNotes && (
        <div className="absolute inset-0 z-10 flex items-start justify-center overflow-y-auto bg-black/75 px-6 py-16 backdrop-blur-md">
          <div className="max-w-2xl text-foreground">
            <h2 className="font-serif text-2xl text-foreground">Design notes</h2>
            <p className="mt-4 text-base leading-relaxed">
              <span className="text-foreground">The question:</span> what if you closed
              your eyes, sang into the dark, and the darkness sang back — an
              endlessly, ecstatically rising choir of your own voice that never
              stops climbing?
            </p>
            <p className="mt-4 text-base leading-relaxed">
              <span className="text-foreground">Voice as controller.</span> The mic is a
              pure measurement tap — never routed to the speakers. We extract two
              slow signals: loudness (auto-ranged RMS) and pitch (autocorrelation).
              Loudness drives an always-gliding{" "}
              <span className="text-violet-300">Shepard–Risset</span> bed brighter
              and faster. Each note you sing <em>spawns</em> a choir voice pitched
              to your fundamental, which glides up ~2.6 octaves under a Gaussian
              amplitude window — fading in low, out high — so there is never an
              audible ceiling. New voices bloom below as old ones vanish above: the
              choir climbs forever. Each is spatialised on a slow HRTF orbit, so
              voices circle your head.
            </p>
            <p className="mt-4 text-base leading-relaxed">
              <span className="text-foreground">Ascent, not dissolution.</span> A firm
              just-intonation drone (root + fifth) holds the ground while the voices
              keep <em>lifting</em>. The felt sense is being carried endlessly
              upward — boundless but buoyant — not thinning away into a void.
            </p>
            <p className="mt-4 text-base leading-relaxed">
              <span className="text-foreground">Why the screen is nearly black.</span>{" "}
              The lab leans on screens. This piece deliberately tests that bias:
              audio is the primary medium and the visual is a companion, one soft
              breathing halo that tracks your voice. It works with your eyes closed.
            </p>
            <p className="mt-4 text-base leading-relaxed">
              <span className="text-foreground">References.</span> Pauline Oliveros,{" "}
              <em>Deep Listening</em>; La Monte Young&apos;s sustained-drone{" "}
              <em>Dream House</em>; Roger Shepard &amp; Jean-Claude Risset&apos;s
              endless glissando; the jhāna sense of oceanic boundlessness.
            </p>
            <p className="mt-4 text-base leading-relaxed">
              <span className="text-foreground">Safety.</span> Only slow luminance drift
              (well under 3 Hz), no flicker; honours reduced-motion. Master ramps up
              from silence to a gentle peak through a limiter.
            </p>
          </div>
        </div>
      )}
    </main>
  );
}
