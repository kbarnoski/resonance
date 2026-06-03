"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { startMeadow, type MeadowHandle } from "./meadow-gl";
import { startMeadowAudio, type MeadowAudioHandle } from "./meadow-audio";
import {
  startCameraMotion,
  startGhostMotion,
  type MotionHandle,
} from "./motion-field";

type Phase = "idle" | "loading" | "playing";

export default function KidsShadowDance() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const meadowRef = useRef<MeadowHandle | null>(null);
  const audioRef = useRef<MeadowAudioHandle | null>(null);
  const motionRef = useRef<MotionHandle | null>(null);
  const rafRef = useRef<number>(0);

  const [phase, setPhase] = useState<Phase>("idle");
  const [ghost, setGhost] = useState(false);
  const [noWebgl, setNoWebgl] = useState(false);
  const [showNotes, setShowNotes] = useState(false);

  // The per-frame pump: pull a motion sample, feed the meadow + the audio.
  const runLoop = useCallback(() => {
    const motion = motionRef.current;
    const meadow = meadowRef.current;
    const audio = audioRef.current;
    if (motion) {
      const s = motion.sample();
      meadow?.setMotion(s.rg, s.frame.energy);
      audio?.update(s.frame);
    }
    rafRef.current = requestAnimationFrame(runLoop);
  }, []);

  const start = useCallback(async () => {
    if (phase !== "idle") return;
    setPhase("loading");

    // AudioContext MUST be created inside the user-gesture handler.
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const ctx = new AC();
    ctxRef.current = ctx;
    if (ctx.state === "suspended") {
      try {
        await ctx.resume();
      } catch {
        /* best effort */
      }
    }

    // Start the meadow shader (works for both camera and ghost paths).
    if (canvasRef.current) {
      const meadow = startMeadow(canvasRef.current);
      if (meadow) meadowRef.current = meadow;
      else setNoWebgl(true);
    }

    // Start the audio engine immediately so it's never silent.
    audioRef.current = startMeadowAudio(ctx);

    // Try the camera; fall back to the ghost dancer on any failure.
    let handle: MotionHandle | null = null;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      handle = startCameraMotion(stream);
    } catch {
      handle = null;
    }
    if (!handle) {
      handle = startGhostMotion();
      setGhost(true);
    }
    motionRef.current = handle;

    setPhase("playing");
    rafRef.current = requestAnimationFrame(runLoop);
  }, [phase, runLoop]);

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      motionRef.current?.dispose();
      meadowRef.current?.dispose();
      audioRef.current?.dispose();
      ctxRef.current?.close().catch(() => {});
    };
  }, []);

  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-[#0a0712] text-white">
      {/* WebGL2 dusk meadow fills the screen */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full"
        aria-hidden
      />

      {/* readable scrim so text stays legible over the meadow */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/45 via-transparent to-black/55" />

      {/* design-notes link, top-right corner */}
      <button
        onClick={() => setShowNotes((s) => !s)}
        className="absolute right-4 top-4 z-20 min-h-[44px] rounded-full border border-white/25 bg-black/30 px-4 py-2.5 text-sm text-white/80 backdrop-blur hover:text-white"
      >
        {showNotes ? "Close notes" : "Read the design notes"}
      </button>

      <div className="relative z-10 mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center gap-6 px-6 py-16 text-center">
        {phase !== "playing" && (
          <>
            <h1 className="font-serif text-3xl font-semibold text-white sm:text-5xl">
              Shadow Dance
            </h1>
            <p className="max-w-xl text-base text-white/80 sm:text-lg">
              Stand back so the camera can see you, then{" "}
              <span className="text-white">dance with your whole body</span>.
              Wherever you move, the dusk meadow blooms and sings. No tapping,
              no rules &mdash; just move!
            </p>
            <p className="max-w-xl text-base text-amber-300/95">
              The camera is only used to feel your movement. Nothing is ever
              recorded or sent anywhere &mdash; it all stays on this device.
            </p>
          </>
        )}

        {phase === "idle" && (
          <button
            onClick={start}
            className="min-h-[64px] rounded-3xl bg-fuchsia-500 px-10 py-5 text-2xl font-semibold text-white shadow-lg transition hover:bg-fuchsia-400 active:scale-[0.98]"
          >
            Start dancing
          </button>
        )}

        {phase === "loading" && (
          <p className="text-base text-white/75 sm:text-lg">
            Waking up the meadow&hellip;
          </p>
        )}

        {phase === "playing" && (
          <div className="pointer-events-none flex flex-col items-center gap-3">
            {ghost && (
              <p className="max-w-md text-base text-amber-300/95">
                No camera right now, so a friendly ghost dancer is dancing for
                you. The meadow still blooms and sings &mdash; come dance along!
              </p>
            )}
            {noWebgl && (
              <p className="max-w-md text-base text-rose-300">
                This device can&rsquo;t draw the meadow, but the music is still
                playing. Close your eyes and dance to the sound.
              </p>
            )}
          </div>
        )}
      </div>

      {/* expandable design notes panel */}
      {showNotes && (
        <div className="absolute inset-x-4 bottom-4 z-30 mx-auto max-w-2xl rounded-2xl border border-white/15 bg-black/75 p-5 text-left backdrop-blur-md">
          <h2 className="text-xl font-semibold text-white">Design notes</h2>
          <p className="mt-2 text-base text-white/80">
            Your camera frame is shrunk to a tiny 32&times;24 grid and the
            brightness change between frames becomes a{" "}
            <span className="text-fuchsia-300">motion field</span> &mdash; hot
            cells are wherever you just moved. That field blooms flowers, leaves
            glowing light-trails, and shows a faint shadow of you in the meadow.
            The same numbers play a warm{" "}
            <span className="text-fuchsia-300">Lydian</span> scale (no wrong
            notes): the more you move the more the pad swells and the brighter
            the filter opens, and where you move on screen picks the pitch.
            Everything runs through a limiter so it can never get harsh.
          </p>
          <p className="mt-3 text-sm text-white/70">
            In the lineage of Jaques-Dalcroze&rsquo;s <em>Eurhythmics</em> and
            Myron Krueger&rsquo;s <em>Videoplace</em> (1985). See the README in
            this folder for the full mapping and references.
          </p>
          <Link
            href="/dream"
            className="mt-4 inline-block text-sm text-emerald-300/95 hover:underline"
          >
            &larr; Back to the dream lab
          </Link>
        </div>
      )}
    </main>
  );
}
