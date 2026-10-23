"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 24600-stillpoint — the lab's deliberate no-screen / audio-only / eyes-closed
// piece. One of Karel's real takes is split into four perceptual VOICES and
// HRTF-panned to fixed spots on a dome around your head. The field is
// WORLD-LOCKED: turn your body (phone compass, or drag / arrow keys) to face a
// voice and it comes forward, louder and brighter; LEAN toward it and it comes
// closer in real distance (6DoF, after Chen & Boren, AES 159, 2025).
//
// The screen is near-dark on purpose — the SOUND is the piece. A single warm
// radial breath-glow tracks where the sound sits relative to your facing, and
// breathes with the music. Everything audible lives in ./audio.ts.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import { useImmersive, ImmersiveHud } from "../_shared/immersive";
import { REAL_TRACKS } from "../_shared/welcomeHome";
import { StillpointEngine } from "./audio";

type InputMode = "live" | "pointer" | "keys" | "auto";

const TAU = Math.PI * 2;
const clamp = (v: number, lo: number, hi: number) =>
  v < lo ? lo : v > hi ? hi : v;

const IDLE_AFTER_MS = 3500; // untouched → the field auto-drifts
const DRIFT_FULL_TURN_S = 30; // every voice sweeps the front over ~30s
const SENSOR_FRESH_MS = 1400;

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function")
    return false;
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

export default function StillpointPage() {
  const { immersive, toggle } = useImmersive();

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<StillpointEngine | null>(null);
  const rafRef = useRef(0);

  // shared control state (all input paths write these)
  const yawRef = useRef(0);
  const pitchRef = useRef(0);
  const leanRef = useRef(0);

  // input bookkeeping
  const keyRef = useRef({ left: false, right: false, lean: 0 });
  const dragRef = useRef<{ active: boolean; x: number; y: number }>({
    active: false,
    x: 0,
    y: 0,
  });
  const lastInputRef = useRef(0);
  const lastSensorRef = useRef(0);
  const modeRef = useRef<InputMode>("auto");

  // discrete UI state
  const [running, setRunning] = useState(false);
  const [starting, setStarting] = useState(false);
  const [trackId, setTrackId] = useState<string>(REAL_TRACKS[0].id);
  const [playingTitle, setPlayingTitle] = useState<string>("");
  const [mode, setMode] = useState<InputMode>("auto");
  const [dominant, setDominant] = useState<string>("");
  const [leanPct, setLeanPct] = useState(0);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // ── begin: user gesture unlocks audio + (on iOS) requests the compass ──────
  const begin = useCallback(async () => {
    if (engineRef.current?.isRunning || starting) return;
    setStarting(true);
    setAudioError(null);
    setNotice(null);

    const engine = new StillpointEngine();
    engineRef.current = engine;
    try {
      await engine.start(trackId);
      setPlayingTitle(engine.title);
      setRunning(true);
    } catch {
      setAudioError(
        "That recording could not be decoded right now — check your connection and try again. (No synthesized stand-in: this piece is only his piano.)",
      );
      engineRef.current = null;
      setStarting(false);
      return;
    }

    // iOS 13+ needs the orientation permission requested inside this gesture.
    try {
      const doe = window.DeviceOrientationEvent as unknown as {
        requestPermission?: () => Promise<"granted" | "denied">;
      };
      if (doe && typeof doe.requestPermission === "function") {
        const res = await doe.requestPermission();
        if (res !== "granted") {
          setNotice(
            "Motion access denied — drag anywhere, or use arrow keys / WASD, to turn and lean.",
          );
        }
      }
    } catch {
      /* non-iOS or already granted — pointer + keys always work */
    }

    setStarting(false);
  }, [trackId, starting]);

  const stop = useCallback(async () => {
    const engine = engineRef.current;
    engineRef.current = null;
    setRunning(false);
    setPlayingTitle("");
    if (engine) await engine.stop();
  }, []);

  // ── the single render + control loop ───────────────────────────────────────
  useEffect(() => {
    if (!running) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx2d = canvas.getContext("2d");
    if (!ctx2d) return;

    const reduced = prefersReducedMotion();
    let w = 0;
    let h = 0;
    let dpr = 1;

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    let prev = performance.now();
    // seed idle timer so the field drifts right away until first input
    lastInputRef.current = prev - IDLE_AFTER_MS - 1000;
    let uiThrottle = 0;
    let glowBreath = 0;

    const frame = (ts: number) => {
      const dt = Math.min(0.05, Math.max(0, (ts - prev) / 1000));
      prev = ts;
      const engine = engineRef.current;

      // ── choose the active input + advance facing/lean ──────────────────────
      const sensorFresh = ts - lastSensorRef.current < SENSOR_FRESH_MS;
      const k = keyRef.current;
      const keyTurn = (k.right ? 1 : 0) - (k.left ? 1 : 0);
      let nextMode: InputMode;

      if (sensorFresh) {
        nextMode = "live"; // device-orientation writes yaw/pitch/lean directly
      } else if (keyTurn !== 0 || k.lean !== 0) {
        yawRef.current += keyTurn * 1.6 * dt;
        if (k.lean !== 0) {
          leanRef.current = clamp(leanRef.current + k.lean * 0.9 * dt, 0, 1);
        }
        lastInputRef.current = ts;
        nextMode = "keys";
      } else if (dragRef.current.active) {
        nextMode = "pointer";
      } else if (ts - lastInputRef.current > IDLE_AFTER_MS) {
        const speed = (TAU / DRIFT_FULL_TURN_S) * (reduced ? 0.35 : 1);
        yawRef.current += speed * dt;
        // the field slowly settles to no-lean while drifting
        leanRef.current += (0 - leanRef.current) * Math.min(1, dt * 0.6);
        nextMode = "auto";
      } else {
        nextMode = modeRef.current === "live" ? "pointer" : modeRef.current;
      }

      if (nextMode !== modeRef.current) {
        modeRef.current = nextMode;
        setMode(nextMode);
      }

      // ── drive the engine with the shared state ──────────────────────────────
      let snap = { bearingX: 0, bearingY: 0, level: 0, dominant: "", lean: 0 };
      if (engine) {
        engine.setFacing(yawRef.current, pitchRef.current);
        engine.setLean(leanRef.current);
        engine.update(dt);
        snap = engine.snapshot();
      }

      // ── draw the single warm breath-glow on a near-black stage ──────────────
      glowBreath += dt;
      const breath = 0.5 + 0.5 * Math.sin(glowBreath * TAU * 0.08);
      ctx2d.clearRect(0, 0, w, h);
      // near-black base wash
      ctx2d.fillStyle = "#050406";
      ctx2d.fillRect(0, 0, w, h);

      const cx = w / 2 + snap.bearingX * (w * 0.3);
      const cy = h / 2 + snap.bearingY * (h * 0.26);
      // leaning IN pulls the voice closer → larger, brighter glow
      const near = 0.55 + snap.lean * 0.75;
      const base = Math.min(w, h);
      const radius = base * (0.22 + snap.level * 0.3) * near * (0.85 + breath * 0.15);
      const warmth = 0.1 + snap.level * 0.5 + snap.lean * 0.18;

      const g = ctx2d.createRadialGradient(cx, cy, 0, cx, cy, radius);
      // warm amber core → deep ember → black (hex is fine INSIDE the art)
      g.addColorStop(0, `hsla(34, 86%, ${62 + warmth * 18}%, ${0.34 + warmth})`);
      g.addColorStop(0.45, `hsla(26, 80%, 44%, ${0.14 + warmth * 0.4})`);
      g.addColorStop(1, "hsla(20, 70%, 20%, 0)");
      ctx2d.fillStyle = g;
      ctx2d.fillRect(0, 0, w, h);

      // a faint ever-present ember at true centre so the stage is never dead
      const cg = ctx2d.createRadialGradient(
        w / 2,
        h / 2,
        0,
        w / 2,
        h / 2,
        base * 0.16,
      );
      cg.addColorStop(0, `hsla(30, 70%, 50%, ${0.05 + breath * 0.04})`);
      cg.addColorStop(1, "hsla(30, 70%, 50%, 0)");
      ctx2d.fillStyle = cg;
      ctx2d.fillRect(0, 0, w, h);

      // ── throttled chrome updates ────────────────────────────────────────────
      uiThrottle += dt;
      if (uiThrottle > 0.15) {
        uiThrottle = 0;
        setDominant(snap.dominant);
        setLeanPct(Math.round(snap.lean * 100));
      }

      rafRef.current = requestAnimationFrame(frame);
    };
    rafRef.current = requestAnimationFrame(frame);

    // ── device orientation (primary input) ──────────────────────────────────
    const onOrient = (e: DeviceOrientationEvent) => {
      if (e.alpha === null && e.beta === null && e.gamma === null) return;
      // alpha → world-locked yaw (turn your body); flip sign so turning right
      // faces right within the fixed field.
      if (e.alpha !== null && e.alpha !== undefined) {
        yawRef.current = -(e.alpha * Math.PI) / 180;
      }
      // beta → lean (tilt the phone forward to pull the faced voice closer)
      if (e.beta !== null && e.beta !== undefined) {
        leanRef.current = clamp((90 - e.beta) / 50, 0, 1);
      }
      // gamma → a little elevation (look up / down)
      if (e.gamma !== null && e.gamma !== undefined) {
        pitchRef.current = clamp((e.gamma / 90) * 0.6, -0.6, 0.6);
      }
      lastSensorRef.current = performance.now();
    };
    window.addEventListener("deviceorientation", onOrient);

    // ── pointer drag: horizontal → yaw, vertical → lean ─────────────────────
    const onPointerDown = (e: PointerEvent) => {
      dragRef.current = { active: true, x: e.clientX, y: e.clientY };
      lastInputRef.current = performance.now();
    };
    const onPointerMove = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d.active) return;
      const dx = e.clientX - d.x;
      const dy = e.clientY - d.y;
      d.x = e.clientX;
      d.y = e.clientY;
      yawRef.current += dx * 0.006;
      // drag up = lean in, drag down = lean out
      leanRef.current = clamp(leanRef.current - dy * 0.004, 0, 1);
      lastInputRef.current = performance.now();
    };
    const onPointerUp = () => {
      dragRef.current.active = false;
      lastInputRef.current = performance.now();
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);

    // ── keyboard: ←→ / A D turn · ↑↓ / W S lean ─────────────────────────────
    const applyKey = (key: string, on: boolean): boolean => {
      const kk = keyRef.current;
      switch (key) {
        case "ArrowLeft":
        case "a":
        case "A":
          kk.left = on;
          return true;
        case "ArrowRight":
        case "d":
        case "D":
          kk.right = on;
          return true;
        case "ArrowUp":
        case "w":
        case "W":
          kk.lean = on ? 1 : 0;
          return true;
        case "ArrowDown":
        case "s":
        case "S":
          kk.lean = on ? -1 : 0;
          return true;
        default:
          return false;
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (applyKey(e.key, true)) {
        e.preventDefault();
        lastInputRef.current = performance.now();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (applyKey(e.key, false)) e.preventDefault();
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
      window.removeEventListener("deviceorientation", onOrient);
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [running]);

  // ── full teardown on unmount ────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      const engine = engineRef.current;
      engineRef.current = null;
      if (engine) void engine.stop();
    };
  }, []);

  const sensorLive = mode === "live";
  const statusLabel =
    mode === "live"
      ? "facing · live"
      : mode === "pointer"
        ? "facing · pointer"
        : mode === "keys"
          ? "facing · keys"
          : "auto · drifting";

  return (
    <main className="fixed inset-0 overflow-hidden bg-background text-foreground">
      {/* near-dark stage — the sound is the piece */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full touch-none select-none"
        aria-hidden
      />

      {!running ? (
        // ── invitation ──────────────────────────────────────────────────────
        <div className="absolute inset-0 z-20 flex items-center justify-center p-6">
          <div className="w-full max-w-md space-y-5 text-center">
            <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
              Stillpoint
            </h1>
            <p className="text-base leading-relaxed text-muted-foreground">
              Headphones on · close your eyes. One of Karel&rsquo;s takes is
              placed as four voices on a dome around your head. Turn your body to
              face them; lean in to pull one closer. The screen stays dark — the
              sound is the piece.
            </p>

            <label className="block text-left">
              <span className="mb-1 block font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                recording
              </span>
              <select
                value={trackId}
                onChange={(e) => setTrackId(e.target.value)}
                className="min-h-[44px] w-full rounded-md border border-border bg-muted px-3 text-base text-foreground"
              >
                {REAL_TRACKS.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
              </select>
            </label>

            <button
              type="button"
              onClick={begin}
              disabled={starting}
              className="min-h-[44px] w-full rounded-md bg-primary px-6 text-base font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
            >
              {starting ? "Settling in…" : "Begin · headphones on"}
            </button>

            {audioError && (
              <p className="text-base text-destructive">{audioError}</p>
            )}
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground/70">
              phone · turn + tilt to lean — desktop · drag / arrow keys
            </p>
          </div>
        </div>
      ) : (
        // ── live chrome (minimal; hides in immersive mode) ────────────────────
        <>
          {!immersive && (
            <div
              data-chrome
              className="pointer-events-none absolute inset-x-0 top-0 z-20 flex flex-col gap-3 p-5 sm:p-7"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="pointer-events-auto max-w-sm">
                  <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
                    Stillpoint
                  </h1>
                  <p className="mt-1 text-base text-muted-foreground">
                    Eyes shut. Turn to face his voices; lean in to bring one
                    closer.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={stop}
                  className="pointer-events-auto min-h-[44px] rounded-md border border-border bg-muted px-5 text-base font-medium text-foreground transition-colors hover:bg-accent"
                >
                  Stop
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                <span className={sensorLive ? "text-foreground" : undefined}>
                  {statusLabel}
                </span>
                {playingTitle && <span>take · {playingTitle}</span>}
                {dominant && (
                  <span className="text-foreground">facing · {dominant}</span>
                )}
                <span>lean · {leanPct}%</span>
                {mode === "auto" && (
                  <span className="text-muted-foreground/80">
                    drifting — tilt your phone, or drag / use arrow keys
                  </span>
                )}
                {notice && (
                  <span className="text-destructive">{notice}</span>
                )}
              </div>
            </div>
          )}

          {/* eyes-closed invitation, bottom-centred, fades with the chrome */}
          {!immersive && (
            <div className="pointer-events-none absolute inset-x-0 bottom-6 z-20 flex justify-center px-6">
              <p className="text-center text-base text-muted-foreground/80">
                Close your eyes. Let the glow go.
              </p>
            </div>
          )}
        </>
      )}

      <ImmersiveHud
        immersive={immersive}
        onToggle={toggle}
        title="Stillpoint"
        description="One of Karel's real takes, split into four perceptual voices and HRTF-panned to fixed points on a dome around your head. The field is world-locked: you turn your body to face a voice (it comes forward, louder and brighter), and lean toward it to pull it closer in real distance — a 6DoF binaural field you navigate with your eyes shut."
        howTo={[
          "Put on headphones and close your eyes.",
          "Turn your body — or drag sideways / press the arrow keys — to face his voices.",
          "Lean in (tilt the phone forward, drag up, or hold the up arrow) to bring the faced voice closer.",
          "Leave it be and the field drifts on its own, sweeping each voice through the front.",
        ]}
      />
    </main>
  );
}
