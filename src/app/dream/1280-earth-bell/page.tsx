"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

import {
  MODES,
  MODE_COUNT,
  createModeModel,
  decayModel,
  modeAudioHz,
  modeVisHz,
  realSH,
  strikeModel,
  totalEnergy,
  MODE_MAX_ABS,
  type ModeModel,
} from "./modes";
import { createScene, type SceneHandle } from "./scene";
import { startAudio, type AudioEngine } from "./audio";
import { prefersReducedMotion } from "../_shared/psych/safeFlicker";

/*
 * 1280 · EARTH BELL
 *
 * Strike the whole planet like a bell and watch it ring. A physical MODEL of
 * the Earth's free-oscillation normal modes ₙSₗ — real eigenfrequencies scaled
 * into an audible chord, each mode's spherical-harmonic shape deforming a
 * three.js globe. Tap anywhere = a virtual great earthquake there: each mode is
 * excited by the value of its mode shape at the strike point. Orbit-drag to
 * turn the planet. (Distinct from 463-terra-gamelan, which is a PASSIVE readout
 * of real quake data — this is a PLAYED, perturbable eigenmode instrument.)
 */

const STRIKE_STRENGTH = 0.85;

export default function EarthBellPage() {
  const mountRef = useRef<HTMLDivElement>(null);
  const fallbackRef = useRef<HTMLCanvasElement>(null);

  const modelRef = useRef<ModeModel | null>(null);
  const sceneRef = useRef<SceneHandle | null>(null);
  const audioRef = useRef<AudioEngine | null>(null);
  const rafRef = useRef<number>(0);
  const reducedRef = useRef(false);

  const draggingRef = useRef(false);
  const movedRef = useRef(false);
  const downAtRef = useRef(0);
  const lastPtrRef = useRef({ x: 0, y: 0 });
  const fbRotRef = useRef({ x: 0.4, y: 0.6 });

  const [audioOn, setAudioOn] = useState(false);
  const [webglFailed, setWebglFailed] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [swell, setSwell] = useState(false);
  const [enabledUI, setEnabledUI] = useState<boolean[]>(() => MODES.map(() => true));
  const [energyUI, setEnergyUI] = useState(0);

  // ── Simulation + render loop (starts on mount; audio joins on "Begin") ──
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const reduced = prefersReducedMotion();
    reducedRef.current = reduced;

    const model = createModeModel();
    modelRef.current = model;

    const scene = createScene(mount, reduced);
    if (!scene) setWebglFailed(true);
    else sceneRef.current = scene;

    const fallbackCtx =
      !scene && fallbackRef.current ? fallbackRef.current.getContext("2d") : null;

    let last = performance.now();
    let energyTick = 0;

    const drawFallback = () => {
      const cv = fallbackRef.current;
      if (!cv || !fallbackCtx) return;
      const w = cv.width;
      const h = cv.height;
      const cx = w / 2;
      const cy = h / 2;
      const baseR = Math.min(w, h) * 0.3;
      fallbackCtx.fillStyle = "#04070a";
      fallbackCtx.fillRect(0, 0, w, h);

      const rot = fbRotRef.current.y;
      const N = 220;
      fallbackCtx.beginPath();
      for (let i = 0; i <= N; i++) {
        const a = (i / N) * Math.PI * 2;
        // A meridian cross-section: direction (sinθ, cosθ, 0) rotated by rot.
        const theta = a;
        const phi = 0;
        let disp = 0;
        for (let mi = 0; mi < MODE_COUNT; mi++) {
          const env = model.env[mi];
          if (env <= 0) continue;
          const w2 = 2 * Math.PI * modeVisHz(MODES[mi]);
          const shape = realSH(MODES[mi].l, MODES[mi].m, theta, phi) / MODE_MAX_ABS[mi];
          disp += env * Math.sin(w2 * model.t) * shape;
        }
        if (disp > 2.2) disp = 2.2;
        else if (disp < -2.2) disp = -2.2;
        const r = baseR * (1 + 0.2 * disp);
        const ang = a + rot;
        const px = cx + Math.cos(ang) * r;
        const py = cy + Math.sin(ang) * r;
        if (i === 0) fallbackCtx.moveTo(px, py);
        else fallbackCtx.lineTo(px, py);
      }
      fallbackCtx.closePath();
      const e = totalEnergy(model);
      fallbackCtx.fillStyle = `rgba(22,60,72,${0.4 + 0.4 * e})`;
      fallbackCtx.fill();
      fallbackCtx.lineWidth = 2;
      fallbackCtx.strokeStyle = `rgba(150,220,255,${0.4 + 0.5 * e})`;
      fallbackCtx.stroke();
    };

    const loop = () => {
      rafRef.current = requestAnimationFrame(loop);
      const now = performance.now();
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const elapsed = now / 1000;

      decayModel(model, dt);

      if (sceneRef.current) {
        sceneRef.current.update(model, elapsed, !draggingRef.current);
      } else {
        if (!reducedRef.current) fbRotRef.current.y += 0.05 * dt;
        drawFallback();
      }

      if (audioRef.current) {
        audioRef.current.setModes(model.env, model.enabled, totalEnergy(model));
      }

      energyTick += dt;
      if (energyTick >= 0.12) {
        energyTick = 0;
        setEnergyUI(totalEnergy(model));
      }
    };
    rafRef.current = requestAnimationFrame(loop);

    const handleResize = () => sceneRef.current?.resize();
    window.addEventListener("resize", handleResize);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", handleResize);
      sceneRef.current?.dispose();
      sceneRef.current = null;
    };
  }, []);

  // ── Audio teardown on unmount ──
  useEffect(() => {
    return () => {
      audioRef.current?.stop();
      audioRef.current = null;
    };
  }, []);

  const begin = useCallback(async () => {
    if (audioRef.current) return;
    try {
      const engine = await startAudio();
      audioRef.current = engine;
      engine.setSwell(swell);
      setAudioOn(true);
      // A first "great earthquake" so it rings immediately — a mid-latitude
      // strike (echoing 1960 Chile) that excites a broad chord.
      const model = modelRef.current;
      if (model) {
        const total = strikeModel(model, [0.42, -0.6, 0.68], STRIKE_STRENGTH);
        engine.impact(Math.min(1, total));
      }
    } catch {
      setAudioOn(false);
    }
  }, [swell]);

  // ── Strike (tap) at a screen point → a virtual earthquake there ──
  const strikeAt = useCallback((clientX: number, clientY: number) => {
    const model = modelRef.current;
    if (!model) return;
    let dir: [number, number, number] | null = null;
    if (sceneRef.current) {
      dir = sceneRef.current.pickLocalDir(clientX, clientY);
    } else {
      // Fallback: map the 2D pointer to a point on the visible disc.
      const cv = fallbackRef.current;
      if (cv) {
        const rect = cv.getBoundingClientRect();
        const nx = ((clientX - rect.left) / rect.width) * 2 - 1;
        const ny = -(((clientY - rect.top) / rect.height) * 2 - 1);
        const rr = Math.min(1, Math.hypot(nx, ny));
        const z = Math.sqrt(Math.max(0, 1 - rr * rr));
        dir = [nx, ny, z];
      }
    }
    if (!dir) return;
    const total = strikeModel(model, dir, STRIKE_STRENGTH);
    audioRef.current?.impact(Math.min(1, total));
  }, []);

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    draggingRef.current = true;
    movedRef.current = false;
    downAtRef.current = performance.now();
    lastPtrRef.current = { x: e.clientX, y: e.clientY };
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    const dx = e.clientX - lastPtrRef.current.x;
    const dy = e.clientY - lastPtrRef.current.y;
    if (Math.abs(dx) + Math.abs(dy) > 2) movedRef.current = true;
    lastPtrRef.current = { x: e.clientX, y: e.clientY };
    if (sceneRef.current) sceneRef.current.orbit(dx, dy);
    else fbRotRef.current.y += dx * 0.006;
  }, []);

  const onPointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const wasQuick = performance.now() - downAtRef.current < 320;
      draggingRef.current = false;
      if (!movedRef.current && wasQuick) strikeAt(e.clientX, e.clientY);
      (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
    },
    [strikeAt],
  );

  const toggleMode = useCallback((i: number) => {
    const model = modelRef.current;
    if (!model) return;
    model.enabled[i] = !model.enabled[i];
    setEnabledUI([...model.enabled]);
  }, []);

  const toggleSwell = useCallback(() => {
    setSwell((v) => {
      const next = !v;
      audioRef.current?.setSwell(next);
      return next;
    });
  }, []);

  return (
    <main className="relative flex h-dvh w-full flex-col overflow-hidden bg-[#04070a]">
      <header className="relative z-10 flex flex-col gap-1 p-4 pb-2">
        <div className="flex items-center justify-between gap-3">
          <h1 className="font-semibold text-2xl font-bold text-foreground">Earth Bell</h1>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowNotes((v) => !v)}
              className="min-h-[44px] rounded px-4 py-2.5 font-mono text-base text-muted-foreground ring-1 ring-border transition hover:text-foreground"
            >
              {showNotes ? "close notes" : "read the design notes"}
            </button>
            <Link
              href="/dream"
              className="flex min-h-[44px] items-center px-2 font-mono text-base text-muted-foreground transition hover:text-foreground"
            >
              ← dream lab
            </Link>
          </div>
        </div>
        <p className="max-w-3xl text-base text-muted-foreground">
          Strike the whole planet like a bell and watch it ring — excite the
          Earth&apos;s real free-oscillation normal modes, see the globe breathe in
          the true spherical-harmonic mode shapes, and hear those hour-long
          resonances scaled up into an audible chord.
        </p>
      </header>

      {showNotes && (
        <div className="relative z-20 mx-4 mb-2 max-w-3xl overflow-y-auto rounded-lg bg-black/70 p-4 font-mono text-base text-muted-foreground ring-1 ring-border backdrop-blur-sm">
          <p className="mb-2">
            <strong className="text-foreground">The question:</strong> what if you
            could <em>STRIKE</em> the whole Earth like a bell and watch it ring?
            After a great earthquake the entire planet rings for weeks in its{" "}
            <span className="text-violet-300">free oscillations</span> — discrete
            spheroidal normal modes ₙSₗ, each a real eigenfrequency of a few tenths
            of a mHz (the gravest, ₀S₂, has a ~54-minute period).
          </p>
          <p className="mb-2">
            <strong className="text-foreground">The model:</strong> we take real PREM
            eigenfrequencies for a handful of modes and scale them by one fixed
            factor (×315) into the audible band — ratios preserved, so the chord{" "}
            <em>is</em> the true mode spectrum. Each mode l carries a
            spherical-harmonic mode <em>shape</em> Yₗᵐ; we deform a three.js
            icosphere so its radius is modulated by the sum of the ringing modes&apos;
            shapes, oscillating at a second scaled (visible) rate. You see the l=2
            football, the l=4/6 sectoral crowns, the ₀S₀ breathing.
          </p>
          <p className="mb-2">
            <strong className="text-foreground">Played:</strong> tap anywhere = a
            virtual great earthquake <em>there</em>. Each mode is excited in
            proportion to the value of its shape at the strike point — strike a{" "}
            <span className="text-violet-300/95">node</span> and the mode barely
            rings; strike an <span className="text-violet-300/95">antinode</span>{" "}
            and it sings. Orbit-drag turns the planet; the mode buttons solo/mute;
            the swell keeps a soft planetary bed alive.
          </p>
          <p className="mb-2">
            <strong className="text-violet-300/95">Not 463-terra-gamelan:</strong>{" "}
            that piece is a <em>passive readout</em> of real earthquake DATA ringing
            bells. This is a <em>played physical MODEL</em> of the Earth&apos;s
            eigenmodes that you perturb by striking — no data, fully offline.
          </p>
          <p className="text-muted-foreground">
            Refs: free oscillations of the Earth; Benioff, Press &amp; Smith,
            &ldquo;Excitation of the free oscillations of the Earth by
            earthquakes,&rdquo; <em>J. Geophys. Res.</em> 66 (1961); the 1960
            Valdivia M9.5 Chile earthquake first rang ₀S₂ measurably; Dahlen &amp;
            Tromp, <em>Theoretical Global Seismology</em>. Approximate PREM values;
            not verified on a real GPU/ears.
          </p>
        </div>
      )}

      <div className="relative flex-1 overflow-hidden">
        <div
          ref={mountRef}
          className="h-full w-full touch-none"
          style={{ touchAction: "none" }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        />

        {webglFailed && (
          <canvas
            ref={fallbackRef}
            width={360}
            height={360}
            className="pointer-events-none absolute inset-0 m-auto h-full w-full object-contain opacity-95"
          />
        )}

        {/* Live readout */}
        <div className="pointer-events-none absolute left-4 top-4 z-10 rounded bg-black/45 px-3 py-2 font-mono text-base text-foreground ring-1 ring-border backdrop-blur-sm">
          <div className="text-violet-300">ringing energy {(energyUI * 100).toFixed(0)}%</div>
          <div className="text-muted-foreground">tap globe = strike · drag = orbit</div>
        </div>

        {webglFailed && (
          <div className="absolute right-4 top-4 z-10 max-w-xs rounded bg-black/60 px-3 py-2 font-mono text-base text-violet-300 ring-1 ring-violet-400/25 backdrop-blur-sm">
            WebGL unavailable — showing a 2D meridian cross-section of the same
            ringing globe. Tap to strike; drag to spin.
          </div>
        )}

        {/* Mode solo/mute row */}
        <div className="absolute bottom-24 left-1/2 z-10 flex max-w-full -translate-x-1/2 flex-wrap justify-center gap-2 px-4">
          {MODES.map((d, i) => (
            <button
              key={d.id}
              type="button"
              onClick={() => toggleMode(i)}
              title={`${d.id} · ${d.shape} · ${modeAudioHz(d).toFixed(0)} Hz`}
              className={`min-h-[44px] rounded-full px-4 py-2.5 font-mono text-base ring-1 transition ${
                enabledUI[i]
                  ? "bg-muted text-foreground ring-border"
                  : "text-muted-foreground ring-border hover:text-foreground"
              }`}
            >
              {d.label}{" "}
              <span className="text-muted-foreground">{modeAudioHz(d).toFixed(0)}Hz</span>
            </button>
          ))}
        </div>

        {/* Swell toggle */}
        <div className="absolute bottom-24 right-4 z-10">
          <button
            type="button"
            onClick={toggleSwell}
            className={`min-h-[44px] rounded-full px-4 py-2.5 font-mono text-base ring-1 transition ${
              swell
                ? "bg-violet-400/20 text-violet-300/95 ring-violet-300/40"
                : "text-muted-foreground ring-border hover:text-foreground"
            }`}
          >
            {swell ? "swell on" : "swell off"}
          </button>
        </div>

        {/* Begin (audio gate) */}
        {!audioOn && (
          <div className="absolute inset-x-0 bottom-4 z-20 flex flex-col items-center gap-2 px-4">
            <button
              type="button"
              onClick={begin}
              className="min-h-[44px] rounded-full bg-violet-400/90 px-4 py-2.5 font-mono text-base font-semibold text-black ring-1 ring-violet-200/40 transition hover:bg-violet-300"
            >
              ▶ Begin — strike the planet
            </button>
            <p className="text-base text-muted-foreground">
              The globe is already ringing silently — Begin adds the sound and
              gives it a first great earthquake.
            </p>
          </div>
        )}

        {audioOn && (
          <div className="pointer-events-none absolute inset-x-0 bottom-4 z-10 flex justify-center px-4">
            <p className="text-base text-muted-foreground">Tap the globe to ring it again.</p>
          </div>
        )}
      </div>
    </main>
  );
}
