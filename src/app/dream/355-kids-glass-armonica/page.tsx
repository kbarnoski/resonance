"use client";

/**
 * 355-kids-glass-armonica
 *
 * A Benjamin Franklin glass armonica for kids:
 *  1. TUNE phase — drag UP/DOWN on a glass to adjust its water level.
 *     More water → lower pitch (heavier glass resonates more slowly).
 *  2. PLAY phase — swipe a finger continuously across the glass rims.
 *     Each glass the finger crosses begins to SING — a sustained, breathy tone
 *     that swells while touched and fades slowly after release.
 *
 * Audio: Web Audio API, no deps.
 * Rendering: DOM/CSS only — glasses are styled divs, water is an animated div.
 * Palette: soft violet/teal/pearl on dark ground.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  buildRig,
  teardownRig,
  retuneVoice,
  activateVoice,
  deactivateVoice,
  midiToHz,
  SCALE_MIDI,
  type AudioRig,
} from "./audio";

// ─── Glass config ─────────────────────────────────────────────────────────────

const NUM_GLASSES = 8;

/** Default water levels — ascending fill so the scale is visually clear */
const DEFAULT_WATER = [0.15, 0.22, 0.30, 0.36, 0.42, 0.50, 0.58, 0.64];

/** Visual glass accent colours — violet → teal → green → amber → pink arc */
const GLASS_COLORS = [
  { rim: "#c4b5fd", body: "#8b5cf6", water: "#5b21b6", glow: "#ddd6fe" },
  { rim: "#a5b4fc", body: "#6366f1", water: "#3730a3", glow: "#c7d2fe" },
  { rim: "#93c5fd", body: "#3b82f6", water: "#1e40af", glow: "#bfdbfe" },
  { rim: "#67e8f9", body: "#06b6d4", water: "#155e75", glow: "#a5f3fc" },
  { rim: "#6ee7b7", body: "#10b981", water: "#065f46", glow: "#a7f3d0" },
  { rim: "#86efac", body: "#22c55e", water: "#166534", glow: "#bbf7d0" },
  { rim: "#fcd34d", body: "#f59e0b", water: "#92400e", glow: "#fef08a" },
  { rim: "#f9a8d4", body: "#ec4899", water: "#831843", glow: "#fbcfe8" },
];

// Note names for display (D-Dorian: D3 E3 F3 G3 A3 B3 C4 D4)
const NOTE_NAMES = ["D3","E3","F3","G3","A3","B3","C4","D4"];

// ─── Types ────────────────────────────────────────────────────────────────────

/** Per-glass tuning state (React state — drives water-fill render) */
type WaterLevels = number[];  // 0=empty/high-pitch … 1=full/low-pitch

interface DemoState {
  running: boolean;
  fingerPos: number;    // 0–1 across the row
  direction: number;    // +1 right, -1 left
  elapsed: number;      // seconds since start
  stopped: boolean;     // user touched; never restart
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function KidsGlassArmonica() {

  // ── React state ──────────────────────────────────────────────────────────

  const [waterLevels, setWaterLevels] = useState<WaterLevels>([...DEFAULT_WATER]);
  const [audioAvailable, setAudioAvailable] = useState(true);
  const [showReadme, setShowReadme] = useState(false);
  // Forces re-render from rAF so CSS glows update
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_tick, setTick] = useState(0);

  // ── Refs ──────────────────────────────────────────────────────────────────

  const rigRef        = useRef<AudioRig | null>(null);
  const waterRef      = useRef<WaterLevels>([...DEFAULT_WATER]);  // mirror for rAF
  const glassRefs     = useRef<(HTMLDivElement | null)[]>(Array(NUM_GLASSES).fill(null));
  const rafRef        = useRef<number>(0);
  const lastTsRef     = useRef<number>(0);

  // Amplitude tracking (0–1 per glass, updated in rAF, drives CSS)
  const amplitudesRef = useRef<number[]>(Array(NUM_GLASSES).fill(0));
  // Which glasses are currently being rubbed (finger active)
  const singingRef    = useRef<boolean[]>(Array(NUM_GLASSES).fill(false));

  // Pointer tracking
  const pointerDownRef     = useRef(false);
  const pointerIdRef       = useRef<number | null>(null);
  const tuningGlassRef     = useRef<number | null>(null);   // glass being tuned
  const tuningRef          = useRef(false);                 // drag is a tune gesture
  const tuneStartYRef      = useRef(0);
  const tuneStartWaterRef  = useRef(0);

  // Auto-demo
  const demoRef = useRef<DemoState>({
    running: true,
    fingerPos: 0,
    direction: 1,
    elapsed: 0,
    stopped: false,
  });

  // Keep waterRef in sync with React state
  useEffect(() => {
    waterRef.current = waterLevels;
  }, [waterLevels]);

  // ── Audio setup ───────────────────────────────────────────────────────────

  const initAudio = useCallback(() => {
    if (rigRef.current) return;
    try {
      const rig = buildRig(NUM_GLASSES);
      rigRef.current = rig;
      rig.ctx.resume().catch(() => {/* best-effort */});
    } catch {
      setAudioAvailable(false);
    }
  }, []);

  // ── Activate / deactivate glass voices ───────────────────────────────────

  const activateGlass = useCallback((idx: number) => {
    if (idx < 0 || idx >= NUM_GLASSES) return;
    if (singingRef.current[idx]) return;
    singingRef.current[idx] = true;
    const rig = rigRef.current;
    if (rig) activateVoice(rig.voices[idx], rig.ctx);
  }, []);

  const deactivateGlass = useCallback((idx: number) => {
    if (idx < 0 || idx >= NUM_GLASSES) return;
    if (!singingRef.current[idx]) return;
    singingRef.current[idx] = false;
    const rig = rigRef.current;
    if (rig) deactivateVoice(rig.voices[idx], rig.ctx);
  }, []);

  const deactivateAllGlasses = useCallback(() => {
    for (let i = 0; i < NUM_GLASSES; i++) deactivateGlass(i);
  }, [deactivateGlass]);

  // ── Hit-test: find which glass is at a pointer position ──────────────────

  const findGlassAt = useCallback((cx: number, cy: number): number | null => {
    for (let i = 0; i < NUM_GLASSES; i++) {
      const el = glassRefs.current[i];
      if (!el) continue;
      const r = el.getBoundingClientRect();
      // Extend hit zone above the rim for easy swipe
      if (cx >= r.left && cx <= r.right && cy >= r.top - 28 && cy <= r.bottom + 8) {
        return i;
      }
    }
    return null;
  }, []);

  // ── Apply water level change + retune ────────────────────────────────────

  const applyWater = useCallback((idx: number, level: number) => {
    const clamped = Math.max(0, Math.min(1, level));
    waterRef.current = waterRef.current.map((w, i) => (i === idx ? clamped : w));
    setWaterLevels((prev) => prev.map((w, i) => (i === idx ? clamped : w)));
    const rig = rigRef.current;
    if (rig) {
      const baseHz = midiToHz(SCALE_MIDI[idx] ?? 60);
      retuneVoice(rig.voices[idx], rig.ctx, baseHz, clamped);
    }
  }, []);

  // ── rAF loop ─────────────────────────────────────────────────────────────

  useEffect(() => {
    const ATTACK_TC  = 0.15;   // time-constant in seconds
    const RELEASE_TC = 0.90;

    const step = (ts: number) => {
      const dt = Math.min(0.05, (ts - (lastTsRef.current || ts)) / 1000);
      lastTsRef.current = ts;

      // ── Auto-demo ghost sweep ──
      const demo = demoRef.current;
      if (demo.running && !demo.stopped) {
        demo.elapsed += dt;
        if (demo.elapsed > 12) {
          demo.running = false;
          deactivateAllGlasses();
        } else {
          demo.fingerPos += demo.direction * 0.38 * dt;
          if (demo.fingerPos >= 1.0) { demo.fingerPos = 1.0; demo.direction = -1; }
          if (demo.fingerPos <= 0.0) { demo.fingerPos = 0.0; demo.direction =  1; }

          const rawIdx = demo.fingerPos * (NUM_GLASSES - 1);
          for (let i = 0; i < NUM_GLASSES; i++) {
            if (Math.abs(i - rawIdx) < 0.6) activateGlass(i);
            else deactivateGlass(i);
          }
        }
      }

      // ── Amplitude envelope (exponential approach) ──
      for (let i = 0; i < NUM_GLASSES; i++) {
        const target = singingRef.current[i] ? 1 : 0;
        const tc = singingRef.current[i] ? ATTACK_TC : RELEASE_TC;
        const alpha = 1 - Math.exp(-dt / tc);
        amplitudesRef.current[i] += (target - amplitudesRef.current[i]) * alpha;
        if (amplitudesRef.current[i] < 0.001) amplitudesRef.current[i] = 0;
        if (amplitudesRef.current[i] > 0.999) amplitudesRef.current[i] = 1;
      }

      setTick((t) => t + 1);
      rafRef.current = requestAnimationFrame(step);
    };

    rafRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafRef.current);
  }, [activateGlass, deactivateGlass, deactivateAllGlasses]);

  // ── Audio setup + teardown ────────────────────────────────────────────────
  // Build the rig on mount so the auto-demo can SOUND wherever the browser
  // permits autoplay (e.g. desktop). On iOS the context starts suspended and
  // stays silent until the first touch resumes it — same as before, no regression.
  useEffect(() => {
    initAudio();
    return () => {
      if (rigRef.current) {
        teardownRig(rigRef.current);
        rigRef.current = null;
      }
    };
  }, [initAudio]);

  // ── Pointer handlers (on the container, with setPointerCapture) ──────────

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      // Stop demo on first touch
      const demo = demoRef.current;
      if (!demo.stopped) {
        demo.stopped = true;
        demo.running = false;
        deactivateAllGlasses();
      }

      initAudio();

      pointerDownRef.current = true;
      pointerIdRef.current   = e.pointerId;
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);

      tuningRef.current       = false;
      tuneStartYRef.current   = e.clientY;
      const hitIdx            = findGlassAt(e.clientX, e.clientY);
      tuningGlassRef.current  = hitIdx;

      if (hitIdx !== null) {
        tuneStartWaterRef.current = waterRef.current[hitIdx];
        activateGlass(hitIdx);
      }
    },
    [initAudio, findGlassAt, activateGlass, deactivateAllGlasses]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!pointerDownRef.current || e.pointerId !== pointerIdRef.current) return;

      const dy  = e.clientY - tuneStartYRef.current;
      const startGlass = tuningGlassRef.current;

      // Vertical drag on the same glass → tune gesture
      if (startGlass !== null && Math.abs(dy) > 10) {
        tuningRef.current = true;
        // Drag down → more water → lower pitch; up → less water → higher pitch
        const newLevel = tuneStartWaterRef.current + dy * 0.004;
        applyWater(startGlass, newLevel);
        // Mute while tuning (prevents confusing tone change mid-drag)
        deactivateGlass(startGlass);
        return;
      }

      // Horizontal swipe — activate glass under pointer, release others
      if (!tuningRef.current) {
        const hitIdx = findGlassAt(e.clientX, e.clientY);
        for (let i = 0; i < NUM_GLASSES; i++) {
          if (i === hitIdx) activateGlass(i);
          else deactivateGlass(i);
        }
      }
    },
    [findGlassAt, activateGlass, deactivateGlass, applyWater]
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.pointerId !== pointerIdRef.current) return;
      pointerDownRef.current   = false;
      pointerIdRef.current     = null;
      tuningRef.current        = false;
      tuningGlassRef.current   = null;
      deactivateAllGlasses();
    },
    [deactivateAllGlasses]
  );

  // ── Render ────────────────────────────────────────────────────────────────

  const amps   = amplitudesRef.current;
  const demo   = demoRef.current;
  const demoX  = (demo.running && !demo.stopped) ? demo.fingerPos * 100 : -1;

  return (
    <div
      className="relative w-full min-h-screen flex flex-col items-center select-none overflow-hidden"
      style={{
        background: "linear-gradient(160deg, #0d0818 0%, #0a1020 55%, #070b16 100%)",
        touchAction: "none",
      }}
    >
      {/* Starfield */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
        {Array.from({ length: 60 }, (_, i) => (
          <div
            key={i}
            className="absolute rounded-full bg-white"
            style={{
              left:    `${(i * 137.508) % 100}%`,
              top:     `${(i * 97.341) % 100}%`,
              width:   1 + (i % 4) * 0.5,
              height:  1 + (i % 4) * 0.5,
              opacity: 0.06 + (i % 5) * 0.07,
            }}
          />
        ))}
      </div>

      {/* Back link */}
      <Link
        href="/dream"
        className="absolute top-4 left-4 z-20 text-white/55 text-xs font-mono hover:text-white/80 transition-colors"
      >
        ← dream lab
      </Link>

      {/* Audio unavailable notice */}
      {!audioAvailable && (
        <div className="absolute top-14 inset-x-4 z-20 text-center">
          <span className="text-rose-300 text-sm font-mono bg-rose-950/60 border border-rose-800/50 rounded-lg px-4 py-2">
            Web Audio unavailable — visuals still animate
          </span>
        </div>
      )}

      {/* Header */}
      <div className="z-10 flex flex-col items-center pt-10 pb-6 px-4 text-center">
        <h1 className="text-white text-2xl md:text-3xl font-bold tracking-wide mb-2">
          Glass Armonica
        </h1>
        <p className="text-white/80 text-base mb-1">
          Drag a glass to fill it, then swipe across the rims to make them sing
        </p>
        <p className="text-white/55 text-xs font-mono">
          more water = lower pitch · like Benjamin Franklin&apos;s armonica (1761)
        </p>
      </div>

      {/* ── Play area ── */}
      <div
        className="z-10 w-full max-w-3xl flex-1 flex flex-col justify-center px-3 pb-4"
        style={{ touchAction: "none", cursor: "crosshair", position: "relative" }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        {/* Ghost-finger demo indicator */}
        {demoX >= 0 && (
          <div
            className="absolute top-0 bottom-0 w-0.5 pointer-events-none z-10"
            style={{
              left: `${demoX}%`,
              background:
                "linear-gradient(to bottom, transparent 0%, #c4b5fd88 25%, #67e8f988 75%, transparent 100%)",
              transition: "left 0.04s linear",
            }}
            aria-hidden="true"
          />
        )}

        {/* Glasses row */}
        <div className="flex items-end justify-center gap-2 sm:gap-3 w-full">
          {waterLevels.map((waterLevel, idx) => {
            const col = GLASS_COLORS[idx % GLASS_COLORS.length]!;
            const amp = amps[idx] ?? 0;
            const noteLabel = NOTE_NAMES[idx] ?? "";

            // Glass height grows slightly for lower (more filled) glasses
            const glassH = 96 + waterLevel * 20;
            // Water fill height as % of glass
            const fillPct = waterLevel * 80;
            // Glow scales with amplitude
            const glowPx = Math.round(amp * 28);
            const glowAlpha = Math.round(amp * 200).toString(16).padStart(2, "0");
            const rimAlpha  = Math.round((0.35 + amp * 0.55) * 255).toString(16).padStart(2, "0");

            return (
              <div key={idx} className="flex flex-col items-center gap-1" style={{ minWidth: 44 }}>
                {/* Note label */}
                <div
                  className="font-mono text-white/55"
                  style={{ fontSize: "0.65rem" }}
                >
                  {noteLabel}
                </div>

                {/* Glass vessel */}
                <div
                  ref={(el) => { glassRefs.current[idx] = el; }}
                  className="relative overflow-hidden"
                  style={{
                    width:        52 + waterLevel * 8,
                    height:       glassH,
                    borderRadius: "6px 6px 18px 18px",
                    background:   `linear-gradient(180deg, ${col.body}1a 0%, ${col.body}12 100%)`,
                    border:       `1px solid ${col.rim}${rimAlpha}`,
                    boxShadow: amp > 0.02
                      ? [
                          `0 0 ${glowPx}px ${glowPx + 4}px ${col.glow}${glowAlpha}`,
                          `inset 0 0 10px 2px ${col.glow}${Math.round(amp * 35).toString(16).padStart(2, "0")}`,
                        ].join(", ")
                      : `0 0 6px 1px ${col.rim}28`,
                    cursor:       "ns-resize",
                    transition:   "width 0.2s ease, height 0.2s ease",
                  }}
                >
                  {/* Water fill */}
                  <div
                    className="absolute bottom-0 left-0 right-0"
                    style={{
                      height:            `${fillPct}%`,
                      borderRadius:      "0 0 16px 16px",
                      background:        `linear-gradient(180deg, ${col.water}55 0%, ${col.water}bb 100%)`,
                      transition:        "height 0.18s ease",
                    }}
                  >
                    {/* Water surface shimmer line */}
                    <div
                      className="absolute top-0 left-0 right-0"
                      style={{
                        height:     2,
                        background: `linear-gradient(90deg, transparent, ${col.rim}aa, transparent)`,
                        opacity:    0.55 + amp * 0.45,
                      }}
                    />
                  </div>

                  {/* Glass sheen highlight */}
                  <div
                    className="absolute top-0 bottom-0 pointer-events-none"
                    style={{
                      left:       "14%",
                      width:      "16%",
                      background: `linear-gradient(180deg, ${col.rim}28 0%, transparent 100%)`,
                      borderRadius: 4,
                    }}
                  />
                </div>

                {/* Rim glow dot */}
                <div
                  className="rounded-full"
                  style={{
                    width:     8,
                    height:    8,
                    background: col.rim,
                    opacity:   0.35 + amp * 0.6,
                    boxShadow: amp > 0.08
                      ? `0 0 ${Math.round(amp * 14)}px 2px ${col.glow}`
                      : "none",
                    transition: "opacity 0.1s, box-shadow 0.1s",
                  }}
                />
              </div>
            );
          })}
        </div>

        {/* Rim rail — visual swipe guide */}
        <div
          className="mx-4 mt-4 h-px pointer-events-none"
          style={{
            background:
              "linear-gradient(90deg, transparent, rgba(196,181,253,0.18) 20%, rgba(103,232,249,0.22) 50%, rgba(196,181,253,0.18) 80%, transparent)",
          }}
          aria-hidden="true"
        />

        {/* Demo hint */}
        {demo.running && !demo.stopped && (
          <p className="text-white/55 text-xs font-mono text-center mt-4 pointer-events-none">
            ↔ ghost finger sweeping · touch any glass to take over
          </p>
        )}
      </div>

      {/* Bottom legend */}
      <div className="z-10 flex flex-col items-center gap-2 pb-10 px-4">
        <div className="flex items-center gap-6 flex-wrap justify-center">
          <div className="flex items-center gap-2">
            <div className="w-4 h-7 rounded-b bg-violet-400/35 border border-violet-400/40" />
            <span className="text-white/75 text-sm">drag ↕ to tune</span>
          </div>
          <div className="flex items-center gap-2">
            <div
              className="w-10 h-1 rounded"
              style={{
                background: "linear-gradient(90deg, #c4b5fd55, #67e8f966, #c4b5fd55)",
              }}
            />
            <span className="text-white/75 text-sm">swipe → to sing</span>
          </div>
        </div>
        <p className="text-white/55 text-xs font-mono text-center">
          sweep back and forth to make overlapping washes
        </p>
      </div>

      {/* Design notes button */}
      <button
        onClick={() => setShowReadme((v) => !v)}
        className="absolute bottom-4 right-4 z-20 text-white/55 text-xs font-mono
                   bg-white/5 hover:bg-white/10 border border-white/10 rounded
                   px-4 py-2.5 transition-colors min-h-[44px] flex items-center"
        aria-label="Read the design notes"
      >
        design notes
      </button>

      {/* README overlay */}
      {showReadme && (
        <div
          className="absolute inset-0 z-30 bg-black/80 flex items-center justify-center p-6"
          onClick={() => setShowReadme(false)}
        >
          <div
            className="bg-gray-900 border border-white/10 rounded-xl p-6 max-w-lg w-full
                       text-white/80 text-sm leading-relaxed overflow-y-auto max-h-[82vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-white text-xl font-bold mb-1">355 — Kids Glass Armonica</h2>
            <p className="text-white/55 text-xs font-mono mb-4">tap backdrop to close</p>

            <div className="space-y-3 font-mono text-xs leading-relaxed">
              <p>
                <strong className="text-white/90">Reference:</strong>{" "}
                Benjamin Franklin&apos;s <em>glass armonica</em> (1761) — a set of nested
                spinning glass bowls played by touching wet fingers to the rims. The continuous
                friction produces a sustained, breathy, ethereal tone entirely unlike the struck
                bell of a glockenspiel. Mozart and Beethoven both wrote for it. Folk tradition:
                the <em>musical glasses / glass harp</em> — wine glasses rubbed with a wet finger.
              </p>

              <p>
                <strong className="text-white/90">Water → pitch (physically correct):</strong>{" "}
                More water = heavier glass = slower vibration = lower pitch. At
                waterLevel=0 (empty glass) the voice sings its base D-Dorian note.
                At waterLevel=1 (full) the pitch drops by factor&nbsp;1.65 below base.
                Formula: freq = baseHz&nbsp;/&nbsp;(1&nbsp;+&nbsp;water&nbsp;×&nbsp;0.65).
              </p>

              <p>
                <strong className="text-white/90">Synthesis:</strong>{" "}
                Each glass voice is a continuously-running oscillator bank: fundamental
                sine + 3rd-harmonic triangle (7% gain) + 7th-partial shimmer (1.5% gain),
                all gated by an amplitude envelope. A slow LFO (~5 Hz, tiny amplitude) adds
                the wet-rim wavering. Attack ≈ 200ms; release ≈ 900ms — the slow swells are
                the signature armonica sound. DynamicsCompressor as brick-wall limiter so a
                full sweep never blasts. Quiet D-minor pad drone always on.
              </p>

              <p>
                <strong className="text-white/90">Controls:</strong><br />
                • Drag UP/DOWN on a glass to set its water level (tuning).<br />
                • Swipe continuously across the glass tops to rub the rims.<br />
                • Hold a single rim to sustain that note.<br />
                • Sweep back and forth for overlapping, chord-like washes.
              </p>

              <p>
                <strong className="text-white/90">Auto-demo:</strong>{" "}
                On load, a ghost finger sweeps back and forth for ~12 seconds so the
                armonica plays itself. Stops the moment you touch any glass.
              </p>

              <p>
                <strong className="text-white/90">Subsystems:</strong>{" "}
                audio.ts — voice building (oscillator bank + LFO + envelope gain),
                retune, activate/deactivate, teardown.
                page.tsx — pointer capture + bounding-rect hit-test (needed because
                setPointerCapture hides native enter events), rAF amplitude envelope
                tracker, CSS box-shadow/opacity glow driven by live amplitude.
              </p>

              <p className="text-white/55">
                Unverified surface: the exact water-level / pitch ratio is a musical
                approximation, not a calibrated physics model.
              </p>
            </div>

            <button
              onClick={() => setShowReadme(false)}
              className="mt-5 w-full py-2.5 bg-white/10 hover:bg-white/20 rounded
                         text-white/75 transition-colors text-sm min-h-[44px]"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
