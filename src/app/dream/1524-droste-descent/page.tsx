"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import { prefersReducedMotion } from "../_shared/psych/safeFlicker";
import {
  buildDescentAudio,
  type DescentAudio,
  IDLE_RATE,
  MAX_RATE,
} from "./audio";

// ── geometry of the nested-frame tunnel ──────────────────────────────────────
const N_FRAMES = 13; // real DOM layers; the treadmill wraps them for infinity
const SPACING = 300; // px between nesting levels along Z
const PERSPECTIVE = 1000; // px camera distance
const FRONT = 1.25; // how far the nearest frame pushes past the screen plane

export default function DrosteDescentPage() {
  const [started, setStarted] = useState(false);
  const [audioFailed, setAudioFailed] = useState(false);
  const [showNotes, setShowNotes] = useState(false);

  // motion + input state lives in refs so the rAF loop never re-renders React
  const frameRefs = useRef<(HTMLDivElement | null)[]>([]);
  const rafRef = useRef<number>(0);
  const lastTsRef = useRef<number>(0);

  const travelRef = useRef<number>(0); // accumulated levels descended
  const speedRef = useRef<number>(IDLE_RATE); // eased signed velocity (levels/s)
  const spinRef = useRef<number>(0); // accumulated twist (deg)
  const twistRateRef = useRef<number>(0); // eased twist velocity (deg/s)
  const surgeRef = useRef<number>(0); // 0..1 Space surge
  const lastFloorRef = useRef<number>(0);

  const keysRef = useRef<Set<string>>(new Set());
  const draggingRef = useRef<boolean>(false);
  const pointerNormRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const audioRef = useRef<DescentAudio | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const startedRef = useRef<boolean>(false);
  const reducedRef = useRef<boolean>(false);

  // HUD elements updated directly (no per-frame setState)
  const depthRef = useRef<HTMLSpanElement | null>(null);
  const velLabelRef = useRef<HTMLSpanElement | null>(null);
  const velBarRef = useRef<HTMLDivElement | null>(null);

  // ── start audio inside a user gesture (idempotent) ─────────────────────────
  const ensureStarted = useCallback(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    setStarted(true);
    try {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      if (!AC) {
        setAudioFailed(true);
        return;
      }
      const ctx = new AC();
      void ctx.resume();
      ctxRef.current = ctx;
      audioRef.current = buildDescentAudio(ctx);
    } catch {
      setAudioFailed(true);
    }
  }, []);

  // ── the single render loop: visuals always run; audio once started ─────────
  const loop = useCallback((ts: number) => {
    const reduced = reducedRef.current;
    const last = lastTsRef.current || ts;
    lastTsRef.current = ts;
    const dt = Math.min(0.05, Math.max(0, (ts - last) / 1000));
    const tSec = ts / 1000;

    const maxRate = reduced ? 1.1 : MAX_RATE;
    const maxTwist = reduced ? 40 : 95; // deg/sec
    const perLevelTwist = reduced ? 3 : 7; // deg per nesting level
    const idleDrift = reduced ? IDLE_RATE * 0.6 : IDLE_RATE;

    // resolve control targets: pointer joystick > keyboard > idle drift
    let speedTarget = idleDrift;
    let twistTarget = 0;
    const keys = keysRef.current;
    if (draggingRef.current) {
      const p = pointerNormRef.current;
      speedTarget = p.y * maxRate; // lower half = descend
      twistTarget = p.x * maxTwist;
    } else if (keys.size > 0) {
      const dive = keys.has("w") || keys.has("arrowup") ? 1 : 0;
      const rise = keys.has("s") || keys.has("arrowdown") ? 1 : 0;
      const left = keys.has("a") || keys.has("arrowleft") ? 1 : 0;
      const right = keys.has("d") || keys.has("arrowright") ? 1 : 0;
      if (dive || rise) speedTarget = (dive - rise) * maxRate;
      twistTarget = (right - left) * maxTwist;
    }

    // Space = surge: a burst of speed + shimmer
    const surging = keys.has(" ") || keys.has("space");
    const sTau = surging ? 0.12 : 0.7;
    surgeRef.current +=
      ((surging ? 1 : 0) - surgeRef.current) * (1 - Math.exp(-dt / sTau));
    const surge = surgeRef.current;
    speedTarget += surge * maxRate * 0.9;

    // ease velocity + twist (inertia)
    const k = 1 - Math.exp(-dt / 0.32);
    speedRef.current += (speedTarget - speedRef.current) * k;
    twistRateRef.current += (twistTarget - twistRateRef.current) * k;
    const speed = speedRef.current;

    travelRef.current += speed * dt;
    spinRef.current += twistRateRef.current * dt;
    const travel = travelRef.current;
    const spin = spinRef.current;

    // level-boundary crossings → ring bells (one per crossing, direction-aware)
    const newFloor = Math.floor(travel);
    if (newFloor !== lastFloorRef.current) {
      const dir = Math.sign(newFloor - lastFloorRef.current) || 1;
      const intensity = Math.max(
        0.25,
        Math.min(1, 0.3 + (Math.abs(speed) / maxRate) * 0.7 + surge * 0.3),
      );
      audioRef.current?.ringBell(newFloor, dir, intensity);
      lastFloorRef.current = newFloor;
    }

    // ── paint the nested frames (the treadmill wrap) ─────────────────────────
    const baseHue = 250 + 40 * Math.sin(tSec * 0.06);
    for (let kf = 0; kf < N_FRAMES; kf++) {
      const el = frameRefs.current[kf];
      if (!el) continue;
      // continuous level of this frame, wrapped into [0, N)
      const L = (((kf - travel) % N_FRAMES) + N_FRAMES) % N_FRAMES;
      const z = (FRONT - L) * SPACING;
      const rot = spin + L * perLevelTwist;
      const near = Math.max(0, Math.min(1, (L - 0.12) / 1.1));
      const far = Math.max(0, Math.min(1, (N_FRAMES - 0.4 - L) / 1.5));
      const opacity = near * far;
      const hue = (baseHue + L * 9 + tSec * 7) % 360;
      el.style.transform = `translate3d(-50%,-50%,${z.toFixed(1)}px) rotateZ(${rot.toFixed(2)}deg)`;
      el.style.opacity = opacity.toFixed(3);
      el.style.setProperty("--h", hue.toFixed(1));
    }

    // ── drive audio ──────────────────────────────────────────────────────────
    if (startedRef.current && audioRef.current) {
      const a = audioRef.current;
      a.setVelocity(speed);
      a.setDrive(0.12 + (Math.abs(speed) / maxRate) * 0.78 + surge * 0.2);
      a.setSurge(surge);
      a.step(dt);
    }

    // ── HUD readout (cheap DOM writes) ───────────────────────────────────────
    if (depthRef.current) depthRef.current.textContent = travel.toFixed(2);
    if (velLabelRef.current) {
      const mag = Math.abs(speed);
      const dir =
        speed > 0.02 ? "descending" : speed < -0.02 ? "climbing" : "hovering";
      velLabelRef.current.textContent = `${dir} · ${mag.toFixed(2)} lvl/s`;
    }
    if (velBarRef.current) {
      const frac = Math.min(1, Math.abs(speed) / maxRate);
      velBarRef.current.style.height = `${(frac * 100).toFixed(1)}%`;
      velBarRef.current.style.background =
        speed < -0.02 ? "hsl(150 70% 60%)" : "hsl(265 80% 66%)";
    }

    rafRef.current = requestAnimationFrame(loop);
  }, []);

  // ── input listeners + loop lifecycle ───────────────────────────────────────
  useEffect(() => {
    reducedRef.current = prefersReducedMotion();

    const onKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      const tracked = [
        "w",
        "a",
        "s",
        "d",
        "arrowup",
        "arrowdown",
        "arrowleft",
        "arrowright",
        " ",
      ];
      if (tracked.includes(key)) {
        e.preventDefault();
        keysRef.current.add(key);
        ensureStarted();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      keysRef.current.delete(e.key.toLowerCase());
    };

    const setPointerFromEvent = (clientX: number, clientY: number) => {
      pointerNormRef.current = {
        x: (clientX / window.innerWidth) * 2 - 1,
        y: (clientY / window.innerHeight) * 2 - 1,
      };
    };
    const onPointerDown = (e: PointerEvent) => {
      // ignore clicks on UI chrome (buttons/links)
      if ((e.target as HTMLElement)?.closest("[data-ui]")) return;
      draggingRef.current = true;
      setPointerFromEvent(e.clientX, e.clientY);
      ensureStarted();
    };
    const onPointerMove = (e: PointerEvent) => {
      if (draggingRef.current) setPointerFromEvent(e.clientX, e.clientY);
    };
    const endDrag = () => {
      draggingRef.current = false;
    };
    const onBlur = () => {
      keysRef.current.clear();
      draggingRef.current = false;
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", endDrag);
    window.addEventListener("pointercancel", endDrag);
    window.addEventListener("blur", onBlur);

    lastTsRef.current = 0;
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", endDrag);
      window.removeEventListener("pointercancel", endDrag);
      window.removeEventListener("blur", onBlur);
      audioRef.current?.stop();
      audioRef.current = null;
      const ctx = ctxRef.current;
      if (ctx && ctx.state !== "closed") {
        window.setTimeout(() => {
          if (ctx.state !== "closed") void ctx.close();
        }, 900);
      }
      ctxRef.current = null;
    };
  }, [loop, ensureStarted]);

  return (
    <main className="relative min-h-screen overflow-hidden bg-black text-foreground">
      {/* ── the instrument: DOM + CSS-3D nested frames ─────────────────────── */}
      <div
        className="fixed inset-0 touch-none select-none"
        style={{
          perspective: `${PERSPECTIVE}px`,
          perspectiveOrigin: "50% 50%",
          background:
            "radial-gradient(circle at 50% 50%, #17102b 0%, #0a0714 45%, #000 100%)",
        }}
      >
        <div
          className="absolute inset-0"
          style={{ transformStyle: "preserve-3d" }}
        >
          {Array.from({ length: N_FRAMES }).map((_, i) => (
            <div
              key={i}
              ref={(el) => {
                frameRefs.current[i] = el;
              }}
              className="absolute left-1/2 top-1/2 aspect-square"
              style={{
                width: "min(84vw, 84vh)",
                marginLeft: 0,
                marginTop: 0,
                border: "2px solid hsl(var(--h,265) 72% 62% / 0.9)",
                borderRadius: "6px",
                boxShadow:
                  "0 0 24px hsl(var(--h,265) 80% 55% / 0.35), inset 0 0 40px hsl(var(--h,265) 70% 40% / 0.25)",
                willChange: "transform, opacity",
                backfaceVisibility: "hidden",
              }}
            >
              {/* inner concentric ring + faint glyph so nesting reads clearly */}
              <div
                className="absolute inset-[9%] rounded-[4px]"
                style={{
                  border: "1px solid hsl(var(--h,265) 65% 60% / 0.45)",
                }}
              />
              <div
                className="absolute inset-0 flex items-center justify-center"
                style={{
                  color: "hsl(var(--h,265) 70% 72% / 0.5)",
                  fontSize: "min(9vw, 9vh)",
                  lineHeight: 1,
                }}
              >
                <span style={{ opacity: 0.55 }}>◈</span>
              </div>
            </div>
          ))}
        </div>

        {/* vanishing-point glow + soft vignette (pointer-transparent) */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(circle at 50% 50%, rgba(180,150,255,0.18) 0%, rgba(0,0,0,0) 22%), radial-gradient(circle at 50% 50%, rgba(0,0,0,0) 55%, rgba(0,0,0,0.72) 100%)",
          }}
        />
      </div>

      {/* ── chrome: title + controls ───────────────────────────────────────── */}
      <div
        data-ui
        className="pointer-events-none fixed left-0 top-0 z-30 max-w-md p-5 sm:p-7"
      >
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          mise-en-abyme · played
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
          Droste Descent
        </h1>
        <p className="mt-2 text-base leading-relaxed text-muted-foreground">
          A tunnel of frames-within-frames welded 1:1 to a Shepard–Risset
          endless glissando. Each nesting level you fall through is exactly one
          octave of pitch — so you can plunge forever and always keep falling.
        </p>

        <div className="pointer-events-auto mt-4 flex flex-wrap items-center gap-2.5">
          {!started && (
            <button
              data-ui
              onClick={ensureStarted}
              className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Begin the descent
            </button>
          )}
          <button
            data-ui
            onClick={() => setShowNotes((v) => !v)}
            className="min-h-[44px] rounded-md border border-border bg-popover/70 px-4 text-sm font-medium text-muted-foreground backdrop-blur transition-colors hover:text-foreground"
          >
            Design notes
          </button>
        </div>

        <p className="mt-3 text-base leading-relaxed text-muted-foreground">
          <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            play
          </span>
          <br />
          Drag up/down to dive or climb, left/right to twist. Or keys{" "}
          <kbd className="rounded bg-popover px-1">W</kbd>/
          <kbd className="rounded bg-popover px-1">S</kbd> dive·climb,{" "}
          <kbd className="rounded bg-popover px-1">A</kbd>/
          <kbd className="rounded bg-popover px-1">D</kbd> twist,{" "}
          <kbd className="rounded bg-popover px-1">Space</kbd> surge.
        </p>

        {audioFailed && (
          <p className="mt-3 text-base text-destructive">
            Audio is unavailable here — the visual descent still plays.
          </p>
        )}
      </div>

      {/* ── HUD readout (top-right) ─────────────────────────────────────────── */}
      <div
        data-ui
        className="pointer-events-none fixed right-4 top-5 z-30 flex items-center gap-3"
      >
        <div className="text-right">
          <div className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            depth
          </div>
          <div className="font-mono text-2xl font-semibold tabular-nums text-foreground">
            <span ref={depthRef}>0.00</span>
          </div>
          <div className="font-mono text-xs text-muted-foreground">
            <span ref={velLabelRef}>hovering · 0.09 lvl/s</span>
          </div>
        </div>
        <div className="relative h-16 w-2 overflow-hidden rounded-full bg-popover">
          <div
            ref={velBarRef}
            className="absolute bottom-0 left-0 w-full rounded-full"
            style={{ height: "4%", background: "hsl(265 80% 66%)" }}
          />
        </div>
      </div>

      {/* ── design-notes overlay ────────────────────────────────────────────── */}
      {showNotes && (
        <div
          data-ui
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-6 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-h-[80vh] max-w-lg overflow-y-auto rounded-lg border border-border bg-popover/95 p-6 text-base leading-relaxed text-muted-foreground"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-2xl font-semibold tracking-tight text-foreground">
              Infinite regress you play
            </h2>
            <p className="mt-3">
              The visual is a stack of {N_FRAMES} real{" "}
              <code>&lt;div&gt;</code> frames transformed with CSS 3D
              (perspective + translateZ + rotateZ) — no canvas, no WebGL. Only a
              finite set of layers exists; a continuous <em>travel</em> value
              wraps them modulo one level, re-homing the treadmill so the descent
              never ends.
            </p>
            <p className="mt-3">
              Every level boundary you cross rings a just-intonation bell and the
              carrier — a Shepard–Risset endless glissando — has fallen exactly
              one octave. Descent velocity sets the glide rate, so sight and
              sound fall together.
            </p>
            <p className="mt-3 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              lineage
            </p>
            <p className="mt-1">
              Escher, <em>Print Gallery</em> (1956) · the Droste effect (Droste
              cocoa tin, 1904) · Lenstra &amp; de Smit&apos;s Droste analysis
              (2003) · Shepard (1964) / Risset endless tones · the DMT
              tunnel form-constant.
            </p>
            <p className="mt-3 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              honest knock
            </p>
            <p className="mt-1">
              The see=hear lock is tight while descending but loosens when you
              rapidly reverse (the two glissando engines crossfade rather than
              sharing one phase). Nearest neighbour: any infinite-zoom shader —
              the wager here is that DOM frames make the <em>nesting</em> more
              legible than a fractal blur.
            </p>
            <button
              data-ui
              onClick={() => setShowNotes(false)}
              className="mt-5 min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Close
            </button>
          </div>
        </div>
      )}

      <PrototypeNav slugs={["1524-droste-descent"]} />
    </main>
  );
}
