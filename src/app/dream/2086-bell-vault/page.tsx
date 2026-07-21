"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  BellVault,
  MATERIALS,
  MATERIAL_ORDER,
  makeRng,
  type MaterialId,
} from "./synth";
import { drawFrame, type VizState } from "./viz";

// ── the playable scale ────────────────────────────────────────────────────────
// A low bronze minor-pentatonic spread over two octaves. Physical keys map left
// → right, low → high; the on-screen row mirrors it for pointer/tilt play.
const ROOT = 48; // C3
const DEGREES = [0, 3, 5, 7, 10, 12, 15, 17, 19, 22, 24];
const KEYS = ["a", "s", "d", "f", "g", "h", "j", "k", "l", ";", "'"];
const NOTES = DEGREES.map((d) => ROOT + d);
const KEY_LABELS = ["A", "S", "D", "F", "G", "H", "J", "K", "L", ";", "'"];

const AUTOPILOT_IDLE_MS = 8000;

type OrientEvt = DeviceOrientationEvent & {
  webkitCompassHeading?: number;
};
type OrientCtor = typeof DeviceOrientationEvent & {
  requestPermission?: () => Promise<"granted" | "denied">;
};

export default function BellVaultPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const vaultRef = useRef<BellVault | null>(null);
  const rafRef = useRef<number>(0);

  const [started, setStarted] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [material, setMaterial] = useState<MaterialId>("bronze");
  const [autopilot, setAutopilot] = useState(true);
  const [tiltActive, setTiltActive] = useState(false);
  const [showNotes, setShowNotes] = useState(false);

  // hot-loop refs (never re-create React state per frame)
  const startedRef = useRef(false);
  const flashRef = useRef(0);
  const lastInteractRef = useRef(0);
  const autoRng = useRef(makeRng(0x2086));
  const autoTimerRef = useRef(0);
  const autoWalkRef = useRef(4);
  const heldRef = useRef<Set<string>>(new Set());
  const autopilotRef = useRef(true);
  const tiltIndexRef = useRef(-1);
  const tiltLastRef = useRef(0);
  const tiltPrevGammaRef = useRef(0);
  const reducedRef = useRef(false);
  const vizStateRef = useRef<VizState>({ t: 0, reducedMotion: false });

  // ── strike / bow plumbing ───────────────────────────────────────────────────
  const strikeIndex = useCallback((idx: number, velocity: number) => {
    const v = vaultRef.current;
    if (!v || idx < 0 || idx >= NOTES.length) return;
    v.strike(NOTES[idx], velocity);
    flashRef.current = Math.min(1, flashRef.current + velocity * 0.7);
  }, []);

  const bowIndex = useCallback((idx: number, on: boolean, velocity: number) => {
    const v = vaultRef.current;
    if (!v || idx < 0 || idx >= NOTES.length) return;
    if (on) {
      v.bowStart(NOTES[idx], velocity);
      flashRef.current = Math.min(1, flashRef.current + 0.4);
    } else {
      v.bowStop(NOTES[idx]);
    }
  }, []);

  // ── render + autopilot loop ───────────────────────────────────────────────────
  const runLoop = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx2d = canvas.getContext("2d");
    if (!ctx2d) return;
    let last = performance.now();

    const frame = () => {
      rafRef.current = requestAnimationFrame(frame);
      const now = performance.now();
      const dt = (now - last) / 1000;
      last = now;

      // deterministic self-demo after idle
      if (now - lastInteractRef.current > AUTOPILOT_IDLE_MS) {
        if (!autopilotRef.current) {
          autopilotRef.current = true;
          setAutopilot(true);
        }
        autoTimerRef.current += dt;
        const period = 1.15;
        if (autoTimerRef.current >= period) {
          autoTimerRef.current = 0;
          // gentle seeded melodic walk
          const step = Math.floor(autoRng.current() * 5) - 2;
          let idx = autoWalkRef.current + step;
          if (idx < 0) idx = 1;
          if (idx >= NOTES.length) idx = NOTES.length - 2;
          autoWalkRef.current = idx;
          const vel = 0.32 + autoRng.current() * 0.34;
          strikeIndex(idx, vel);
          // occasionally add a soft harmony a third up
          if (autoRng.current() > 0.72) {
            strikeIndex(Math.min(NOTES.length - 1, idx + 2), vel * 0.6);
          }
        }
      } else if (autopilotRef.current) {
        autopilotRef.current = false;
        setAutopilot(false);
      }

      // canvas sizing
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const cssW = canvas.clientWidth;
      const cssH = canvas.clientHeight;
      const W = Math.max(1, Math.floor(cssW * dpr));
      const H = Math.max(1, Math.floor(cssH * dpr));
      if (canvas.width !== W || canvas.height !== H) {
        canvas.width = W;
        canvas.height = H;
      }
      ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);

      // decay flash smoothly (no fast luminance flips)
      flashRef.current *= Math.pow(0.12, dt);

      const bars = vaultRef.current?.spectrum() ?? [];
      vizStateRef.current.t += dt;
      vizStateRef.current.reducedMotion = reducedRef.current;
      drawFrame(ctx2d, cssW, cssH, bars, vizStateRef.current, flashRef.current);
    };
    rafRef.current = requestAnimationFrame(frame);
  }, [strikeIndex]);

  // ── boot (must be a user gesture) ─────────────────────────────────────────────
  const boot = useCallback(async () => {
    if (startedRef.current) return;
    const vault = new BellVault(0x2086);
    const res = await vault.start();
    if (!res.ok) {
      setNotice(
        res.reason === "no-web-audio"
          ? "This browser has no Web Audio — the vault stays silent. Try a current desktop browser."
          : "Audio could not start. Try again after a click.",
      );
      return;
    }
    vaultRef.current = vault;
    vault.setMaterial(material);
    startedRef.current = true;
    setStarted(true);
    lastInteractRef.current = performance.now();

    // ask for tilt permission where required (iOS 13+), inside this gesture
    const OrientCtorRef =
      typeof window !== "undefined"
        ? (window.DeviceOrientationEvent as OrientCtor | undefined)
        : undefined;
    if (OrientCtorRef?.requestPermission) {
      try {
        const p = await OrientCtorRef.requestPermission();
        if (p !== "granted") setTiltActive(false);
      } catch {
        /* keep keyboard play */
      }
    }

    runLoop();
    // welcoming first strike
    window.setTimeout(() => strikeIndex(4, 0.6), 140);
  }, [material, runLoop, strikeIndex]);

  // keep the engine's material in sync with UI
  useEffect(() => {
    vaultRef.current?.setMaterial(material);
  }, [material]);

  // reduced-motion probe
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    reducedRef.current = mq.matches;
    const onChange = () => {
      reducedRef.current = mq.matches;
    };
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, []);

  // ── keyboard: strike, or bow while Shift is held ──────────────────────────────
  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      if (!startedRef.current) return;
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      const idx = KEYS.indexOf(k);
      if (idx === -1) return;
      e.preventDefault();
      lastInteractRef.current = performance.now();
      if (e.repeat) return;
      if (e.shiftKey) {
        if (!heldRef.current.has(k)) {
          heldRef.current.add(k);
          bowIndex(idx, true, 0.7);
        }
      } else {
        strikeIndex(idx, 0.72);
      }
    };
    const onUp = (e: KeyboardEvent) => {
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      const idx = KEYS.indexOf(k);
      if (idx === -1) return;
      if (heldRef.current.has(k)) {
        heldRef.current.delete(k);
        bowIndex(idx, false, 0);
      }
    };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
    };
  }, [strikeIndex, bowIndex]);

  // ── device-tilt strum: gamma sweeps/arpeggiates the vault ─────────────────────
  useEffect(() => {
    const onOrient = (e: OrientEvt) => {
      if (!startedRef.current) return;
      const gamma = e.gamma;
      if (gamma == null) return;
      if (!tiltActive) setTiltActive(true);
      // map −38°..+38° across the note row
      const t = Math.max(0, Math.min(1, (gamma + 38) / 76));
      const idx = Math.round(t * (NOTES.length - 1));
      const now = performance.now();
      const speed = Math.abs(gamma - tiltPrevGammaRef.current);
      tiltPrevGammaRef.current = gamma;
      if (idx !== tiltIndexRef.current && now - tiltLastRef.current > 90) {
        tiltIndexRef.current = idx;
        tiltLastRef.current = now;
        lastInteractRef.current = now;
        const vel = Math.max(0.3, Math.min(0.95, 0.35 + speed * 0.05));
        strikeIndex(idx, vel);
      }
    };
    window.addEventListener("deviceorientation", onOrient as EventListener);
    return () =>
      window.removeEventListener("deviceorientation", onOrient as EventListener);
  }, [strikeIndex, tiltActive]);

  // teardown
  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      vaultRef.current?.dispose();
      vaultRef.current = null;
    };
  }, []);

  const onRowPointer = useCallback(
    (idx: number) => {
      lastInteractRef.current = performance.now();
      strikeIndex(idx, 0.75);
    },
    [strikeIndex],
  );

  return (
    <main className="relative h-[100dvh] w-full overflow-hidden bg-background text-foreground">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none" />

      {/* chrome: back + design notes */}
      <Link
        href="/dream"
        className="absolute left-4 top-4 z-30 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        ← dream lab
      </Link>
      <button
        onClick={() => setShowNotes((s) => !s)}
        className="absolute right-4 top-4 z-30 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:text-foreground"
      >
        Design notes
      </button>

      {/* hero / start */}
      {!started && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-5 px-6 text-center">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            2086 · banded-waveguide modal synthesis
          </p>
          <h1 className="text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
            Bell Vault
          </h1>
          <p className="max-w-xl text-base leading-relaxed text-muted-foreground">
            A cathedral of struck &amp; bowed metal you play. Every strike is a
            real dispersive resonant body — a bank of tuned resonators excited by
            a raised-cosine burst, never a canned bell sample. Play with the keys{" "}
            <span className="text-foreground">A&ndash;&apos;</span>, hold{" "}
            <span className="text-foreground">Shift</span> to bow, or tilt your
            phone to strum the vault.
          </p>
          <button
            onClick={() => void boot()}
            className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Enter the vault
          </button>
          {notice && <p className="max-w-md text-sm text-destructive">{notice}</p>}
          <p className="text-sm text-muted-foreground">
            Or just wait — after a moment the vault plays itself.
          </p>
        </div>
      )}

      {/* running controls */}
      {started && (
        <>
          {/* material selector */}
          <div className="absolute left-4 top-14 z-20 flex flex-col gap-2">
            <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Material
            </span>
            <div className="flex flex-wrap gap-2">
              {MATERIAL_ORDER.map((id) => {
                const active = id === material;
                return (
                  <button
                    key={id}
                    onClick={() => {
                      lastInteractRef.current = performance.now();
                      setMaterial(id);
                    }}
                    className={
                      active
                        ? "min-h-[44px] rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                        : "min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    }
                  >
                    {MATERIALS[id].label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* HUD */}
          <div className="pointer-events-none absolute bottom-24 left-4 z-20 max-w-[70vw] space-y-1">
            <p className="text-sm text-primary">{MATERIALS[material].blurb}</p>
            <p className="text-sm text-muted-foreground">
              {autopilot
                ? "vault playing itself — press a key, tap a bar, or tilt to take over"
                : tiltActive
                  ? "tilt-strum live · keys A–' · hold Shift to bow"
                  : "keys A–' · hold Shift to bow · tap the row below"}
            </p>
          </div>

          {/* on-screen note row (primary input is keys/tilt; this mirrors it) */}
          <div className="absolute inset-x-0 bottom-4 z-20 flex justify-center px-3">
            <div className="flex w-full max-w-3xl gap-1.5">
              {NOTES.map((_, idx) => (
                <button
                  key={idx}
                  onPointerDown={() => onRowPointer(idx)}
                  className="flex min-h-[44px] flex-1 items-end justify-center rounded-md border border-border bg-background/60 pb-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  <span className="font-mono text-xs uppercase tracking-[0.18em]">
                    {KEY_LABELS[idx]}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {/* design-notes overlay */}
      {showNotes && (
        <div
          className="absolute inset-0 z-40 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-semibold tracking-tight text-foreground">
              Bell Vault — design notes
            </h2>
            <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                A browser Web-Audio realization of the banded-waveguide / modal
                synthesis family (Essl &amp; Cook, ICMC 1999; Perry Cook&apos;s
                STK). Each struck body is a bank of high-Q bandpass resonators —
                one per vibrational mode — excited by a raised-cosine burst. The
                ring is the resonators&apos; own decay (τ = Q ⁄ πf), so bright
                high modes fade first, exactly as in real metal. No samples.
              </p>
              <p>
                Three materials, each an inharmonic partial set derived by hand:{" "}
                <span className="text-foreground">bronze bar</span>{" "}
                (1·3.98·10.68·17.9),{" "}
                <span className="text-foreground">singing bowl</span>{" "}
                (1·2.66·4.97·7.36·10.2, with a beating twin fundamental), and{" "}
                <span className="text-foreground">bronze plate</span>{" "}
                (1·2.31·3.79·5.44·7.18·9.10). Per-strike seeded jitter means no
                two strikes are identical.
              </p>
              <p>
                The Canvas2D visualizer draws the live modal spectrum: each bar
                is one mode, height = its current energy, X = its frequency on a
                log axis — so you see the dispersion and decay you hear. A
                convolver reverb and a low drone give the vault its air.
              </p>
              <p className="text-foreground">
                Play: keys A–&apos; strike; hold Shift to bow; tilt a phone to
                strum. After 8 s idle a seeded autopilot takes over.
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
