"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { CommaOrganAudio } from "./audio";
import {
  KEYS,
  PROGRESSION,
  SYNTONIC_COMMA,
  commaOffset,
  equalFreq,
  latticeFreq,
  mulberry32,
  pitchClass,
  placeChord,
  rawCents,
  stepDrift,
  type Chord,
  type PlacedChord,
  type Vec,
} from "./lattice";

/* --------------------------- constants / geometry -------------------------- */

const BASE_HZ = 261.63; // C4
const STEP = 66; // lattice cell spacing (px)
const AUTO_MS = 2600; // hands-free step interval
const AUTO_MS_REDUCED = 4200; // slower when reduced-motion
const PC_NAMES = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];
const TRAIL_MAX = 22;

const nodeX = (a: number, b: number) => a * STEP + b * STEP * 0.5;
const nodeY = (a: number, b: number) => -b * STEP * 0.87;

type Phase = "idle" | "running" | "nosound";

interface Snap {
  placed: PlacedChord;
  drift: number;
  steps: number;
  trail: Vec[];
}

const FIRST: PlacedChord = placeChord(null, PROGRESSION[0]);

/* -------------------------- deterministic star field ----------------------- */

function buildStars() {
  const rnd = mulberry32(0x6728);
  const out: { x: number; y: number; r: number; o: number }[] = [];
  for (let i = 0; i < 64; i++) {
    out.push({
      x: (rnd() * 2 - 1) * 1700,
      y: (rnd() * 2 - 1) * 1050,
      r: 1 + rnd() * 2.4,
      o: 0.04 + rnd() * 0.1,
    });
  }
  return out;
}

/* ------------------------------ art-layer color ---------------------------- */

// Comma offset (cents) -> violet-family hue+light for the art layer only.
function driftColor(offCents: number, glow: boolean) {
  const mag = Math.min(Math.abs(offCents) / 24, 1);
  // flat (−) leans indigo, sharp (+) leans magenta; both within the violet range.
  const hue = 268 + Math.sign(offCents) * 26 * mag;
  const sat = glow ? 92 : 42 + mag * 30;
  const light = glow ? 68 : 30 + mag * 18;
  return `hsl(${hue} ${sat}% ${light}%)`;
}

/* ================================== page =================================== */

export default function CommaWalkPage() {
  const audioRef = useRef<CommaOrganAudio | null>(null);
  const rafRef = useRef<number | null>(null);
  const placedRef = useRef<PlacedChord>(FIRST);
  const driftRef = useRef(0);
  const stepsRef = useRef(0);
  const trailRef = useRef<Vec[]>([FIRST.root]);
  const progIdxRef = useRef(0);
  const lastStepRef = useRef(0);
  const heldRef = useRef<Map<string, number>>(new Map());
  const padRef = useRef<number[]>([]);
  const droneRef = useRef<number | null>(null);
  const adaptiveRef = useRef(true);
  const autoRef = useRef(true);
  const soundRef = useRef(false);

  const [phase, setPhase] = useState<Phase>("idle");
  const [adaptive, setAdaptive] = useState(true);
  const [autoplay, setAutoplay] = useState(true);
  const [pressed, setPressed] = useState<Set<string>>(new Set());
  const [snap, setSnap] = useState<Snap>({
    placed: FIRST,
    drift: 0,
    steps: 0,
    trail: [FIRST.root],
  });

  const stars = useMemo(buildStars, []);
  const reducedRef = useRef(false);

  /* ------------------------------ pad retune ------------------------------ */

  const retunePad = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const { cells } = placedRef.current;
    const drift = driftRef.current;
    const useJI = adaptiveRef.current;
    const driftMul = Math.pow(2, drift / 1200);
    for (let i = 0; i < 3; i++) {
      const [a, b] = cells[i] ?? cells[0];
      const freq = useJI
        ? latticeFreq(BASE_HZ, a, b) * driftMul
        : equalFreq(BASE_HZ, pitchClass(a, b));
      const id = padRef.current[i];
      if (id != null) audio.glide(id, freq);
    }
    if (droneRef.current != null) {
      const droneFreq = useJI ? (BASE_HZ / 2) * driftMul : BASE_HZ / 2;
      audio.glide(droneRef.current, droneFreq);
    }
  }, []);

  /* ------------------------------ walk a step ----------------------------- */

  const advance = useCallback(
    (chord: Chord) => {
      const prev = placedRef.current;
      const placed = placeChord(prev, chord);
      driftRef.current += stepDrift(prev.root, placed.root);
      placedRef.current = placed;
      trailRef.current = [...trailRef.current, placed.root].slice(-TRAIL_MAX);
      stepsRef.current += 1;
      setSnap({
        placed,
        drift: driftRef.current,
        steps: stepsRef.current,
        trail: trailRef.current,
      });
      if (soundRef.current) retunePad();
    },
    [retunePad],
  );

  const cycleNext = useCallback(() => {
    progIdxRef.current = (progIdxRef.current + 1) % PROGRESSION.length;
    advance(PROGRESSION[progIdxRef.current]);
  }, [advance]);

  const jumpTo = useCallback(
    (idx: number) => {
      progIdxRef.current = idx;
      advance(PROGRESSION[idx]);
    },
    [advance],
  );

  /* ------------------------------- home reset ----------------------------- */

  const teleportHome = useCallback(() => {
    placedRef.current = FIRST;
    driftRef.current = 0;
    stepsRef.current = 0;
    trailRef.current = [FIRST.root];
    progIdxRef.current = 0;
    setSnap({ placed: FIRST, drift: 0, steps: 0, trail: [FIRST.root] });
    if (soundRef.current) retunePad();
  }, [retunePad]);

  /* ------------------------------- keyboard ------------------------------- */

  const playKey = useCallback((code: string) => {
    const def = KEYS.find((k) => k.code === code);
    if (!def) return;
    setPressed((p) => {
      if (p.has(code)) return p;
      const n = new Set(p);
      n.add(code);
      return n;
    });
    const audio = audioRef.current;
    if (!audio || heldRef.current.has(code)) return;
    const [oa, ob] = def.offset;
    const freq = adaptiveRef.current
      ? latticeFreq(BASE_HZ, oa, ob) * Math.pow(2, driftRef.current / 1200)
      : equalFreq(BASE_HZ, pitchClass(oa, ob));
    const id = audio.noteOn(freq, 0.85);
    heldRef.current.set(code, id);
  }, []);

  const releaseKey = useCallback((code: string) => {
    setPressed((p) => {
      if (!p.has(code)) return p;
      const n = new Set(p);
      n.delete(code);
      return n;
    });
    const audio = audioRef.current;
    const id = heldRef.current.get(code);
    if (audio && id != null) audio.noteOff(id);
    heldRef.current.delete(code);
  }, []);

  /* --------------------------------- start -------------------------------- */

  const start = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.resume();
      return;
    }
    let audio: CommaOrganAudio;
    try {
      audio = new CommaOrganAudio();
    } catch {
      setPhase("nosound");
      return;
    }
    audioRef.current = audio;
    audio.resume();
    soundRef.current = true;
    // Build sustained pad + a low center drone that carries the audible drift.
    const { cells } = placedRef.current;
    const driftMul = Math.pow(2, driftRef.current / 1200);
    padRef.current = cells
      .slice(0, 3)
      .map(([a, b]) => audio.noteOn(latticeFreq(BASE_HZ, a, b) * driftMul, 0.6));
    droneRef.current = audio.noteOn((BASE_HZ / 2) * driftMul, 0.7);
    setPhase("running");
  }, []);

  /* ------------------------- lifecycle: rAF + events ---------------------- */

  useEffect(() => {
    adaptiveRef.current = adaptive;
    if (soundRef.current) retunePad();
  }, [adaptive, retunePad]);

  useEffect(() => {
    autoRef.current = autoplay;
  }, [autoplay]);

  useEffect(() => {
    reducedRef.current =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const code = e.key.toLowerCase();
      if (KEYS.some((k) => k.code === code)) {
        e.preventDefault();
        playKey(code);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => releaseKey(e.key.toLowerCase());
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    const held = heldRef.current;
    lastStepRef.current = performance.now();
    const loop = (t: number) => {
      const gap = reducedRef.current ? AUTO_MS_REDUCED : AUTO_MS;
      if (autoRef.current && t - lastStepRef.current >= gap) {
        lastStepRef.current = t;
        cycleNext();
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      held.clear();
      const audio = audioRef.current;
      audioRef.current = null;
      soundRef.current = false;
      if (audio) audio.dispose();
    };
  }, [cycleNext, playKey, releaseKey]);

  /* ------------------------------ derived view ---------------------------- */

  const root = snap.placed.root;
  const rx = nodeX(root[0], root[1]);
  const ry = nodeY(root[0], root[1]);

  // Visible lattice window around the current root (infinite-lattice illusion).
  const nodes = useMemo(() => {
    const cellSet = new Set(snap.placed.cells.map((c) => `${c[0]},${c[1]}`));
    const out: {
      a: number;
      b: number;
      key: string;
      glow: boolean;
      name: string;
      off: number;
    }[] = [];
    for (let a = root[0] - 7; a <= root[0] + 7; a++) {
      for (let b = root[1] - 4; b <= root[1] + 4; b++) {
        const k = `${a},${b}`;
        out.push({
          a,
          b,
          key: k,
          glow: cellSet.has(k),
          name: PC_NAMES[pitchClass(a, b)],
          off: commaOffset(a, b),
        });
      }
    }
    return out;
    // root[0]/root[1] captured via snap; recompute per step.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snap.placed, root[0], root[1]]);

  const drift = snap.drift;
  const commas = drift / SYNTONIC_COMMA;
  const taxicab = Math.abs(root[0]) + Math.abs(root[1]);
  const meter = Math.min(Math.abs(commas) / 4, 1);
  const homeAway = Math.hypot(rx, ry);

  const layerStyle: React.CSSProperties = {
    position: "absolute",
    left: "50%",
    top: "50%",
    transform: `translate3d(${-rx}px, ${-ry}px, 0)`,
    transition: "transform 1.15s cubic-bezier(0.4,0,0.2,1)",
    willChange: "transform",
  };

  /* --------------------------------- render ------------------------------- */

  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-background text-foreground">
      {/* ---------------------------- map viewport --------------------------- */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 90% at 50% 40%, hsl(268 40% 8%) 0%, hsl(270 45% 4%) 60%, #050308 100%)",
        }}
        aria-hidden
      >
        <div style={layerStyle}>
          {/* far star field (seeded) */}
          {stars.map((s, i) => (
            <span
              key={`s${i}`}
              style={{
                position: "absolute",
                left: s.x,
                top: s.y,
                width: s.r,
                height: s.r,
                borderRadius: "9999px",
                background: "#c4b5fd",
                opacity: s.o,
              }}
            />
          ))}

          {/* lattice edges via node backgrounds; nodes themselves */}
          {nodes.map((n) => {
            const x = nodeX(n.a, n.b);
            const y = nodeY(n.a, n.b);
            const isHome = n.a === 0 && n.b === 0;
            return (
              <span
                key={n.key}
                style={{
                  position: "absolute",
                  left: x,
                  top: y,
                  width: n.glow ? 46 : 34,
                  height: n.glow ? 46 : 34,
                  marginLeft: n.glow ? -23 : -17,
                  marginTop: n.glow ? -23 : -17,
                  borderRadius: "9999px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 11,
                  fontFamily: "var(--font-mono, monospace)",
                  color: n.glow ? "#0b0713" : "#d8d3ea",
                  fontWeight: n.glow ? 700 : 400,
                  background: n.glow
                    ? driftColor(n.off, true)
                    : `hsl(268 30% 12% / 0.9)`,
                  border: isHome
                    ? "2px solid #a78bfa"
                    : `1px solid ${driftColor(n.off, false)}`,
                  boxShadow: n.glow
                    ? `0 0 22px ${driftColor(n.off, true)}`
                    : "none",
                  transition: "all 0.9s cubic-bezier(0.4,0,0.2,1)",
                }}
              >
                {n.name}
                {isHome && (
                  <span
                    style={{
                      position: "absolute",
                      top: -22,
                      fontSize: 9,
                      letterSpacing: "0.14em",
                      color: "#a78bfa",
                      whiteSpace: "nowrap",
                    }}
                  >
                    HOME
                  </span>
                )}
              </span>
            );
          })}

          {/* breadcrumb trail of walked roots */}
          {snap.trail.map((p, i) => {
            const age = (snap.trail.length - 1 - i) / TRAIL_MAX;
            return (
              <span
                key={`t${i}-${p[0]},${p[1]}`}
                style={{
                  position: "absolute",
                  left: nodeX(p[0], p[1]),
                  top: nodeY(p[0], p[1]),
                  width: 10,
                  height: 10,
                  marginLeft: -5,
                  marginTop: -5,
                  borderRadius: "9999px",
                  background: "#a78bfa",
                  opacity: Math.max(0.08, 0.6 - age * 0.6),
                }}
              />
            );
          })}
        </div>

        {/* "you are here" marker — pinned at viewport center */}
        <div
          className="pointer-events-none absolute left-1/2 top-1/2"
          style={{ transform: "translate(-50%,-50%)" }}
        >
          <span
            className="motion-safe:animate-pulse"
            style={{
              display: "block",
              width: 70,
              height: 70,
              borderRadius: "9999px",
              border: "1.5px solid #c4b5fd",
              boxShadow: "0 0 34px hsl(270 90% 66% / 0.55)",
            }}
          />
        </div>
      </div>

      {/* ------------------------------- header ------------------------------ */}
      <div className="relative z-10 flex flex-col gap-1 px-5 pt-5 sm:px-8">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          Comma Walk
        </h1>
        <p className="max-w-2xl text-base text-muted-foreground">
          Pure-tuned chords are a walk across the infinite just-intonation
          lattice. Every change steps you along it — watch how far pure harmony
          carries you from home.
        </p>
      </div>

      {/* --------------------------- readout panel --------------------------- */}
      <div className="relative z-10 mt-4 px-5 sm:px-8">
        <div className="flex max-w-3xl flex-wrap items-stretch gap-3">
          <div className="min-w-[9rem] flex-1 rounded-md border border-border bg-background/60 px-4 py-3 backdrop-blur">
            <div className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
              Drift from home
            </div>
            <div className="mt-1 font-mono text-xl text-primary">
              {drift >= 0 ? "+" : ""}
              {drift.toFixed(1)} ¢
            </div>
            <div className="font-mono text-xs text-muted-foreground">
              {commas >= 0 ? "+" : ""}
              {commas.toFixed(2)} syntonic commas
            </div>
            <div
              className="mt-2 h-1.5 w-full overflow-hidden rounded-md bg-primary/20"
              role="meter"
              aria-valuenow={Math.round(meter * 100)}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                className="h-full bg-primary"
                style={{
                  width: `${meter * 100}%`,
                  transition: "width 1s cubic-bezier(0.4,0,0.2,1)",
                }}
              />
            </div>
          </div>

          <div className="min-w-[8rem] flex-1 rounded-md border border-border bg-background/60 px-4 py-3 backdrop-blur">
            <div className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
              Lattice position
            </div>
            <div className="mt-1 font-mono text-xl text-foreground">
              ({root[0]}, {root[1]})
            </div>
            <div className="font-mono text-xs text-muted-foreground">
              {taxicab} cells walked · {snap.steps} steps
            </div>
            <div className="font-mono text-xs text-muted-foreground">
              home {Math.round(homeAway)}px away
            </div>
          </div>

          <div className="min-w-[7rem] flex-1 rounded-md border border-border bg-background/60 px-4 py-3 backdrop-blur">
            <div className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
              Now playing
            </div>
            <div className="mt-1 font-mono text-xl text-primary">
              {snap.placed.chord.label}
            </div>
            <div className="font-mono text-xs text-muted-foreground">
              {PC_NAMES[snap.placed.chord.rootPc]}{" "}
              {snap.placed.chord.quality === "maj" ? "major" : "minor"}
            </div>
            <div className="font-mono text-xs text-muted-foreground">
              {rawCents(root[0], root[1]).toFixed(0)} ¢ raw
            </div>
          </div>
        </div>
      </div>

      {/* ------------------------------ controls ----------------------------- */}
      <div className="relative z-10 mt-4 flex flex-wrap items-center gap-2 px-5 sm:px-8">
        {phase === "idle" && (
          <button
            onClick={start}
            className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Start sound
          </button>
        )}
        {phase === "running" && (
          <button
            onClick={() => setAdaptive((v) => !v)}
            className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            {adaptive ? "Adaptive JI" : "12-TET"} · A/B
          </button>
        )}
        <button
          onClick={() => setAutoplay((v) => !v)}
          className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          {autoplay ? "Pause walk" : "Auto-walk"}
        </button>
        <button
          onClick={cycleNext}
          className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          Step →
        </button>
        <button
          onClick={teleportHome}
          className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          Teleport home
        </button>
        <div className="flex items-center gap-2">
          {PROGRESSION.map((c, i) => (
            <button
              key={c.label}
              onClick={() => jumpTo(i)}
              className="min-h-[44px] min-w-[44px] rounded-md border border-border bg-background/60 px-3 text-sm font-mono text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {phase === "nosound" && (
        <p className="relative z-10 mt-3 px-5 text-sm text-destructive sm:px-8">
          Web Audio is unavailable in this browser — the lattice keeps walking
          in silence.
        </p>
      )}

      {/* ------------------------------ keyboard ----------------------------- */}
      <div className="relative z-10 mt-4 flex flex-wrap gap-1.5 px-5 pb-24 sm:px-8">
        {KEYS.map((k) => {
          const isDown = pressed.has(k.code);
          return (
            <button
              key={k.code}
              onPointerDown={(e) => {
                e.preventDefault();
                playKey(k.code);
              }}
              onPointerUp={() => releaseKey(k.code)}
              onPointerLeave={() => releaseKey(k.code)}
              onPointerCancel={() => releaseKey(k.code)}
              className={`flex min-h-[44px] min-w-[44px] flex-col items-center justify-center rounded-md border px-2 py-1 font-mono text-xs transition-colors ${
                isDown
                  ? "border-primary bg-primary/20 text-primary"
                  : k.black
                    ? "border-border bg-background/80 text-muted-foreground hover:bg-accent hover:text-foreground"
                    : "border-border bg-background/40 text-muted-foreground hover:bg-accent hover:text-foreground"
              }`}
            >
              <span className="text-sm">{k.note}</span>
              <span className="opacity-60">{k.label}</span>
            </button>
          );
        })}
      </div>

      {/* --------------------------- design notes link ----------------------- */}
      <Link
        href="/dream/6728-commawalk/README.md"
        className="absolute bottom-3 right-4 z-10 font-mono text-xs text-muted-foreground hover:text-foreground"
      >
        Read the design notes →
      </Link>
    </main>
  );
}
