"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import { prefersReducedMotion } from "../_shared/psych/safeFlicker";
import { makeOrganAudio, type OrganAudio } from "./audio";
import {
  applyIso,
  buildTiling,
  geodesicInterior,
  IDENTITY,
  mul,
  normalize,
  rotate,
  translate,
  type C,
  type Iso,
  type Tile,
} from "./mobius";

// {p,q} Poincaré tiling. {8,3} echoes Escher's Circle Limit III lineage.
const P = 8;
const Q = 3;
const MAX_TILES = 130;
const EDGE_SAMPLES = 5;
const BASE_HZ = 130.81; // C3

interface Move {
  kind: "trans" | "rot";
  phi: number; // translation direction (disk coords)
  sign: number; // rotation sign
  ratio: number; // just-intonation interval
  label: string;
}

// Home-row + arrows are the generators of the tiling's symmetry group.
const MOVES: Record<string, Move> = {
  ArrowRight: { kind: "trans", phi: 0, sign: 0, ratio: 3 / 2, label: "fifth · 3:2" },
  KeyD: { kind: "trans", phi: 0, sign: 0, ratio: 3 / 2, label: "fifth · 3:2" },
  ArrowLeft: { kind: "trans", phi: Math.PI, sign: 0, ratio: 4 / 3, label: "fourth · 4:3" },
  KeyA: { kind: "trans", phi: Math.PI, sign: 0, ratio: 4 / 3, label: "fourth · 4:3" },
  ArrowUp: { kind: "trans", phi: -Math.PI / 2, sign: 0, ratio: 5 / 4, label: "major third · 5:4" },
  KeyW: { kind: "trans", phi: -Math.PI / 2, sign: 0, ratio: 5 / 4, label: "major third · 5:4" },
  ArrowDown: { kind: "trans", phi: Math.PI / 2, sign: 0, ratio: 6 / 5, label: "minor third · 6:5" },
  KeyS: { kind: "trans", phi: Math.PI / 2, sign: 0, ratio: 6 / 5, label: "minor third · 6:5" },
  KeyE: { kind: "rot", phi: 0, sign: -1, ratio: 9 / 8, label: "whole tone · 9:8" },
  KeyQ: { kind: "rot", phi: 0, sign: 1, ratio: 5 / 3, label: "major sixth · 5:3" },
};

const SVGNS = "http://www.w3.org/2000/svg";

function foldOctave(r: number): number {
  let x = r;
  while (x >= 2) x /= 2;
  while (x < 1) x *= 2;
  return x;
}

interface Velocity {
  vx: number;
  vy: number;
  vr: number;
}

export default function HyperbolicOrganPage() {
  const [started, setStarted] = useState(false);
  const [note, setNote] = useState<string>("");

  const svgRef = useRef<SVGSVGElement | null>(null);
  const groupRef = useRef<SVGGElement | null>(null);
  const boundaryRef = useRef<SVGCircleElement | null>(null);
  const pathsRef = useRef<{ el: SVGPathElement; tile: Tile }[]>([]);

  const acRef = useRef<AudioContext | null>(null);
  const audioRef = useRef<OrganAudio | null>(null);
  const playingRef = useRef(false);
  const rafRef = useRef(0);

  const viewRef = useRef<Iso>(IDENTITY);
  const velRef = useRef<Velocity>({ vx: 0, vy: 0, vr: 0 });
  const heldRef = useRef<Map<string, number>>(new Map());
  const ratioRef = useRef(1);
  const pulseRef = useRef(0);
  const driftAngleRef = useRef(0.3);
  const sizeRef = useRef({ w: 1, h: 1 });
  const lastRef = useRef(0);
  const timeRef = useRef(0);
  const reducedRef = useRef(false);

  const handleBegin = useCallback(async () => {
    if (playingRef.current) return;
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ac = new Ctor();
    await ac.resume();
    acRef.current = ac;
    audioRef.current = makeOrganAudio(ac, 0.18);
    playingRef.current = true;
    setStarted(true);
    svgRef.current?.focus();
  }, []);

  useEffect(() => {
    reducedRef.current = prefersReducedMotion();
    const tiles = buildTiling(P, Q, MAX_TILES);
    const group = groupRef.current;
    if (!group) return;

    // One <path> per tile, updated imperatively each frame (never via React).
    const paths: { el: SVGPathElement; tile: Tile }[] = [];
    for (const tile of tiles) {
      const el = document.createElementNS(SVGNS, "path");
      el.setAttribute("stroke-linejoin", "round");
      group.appendChild(el);
      paths.push({ el, tile });
    }
    // Draw deeper tiles first so the central jewels sit on top.
    paths.sort((a, b) => b.tile.depth - a.tile.depth);
    pathsRef.current = paths;

    const resize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      sizeRef.current = { w, h };
      const svg = svgRef.current;
      if (svg) svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
      const R = Math.min(w, h) * 0.47;
      const circle = boundaryRef.current;
      if (circle) {
        circle.setAttribute("cx", `${w / 2}`);
        circle.setAttribute("cy", `${h / 2}`);
        circle.setAttribute("r", `${R}`);
      }
    };
    resize();

    const applyStep = (code: string) => {
      const m = MOVES[code];
      if (!m) return;
      ratioRef.current = foldOctave(ratioRef.current * m.ratio);
      const rootHz = BASE_HZ * ratioRef.current;
      audioRef.current?.setRoot(rootHz);
      audioRef.current?.ring(rootHz * 2, 0.45);
      pulseRef.current = Math.min(1, pulseRef.current + 0.85);
      setNote(m.label);
    };

    const drawFrame = () => {
      const now = performance.now();
      let dt = (now - lastRef.current) / 1000;
      lastRef.current = now;
      if (!Number.isFinite(dt) || dt < 0) dt = 0;
      dt = Math.min(0.05, dt);
      timeRef.current += dt;
      const t = timeRef.current;

      const reduced = reducedRef.current;
      const held = heldRef.current;
      const vel = velRef.current;

      // Decay user velocity toward rest.
      const decay = Math.exp(-dt / 0.42);
      vel.vx *= decay;
      vel.vy *= decay;
      vel.vr *= decay;

      // Held keys inject velocity and, on a throttle, ring the next interval.
      const accel = reduced ? 0.18 : 0.55;
      const stepEvery = 0.34;
      for (const [code, timer] of held) {
        const m = MOVES[code];
        if (!m) continue;
        if (m.kind === "trans") {
          vel.vx += Math.cos(m.phi) * accel * dt;
          vel.vy += Math.sin(m.phi) * accel * dt;
        } else {
          vel.vr += m.sign * accel * 2.4 * dt;
        }
        const nt = timer + dt;
        if (nt >= stepEvery) {
          applyStep(code);
          held.set(code, nt - stepEvery);
        } else {
          held.set(code, nt);
        }
      }

      // Clamp translation speed so no single Möbius step is violent.
      const maxV = reduced ? 0.25 : 0.9;
      const sp = Math.hypot(vel.vx, vel.vy);
      if (sp > maxV) {
        vel.vx = (vel.vx / sp) * maxV;
        vel.vy = (vel.vy / sp) * maxV;
      }

      // Gentle idle pan — always present so the screen is never static/blank.
      const driftSpeed = reduced ? 0.008 : 0.05;
      driftAngleRef.current += dt * 0.05;
      const ix = Math.cos(driftAngleRef.current) * driftSpeed;
      const iy = Math.sin(driftAngleRef.current) * driftSpeed;

      const tx = (vel.vx + ix) * dt;
      const ty = (vel.vy + iy) * dt;
      let s = Math.hypot(tx, ty);
      s = Math.min(0.06, s);
      const phi = Math.atan2(ty, tx);
      const rotStep = vel.vr * dt;

      const g = mul(rotate(rotStep), translate(s, phi));
      viewRef.current = normalize(mul(g, viewRef.current));
      const V = viewRef.current;

      // Pulse envelope (a soft luminance swell per note, never a strobe).
      pulseRef.current *= Math.exp(-dt / 0.5);
      const pulse = pulseRef.current;

      const { w, h } = sizeRef.current;
      const cx = w / 2;
      const cy = h / 2;
      const Rpx = Math.min(w, h) * 0.47;

      for (const { el, tile } of pathsRef.current) {
        // Transform this tile's vertices by the current view isometry.
        const tv: C[] = tile.verts.map((z) => applyIso(V, z));
        let maxR = 0;
        for (const v of tv) maxR = Math.max(maxR, Math.hypot(v[0], v[1]));
        if (maxR > 0.999) {
          el.setAttribute("d", "");
          continue;
        }

        const toPx = (z: C) => `${(cx + z[0] * Rpx).toFixed(1)} ${(cy + z[1] * Rpx).toFixed(1)}`;
        let d = `M ${toPx(tv[0])}`;
        for (let i = 0; i < tv.length; i++) {
          const a = tv[i];
          const b = tv[(i + 1) % tv.length];
          for (const mid of geodesicInterior(a, b, EDGE_SAMPLES)) d += ` L ${toPx(mid)}`;
          d += ` L ${toPx(b)}`;
        }
        d += " Z";
        el.setAttribute("d", d);

        const rad = Math.hypot(
          tv.reduce((s2, v) => s2 + v[0], 0) / tv.length,
          tv.reduce((s2, v) => s2 + v[1], 0) / tv.length,
        );
        const fade = Math.max(0.05, 1 - Math.pow(rad, 3));
        const hue = 262 + 34 * Math.sin(tile.depth * 0.55 + t * 0.22);
        const fillL = 11 + 6 * Math.sin(tile.depth * 0.9 - t * 0.3) + pulse * 12;
        const strokeL = 58 + pulse * 22;
        el.setAttribute("fill", `hsl(${hue.toFixed(0)} 66% ${fillL.toFixed(0)}%)`);
        el.setAttribute("fill-opacity", (0.5 * fade).toFixed(3));
        el.setAttribute("stroke", `hsl(${hue.toFixed(0)} 92% ${strokeL.toFixed(0)}%)`);
        el.setAttribute("stroke-opacity", (0.85 * fade).toFixed(3));
        el.setAttribute("stroke-width", (0.9 + pulse * 0.7).toFixed(2));
      }

      const circle = boundaryRef.current;
      if (circle) circle.setAttribute("stroke-opacity", (0.35 + pulse * 0.4).toFixed(3));

      rafRef.current = requestAnimationFrame(drawFrame);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (!playingRef.current) return;
      const m = MOVES[e.code];
      if (!m) return;
      e.preventDefault();
      if (!heldRef.current.has(e.code)) {
        heldRef.current.set(e.code, 0);
        applyStep(e.code); // immediate note on the initial press
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      heldRef.current.delete(e.code);
    };

    lastRef.current = performance.now();
    rafRef.current = requestAnimationFrame(drawFrame);
    window.addEventListener("resize", resize);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      audioRef.current?.stop();
      audioRef.current = null;
      const ac = acRef.current;
      if (ac && ac.state !== "closed") {
        window.setTimeout(() => {
          if (ac.state !== "closed") void ac.close();
        }, 600);
      }
      acRef.current = null;
      for (const { el } of pathsRef.current) el.remove();
      pathsRef.current = [];
    };
  }, []);

  return (
    <main className="relative min-h-screen overflow-hidden bg-background text-foreground">
      <svg
        ref={svgRef}
        tabIndex={0}
        className="fixed inset-0 h-full w-full outline-none"
        style={{ background: "radial-gradient(circle at 50% 48%, #150c26 0%, #05030a 62%, #000 100%)" }}
        aria-label="Poincaré-disk hyperbolic tiling"
      >
        <circle
          ref={boundaryRef}
          fill="none"
          stroke="#a78bfa"
          strokeWidth={1.4}
          strokeOpacity={0.35}
        />
        <g ref={groupRef} />
      </svg>

      <div className="pointer-events-none fixed left-0 top-0 z-30 max-w-md p-5 sm:p-7">
        <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
          Hyperbolic Organ
        </h1>
        <p className="mt-2 text-base leading-relaxed text-foreground">
          Play a negatively-curved universe: an Escher-style {"{8,3}"} tiling in the
          Poincaré disk that you translate and spin with the keys — each hyperbolic move
          rings one just-intonation interval and shifts the drone.
        </p>

        {!started && (
          <button
            onClick={handleBegin}
            className="pointer-events-auto mt-4 min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Play
          </button>
        )}

        {started && (
          <div className="mt-4 space-y-2">
            <p className="font-mono text-sm text-primary">
              W A S D / arrows — translate · Q E — spin{note ? ` · ${note}` : ""}
            </p>
            <p className="text-sm text-muted-foreground">
              Hold a key to stream the lattice outward; each step walks one interval of a
              just-intonation pitch lattice.
            </p>
          </div>
        )}

        {!started && (
          <p className="mt-3 font-mono text-sm text-muted-foreground">
            the disk drifts on its own · press Play to unlock sound and the keys
          </p>
        )}

        <details className="pointer-events-auto mt-4 max-w-sm text-sm text-muted-foreground">
          <summary className="cursor-pointer text-primary hover:text-primary/80">
            Read the design notes
          </summary>
          <div className="mt-2 space-y-2 leading-relaxed">
            <p>
              Every visible cell is a copy of one central {P}-gon, mapped out to the rim by a
              Fuchsian reflection group — geodesic edges are arcs of circles orthogonal to the
              boundary. Your keys compose Möbius isometries of the disk (SU(1,1)); the drifting
              lattice is those isometries streaming.
            </p>
            <p>
              After M.C. Escher&rsquo;s <span className="italic">Circle Limit III</span> (1959),
              the Poincaré disk model, and H.S.M. Coxeter. This is the SVG, keyboard-played
              inversion of the lab&rsquo;s <span className="font-mono">1044-hyperbolic-bloom</span>
              (a mic-driven WebGL bloom of the same tiling). See{" "}
              <span className="font-mono">README.md</span>.
            </p>
          </div>
        </details>
      </div>

      <PrototypeNav slugs={["1530-hyperbolic-organ"]} />
    </main>
  );
}
