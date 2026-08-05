"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { MATERIALS, type Material } from "./materials";
import { makeEngine, type Engine } from "./synth";
import {
  openMic,
  makeOnsetDetector,
  type MicRig,
  type OnsetDetector,
} from "./onset";
import { LatticeRenderer } from "./render";

// Seeded PRNG (mulberry32, seed 0x6680) for the auto-knock loop — no Math.random.
function makeKnockPrng(): () => number {
  let a = 0x6680 >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type MicStatus = "idle" | "asking" | "live" | "denied";

export default function ResonatePage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [started, setStarted] = useState(false);
  const [materialId, setMaterialId] = useState(MATERIALS[0].id);
  const [micStatus, setMicStatus] = useState<MicStatus>("idle");
  const [notice, setNotice] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(false);

  // engine + loop refs (never rebuilt inside the hot loop)
  const engineRef = useRef<Engine | null>(null);
  const rendererRef = useRef<LatticeRenderer | null>(null);
  const micRef = useRef<MicRig | null>(null);
  const detectorRef = useRef<OnsetDetector | null>(null);
  const rafRef = useRef<number>(0);
  const materialRef = useRef<Material>(MATERIALS[0]);
  const micLiveRef = useRef(false);
  const startedRef = useRef(false);

  // auto-knock scheduling
  const prngRef = useRef<() => number>(makeKnockPrng());
  const nextKnockRef = useRef<number>(0);
  const suppressAutoUntilRef = useRef<number>(0);
  const reducedRef = useRef(false);

  const selectMaterial = useCallback((m: Material) => {
    materialRef.current = m;
    setMaterialId(m.id);
    engineRef.current?.setMaterial(m);
  }, []);

  // external (mic / manual) strike: pause the ghost knocker briefly.
  const strikeNow = useCallback((velocity: number) => {
    engineRef.current?.strike(velocity, true);
    suppressAutoUntilRef.current = performance.now() + 3500;
  }, []);

  const enableMic = useCallback(async () => {
    const engine = engineRef.current;
    if (!engine) return;
    await engine.resume();
    if (micRef.current) return;
    setMicStatus("asking");
    try {
      const rig = await openMic(engine.ctx);
      micRef.current = rig;
      detectorRef.current = makeOnsetDetector(rig.analyser);
      micLiveRef.current = true;
      setMicStatus("live");
      setNotice(null);
    } catch {
      micLiveRef.current = false;
      setMicStatus("denied");
      setNotice(
        "Microphone unavailable — knock with the spacebar, click the lattice, or let the ghost hammer play.",
      );
    }
  }, []);

  const boot = useCallback(async () => {
    const engine = engineRef.current;
    if (!engine) return;
    await engine.resume();
    setStarted(true);
    startedRef.current = true;
    await enableMic();
  }, [enableMic]);

  // one-time engine + renderer + loop setup
  useEffect(() => {
    reducedRef.current = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    let engine: Engine;
    try {
      engine = makeEngine();
    } catch {
      setNotice("Web Audio is unavailable in this browser.");
      return;
    }
    engineRef.current = engine;
    engine.setMaterial(materialRef.current);

    const canvas = canvasRef.current;
    if (!canvas) return;
    const renderer = new LatticeRenderer(canvas);
    rendererRef.current = renderer;

    const applyResize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      renderer.resize(window.innerWidth, window.innerHeight, dpr);
    };
    applyResize();
    window.addEventListener("resize", applyResize);

    nextKnockRef.current = performance.now() + 700;

    const frame = () => {
      const now = performance.now();

      // mic onset detection
      let micLevel = 0;
      const det = detectorRef.current;
      if (det && micLiveRef.current) {
        micLevel = det.level();
        const v = det.poll(now);
        if (v != null) {
          engine.strike(v, true);
          suppressAutoUntilRef.current = now + 3500;
        }
      }

      // ghost hammer — keeps the piece alive on load and when mic is off.
      const autoOn = !micLiveRef.current && now > suppressAutoUntilRef.current;
      if (autoOn && now >= nextKnockRef.current) {
        const r = prngRef.current();
        const vel = 0.3 + r * 0.6;
        engine.strike(vel, startedRef.current);
        const gap = 900 + prngRef.current() * 1100;
        nextKnockRef.current = now + gap;
      } else if (!autoOn) {
        // keep the schedule fresh so it resumes smoothly later.
        if (now >= nextKnockRef.current) nextKnockRef.current = now + 900;
      }

      const energies = engine.sampleEnergies(now);
      renderer.draw({
        material: materialRef.current,
        energies,
        total: engine.totalEnergy(),
        micLevel,
        reduced: reducedRef.current,
        timeMs: now,
      });

      rafRef.current = requestAnimationFrame(frame);
    };
    rafRef.current = requestAnimationFrame(frame);

    return () => {
      window.removeEventListener("resize", applyResize);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      micRef.current?.destroy();
      micRef.current = null;
      void engine.destroy();
      engineRef.current = null;
    };
  }, []);

  // keyboard: 1–6 select material, space strikes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const m = MATERIALS.find((x) => x.key === e.key);
      if (m) {
        selectMaterial(m);
        return;
      }
      if (e.code === "Space") {
        e.preventDefault();
        if (!startedRef.current) {
          void boot();
          return;
        }
        strikeNow(0.75);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectMaterial, strikeNow, boot]);

  // pointer strike on the canvas — velocity from the pointer's own force if any.
  const onCanvasPointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!startedRef.current) {
        void boot();
        return;
      }
      const p = e.pressure && e.pressure > 0 ? e.pressure : 0.7;
      strikeNow(0.4 + p * 0.55);
    },
    [boot, strikeNow],
  );

  const active = MATERIALS.find((m) => m.id === materialId) ?? MATERIALS[0];

  return (
    <main className="relative h-[100dvh] w-full overflow-hidden bg-background text-foreground">
      <canvas
        ref={canvasRef}
        onPointerDown={onCanvasPointerDown}
        className="absolute inset-0 h-full w-full"
        style={{ touchAction: "none", cursor: started ? "crosshair" : "pointer" }}
      />

      {/* back link */}
      <Link
        href="/dream"
        className="absolute left-4 top-4 z-20 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        ← dream lab
      </Link>

      {/* design notes affordance */}
      <button
        onClick={() => setShowNotes((v) => !v)}
        className="absolute right-4 top-4 z-20 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:text-foreground"
      >
        design notes
      </button>

      {showNotes && (
        <div className="absolute right-4 top-12 z-30 max-w-sm rounded-lg border border-border bg-background/90 p-4 text-sm text-muted-foreground backdrop-blur">
          <p className="mb-2 text-foreground">Resonate</p>
          <p className="mb-2">
            One strike, six materials. Each material is a bank of ~6–10 resonant
            modes with its own frequency ratios, stiffness (inharmonicity) and
            per-mode decay — so the identical knock rings as diamond, glass,
            copper, wood, ice or bone.
          </p>
          <p className="mb-2">
            The lattice you see is the same mode energy you hear: each mode maps
            to a standing-wave shape and its live amplitude drives the node
            displacement.
          </p>
          <p>
            After the arXiv:2603.29037 “Singing Materials” sonification of phonon
            spectra (ICAD 2026). Full notes in the folder README.
          </p>
        </div>
      )}

      {/* material chips */}
      <div className="absolute inset-x-0 bottom-4 z-20 flex flex-wrap items-center justify-center gap-2 px-4">
        {MATERIALS.map((m) => {
          const on = m.id === materialId;
          return (
            <button
              key={m.id}
              onClick={() => selectMaterial(m)}
              className={
                "flex min-h-[44px] min-w-[44px] items-center gap-2 rounded-md border px-4 text-sm transition-colors " +
                (on
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background/60 text-muted-foreground hover:bg-accent hover:text-foreground")
              }
            >
              <span className="font-mono text-xs opacity-70">{m.key}</span>
              <span className="font-medium">{m.name}</span>
            </button>
          );
        })}
      </div>

      {/* running HUD */}
      {started && (
        <div className="pointer-events-none absolute bottom-20 left-4 z-20 max-w-[80vw] space-y-1">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            {micStatus === "live"
              ? "listening — knock near the mic"
              : micStatus === "denied"
                ? "ghost hammer — mic off"
                : "resonate"}
          </p>
          <p className="text-sm text-muted-foreground">
            {active.name} · {active.blurb}
          </p>
          {notice && <p className="text-sm text-destructive">{notice}</p>}
        </div>
      )}

      {/* hero overlay (pre-start) */}
      {!started && (
        <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-5 px-6 text-center">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            singing materials · modal synthesis
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-4xl">
            Resonate
          </h1>
          <p className="max-w-xl text-base text-muted-foreground">
            Knock on the world and hear what it&apos;s made of. Tap near your
            microphone and the same physical strike rings as diamond, glass,
            copper, wood, ice or bone — each a different vibrational fingerprint.
          </p>
          <button
            onClick={() => void boot()}
            className="pointer-events-auto min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Start · enable mic
          </button>
          <p className="text-sm text-muted-foreground">
            Already ringing on its own — press a number (1–6) to switch material,
            or spacebar to knock.
          </p>
          {notice && (
            <p className="max-w-md text-sm text-destructive">{notice}</p>
          )}
        </div>
      )}
    </main>
  );
}
