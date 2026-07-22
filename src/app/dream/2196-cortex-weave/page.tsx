"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { createSafeFlicker, prefersReducedMotion } from "../_shared/psych/safeFlicker";
import {
  FORM_CONSTANTS,
  FORM_LABEL,
  type FormConstant,
} from "../_shared/psych/logpolar";
import { CortexWeaveAudio } from "./audio";
import {
  buildGrid,
  clamp01,
  formStateFor,
  hueForF,
  mulberry32,
  sampleForm,
  smoothstep,
  type GridNode,
} from "./field";

/**
 * 2196 · cortex-weave — the four Klüver form constants as a vector instrument
 * you PLAY from the keyboard. A cortical (log-polar) grid, warped to screen as
 * SVG phosphene dots, morphs across tunnels → spokes → spirals → honeycomb as
 * you sweep the form parameter F; sustained keys drive a slew-limited growth
 * follower that makes the lattice PROLIFERATE. Modal / banded-waveguide voices.
 * state: flicker/entoptic form-constant geometry · pole: intense
 */

// Played keys: home row → the form sweep + a modal strike per key.
const KEYS = ["a", "s", "d", "f", "g", "h", "j", "k", "l", ";"];
const KEY_LABELS = ["A", "S", "D", "F", "G", "H", "J", "K", "L", ";"];
// Dorian degrees (a diatonic mode — NOT pentatonic / JI / Bohlen–Pierce).
const DORIAN = [0, 2, 3, 5, 7, 9, 10, 12, 14, 15];
const ROOT_HZ = 196; // G3

// Cortical grid — bounded pool. 8×12 = 96 per layer, two layers = 192 ≤ 200.
const U_ROWS = 8;
const V_COLS = 12;
const U_MIN = Math.log(0.06);
const U_MAX = Math.log(1.12);

const AUTO_IDLE = 5; // seconds of no input before autopilot resumes

type Phase = "idle" | "running";

interface Params {
  F: number;
  freq: number;
  G: number;
  phase: number;
  bright: number;
}

function degreeToHz(i: number): number {
  return ROOT_HZ * Math.pow(2, DORIAN[i] / 12);
}

function constantForF(F: number): FormConstant {
  const idx = Math.max(0, Math.min(3, Math.round(clamp01(F) * 3)));
  return FORM_CONSTANTS[idx];
}

export default function CortexWeavePage() {
  const audioRef = useRef<CortexWeaveAudio | null>(null);
  const flickerRef = useRef(
    createSafeFlicker({ maxHz: 3, defaultHz: 1.6, floor: 0.62 }),
  );
  const rafRef = useRef<number | null>(null);
  const startedRef = useRef(false);

  // Live played parameters (refs so the rAF loop mutates without re-render).
  const paramsRef = useRef<Params>({ F: 0, freq: 3.4, G: 0, phase: 0, bright: 1 });
  const targetFRef = useRef(0);
  const targetFreqRef = useRef(3.4);
  const pressedRef = useRef<Set<string>>(new Set());
  const heldVoiceRef = useRef<Map<string, number>>(new Map());
  const lastUserTRef = useRef(-1e9);
  const prevTRef = useRef<number | null>(null);
  const nextStrikeRef = useRef(0);
  const rngRef = useRef(mulberry32(0x2196));

  const [phase, setPhase] = useState<Phase>("idle");
  const [audioError, setAudioError] = useState(false);
  const [shimmer, setShimmer] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [pressed, setPressed] = useState<Set<string>>(new Set());
  const [hud, setHud] = useState({ F: 0, freq: 3.4, G: 0, constant: "tunnel" as FormConstant });

  const reduced = useMemo(() => prefersReducedMotion(), []);

  // Static geometry: the pre-warped cortical grid (two interleaved layers).
  const layerA = useMemo(() => buildGrid(U_ROWS, V_COLS, U_MIN, U_MAX), []);
  const layerB = useMemo(
    () => buildGrid(U_ROWS, V_COLS, U_MIN, U_MAX, 0.5, 0.5),
    [],
  );

  // A tick to trigger re-render each animation frame.
  const [, setTick] = useState(0);

  /* --------------------------------- audio -------------------------------- */
  const ensureAudio = useCallback(async () => {
    if (startedRef.current) return;
    startedRef.current = true;
    try {
      const audio = new CortexWeaveAudio();
      audioRef.current = audio;
      await audio.init();
      setPhase("running");
    } catch {
      setAudioError(true);
      setPhase("running"); // keep visuals running
    }
  }, []);

  /* ------------------------------ strike / hold --------------------------- */
  const strikeKey = useCallback((k: string) => {
    const i = KEYS.indexOf(k);
    if (i === -1) return;
    targetFRef.current = i / (KEYS.length - 1);
    const audio = audioRef.current;
    if (audio && !heldVoiceRef.current.has(k)) {
      const id = audio.strike(degreeToHz(i), targetFRef.current, 0.9, true);
      heldVoiceRef.current.set(k, id);
    }
  }, []);

  const releaseKey = useCallback((k: string) => {
    const audio = audioRef.current;
    const id = heldVoiceRef.current.get(k);
    if (audio && id != null && id >= 0) audio.noteOff(id);
    heldVoiceRef.current.delete(k);
  }, []);

  /* ------------------------------ frame loop ------------------------------ */
  const frame = useCallback((tMs: number) => {
    const t = tMs / 1000;
    const prev = prevTRef.current;
    const dt = prev == null ? 0.016 : Math.min(0.05, t - prev);
    prevTRef.current = t;

    // Autopilot only while there is genuinely no input: no keys held AND no
    // recent keypress. A sustained hold keeps the player in control indefinitely.
    const auto =
      pressedRef.current.size === 0 && t - lastUserTRef.current > AUTO_IDLE;
    const p = paramsRef.current;

    let gTarget: number;
    if (auto) {
      // Seeded autopilot: slow triangle sweep of F across all four constants,
      // plus a breathing growth. Real key input overrides this.
      const tri = Math.abs(((t / 22) % 2) - 1); // 0→1→0 over 44s
      targetFRef.current = tri;
      gTarget = 0.24 + 0.34 * (0.5 + 0.5 * Math.sin(t * 0.42));
      if (t >= nextStrikeRef.current) {
        const r = rngRef.current();
        const i = Math.floor(r * KEYS.length) % KEYS.length;
        audioRef.current?.strike(degreeToHz(i), tri, 0.7, false);
        nextStrikeRef.current = t + 1.0 + rngRef.current() * 1.6;
      }
    } else {
      const n = pressedRef.current.size;
      gTarget = n > 0 ? Math.min(1, 0.4 + 0.16 * n) : 0;
    }

    // Slew-limited followers — intensity RISES on hold, DECAYS on release.
    p.F += (targetFRef.current - p.F) * Math.min(1, dt * 3.2);
    p.freq += (targetFreqRef.current - p.freq) * Math.min(1, dt * 4);
    const gRate = gTarget > p.G ? dt * 2.2 : dt * 1.1;
    p.G += (gTarget - p.G) * Math.min(1, gRate);
    // Slow inward drift = tunnel motion (denser rings drift a touch faster).
    p.phase += dt * (0.5 + p.freq * 0.05) * (reduced ? 0.5 : 1);
    p.bright = flickerRef.current.value(t);

    audioRef.current?.setGrowth(p.G);

    setTick((n) => (n + 1) % 1000000);
    setHud({ F: p.F, freq: p.freq, G: p.G, constant: constantForF(p.F) });
    rafRef.current = requestAnimationFrame(frame);
  }, [reduced]);

  useEffect(() => {
    rafRef.current = requestAnimationFrame(frame);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [frame]);

  /* ---------------------------- keyboard input ---------------------------- */
  useEffect(() => {
    const markUser = () => {
      lastUserTRef.current = (performance?.now?.() ?? 0) / 1000;
    };
    const onKeyDown = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k === "arrowup" || k === "arrowdown") {
        e.preventDefault();
        markUser();
        const d = k === "arrowup" ? 0.6 : -0.6;
        targetFreqRef.current = Math.max(1.4, Math.min(8, targetFreqRef.current + d));
        return;
      }
      if (KEYS.indexOf(k) === -1) return;
      e.preventDefault();
      markUser();
      if (e.repeat) return;
      void ensureAudio();
      pressedRef.current.add(k);
      setPressed(new Set(pressedRef.current));
      strikeKey(k);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (KEYS.indexOf(k) === -1) return;
      markUser();
      pressedRef.current.delete(k);
      setPressed(new Set(pressedRef.current));
      releaseKey(k);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [ensureAudio, strikeKey, releaseKey]);

  /* ------------------------- on-screen key handlers ----------------------- */
  const onPadDown = useCallback(
    (k: string) => {
      lastUserTRef.current = (performance?.now?.() ?? 0) / 1000;
      void ensureAudio();
      pressedRef.current.add(k);
      setPressed(new Set(pressedRef.current));
      strikeKey(k);
    },
    [ensureAudio, strikeKey],
  );
  const onPadUp = useCallback(
    (k: string) => {
      lastUserTRef.current = (performance?.now?.() ?? 0) / 1000;
      pressedRef.current.delete(k);
      setPressed(new Set(pressedRef.current));
      releaseKey(k);
    },
    [releaseKey],
  );

  /* --------------------------------- flicker ------------------------------ */
  useEffect(() => {
    const f = flickerRef.current;
    if (shimmer) f.enable();
    else f.disable();
  }, [shimmer]);

  /* -------------------------------- teardown ------------------------------ */
  useEffect(() => {
    return () => {
      const a = audioRef.current;
      audioRef.current = null;
      if (a) void a.dispose();
      startedRef.current = false;
    };
  }, []);

  /* -------------------------------- render -------------------------------- */
  const p = paramsRef.current;
  const fs = formStateFor(p.F);
  const hueA = hueForF(p.F);
  const thr = 0.52 - 0.34 * p.G; // proliferation: lower threshold ⇒ more lit
  const rBase = 0.012;

  const drawNode = (node: GridNode, layer: "A" | "B", key: string) => {
    const freq = layer === "A" ? p.freq : p.freq * 2;
    const ph = layer === "A" ? p.phase : p.phase * 1.3 + 0.7;
    const val = sampleForm(node, fs, freq, ph);
    const lit = smoothstep(thr, 1, val);
    if (lit <= 0.02) return null;
    const gGate = layer === "A" ? 1 : p.G; // layer B (2nd harmonic) fades in with G
    const alpha = clamp01(lit * p.bright * gGate);
    if (alpha <= 0.02) return null;
    const hue = layer === "A" ? hueA : (hueA + 18) % 360;
    const light = 34 + val * 46;
    const r = rBase * (0.5 + val) * (1 + 0.7 * p.G);
    return (
      <circle
        key={key}
        cx={node.x}
        cy={node.y}
        r={r}
        fill={`hsl(${hue.toFixed(0)} 90% ${light.toFixed(0)}% / ${alpha.toFixed(3)})`}
      />
    );
  };

  return (
    <main className="relative h-dvh w-screen overflow-hidden bg-background text-foreground">
      {/* ------------------------------- art ------------------------------- */}
      <svg
        className="absolute inset-0 h-full w-full"
        viewBox="-1.2 -1.2 2.4 2.4"
        preserveAspectRatio="xMidYMid slice"
        aria-hidden="true"
      >
        <defs>
          <radialGradient id="cw-bg" cx="50%" cy="50%" r="75%">
            <stop offset="0%" stopColor="#2a1016" />
            <stop offset="55%" stopColor="#160a0e" />
            <stop offset="100%" stopColor="#0b0608" />
          </radialGradient>
        </defs>
        <rect x="-1.2" y="-1.2" width="2.4" height="2.4" fill="url(#cw-bg)" />
        <g style={{ mixBlendMode: "screen" }}>
          {layerB.map((n, i) => drawNode(n, "B", `b${i}`))}
          {layerA.map((n, i) => drawNode(n, "A", `a${i}`))}
        </g>
      </svg>

      {/* ------------------------------ header ----------------------------- */}
      <div className="pointer-events-none absolute left-0 right-0 top-0 z-10 p-5 sm:p-7">
        <h1 className="font-semibold text-2xl tracking-tight text-foreground sm:text-3xl">
          cortex-weave
        </h1>
        <p className="mt-1 max-w-xl text-base text-muted-foreground">
          The four Klüver form constants as a vector instrument you play — sweep
          the keyboard to morph tunnels, spokes, spirals and honeycomb, and hold
          keys to make the cortical lattice proliferate.
        </p>
        <p className="mt-1 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          state: flicker/entoptic form-constant geometry · pole: intense
        </p>
        {audioError && (
          <p className="mt-2 text-sm text-destructive">
            Web Audio unavailable — the visuals keep playing, but there is no sound.
          </p>
        )}
      </div>

      {/* --------------------------- idle splash --------------------------- */}
      {phase === "idle" && (
        <div className="absolute inset-0 z-20 flex items-center justify-center">
          <button
            type="button"
            onClick={() => void ensureAudio()}
            className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Play — then press A … ; to weave
          </button>
        </div>
      )}

      {/* ------------------------------- HUD ------------------------------- */}
      <div className="pointer-events-none absolute right-4 top-16 z-10 hidden text-right font-mono text-xs text-muted-foreground sm:block">
        <div>form · {FORM_LABEL[hud.constant]}</div>
        <div>F {hud.F.toFixed(2)} · freq {hud.freq.toFixed(1)}</div>
        <div>growth {hud.G.toFixed(2)}</div>
      </div>

      {/* --------------------- bottom: legend + controls ------------------- */}
      <div className="absolute bottom-0 left-0 right-0 z-10 p-4 sm:p-6">
        <div className="mb-3 flex flex-wrap items-end gap-x-6 gap-y-1">
          <div className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            keyboard
          </div>
          <p className="text-sm leading-relaxed text-muted-foreground">
            A … ; sweep the form &amp; strike a modal voice · hold keys to
            proliferate the lattice · ↑ / ↓ spatial frequency · idle → seeded
            autopilot tours all four constants.
          </p>
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShimmer((s) => !s)}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Flicker {shimmer ? "on" : "off"}
            </button>
            <button
              type="button"
              onClick={() => {
                flickerRef.current.kill();
                setShimmer(false);
              }}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Kill flicker
            </button>
            <button
              type="button"
              onClick={() => setShowNotes(true)}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Read the design notes
            </button>
          </div>
        </div>

        {/* On-screen key pads */}
        <div className="flex justify-center gap-1.5 sm:gap-2">
          {KEYS.map((k, i) => {
            const isDown = pressed.has(k);
            const hue = hueForF(i / (KEYS.length - 1));
            return (
              <button
                key={k}
                type="button"
                aria-label={`Form position ${i + 1}`}
                onPointerDown={(e) => {
                  e.preventDefault();
                  onPadDown(k);
                }}
                onPointerUp={() => onPadUp(k)}
                onPointerLeave={() => {
                  if (pressed.has(k)) onPadUp(k);
                }}
                onPointerCancel={() => onPadUp(k)}
                className="flex h-14 min-w-[44px] flex-1 select-none items-center justify-center rounded-md border font-mono text-sm transition-transform"
                style={{
                  borderColor: `hsl(${hue.toFixed(0)} 80% 55% / 0.5)`,
                  background: isDown
                    ? `hsl(${hue.toFixed(0)} 85% 55% / 0.42)`
                    : `hsl(${hue.toFixed(0)} 80% 50% / 0.12)`,
                  color: "hsl(40 60% 90% / 0.95)",
                  transform: isDown ? "translateY(2px) scale(0.97)" : "none",
                }}
              >
                {KEY_LABELS[i]}
              </button>
            );
          })}
        </div>
      </div>

      {/* --------------------------- notes overlay ------------------------- */}
      {showNotes && (
        <div
          className="absolute inset-0 z-30 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="font-semibold text-xl tracking-tight text-foreground">
              cortex-weave — design notes
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Klüver&apos;s four form constants (tunnels, spokes/funnels, spirals,
              honeycomb lattices) are one striped/hexagonal pattern seen through
              the retina→V1 cortical map — a complex logarithm (Bressloff, Cowan
              et&nbsp;al., 2001). Here that map is inverted onto a bounded grid of
              SVG phosphene dots: a regular grid in cortical space, warped by
              r=exp(u), becomes tunnels, spokes, spirals or honeycomb depending
              on a single played form parameter F.
            </p>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              You play F from the keyboard (A … ;); ↑/↓ set the spatial frequency;
              holding keys raises a slew-limited growth follower that lowers the
              lattice&apos;s lighting threshold and fades in a second, double-frequency
              harmonic layer — structure builds, nothing dissolves. Each key also
              strikes a modal / banded-waveguide voice whose inharmonic ratios
              shift with F. Left idle, a seeded autopilot tours all four constants.
            </p>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Any luminance flicker is routed through the shared safe-flicker
              engine (≤3&nbsp;Hz, reduced-motion honored). See README.md for the
              full references and the next-cycle deepening note.
            </p>
            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => setShowNotes(false)}
                className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Design notes file link */}
      <Link
        href="/dream/2196-cortex-weave/README.md"
        className="absolute right-4 top-4 z-20 font-mono text-xs text-muted-foreground underline decoration-muted-foreground underline-offset-4 transition-colors hover:text-foreground"
      >
        README
      </Link>
    </main>
  );
}
