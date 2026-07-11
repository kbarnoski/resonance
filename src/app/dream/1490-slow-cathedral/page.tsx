"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { PrototypeNav } from "../_shared/prototype-nav";
import { prefersReducedMotion } from "../_shared/psych/safeFlicker";
import { CathedralGrowth } from "./growth";
import { CathedralScene, type CamParams } from "./scene";
import { createAudio, type AudioEngine } from "./audio";
import { PITCH, NOTES } from "./readme";

const DURATION_REAL = 600; // the full ~10-minute slow build
const DURATION_PREVIEW = 32; // idle self-demo: same growth, fast-forwarded

export default function SlowCathedralPage() {
  const mountRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<AudioEngine | null>(null);

  const [started, setStarted] = useState(false);
  const [muted, setMuted] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [tiltHint, setTiltHint] = useState("Tilt your device to steer — or move the pointer / arrow keys.");

  const startedRef = useRef(false);

  const begin = useCallback(async () => {
    if (!audioRef.current) {
      try {
        audioRef.current = createAudio();
      } catch {
        // audio unavailable — the cathedral still grows silently
      }
    }
    try {
      await audioRef.current?.resume();
    } catch {
      /* ignore resume failure */
    }

    // iOS 13+ requires an explicit gesture-time permission request.
    type OrientCtor = { requestPermission?: () => Promise<string> };
    const DOE =
      typeof window !== "undefined"
        ? (window.DeviceOrientationEvent as unknown as OrientCtor | undefined)
        : undefined;
    if (DOE && typeof DOE.requestPermission === "function") {
      try {
        const res = await DOE.requestPermission();
        if (res !== "granted") {
          setTiltHint("Tilt permission declined — move the pointer or use arrow keys to steer.");
        }
      } catch {
        setTiltHint("Tilt unavailable — move the pointer or use arrow keys to steer.");
      }
    }

    startedRef.current = true;
    setStarted(true);
  }, []);

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      const next = !m;
      audioRef.current?.setMuted(next);
      return next;
    });
  }, []);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    if (typeof window === "undefined" || !window.WebGLRenderingContext) {
      setErr("This piece needs WebGL, which this browser does not provide.");
      return;
    }

    const reduce = prefersReducedMotion();
    const growth = new CathedralGrowth();

    let scene: CathedralScene;
    try {
      scene = new CathedralScene(mount, growth);
    } catch {
      setErr("Could not start the WebGL renderer on this device.");
      return;
    }

    // ── steering: smoothed target from tilt / pointer / keys ──────────────────
    const target: CamParams = { yaw: 0, pitch: 0 };
    const cur: CamParams = { yaw: 0, pitch: 0 };
    const keys = { left: false, right: false, up: false, down: false };

    const onPointer = (e: PointerEvent) => {
      const w = window.innerWidth || 1;
      const h = window.innerHeight || 1;
      target.yaw = (e.clientX / w - 0.5) * 1.7;
      target.pitch = (0.5 - e.clientY / h) * 0.9;
    };
    const onOrient = (e: DeviceOrientationEvent) => {
      if (e.gamma == null || e.beta == null) return;
      target.yaw = Math.max(-1.7, Math.min(1.7, (e.gamma / 45) * 1.7));
      target.pitch = Math.max(-0.9, Math.min(0.9, ((e.beta - 45) / 45) * 0.9));
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") keys.left = true;
      else if (e.key === "ArrowRight") keys.right = true;
      else if (e.key === "ArrowUp") keys.up = true;
      else if (e.key === "ArrowDown") keys.down = true;
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") keys.left = false;
      else if (e.key === "ArrowRight") keys.right = false;
      else if (e.key === "ArrowUp") keys.up = false;
      else if (e.key === "ArrowDown") keys.down = false;
    };
    window.addEventListener("pointermove", onPointer);
    window.addEventListener("deviceorientation", onOrient);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    const onResize = () => scene.resize();
    window.addEventListener("resize", onResize);

    // ── growth pacing + render loop ───────────────────────────────────────────
    let raf = 0;
    let last = performance.now();
    let growthElapsed = 0;
    let doneHold = 0;
    let lastBell = 0;
    let wasStarted = false;
    const rateFactor = reduce ? 0.8 : 1;
    const camSpeed = reduce ? 0.028 : 0.06;
    const swellAmp = reduce ? 0.06 : 0.14;

    const loop = () => {
      raf = requestAnimationFrame(loop);
      const now = performance.now();
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const tSec = now / 1000;

      // On the transition into the real run, restart from the sapling.
      if (startedRef.current && !wasStarted) {
        wasStarted = true;
        growth.reset();
        scene.resetBuilt();
        growthElapsed = 0;
        doneHold = 0;
      }

      const duration = startedRef.current ? DURATION_REAL : DURATION_PREVIEW;
      growthElapsed += dt * rateFactor;
      // Convex easing: the sapling phase is slow + contemplative, the cathedral
      // accretes ever faster toward the end — an ACCELERATING density of new
      // structure/events per unit time (the entropy-rate time-dilation design
      // law, arXiv 2606.29427). Later minutes should feel longer and timeless.
      const lin = Math.min(1, growthElapsed / duration);
      const targetProgress = Math.pow(lin, 1.6);

      const events = growth.catchUp(targetProgress);
      scene.syncGrowth(events);

      // audio: drone opens with progress; a gentle rain of height-pitched bells
      if (startedRef.current && audioRef.current) {
        audioRef.current.setDrive(growth.progress);
        if (events.length > 0 && now - lastBell > 130) {
          // ring the most significant (highest) event in this batch
          let best = events[0];
          for (let i = 1; i < events.length; i++) if (events[i].h > best.h) best = events[i];
          const pan = Math.max(-1, Math.min(1, best.x / growth.Rmax));
          audioRef.current.bell(best.h, pan, 0.4 + 0.6 * best.h);
          lastBell = now;
        }
      }

      // idle preview: once fully grown, hold, then regrow so a glance always sees growth
      if (!startedRef.current && growth.done) {
        doneHold += dt;
        if (doneHold > 3) {
          growth.reset();
          scene.resetBuilt();
          growthElapsed = 0;
          doneHold = 0;
        }
      }

      // smooth steering; arrow keys nudge the target
      const kv = dt * 1.4;
      if (keys.left) target.yaw = Math.max(-1.7, target.yaw - kv);
      if (keys.right) target.yaw = Math.min(1.7, target.yaw + kv);
      if (keys.up) target.pitch = Math.min(0.9, target.pitch + kv);
      if (keys.down) target.pitch = Math.max(-0.9, target.pitch - kv);
      const s = 1 - Math.pow(0.001, dt);
      cur.yaw += (target.yaw - cur.yaw) * s;
      cur.pitch += (target.pitch - cur.pitch) * s;

      // slow, safe luminance swell (≈0.045 Hz — far below any strobe band)
      const brightness = 1 - swellAmp * (0.5 - 0.5 * Math.cos(6.28318 * 0.045 * tSec));

      scene.render(dt, brightness, cur, camSpeed);
    };
    loop();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onPointer);
      window.removeEventListener("deviceorientation", onOrient);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("resize", onResize);
      scene.dispose();
      audioRef.current?.dispose();
      audioRef.current = null;
    };
  }, []);

  return (
    <main className="relative h-[100dvh] w-full overflow-hidden bg-[#05040f] text-foreground">
      <div ref={mountRef} className="absolute inset-0" />

      {/* header */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex flex-col gap-2 p-5 sm:p-7">
        <h1 className="font-semibold text-2xl text-foreground sm:text-3xl">Slow Cathedral</h1>
        <p className="max-w-xl text-base text-muted-foreground">{PITCH}</p>
      </div>

      {/* controls */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex flex-wrap items-end justify-between gap-3 p-5 sm:p-7">
        <div className="pointer-events-auto flex flex-wrap gap-2">
          {!started && (
            <button
              onClick={begin}
              className="min-h-[44px] rounded-full bg-violet-500/20 px-5 py-2.5 text-base font-medium text-violet-200 ring-1 ring-violet-400/40 transition hover:bg-violet-500/30"
            >
              Begin the 10-minute build
            </button>
          )}
          {started && (
            <button
              onClick={toggleMute}
              className="min-h-[44px] rounded-full bg-muted px-4 py-2.5 text-base text-foreground ring-1 ring-border transition hover:bg-accent"
            >
              {muted ? "Unmute" : "Mute"}
            </button>
          )}
          <button
            onClick={() => setShowNotes((v) => !v)}
            className="min-h-[44px] rounded-full bg-muted px-4 py-2.5 text-base text-muted-foreground ring-1 ring-border transition hover:bg-accent"
          >
            {showNotes ? "Hide design notes" : "Read the design notes"}
          </button>
        </div>
        <p className="pointer-events-none max-w-xs text-right text-sm text-muted-foreground">
          {started ? tiltHint : "A live preview is already growing — press Begin for the full slow build."}
        </p>
      </div>

      {/* design-notes panel */}
      {showNotes && (
        <div className="pointer-events-auto absolute inset-x-0 top-24 z-20 mx-auto max-h-[70vh] max-w-xl overflow-y-auto rounded-2xl bg-black/75 p-5 text-base text-foreground ring-1 ring-border backdrop-blur sm:top-28">
          {NOTES.map((n) => (
            <div key={n.heading} className="mb-3 last:mb-0">
              <p className="mb-1 text-violet-300">{n.heading}</p>
              <p className="text-foreground">{n.body}</p>
            </div>
          ))}
        </div>
      )}

      {/* error / no-WebGL */}
      {err && (
        <div className="absolute inset-0 z-30 flex items-center justify-center p-8">
          <p className="max-w-md text-center text-base text-violet-300">{err}</p>
        </div>
      )}

      <Link
        href="/dream"
        className="pointer-events-auto absolute right-5 top-5 z-10 text-sm text-muted-foreground transition hover:text-foreground sm:right-7 sm:top-7"
      >
        ← gallery
      </Link>

      <PrototypeNav slugs={["1490-slow-cathedral"]} />
    </main>
  );
}
