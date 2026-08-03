"use client";

// ════════════════════════════════════════════════════════════════════════════
// Reflections (5576)
//
// Walk into a room and HEAR its shape. A navigable shoebox room where the
// reverberation is computed by real geometric acoustics — the IMAGE-SOURCE
// METHOD (Allen & Berkley, JASA 1979) — rendered binaurally over headphones,
// with every reflection path drawn live on a top-down architectural plan. As
// you move, the images re-mirror, the delays and gains re-ramp, and the
// reflection rays sweep across the walls. SVG/DOM visuals only.
// ════════════════════════════════════════════════════════════════════════════

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import { VIOLET } from "../_shared/palette";
import {
  buildWalls,
  buildImageSources,
  computeTap,
  type ImageStruct,
  type Tap,
  type Vec2,
} from "./acoustics";
import { RoomAudio, type SourceSpec } from "./audio";

// ── Room + source configuration ─────────────────────────────────────────────
const LX = 8; // room width  (m)
const LY = 5; // room depth  (m)
const MAX_ORDER = 2; // image-source order (=> 17 images per source)
const BASE_HZ = 110; // A2
const REFLECT_COEFF = 0.72; // matches audio.ts (drawing normalisation only)

// Three voice-sources on a just-intoned major triad (1/1, 5/4, 3/2).
const SOURCES: SourceSpec[] = [
  { pos: { x: 1.6, y: 1.1 }, ratio: 1, lfoHz: 0.06 },
  { pos: { x: 6.4, y: 1.4 }, ratio: 5 / 4, lfoHz: 0.075 },
  { pos: { x: 4.0, y: 4.1 }, ratio: 3 / 2, lfoHz: 0.05 },
];

// ── Deterministic RNG — mulberry32 seeded 0x5576 ─────────────────────────────
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Seeded auto-tour waypoints (a slow loop inside a safe margin).
function buildTour(): Vec2[] {
  const rnd = mulberry32(0x5576);
  const m = 0.9;
  const pts: Vec2[] = [];
  for (let i = 0; i < 6; i++) {
    pts.push({
      x: m + rnd() * (LX - 2 * m),
      y: m + rnd() * (LY - 2 * m),
    });
  }
  return pts;
}

// ── Types for the render snapshot ────────────────────────────────────────────
interface VoiceTaps {
  source: Vec2;
  taps: Tap[];
  amp: number;
}
interface Snapshot {
  listener: Vec2;
  facing: number;
  voices: VoiceTaps[];
  activeTaps: number;
  dominantDelayMs: number;
  auto: boolean;
}

const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v));

export default function ReflectionsPage() {
  const [started, setStarted] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [deviceNote, setDeviceNote] = useState<string | null>(null);
  const [snap, setSnap] = useState<Snapshot | null>(null);

  // ── Mutable simulation state (outside React render loop) ──────────────────
  const sim = useRef({
    x: LX / 2,
    y: LY / 2,
    facing: Math.PI / 2, // face "into" the room (down the plan)
    target: null as Vec2 | null,
    auto: true,
    tourIdx: 0,
    deviceFacing: null as number | null,
  });
  const keys = useRef<Set<string>>(new Set());
  const tour = useRef<Vec2[]>(buildTour());
  const structs = useRef<ImageStruct[][]>([]);
  const audio = useRef<RoomAudio | null>(null);
  const raf = useRef<number>(0);
  const lastTs = useRef<number>(0);
  const lastAudio = useRef<number>(0);
  const lastDraw = useRef<number>(0);

  // Build the (static) image lattice once.
  if (structs.current.length === 0) {
    const walls = buildWalls(LX, LY);
    structs.current = SOURCES.map((s) =>
      buildImageSources(s.pos, walls, MAX_ORDER),
    );
  }

  const takeover = useCallback(() => {
    if (sim.current.auto) sim.current.auto = false;
  }, []);

  // ── The simulation + render loop ──────────────────────────────────────────
  const frame = useCallback((ts: number) => {
    const s = sim.current;
    const dt = lastTs.current ? Math.min(0.05, (ts - lastTs.current) / 1000) : 0;
    lastTs.current = ts;
    const tSec = ts / 1000;

    // Facing from device orientation overrides keyboard when present.
    if (s.deviceFacing !== null) s.facing = s.deviceFacing;

    if (s.auto) {
      // Seeded auto-tour: walk toward the current waypoint, turn to face travel.
      const wp = tour.current[s.tourIdx];
      const dx = wp.x - s.x;
      const dy = wp.y - s.y;
      const d = Math.hypot(dx, dy);
      if (d < 0.15) {
        s.tourIdx = (s.tourIdx + 1) % tour.current.length;
      } else {
        const v = 1.2;
        s.x += (dx / d) * v * dt;
        s.y += (dy / d) * v * dt;
        const want = Math.atan2(dy, dx);
        let diff = want - s.facing;
        while (diff > Math.PI) diff -= 2 * Math.PI;
        while (diff < -Math.PI) diff += 2 * Math.PI;
        s.facing += diff * Math.min(1, dt * 2.5);
      }
    } else {
      // Manual: rotate + walk relative to facing.
      const rot = 1.8;
      if (s.deviceFacing === null) {
        if (keys.current.has("q") || keys.current.has("arrowleft"))
          s.facing -= rot * dt;
        if (keys.current.has("e") || keys.current.has("arrowright"))
          s.facing += rot * dt;
      }
      const spd = 2.2;
      let fwd = 0;
      let strafe = 0;
      if (keys.current.has("w")) fwd += 1;
      if (keys.current.has("s")) fwd -= 1;
      if (keys.current.has("arrowup")) fwd += 1;
      if (keys.current.has("arrowdown")) fwd -= 1;
      if (keys.current.has("a")) strafe -= 1;
      if (keys.current.has("d")) strafe += 1;
      const fx = Math.cos(s.facing);
      const fy = Math.sin(s.facing);
      s.x += (fx * fwd - fy * strafe) * spd * dt;
      s.y += (fy * fwd + fx * strafe) * spd * dt;

      // Click-to-move target.
      if (s.target) {
        const dx = s.target.x - s.x;
        const dy = s.target.y - s.y;
        const d = Math.hypot(dx, dy);
        if (d < 0.1) {
          s.target = null;
        } else {
          s.x += (dx / d) * spd * dt;
          s.y += (dy / d) * spd * dt;
        }
      }
    }

    // Keep inside the room (with a small margin so the head never sits on a wall).
    s.x = clamp(s.x, 0.25, LX - 0.25);
    s.y = clamp(s.y, 0.25, LY - 0.25);

    const listener = { x: s.x, y: s.y };

    // Re-render acoustics (throttled) — THIS is the "room re-renders" payoff.
    if (audio.current && ts - lastAudio.current > 45) {
      lastAudio.current = ts;
      audio.current.update(listener, s.facing);
    }

    // Push a render snapshot (throttled ~30fps).
    if (ts - lastDraw.current > 33) {
      lastDraw.current = ts;
      const directGain = 1 / Math.max(1, 0.5); // normalising reference
      let active = 0;
      let domGain = 0;
      let domDelay = 0;
      const voices: VoiceTaps[] = SOURCES.map((src, i) => {
        const taps = structs.current[i].map((img) =>
          computeTap(listener, src.pos, img, REFLECT_COEFF),
        );
        for (const tp of taps) {
          if (tp.gain > directGain * 0.04) active++;
          if (tp.order >= 1 && tp.gain > domGain) {
            domGain = tp.gain;
            domDelay = tp.delay;
          }
        }
        const amp = 0.55 + 0.22 * Math.sin(2 * Math.PI * src.lfoHz * tSec + i);
        return { source: src.pos, taps, amp };
      });
      setSnap({
        listener,
        facing: s.facing,
        voices,
        activeTaps: active,
        dominantDelayMs: domDelay * 1000,
        auto: s.auto,
      });
    }

    raf.current = requestAnimationFrame(frame);
  }, []);

  // Mount: run the loop immediately so the silent plan self-demos.
  useEffect(() => {
    raf.current = requestAnimationFrame(frame);
    const kd = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (
        ["w", "a", "s", "d", "q", "e", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(
          k,
        )
      ) {
        keys.current.add(k);
        takeover();
        if (k.startsWith("arrow")) e.preventDefault();
      }
    };
    const ku = (e: KeyboardEvent) => keys.current.delete(e.key.toLowerCase());
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);
    return () => {
      cancelAnimationFrame(raf.current);
      window.removeEventListener("keydown", kd);
      window.removeEventListener("keyup", ku);
      audio.current?.dispose();
      audio.current = null;
    };
  }, [frame, takeover]);

  // Device orientation handler (kept in a ref so we can remove it cleanly).
  const orientHandler = useRef<((e: DeviceOrientationEvent) => void) | null>(null);

  const attachOrientation = useCallback(() => {
    const handler = (e: DeviceOrientationEvent) => {
      if (e.alpha === null || e.alpha === undefined) return;
      // Compass heading → facing. Any live reading takes over the field.
      sim.current.deviceFacing = -(e.alpha * Math.PI) / 180 + Math.PI / 2;
    };
    orientHandler.current = handler;
    window.addEventListener("deviceorientation", handler, true);
  }, []);

  const start = useCallback(async () => {
    setStarted(true);
    // Audio: create only after this user gesture.
    if (!audio.current) {
      try {
        audio.current = new RoomAudio(LX, LY, SOURCES, BASE_HZ, MAX_ORDER);
        audio.current.start();
      } catch {
        audio.current = null;
      }
    }
    // Device orientation (iOS gates behind a permission request).
    const anyEvt = window.DeviceOrientationEvent as unknown as {
      requestPermission?: () => Promise<string>;
    };
    if (typeof window.DeviceOrientationEvent === "undefined") {
      setDeviceNote(
        "Device orientation unavailable — turn your head with Q / E or ← / →.",
      );
      return;
    }
    try {
      if (typeof anyEvt.requestPermission === "function") {
        const res = await anyEvt.requestPermission();
        if (res === "granted") attachOrientation();
        else
          setDeviceNote(
            "Orientation permission denied — turn with Q / E or ← / →.",
          );
      } else {
        attachOrientation();
      }
    } catch {
      setDeviceNote("Orientation unavailable — turn with Q / E or ← / →.");
    }
  }, [attachOrientation]);

  useEffect(() => {
    return () => {
      if (orientHandler.current)
        window.removeEventListener("deviceorientation", orientHandler.current, true);
    };
  }, []);

  // Click-a-point-on-the-plan to walk there (NOT a drag).
  const onPlanClick = useCallback(
    (e: ReactMouseEvent<SVGSVGElement>) => {
      const svg = e.currentTarget;
      const pt = svg.createSVGPoint();
      pt.x = e.clientX;
      pt.y = e.clientY;
      const m = svg.getScreenCTM();
      if (!m) return;
      const p = pt.matrixTransform(m.inverse());
      if (p.x < 0 || p.x > LX || p.y < 0 || p.y > LY) return;
      sim.current.target = { x: p.x, y: p.y };
      sim.current.deviceFacing = null; // click implies desktop; free the keys
      takeover();
    },
    [takeover],
  );

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-3xl px-5 py-8">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          Reflections · 5576
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          Hear the shape of a room
        </h1>
        <p className="mt-2 text-base text-muted-foreground">
          Walk through a room whose echoes are computed by real geometric
          acoustics — the image-source method — and rendered binaurally. Every
          wall throws the sound back at you, and the reflection paths reshape
          live as you move. Headphones on.
        </p>

        {/* Controls */}
        <div className="mt-5 flex flex-wrap items-center gap-3">
          {!started ? (
            <button
              onClick={start}
              className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Enter the room
            </button>
          ) : (
            <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              {snap?.auto ? "Auto-tour · take over with WASD / click" : "Walking"}
            </span>
          )}
          <button
            onClick={() => setShowNotes((v) => !v)}
            className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            Design notes
          </button>
        </div>

        {deviceNote && (
          <p className="mt-3 text-sm text-destructive">{deviceNote}</p>
        )}

        {/* The architectural plan */}
        <div className="mt-6 overflow-hidden rounded-lg border border-border bg-[#07040e]">
          <Plan snap={snap} onPlanClick={onPlanClick} />
        </div>

        {/* Readout */}
        <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground sm:grid-cols-4">
          <span>room {LX}×{LY} m</span>
          <span>
            xy {snap ? snap.listener.x.toFixed(1) : "—"},
            {snap ? snap.listener.y.toFixed(1) : "—"}
          </span>
          <span>taps {snap ? snap.activeTaps : "—"}</span>
          <span>
            echo {snap ? snap.dominantDelayMs.toFixed(0) : "—"} ms
          </span>
        </div>

        <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
          Move with{" "}
          <span className="font-mono text-xs">W A S D</span> or the arrow keys,
          turn with <span className="font-mono text-xs">Q / E</span>, or click a
          point on the plan to walk there. On a phone, tilt to turn your head.
          The whole idea reads from the plan alone, in silence.
        </p>

        {showNotes && <DesignNotes />}
      </div>
    </main>
  );
}

// ── The top-down architectural plan (inline SVG only) ────────────────────────
function Plan({
  snap,
  onPlanClick,
}: {
  snap: Snapshot | null;
  onPlanClick: (e: ReactMouseEvent<SVGSVGElement>) => void;
}) {
  // Normalise stroke weight against the strongest tap on screen.
  let maxGain = 0.001;
  if (snap)
    for (const v of snap.voices)
      for (const t of v.taps) if (t.gain > maxGain) maxGain = t.gain;

  const ghostLines: ReactNode[] = [];
  const foldedPaths: ReactNode[] = [];
  const ghostNodes: ReactNode[] = [];

  if (snap) {
    const L = snap.listener;
    snap.voices.forEach((v, vi) => {
      v.taps.forEach((t, ti) => {
        const norm = t.gain / maxGain; // 0..1
        if (norm < 0.03) return;
        const isDirect = t.order === 0;
        // Folded reflection path: source → bounces → listener.
        const d = t.path.map((p) => `${p.x},${p.y}`).join(" ");
        foldedPaths.push(
          <polyline
            key={`f-${vi}-${ti}`}
            points={d}
            fill="none"
            stroke={isDirect ? VIOLET[200] : VIOLET[400]}
            strokeWidth={0.02 + norm * 0.09}
            strokeOpacity={0.18 + norm * 0.72}
            strokeLinejoin="round"
            strokeLinecap="round"
          />,
        );
        // First-order ghost: dashed line to the mirrored image + its marker.
        if (t.order === 1) {
          ghostLines.push(
            <line
              key={`g-${vi}-${ti}`}
              x1={L.x}
              y1={L.y}
              x2={t.imagePos.x}
              y2={t.imagePos.y}
              stroke={VIOLET[600]}
              strokeWidth={0.015}
              strokeOpacity={0.12 + norm * 0.35}
              strokeDasharray="0.12 0.12"
            />,
          );
          ghostNodes.push(
            <circle
              key={`gn-${vi}-${ti}`}
              cx={t.imagePos.x}
              cy={t.imagePos.y}
              r={0.09}
              fill={VIOLET[600]}
              fillOpacity={0.3 + norm * 0.3}
            />,
          );
        }
      });
    });
  }

  return (
    <svg
      viewBox="-3 -3 14 11"
      className="block w-full cursor-crosshair select-none"
      style={{ aspectRatio: "14 / 11" }}
      onClick={onPlanClick}
    >
      {/* mirrored image lattice (outside the walls) */}
      {ghostNodes}
      {ghostLines}
      {/* room walls */}
      <rect
        x={0}
        y={0}
        width={LX}
        height={LY}
        fill="none"
        stroke={VIOLET[500]}
        strokeWidth={0.04}
        strokeOpacity={0.85}
      />
      {/* reflection paths */}
      {foldedPaths}
      {/* sources */}
      {snap?.voices.map((v, i) => (
        <g key={`src-${i}`}>
          <circle
            cx={v.source.x}
            cy={v.source.y}
            r={0.14 + v.amp * 0.22}
            fill={VIOLET[400]}
            fillOpacity={0.18}
          />
          <circle
            cx={v.source.x}
            cy={v.source.y}
            r={0.11}
            fill={VIOLET[300]}
            fillOpacity={0.9}
          />
        </g>
      ))}
      {/* listener head marker */}
      {snap && <HeadMarker listener={snap.listener} facing={snap.facing} />}
    </svg>
  );
}

function HeadMarker({ listener, facing }: { listener: Vec2; facing: number }) {
  const fx = Math.cos(facing);
  const fy = Math.sin(facing);
  const px = -fy;
  const py = fx;
  const tip = { x: listener.x + fx * 0.42, y: listener.y + fy * 0.42 };
  const bl = { x: listener.x - fx * 0.16 + px * 0.22, y: listener.y - fy * 0.16 + py * 0.22 };
  const br = { x: listener.x - fx * 0.16 - px * 0.22, y: listener.y - fy * 0.16 - py * 0.22 };
  return (
    <g>
      <circle
        cx={listener.x}
        cy={listener.y}
        r={0.26}
        fill={VIOLET[500]}
        fillOpacity={0.16}
      />
      <polygon
        points={`${tip.x},${tip.y} ${bl.x},${bl.y} ${br.x},${br.y}`}
        fill={VIOLET[200]}
        fillOpacity={0.95}
      />
    </g>
  );
}

function DesignNotes() {
  return (
    <div className="mt-6 rounded-lg border border-border bg-card/60 p-5">
      <h2 className="text-xl font-semibold tracking-tight">Design notes</h2>
      <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">
        <p>
          <span className="text-foreground">The one question.</span> What if you
          could walk into a room and hear its shape — every wall throwing the
          sound back at you, the echoes reshaping around you as you move?
        </p>
        <p>
          <span className="text-foreground">The image-source method.</span> A
          reflection off a flat wall behaves exactly like a straight line from a
          mirror-image of the source, reflected across that wall. Mirror the
          image again and you get second-order reflections. For this shoebox
          room we build the lattice up to order 2 — seventeen image sources per
          voice — and turn each into one audio tap: a delay (distance ÷ 343 m/s),
          a gain that falls with distance and per-bounce wall absorption, an
          air-absorption low-pass that dulls longer paths, and an HRTF panner
          placed in the direction of that image so the reflection genuinely
          arrives from the wall that threw it. Move, and every delay, gain and
          panner re-ramps.
        </p>
        <p>
          <span className="text-foreground">Read it in silence.</span> The plan
          draws the folded bounce path to each source (bolder = louder), the
          dashed ghost lines out to the first-order mirror images beyond the
          walls, the breathing sources, and your head with its facing. The whole
          method is legible with zero sound.
        </p>
        <p>
          <span className="text-foreground">Lineage.</span> Allen &amp; Berkley,
          &ldquo;Image method for efficiently simulating small-room acoustics,&rdquo;
          JASA 1979 — the origin of the technique. The spatial-sound-installation
          lineage of Max Neuhaus (<em>Times Square</em>, the first permanent
          sound installation), Bernhard Leitner&rsquo;s sound architecture, and
          Maryanne Amacher. And the fresh research arXiv:2604.05545,
          &ldquo;Multimodal Deep Learning for Real-Time Spatial Room Impulse
          Response Computing&rdquo; (April 2026), which keeps geometric early
          reflections as an explicit real-time module precisely because they are
          what learning can&rsquo;t approximate — validating this classical,
          from-scratch core.
        </p>
        <p>
          <span className="text-foreground">What needs a real review.</span> The
          binaural directionality only lands on headphones, and head-turn only
          truly comes alive on a real phone with a tilt sensor. Speakers or a
          laptop will convey the timing and the visuals but not the full
          spatial reflection field.
        </p>
      </div>
    </div>
  );
}
