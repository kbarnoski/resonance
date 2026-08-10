"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import { prefersReducedMotion } from "../_shared/visionary/safeFlicker";
import {
  ambientField,
  evalPassage,
  PASSAGE_SECONDS,
  type PassageField,
} from "./timeline";
import { createPassageAudio, type PassageAudio } from "./passageAudio";

type Mode = "idle" | "audio" | "preview";

// Compress the whole ~4:45 arc into ~30s for a muted reviewer.
const PREVIEW_SCALE = PASSAGE_SECONDS / 30;

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export default function PassagePage() {
  const [mode, setMode] = useState<Mode>("idle");
  const [fellBack, setFellBack] = useState(false);
  const [completed, setCompleted] = useState(false);

  const bloomRef = useRef<HTMLDivElement | null>(null);
  const haloRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const labelRef = useRef<HTMLSpanElement | null>(null);
  const progRef = useRef<HTMLDivElement | null>(null);

  const ctxRef = useRef<AudioContext | null>(null);
  const audioRef = useRef<PassageAudio | null>(null);
  const rafRef = useRef<number>(0);
  const modeRef = useRef<Mode>("idle");
  const audioT0Ref = useRef<number>(0);
  const previewStartRef = useRef<number>(0);
  const leanRef = useRef<number>(0);
  const lastPhaseRef = useRef<string>("");
  const reducedRef = useRef<boolean>(false);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  // ── paint one frame of the near-blank luminous bloom ───────────────────────
  const paint = useCallback((f: PassageField, ts: number) => {
    const el = bloomRef.current;
    const halo = haloRef.current;
    const stage = stageRef.current;
    if (!el || !halo || !stage) return;

    const rm = reducedRef.current;
    const breatheAmp = rm ? 0.02 : 0.06;
    const breathe = 1 + breatheAmp * Math.sin(ts * 0.5);

    const hue = lerp(224, 40, f.warmth);
    const sat = lerp(34, 92, f.warmth);
    const light = lerp(52, 74, 0.35 + 0.65 * f.bloom);
    const core = `hsl(${hue} ${sat}% ${light}%)`;
    const soft = `hsl(${hue} ${sat}% ${light}% / 0.5)`;

    const scale = (0.55 + f.bloom * 1.5 + f.clarity * 0.14) * breathe;
    const blur = lerp(30, 3.5, f.bloomSharp);

    el.style.background = `radial-gradient(circle at 50% 50%, ${core} 0%, ${soft} 24%, transparent 62%)`;
    el.style.opacity = String(0.22 + 0.72 * f.bloom);
    el.style.transform = `translate3d(-50%,-50%,0) scale(${scale})`;
    el.style.filter = `blur(${blur}px)`;
    el.style.boxShadow = `0 0 ${40 + f.bloom * 170}px ${soft}`;

    halo.style.background = `radial-gradient(circle at 50% 50%, transparent 30%, hsl(${hue} ${sat}% ${light}% / ${0.05 + 0.12 * f.bloom}) 55%, transparent 78%)`;
    halo.style.opacity = String(0.4 + 0.5 * f.bloom);

    // faint corridor tint on the whole stage — warms toward the light.
    stage.style.background = `radial-gradient(circle at 50% 46%, hsl(${hue} ${sat}% 14% / ${0.35 + 0.35 * f.bloom}) 0%, hsl(240 20% 5%) 70%)`;

    // phase label — only touch the DOM when the phase name changes.
    if (labelRef.current && f.phaseLabel !== lastPhaseRef.current) {
      lastPhaseRef.current = f.phaseLabel;
      labelRef.current.textContent = f.phaseLabel;
    }
    if (progRef.current) {
      progRef.current.style.width = `${(f.progress * 100).toFixed(2)}%`;
    }
  }, []);

  const finishAudio = useCallback(() => {
    audioRef.current?.stop();
    audioRef.current = null;
    const ac = ctxRef.current;
    ctxRef.current = null;
    if (ac && ac.state !== "closed") {
      window.setTimeout(() => {
        if (ac.state !== "closed") void ac.close();
      }, 1700);
    }
    setMode("idle");
    setCompleted(true);
  }, []);

  // ── single rAF loop, reads modeRef so it survives mode changes ─────────────
  const frame = useCallback(() => {
    const ts = performance.now() / 1000;
    let f: PassageField;

    if (modeRef.current === "audio") {
      const ac = ctxRef.current;
      if (ac) {
        const jt = ac.currentTime - audioT0Ref.current;
        f = evalPassage(jt);
        audioRef.current?.update(f, leanRef.current);
        if (f.done) {
          finishAudio();
          f = ambientField(ts);
        }
      } else {
        f = ambientField(ts);
      }
    } else if (modeRef.current === "preview") {
      const jt = ((performance.now() - previewStartRef.current) / 1000) *
        PREVIEW_SCALE;
      if (jt >= PASSAGE_SECONDS) {
        setMode("idle");
        f = ambientField(ts);
      } else {
        f = evalPassage(jt);
      }
    } else {
      f = ambientField(ts);
    }

    paint(f, ts);
    rafRef.current = requestAnimationFrame(frame);
  }, [paint, finishAudio]);

  // optional "lean forward to move faster" — subtle, never required.
  const onPointerMove = useCallback((e: PointerEvent) => {
    const y = e.clientY / window.innerHeight; // 0 top .. 1 bottom
    leanRef.current = clamp01(1 - y); // toward the top = lean forward
  }, []);
  const onOrient = useCallback((e: DeviceOrientationEvent) => {
    const beta = e.beta ?? 45; // front-back tilt, ~45 upright
    leanRef.current = clamp01((45 - beta) / 35);
  }, []);

  // mount: start the muted auto-run + listeners; full teardown on unmount.
  useEffect(() => {
    reducedRef.current = prefersReducedMotion();
    rafRef.current = requestAnimationFrame(frame);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("deviceorientation", onOrient);
    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("deviceorientation", onOrient);
      audioRef.current?.stop();
      audioRef.current = null;
      const ac = ctxRef.current;
      ctxRef.current = null;
      if (ac && ac.state !== "closed") {
        window.setTimeout(() => {
          if (ac.state !== "closed") void ac.close();
        }, 1700);
      }
    };
  }, [frame, onPointerMove, onOrient]);

  const handleBegin = useCallback(async () => {
    if (modeRef.current === "audio") return;
    setCompleted(false);
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    if (!AC) {
      // no Web Audio at all — the preview still tells the visual story.
      setFellBack(true);
      return;
    }
    const ac = new AC();
    try {
      await ac.resume();
    } catch {
      /* resume best-effort */
    }
    ctxRef.current = ac;
    const engine = createPassageAudio(ac);
    audioRef.current = engine;
    setFellBack(engine.fellBack);
    audioT0Ref.current = ac.currentTime;
    setMode("audio");
  }, []);

  const handlePreview = useCallback(() => {
    if (modeRef.current === "audio") return;
    setCompleted(false);
    previewStartRef.current = performance.now();
    setMode("preview");
  }, []);

  const handleStop = useCallback(() => {
    finishAudio();
    setCompleted(false);
  }, [finishAudio]);

  const running = mode === "audio";

  return (
    <main className="relative min-h-screen overflow-hidden bg-background text-foreground">
      {/* ── art layer: the near-blank luminous corridor ─────────────────── */}
      <div
        ref={stageRef}
        aria-hidden
        className="pointer-events-none fixed inset-0"
      >
        <div
          ref={haloRef}
          className="absolute left-1/2 top-[46%] h-[120vmin] w-[120vmin] -translate-x-1/2 -translate-y-1/2"
        />
        <div
          ref={bloomRef}
          className="absolute left-1/2 top-[46%] h-[42vmin] w-[42vmin] rounded-full will-change-transform"
        />
      </div>

      {/* thin arc-progress line */}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-20 h-px bg-border/40">
        <div
          ref={progRef}
          className="h-full bg-primary/60 transition-none"
          style={{ width: "0%" }}
        />
      </div>

      {/* faint phase label */}
      <div className="pointer-events-none fixed inset-x-0 bottom-[8%] z-20 flex justify-center">
        <span
          ref={labelRef}
          className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground"
        >
          the threshold · resting
        </span>
      </div>

      {/* ── chrome ──────────────────────────────────────────────────────── */}
      <div className="relative z-30 max-w-md p-5 sm:p-7">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          9304 · passage · audio-first
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
          Passage
        </h1>
        <p className="mt-3 text-base leading-relaxed text-muted-foreground">
          Spatial sound alone carries you through the archetypal passage — a
          receding tunnel, warm voices streaming past your ears, a growing
          being-of-light ahead, a lucid clarity-snap, and a warm return. The
          screen is almost blank on purpose; the journey is in the headphones.
        </p>

        <div className="mt-5 flex flex-wrap items-center gap-2.5">
          {!running ? (
            <button
              onClick={handleBegin}
              className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Begin (headphones)
            </button>
          ) : (
            <button
              onClick={handleStop}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              End the passage
            </button>
          )}
          <button
            onClick={handlePreview}
            disabled={running || mode === "preview"}
            className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40"
          >
            {mode === "preview"
              ? "Previewing…"
              : "Preview the whole journey (~30s)"}
          </button>
        </div>

        <p className="mt-3 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          best with headphones · ~4–5 min · plays itself
        </p>

        {running && (
          <p className="mt-2 text-sm text-muted-foreground">
            Moving through the corridor. Lean forward — tilt your phone, or
            move the pointer toward the top — to press ahead a little faster.
          </p>
        )}

        {fellBack && (
          <p className="mt-3 text-sm text-destructive">
            HRTF binaural panning is unavailable here, so the corridor is
            rendered with a coarser stereo (ITD/ILD) pass-by. Headphones still
            help; a recent desktop Chrome or Safari gives the full effect.
          </p>
        )}

        {completed && (
          <p className="mt-3 text-sm text-muted-foreground">
            Returned. Begin again whenever you like.
          </p>
        )}
      </div>

      <PrototypeNav slugs={["9304-passage"]} />
    </main>
  );
}
