"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  applyPanic,
  applyParams,
  applyStab,
  clamp,
  CUTOFF_MAX,
  CUTOFF_MIN,
  DELAY_HZ_MAX,
  DELAY_HZ_MIN,
  type HowlParams,
  type HowlState,
  LOOP_GAIN_MAX,
  makeDefaultParams,
  makeHowl,
  Q_MAX,
  Q_MIN,
  readAnalyser,
} from "./audio";
import { makeRenderer, type Renderer } from "./gpu";

// 601-feedback-howl — a no-input self-oscillating feedback instrument.
//
// The whole piece wires three helper subsystems together:
//   audio.ts  — the self-feeding Web Audio loop + every safety clamp
//   gpu.ts    — the violent WGSL spectrum (with a real Canvas2D fallback)
//   this file — keyboard + device-tilt control mapping, idle auto-demo, HUD
//
// There is NO external source: the sound IS its own feedback ring. You sculpt
// the chaos with the keyboard and your phone's tilt, off the glass.

// Auto-demo: a low, safe loop gain so a muted 06:30 glance still writhes.
const DEMO_LOOP_GAIN = 0.62;
const DEMO_MASTER = 0.16;
const IDLE_RESUME_MS = 5000; // demo wander resumes after this much idle

// Live-input loop gain target when the visitor first takes over.
const PLAY_MASTER = 0.32;

export default function FeedbackHowl() {
  const [started, setStarted] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [tiltMsg, setTiltMsg] = useState<string>(
    "Tilt control inactive until you Start (or unavailable on desktop).",
  );
  const [gpuMode, setGpuMode] = useState<"webgpu" | "canvas2d" | "—">("—");
  const [muted, setMuted] = useState(false);
  const [showNotes, setShowNotes] = useState(false);

  // HUD readouts (updated from the raf loop via state every few frames).
  const [hud, setHud] = useState({
    loopGain: 0,
    delayHz: 220,
    cutoff: 900,
    resonance: 9,
    peak: 0,
    auto: true,
  });

  const howlRef = useRef<HowlState | null>(null);
  const rendererRef = useRef<Renderer | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef(0);

  const autoRef = useRef(true); // true => auto-demo wander drives params
  const lastInputRef = useRef(0); // performance.now() of last real input
  const startedRef = useRef(false);
  const mutedRef = useRef(false);
  const hudFrameRef = useRef(0);

  // Tilt offsets (degrees) folded into params each frame when active.
  const tiltRef = useRef<{ active: boolean; beta: number; gamma: number }>({
    active: false,
    beta: 0,
    gamma: 0,
  });
  const tiltHandlerRef = useRef<((e: DeviceOrientationEvent) => void) | null>(
    null,
  );

  // Mark "real input just happened" → take over from the auto-demo.
  const markInput = useCallback(() => {
    autoRef.current = false;
    lastInputRef.current = performance.now();
  }, []);

  // ── apply a relative nudge to a live param (keyboard / tilt) ───────────────
  const nudge = useCallback((delta: Partial<HowlParams>) => {
    const s = howlRef.current;
    if (!s) return;
    const p = s.params;
    const next: Partial<HowlParams> = {};
    if (delta.loopGain !== undefined)
      next.loopGain = clamp(p.loopGain + delta.loopGain, 0, LOOP_GAIN_MAX);
    if (delta.delayHz !== undefined)
      next.delayHz = clamp(p.delayHz + delta.delayHz, DELAY_HZ_MIN, DELAY_HZ_MAX);
    if (delta.cutoff !== undefined)
      next.cutoff = clamp(p.cutoff + delta.cutoff, CUTOFF_MIN, CUTOFF_MAX);
    if (delta.resonance !== undefined)
      next.resonance = clamp(p.resonance + delta.resonance, Q_MIN, Q_MAX);
    applyParams(s, next);
  }, []);

  // ── PANIC kill ─────────────────────────────────────────────────────────────
  const panic = useCallback(() => {
    const s = howlRef.current;
    if (!s) return;
    markInput();
    applyPanic(s);
    mutedRef.current = true;
    setMuted(true);
  }, [markInput]);

  // ── mute / unmute ──────────────────────────────────────────────────────────
  const toggleMute = useCallback(() => {
    const s = howlRef.current;
    if (!s) return;
    const next = !mutedRef.current;
    mutedRef.current = next;
    setMuted(next);
    applyParams(s, { muted: next, master: next ? s.params.master : PLAY_MASTER });
  }, []);

  // ── keyboard mapping ───────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = howlRef.current;
      if (!s) return;
      let handled = true;
      switch (e.key) {
        case "ArrowUp":
          nudge({ loopGain: 0.03 });
          break;
        case "ArrowDown":
          nudge({ loopGain: -0.03 });
          break;
        case "ArrowLeft":
          nudge({ delayHz: -18 });
          break;
        case "ArrowRight":
          nudge({ delayHz: 18 });
          break;
        case "[":
          nudge({ cutoff: -220 });
          break;
        case "]":
          nudge({ cutoff: 220 });
          break;
        case "-":
        case "_":
          nudge({ resonance: -1.2 });
          break;
        case "=":
        case "+":
          nudge({ resonance: 1.2 });
          break;
        case " ":
          applyStab(s);
          break;
        case "p":
        case "P":
        case "Escape":
          panic();
          break;
        default:
          // number keys 1..9 jump cutoff across the band
          if (e.key >= "1" && e.key <= "9") {
            const t = (parseInt(e.key, 10) - 1) / 8;
            applyParams(s, { cutoff: CUTOFF_MIN + t * (CUTOFF_MAX - CUTOFF_MIN) });
          } else {
            handled = false;
          }
      }
      if (handled) {
        e.preventDefault();
        markInput();
        // any key after a panic un-mutes so you can play again
        if (mutedRef.current && e.key !== "Escape" && e.key.toLowerCase() !== "p") {
          mutedRef.current = false;
          setMuted(false);
          applyParams(s, { muted: false, master: PLAY_MASTER });
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [nudge, panic, markInput]);

  // ── device tilt → cutoff (front/back) + delay/pitch (left/right) ───────────
  const armTilt = useCallback(async () => {
    type OrientPerm = {
      requestPermission?: () => Promise<"granted" | "denied">;
    };
    const DOE = (window as unknown as {
      DeviceOrientationEvent?: OrientPerm;
    }).DeviceOrientationEvent;

    if (typeof window === "undefined" || !("DeviceOrientationEvent" in window)) {
      setTiltMsg("Tilt unavailable on this device — keyboard only.");
      return;
    }

    // iOS 13+ requires a permission request from inside the start gesture.
    if (DOE && typeof DOE.requestPermission === "function") {
      try {
        const res = await DOE.requestPermission();
        if (res !== "granted") {
          setTiltMsg("Tilt permission denied — keyboard only.");
          return;
        }
      } catch {
        setTiltMsg("Tilt permission denied — keyboard only.");
        return;
      }
    }

    const handler = (e: DeviceOrientationEvent) => {
      if (e.beta === null && e.gamma === null) return;
      tiltRef.current.active = true;
      tiltRef.current.beta = e.beta ?? 0;
      tiltRef.current.gamma = e.gamma ?? 0;
      markInput();
    };
    tiltHandlerRef.current = handler;
    window.addEventListener("deviceorientation", handler);
    setTiltMsg("Tilt active — tilt forward/back to bend cutoff, left/right to bend pitch.");

    // If no orientation events arrive within ~1.5s, fall back silently.
    window.setTimeout(() => {
      if (!tiltRef.current.active) {
        setTiltMsg("No tilt sensor detected — keyboard only.");
      }
    }, 1500);
  }, [markInput]);

  // ── render + demo-wander loop ──────────────────────────────────────────────
  const drawFrame = useCallback(() => {
    const s = howlRef.current;
    const r = rendererRef.current;
    if (s && r) {
      const peak = readAnalyser(s);

      // Auto-demo wander: slowly drift params so the field keeps writhing.
      const now = performance.now();
      if (!autoRef.current && now - lastInputRef.current > IDLE_RESUME_MS) {
        autoRef.current = true;
      }
      if (autoRef.current) {
        const t = now / 1000;
        applyParams(s, {
          loopGain: DEMO_LOOP_GAIN + Math.sin(t * 0.23) * 0.08,
          delayHz: 200 + Math.sin(t * 0.17) * 120,
          cutoff: 1100 + Math.sin(t * 0.31 + 1.3) * 900,
          resonance: 8 + Math.sin(t * 0.4) * 5,
          master: mutedRef.current ? s.params.master : DEMO_MASTER,
          muted: mutedRef.current,
        });
      } else if (tiltRef.current.active && !mutedRef.current) {
        // Tilt bends absolute targets around the current center.
        const beta = clamp(tiltRef.current.beta, -60, 60); // front/back
        const gamma = clamp(tiltRef.current.gamma, -60, 60); // left/right
        const cutoff =
          CUTOFF_MIN +
          ((beta + 60) / 120) * (CUTOFF_MAX - CUTOFF_MIN) * 0.9 +
          CUTOFF_MIN * 0.1;
        const delayHz =
          DELAY_HZ_MIN + ((gamma + 60) / 120) * (DELAY_HZ_MAX - DELAY_HZ_MIN);
        applyParams(s, { cutoff, delayHz });
      }

      try {
        r.draw(s.freqData, s.timeData, peak);
      } catch {
        // GPU hiccup — keep the loop alive; next frame may recover.
      }

      // Throttle HUD state updates to ~every 6 frames.
      hudFrameRef.current = (hudFrameRef.current + 1) % 6;
      if (hudFrameRef.current === 0) {
        setHud({
          loopGain: s.params.loopGain,
          delayHz: s.params.delayHz,
          cutoff: s.params.cutoff,
          resonance: s.params.resonance,
          peak,
          auto: autoRef.current,
        });
      }
    }
    rafRef.current = requestAnimationFrame(drawFrame);
  }, []);

  // ── start (the audio gesture) ──────────────────────────────────────────────
  const begin = useCallback(
    async (fromGesture: boolean) => {
      if (startedRef.current) return;
      startedRef.current = true;
      try {
        const s = await makeHowl();
        howlRef.current = s;
        await s.ctx.resume();

        // Kick self-oscillation: seed the loop and ramp into the gentle demo.
        s.seedNoise();
        applyParams(s, {
          ...makeDefaultParams(),
          loopGain: DEMO_LOOP_GAIN,
          master: DEMO_MASTER,
          muted: false,
        });
        autoRef.current = true;
        lastInputRef.current = 0;

        setStarted(true);
        // Only ask for tilt permission inside a real user gesture (iOS-safe).
        if (fromGesture) void armTilt();
      } catch (e) {
        startedRef.current = false;
        setErrMsg(
          "Audio could not start in this browser. " + (e as Error).message,
        );
      }
    },
    [armTilt],
  );

  // Mount: build renderer, start raf, arm idle auto-start (~2.5s).
  useEffect(() => {
    let cancelled = false;
    const idle = window.setTimeout(() => {
      // Idle auto-demo: start audio at safe low level WITHOUT a gesture.
      // (No tilt-permission prompt here — that needs a real gesture.)
      void begin(false);
    }, 2500);

    // Size the canvas backing store to device pixels (gpu.ts reads w/h).
    const resize = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.max(1, Math.floor(window.innerWidth * dpr));
      canvas.height = Math.max(1, Math.floor(window.innerHeight * dpr));
    };
    resize();
    window.addEventListener("resize", resize);

    (async () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      try {
        const r = await makeRenderer(canvas);
        if (cancelled) {
          r.dispose();
          return;
        }
        rendererRef.current = r;
        setGpuMode(r.mode);
      } catch {
        setErrMsg("Could not initialise the visual renderer.");
      }
      rafRef.current = requestAnimationFrame(drawFrame);
    })();

    return () => {
      cancelled = true;
      window.clearTimeout(idle);
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(rafRef.current);
      if (tiltHandlerRef.current)
        window.removeEventListener("deviceorientation", tiltHandlerRef.current);
      rendererRef.current?.dispose();
      const s = howlRef.current;
      if (s) {
        try {
          applyPanic(s);
        } catch {
          /* ignore */
        }
        if (s.ctx.state !== "closed") void s.ctx.close();
      }
    };
    // begin/drawFrame are stable; run this effect once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-black text-white/95">
      {/* The violent reactive spectrum fills the screen. */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 block h-full w-full"
      />

      {/* Header */}
      <div className="pointer-events-none relative z-10 px-6 pt-8 sm:px-10">
        <h1 className="font-mono text-2xl text-white sm:text-3xl">
          601 · feedback howl
        </h1>
        <p className="mt-2 max-w-2xl text-base text-white/75">
          A no-input instrument: a Web Audio graph fed back into itself, howling
          on the edge of runaway — sculpt the chaos with your keyboard and your
          phone&apos;s tilt.
        </p>
        {errMsg && (
          <p className="mt-3 max-w-2xl text-base text-rose-300">{errMsg}</p>
        )}
        <p className="mt-2 max-w-2xl text-base text-rose-300">{tiltMsg}</p>
      </div>

      {/* Start overlay (the audio + tilt gesture) */}
      {!started && !errMsg && (
        <div className="absolute inset-0 z-20 flex items-center justify-center">
          <button
            onClick={() => void begin(true)}
            className="min-h-[44px] rounded-md border border-rose-300/40 bg-rose-300/10 px-4 py-2.5 font-mono text-base text-rose-300 transition hover:bg-rose-300/20"
          >
            Start the howl
          </button>
        </div>
      )}

      {/* Controls row */}
      {started && (
        <div className="absolute bottom-6 left-6 z-10 flex flex-wrap gap-3 sm:left-10">
          <button
            onClick={panic}
            className="min-h-[44px] rounded-md border border-rose-400/60 bg-rose-500/20 px-4 py-2.5 font-mono text-base text-rose-200 transition hover:bg-rose-500/35"
          >
            PANIC / kill
          </button>
          <button
            onClick={toggleMute}
            className="min-h-[44px] rounded-md border border-white/25 px-4 py-2.5 font-mono text-base text-white/85 transition hover:bg-white/10"
          >
            {muted ? "unmute" : "mute"}
          </button>
        </div>
      )}

      {/* HUD — monospace readouts */}
      {started && (
        <div className="absolute right-6 top-8 z-10 rounded-md border border-white/15 bg-black/50 px-3 py-2 font-mono text-base text-white/85 sm:right-10">
          <div>
            mode <span className="text-white/60">{gpuMode}</span>
            {hud.auto && <span className="ml-2 text-rose-300">[auto-demo]</span>}
          </div>
          <div>loop gain {hud.loopGain.toFixed(3)}</div>
          <div>delay {hud.delayHz.toFixed(0)} Hz</div>
          <div>cutoff {hud.cutoff.toFixed(0)} Hz</div>
          <div>res Q {hud.resonance.toFixed(1)}</div>
          <div>
            peak{" "}
            <span className={hud.peak > 0.7 ? "text-rose-300" : "text-white/60"}>
              {hud.peak.toFixed(2)}
            </span>
          </div>
        </div>
      )}

      {/* Key map */}
      {started && (
        <div className="absolute bottom-6 right-6 z-10 max-w-xs rounded-md border border-white/15 bg-black/50 px-3 py-2 font-mono text-base text-white/75 sm:right-10">
          <div className="text-white/85">key map</div>
          <div>up / down — loop gain (tension)</div>
          <div>left / right — delay (pitch of howl)</div>
          <div>[ / ] — filter cutoff</div>
          <div>- / = — resonance Q</div>
          <div>1 – 9 — jump cutoff</div>
          <div>space — stab (screech)</div>
          <div>P / Esc — PANIC kill</div>
          <div className="mt-1 text-white/55">tilt — bend cutoff &amp; pitch</div>
        </div>
      )}

      {/* Design notes link → this prototype's README.md */}
      <a
        href="https://github.com/kbarnoski/resonance/blob/main/src/app/dream/601-feedback-howl/README.md"
        target="_blank"
        rel="noreferrer"
        onClick={(e) => {
          e.preventDefault();
          setShowNotes(true);
        }}
        className="absolute left-6 top-8 z-30 hidden font-mono text-base text-white/60 underline-offset-4 hover:text-white/85 hover:underline sm:left-auto sm:right-6 sm:top-[7.5rem] sm:block"
      >
        Read the design notes
      </a>

      {showNotes && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/85 px-6">
          <div className="max-w-lg rounded-lg border border-white/15 bg-zinc-950 p-6 text-base">
            <h2 className="font-mono text-xl text-white">Design notes</h2>
            <p className="mt-3 text-white/75">
              There is no input source. A single Web Audio ring —
              delay &rarr; bandpass &rarr; peaking &rarr; soft saturation &rarr;
              DC-blocking highpass &rarr; back into the delay — self-oscillates
              once a tiny noise seed kicks it. The loop gain sits just below 1.0
              so it sustains and howls.
            </p>
            <p className="mt-3 text-white/75">
              Safety: the loop gain is hard-capped below 1.0, a master brick-wall
              compressor limits the output, a highpass blocks DC pile-up, and a
              PANIC control instantly ramps the loop to zero. It is abrasive, not
              speaker-destroying.
            </p>
            <p className="mt-3 text-white/55">
              After Toshimaru Nakamura&apos;s no-input mixing board and David
              Tudor&apos;s live-electronic feedback works (Rainforest / Pulsers).
              Full notes live in the folder&apos;s README.md.
            </p>
            <button
              onClick={() => setShowNotes(false)}
              className="mt-5 min-h-[44px] rounded-md border border-white/20 px-4 py-2.5 font-mono text-base text-white/75 hover:bg-white/10"
            >
              close
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
