"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 1568-worklet-mandala — "the mandala the compositor breathes"
//
// ONE QUESTION: What if a psychedelic Klüver-form-constant mandala breathed,
// spun and bloomed entirely as living DOM elements moved by the browser's
// COMPOSITOR — CSS Houdini AnimationWorklet, no canvas, no shader — and your
// singing voice drove it?
//
// Surface: AnimationWorklet drives the rotation of a lattice of ring <div>s off
// the main thread (progressive enhancement). A complete requestAnimationFrame
// fallback mutates the IDENTICAL ring transforms + CSS custom properties, so the
// piece runs everywhere (and headless). A live label states which path is hot.
//
// Input: sung/hummed mic voice — pitch → spin speed + hue, energy → bloom. A
// seeded idle self-demo keeps it alive and spinning with no mic. A soft
// just-intonation drone bed is tied to the pitch and never silent.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import { prefersReducedMotion } from "../_shared/psych/safeFlicker";
import { AudioEngine } from "./audio";
import { buildMandala, BASE_DEG_PER_SEC, SHAPE_RADII } from "./geometry";
import { idleSignal, pitchNorm } from "./signal";
import {
  hasAnimationWorklet,
  registerMandalaWorklet,
  attachRingWorklet,
  type WorkletAnimationLike,
} from "./worklet";

const MANDALA = buildMandala(620);
// worklet duration such that speed 1 / rate 1 → BASE_DEG_PER_SEC deg/sec.
const WORKLET_DUR_MS = (360 / BASE_DEG_PER_SEC) * 1000;

type Path = "worklet" | "raf";

export default function Page() {
  const [started, setStarted] = useState(false);
  const [path, setPath] = useState<Path>("raf");
  const [micGranted, setMicGranted] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  const figureRef = useRef<HTMLDivElement | null>(null);
  const ringEls = useRef<(HTMLDivElement | null)[]>([]);
  const ringAnims = useRef<(WorkletAnimationLike | null)[]>([]);
  const ringDeg = useRef<number[]>(MANDALA.rings.map(() => 0));

  const engineRef = useRef<AudioEngine | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastTimeRef = useRef(0);
  const reducedRef = useRef(false);
  const startedRef = useRef(false);
  const pathRef = useRef<Path>("raf");

  // smoothed control signals
  const bloomRef = useRef(0.3);
  const pitchFactorRef = useRef(1);
  const hueRef = useRef(250);
  const lastHueWrittenRef = useRef(-999);

  const teardownWorklet = useCallback(() => {
    ringAnims.current.forEach((a) => {
      try {
        a?.cancel();
      } catch {
        /* ignore */
      }
    });
    ringAnims.current = [];
  }, []);

  const applyFit = useCallback(() => {
    const fig = figureRef.current;
    if (!fig) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const fit = Math.min(1.15, (Math.min(vw, vh) * 0.9) / MANDALA.size);
    fig.style.setProperty("--fit", String(fit));
  }, []);

  // ── mount: register worklet (or fall back), attach spins, run always-on loop ─
  useEffect(() => {
    reducedRef.current = prefersReducedMotion();
    let cancelled = false;

    const boot = async () => {
      const usingWorklet = hasAnimationWorklet()
        ? await registerMandalaWorklet()
        : false;
      if (cancelled) return;

      if (usingWorklet) {
        // attach a compositor-driven spin to each ring wrapper
        let allOk = true;
        MANDALA.rings.forEach((ring, i) => {
          const el = ringEls.current[i];
          if (!el) {
            allOk = false;
            return;
          }
          const anim = attachRingWorklet(
            el,
            ring.dir,
            ring.speedMult,
            WORKLET_DUR_MS
          );
          ringAnims.current[i] = anim;
          if (!anim) allOk = false;
        });
        if (allOk) {
          pathRef.current = "worklet";
          setPath("worklet");
        } else {
          teardownWorklet();
          pathRef.current = "raf";
          setPath("raf");
        }
      } else {
        pathRef.current = "raf";
        setPath("raf");
      }
    };
    void boot();

    const onResize = () => applyFit();
    applyFit();
    window.addEventListener("resize", onResize);

    lastTimeRef.current = performance.now();
    const frame = () => {
      tick();
      rafRef.current = requestAnimationFrame(frame);
    };
    rafRef.current = requestAnimationFrame(frame);

    return () => {
      cancelled = true;
      window.removeEventListener("resize", onResize);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      teardownWorklet();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── the always-on frame ─────────────────────────────────────────────────────
  const tick = useCallback(() => {
    const now = performance.now();
    let dt = (now - lastTimeRef.current) / 1000;
    lastTimeRef.current = now;
    if (!(dt > 0) || dt > 0.1) dt = 0.016;
    const rm = reducedRef.current;

    // signal source: mic when running, else the seeded idle demo
    let pitchHz: number;
    let energy: number;
    const engine = engineRef.current;
    const mic = startedRef.current && engine ? engine.readMic() : null;
    if (mic && (mic.pitch !== null || mic.energy > 0.02)) {
      pitchHz = mic.pitch ?? hzFromNorm(0.5);
      energy = mic.energy;
    } else {
      const s = idleSignal(now * 0.001);
      pitchHz = s.pitch;
      energy = s.energy;
    }

    // feed the drone
    if (engine && startedRef.current) engine.setTargets(pitchHz, energy);

    // pitch → spin factor + hue ; energy → bloom
    const pn = pitchNorm(pitchHz);
    const factorCap = rm ? 1.0 : 2.1;
    const targetFactor = 0.5 + pn * (factorCap - 0.5);
    pitchFactorRef.current += (targetFactor - pitchFactorRef.current) * 0.06;

    const targetBloom = rm ? energy * 0.5 : energy;
    bloomRef.current += (targetBloom - bloomRef.current) * (rm ? 0.03 : 0.06);
    const bloom = bloomRef.current;

    const targetHue = 250 + (pn - 0.5) * 120; // 190 (cyan) → 310 (magenta)
    hueRef.current += (targetHue - hueRef.current) * (rm ? 0.015 : 0.03);

    const fig = figureRef.current;
    if (fig) {
      // bloom → figure scale pulse (compositor transform)
      const figScale = 0.95 + bloom * (rm ? 0.06 : 0.13);
      fig.style.setProperty("--figbloom", String(figScale));
      fig.style.setProperty("--bloom", String(bloom));
      // hue is throttled — slow drift, avoids repainting 176 tiles every frame
      const hue = hueRef.current;
      if (Math.abs(hue - lastHueWrittenRef.current) > 0.4) {
        fig.style.setProperty("--hue", hue.toFixed(1));
        lastHueWrittenRef.current = hue;
      }
    }

    if (pathRef.current === "worklet") {
      // compositor owns the rotation (per-ring speedMult is baked in as the
      // animator's `speed` option) — steer only the pitch factor via playbackRate
      const rate = pitchFactorRef.current;
      const anims = ringAnims.current;
      for (let i = 0; i < anims.length; i++) {
        const a = anims[i];
        if (a) a.playbackRate = rate;
      }
    } else {
      // rAF fallback carries the full fidelity — rotate every ring by hand
      const factor = pitchFactorRef.current;
      for (let i = 0; i < MANDALA.rings.length; i++) {
        const ring = MANDALA.rings[i];
        const degPerSec = BASE_DEG_PER_SEC * ring.speedMult * factor;
        ringDeg.current[i] += dt * degPerSec * ring.dir;
        const el = ringEls.current[i];
        if (el) el.style.transform = `rotate(${ringDeg.current[i].toFixed(3)}deg)`;
      }
    }
  }, []);

  // ── Start / Stop ────────────────────────────────────────────────────────────
  const handleStart = useCallback(async () => {
    if (startedRef.current || starting) return;
    setStarting(true);
    setAudioError(null);
    setMicError(null);

    const engine = new AudioEngine();
    engineRef.current = engine;
    const wantMic =
      typeof navigator !== "undefined" &&
      !!navigator.mediaDevices &&
      typeof navigator.mediaDevices.getUserMedia === "function";

    const res = await engine.start(wantMic);
    if (!res.ok) {
      setAudioError(res.audioError ?? "Audio could not start.");
      engineRef.current = null;
      setStarting(false);
      return;
    }
    if (!wantMic) {
      setMicError("This browser exposes no microphone — running the idle demo.");
    } else if (res.micError) {
      setMicError(res.micError);
    }
    setMicGranted(res.micGranted);
    startedRef.current = true;
    setStarted(true);
    setStarting(false);
  }, [starting]);

  const handleStop = useCallback(async () => {
    startedRef.current = false;
    setStarted(false);
    setMicGranted(false);
    const engine = engineRef.current;
    engineRef.current = null;
    if (engine) await engine.stop();
  }, []);

  // teardown audio on unmount
  useEffect(() => {
    return () => {
      const engine = engineRef.current;
      engineRef.current = null;
      startedRef.current = false;
      if (engine) void engine.stop();
    };
  }, []);

  // ── render ──────────────────────────────────────────────────────────────────
  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-background text-foreground">
      {/* the mandala stage */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div
          ref={figureRef}
          className="relative"
          style={
            {
              width: MANDALA.size,
              height: MANDALA.size,
              transform:
                "translateZ(0) scale(calc(var(--fit, 1) * var(--figbloom, 1)))",
              transformOrigin: "center",
              // seed the inherited custom props
              ["--hue" as string]: "250",
              ["--bloom" as string]: "0.3",
            } as React.CSSProperties
          }
        >
          {/* central bloom core */}
          <div
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-1/2"
            style={{
              width: MANDALA.size * 0.5,
              height: MANDALA.size * 0.5,
              transform:
                "translate(-50%,-50%) scale(calc(0.6 + var(--bloom) * 0.9))",
              borderRadius: "50%",
              background:
                "radial-gradient(circle, hsl(calc(var(--hue) + 20) 95% 62% / 0.42) 0%, hsl(calc(var(--hue) + 60) 90% 55% / 0.12) 45%, transparent 72%)",
              filter: "blur(6px)",
            }}
          />

          {MANDALA.rings.map((ring, ri) => (
            <div
              key={ring.index}
              ref={(el) => {
                ringEls.current[ri] = el;
              }}
              className="absolute inset-0"
              style={{
                transformOrigin: "center",
                willChange: "transform",
              }}
            >
              {ring.tiles.map((tile, ti) => (
                <div
                  key={ti}
                  className="absolute left-1/2 top-1/2"
                  style={
                    {
                      width: tile.size,
                      height: tile.size,
                      marginLeft: -tile.size / 2,
                      marginTop: -tile.size / 2,
                      transform: `rotate(${tile.angleDeg}deg) translate(0px, ${-tile.radius}px) rotate(${tile.petalDeg}deg)`,
                      transformOrigin: "center",
                      borderRadius: SHAPE_RADII[tile.shape],
                      ["--th" as string]: String(tile.hue),
                      ["--tl" as string]: `${Math.round(tile.light * 100)}%`,
                      background:
                        "radial-gradient(62% 62% at 50% 36%, hsl(calc(var(--hue) + var(--th)) 92% var(--tl)) 0%, hsl(calc(var(--hue) + var(--th) + 26) 88% calc(var(--tl) - 16%)) 56%, transparent 100%)",
                      boxShadow:
                        "0 0 10px hsl(calc(var(--hue) + var(--th)) 95% 66% / 0.45)",
                      willChange: "transform",
                    } as React.CSSProperties
                  }
                />
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* subtle vignette for depth (does not intercept input) */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(circle at 50% 50%, transparent 52%, rgba(0,0,0,0.55) 100%)",
        }}
      />

      {/* HUD */}
      <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-5 sm:p-7">
        <header className="max-w-xl">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Worklet Mandala
          </h1>
          <p className="mt-1 text-base text-muted-foreground">
            A Klüver-form-constant kaleidoscope of living DOM petals — spun by the
            browser&apos;s compositor. Sing or hum: pitch drives the spin and hue,
            loudness drives the bloom.
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-popover/70 px-3 py-1 font-mono text-xs backdrop-blur">
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{
                  background:
                    path === "worklet" ? "hsl(150 80% 55%)" : "hsl(45 90% 58%)",
                }}
              />
              {path === "worklet" ? "compositor worklet" : "rAF fallback"}
            </span>
            <span className="rounded-full border border-border bg-popover/70 px-3 py-1 font-mono text-xs text-muted-foreground backdrop-blur">
              {MANDALA.rings.length} rings · {MANDALA.tileCount} tiles
            </span>
            {started && (
              <span className="rounded-full border border-border bg-popover/70 px-3 py-1 font-mono text-xs text-muted-foreground backdrop-blur">
                {micGranted ? "voice → live" : "idle self-demo"}
              </span>
            )}
          </div>

          {(micError || audioError) && (
            <div className="mt-3 max-w-md space-y-1">
              {audioError && (
                <p className="text-sm font-medium text-destructive">
                  {audioError}
                </p>
              )}
              {micError && (
                <p className="text-sm font-medium text-destructive">
                  {micError}
                </p>
              )}
            </div>
          )}
        </header>

        <footer className="flex items-end justify-between gap-4">
          <div className="pointer-events-auto flex items-center gap-3">
            {!started ? (
              <button
                type="button"
                onClick={handleStart}
                disabled={starting}
                className="min-h-[44px] rounded-full border border-border bg-primary px-4 py-2.5 text-base font-semibold text-primary-foreground transition-colors hover:opacity-90 disabled:opacity-60"
              >
                {starting ? "Starting…" : "Start — sing to it"}
              </button>
            ) : (
              <button
                type="button"
                onClick={handleStop}
                className="min-h-[44px] rounded-full border border-border bg-secondary px-4 py-2.5 text-base font-semibold text-secondary-foreground transition-colors hover:opacity-90"
              >
                Stop
              </button>
            )}
            <p className="max-w-xs text-sm text-muted-foreground">
              {started
                ? micGranted
                  ? "Hold a note. Higher = faster + cyan; louder = bigger bloom."
                  : "No mic — a seeded curve is playing it for you."
                : "The mandala already spins on a seeded demo. Start to add the drone and your voice."}
            </p>
          </div>
        </footer>
      </div>

      <PrototypeNav slugs={["1568-worklet-mandala"]} />
    </main>
  );
}

/** Inverse of pitchNorm for a normalized position → Hz (log scale). */
function hzFromNorm(n: number): number {
  const lo = 90;
  const hi = 560;
  return Math.pow(2, Math.log2(lo) + n * (Math.log2(hi) - Math.log2(lo)));
}
