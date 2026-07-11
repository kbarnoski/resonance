"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { startDescentAudio, type DescentAudio } from "./audio";
import { createTapPace, type TapPace } from "./tapPace";

type Phase = "idle" | "starting" | "running" | "error";

// How many concentric rings the austere visual draws.
const RING_COUNT = 6;

export default function ThresholdDescentPage() {
  const audioRef = useRef<DescentAudio | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const paceRef = useRef<TapPace | null>(null);
  const tickRef = useRef<number>(0);
  const lastRef = useRef<number>(0);
  // Whether the user has ever tapped this session; before that, we auto-descend.
  const tappedRef = useRef<boolean>(false);

  const [phase, setPhase] = useState<Phase>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(false);

  // Visual state, updated each frame (kept in state so React re-renders the SVG).
  const [depth, setDepth] = useState(0);
  const [light, setLight] = useState(0);
  const [pulse, setPulse] = useState(0);
  const [auto, setAuto] = useState(true);

  const teardown = useCallback(() => {
    if (tickRef.current) cancelAnimationFrame(tickRef.current);
    tickRef.current = 0;
    audioRef.current?.stop();
    audioRef.current = null;
    paceRef.current = null;
    const ctx = ctxRef.current;
    ctxRef.current = null;
    if (ctx && ctx.state !== "closed") {
      window.setTimeout(() => {
        ctx.close().catch(() => {
          /* already closed */
        });
      }, 1000);
    }
  }, []);

  useEffect(() => teardown, [teardown]);

  const registerTap = useCallback(() => {
    if (phase !== "running") return;
    if (!tappedRef.current) {
      tappedRef.current = true;
      setAuto(false);
    }
    paceRef.current?.tap();
    audioRef.current?.tapPing();
  }, [phase]);

  const begin = useCallback(async () => {
    if (phase === "starting" || phase === "running") return;
    setPhase("starting");
    setErrorMsg(null);
    tappedRef.current = false;
    setAuto(true);

    let ctx: AudioContext;
    try {
      ctx = new AudioContext();
      if (ctx.state === "suspended") await ctx.resume();
    } catch {
      setPhase("error");
      setErrorMsg(
        "Web Audio could not start on this device — this piece is audio-first, so it needs sound.",
      );
      return;
    }
    ctxRef.current = ctx;

    try {
      audioRef.current = startDescentAudio(ctx);
    } catch {
      ctx.close().catch(() => {
        /* ignore */
      });
      ctxRef.current = null;
      setPhase("error");
      setErrorMsg("The audio graph failed to build on this device.");
      return;
    }

    paceRef.current = createTapPace();

    lastRef.current = performance.now();
    const drive = () => {
      const now = performance.now();
      let dt = (now - lastRef.current) / 1000;
      lastRef.current = now;
      if (!Number.isFinite(dt) || dt < 0) dt = 0;
      dt = Math.min(dt, 0.05);

      const pace = paceRef.current;
      const audio = audioRef.current;
      if (pace && audio) {
        // Until the user taps, run the gentle scripted auto-descent so the piece
        // is alive and audible within ~2 s of Start (demoable at a glance).
        const d = tappedRef.current ? pace.step(dt) : pace.autoStep(dt);
        audio.setDepth(d);
        audio.step(dt);
        setDepth(d);
        setLight(audio.light);
        setPulse(pace.pulse);
      }

      tickRef.current = requestAnimationFrame(drive);
    };
    tickRef.current = requestAnimationFrame(drive);

    setPhase("running");
  }, [phase]);

  // Spacebar taps the pulse while running.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        e.preventDefault();
        registerTap();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [registerTap]);

  // ── Derived visual values ────────────────────────────────────────────────────
  // Rings contract inward as depth rises; the central dot brightens with light.
  const center = 200;
  const maxRadius = 175;
  const contraction = 0.25 + 0.75 * (1 - depth); // deep = rings pulled inward
  const dotBrightness = 0.15 + 0.85 * light;
  const dotRadius = 6 + 26 * light + 4 * pulse;
  // A calm luminance drift for the glow — slow, never a strobe.
  const glow = light * (0.85 + 0.15 * Math.sin(Date.now() / 1400));

  return (
    <main className="relative h-dvh w-screen overflow-hidden bg-[#04030a] text-foreground">
      {/* The austere SVG — concentric rings contracting toward a luminous point. */}
      <div className="absolute inset-0 flex items-center justify-center">
        <svg
          viewBox="0 0 400 400"
          className="h-full max-h-[92vh] w-full max-w-[92vh]"
          aria-hidden
        >
          <defs>
            <radialGradient id="td-core" cx="50%" cy="50%" r="50%">
              <stop
                offset="0%"
                stopColor="rgb(255,236,196)"
                stopOpacity={dotBrightness}
              />
              <stop
                offset="45%"
                stopColor="rgb(255,196,120)"
                stopOpacity={glow * 0.55}
              />
              <stop offset="100%" stopColor="rgb(255,196,120)" stopOpacity="0" />
            </radialGradient>
          </defs>

          {/* The luminous halo — blooms only as the light partial arrives. */}
          <circle
            cx={center}
            cy={center}
            r={40 + 120 * light}
            fill="url(#td-core)"
          />

          {/* Concentric rings, contracting inward with depth. */}
          {Array.from({ length: RING_COUNT }).map((_, i) => {
            const base = ((i + 1) / RING_COUNT) * maxRadius;
            const r = base * contraction;
            const ringOpacity = 0.1 + 0.32 * (1 - i / RING_COUNT) + 0.15 * depth;
            return (
              <circle
                key={i}
                cx={center}
                cy={center}
                r={Math.max(2, r)}
                fill="none"
                stroke="rgb(200,210,255)"
                strokeOpacity={Math.min(0.7, ringOpacity)}
                strokeWidth={1.1}
              />
            );
          })}

          {/* The central dot — the point the descent converges on. */}
          <circle
            cx={center}
            cy={center}
            r={dotRadius}
            fill="rgb(255,244,214)"
            fillOpacity={dotBrightness}
          />
        </svg>
      </div>

      {/* Vignette to keep UI text legible. */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_45%,rgba(4,3,10,0.75)_100%)]" />

      {/* ── Idle / start panel ─────────────────────────────────────────────── */}
      {phase !== "running" && (
        <div className="absolute inset-0 flex items-center justify-center px-6">
          <div className="max-w-xl rounded-2xl bg-black/55 p-8 backdrop-blur-md ring-1 ring-border">
            <p className="font-mono text-sm text-violet-300">
              resonance · dream lab
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              Threshold Descent
            </h1>
            <p className="mt-3 text-base leading-relaxed text-foreground">
              Close your eyes and descend by <em>slowing down</em>. Tap a pulse,
              then let each tap fall further apart — and finally go still.
              Stillness takes you deepest, where a warm light blooms out of the
              dark. This is an audio-first piece: put on headphones.
            </p>

            <button
              type="button"
              onClick={begin}
              disabled={phase === "starting"}
              className="mt-6 inline-flex min-h-[44px] items-center justify-center rounded-xl bg-card px-4 py-2.5 text-base font-medium text-black transition hover:bg-accent disabled:opacity-60"
            >
              {phase === "starting" ? "Descending…" : "Begin the descent"}
            </button>

            {errorMsg && (
              <p className="mt-4 text-base text-violet-300">{errorMsg}</p>
            )}

            <p className="mt-4 text-base text-muted-foreground">
              Tap with the spacebar, a tap on screen, or the pulse button. If you
              never tap, it descends on its own. Nothing is recorded or sent
              anywhere.
            </p>
          </div>
        </div>
      )}

      {/* ── Running HUD ────────────────────────────────────────────────────── */}
      {phase === "running" && (
        <>
          {/* Big invisible tap surface so a screen-tap anywhere pulses. */}
          <button
            type="button"
            onClick={registerTap}
            aria-label="Tap the pulse"
            className="absolute inset-0 z-0 cursor-pointer bg-transparent"
          />

          <div className="pointer-events-none absolute left-6 top-6 z-10 select-none">
            <h1 className="text-2xl font-semibold text-foreground">
              Threshold Descent
            </h1>
            <p className="mt-1 font-mono text-sm text-muted-foreground">
              depth {(depth * 100).toFixed(0)}%
            </p>
            {auto ? (
              <p className="mt-1 text-base text-violet-300/95">
                ○ auto-descent — tap to take the wheel
              </p>
            ) : depth > 0.85 ? (
              <p className="mt-1 text-base text-violet-300/95">
                ● stillness — the light
              </p>
            ) : (
              <p className="mt-1 text-base text-violet-300">
                ● tapping · slow down to descend
              </p>
            )}
          </div>

          {/* Explicit pulse button (guaranteed 44×44 tap target). */}
          <div className="absolute bottom-8 left-1/2 z-10 -translate-x-1/2">
            <button
              type="button"
              onClick={registerTap}
              className="inline-flex min-h-[44px] items-center justify-center rounded-full bg-muted px-8 py-4 text-base font-medium text-foreground ring-1 ring-border backdrop-blur-md transition hover:bg-accent"
              style={{
                boxShadow: `0 0 ${8 + 40 * pulse}px rgba(200,210,255,${0.2 + 0.5 * pulse})`,
              }}
            >
              tap the pulse
            </button>
          </div>
        </>
      )}

      {/* ── Design-notes toggle ────────────────────────────────────────────── */}
      <button
        type="button"
        onClick={() => setShowNotes((s) => !s)}
        className="absolute right-6 top-6 z-20 inline-flex min-h-[44px] items-center justify-center rounded-xl bg-black/45 px-4 py-2.5 text-base text-foreground ring-1 ring-border backdrop-blur-md transition hover:text-foreground"
      >
        {showNotes ? "Close notes" : "Read the design notes"}
      </button>

      {showNotes && (
        <div className="absolute inset-0 z-30 flex items-start justify-center overflow-y-auto bg-black/80 px-6 py-16 backdrop-blur-md">
          <div className="max-w-2xl text-foreground">
            <h2 className="text-2xl font-semibold text-foreground">Design notes</h2>
            <p className="mt-4 text-base leading-relaxed">
              <span className="text-foreground">The question:</span> what if Resonance
              could induce a near-death / ketamine &ldquo;tunnel-to-the-light&rdquo;
              dissolution with almost <em>no screen</em> — using only spatial audio
              and the pace of your own body, so you can close your eyes?
            </p>
            <p className="mt-4 text-base leading-relaxed">
              <span className="text-foreground">Descend by slowing.</span> A tap-tempo
              state machine measures the interval between your taps. Fast taps mean
              you&apos;re agitated, near the surface (shallow). As the intervals
              lengthen, <code>depth</code> rises; when you go <em>still</em>, depth
              glides toward 1.0 — the deepest. Resuming fast taps pulls you back up.
              Every transition is exponentially smoothed, so nothing clicks.
            </p>
            <p className="mt-4 text-base leading-relaxed">
              <span className="text-foreground">What depth drives.</span> A
              Shepard–Risset endless <em>fall</em> (deeper = faster, more committed
              plunge); a void convolution reverb that grows cavernous; a ring of
              HRTF-panned just-intonation voices that contracts inward toward your
              head and adds higher voices as you descend; and — only near stillness
              — the <em>light</em>: two upper partials a just interval apart whose{" "}
              <em>difference tone / missing fundamental</em> we also synthesise, so
              a warm low tone seems to bloom out of nowhere. The reward for letting
              go.
            </p>
            <p className="mt-4 text-base leading-relaxed">
              <span className="text-foreground">Audio-first, austere visual.</span> The
              only picture is minimal SVG: concentric rings that contract toward a
              central dot which brightens with the light — slow luminance drift,
              never a strobe. The sound carries the experience; the piece works with
              your eyes closed.
            </p>
            <p className="mt-4 text-base leading-relaxed">
              <span className="text-foreground">References.</span> Jean-Claude Risset —
              the endless glissando / Risset rhythm; Roger Shepard — Shepard tones;
              Susan Blackmore, <em>Dying to Live</em> — the tunnel-to-light NDE
              phenomenology.
            </p>
            <p className="mt-4 text-base leading-relaxed">
              <span className="text-foreground">Next-cycle deepening:</span> accept device
              &ldquo;stillness&rdquo; (accelerometer quiet) as a second descent
              channel; a breath-locked shimmer at the threshold; per-tap
              micro-timing to detect an intentional <em>ritardando</em>; head-tracked
              HRTF so turning your head moves the ring; a longer scored arc that
              releases you back to the surface.
            </p>
            <p className="mt-6 font-mono text-sm text-muted-foreground">
              state: NDE tunnel-to-light / ketamine dissolution · pole:
              cosmic-ambient → luminous-intense
            </p>
          </div>
        </div>
      )}
    </main>
  );
}
