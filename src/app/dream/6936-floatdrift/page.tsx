"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { startDroneBank, type DroneBank } from "../_shared/psych/droneBank";
import { prefersReducedMotion } from "../_shared/psych/safeFlicker";
import { VIOLET, MAGENTA } from "../_shared/palette";
import {
  mulberry32,
  smoothstep,
  clamp,
  cobwebPath,
  spiralPath,
  latticePath,
  makePhosphenes,
  type Phosphene,
} from "./field";

// canvas is a fixed 1000×1000 viewBox; the SVG scales to fit
const VB = 1000;
const CX = VB / 2;
const CY = VB / 2;
const R = 460;
const IDLE_MS = 2600; // no real input for this long → seeded auto-drift takes over
const SVGNS = "http://www.w3.org/2000/svg";

type OrientCtor = typeof DeviceOrientationEvent & {
  requestPermission?: () => Promise<"granted" | "denied">;
};
type MotionCtor = typeof DeviceMotionEvent & {
  requestPermission?: () => Promise<"granted" | "denied">;
};
type WebAudioWindow = Window & { webkitAudioContext?: typeof AudioContext };

export default function FloatDriftPage() {
  const svgRef = useRef<SVGSVGElement>(null);
  const rafRef = useRef<number>(0);

  const [started, setStarted] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [sensorMode, setSensorMode] = useState<"auto" | "tilt" | "pointer">("auto");

  // audio
  const ctxRef = useRef<AudioContext | null>(null);
  const droneRef = useRef<DroneBank | null>(null);

  // hot-loop state (never React state per frame)
  const stillnessRef = useRef(0.35); // smoothed 0..1 imagery-vividness dial
  const motionEnergyRef = useRef(0); // decays each frame; spikes on movement
  const gravRef = useRef({ x: 0, y: 0 }); // steer vector, +y = screen-down
  const lastInputRef = useRef(-99999); // performance.now() of last REAL input
  const reducedRef = useRef(false);
  const startedRef = useRef(false);
  const sensorModeRef = useRef<"auto" | "tilt" | "pointer">("auto");

  // pointer velocity tracking (desktop fallback for "motion")
  const ptrRef = useRef({ x: 0, y: 0, t: 0, has: false });

  // persistent SVG element pool (built once)
  const scene = useRef<{
    cobweb: SVGPathElement;
    spiralA: SVGPathElement;
    lattice: SVGPathElement;
    latticeG: SVGGElement;
    dots: SVGCircleElement[];
    phos: Phosphene[];
    latticeD: string;
    built: boolean;
  } | null>(null);

  const setMode = useCallback((m: "auto" | "tilt" | "pointer") => {
    if (sensorModeRef.current !== m) {
      sensorModeRef.current = m;
      setSensorMode(m);
    }
  }, []);

  // ── build the persistent SVG scene once ────────────────────────────────────
  const buildScene = useCallback(() => {
    const svg = svgRef.current;
    if (!svg || scene.current?.built) return;
    const rng = mulberry32(0x6936);

    const mkPath = (stroke: string, w: number, op: number): SVGPathElement => {
      const p = document.createElementNS(SVGNS, "path");
      p.setAttribute("fill", "none");
      p.setAttribute("stroke", stroke);
      p.setAttribute("stroke-width", String(w));
      p.setAttribute("stroke-linejoin", "round");
      p.setAttribute("stroke-linecap", "round");
      p.setAttribute("opacity", String(op));
      return p;
    };

    // lattice sits deepest (static geometry, group is rotated + faded)
    const latticeG = document.createElementNS(SVGNS, "g");
    const lattice = mkPath(VIOLET[600], 1, 0);
    const latticeD = latticePath(CX, CY, R, reducedRef.current ? 74 : 58);
    lattice.setAttribute("d", latticeD);
    latticeG.appendChild(lattice);

    const spiralA = mkPath(MAGENTA, 1.4, 0);
    const cobweb = mkPath(VIOLET[300], 1.2, 0);

    svg.appendChild(latticeG);
    svg.appendChild(spiralA);
    svg.appendChild(cobweb);

    // drifting phosphene points on top
    const nDots = reducedRef.current ? 46 : 84;
    const phos = makePhosphenes(nDots, R, rng);
    const dots: SVGCircleElement[] = [];
    for (let i = 0; i < nDots; i++) {
      const c = document.createElementNS(SVGNS, "circle");
      c.setAttribute("fill", i % 5 === 0 ? VIOLET[200] : VIOLET[400]);
      c.setAttribute("r", String(phos[i].r));
      svg.appendChild(c);
      dots.push(c);
    }

    scene.current = { cobweb, spiralA, lattice, latticeG, dots, phos, latticeD, built: true };
  }, []);

  // ── the render + auto-drift loop (runs on mount, before any permission) ─────
  const runLoop = useCallback(() => {
    buildScene();
    let last = performance.now();

    const frame = () => {
      rafRef.current = requestAnimationFrame(frame);
      const now = performance.now();
      let dt = (now - last) / 1000;
      last = now;
      if (dt > 0.1) dt = 0.1; // guard tab-switch jumps
      const tSec = now / 1000;
      const reduced = reducedRef.current;
      const s = scene.current;
      if (!s) return;

      // 1 ── decide target stillness + steer vector
      const idle = now - lastInputRef.current > IDLE_MS;
      let targetStill: number;
      if (idle) {
        // seeded slow breathing: sinks into stillness, then a gentle stir
        setMode("auto");
        const breath = 0.62 + 0.34 * Math.sin(tSec * 0.11) * Math.cos(tSec * 0.047);
        targetStill = clamp(breath, 0.12, 0.97);
        // slowly rotating "down"
        const ga = tSec * 0.06;
        gravRef.current.x = Math.cos(ga) * 0.6;
        gravRef.current.y = Math.sin(ga * 0.8) * 0.6 + 0.15;
      } else {
        // real input: stillness is the inverse of recent motion energy
        motionEnergyRef.current *= Math.pow(0.06, dt); // decay toward calm
        const e = motionEnergyRef.current;
        targetStill = 1 - smoothstep(0.04, 1.1, e);
      }

      // 2 ── ease stillness slowly (imagery blooms/scatters gently, well under 3 Hz)
      const rate = reduced ? 0.35 : 0.7;
      stillnessRef.current += (targetStill - stillnessRef.current) * clamp(dt * rate, 0, 1);
      const S = stillnessRef.current;

      // steered, breathing center — the void has a subtle "down"
      const gx = gravRef.current.x;
      const gy = gravRef.current.y;
      const cx = CX + gx * 34;
      const cy = CY + gy * 34;

      // 3 ── cobweb: count + coherence grow with stillness
      const rotBase = reduced ? tSec * 0.008 : tSec * 0.018;
      const spokes = 6 + Math.floor(S * 12);
      const rings = 3 + Math.floor(S * 7);
      const webBloom = 0.85 + 0.15 * S;
      s.cobweb.setAttribute(
        "d",
        cobwebPath(cx, cy, R * webBloom, spokes, rings, rotBase),
      );
      s.cobweb.setAttribute("opacity", (smoothstep(0.16, 0.55, S) * 0.72).toFixed(3));

      // 4 ── spiral: emerges mid-high stillness, counter-rotating
      const arms = S > 0.66 ? 3 : 2;
      const turns = 2.0 + S * 1.4;
      s.spiralA.setAttribute(
        "d",
        spiralPath(cx, cy, R * (0.6 + 0.3 * S), arms, turns, -rotBase * 1.6),
      );
      s.spiralA.setAttribute("opacity", (smoothstep(0.42, 0.82, S) * 0.6).toFixed(3));

      // 5 ── lattice: only at deep stillness; slow rotation via group transform
      const latRot = ((reduced ? tSec * 0.003 : tSec * 0.007) * 180) / Math.PI;
      const latScale = 0.96 + 0.06 * S;
      s.latticeG.setAttribute(
        "transform",
        `rotate(${latRot.toFixed(2)} ${cx} ${cy}) translate(${(cx - CX).toFixed(1)} ${(cy - CY).toFixed(1)}) scale(${latScale.toFixed(3)})`,
      );
      s.lattice.setAttribute("opacity", (smoothstep(0.58, 0.95, S) * 0.4).toFixed(3));

      // 6 ── phosphene points: always drift; pulled by gravity; brighter when still
      const driftScale = reduced ? 0.5 : 1;
      const dotOp = (0.35 + 0.5 * (1 - S)).toFixed(3); // sparse look fades as web fills
      for (let i = 0; i < s.dots.length; i++) {
        const p = s.phos[i];
        p.x += (p.vx + gx * 12) * dt * driftScale;
        p.y += (p.vy + gy * 12 + gy * 4) * dt * driftScale;
        const dist = Math.hypot(p.x, p.y);
        if (dist > R) {
          // respawn near center, opposite side — a slow recirculation
          const a = Math.atan2(p.y, p.x) + Math.PI;
          const rad = R * 0.12;
          p.x = Math.cos(a) * rad;
          p.y = Math.sin(a) * rad;
        }
        // gentle per-point breathing radius
        const rr = p.r * (0.7 + 0.3 * Math.sin(tSec * 0.5 + p.seed) + 0.25 * S);
        const c = s.dots[i];
        c.setAttribute("cx", (cx + p.x).toFixed(1));
        c.setAttribute("cy", (cy + p.y).toFixed(1));
        c.setAttribute("r", Math.max(0.4, rr).toFixed(2));
        c.setAttribute("opacity", dotOp);
      }

      // 7 ── drone swells with imagery density
      droneRef.current?.setDrive(clamp(S * 0.9 + 0.05, 0, 1));
    };
    rafRef.current = requestAnimationFrame(frame);
  }, [buildScene, setMode]);

  // reduced-motion probe (before scene build)
  useEffect(() => {
    reducedRef.current = prefersReducedMotion();
  }, []);

  // start the VISUAL loop on mount — alive-on-load via seeded auto-drift
  useEffect(() => {
    runLoop();
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [runLoop]);

  // ── device motion: the primary stillness sensor ────────────────────────────
  useEffect(() => {
    let lastAcc: { x: number; y: number; z: number } | null = null;
    const onMotion = (e: DeviceMotionEvent) => {
      const a = e.accelerationIncludingGravity;
      if (!a || a.x == null || a.y == null || a.z == null) return;
      lastInputRef.current = performance.now();
      setMode("tilt");
      if (lastAcc) {
        const jerk =
          Math.abs(a.x - lastAcc.x) +
          Math.abs(a.y - lastAcc.y) +
          Math.abs(a.z - lastAcc.z);
        motionEnergyRef.current = Math.min(4, motionEnergyRef.current + jerk * 0.4);
      }
      lastAcc = { x: a.x, y: a.y, z: a.z };
    };
    window.addEventListener("devicemotion", onMotion);
    return () => window.removeEventListener("devicemotion", onMotion);
  }, [setMode]);

  // ── device orientation: the gravity/steer vector from tilt ─────────────────
  useEffect(() => {
    const onOrient = (e: DeviceOrientationEvent) => {
      if (e.gamma == null || e.beta == null) return;
      lastInputRef.current = performance.now();
      setMode("tilt");
      const gx = clamp(Math.sin((e.gamma * Math.PI) / 180) * 1.6, -1, 1);
      const gy = clamp(Math.sin((e.beta * Math.PI) / 180) * 1.2, -1, 1);
      // ease so the "down" never snaps
      gravRef.current.x += (gx - gravRef.current.x) * 0.1;
      gravRef.current.y += (gy - gravRef.current.y) * 0.1;
    };
    window.addEventListener("deviceorientation", onOrient);
    return () => window.removeEventListener("deviceorientation", onOrient);
  }, [setMode]);

  // ── pointer fallback: position = tilt, speed = motion (desktop) ─────────────
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const now = performance.now();
      lastInputRef.current = now;
      const nx = (e.clientX / window.innerWidth) * 2 - 1;
      const ny = (e.clientY / window.innerHeight) * 2 - 1;
      const prev = ptrRef.current;
      if (prev.has) {
        const dtp = Math.max(0.001, (now - prev.t) / 1000);
        const speed = (Math.abs(e.clientX - prev.x) + Math.abs(e.clientY - prev.y)) / dtp;
        motionEnergyRef.current = Math.min(4, motionEnergyRef.current + speed * 0.002);
        // only claim pointer mode if the device sensor isn't the active source
        if (sensorModeRef.current !== "tilt") setMode("pointer");
      }
      // steer toward the cursor — a mouse-driven "down"
      gravRef.current.x += (nx - gravRef.current.x) * 0.08;
      gravRef.current.y += (ny - gravRef.current.y) * 0.08;
      ptrRef.current = { x: e.clientX, y: e.clientY, t: now, has: true };
    };
    window.addEventListener("pointermove", onMove);
    return () => window.removeEventListener("pointermove", onMove);
  }, [setMode]);

  // ── audio teardown on unmount ──────────────────────────────────────────────
  useEffect(() => {
    return () => {
      droneRef.current?.stop();
      droneRef.current = null;
      const ctx = ctxRef.current;
      if (ctx && ctx.state !== "closed") {
        window.setTimeout(() => {
          ctx.close().catch(() => {});
        }, 800);
      }
      ctxRef.current = null;
    };
  }, []);

  // ── boot audio + request sensor permission (must be a user gesture) ─────────
  const boot = useCallback(async () => {
    if (startedRef.current) return;
    startedRef.current = true;
    setStarted(true);

    try {
      const AC =
        window.AudioContext || (window as WebAudioWindow).webkitAudioContext;
      if (!AC) {
        setNotice("This browser has no Web Audio — the void stays silent, but keeps drifting.");
      } else {
        const ctx = new AC();
        await ctx.resume().catch(() => {});
        ctxRef.current = ctx;
        // low just-intonation drone bed, swelled by imagery density each frame
        droneRef.current = startDroneBank(ctx, ctx.destination, {
          root: 48.4,
          ratios: [1, 3 / 2, 2, 9 / 4, 3],
          peakGain: 0.26,
        });
      }
    } catch {
      setNotice("Audio could not start, but the void keeps drifting.");
    }

    // iOS 13+ needs an explicit permission request from within the gesture
    const O = (typeof window !== "undefined"
      ? (window.DeviceOrientationEvent as OrientCtor | undefined)
      : undefined);
    const M = (typeof window !== "undefined"
      ? (window.DeviceMotionEvent as MotionCtor | undefined)
      : undefined);
    try {
      if (O?.requestPermission) {
        const p = await O.requestPermission();
        if (p !== "granted") setMode("pointer");
      }
      if (M?.requestPermission) {
        await M.requestPermission();
      }
    } catch {
      // no sensor / denied — pointer + auto-drift carry the piece
    }
  }, [setMode]);

  const modeLabel =
    sensorMode === "tilt"
      ? "device motion · hold still to let the field bloom"
      : sensorMode === "pointer"
        ? "pointer steers the drift · rest the cursor to let it bloom"
        : "drifting on its own — start, then hold still";

  return (
    <main className="relative h-[100dvh] w-full overflow-hidden bg-background text-foreground">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${VB} ${VB}`}
        preserveAspectRatio="xMidYMid slice"
        className="absolute inset-0 h-full w-full touch-none"
        style={{ background: VIOLET[950] }}
        aria-hidden="true"
      />

      {/* chrome */}
      <Link
        href="/dream"
        className="absolute left-4 top-4 z-30 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        ← dream lab
      </Link>
      <button
        onClick={() => setShowNotes((v) => !v)}
        className="absolute right-4 top-4 z-30 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:text-foreground"
      >
        Design notes
      </button>

      {/* hero / start */}
      {!started && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-5 px-6 text-center">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            6936 · sensory-deprivation entoptics
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            Float Drift
          </h1>
          <p className="max-w-xl text-base leading-relaxed text-muted-foreground">
            A weightless dark void. The stiller you hold your phone, the more the
            drug-free entoptic geometry — cobwebs, spirals, faint lattices — blooms
            and organizes; move, and it scatters back to drifting points.
          </p>
          <button
            onClick={() => void boot()}
            className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Enter the float
          </button>
          {notice && <p className="max-w-md text-sm text-destructive">{notice}</p>}
          <p className="text-sm text-muted-foreground">
            It is already drifting behind this card — sound joins when you start.
          </p>
        </div>
      )}

      {/* running HUD */}
      {started && (
        <div className="pointer-events-none absolute inset-x-0 bottom-6 z-20 flex justify-center px-6">
          <p className="max-w-[80vw] text-center font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            {modeLabel}
          </p>
        </div>
      )}

      {/* design notes modal */}
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
              Float Drift — design notes
            </h2>
            <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                The one question: what if stilling your phone — a pocket float
                tank — let drug-free entoptic imagery bloom the quieter you get?
              </p>
              <p>
                A running <span className="text-foreground">stillness</span> scalar
                is the inverse of recent motion energy (device-motion jerk, or
                pointer speed on desktop). It eases slowly, so imagery blooms and
                scatters as a gentle drift — never a strobe. That one dial gates
                three overlaid Klüver form-constants rendered as vector SVG: a
                radial <span className="text-foreground">cobweb</span>, a
                logarithmic <span className="text-foreground">spiral</span>, and a
                honeycomb <span className="text-foreground">lattice</span>, each
                fading in and gaining coherence as you settle. Device tilt supplies
                a gravity vector so the void has a subtle &ldquo;down.&rdquo;
              </p>
              <p>
                The just-intonation drone bed swells with imagery density. Nothing
                here is a drug analogue — it is the phenomenology of Flotation-REST
                and hypnagogia, where reduced sensory input lets endogenous
                geometry surface.
              </p>
              <p className="text-foreground">
                References: Klüver, <em>Mescal &amp; Mechanisms of Hallucinations</em>{" "}
                form-constants (1926); Kraehenmann et al. on flotation-REST;
                &ldquo;Hypnagogia, psychedelics, and sensory deprivation: the mythic
                structure of dream-like experiences&rdquo; (2025 review).
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
