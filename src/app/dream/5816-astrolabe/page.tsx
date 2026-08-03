"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 5816-astrolabe
//   "What if you PLAYED an instrument by tilting your phone THROUGH it —
//    steering a beam across a celestial sphere of resonant tones, the way an
//    astrolabe measures the sky?"
//
// Device orientation is the primary input. Tilt aims a screen-centre reticle
// (the astrolabe's alidade) across a sphere of pitch-stars — a just-intoned
// scale stacked in octave-rings. When the beam crosses a star it PLUCKS a
// Karplus–Strong resonant string; how centred you are sets how loud and bright.
//
// Silent-phone review: the sphere drifts and twinkles from load, and pressing
// "Enter the sky" starts a seeded auto-demo that sweeps a melodic path across
// the stars — legible with sound off (stars bloom as the reticle arrives).
// Desktop with no sensor falls back to mouse / arrow-key steering.
//
// Determinism: seeded mulberry32 for all randomness; performance.now() for
// timing. No Math.random / Date.now / new Date in render or logic.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import { buildStars, type Star } from "./starmap";
import { SkyScene } from "./sky";
import { BeamController } from "./orientation";
import { DemoConductor } from "./demo";
import { AstrolabeAudio } from "./audio";
import { clamp01, smoothstep } from "./rng";

const TRIG = 0.15; // rad — a star "sounds" when the beam is within this cone
const GLOW_FALLOFF = 0.5; // rad — proximity glow reaches this far
const PLUCK_COOLDOWN = 0.24; // s — per-star retrigger guard

type OrientationPermissionCtor = {
  requestPermission?: () => Promise<"granted" | "denied">;
};

function angleBetween(
  a: [number, number, number],
  b: [number, number, number],
): number {
  const d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  return Math.acos(d < -1 ? -1 : d > 1 ? 1 : d);
}

export default function Page() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [running, setRunning] = useState(false);
  const [muted, setMuted] = useState(false);
  const [webglFailed, setWebglFailed] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [sensorActive, setSensorActive] = useState(false);

  const skyRef = useRef<SkyScene | null>(null);
  const beamRef = useRef<BeamController | null>(null);
  const demoRef = useRef<DemoConductor | null>(null);
  const audioRef = useRef<AstrolabeAudio | null>(null);
  const starsRef = useRef<Star[]>([]);
  const rafRef = useRef<number | null>(null);

  const runningRef = useRef(false);
  const mutedRef = useRef(false);
  const startMsRef = useRef(0);
  const lastTRef = useRef(-1);
  const sensorActiveRef = useRef(false);

  // per-star runtime state
  const flashRef = useRef<Float32Array | null>(null);
  const insideRef = useRef<Uint8Array | null>(null);
  const lastPluckRef = useRef<Float32Array | null>(null);

  const orientHandlerRef = useRef<
    ((e: DeviceOrientationEvent) => void) | null
  >(null);

  useEffect(() => {
    mutedRef.current = muted;
    audioRef.current?.setMuted(muted);
  }, [muted]);

  // ── mount: build the sky + start the always-on render loop ──
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const stars = buildStars();
    starsRef.current = stars;
    flashRef.current = new Float32Array(stars.length);
    insideRef.current = new Uint8Array(stars.length);
    lastPluckRef.current = new Float32Array(stars.length).fill(-999);

    let sky: SkyScene;
    try {
      sky = new SkyScene(mount, stars);
    } catch {
      setWebglFailed(true);
      return;
    }
    skyRef.current = sky;
    const beam = new BeamController();
    beamRef.current = beam;
    demoRef.current = new DemoConductor(stars);

    const onMouse = (e: MouseEvent) => {
      const w = mount.clientWidth || 1;
      const h = mount.clientHeight || 1;
      beam.setMouse((e.clientX / w) * 2 - 1, (e.clientY / h) * 2 - 1);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (beam.setKey(e.code, true)) e.preventDefault();
    };
    const onKeyUp = (e: KeyboardEvent) => {
      beam.setKey(e.code, false);
    };
    window.addEventListener("mousemove", onMouse);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    const onResize = () => {
      if (mount.clientWidth && mount.clientHeight) {
        sky.resize(mount.clientWidth, mount.clientHeight);
      }
    };
    window.addEventListener("resize", onResize);

    const loop = () => {
      const nowMs = performance.now();
      let dt = lastTRef.current < 0 ? 1 / 60 : (nowMs - lastTRef.current) / 1000;
      dt = dt < 0 ? 0 : dt > 0.1 ? 0.1 : dt;
      lastTRef.current = nowMs;

      const isRunning = runningRef.current;
      beam.setRunning(isRunning);

      // Demo targets are in the pitch-sphere's LOCAL frame; the beam aims in
      // world space, so offset the target yaw by the sphere's current drift.
      const demoTarget =
        isRunning && demoRef.current
          ? demoRef.current.target(nowMs - startMsRef.current)
          : null;
      if (demoTarget) demoTarget.yaw += sky.getDrift();
      const frame = beam.sample(nowMs, demoTarget);
      const localFwd = sky.worldToLocalDir(frame.fwd);

      const flash = flashRef.current!;
      const inside = insideRef.current!;
      const lastPluck = lastPluckRef.current!;
      const nowSec = nowMs / 1000;
      const audio = audioRef.current;

      const glow = new Array<number>(stars.length);
      let bestAim = 0;

      for (let i = 0; i < stars.length; i++) {
        const d = angleBetween(localFwd, stars[i].dir);

        // decay any lingering pluck flash (slow, sub-3Hz)
        flash[i] *= Math.exp(-dt * 2.4);

        // proximity → glow (near = 1)
        const prox = smoothstep(GLOW_FALLOFF, 0, d);
        glow[i] = clamp01(Math.max(prox * 0.85, flash[i]));

        const nowInside = d < TRIG ? 1 : 0;
        const centred = 1 - d / TRIG; // 0..1 when inside
        if (nowInside) bestAim = Math.max(bestAim, centred);

        // trigger on entering the cone (with a short cooldown)
        if (
          isRunning &&
          nowInside &&
          !inside[i] &&
          nowSec - lastPluck[i] > PLUCK_COOLDOWN
        ) {
          flash[i] = 1;
          lastPluck[i] = nowSec;
          if (audio) audio.pluck(stars[i].freq, clamp01(centred));
        }
        inside[i] = nowInside;
      }

      sky.render(frame.fwd, glow, bestAim, dt, nowSec);

      // reflect sensor state into the UI (cheap, only flips once)
      const active = frame.source === "device";
      if (active !== sensorActiveRef.current) {
        sensorActiveRef.current = active;
        setSensorActive(active);
      }

      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      window.removeEventListener("mousemove", onMouse);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("resize", onResize);
      if (orientHandlerRef.current) {
        window.removeEventListener(
          "deviceorientation",
          orientHandlerRef.current,
        );
      }
      audioRef.current?.stop();
      audioRef.current = null;
      sky.detach();
      sky.dispose();
      skyRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const attachOrientation = useCallback(async () => {
    const beam = beamRef.current;
    if (!beam) return;
    const Ctor = (
      typeof window !== "undefined" ? window.DeviceOrientationEvent : undefined
    ) as unknown as OrientationPermissionCtor | undefined;
    try {
      if (Ctor && typeof Ctor.requestPermission === "function") {
        const res = await Ctor.requestPermission();
        if (res !== "granted") return;
      }
    } catch {
      // fall through — desktop / unsupported; mouse+keys fallback remains
    }
    const handler = beam.onDeviceOrientation;
    orientHandlerRef.current = handler;
    window.addEventListener("deviceorientation", handler);
  }, []);

  const start = useCallback(async () => {
    if (runningRef.current) return;

    // audio (user gesture — safe to create + resume the context here)
    try {
      const Ctor: typeof AudioContext =
        window.AudioContext ||
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (window as any).webkitAudioContext;
      const ctx = new Ctor();
      await ctx.resume();
      const audio = new AstrolabeAudio(ctx);
      audio.setMuted(mutedRef.current);
      audio.start();
      audioRef.current = audio;
    } catch {
      // visuals still run without audio
    }

    await attachOrientation();

    startMsRef.current = performance.now();
    runningRef.current = true;
    setRunning(true);
  }, [attachOrientation]);

  const recalibrate = useCallback(() => {
    beamRef.current?.recalibrate();
  }, []);

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-background">
      <div ref={mountRef} className="absolute inset-0" />

      {/* top-left title / description */}
      <div className="pointer-events-none absolute left-5 top-5 z-20 max-w-sm">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          Dream lab · 5816
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
          Astrolabe
        </h1>
        <p className="mt-1 text-base text-muted-foreground">
          Tilt your phone through a sky of resonant stars — aim the beam, cross a
          star, hear it ring.
        </p>
      </div>

      {/* controls */}
      {!webglFailed && (
        <div className="absolute bottom-6 left-1/2 z-20 flex -translate-x-1/2 flex-col items-center gap-3">
          {!running ? (
            <button
              onClick={start}
              className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Enter the sky
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setMuted((m) => !m)}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                {muted ? "Unmute" : "Mute"}
              </button>
              <button
                onClick={recalibrate}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                Recenter tilt
              </button>
            </div>
          )}
          {running && (
            <p className="max-w-xs text-center text-sm text-muted-foreground">
              {sensorActive
                ? "Tilt to steer the beam. Up/down changes octave, left/right the scale."
                : "No tilt sensor — move the mouse or use the arrow keys. On a phone, tilt is the instrument."}
            </p>
          )}
        </div>
      )}

      {/* WebGL failure notice */}
      {webglFailed && (
        <div className="absolute inset-0 z-30 flex items-center justify-center p-6">
          <div className="max-w-md rounded-lg border border-border bg-background p-6 shadow-lg">
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-destructive">
              No WebGL
            </p>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              This sky is rendered with WebGL, which your browser could not
              start. Try a hardware-accelerated browser to enter the astrolabe.
            </p>
          </div>
        </div>
      )}

      {/* design notes affordance */}
      <button
        onClick={() => setShowNotes(true)}
        className="absolute bottom-5 right-5 z-20 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        Read the design notes
      </button>

      {showNotes && (
        <div
          className="absolute inset-0 z-40 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Design notes
            </p>
            <h2 className="mt-1 text-xl font-semibold tracking-tight text-foreground">
              Astrolabe
            </h2>
            <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                An instrument you play by aiming your phone at the sky. The
                celestial sphere is engraved with latitude rings — each ring an
                octave — and studded with stars, each a pitch from a just-intoned
                scale. Tilt aims a centre-screen reticle, the alidade; when it
                crosses a star, a Karplus–Strong resonant string is plucked. How
                centred you are sets how loud and bright.
              </p>
              <p>
                It follows the medieval <em>astrolabe</em> — a celestial map you
                sight a star through to find your bearing — and the spatial
                pitch-control lineage of the theremin and Michel Waisvisz&rsquo;s{" "}
                <em>The Hands</em>: gesture, not buttons, is the note.
              </p>
              <p>
                Nobody here presses a key; the sky drifts and twinkles from load,
                and &ldquo;Enter the sky&rdquo; sets a seeded beam sweeping a
                melodic path so the whole idea reads even on a silent phone. With
                no sensor, mouse and arrow keys steer instead.
              </p>
            </div>
            <button
              onClick={() => setShowNotes(false)}
              className="mt-5 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
