"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { prefersReducedMotion } from "../_shared/psych/safeFlicker";
import { PrototypeNav } from "../_shared/prototype-nav";
import { TunnelAudio } from "./audio";
import {
  makeTunnel,
  makeTunnelFallback,
  type TunnelHandle,
  type TunnelUniforms,
} from "./raymarch";

// ─────────────────────────────────────────────────────────────────────────────
// 3040 · TUNNEL
//
// Pilot your own passage down the near-death "tunnel toward the light." A single
// WebGL2 fragment shader raymarches a camera flying down an infinite Lissajous
// tube toward a being-of-light core, with fake gravitational lensing, depth fog,
// drifting caustic walls and a constricting tunnel-vision vignette.
//
// You fly it moment to moment. Steer with pointer-drag, device-tilt or WASD /
// arrows. HOLD (pointer down, Space, or the on-screen button) to commit toward
// the light — it blooms, the rays bend harder, the vignette closes, the fog
// thins, the descent glissando brightens. Release and you drift back into the
// darker void. Go still and NDE time-dilation takes over: a global timeScale
// decays toward near-stillness, slowing the shader clock AND the audio glide as
// one — any input blooms it back. A seeded autopilot self-demos with zero input.
// ─────────────────────────────────────────────────────────────────────────────

const SEED = 0x3040;
const TIME_MIN = 0.12; // deepest time-dilation when perfectly still
const AUTOPILOT_IDLE_MS = 3000; // hand back to autopilot after this much stillness

/** Seeded PRNG — deterministic autopilot, never Math.random. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (v: number, lo: number, hi: number): number =>
  v < lo ? lo : v > hi ? hi : v;

/** Heading contribution from the currently-held movement keys. */
function keyHeadingVec(keys: Set<string>): { x: number; y: number } {
  let x = 0;
  let y = 0;
  if (keys.has("arrowleft") || keys.has("a")) x -= 1;
  if (keys.has("arrowright") || keys.has("d")) x += 1;
  if (keys.has("arrowup") || keys.has("w")) y += 1;
  if (keys.has("arrowdown") || keys.has("s")) y -= 1;
  return { x, y };
}

export default function TunnelPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [started, setStarted] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [tiltAvailable, setTiltAvailable] = useState(false);
  const [tiltOn, setTiltOn] = useState(false);
  const [holdBtn, setHoldBtn] = useState(false);
  const [readout, setReadout] = useState({ approach: 0, dilation: 100 });

  // Imperative engine refs — the hot loop never triggers React re-renders.
  const rafRef = useRef<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const audioRef = useRef<TunnelAudio | null>(null);
  const handleRef = useRef<TunnelHandle | null>(null);
  const reducedRef = useRef(false);

  // Piloting state.
  const approachRef = useRef(0); // commitment toward the light, 0..1
  const timeScaleRef = useRef(1); // NDE dilation, 0..1
  const headingRef = useRef({ x: 0, y: 0 }); // smoothed steering
  const clockRef = useRef(0); // time-dilated striation clock
  const camZRef = useRef(0); // time-dilated travel down the tube
  const autoTRef = useRef(0);
  const lastMsRef = useRef(0);
  const lastUiRef = useRef(0);
  const lastInputRef = useRef(-1e9);

  // Live input sources (summed into one heading each frame).
  const pointerDownRef = useRef(false);
  const pointerHeadingRef = useRef({ x: 0, y: 0 });
  const tiltHeadingRef = useRef({ x: 0, y: 0 });
  const keysRef = useRef<Set<string>>(new Set());
  const spaceRef = useRef(false);
  const holdBtnRef = useRef(false);

  // Imperatively-added window listeners, tracked so teardown can remove them.
  const resizeHandlerRef = useRef<(() => void) | null>(null);
  const tiltHandlerRef = useRef<((e: DeviceOrientationEvent) => void) | null>(
    null,
  );

  const teardown = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (resizeHandlerRef.current) {
      window.removeEventListener("resize", resizeHandlerRef.current);
      resizeHandlerRef.current = null;
    }
    if (tiltHandlerRef.current) {
      window.removeEventListener("deviceorientation", tiltHandlerRef.current);
      tiltHandlerRef.current = null;
    }
    const a = audioRef.current;
    audioRef.current = null;
    if (a) a.dispose();
    const h = handleRef.current;
    handleRef.current = null;
    if (h) h.dispose();
    const ctx = audioCtxRef.current;
    audioCtxRef.current = null;
    if (ctx) ctx.close().catch(() => {});
  }, []);

  // ── Mount: detect reduced motion + tilt availability. ──
  useEffect(() => {
    const rm = prefersReducedMotion();
    reducedRef.current = rm;
    if (rm) timeScaleRef.current = 0.5;

    const hasTilt =
      typeof window !== "undefined" && "DeviceOrientationEvent" in window;
    setTiltAvailable(hasTilt);

    return () => teardown();
  }, [teardown]);

  const markInput = useCallback(() => {
    lastInputRef.current = performance.now();
  }, []);

  // ── Pointer steering + hold-to-approach ──
  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!started) return;
      pointerDownRef.current = true;
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
      const rect = canvasRef.current?.getBoundingClientRect();
      if (rect) {
        pointerHeadingRef.current = {
          x: clamp(((e.clientX - rect.left) / rect.width - 0.5) * 2, -1, 1),
          y: clamp((0.5 - (e.clientY - rect.top) / rect.height) * 2, -1, 1),
        };
      }
      markInput();
    },
    [started, markInput],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!started || !pointerDownRef.current) return;
      const rect = canvasRef.current?.getBoundingClientRect();
      if (rect) {
        pointerHeadingRef.current = {
          x: clamp(((e.clientX - rect.left) / rect.width - 0.5) * 2, -1, 1),
          y: clamp((0.5 - (e.clientY - rect.top) / rect.height) * 2, -1, 1),
        };
      }
      markInput();
    },
    [started, markInput],
  );

  const onPointerUp = useCallback(() => {
    pointerDownRef.current = false;
  }, []);

  // ── Enable device-tilt steering (iOS needs a gesture-time permission) ──
  const enableTilt = useCallback(async () => {
    interface DOE {
      requestPermission?: () => Promise<"granted" | "denied">;
    }
    const DOEvent = (
      window as unknown as { DeviceOrientationEvent?: DOE }
    ).DeviceOrientationEvent;
    try {
      if (DOEvent && typeof DOEvent.requestPermission === "function") {
        const res = await DOEvent.requestPermission();
        if (res !== "granted") return;
      }
    } catch {
      return;
    }
    const onTilt = (ev: DeviceOrientationEvent) => {
      if (ev.gamma == null || ev.beta == null) return;
      tiltHeadingRef.current = {
        x: clamp(ev.gamma / 40, -1, 1),
        y: clamp((ev.beta - 45) / 40, -1, 1),
      };
      markInput();
    };
    tiltHandlerRef.current = onTilt;
    window.addEventListener("deviceorientation", onTilt);
    setTiltOn(true);
  }, [markInput]);

  // ── Keyboard steering + Space to approach ──
  useEffect(() => {
    if (!started) return;
    const down = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k === " " || k === "spacebar") {
        spaceRef.current = true;
        markInput();
        e.preventDefault();
        return;
      }
      if (
        ["arrowleft", "arrowright", "arrowup", "arrowdown", "w", "a", "s", "d"].includes(
          k,
        )
      ) {
        keysRef.current.add(k);
        markInput();
        e.preventDefault();
      }
    };
    const up = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k === " " || k === "spacebar") spaceRef.current = false;
      else keysRef.current.delete(k);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [started, markInput]);

  const begin = useCallback(async () => {
    if (started) return;
    setStarted(true);

    const canvas = canvasRef.current;
    if (!canvas) return;

    // Prefer the WebGL2 raymarch; degrade to the Canvas2D concentric tunnel.
    let handle = makeTunnel(canvas);
    if (!handle) handle = makeTunnelFallback(canvas);
    if (!handle) return;
    handleRef.current = handle;
    handle.resize();

    // AudioContext created + resumed only now, from the user gesture.
    const AC: typeof AudioContext =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const audioCtx = new AC();
    audioCtxRef.current = audioCtx;
    if (audioCtx.state === "suspended") {
      try {
        await audioCtx.resume();
      } catch {
        /* ignore */
      }
    }
    const audio = new TunnelAudio(audioCtx);
    audioRef.current = audio;

    const onResize = () => handleRef.current?.resize();
    resizeHandlerRef.current = onResize;
    window.addEventListener("resize", onResize);

    // Seeded autopilot phases — a slow S-curve so the piece self-demos.
    const rng = mulberry32(SEED);
    const pha = rng() * Math.PI * 2;
    const phb = rng() * Math.PI * 2;
    const phc = rng() * Math.PI * 2;

    clockRef.current = 0;
    camZRef.current = 0;
    autoTRef.current = 0;
    lastMsRef.current = performance.now();
    lastUiRef.current = 0;
    lastInputRef.current = -1e9; // autopilot engaged from the first frame

    const loop = () => {
      const eng = handleRef.current;
      const aud = audioRef.current;
      if (!eng || !aud) return;

      const now = performance.now();
      let dt = (now - lastMsRef.current) / 1000;
      lastMsRef.current = now;
      if (dt <= 0 || dt > 0.1) dt = 0.016;

      const rm = reducedRef.current;
      autoTRef.current += dt;
      const at = autoTRef.current;

      const autoOn = now - lastInputRef.current > AUTOPILOT_IDLE_MS;

      // ── Resolve heading target + hold from the active source ──
      let hx: number;
      let hy: number;
      let holding: boolean;
      let motion: boolean; // is the pilot actively engaged this frame?

      if (autoOn) {
        // Deterministic slow S-curve, with an occasional bloom-and-recede.
        hx = clamp(
          0.55 * Math.sin(at * 0.22 + pha) + 0.2 * Math.sin(at * 0.07 + phc),
          -1,
          1,
        );
        hy = clamp(0.4 * Math.sin(at * 0.16 + phb), -1, 1);
        holding = Math.sin(at * 0.11 + phc) > -0.2;
        motion = true; // the autopilot is flying, so time stays lively
      } else {
        const kh = keyHeadingVec(keysRef.current);
        const ph = pointerDownRef.current
          ? pointerHeadingRef.current
          : { x: 0, y: 0 };
        const th = tiltHeadingRef.current;
        hx = clamp(ph.x + kh.x + th.x, -1, 1);
        hy = clamp(ph.y + kh.y + th.y, -1, 1);
        holding = pointerDownRef.current || spaceRef.current || holdBtnRef.current;
        const steering = Math.abs(hx) > 0.02 || Math.abs(hy) > 0.02;
        motion = holding || steering || now - lastInputRef.current < 350;
      }

      // ── timeScale: bloom fast toward 1 on motion, decay slow toward stillness ──
      const tsTarget = motion ? 1 : rm ? 0.5 : TIME_MIN;
      const tsTau = tsTarget > timeScaleRef.current ? 0.18 : 2.6;
      timeScaleRef.current +=
        (tsTarget - timeScaleRef.current) * (1 - Math.exp(-dt / tsTau));
      const timeScale = timeScaleRef.current;

      // ── approach: accelerate toward light while holding, drift back on release ──
      const apTarget = holding ? 1 : 0;
      const apTau = holding ? 2.2 : 3.6;
      approachRef.current +=
        (apTarget - approachRef.current) * (1 - Math.exp(-dt / apTau));
      const approach = approachRef.current;

      // ── heading smoothing ──
      const hTau = 0.35;
      const hk = 1 - Math.exp(-dt / hTau);
      headingRef.current.x += (hx - headingRef.current.x) * hk;
      headingRef.current.y += (hy - headingRef.current.y) * hk;

      // ── integrate the time-dilated clock + travel ──
      const scaledDt = dt * timeScale;
      clockRef.current += scaledDt;
      const speed = (rm ? 1.4 : 2.6) + approach * (rm ? 3.0 : 6.5);
      camZRef.current += scaledDt * speed;

      // ── drive audio with the ALREADY-dilated dt so the glide slows with time ──
      aud.setState(approach, timeScale);
      aud.step(scaledDt);

      const u: TunnelUniforms = {
        time: clockRef.current,
        camZ: camZRef.current,
        heading: [headingRef.current.x, headingRef.current.y],
        approach,
        reduced: rm,
      };
      eng.render(u);

      if (now - lastUiRef.current > 200) {
        lastUiRef.current = now;
        setReadout({
          approach: Math.round(approach * 100),
          dilation: Math.round(timeScale * 100),
        });
      }

      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
  }, [started]);

  // Keep the on-screen hold button's ref in sync with its React state.
  const pressHold = useCallback(() => {
    holdBtnRef.current = true;
    setHoldBtn(true);
    markInput();
  }, [markInput]);
  const releaseHold = useCallback(() => {
    holdBtnRef.current = false;
    setHoldBtn(false);
  }, []);

  const drifting = readout.approach < 40;

  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-background text-foreground">
      <canvas
        ref={canvasRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className="absolute inset-0 h-full w-full touch-none"
        style={{ background: "#05030c" }}
        aria-label="A piloted near-death tunnel flying toward a being of light"
      />

      {/* Title / description / live readout */}
      <div className="pointer-events-none absolute left-0 top-0 z-10 p-5 sm:p-7">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          Resonance · Dream 3040
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
          Tunnel
        </h1>
        <p className="mt-1 max-w-md text-base text-muted-foreground">
          Pilot your own passage toward the light. Hold to bloom it closer, let
          go to drift back into the void, go still and time itself dilates.
        </p>
        {started && (
          <p className="mt-3 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            approach {readout.approach}% · {drifting ? "drifting" : "committing"}{" "}
            · time {readout.dilation}%
          </p>
        )}
      </div>

      {/* Start gate */}
      {!started && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="mx-6 flex max-w-lg flex-col items-center rounded-lg border border-border bg-background p-6 text-center shadow-lg">
            <h2 className="text-2xl font-semibold tracking-tight text-foreground">
              Enter the tunnel
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              You take nothing — screen and sound do the work. Fly it: drag or
              tilt or use WASD / arrows to steer, and hold (pointer, Space, or
              the button) to commit toward the being of light. It blooms closer
              as you hold, drifts back when you let go. Go completely still and
              the near-death time-dilation slows both image and sound as one.
              Best with headphones, in a dark room. It flies itself until you
              take the controls.
            </p>
            <button
              type="button"
              onClick={begin}
              className="mt-6 min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Begin the passage
            </button>
            <p className="mt-3 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Sound + light begin on tap
            </p>
          </div>
        </div>
      )}

      {/* Persistent hold-to-approach control + tilt enable */}
      {started && (
        <div className="absolute bottom-16 left-1/2 z-30 flex -translate-x-1/2 flex-col items-center gap-2">
          <button
            type="button"
            onPointerDown={pressHold}
            onPointerUp={releaseHold}
            onPointerLeave={releaseHold}
            onPointerCancel={releaseHold}
            className={`min-h-[44px] touch-none select-none rounded-md px-6 text-sm font-medium transition-colors ${
              holdBtn
                ? "bg-primary text-primary-foreground"
                : "bg-primary/20 text-primary hover:bg-primary/30"
            }`}
          >
            Hold to approach the light
          </button>
          {tiltAvailable && !tiltOn && (
            <button
              type="button"
              onClick={enableTilt}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Enable tilt steering
            </button>
          )}
        </div>
      )}

      {/* Design-notes trigger */}
      <div className="absolute right-4 top-4 z-30">
        <button
          type="button"
          onClick={() => setShowNotes(true)}
          className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          Read the design notes
        </button>
      </div>

      {/* Design notes */}
      {showNotes && (
        <div className="absolute inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/50 p-6 backdrop-blur-sm">
          <div className="mt-12 max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg">
            <h2 className="text-2xl font-semibold tracking-tight text-foreground">
              Design notes
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
              A drug-free evocation of the near-death / ketamine{" "}
              <span className="text-foreground">tunnel toward the light</span>.
              You pilot it: this is a piloted instrument, not a self-playing
              simulation. A single WebGL2 fragment shader sphere-traces a camera
              flying down an infinite tube distance field on a slow Lissajous
              path — an endless wormhole with a being-of-light core far down the
              bore, exponential depth fog, drifting caustic wall striations, and
              a tunnel-vision vignette that constricts the periphery.
            </p>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              The mapping is one gesture, felt three ways.{" "}
              <span className="text-foreground">Holding</span> toward the light
              accelerates your approach: the core draws nearer and blooms
              brighter, each march step bends the ray harder toward it (a fake
              gravitational lensing — the browser black-hole-lensing raymarch
              lineage, e.g. the 2026 &ldquo;Singularity&rdquo; TSL lensing
              showcase), the vignette closes, the fog thins, and the Shepard–
              Risset descent glissando opens and brightens.{" "}
              <span className="text-foreground">Releasing</span> drifts you back
              into the darker, wetter, foggier void.
            </p>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              The signature is{" "}
              <span className="text-foreground">time-dilation</span>. When you
              stop steering and stop approaching, a global timeScale decays
              toward near-stillness — slowing the shader clock AND the audio
              glide together, and muffling the whole bed as if sinking into
              syrup. Any input blooms it back to 1. Image and sound dilate as
              one. A seeded autopilot flies a slow S-curve so the piece
              self-demos with zero input; the moment you touch a control, you
              take over.
            </p>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              References: Raymond Moody,{" "}
              <span className="italic">Life After Life</span> (1975); Pim van
              Lommel et al., the <span className="italic">Lancet</span> NDE study
              (2001); Borjigin et al. on the gamma surge in the dying brain (PNAS
              2013 / 2023) — cited for evocation only, not as a claim; the
              Shepard–Risset endless glissando; and the browser gravitational-
              lensing / black-hole raymarch lineage.
            </p>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Limitations: an honest evocation, not a medical or scientific
              model of dying — no claims are made about what an NDE is. Aesthetic
              constants (lensing strength, fog, bloom) are hand-tuned, not
              GPU-verified on this build. If WebGL2 is unavailable the piece
              degrades to a Canvas2D concentric tunnel that answers the same
              controls, and under prefers-reduced-motion the flight slows and the
              bloom snap is disabled.
            </p>
            <button
              type="button"
              onClick={() => setShowNotes(false)}
              className="mt-6 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Close
            </button>
          </div>
        </div>
      )}

      <PrototypeNav
        slugs={["3040-tunnel", "3056-clearlight", "3048-chrysanthemum", "3080-mycelium"]}
      />
    </main>
  );
}
