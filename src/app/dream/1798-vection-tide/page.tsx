"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 1798-vection-tide
//   state: audio-forward spatial-vection sound-bath · pole: cosmic-ambient
//
// Eyes-closed, screen deliberately near-dark. A field of warm HRTF-spatialized
// tones ORBITS your head in true 3-D; the coherent sweep of the whole sound-
// world is read by the brain as YOUR OWN motion — auditory vection — with no
// beat frequency doing the work (see README + PLOS One 2024, PMC11290623).
//
// Breath (mic, best-effort) opens the tide: deeper breath → wider, higher,
// faster orbits. With no mic it self-drives from a deterministic ~0.05 Hz
// breathing curve, so it demos headless with zero permission grants.
//
// Determinism: an integer frame counter (60 fps) drives every position and the
// horizon. No Math.random / Date.now / new Date in output-affecting code.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import { VectionEngine } from "./audio";
import { PrototypeNav } from "../_shared/prototype-nav";
import { prefersReducedMotion } from "../_shared/psych/safeFlicker";

export default function Page() {
  const [running, setRunning] = useState(false);
  const [muted, setMuted] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [tideState, setTideState] = useState("drifting");
  const [micNote, setMicNote] = useState<string | null>(null);
  const [fallbackNote, setFallbackNote] = useState<string | null>(null);

  const engineRef = useRef<VectionEngine | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const timeBufRef = useRef<Uint8Array | null>(null);
  const rafRef = useRef<number | null>(null);
  const frameRef = useRef(0);
  const breathRef = useRef(0.3);
  const mutedRef = useRef(false);
  const lastStateRef = useRef("drifting");

  // imperative refs for the dim horizon (updated per-frame, no React re-render)
  const tiltRef = useRef<SVGGElement | null>(null);
  const haloRef = useRef<SVGEllipseElement | null>(null);
  const lineRef = useRef<SVGLineElement | null>(null);

  useEffect(() => {
    mutedRef.current = muted;
    engineRef.current?.setMuted(muted);
  }, [muted]);

  const stop = useCallback(() => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    engineRef.current?.stop();
    engineRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    analyserRef.current = null;
    timeBufRef.current = null;
    const ctx = ctxRef.current;
    ctxRef.current = null;
    if (ctx && ctx.state !== "closed") void ctx.close();
    setRunning(false);
  }, []);

  useEffect(() => () => stop(), [stop]);

  /** RMS of the mic time-domain frame → 0..1 breath estimate, or null. */
  const readBreath = useCallback((): number | null => {
    const analyser = analyserRef.current;
    const buf = timeBufRef.current;
    if (!analyser || !buf) return null;
    analyser.getByteTimeDomainData(buf as unknown as Uint8Array<ArrayBuffer>);
    let sum = 0;
    for (let i = 0; i < buf.length; i++) {
      const v = (buf[i] - 128) / 128;
      sum += v * v;
    }
    const rms = Math.sqrt(sum / buf.length);
    // breath is quiet & broadband; lift and clamp into a usable 0..1 band
    const shaped = Math.max(0, Math.min(1, (rms - 0.006) * 9));
    breathRef.current += (shaped - breathRef.current) * 0.08;
    return breathRef.current;
  }, []);

  const start = useCallback(async () => {
    if (running) return;
    const reduced = prefersReducedMotion();

    // ── AudioContext must be created inside the Begin gesture ─────────────────
    let ctx: AudioContext;
    try {
      const Ctor: typeof AudioContext =
        window.AudioContext ||
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (window as any).webkitAudioContext;
      ctx = new Ctor();
      await ctx.resume();
    } catch {
      return;
    }
    ctxRef.current = ctx;

    const engine = new VectionEngine(ctx);
    engineRef.current = engine;
    engine.start();
    engine.setReducedMotion(reduced);
    engine.setMuted(mutedRef.current);
    if (!engine.usingHRTF) {
      setFallbackNote(
        "PannerNode/HRTF unavailable — using a stereo-azimuth fallback (still directional).",
      );
    }

    // ── best-effort mic for breath coupling ──────────────────────────────────
    let haveMic = false;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.85;
      src.connect(analyser); // NOT connected to destination — no feedback
      analyserRef.current = analyser;
      timeBufRef.current = new Uint8Array(new ArrayBuffer(analyser.fftSize));
      haveMic = true;
      setMicNote(null);
    } catch {
      haveMic = false;
    }
    if (!haveMic) {
      setMicNote("No microphone — the tide is self-driving (deterministic breath).");
    }

    frameRef.current = 0;
    setRunning(true);

    // ── the frame loop: integer counter drives positions + horizon ───────────
    const loop = () => {
      const frame = frameRef.current++;
      const micBreath = analyserRef.current ? readBreath() : null;
      const r = engine.update(frame, micBreath);

      // dim breathing horizon (all slow drift, well under 0.3 Hz)
      const damp = reduced ? 0.4 : 1;
      const tilt = tiltRef.current;
      if (tilt) {
        const deg = r.lift * 4.5 * damp; // subtle tilt of the whole horizon
        const rise = -r.lift * 10 * damp; // slight vertical carry
        tilt.setAttribute("transform", `translate(0 ${rise}) rotate(${deg} 500 300)`);
      }
      const halo = haloRef.current;
      if (halo) {
        halo.setAttribute("opacity", (0.08 + r.breath * 0.3 * damp).toFixed(3));
        const rx = 260 + r.spread * 220 * damp;
        halo.setAttribute("rx", rx.toFixed(1));
        halo.setAttribute("ry", (60 + r.spread * 40 * damp).toFixed(1));
      }
      const line = lineRef.current;
      if (line) line.setAttribute("opacity", (0.18 + r.breath * 0.22 * damp).toFixed(3));

      if (r.state !== lastStateRef.current) {
        lastStateRef.current = r.state;
        setTideState(r.state);
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
  }, [running, readBreath]);

  return (
    <main className="relative min-h-screen overflow-hidden bg-background text-foreground">
      {/* ── the dim breathing horizon (SVG, intentionally near-dark) ───────── */}
      <svg
        className="pointer-events-none absolute inset-0 h-full w-full text-primary"
        viewBox="0 0 1000 600"
        preserveAspectRatio="xMidYMid slice"
        aria-hidden="true"
      >
        <defs>
          <radialGradient id="vt-halo" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.9" />
            <stop offset="55%" stopColor="currentColor" stopOpacity="0.25" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="vt-line" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0" />
            <stop offset="50%" stopColor="currentColor" stopOpacity="1" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
        </defs>
        <g ref={tiltRef}>
          <ellipse
            ref={haloRef}
            cx="500"
            cy="300"
            rx="300"
            ry="70"
            fill="url(#vt-halo)"
            opacity="0.1"
          />
          <line
            ref={lineRef}
            x1="60"
            y1="300"
            x2="940"
            y2="300"
            stroke="url(#vt-line)"
            strokeWidth="1.5"
            opacity="0.2"
          />
        </g>
      </svg>

      {/* ── the sparse UI, floated over the dark ──────────────────────────── */}
      <div className="relative z-10 mx-auto flex min-h-screen max-w-2xl flex-col justify-center px-6 py-16">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          Auditory vection · HRTF sound-bath
        </p>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">
          Vection Tide
        </h1>
        <p className="mt-4 text-base text-muted-foreground">
          Headphones on, eyes closed. A field of warm tones orbits your head in
          true 3-D until the whole sound-world &mdash; not any beat &mdash; seems
          to carry you through space. The screen stays deliberately dark.
        </p>

        {!running ? (
          <div className="mt-8">
            <button
              type="button"
              onClick={start}
              className="min-h-[44px] rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
            >
              Begin
            </button>
            <p className="mt-3 text-sm text-muted-foreground">
              Best on headphones. Grant the mic to steer the tide with your
              breath, or skip it &mdash; the tide self-drives either way.
            </p>
          </div>
        ) : (
          <div className="mt-8 flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => setMuted((m) => !m)}
                className="min-h-[44px] rounded-md border border-border bg-background px-4 text-sm font-medium text-foreground transition-colors hover:bg-accent"
              >
                {muted ? "Unmute" : "Mute"}
              </button>
              <button
                type="button"
                onClick={stop}
                className="min-h-[44px] rounded-md border border-border bg-background px-4 text-sm font-medium text-foreground transition-colors hover:bg-accent"
              >
                End
              </button>
            </div>
            <p className="text-base text-muted-foreground">
              The tide is{" "}
              <span className="font-mono text-primary">{tideState}</span>.
            </p>
            {micNote && <p className="text-sm text-destructive">{micNote}</p>}
            {fallbackNote && (
              <p className="text-sm text-destructive">{fallbackNote}</p>
            )}
          </div>
        )}
      </div>

      {/* ── design-notes affordance ───────────────────────────────────────── */}
      <button
        type="button"
        onClick={() => setShowNotes(true)}
        className="absolute bottom-4 right-4 z-20 min-h-[44px] rounded-md border border-border bg-background px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        Design notes
      </button>

      {showNotes && (
        <div
          className="fixed inset-0 z-30 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-2xl font-semibold tracking-tight">Design notes</h2>
            <div className="mt-4 space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                The question: could sound alone, with the screen near-dark, carry
                you bodily through space? Several warm pad partials plus a soft
                filtered-noise wind each ride their own slow elliptical or
                figure-8 orbit around your head via HRTF panning
                (0.035&ndash;0.13 Hz). The coherent sweep of the whole field is
                read as <em>self</em> motion &mdash; auditory vection.
              </p>
              <p>
                The lever is spatial <em>motion</em>, not a beat frequency. Two
                sources also carry a real 6 Hz and 40 Hz oscillation patched into
                their vertical <em>position</em> (not amplitude &mdash; no
                strobe), the exact variable PLOS One 2024 (PMC11290623) isolates.
              </p>
              <p>
                Breath from the mic opens the tide &mdash; deeper breath widens,
                lifts and speeds the orbits. With no mic it self-drives from a
                deterministic breathing curve. Master gain is modest and runs
                through a compressor so orbits never clip. Full detail in the
                folder&apos;s README.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowNotes(false)}
              className="mt-5 min-h-[44px] rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
            >
              Close
            </button>
          </div>
        </div>
      )}

      <PrototypeNav slugs={["1798-vection-tide"]} />
    </main>
  );
}
