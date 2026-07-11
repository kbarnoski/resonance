"use client";

/**
 * 397-kids-crystal-bloom — Crystal Bloom
 *
 * One question: what if a 4-year-old could BLOW or HUM into the mic and grow a
 * tower of singing crystal bells tuned to PURE harmonic ratios — a glassy,
 * shimmering, beating-free chord that sounds unlike any piano?
 *
 * INPUT  : microphone loudness only (RMS envelope, NOT pitch detection)
 * OUTPUT : animated inline SVG (React state/refs + RAF — no canvas, no WebGL)
 * SYNTH  : just-intonation harmonic-series additive bells (pure integer ratios)
 * VIBE   : crystalline, calm, contemplative, foreign-tonal.
 *
 * Degrades gracefully: after the start tap, if the mic is denied / missing /
 * silent for ~3s, a synthetic breath envelope drives the tower hands-free,
 * looping calmly. Pointer press-and-hold also "breathes" the tower manually.
 *
 * References: Harry Partch (just intonation); Scale Workshop & Tune.js
 * (browser microtonal tooling); purified-synth / "Pure Intonation" browser
 * sequencer, RubyKaigi 2026.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  BELLS,
  N_BELLS,
  makeRig,
  ringBell,
  type BellRig,
} from "./ji";
import {
  makeMic,
  readRms,
  applyFollow,
  stopMic,
  type MicRig,
} from "./mic";

type Phase = "idle" | "running";
type InputMode = "mic" | "auto" | "touch";

/** Per-bell live visual values, mutated in the RAF loop, mirrored to React. */
interface BellVis {
  /** 0 = dim at rest, 1 = fully lit */
  light: number;
  /** transient ring pulse, decays each frame */
  pulse: number;
}

function makeBellVis(): BellVis[] {
  return Array.from({ length: N_BELLS }, () => ({ light: 0, pulse: 0 }));
}

// Tower geometry (SVG user units). Bells stack bottom → top.
const VIEW_W = 360;
const VIEW_H = 720;
const BELL_GAP = VIEW_H / (N_BELLS + 1);

function bellCx(): number {
  return VIEW_W / 2;
}

/** Bell i sits higher up the tower as i increases (i=0 lowest). */
function bellCy(i: number): number {
  return VIEW_H - BELL_GAP * (i + 1);
}

/** Faceted teardrop/gem path centered at (cx, cy), sized by r. */
function makeGemPath(cx: number, cy: number, r: number): string {
  const top = `${cx},${cy - r * 1.25}`;
  const right = `${cx + r},${cy - r * 0.1}`;
  const botR = `${cx + r * 0.45},${cy + r * 1.15}`;
  const botL = `${cx - r * 0.45},${cy + r * 1.15}`;
  const left = `${cx - r},${cy - r * 0.1}`;
  return `M ${top} L ${right} L ${botR} L ${botL} L ${left} Z`;
}

export default function CrystalBloomPage() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [micError, setMicError] = useState<string | null>(null);
  const [inputMode, setInputMode] = useState<InputMode>("auto");

  // React-mirrored visual state (updated ~throttled from the RAF loop).
  const [bells, setBells] = useState<BellVis[]>(makeBellVis);
  const [climb, setClimb] = useState(0); // 0..1 overall energy of the tower

  // ── Refs for the RAF loop (no re-render churn) ──────────────────────────────
  const rigRef = useRef<BellRig | null>(null);
  const micRef = useRef<MicRig | null>(null);
  const rafRef = useRef<number | null>(null);

  const visRef = useRef<BellVis[]>(makeBellVis());
  const envRef = useRef(0); // smoothed input envelope 0..1
  const climbRef = useRef(0); // how high the tower has bloomed 0..N_BELLS
  const litCountRef = useRef(0); // integer bells currently triggered to ring
  const lastInputAtRef = useRef(0); // ms timestamp of last real input
  const touchingRef = useRef(false); // pointer press-and-hold active
  const autoRef = useRef(false); // synthetic breath running
  const modeRef = useRef<InputMode>("auto");

  const setMode = useCallback((m: InputMode) => {
    modeRef.current = m;
    setInputMode(m);
  }, []);

  // ── RAF loop ────────────────────────────────────────────────────────────────
  const loop = useCallback(() => {
    const rig = rigRef.current;
    if (!rig) return;
    const now = performance.now();
    const t = now / 1000;

    // 1. Determine raw drive (0..1) from the active input source.
    let raw = 0;
    const mic = micRef.current;
    if (mic) {
      const rms = readRms(mic);
      // map a gentle breath/hum range to 0..1 (kids are quiet & close).
      raw = Math.min(1, Math.max(0, (rms - 0.004) * 22));
      if (raw > 0.04) {
        lastInputAtRef.current = now;
        if (modeRef.current !== "mic") setMode("mic");
      }
    }
    if (touchingRef.current) {
      raw = Math.max(raw, 0.85);
      lastInputAtRef.current = now;
      if (modeRef.current !== "touch") setMode("touch");
    }

    // 2. Auto-demo: if nothing real for ~3s, synthesize a calm breath.
    const silentMs = now - lastInputAtRef.current;
    if (silentMs > 3000) {
      if (!autoRef.current) {
        autoRef.current = true;
        if (!touchingRef.current) setMode("auto");
      }
    }
    if (autoRef.current && silentMs > 3000) {
      // slow inhale/exhale: a soft swell every ~7s, peaking near the top.
      const phaseT = (t % 7) / 7; // 0..1
      const swell = Math.pow(Math.sin(phaseT * Math.PI), 1.6); // 0..1 smooth
      raw = Math.max(raw, swell * 0.95);
    } else if (silentMs <= 3000) {
      autoRef.current = false;
    }

    // 3. Smooth the envelope (fast attack, slow release → shimmer breath).
    envRef.current = applyFollow(envRef.current, raw);
    const env = envRef.current;

    // 4. Climb: envelope pushes the bloom up the tower; it eases back down.
    const targetClimb = env * N_BELLS;
    if (targetClimb > climbRef.current) {
      climbRef.current += (targetClimb - climbRef.current) * 0.25; // grow fast
    } else {
      climbRef.current += (targetClimb - climbRef.current) * 0.02; // fade slow
    }
    const climbN = climbRef.current;

    // 5. Trigger rings as new bells light up in sequence.
    const litTarget = Math.floor(Math.min(N_BELLS, climbN + 0.001));
    while (litCountRef.current < litTarget) {
      const i = litCountRef.current;
      ringBell(rig, i, 0.35 + env * 0.65);
      visRef.current[i].pulse = 1;
      litCountRef.current += 1;
    }
    // when the tower recedes below a bell, allow it to re-ring next swell.
    if (litTarget < litCountRef.current) {
      litCountRef.current = litTarget;
    }

    // 6. Sustained shimmer: occasionally re-ring lit bells while held loud,
    //    so the whole stacked chord keeps singing (beating-free).
    if (env > 0.5 && Math.random() < 0.012) {
      const i = Math.floor(Math.random() * Math.max(1, litTarget));
      ringBell(rig, i, 0.25 + env * 0.4);
      visRef.current[i].pulse = Math.max(visRef.current[i].pulse, 0.8);
    }

    // 7. Update per-bell visuals.
    const vis = visRef.current;
    for (let i = 0; i < N_BELLS; i++) {
      const lit = climbN - i; // >0 means this bell is within the bloom
      const targetLight = lit > 0 ? Math.min(1, lit) : 0;
      const k = targetLight > vis[i].light ? 0.3 : 0.04;
      vis[i].light += (targetLight - vis[i].light) * k;
      vis[i].pulse *= 0.9; // decay ring pulse
    }

    // 8. Mirror to React (cheap: copy small arrays each frame).
    setBells(vis.map((b) => ({ light: b.light, pulse: b.pulse })));
    setClimb(Math.min(1, climbN / N_BELLS));

    rafRef.current = requestAnimationFrame(loop);
  }, [setMode]);

  // ── Start (first user gesture: create + resume the AudioContext) ────────────
  const start = useCallback(async () => {
    if (phase === "running") return;
    setMicError(null);
    const rig = makeRig();
    rigRef.current = rig;
    try {
      await rig.ctx.resume();
    } catch {
      /* resume rejection is non-fatal; ring on first interaction */
    }

    // Seed lastInput in the past so auto-demo can kick in if mic is silent.
    lastInputAtRef.current = performance.now() - 3500;
    setMode("auto");
    setPhase("running");
    rafRef.current = requestAnimationFrame(loop);

    // Try the mic, but never block the experience on it.
    try {
      const mic = await makeMic(rig.ctx);
      micRef.current = mic;
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Could not open the microphone.";
      setMicError(
        `${msg} No problem — the tower will sing on its own. You can also press and hold the tower to breathe.`
      );
    }
  }, [phase, loop, setMode]);

  // ── Cleanup on unmount ──────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      if (micRef.current) stopMic(micRef.current);
      const rig = rigRef.current;
      if (rig) rig.ctx.close().catch(() => {});
    };
  }, []);

  // ── Pointer press-and-hold = manual breath ──────────────────────────────────
  const onPressStart = useCallback(() => {
    if (phase !== "running") return;
    touchingRef.current = true;
  }, [phase]);
  const onPressEnd = useCallback(() => {
    touchingRef.current = false;
  }, []);

  const modeLabel: Record<InputMode, { text: string; cls: string }> = {
    mic: { text: "listening to you", cls: "text-violet-300/95" },
    touch: { text: "press-and-hold breath", cls: "text-violet-300" },
    auto: { text: "breathing on its own", cls: "text-violet-300/95" },
  };

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#05060c] text-foreground">
      {/* ambient backdrop glow that warms as the tower blooms */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 transition-opacity duration-700"
        style={{
          background:
            "radial-gradient(120% 80% at 50% 100%, rgba(124,58,237,0.18), transparent 60%)",
          opacity: 0.4 + climb * 0.6,
        }}
      />

      {/* header */}
      <header className="relative z-10 flex items-start justify-between gap-4 px-5 pt-6">
        <div>
          <h1 className="font-serif text-3xl leading-tight text-foreground sm:text-4xl">
            Crystal Bloom
          </h1>
          <p className="mt-1 max-w-md text-base text-muted-foreground">
            Blow or hum, and grow a tower of singing crystal bells tuned to{" "}
            <span className="text-violet-300">pure harmonic ratios</span> — a
            glassy, beating-free chord unlike any piano.
          </p>
        </div>
        <Link
          href="#design-notes"
          className="shrink-0 font-mono text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          Read the design notes
        </Link>
      </header>

      {/* the tower */}
      <div className="relative z-10 mx-auto mt-2 flex w-full max-w-lg flex-1 flex-col items-center px-4">
        <svg
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          className="h-[64vh] max-h-[680px] w-auto touch-none select-none"
          onPointerDown={onPressStart}
          onPointerUp={onPressEnd}
          onPointerLeave={onPressEnd}
          onPointerCancel={onPressEnd}
          role="img"
          aria-label="A tower of crystal bells that light up and ring with your breath."
        >
          <defs>
            {BELLS.map((b, i) => (
              <radialGradient
                key={`grad-${i}`}
                id={`bellGrad-${i}`}
                cx="50%"
                cy="35%"
                r="75%"
              >
                <stop offset="0%" stopColor="#ffffff" stopOpacity="0.9" />
                <stop offset="45%" stopColor={b.color} stopOpacity="1" />
                <stop offset="100%" stopColor={b.color} stopOpacity="0.55" />
              </radialGradient>
            ))}
            <filter id="soften" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="2.2" />
            </filter>
          </defs>

          {/* the central light-thread the bells thread onto */}
          <line
            x1={bellCx()}
            y1={bellCy(0) + 20}
            x2={bellCx()}
            y2={bellCy(N_BELLS - 1) - 20}
            stroke="rgba(255,255,255,0.12)"
            strokeWidth={2}
          />

          {bells.map((bv, i) => {
            const cx = bellCx();
            const cy = bellCy(i);
            const baseR = 22 + i * 0.6;
            const pulseScale = 1 + bv.pulse * 0.18;
            const r = baseR * pulseScale;
            const light = bv.light;
            const opacity = 0.16 + light * 0.84;
            const glow = light * 0.7 + bv.pulse * 0.5;

            return (
              <g key={`bell-${i}`} opacity={opacity}>
                {/* glow halo when lit / ringing */}
                {glow > 0.02 && (
                  <circle
                    cx={cx}
                    cy={cy}
                    r={baseR * (1.6 + bv.pulse * 0.8)}
                    fill={BELLS[i].color}
                    opacity={glow * 0.35}
                    filter="url(#soften)"
                  />
                )}
                {/* the faceted gem bell */}
                <path
                  d={makeGemPath(cx, cy, r)}
                  fill={`url(#bellGrad-${i})`}
                  stroke="rgba(255,255,255,0.85)"
                  strokeWidth={1 + light * 1.2}
                  strokeLinejoin="round"
                />
                {/* facet highlight line */}
                <line
                  x1={cx}
                  y1={cy - r * 1.2}
                  x2={cx}
                  y2={cy + r * 1.1}
                  stroke="rgba(255,255,255,0.55)"
                  strokeWidth={0.8}
                  opacity={0.3 + light * 0.5}
                />
                {/* refraction sparkles that flash on the ring pulse */}
                {bv.pulse > 0.05 &&
                  [0, 1, 2, 3].map((k) => {
                    const ang = (k / 4) * Math.PI * 2 + i;
                    const dist = baseR * (1.8 + bv.pulse * 1.4);
                    return (
                      <circle
                        key={`sp-${i}-${k}`}
                        cx={cx + Math.cos(ang) * dist}
                        cy={cy + Math.sin(ang) * dist}
                        r={1.6 + bv.pulse * 2.2}
                        fill="#ffffff"
                        opacity={bv.pulse * 0.8}
                      />
                    );
                  })}
              </g>
            );
          })}
        </svg>

        {/* status line — never hide failures */}
        <div className="mt-1 min-h-[1.5rem] text-center font-mono text-sm">
          {phase === "running" && (
            <span className={modeLabel[inputMode].cls}>
              {modeLabel[inputMode].text}
            </span>
          )}
        </div>
        {micError && (
          <p className="mt-2 max-w-md text-center text-base text-violet-300">
            {micError}
          </p>
        )}
      </div>

      {/* start overlay / call to action */}
      {phase === "idle" && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-end gap-4 pb-16">
          <button
            onClick={start}
            className="min-h-[84px] rounded-3xl bg-violet-500/20 px-12 py-6 text-2xl font-medium text-foreground ring-2 ring-violet-300/60 transition hover:bg-violet-500/30 active:scale-[0.98]"
          >
            ✦ Tap to begin ✦
          </button>
          <p className="px-6 text-center text-base text-muted-foreground">
            Then blow or hum into the mic — or press and hold the bells.
          </p>
        </div>
      )}

      {/* design notes */}
      <section
        id="design-notes"
        className="relative z-10 mx-auto max-w-2xl px-6 pb-16 pt-8 text-base text-muted-foreground"
      >
        <h2 className="font-serif text-xl text-foreground">Design notes</h2>
        <p className="mt-2">
          Every bell is tuned to a{" "}
          <span className="text-violet-300">pure integer frequency ratio</span>{" "}
          above one low fundamental (A2, ~110&nbsp;Hz). Because the ratios are
          exact small fractions (5/4, 3/2, 5/3&nbsp;…) the partials of stacked
          bells phase-lock — there are no beats, no roughness. That glassy
          stillness is the whole point, and it is something a 12-tone equal-
          tempered piano physically cannot produce.
        </p>
        <p className="mt-3 text-muted-foreground">
          INPUT: microphone loudness (RMS envelope) · OUTPUT: animated inline SVG
          · TECHNIQUE: just-intonation additive bell synthesis · See the
          folder&apos;s README.md for the full tuning table and references
          (Harry&nbsp;Partch; Scale&nbsp;Workshop &amp; Tune.js; the
          purified-synth / &ldquo;Pure&nbsp;Intonation&rdquo; sequencer,
          RubyKaigi&nbsp;2026).
        </p>
      </section>
    </main>
  );
}
