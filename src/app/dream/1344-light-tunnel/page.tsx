"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 1344 · Light Tunnel — the near-death tunnel-toward-light as living VECTOR
// LINE-ART. Hundreds of animated concentric SVG rings recede into a luminous
// center; you steer the vanishing point (and your approach speed) by tilting
// your phone. No canvas, no WebGL — every mark is an SVG DOM element whose
// r / cx / cy / stroke / opacity are mutated in place each frame.
//
// THE ONE QUESTION: What if the near-death tunnel-toward-light were rendered
// entirely as living vector line-art you steer by tilting your phone?
//
// SUBSTRATE : inline <svg> — <circle> rings + <line> spokes + radial-gradient
//             bloom & hypoxic vignette. Elements are created once and reused;
//             a requestAnimationFrame loop mutates SVG attributes (never the
//             DOM shape count). ~90 rings + 30 spokes ≈ 120 elements.
// INPUT     : DeviceOrientationEvent (iOS requestPermission in-gesture) steers
//             the vanishing point / bends the tunnel and sets approach speed.
//             Desktop fallback: pointer position over the field. Auto-drift
//             before the user ever tilts, so it is alive on load.
// AUDIO     : slow Shepard–Risset ascent + warm JI drone in a convolution void
//             (see audio.ts). Approach speed opens the low-pass and lifts the
//             brightness toward the being-of-light moment.
// PALETTE   : dark-void-luminous — thin cool line-work warming to gold/white at
//             the center. Slow, weightless, hyper-lucid. No strobe (≤3 Hz).
//
// REFERENCE : Ryoji Ikeda (data/line minimalism) & Zach Lieberman (generative
//             vector poetry) — both living.
//
// DEGRADES  : no tilt sensor / permission denied → pointer-drag steers, with an
//             amber note. Nothing sounds until Begin. prefers-reduced-motion
//             slows the approach and softens the contrast.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import { makeTunnelAudio, type TunnelAudio } from "./audio";

// ── fixed viewBox coordinate space; the <svg> slice-fills the viewport ────────
const VB = 1000;
const C = VB / 2; // center of the coordinate space
const N_RINGS = 90;
const N_SPOKES = 30;
const R_MIN = 3; // radius of a ring just born at the vanishing point
const R_MAX = 1080; // radius at which a ring exits the frame
const VP_RANGE = 250; // how far the vanishing point can be pushed by steering

type Phase = "idle" | "running";
type Mode = "auto" | "tilt" | "pointer";

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

// Warm gold/white at the center (small depth) cooling to thin blue at the rim.
function drawRingColor(z: number, brightness: number): string {
  const warm: [number, number, number] = [255, 236, 190];
  const cool: [number, number, number] = [120, 168, 224];
  const t = smoothstep(0.02, 0.55, z);
  const glow = (1 - t) * (0.35 + 0.65 * brightness); // extra white near core
  const r = Math.round(warm[0] * (1 - t) + cool[0] * t + (255 - warm[0]) * glow);
  const g = Math.round(warm[1] * (1 - t) + cool[1] * t + (255 - warm[1]) * glow);
  const b = Math.round(warm[2] * (1 - t) + cool[2] * t + (255 - warm[2]) * glow);
  return `rgb(${r},${g},${b})`;
}

export default function LightTunnelPage() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [mode, setMode] = useState<Mode>("auto");
  const [permDenied, setPermDenied] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);

  // ── SVG element refs (created once, mutated every frame) ──────────────────
  const ringsRef = useRef<(SVGCircleElement | null)[]>([]);
  const spokesRef = useRef<(SVGLineElement | null)[]>([]);
  const lightGradRef = useRef<SVGRadialGradientElement | null>(null);
  const lightCircleRef = useRef<SVGCircleElement | null>(null);
  const vigGradRef = useRef<SVGRadialGradientElement | null>(null);
  const vigMidRef = useRef<SVGStopElement | null>(null);

  // ── animation state (refs so the RAF loop is stable) ──────────────────────
  const rafRef = useRef(0);
  const lastRef = useRef(0);
  const depthRef = useRef(0); // advancing tunnel phase
  const spinRef = useRef(0); // slow spoke rotation
  const brightRef = useRef(0); // smoothed brightness toward the light
  const vpRef = useRef<[number, number]>([0, 0]); // current vanishing offset
  const vpTargetRef = useRef<[number, number]>([0, 0]);
  const approachRef = useRef(0.15); // current approach 0..1
  const approachTargetRef = useRef(0.15);
  const clockRef = useRef(0); // wall time for auto-drift

  const modeRef = useRef<Mode>("auto");
  const hasTiltRef = useRef(false);
  const reducedRef = useRef(false);

  const audioRef = useRef<TunnelAudio | null>(null);
  const acRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  // ── device tilt: steer the vanishing point + set approach speed ───────────
  const onOrient = useCallback((e: DeviceOrientationEvent) => {
    if (e.gamma == null && e.beta == null) return;
    hasTiltRef.current = true;
    if (modeRef.current !== "tilt") setMode("tilt");
    const gx = Math.max(-1, Math.min(1, (e.gamma ?? 0) / 40));
    const gy = Math.max(-1, Math.min(1, ((e.beta ?? 45) - 45) / 40));
    vpTargetRef.current = [gx * VP_RANGE, gy * VP_RANGE];
    const lean = Math.min(1, Math.hypot(gx, gy));
    approachTargetRef.current = 0.15 + lean * 0.85;
  }, []);

  // ── pointer fallback (desktop / no accelerometer): position IS the tilt ───
  const onPointerMove = useCallback((e: PointerEvent) => {
    if (hasTiltRef.current) return; // tilt wins whenever present
    const px = (e.clientX / window.innerWidth) * 2 - 1;
    const py = (e.clientY / window.innerHeight) * 2 - 1;
    vpTargetRef.current = [px * (VP_RANGE + 60), py * (VP_RANGE + 60)];
    const reach = Math.min(1, Math.hypot(px, py));
    approachTargetRef.current = 0.15 + reach * 0.85;
    if (modeRef.current !== "pointer") setMode("pointer");
  }, []);

  // ── the render loop: one clock feeds the SVG attributes + the audio ───────
  const renderLoop = useCallback(() => {
    const now = performance.now();
    const dt = Math.min(0.05, (now - lastRef.current) / 1000 || 0);
    lastRef.current = now;
    clockRef.current += dt;

    const rm = reducedRef.current;

    // auto-drift before the user has taken control — a slow Lissajous wander.
    if (modeRef.current === "auto") {
      const t = clockRef.current;
      vpTargetRef.current = [
        Math.sin(t * 0.11) * VP_RANGE * 0.6,
        Math.cos(t * 0.083) * VP_RANGE * 0.5,
      ];
      approachTargetRef.current = 0.24 + 0.12 * (0.5 + 0.5 * Math.sin(t * 0.05));
    }

    // ease everything (weightless, hyper-lucid)
    const vp = vpRef.current;
    const vpt = vpTargetRef.current;
    vp[0] += (vpt[0] - vp[0]) * 0.035;
    vp[1] += (vpt[1] - vp[1]) * 0.035;

    const aEase = rm ? 0.02 : 0.03;
    approachRef.current += (approachTargetRef.current - approachRef.current) * aEase;
    const approach = rm ? approachRef.current * 0.5 : approachRef.current;

    // advance the tunnel + a slow spin
    const rate = (0.05 + approach * 0.34) * (rm ? 0.55 : 1);
    depthRef.current = (depthRef.current + rate * dt) % 1;
    spinRef.current += dt * 0.04;

    // brightness blooms toward the light with approach + a breath swell
    const breath = 0.5 + 0.5 * Math.sin(clockRef.current * 0.6283); // ~0.1 Hz
    const brightTarget = Math.min(1, approach * (0.7 + 0.3 * breath)) * (rm ? 0.7 : 1);
    brightRef.current += (brightTarget - brightRef.current) * 0.04; // ≤3 Hz, smooth
    const brightness = brightRef.current;

    const vpx = C + vp[0];
    const vpy = C + vp[1];
    const phase = depthRef.current;
    const logSpan = Math.log(R_MAX / R_MIN);

    // ── rings: mutate each existing <circle> in place ───────────────────────
    const rings = ringsRef.current;
    for (let i = 0; i < N_RINGS; i++) {
      const el = rings[i];
      if (!el) continue;
      const z = (phase + i / N_RINGS) % 1; // 0 = far/newborn, 1 = exiting
      const r = R_MIN * Math.exp(logSpan * z);
      // far rings sit at the vanishing point; near rings center on the frame →
      // the tunnel bends toward wherever you are steering.
      const w = Math.pow(1 - z, 1.6);
      const cx = C + (vpx - C) * w;
      const cy = C + (vpy - C) * w;

      const emerge = smoothstep(0, 0.06, z);
      const exit = 1 - smoothstep(0.82, 1, z);
      const alpha = emerge * exit * (0.4 + 0.45 * brightness);

      el.setAttribute("cx", cx.toFixed(1));
      el.setAttribute("cy", cy.toFixed(1));
      el.setAttribute("r", r.toFixed(1));
      el.setAttribute("stroke", drawRingColor(z, brightness));
      el.setAttribute("stroke-width", (0.9 + z * 2.0).toFixed(2));
      el.setAttribute("opacity", alpha.toFixed(3));
    }

    // ── spokes: faint radial vector-field converging on the vanishing point ──
    const spokes = spokesRef.current;
    const spokeAlpha = 0.05 + 0.09 * brightness;
    for (let i = 0; i < N_SPOKES; i++) {
      const el = spokes[i];
      if (!el) continue;
      const ang = (i / N_SPOKES) * Math.PI * 2 + spinRef.current;
      el.setAttribute("x1", (vpx + Math.cos(ang) * 30).toFixed(1));
      el.setAttribute("y1", (vpy + Math.sin(ang) * 30).toFixed(1));
      el.setAttribute("x2", (vpx + Math.cos(ang) * R_MAX).toFixed(1));
      el.setAttribute("y2", (vpy + Math.sin(ang) * R_MAX).toFixed(1));
      el.setAttribute("opacity", spokeAlpha.toFixed(3));
    }

    // ── the being of light: a slow radial bloom at the vanishing point ──────
    const lg = lightGradRef.current;
    const lc = lightCircleRef.current;
    const lightR = 34 + brightness * 260;
    if (lg) {
      lg.setAttribute("cx", vpx.toFixed(1));
      lg.setAttribute("cy", vpy.toFixed(1));
      lg.setAttribute("r", lightR.toFixed(1));
    }
    if (lc) {
      lc.setAttribute("cx", vpx.toFixed(1));
      lc.setAttribute("cy", vpy.toFixed(1));
      lc.setAttribute("r", lightR.toFixed(1));
      lc.setAttribute("opacity", (0.55 + 0.45 * brightness).toFixed(3));
    }

    // ── hypoxic vignette: constricts toward the luminous core with approach ──
    const vg = vigGradRef.current;
    const vm = vigMidRef.current;
    if (vg) {
      vg.setAttribute("cx", vpx.toFixed(1));
      vg.setAttribute("cy", vpy.toFixed(1));
    }
    if (vm) {
      const clear = (rm ? 0.5 : 0.58) - approach * (rm ? 0.16 : 0.34);
      vm.setAttribute("offset", Math.max(0.12, clear).toFixed(3));
    }

    // ── audio follows the same approach drive ───────────────────────────────
    audioRef.current?.update(approach, dt);

    rafRef.current = requestAnimationFrame(renderLoop);
  }, []);

  // ── Begin: unlock audio + sensors inside the user gesture ─────────────────
  const handleBegin = useCallback(async () => {
    if (phase === "running") return;

    if (typeof window !== "undefined" && window.matchMedia) {
      reducedRef.current = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;
    }

    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const ac = new AC();
    await ac.resume();
    acRef.current = ac;
    audioRef.current = makeTunnelAudio(ac, 0.2);

    // iOS 13+ gyro permission must be requested from within the gesture.
    const DOE = window.DeviceOrientationEvent as unknown as {
      requestPermission?: () => Promise<"granted" | "denied">;
    };
    if (DOE && typeof DOE.requestPermission === "function") {
      try {
        const res = await DOE.requestPermission();
        if (res === "granted") {
          window.addEventListener("deviceorientation", onOrient);
        } else {
          setPermDenied(true);
        }
      } catch {
        setPermDenied(true);
      }
    } else if (typeof window !== "undefined" && "DeviceOrientationEvent" in window) {
      window.addEventListener("deviceorientation", onOrient);
    }

    setPhase("running");
  }, [phase, onOrient]);

  // ── kick the RAF loop + pointer listener once running ─────────────────────
  useEffect(() => {
    if (phase !== "running") return;
    lastRef.current = performance.now();
    rafRef.current = requestAnimationFrame(renderLoop);
    window.addEventListener("pointermove", onPointerMove);
    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("pointermove", onPointerMove);
    };
  }, [phase, renderLoop, onPointerMove]);

  // ── full teardown on unmount ──────────────────────────────────────────────
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("deviceorientation", onOrient);
      window.removeEventListener("pointermove", onPointerMove);
      audioRef.current?.stop();
      audioRef.current = null;
      const ac = acRef.current;
      if (ac && ac.state !== "closed") {
        window.setTimeout(() => {
          if (ac.state !== "closed") void ac.close();
        }, 1200);
      }
      acRef.current = null;
    };
  }, [onOrient, onPointerMove]);

  const rings = Array.from({ length: N_RINGS });
  const spokes = Array.from({ length: N_SPOKES });

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#04060d] text-foreground">
      {/* ── the render surface: pure SVG DOM line-art ────────────────────── */}
      <svg
        viewBox={`0 0 ${VB} ${VB}`}
        preserveAspectRatio="xMidYMid slice"
        className="fixed inset-0 h-full w-full touch-none"
        aria-hidden
      >
        <defs>
          <radialGradient
            id="lightGrad"
            ref={lightGradRef}
            gradientUnits="userSpaceOnUse"
            cx={C}
            cy={C}
            r={200}
          >
            <stop offset="0" stopColor="#fffdf4" stopOpacity="1" />
            <stop offset="0.4" stopColor="#ffe6ac" stopOpacity="0.75" />
            <stop offset="1" stopColor="#ffcf9a" stopOpacity="0" />
          </radialGradient>
          <radialGradient
            id="vigGrad"
            ref={vigGradRef}
            gradientUnits="userSpaceOnUse"
            cx={C}
            cy={C}
            r={760}
          >
            <stop offset="0" stopColor="#04060d" stopOpacity="0" />
            <stop ref={vigMidRef} offset="0.55" stopColor="#04060d" stopOpacity="0" />
            <stop offset="1" stopColor="#02030a" stopOpacity="0.94" />
          </radialGradient>
        </defs>

        {/* dark void base */}
        <rect x="0" y="0" width={VB} height={VB} fill="#04060d" />

        {/* faint converging vector-field */}
        <g style={{ mixBlendMode: "screen" }}>
          {spokes.map((_, i) => (
            <line
              key={`s${i}`}
              ref={(el) => {
                spokesRef.current[i] = el;
              }}
              stroke="#7fb0e6"
              strokeWidth="0.6"
              opacity="0"
            />
          ))}
        </g>

        {/* the concentric rings — the tunnel itself */}
        <g style={{ mixBlendMode: "screen" }} fill="none">
          {rings.map((_, i) => (
            <circle
              key={`r${i}`}
              ref={(el) => {
                ringsRef.current[i] = el;
              }}
              cx={C}
              cy={C}
              r={R_MIN}
              stroke="#88a8e0"
              strokeWidth="1"
              opacity="0"
            />
          ))}
        </g>

        {/* the being of light, additive over the core */}
        <circle
          ref={lightCircleRef}
          cx={C}
          cy={C}
          r={200}
          fill="url(#lightGrad)"
          style={{ mixBlendMode: "screen" }}
        />

        {/* hypoxic vignette constricting toward the core */}
        <rect x="0" y="0" width={VB} height={VB} fill="url(#vigGrad)" />
      </svg>

      {/* ── corner UI ─────────────────────────────────────────────────────── */}
      <div className="pointer-events-none fixed left-0 top-0 z-30 max-w-sm p-5 sm:p-7">
        <h1 className="font-semibold text-2xl tracking-tight text-foreground sm:text-3xl">
          Light Tunnel
        </h1>
        <p className="mt-2 text-base leading-relaxed text-foreground">
          Tilt your phone to steer down a tunnel of living line-art toward a
          being of light. Lean in to fall faster; hold still to drift.
        </p>

        <div className="pointer-events-auto mt-4 flex flex-wrap items-center gap-2.5">
          {phase === "idle" && (
            <button
              onClick={handleBegin}
              className="min-h-[44px] rounded-full bg-muted px-6 py-2.5 text-base font-medium text-black transition hover:bg-card"
            >
              Begin
            </button>
          )}
        </div>

        {phase === "idle" && (
          <p className="mt-3 font-mono text-sm text-muted-foreground">
            tap Begin — sound + the descent start together
          </p>
        )}
        {phase === "running" && mode === "tilt" && (
          <p className="mt-3 font-mono text-sm text-muted-foreground">
            tilt to steer · lean to accelerate toward the light
          </p>
        )}
        {phase === "running" && mode !== "tilt" && (
          <p className="mt-3 font-mono text-sm text-violet-300">
            {permDenied
              ? "motion access denied — drag to steer the tunnel"
              : "no tilt sensor — drag across the field to steer"}
          </p>
        )}
      </div>

      {/* ── Design notes trigger + overlay ────────────────────────────────── */}
      <button
        onClick={() => setNotesOpen(true)}
        className="fixed right-4 top-4 z-30 min-h-[44px] rounded-full border border-border bg-black/40 px-4 py-2.5 font-mono text-sm text-muted-foreground backdrop-blur transition hover:bg-black/60 hover:text-foreground"
      >
        Design notes
      </button>

      {notesOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-5 backdrop-blur-sm">
          <div className="max-h-[85vh] max-w-lg overflow-y-auto rounded-2xl border border-border bg-[#080b16] p-6 text-foreground shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <h2 className="font-semibold text-2xl text-foreground">Light Tunnel</h2>
              <button
                onClick={() => setNotesOpen(false)}
                className="min-h-[44px] rounded-full border border-border px-4 py-2.5 font-mono text-sm text-muted-foreground transition hover:text-foreground"
              >
                close
              </button>
            </div>
            <p className="mt-4 text-base leading-relaxed">
              The near-death tunnel-toward-light rendered entirely as living{" "}
              <span className="text-foreground">vector line-art</span> — ~90
              concentric <span className="font-mono">&lt;circle&gt;</span> rings
              and a faint radial vector-field of{" "}
              <span className="font-mono">&lt;line&gt;</span> spokes, all inline
              SVG DOM. No canvas, no WebGL: the render loop mutates each element&apos;s{" "}
              <span className="font-mono">r / cx / cy / stroke / opacity</span> in
              place every frame, so the mark count never changes.
            </p>
            <p className="mt-3 text-base leading-relaxed">
              Rings recede on a log-polar depth so travel feels constant; far
              rings converge on the vanishing point while near rings center on
              the frame, so the tunnel <em>bends</em> toward wherever you steer.
              A hypoxic vignette constricts toward the luminous core and a warm
              radial bloom grows as you approach — a slow luminance change kept
              under 3&nbsp;Hz, never a strobe.
            </p>
            <p className="mt-3 text-base leading-relaxed">
              Sound is a slow <span className="text-foreground">Shepard–Risset
              ascent</span> (the endless-rising illusion) over a warm
              just-intonation drone inside a synthetic convolution void. Your
              approach speed opens a low-pass and lifts the brightness toward the
              being-of-light moment; a ~0.1&nbsp;Hz breath swell breathes over it
              all. Master stays ≤0.2 behind a limiter.
            </p>
            <p className="mt-3 text-base leading-relaxed text-muted-foreground">
              In the lineage of <span className="text-foreground">Ryoji Ikeda</span>{" "}
              (data / line minimalism) and{" "}
              <span className="text-foreground">Zach Lieberman</span> (generative
              vector poetry) — both living.
            </p>
            <p className="mt-3 text-base leading-relaxed text-muted-foreground">
              Steered by device tilt; degrades to pointer-drag on desktop or when
              motion access is denied. Honors reduced-motion by slowing the
              approach and softening contrast.
            </p>
          </div>
        </div>
      )}

      <PrototypeNav slugs={["1344-light-tunnel"]} />
    </main>
  );
}
