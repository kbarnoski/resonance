"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

import {
  createFaraday,
  setDrive,
  step,
  tap,
  lockLevel,
  sampleHeight,
  SYMMETRY_LABEL,
  PRESET_F,
  F_MIN,
  F_MAX,
  EPS_MIN,
  EPS_MAX,
  type FaradayState,
  type ActiveSymmetry,
} from "./faraday";
import { createScene, type SceneHandle } from "./scene";
import { startAudio, type AudioEngine } from "./audio";
import { prefersReducedMotion } from "../_shared/psych/safeFlicker";

/*
 * 1278 · FARADAY RELIEF
 *
 * Play a vibrating fluid membrane as real 3D relief. A parametric-Faraday
 * amplitude model drives six competing standing-wave modes; their sum is
 * displaced into an actual metallic mesh seen at a raking angle. Drag to drive
 * it through stripes → squares → hexagons → a 12-fold quasicrystal; each
 * symmetry answers at the subharmonic f/2 with its own chord.
 */

type Readout = {
  symmetry: ActiveSymmetry;
  f: number;
  eps: number;
  lock: number;
};

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export default function FaradayReliefPage() {
  const mountRef = useRef<HTMLDivElement>(null);
  const fallbackRef = useRef<HTMLCanvasElement>(null);

  const faradayRef = useRef<FaradayState | null>(null);
  const sceneRef = useRef<SceneHandle | null>(null);
  const audioRef = useRef<AudioEngine | null>(null);
  const rafRef = useRef<number>(0);
  const draggingRef = useRef(false);
  const movedRef = useRef(false);
  const downAtRef = useRef(0);

  const [audioOn, setAudioOn] = useState(false);
  const [webglFailed, setWebglFailed] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [readout, setReadout] = useState<Readout>({
    symmetry: "square",
    f: PRESET_F.square,
    eps: 0.75,
    lock: 0,
  });

  // ── Simulation + render loop (starts on mount; audio joins on "Begin") ──
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const reduced = prefersReducedMotion();
    const faraday = createFaraday();
    faradayRef.current = faraday;

    const scene = createScene(mount, reduced);
    if (!scene) {
      setWebglFailed(true);
    } else {
      sceneRef.current = scene;
    }

    const fallbackCtx =
      !scene && fallbackRef.current ? fallbackRef.current.getContext("2d") : null;

    let last = performance.now();
    let acc = 0;
    let readoutTick = 0;
    const DT = 0.016;

    const drawFallback = () => {
      const cv = fallbackRef.current;
      if (!cv || !fallbackCtx) return;
      const w = cv.width;
      const h = cv.height;
      const img = fallbackCtx.createImageData(w, h);
      const data = img.data;
      const half = 6; // plane spans -6..6
      for (let py = 0; py < h; py++) {
        const yWorld = (py / h) * 2 * half - half;
        for (let px = 0; px < w; px++) {
          const xWorld = (px / w) * 2 * half - half;
          const hgt = sampleHeight(faraday, xWorld, yWorld);
          // cheap shading: slope in x for a raking-light feel
          const hx = sampleHeight(faraday, xWorld + 0.08, yWorld);
          const slope = (hx - hgt) * 6;
          const shade = clamp01(0.32 + hgt * 0.28 + slope * 0.5);
          const o = (py * w + px) * 4;
          data[o] = 40 + shade * 150; // petrol/copper-ish
          data[o + 1] = 55 + shade * 175;
          data[o + 2] = 70 + shade * 190;
          data[o + 3] = 255;
        }
      }
      fallbackCtx.putImageData(img, 0, 0);
    };

    const loop = () => {
      rafRef.current = requestAnimationFrame(loop);
      const now = performance.now();
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const elapsed = now / 1000;

      // Fixed-step forward Euler (bounded number of substeps).
      acc += dt;
      let steps = 0;
      while (acc >= DT && steps < 4) {
        step(faraday, DT);
        acc -= DT;
        steps++;
      }

      if (sceneRef.current) sceneRef.current.update(faraday, elapsed);
      else drawFallback();

      const lock = lockLevel(faraday);
      if (audioRef.current) {
        audioRef.current.setState(faraday.f, faraday.symmetry, lock);
      }

      readoutTick += dt;
      if (readoutTick >= 0.15) {
        readoutTick = 0;
        setReadout({ symmetry: faraday.symmetry, f: faraday.f, eps: faraday.eps, lock });
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
      audioRef.current = await startAudio();
      setAudioOn(true);
    } catch {
      setAudioOn(false);
    }
  }, []);

  // ── Pointer play: X → drive frequency f, Y → drive amplitude ε ──
  const applyPointer = useCallback((clientX: number, clientY: number, el: HTMLElement) => {
    const f = faradayRef.current;
    if (!f) return;
    const rect = el.getBoundingClientRect();
    const nx = clamp01((clientX - rect.left) / rect.width);
    const ny = clamp01((clientY - rect.top) / rect.height);
    const freq = F_MIN + nx * (F_MAX - F_MIN);
    const eps = EPS_MIN + (1 - ny) * (EPS_MAX - EPS_MIN); // up = more drive
    setDrive(f, freq, eps);
  }, []);

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    draggingRef.current = true;
    movedRef.current = false;
    downAtRef.current = performance.now();
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  }, []);

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!draggingRef.current) return;
      movedRef.current = true;
      applyPointer(e.clientX, e.clientY, e.currentTarget);
    },
    [applyPointer],
  );

  const onPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const wasQuick = performance.now() - downAtRef.current < 320;
    draggingRef.current = false;
    if (!movedRef.current && wasQuick && faradayRef.current) {
      tap(faradayRef.current); // click / tap = drop a ripple
    }
    (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
  }, []);

  const jumpTo = useCallback((sym: ActiveSymmetry) => {
    const f = faradayRef.current;
    if (!f) return;
    setDrive(f, PRESET_F[sym], 0.82);
  }, []);

  const presets: ActiveSymmetry[] = ["stripes", "square", "hexagon", "quasicrystal"];
  const belowThreshold = readout.eps < 0.3;

  return (
    <main className="relative flex h-dvh w-full flex-col overflow-hidden bg-[#05070a]">
      <header className="relative z-10 flex flex-col gap-1 p-4 pb-2">
        <div className="flex items-center justify-between gap-3">
          <h1 className="font-mono text-2xl font-bold text-foreground">Faraday Relief</h1>
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
          Play a vibrating fluid membrane as real 3D relief — drag to drive a
          liquid-metal surface through stripes, squares, hexagons and a 12-fold
          quasicrystal, each symmetry answering at the subharmonic f/2 with its
          own chord.
        </p>
      </header>

      {showNotes && (
        <div className="relative z-20 mx-4 mb-2 max-w-3xl overflow-y-auto rounded-lg bg-black/70 p-4 font-mono text-base text-muted-foreground ring-1 ring-border backdrop-blur-sm">
          <p className="mb-2">
            <strong className="text-foreground">The question:</strong> what if you
            could <em>play</em> a Faraday-vibrated fluid as tactile relief —
            watching displaced geometry rise into stripes → squares → hexagons →
            a 12-fold quasicrystal, catching metallic light, each symmetry a
            chord?
          </p>
          <p className="mb-2">
            <strong className="text-foreground">The physics:</strong> not
            Navier–Stokes but the slow-envelope amplitude equations of six
            competing standing waves,{" "}
            <span className="text-foreground">
              dA_j/dt = A_j(σ_j − A_j² − c·Σ A_m²)
            </span>
            . The drive amplitude ε gates growth (below ε_c the surface
            flattens); the drive frequency f sets both the wavenumber and the
            symmetry via the mode weights. Cubic saturation bounds it. The
            surface answers at the subharmonic <em>f/2</em> — the real Faraday
            signature — and the active symmetry picks the chord (fifth / minor /
            major-add9 / quartal shimmer).
          </p>
          <p className="mb-2">
            <strong className="text-foreground">The render:</strong> the height
            field h(x,y)=Σ A_j·cos(k·(x·cosθ_j+y·sinθ_j)+φ_j) is displaced into a
            real subdivided mesh, normals recomputed each frame, lit by a dark
            mercury environment and two drifting lights at a low raking angle so
            the specular glints slide along the ridges as they lock.
          </p>
          <p className="mb-2">
            <strong className="text-foreground">Played:</strong> drag horizontally
            for frequency (symmetry + ripple scale), vertically for drive
            amplitude, tap to drop a ripple that collapses and re-forms the
            relief, or jump with the preset buttons.
          </p>
          <p className="text-muted-foreground">
            Refs: Faraday 1831, <em>On the forms and states assumed by fluids in
            contact with vibrating elastic surfaces</em>; Chladni 1787; Edwards &
            Fauve 1994, <em>Patterns and quasi-patterns in the Faraday
            experiment</em>; Christiansen, Alstrøm & Levinsen 1992 (12-fold
            quasipattern); Klüver / Bressloff–Cowan form-constants — the emergent
            symmetries <em>are</em> the visual-cortex form-constants.
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
            width={320}
            height={200}
            className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-90"
          />
        )}

        {/* Live readout */}
        <div className="pointer-events-none absolute left-4 top-4 z-10 rounded bg-black/45 px-3 py-2 font-mono text-base text-foreground ring-1 ring-border backdrop-blur-sm">
          <div className="text-violet-300">{SYMMETRY_LABEL[readout.symmetry]}</div>
          <div>drive f {readout.f.toFixed(0)} Hz</div>
          <div>subharmonic {(readout.f / 2).toFixed(0)} Hz</div>
          <div className={belowThreshold ? "text-violet-300" : ""}>
            ε {readout.eps.toFixed(2)} {belowThreshold ? "· below εc (flat)" : ""}
          </div>
          <div>lock {(readout.lock * 100).toFixed(0)}%</div>
        </div>

        {webglFailed && (
          <div className="absolute right-4 top-4 z-10 max-w-xs rounded bg-black/60 px-3 py-2 font-mono text-base text-violet-300 ring-1 ring-violet-400/25 backdrop-blur-sm">
            WebGL unavailable — showing a shaded Canvas2D heightmap of the same
            simulation.
          </div>
        )}

        {/* Preset symmetry jumps */}
        <div className="absolute bottom-20 left-1/2 z-10 flex -translate-x-1/2 flex-wrap justify-center gap-2 px-4">
          {presets.map((sym) => (
            <button
              key={sym}
              type="button"
              onClick={() => jumpTo(sym)}
              className={`min-h-[44px] rounded-full px-4 py-2.5 font-mono text-base ring-1 transition ${
                readout.symmetry === sym
                  ? "bg-muted text-foreground ring-border"
                  : "text-muted-foreground ring-border hover:text-foreground"
              }`}
            >
              {sym === "quasicrystal" ? "quasicrystal" : sym}
            </button>
          ))}
        </div>

        {/* Begin (audio gate) */}
        {!audioOn && (
          <div className="absolute inset-x-0 bottom-4 z-20 flex flex-col items-center gap-2 px-4">
            <button
              type="button"
              onClick={begin}
              className="min-h-[44px] rounded-full bg-violet-400/90 px-4 py-2.5 font-mono text-base font-semibold text-black ring-1 ring-violet-200/40 transition hover:bg-violet-300"
            >
              ▶ Begin — let the surface sing
            </button>
            <p className="text-base text-muted-foreground">
              The relief is already forming — drag it now; Begin adds the sound.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
