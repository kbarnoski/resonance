"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 2252-eternal-return — "Eternal Return"   (PLAYED cycle-2 of 2244-deep-now)
//
// THE ONE QUESTION: What if attention could dilate a single moment of music into
// an eternal now you can stand inside — a radiant chord-cloud that hangs while
// the music keeps flowing underneath?
//
// LINEAGE: 2244-deep-now made subjective time-dilation a PLAYED mechanic on
// abstract SVG echoes. This cycle-2 applies the same attention→time-dilation to
// REAL MUSICAL MATERIAL (a seeded generative C-Lydian phrase) and renders it as a
// CSS COMPOSITOR light-bloom — no canvas, no WebGL, no SVG art. Each note spawns
// one radial-gradient <div>; layers composite with mix-blend-mode:screen so light
// ADDS into an over-bright plenum.
//
// DUAL TIME-STREAMS (the cycle-2 idea): the phrase scheduler advances at an
// OBJECTIVE tempo regardless of attention — new notes keep arriving — while the
// recently-attended light-layers FREEZE and accumulate. You hear the phrase flow
// on while you watch a slice of it hang. Pitch is never dilated; only time,
// lifetime, and reverb-bloom stretch.
//
// PLAYED mechanic: press-and-hold (multi-pointer) raises attention A, a
// slew-limited follower with asymmetric rise/decay. A drives
// timeScale = 1/(1+6A). High A → layers advance by dt×timeScale (they HANG) and
// bloom by ~1/timeScale (brighter + larger). Release → A decays → the cloud
// resumes dissipating (the "return" to flowing time). Pointer x nudges which
// register blooms; pointer y nudges bloom softness.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createSafeFlicker, prefersReducedMotion } from "../_shared/psych/safeFlicker";
import { EternalReturnAudio, PhraseScheduler, type NoteEvent } from "./audio";
import { mulberry32, randRange } from "./rng";

const SEED = 0x2252;
const LAYER_POOL = 48; // bounded — reused, never unbounded
const LAYER_BASE = 340; // px, the unscaled diameter of a light-layer div
const IDLE_MS = 7000; // after live input stops, autopilot resumes

interface Layer {
  el: HTMLDivElement;
  active: boolean;
  cx: number; // screen centre X at spawn (px)
  cy: number; // screen centre Y at spawn (px)
  life: number;
  maxLife: number;
  size: number; // 0..1 base-scale seed
  driftX: number;
  driftY: number;
  baseOp: number;
}

export default function EternalReturnPage() {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const layersHostRef = useRef<HTMLDivElement | null>(null);
  const plenumRef = useRef<HTMLDivElement | null>(null);

  const [started, setStarted] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(false);
  const [shimmerOn, setShimmerOn] = useState(false);
  const [fileMsg, setFileMsg] = useState<string | null>(null);
  const [hud, setHud] = useState({ a: 0, moment: 1 });

  // ── mutable engine state (refs — never trigger re-render per frame) ──────────
  const audioRef = useRef<EternalReturnAudio | null>(null);
  const sizeRef = useRef({ w: 1, h: 1 });
  const poolRef = useRef<Layer[]>([]);
  const aRef = useRef(0); // attention follower A
  const tsRef = useRef(1); // timeScale
  const pxRef = useRef(0.5); // pointer x expressivity 0..1
  const pyRef = useRef(0.5); // pointer y expressivity 0..1
  const pointersRef = useRef<Set<number>>(new Set());

  // separate seeded streams so the musical phrase stays identical whether or not
  // the user plays (autopilot / jitter draws never perturb the composition).
  const schedRef = useRef<PhraseScheduler>(new PhraseScheduler(mulberry32(SEED)));
  const rndAutoRef = useRef<() => number>(mulberry32((SEED ^ 0x9e3779b9) >>> 0));
  const rndJitRef = useRef<() => number>(mulberry32((SEED ^ 0x1b56c4e9) >>> 0));

  const shimmerRef = useRef(createSafeFlicker({ maxHz: 3, defaultHz: 1.2, floor: 0.62 }));
  const reducedRef = useRef(false);
  const rafRef = useRef(0);
  const startTsRef = useRef(0);
  const lastTsRef = useRef(0);
  const lastLiveMsRef = useRef(-Infinity);
  const hudTickRef = useRef(0);

  // autopilot state machine (seeded; overridden instantly by live input)
  const apRef = useRef({
    phase: "wait" as "wait" | "hold",
    nextAt: 700,
    idx: 0,
    x: 0.5,
    y: 0.5,
    tx: 0.5,
    ty: 0.5,
  });

  // ── size tracking ────────────────────────────────────────────────────────────
  const measure = useCallback(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const r = stage.getBoundingClientRect();
    sizeRef.current = { w: Math.max(1, r.width), h: Math.max(1, r.height) };
  }, []);

  // ── build the CSS-compositor light-layer pool imperatively ────────────────────
  useEffect(() => {
    reducedRef.current = prefersReducedMotion();
    const host = layersHostRef.current;
    if (!host) return;

    const pool: Layer[] = [];
    for (let i = 0; i < LAYER_POOL; i++) {
      const el = document.createElement("div");
      el.style.position = "absolute";
      el.style.left = "0px";
      el.style.top = "0px";
      el.style.width = `${LAYER_BASE}px`;
      el.style.height = `${LAYER_BASE}px`;
      el.style.borderRadius = "50%";
      el.style.pointerEvents = "none";
      el.style.mixBlendMode = "screen";
      el.style.transformOrigin = "center";
      el.style.willChange = "transform, opacity";
      el.style.opacity = "0";
      el.style.transform = "translate(-9999px,-9999px)";
      host.appendChild(el);
      pool.push({
        el,
        active: false,
        cx: 0,
        cy: 0,
        life: 0,
        maxLife: 1.5,
        size: 0.5,
        driftX: 0,
        driftY: 0,
        baseOp: 0.5,
      });
    }
    poolRef.current = pool;

    measure();
    const onResize = () => measure();
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      for (const l of pool) l.el.remove();
    };
  }, [measure]);

  // ── spawn one light-layer for a note event (audio event → visual layer) ───────
  const spawnLayer = useCallback((x01: number, y01: number, velocity: number) => {
    const pool = poolRef.current;
    if (pool.length === 0) return;
    let l = pool.find((p) => !p.active);
    if (!l) {
      // recycle the layer furthest through its (dilated) life
      l = pool.reduce((a, b) => (a.life / a.maxLife > b.life / b.maxLife ? a : b));
    }
    const { w, h } = sizeRef.current;
    const jit = rndJitRef.current;

    // pitch-class → X, register → Y (higher register sits higher on screen).
    // pointer X nudges WHICH register blooms (a horizontal bias to the slice).
    const margin = 0.14;
    const biasX = (pxRef.current - 0.5) * 0.16;
    const px01 = Math.max(0, Math.min(1, x01 + biasX + randRange(jit, -0.03, 0.03)));
    const py01 = Math.max(0, Math.min(1, 1 - y01 + randRange(jit, -0.04, 0.04)));

    l.active = true;
    l.cx = (margin + px01 * (1 - 2 * margin)) * w;
    l.cy = (margin + py01 * (1 - 2 * margin)) * h;
    l.life = 0;
    l.maxLife = randRange(jit, 1.3, 1.8);
    l.size = 0.45 + velocity * 0.55 + randRange(jit, -0.08, 0.08);
    l.driftX = randRange(jit, -26, 26);
    l.driftY = -randRange(jit, 18, 54); // gentle upward rise
    l.baseOp = 0.4 + 0.32 * velocity;

    const hue = 200 + x01 * 158 + randRange(jit, -8, 8); // cyan→blue→violet→magenta
    l.el.style.background =
      `radial-gradient(circle at center, ` +
      `hsla(${hue.toFixed(0)}, 96%, 74%, 0.95) 0%, ` +
      `hsla(${(hue + 14).toFixed(0)}, 92%, 60%, 0.5) 34%, ` +
      `hsla(${(hue + 20).toFixed(0)}, 88%, 50%, 0) 70%)`;
  }, []);

  // ── objective-tempo note emitter (spawns layer + sounds it) ───────────────────
  const emitNote = useCallback(
    (n: NoteEvent) => {
      spawnLayer(n.x01, n.y01, n.velocity);
      audioRef.current?.strike(n.freq, n.velocity);
    },
    [spawnLayer],
  );

  // ── the render / physics loop ─────────────────────────────────────────────────
  useEffect(() => {
    const step = (ts: number) => {
      rafRef.current = requestAnimationFrame(step);
      if (startTsRef.current === 0) {
        startTsRef.current = ts;
        lastTsRef.current = ts;
      }
      const elapsedMs = ts - startTsRef.current;
      const elapsedSec = elapsedMs / 1000;
      let dt = (ts - lastTsRef.current) / 1000;
      lastTsRef.current = ts;
      if (dt > 0.05) dt = 0.05; // clamp big gaps (tab switch)

      // ---- autopilot (seeded, headless-safe self-demo of the dilation arc) -----
      const liveActive =
        pointersRef.current.size > 0 || elapsedMs - lastLiveMsRef.current < IDLE_MS;
      const ap = apRef.current;
      const rndA = rndAutoRef.current;
      let apPressed = false;
      if (liveActive) {
        ap.phase = "wait";
        ap.nextAt = elapsedMs + 500;
      } else {
        if (ap.phase === "hold") {
          apPressed = true;
          // ease the virtual pointer toward its drifting target (plays x/y)
          ap.x += (ap.tx - ap.x) * Math.min(1, dt * 0.5);
          ap.y += (ap.ty - ap.y) * Math.min(1, dt * 0.5);
          pxRef.current = ap.x;
          pyRef.current = ap.y;
        }
        if (elapsedMs >= ap.nextAt) {
          if (ap.phase === "wait") {
            // Alternate short flowing taps with occasional long swelling holds so
            // the arc flow → attend → hanging bloom → release is self-evident.
            const pat = ap.idx % 5;
            const long = pat === 1 || pat === 4;
            const veryLong = pat === 4;
            ap.x = randRange(rndA, 0.2, 0.8);
            ap.y = randRange(rndA, 0.25, 0.75);
            ap.tx = randRange(rndA, 0.2, 0.8);
            ap.ty = randRange(rndA, 0.25, 0.75);
            const holdMs = long
              ? (veryLong ? 5200 : 3600) + randRange(rndA, 0, 700)
              : 420 + randRange(rndA, 0, 460);
            ap.phase = "hold";
            ap.nextAt = elapsedMs + holdMs;
          } else {
            ap.idx++;
            ap.phase = "wait";
            ap.nextAt = elapsedMs + 650 + randRange(rndA, 0, 1400);
          }
        }
      }

      // ---- attention follower A (asymmetric: gathers slowly, lets go slowly) ---
      const pressed = pointersRef.current.size > 0 || apPressed;
      const target = pressed ? 1 : 0;
      const tau = pressed ? 0.6 : 1.1; // rise τ≈0.6 s, decay τ≈1.1 s
      const k = 1 - Math.exp(-dt / tau);
      aRef.current += (target - aRef.current) * k;
      const A = aRef.current;
      const timeScale = 1 / (1 + 6 * A); // 1 at rest → ~0.14 deep attention
      tsRef.current = timeScale;
      audioRef.current?.setDilation(A, timeScale);

      // ---- the OBJECTIVE stream: keeps emitting notes regardless of A ----------
      schedRef.current.advance(elapsedSec, emitNote);

      // ---- file-drop onset stream (optional) → also spawns layers on transients-
      const onset = audioRef.current?.pollOnset(dt) ?? 0;
      if (onset > 0) {
        const jit = rndJitRef.current;
        spawnLayer(randRange(jit, 0, 1), randRange(jit, 0.2, 0.9), 0.5 + onset * 0.5);
      }

      // ---- luminance safety: opt-in ≤3 Hz soft shimmer, else steady ------------
      const flick = shimmerRef.current.value(elapsedSec);

      // ---- advance & composite the light-layers (the ATTENDED stream) ----------
      // bloom factor: at deep attention layers HANG (dt×timeScale) AND swell.
      const bloom = Math.max(1, Math.min(6, 1 / timeScale));
      const driftScale = reducedRef.current ? 0.25 : 1;
      const pool = poolRef.current;
      for (let i = 0; i < pool.length; i++) {
        const l = pool[i];
        if (!l.active) continue;
        l.life += dt * timeScale; // <- subjective slow-motion while attending
        const p = l.life / l.maxLife;
        if (p >= 1) {
          l.active = false;
          l.el.style.opacity = "0";
          l.el.style.transform = "translate(-9999px,-9999px)";
          continue;
        }
        const grow = 0.4 + 1.15 * p;
        const scale = grow * (0.7 + 0.65 * l.size) * (1 + (bloom - 1) * 0.16);
        const op = Math.min(
          1,
          l.baseOp * Math.pow(1 - p, 1.1) * (0.55 + 0.45 * bloom) * flick,
        );
        const cx = l.cx + l.driftX * p * driftScale;
        const cy = l.cy + l.driftY * p * driftScale;
        l.el.style.left = `${(cx - LAYER_BASE / 2).toFixed(1)}px`;
        l.el.style.top = `${(cy - LAYER_BASE / 2).toFixed(1)}px`;
        l.el.style.transform = `scale(${scale.toFixed(3)})`;
        l.el.style.opacity = op.toFixed(3);
      }

      // ---- the central plenum glow: swells with attention (ecstatic core) ------
      const plenum = plenumRef.current;
      if (plenum) {
        const breathAmp = reducedRef.current ? 0.02 : 0.1;
        const breath = 1 + breathAmp * Math.sin(elapsedSec * 2 * Math.PI * 0.12);
        const pScale = (0.5 + 2.2 * A) * breath;
        plenum.style.transform = `translate(-50%, -50%) scale(${pScale.toFixed(3)})`;
        plenum.style.opacity = (Math.min(1, 0.06 + 0.7 * A) * flick).toFixed(3);
        // soft bloom "softness" nudged by pointer Y
        const blurPx = (6 + pyRef.current * 26) * (0.4 + 0.6 * A);
        plenum.style.filter = `blur(${blurPx.toFixed(0)}px)`;
      }

      // ---- throttled HUD -------------------------------------------------------
      if (elapsedMs - hudTickRef.current > 90) {
        hudTickRef.current = elapsedMs;
        setHud({ a: A, moment: 1 / timeScale });
      }

      audioRef.current?.reap();
    };

    rafRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafRef.current);
  }, [emitNote, spawnLayer]);

  // full teardown of audio on unmount
  useEffect(() => {
    return () => {
      audioRef.current?.dispose();
      audioRef.current?.ctx.close().catch(() => {});
    };
  }, []);

  // ── pointer handlers (multi-pointer press-and-hold raises attention) ──────────
  const localXY = (e: React.PointerEvent) => {
    const stage = stageRef.current;
    if (!stage) return { x01: 0.5, y01: 0.5 };
    const r = stage.getBoundingClientRect();
    return {
      x01: Math.max(0, Math.min(1, (e.clientX - r.left) / Math.max(1, r.width))),
      y01: Math.max(0, Math.min(1, (e.clientY - r.top) / Math.max(1, r.height))),
    };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    pointersRef.current.add(e.pointerId);
    lastLiveMsRef.current = performance.now() - startTsRef.current;
    const { x01, y01 } = localXY(e);
    pxRef.current = x01;
    pyRef.current = y01;
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointersRef.current.has(e.pointerId)) return;
    lastLiveMsRef.current = performance.now() - startTsRef.current;
    const { x01, y01 } = localXY(e);
    pxRef.current = x01;
    pyRef.current = y01;
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (!pointersRef.current.has(e.pointerId)) return;
    pointersRef.current.delete(e.pointerId);
    lastLiveMsRef.current = performance.now() - startTsRef.current;
  };

  // ── begin (creates the AudioContext on a user gesture) ────────────────────────
  const begin = useCallback(() => {
    setStarted(true);
    if (audioRef.current) return;
    try {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!AC) {
        setAudioError("Web Audio is unavailable — visuals continue silently.");
        return;
      }
      const ctx = new AC();
      ctx.resume().catch(() => {});
      audioRef.current = new EternalReturnAudio(ctx);
    } catch {
      setAudioError("Could not start audio — visuals continue silently.");
    }
  }, []);

  const toggleShimmer = useCallback(() => {
    setShimmerOn((on) => {
      const next = !on;
      if (next) shimmerRef.current.enable();
      else shimmerRef.current.kill();
      return next;
    });
  }, []);

  // ── optional file-drop → decode + play through the same graph ─────────────────
  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer?.files?.[0];
    if (!file) return;
    const audio = audioRef.current;
    if (!audio) {
      setFileMsg("Press Begin first to enable audio, then drop a file.");
      return;
    }
    setFileMsg(`Decoding ${file.name}…`);
    file
      .arrayBuffer()
      .then((buf) => audio.playFile(buf))
      .then((ok) => {
        setFileMsg(
          ok
            ? `Playing ${file.name} — onsets bloom as layers.`
            : "Could not decode that file — the generative phrase continues.",
        );
      })
      .catch(() => setFileMsg("Could not read that file — the phrase continues."));
  }, []);

  const onDragOver = (e: React.DragEvent) => e.preventDefault();

  return (
    <main
      className="relative h-[100dvh] w-full overflow-hidden bg-background text-foreground"
      onDrop={onDrop}
      onDragOver={onDragOver}
    >
      {/* the CSS compositor stage (black field; light-layers ADD via screen) */}
      <div
        ref={stageRef}
        className="absolute inset-0 touch-none select-none"
        style={{ cursor: "crosshair", background: "#04030a" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {/* central plenum glow (swells with attention) */}
        <div
          ref={plenumRef}
          className="pointer-events-none absolute left-1/2 top-1/2"
          style={{
            width: "70vmin",
            height: "70vmin",
            borderRadius: "50%",
            mixBlendMode: "screen",
            opacity: 0,
            background:
              "radial-gradient(circle at center, hsla(276,96%,80%,0.9) 0%, hsla(268,90%,62%,0.4) 38%, transparent 70%)",
          }}
        />
        {/* light-layers are appended here imperatively */}
        <div ref={layersHostRef} className="pointer-events-none absolute inset-0" />
      </div>

      {/* HUD readout */}
      <div className="pointer-events-none absolute right-4 top-4 z-10 flex flex-col items-end gap-1 text-right">
        <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          attention {(hud.a * 100).toFixed(0)}%
        </span>
        <span className="font-mono text-xs uppercase tracking-[0.18em] text-primary">
          moment ×{hud.moment.toFixed(1)}
        </span>
        <div className="mt-1 h-1.5 w-28 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-100"
            style={{ width: `${(hud.a * 100).toFixed(0)}%` }}
          />
        </div>
      </div>

      {/* design-notes affordance */}
      <div className="absolute left-4 top-4 z-10 flex items-center gap-3">
        <button
          onClick={() => setShowNotes((s) => !s)}
          className="pointer-events-auto font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground underline decoration-muted-foreground/40 underline-offset-4 hover:text-foreground"
        >
          {showNotes ? "close notes" : "design notes"}
        </button>
      </div>

      {/* shimmer control (opt-in, ≤3 Hz, safe) */}
      <div className="absolute bottom-4 right-4 z-10 flex items-center gap-2">
        <button
          onClick={toggleShimmer}
          className={`pointer-events-auto min-h-[44px] rounded-md border px-4 text-sm transition-colors ${
            shimmerOn
              ? "border-primary bg-primary/20 text-foreground"
              : "border-border bg-background/60 text-muted-foreground hover:bg-accent hover:text-foreground"
          }`}
          title="Opt-in slow luminance shimmer, hard-capped ≤3 Hz (photosensitive-safe)"
        >
          Shimmer {shimmerOn ? "on" : "off"}
        </button>
      </div>

      {(audioError || fileMsg) && (
        <div className="pointer-events-none absolute bottom-4 left-4 z-10 max-w-xs text-sm">
          {audioError && <p className="text-destructive">{audioError}</p>}
          {fileMsg && <p className="text-muted-foreground">{fileMsg}</p>}
        </div>
      )}

      {/* intro overlay — visuals already self-demo behind it */}
      {!started && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="mx-4 max-w-md rounded-lg border border-border bg-background p-6 shadow-lg">
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-primary">
              Resonance · dream lab
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
              Eternal Return
            </h1>
            <p className="mt-3 text-base text-muted-foreground">
              A modal phrase keeps flowing. Press and hold anywhere to attend —
              the recent notes stop dissipating and hang as a radiant chord-cloud
              you can stand inside, while the music streams on underneath. Release
              and the cloud returns to flowing time. Use several fingers; x nudges
              which register blooms, y its softness.
            </p>
            <button
              onClick={begin}
              className="mt-6 min-h-[44px] w-full rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Begin
            </button>
            <p className="mt-3 text-center font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              a seeded autopilot is already playing
            </p>
          </div>
        </div>
      )}

      {/* notes panel */}
      {showNotes && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="max-h-[85vh] max-w-lg overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-lg">
            <h2 className="text-xl font-semibold tracking-tight text-foreground">
              Design notes — Eternal Return
            </h2>
            <p className="mt-3 text-base text-muted-foreground">
              <span className="text-foreground">The question:</span> what if
              attention could dilate a single moment of music into an eternal now
              you can stand inside — a radiant chord-cloud that hangs while the
              music keeps flowing underneath?
            </p>
            <p className="mt-3 text-base text-muted-foreground">
              <span className="text-foreground">Cycle-2 of The Deep Now:</span>{" "}
              2244 dilated abstract echoes. Here the same attention→time-dilation
              acts on real musical material — a seeded generative C-Lydian phrase —
              rendered as a CSS compositor: every note spawns one radial-gradient
              layer that composites with mix-blend-mode:screen, so light adds into
              an over-bright plenum.
            </p>
            <p className="mt-3 text-base text-muted-foreground">
              <span className="text-foreground">Dual time-streams:</span> the
              phrase scheduler runs at an objective tempo regardless of attention —
              new notes keep arriving — while the attended layers freeze
              (life advances by dt×timeScale) and bloom (~1/timeScale). You hear
              the phrase flow on while a slice of it hangs. Pitch is never
              dilated; only time, lifetime, and reverb-bloom stretch.
            </p>
            <p className="mt-3 text-base text-muted-foreground">
              <span className="text-foreground">The science:</span> psychedelic
              time-dilation is over-processing / raised sensory gain, not a
              changed pacemaker (PsyPost, 2026-03-20). Marc Wittmann,{" "}
              <span className="italic">Felt Time</span> (MIT Press): subjective
              duration expands with attention. Engaged, analytical listening
              deepens flow, which warps felt time (bioRxiv, 2026-05-13, &ldquo;A
              Deep Dive into the Cognitive Soundscape of Flow&rdquo;).
            </p>
            <div className="mt-5 flex items-center gap-4">
              <Link
                href="/dream/2252-eternal-return/README.md"
                className="font-mono text-xs uppercase tracking-[0.18em] text-primary underline decoration-primary/40 underline-offset-4 hover:decoration-primary"
              >
                Full README
              </Link>
              <button
                onClick={() => setShowNotes(false)}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
