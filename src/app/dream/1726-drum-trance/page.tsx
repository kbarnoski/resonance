"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { makeDrumAudio, PAD_SPECS, type DrumAudio } from "./audio";
import { makeFieldRig, formNameFor, type FieldRig } from "./field";
import { prefersReducedMotion } from "../_shared/psych/safeFlicker";
import { PrototypeNav } from "../_shared/prototype-nav";

// ════════════════════════════════════════════════════════════════════════════
// 1726 · drum-trance — a shamanic THETA AUDITORY-DRIVING piece.
//
// You play a steady ~4 beats/sec pulse on touch/pointer drum pads. A theta-
// steadiness tracker measures your inter-onset intervals: how close to 4 Hz AND
// how STEADY (low variance). That reward drives a Klüver form-constant field —
// erratic = dim & scattered, locked-in = brilliant, escalating tunnel → spiral
// → honeycomb with a peripheral white-out at deep lock.
//
// Grounding: Aparicio-Terrés et al., "Neural tracking at theta predicts
// drumming-induced altered states of consciousness," Sci. Rep. 16:10204 (2026)
// — the strength of the brain's phase-lock to a steady ~4 Hz drum predicts
// trance depth. So we reward STEADINESS, not noise.
//
// Determinism: no Math.random / Date.now / performance.now in the state, audio
// or animation path. An integer FRAME COUNTER is the only clock (assumed 60 fps
// for tempo maths); ctx.currentTime is used solely to schedule audio. A ghost
// drummer auto-plays a steady 4.2 Hz on mount so the piece animates headless.
//
// Safety: the 4 Hz cadence is AUDIO; the screen never hard-strobes — beats are a
// gentle luminance breath with a high floor, softened further for reduced-motion.
// ════════════════════════════════════════════════════════════════════════════

const TARGET_IOI = 0.25; // 4 beats/sec = theta target
const GHOST_HZ = 4.2;
const GHOST_RESUME_FRAMES = 210; // ~3.5 s of user silence before ghost resumes
const GHOST_PATTERN = [0, 0, 1, 0, 0, 2, 0, 1]; // fixed, deterministic

export default function DrumTrancePage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const padRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const audioRef = useRef<DrumAudio | null>(null);
  const fieldRef = useRef<FieldRig | null>(null);
  const rafRef = useRef<number | null>(null);

  // ── the only clock: an integer frame counter ──
  const frameRef = useRef(0);

  // entrainment state
  const eRef = useRef(0);
  const beatPulseRef = useRef(0);
  const phaseRef = useRef(0);
  const hzSmoothRef = useRef(0);
  const lastOnsetFrameRef = useRef(-999);
  const ioisRef = useRef<number[]>([]);

  // ghost drummer
  const lastUserFrameRef = useRef(-99999);
  const ghostAccumRef = useRef(0);
  const ghostBeatRef = useRef(0);
  const ghostGainRef = useRef(0);

  // per-pad flash frame (for glow feedback)
  const padFlashRef = useRef<number[]>(PAD_SPECS.map(() => -999));
  const reducedRef = useRef(false);

  // canvas backing size
  const sizeRef = useRef({ W: 1, H: 1 });

  const [started, setStarted] = useState(false);
  const [audioFailed, setAudioFailed] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [metrics, setMetrics] = useState({ hz: 0, lock: 0, form: "tunnel" });

  // ── register a drum onset: the theta-steadiness tracker ──
  const registerOnset = useCallback((frame: number) => {
    const prev = lastOnsetFrameRef.current;
    lastOnsetFrameRef.current = frame;
    beatPulseRef.current = 1;

    if (prev < 0) return;
    const ioi = (frame - prev) / 60; // seconds, frame-counter clock
    if (ioi <= 0.02 || ioi > 2) {
      // a long gap or a double-trigger resets the steadiness window
      ioisRef.current = [];
      return;
    }

    const ring = ioisRef.current;
    ring.push(ioi);
    if (ring.length > 6) ring.shift();

    // how close to the 4 Hz theta target (log-ratio, tolerant of near-misses)
    const logr = Math.log(ioi / TARGET_IOI);
    const tempo = Math.exp(-(logr * logr) / (2 * 0.28 * 0.28));

    // how STEADY — low coefficient of variation across the recent window
    let steady = 0.35;
    if (ring.length >= 3) {
      let m = 0;
      for (const x of ring) m += x;
      m /= ring.length;
      let s = 0;
      for (const x of ring) s += (x - m) * (x - m);
      s = Math.sqrt(s / ring.length);
      const cv = s / Math.max(1e-4, m);
      steady = Math.exp(-(cv * cv) / (2 * 0.16 * 0.16));
    }

    const reward = tempo * steady;
    hzSmoothRef.current += (1 / ioi - hzSmoothRef.current) * 0.45;
    eRef.current += (reward - eRef.current) * 0.4;
    if (eRef.current > 1) eRef.current = 1;
  }, []);

  // ── fire a hit (ghost or user): sound + visuals + entrainment ──
  const fireHit = useCallback(
    (padIndex: number, amp: number, frame: number, isUser: boolean) => {
      if (isUser) lastUserFrameRef.current = frame;
      padFlashRef.current[padIndex] = frame;
      registerOnset(frame);
      const audio = audioRef.current;
      if (audio) audio.hit(padIndex, amp);
    },
    [registerOnset],
  );

  // ── user hit from pad / pointer / key ──
  const userHit = useCallback(
    (padIndex: number) => {
      const audio = audioRef.current;
      if (audio) void audio.resume();
      fireHit(padIndex, 0.9, frameRef.current, true);
    },
    [fireHit],
  );

  const startAudio = useCallback(() => {
    if (audioRef.current) {
      void audioRef.current.resume();
      setStarted(true);
      return;
    }
    try {
      const audio = makeDrumAudio();
      audioRef.current = audio;
      void audio.resume();
      setStarted(true);
    } catch {
      setAudioFailed(true);
    }
  }, []);

  // ── main animation loop — frame-counter driven, deterministic ──
  useEffect(() => {
    reducedRef.current = prefersReducedMotion();
    fieldRef.current = makeFieldRig();

    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      const rect = container.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const W = Math.max(1, Math.round(rect.width * dpr));
      const H = Math.max(1, Math.round(rect.height * dpr));
      canvas.width = W;
      canvas.height = H;
      sizeRef.current = { W, H };
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(container);

    const loop = () => {
      const f = ++frameRef.current;
      const reduced = reducedRef.current;
      const field = fieldRef.current;

      // ghost drummer — suppressed while the user is playing
      const suppressed = f - lastUserFrameRef.current < GHOST_RESUME_FRAMES;
      const gTarget = suppressed ? 0 : 1;
      ghostGainRef.current += (gTarget - ghostGainRef.current) * 0.05;
      if (!suppressed) {
        ghostAccumRef.current += GHOST_HZ / 60;
        if (ghostAccumRef.current >= 1) {
          ghostAccumRef.current -= 1;
          const pad = GHOST_PATTERN[ghostBeatRef.current % GHOST_PATTERN.length];
          ghostBeatRef.current++;
          fireHit(pad, 0.72 * ghostGainRef.current, f, false);
        }
      }

      // entrainment decay + beat-pulse decay
      eRef.current *= 0.992;
      if (eRef.current < 0) eRef.current = 0;
      beatPulseRef.current *= 0.86;

      // form-constant phase drift (inward tunnel motion), faster when locked
      const drift = 0.018 * (reduced ? 0.4 : 1) * (0.4 + eRef.current * 1.4);
      phaseRef.current -= drift;

      // render the field
      if (field) {
        const { W, H } = sizeRef.current;
        field.render(ctx, W, H, {
          E: eRef.current,
          beatPulse: beatPulseRef.current,
          phase: phaseRef.current,
          reduced,
        });
      }

      // pad glow feedback (frame-based, no timers)
      for (let i = 0; i < padRefs.current.length; i++) {
        const el = padRefs.current[i];
        if (!el) continue;
        const glow = Math.max(0, 1 - (f - padFlashRef.current[i]) / 12);
        el.style.transform = glow > 0 ? `scale(${1 - glow * 0.06})` : "scale(1)";
        if (glow > 0.4) el.setAttribute("data-hit", "1");
        else el.removeAttribute("data-hit");
      }

      // throttled readout
      if (f % 10 === 0) {
        setMetrics({
          hz: hzSmoothRef.current,
          lock: eRef.current,
          form: formNameFor(eRef.current),
        });
      }

      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      ro.disconnect();
      audioRef.current?.destroy();
      audioRef.current = null;
    };
  }, [fireHit]);

  // keyboard triggers (Space / F / J / K)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const key = e.key === " " ? " " : e.key.toLowerCase();
      const idx = PAD_SPECS.findIndex((p) => p.key === key);
      if (idx >= 0) {
        e.preventDefault();
        userHit(idx);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [userHit]);

  const lockPct = Math.round(metrics.lock * 100);
  const deep = metrics.lock > 0.85;

  return (
    <main className="relative h-[100dvh] w-full overflow-hidden bg-background text-foreground">
      {/* full-screen Klüver form-constant field */}
      <div ref={containerRef} className="absolute inset-0">
        <canvas ref={canvasRef} className="h-full w-full" />
      </div>

      {/* top bar: title + design notes */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-4 p-5">
        <div className="pointer-events-auto max-w-md">
          <h1 className="text-2xl font-semibold tracking-tight">Drum Trance</h1>
          <p className="mt-1 text-base text-muted-foreground">
            Drum a steady ~4 beats/sec and hold the pulse — the steadier your
            rhythm, the deeper the geometry locks in.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowNotes(true)}
          className="pointer-events-auto min-h-[44px] shrink-0 rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          Design notes
        </button>
      </div>

      {/* entrainment readout (bottom-left, mono) */}
      <div className="pointer-events-none absolute bottom-24 left-5 space-y-1 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
        <div>
          tempo{" "}
          <span className="text-foreground">
            {metrics.hz > 0 ? metrics.hz.toFixed(2) : "—"} Hz
          </span>{" "}
          / target 4.00 Hz
        </div>
        <div>
          lock <span className="text-foreground">{lockPct}%</span> · form{" "}
          <span className="text-foreground">{metrics.form}</span>
          {deep ? " · deep" : ""}
        </div>
        <div>ghost {started ? "audio live" : "auto-playing (silent)"}</div>
      </div>

      {/* drum pads (bottom-centre) */}
      <div className="pointer-events-none absolute inset-x-0 bottom-6 flex flex-col items-center gap-3 px-4">
        {!started && !audioFailed && (
          <button
            type="button"
            onClick={startAudio}
            className="pointer-events-auto min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Enable sound
          </button>
        )}
        {audioFailed && (
          <p className="pointer-events-auto text-sm text-destructive">
            Audio unavailable — visuals still respond to the pads.
          </p>
        )}
        <div className="pointer-events-auto flex flex-wrap items-center justify-center gap-3">
          {PAD_SPECS.map((pad, i) => {
            const centre = pad.role === "centre";
            return (
              <button
                key={pad.label}
                type="button"
                ref={(el) => {
                  padRefs.current[i] = el;
                }}
                onPointerDown={(e) => {
                  e.preventDefault();
                  userHit(i);
                }}
                className={[
                  "select-none rounded-lg border border-border bg-background/60 font-mono uppercase tracking-[0.14em] text-muted-foreground transition-colors",
                  "data-[hit]:border-primary data-[hit]:bg-primary/20 data-[hit]:text-foreground",
                  "hover:bg-accent hover:text-foreground",
                  centre
                    ? "h-[112px] w-[112px] rounded-full text-sm"
                    : "h-[76px] w-[76px] text-xs",
                ].join(" ")}
                style={{ touchAction: "none" }}
              >
                <span className="block">{pad.label}</span>
                <span className="mt-0.5 block text-[10px] text-muted-foreground/70">
                  {pad.keyLabel}
                </span>
              </button>
            );
          })}
        </div>
        <p className="pointer-events-auto max-w-md text-center text-xs text-muted-foreground">
          Tap a pad steadily (hold ~4 taps/sec). Multi-touch, mouse, or
          Space / F / J / K all play. Stop, and the ghost drummer resumes.
        </p>
      </div>

      {/* design-notes overlay */}
      {showNotes && (
        <div
          className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-2xl font-semibold tracking-tight">
              About this piece
            </h2>
            <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                A drug-free shamanic theta-driving toy. Drumming a steady ~4 Hz
                pulse (theta band) is associated with drumming-induced altered
                states, and the strength of the brain&apos;s phase-lock to that
                steady beat predicts trance depth (Aparicio-Terrés et al.,
                Scientific Reports 16:10204, 2026). So this rewards STEADINESS,
                not loudness.
              </p>
              <p>
                Every hit is a modal membrane-drum voice — a noise transient
                exciting detuned, inharmonic resonators. A tracker measures your
                inter-onset intervals for closeness to 4 Hz and low variance,
                and feeds a smoothed &ldquo;entrainment&rdquo; scalar. That
                scalar brightens and escalates a Klüver form-constant field
                (tunnel → spiral → honeycomb, the universal geometry of trance),
                dissolving the boundary in a white-out at deep lock.
              </p>
              <p>
                Canvas2D by choice, no strobe (the 4 Hz cadence is audio; the
                screen only breathes gently). A deterministic ghost drummer
                plays on its own until you take over. See the folder README for
                the full write-up and honest limitations.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowNotes(false)}
              className="mt-5 min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Close
            </button>
          </div>
        </div>
      )}

      <PrototypeNav slugs={["1726-drum-trance"]} />
    </main>
  );
}
