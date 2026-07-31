"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { VIOLET } from "@/app/dream/_shared/palette";
import {
  createHarmonographAudio,
  type HarmonographAudio,
} from "./audio";
import {
  createHarmonographState,
  describeInterval,
  envAt,
  mulberry32,
  RATIO_MAX,
  RATIO_MIN,
  snapRatio,
  stepHarmonograph,
  strikeHarmonograph,
  type HarmonographState,
} from "./harmonograph";

// ── SVG geometry ─────────────────────────────────────────────────────────────
const VB = 480;
const CENTER = VB / 2;
const RADIUS = 190;
const TAIL_LEN = 90; // bright leading segment (points)
const IDLE_MS = 2600; // self-demo takes over after this much stillness

type Source = "drift" | "tilt" | "pointer" | "slider";
type TiltStatus = "unsupported" | "idle" | "prompt" | "denied" | "active";

interface Control {
  rawX: number; // pre-snap X pendulum ratio
  rawY: number; // pre-snap Y pendulum ratio
  lastInputAt: number; // performance.now() of last human input
  source: Source;
}

// Autopilot bias: pick raw targets near the just ratios so the self-demo
// visibly finds — and rings — closed figures rather than wandering.
const DRIFT_TARGETS = [1, 5 / 4, 4 / 3, 3 / 2, 5 / 3, 2];

function ratioToSvgX(x: number): number {
  return CENTER + x * RADIUS;
}
function ratioToSvgY(y: number): number {
  return CENTER - y * RADIUS;
}

function pathFrom(
  samples: { x: number; y: number }[],
  start: number,
  end: number,
): string {
  let d = "";
  for (let i = start; i < end; i++) {
    const p = samples[i];
    const sx = ratioToSvgX(p.x).toFixed(1);
    const sy = ratioToSvgY(p.y).toFixed(1);
    d += i === start ? `M${sx} ${sy}` : `L${sx} ${sy}`;
  }
  return d;
}

// Map a comfortable ±34° tilt arc (around the tared neutral) into the ratio span.
function tiltToRatio(deltaDeg: number): number {
  const span = 34;
  const t = (Math.min(span, Math.max(-span, deltaDeg)) + span) / (2 * span);
  return RATIO_MIN + t * (RATIO_MAX - RATIO_MIN);
}

interface Readout {
  rx: number;
  ry: number;
  interval: string;
  cents: number;
  locked: boolean;
  bright: number;
  source: Source;
}

export default function PendulumPage() {
  const [started, setStarted] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [tiltStatus, setTiltStatus] = useState<TiltStatus>("idle");
  const [audioError, setAudioError] = useState<string | null>(null);
  const [readout, setReadout] = useState<Readout>({
    rx: 1.5,
    ry: 1,
    interval: "perfect fifth",
    cents: 0,
    locked: false,
    bright: 1,
    source: "drift",
  });

  const ctxRef = useRef<AudioContext | null>(null);
  const audioRef = useRef<HarmonographAudio | null>(null);
  const stateRef = useRef<HarmonographState>(createHarmonographState());
  const controlRef = useRef<Control>({
    rawX: 3 / 2,
    rawY: 1,
    lastInputAt: -Infinity,
    source: "drift",
  });
  const rngRef = useRef<() => number>(mulberry32(0x4232));
  const driftRef = useRef({ tx: 3 / 2, ty: 1, nextPick: 0 });
  const tiltZeroRef = useRef<{ g: number; b: number; set: boolean }>({
    g: 0,
    b: 0,
    set: false,
  });
  const rafRef = useRef<number>(0);
  const lastFrameRef = useRef<number>(0);
  const lastReadoutRef = useRef<number>(0);

  // svg element refs — updated per frame without a React re-render
  const trailRef = useRef<SVGPathElement | null>(null);
  const tailRef = useRef<SVGPathElement | null>(null);
  const penRef = useRef<SVGCircleElement | null>(null);
  const nodeXRef = useRef<SVGCircleElement | null>(null);
  const nodeYRef = useRef<SVGCircleElement | null>(null);

  const noteHuman = useCallback((src: Source) => {
    const c = controlRef.current;
    c.lastInputAt = performance.now();
    c.source = src;
  }, []);

  // ── Pointer over the figure ────────────────────────────────────────────────
  const onPointer = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const fx = (e.clientX - rect.left) / rect.width; // 0..1
      const fy = (e.clientY - rect.top) / rect.height; // 0..1
      const c = controlRef.current;
      c.rawX = RATIO_MIN + Math.min(1, Math.max(0, fx)) * (RATIO_MAX - RATIO_MIN);
      c.rawY =
        RATIO_MIN + (1 - Math.min(1, Math.max(0, fy))) * (RATIO_MAX - RATIO_MIN);
      noteHuman("pointer");
    },
    [noteHuman],
  );

  // ── Sliders (last-resort fallback) ─────────────────────────────────────────
  const onSlider = useCallback(
    (axis: "x" | "y", value: number) => {
      const r = RATIO_MIN + value * (RATIO_MAX - RATIO_MIN);
      const c = controlRef.current;
      if (axis === "x") c.rawX = r;
      else c.rawY = r;
      noteHuman("slider");
    },
    [noteHuman],
  );

  // ── Device tilt ────────────────────────────────────────────────────────────
  const onOrientation = useCallback(
    (e: DeviceOrientationEvent) => {
      const gamma = e.gamma; // left/right, -90..90
      const beta = e.beta; // front/back, -180..180
      if (gamma == null || beta == null) return;
      const z = tiltZeroRef.current;
      if (!z.set) {
        // Tare on the FIRST reading so the resting hold angle = neutral ratios,
        // instead of biasing the figure by however the phone happens to be held.
        z.g = gamma;
        z.b = beta;
        z.set = true;
        setTiltStatus("active");
      }
      const c = controlRef.current;
      c.rawX = tiltToRatio(gamma - z.g);
      c.rawY = tiltToRatio(beta - z.b);
      noteHuman("tilt");
    },
    [noteHuman],
  );

  // ── Animation + self-demo (runs from mount; audio joins on Start) ──────────
  useEffect(() => {
    const st = stateRef.current;
    strikeHarmonograph(st);
    const rng = rngRef.current;
    const drift = driftRef.current;

    const frame = (now: number) => {
      const prev = lastFrameRef.current || now;
      const dt = (now - prev) / 1000;
      lastFrameRef.current = now;
      const c = controlRef.current;

      // Self-demo: after IDLE_MS of stillness, a seeded walk toward just ratios.
      if (now - c.lastInputAt > IDLE_MS) {
        c.source = "drift";
        if (now > drift.nextPick) {
          drift.tx = DRIFT_TARGETS[Math.floor(rng() * DRIFT_TARGETS.length)];
          drift.ty = DRIFT_TARGETS[Math.floor(rng() * DRIFT_TARGETS.length)];
          drift.nextPick = now + 3600 + rng() * 2600;
        }
        const k = Math.min(1, dt * 0.7);
        c.rawX += (drift.tx - c.rawX) * k;
        c.rawY += (drift.ty - c.rawY) * k;
      }

      const sx = snapRatio(c.rawX);
      const sy = snapRatio(c.rawY);
      audioRef.current?.setRatios(sx.value, sy.value);
      stepHarmonograph(st, dt, sx.value, sy.value);

      // Auto re-strike once the figure has rung out (keeps the demo alive).
      if (envAt(st.t) < 0.02) {
        strikeHarmonograph(st);
        audioRef.current?.strike();
      }

      // Render the trail directly to the DOM (no per-frame React churn).
      const samples = st.samples;
      const n = samples.length;
      const locked = sx.strength > 0.8 && sy.strength > 0.8;
      if (trailRef.current && tailRef.current) {
        const tailStart = Math.max(0, n - TAIL_LEN);
        trailRef.current.setAttribute("d", pathFrom(samples, 0, tailStart + 1));
        tailRef.current.setAttribute("d", pathFrom(samples, tailStart, n));
        tailRef.current.setAttribute(
          "stroke",
          locked ? VIOLET[200] : VIOLET[400],
        );
      }
      if (n > 0) {
        const p = samples[n - 1];
        const px = ratioToSvgX(p.x);
        const py = ratioToSvgY(p.y);
        penRef.current?.setAttribute("cx", px.toFixed(1));
        penRef.current?.setAttribute("cy", py.toFixed(1));
        penRef.current?.setAttribute("r", (locked ? 6 : 4).toFixed(1));
        nodeXRef.current?.setAttribute("cx", px.toFixed(1));
        nodeYRef.current?.setAttribute("cy", py.toFixed(1));
      }

      // Throttled readout for the text HUD (~9 Hz).
      if (now - lastReadoutRef.current > 110) {
        lastReadoutRef.current = now;
        const iv = describeInterval(sx.value, sy.value);
        setReadout({
          rx: sx.value,
          ry: sy.value,
          interval: iv.name,
          cents: iv.cents,
          locked,
          bright: envAt(st.t),
          source: c.source,
        });
      }

      rafRef.current = requestAnimationFrame(frame);
    };

    rafRef.current = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  // ── Start sound + enable tilt (must be inside the user gesture) ─────────────
  const startSound = useCallback(async () => {
    try {
      if (!ctxRef.current) {
        const Ctor =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext })
            .webkitAudioContext;
        const ctx = new Ctor();
        ctxRef.current = ctx;
        audioRef.current = createHarmonographAudio(ctx);
      }
      await ctxRef.current.resume();
      setStarted(true);
      setAudioError(null);
    } catch {
      setAudioError("Could not start audio on this device.");
    }

    // Enable device tilt. iOS 13+ gates the sensor behind a permission call that
    // MUST happen inside a user gesture — this one.
    const DOE = window.DeviceOrientationEvent as
      | (typeof DeviceOrientationEvent & {
          requestPermission?: () => Promise<"granted" | "denied">;
        })
      | undefined;
    if (!DOE) {
      setTiltStatus("unsupported");
      return;
    }
    tiltZeroRef.current.set = false; // re-tare on next stream of readings
    if (typeof DOE.requestPermission === "function") {
      setTiltStatus("prompt");
      try {
        const res = await DOE.requestPermission();
        if (res === "granted") {
          window.addEventListener("deviceorientation", onOrientation);
          setTiltStatus("active");
        } else {
          setTiltStatus("denied");
        }
      } catch {
        setTiltStatus("denied");
      }
    } else {
      window.addEventListener("deviceorientation", onOrientation);
      setTiltStatus("active");
    }
  }, [onOrientation]);

  const restrike = useCallback(() => {
    strikeHarmonograph(stateRef.current);
    audioRef.current?.strike();
  }, []);

  // Teardown on unmount.
  useEffect(() => {
    return () => {
      window.removeEventListener("deviceorientation", onOrientation);
      audioRef.current?.stop();
      const ctx = ctxRef.current;
      if (ctx && ctx.state !== "closed") ctx.close().catch(() => {});
    };
  }, [onOrientation]);

  const centsLabel =
    Math.abs(readout.cents) < 1
      ? "pure"
      : `${readout.cents > 0 ? "+" : ""}${readout.cents.toFixed(0)}¢`;

  const sourceLabel =
    readout.source === "drift"
      ? "self-demo (0x4232)"
      : readout.source === "tilt"
        ? "device tilt"
        : readout.source;

  return (
    <main className="min-h-screen bg-[#050409] px-4 py-6 font-sans text-foreground sm:px-8">
      <div className="mx-auto max-w-5xl">
        <header className="mb-5">
          <Link
            href="/dream"
            className="font-mono text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            ← dream lab
          </Link>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            Pendulum
          </h1>
          <p className="mt-2 max-w-3xl text-base text-muted-foreground">
            Tilt your phone and it draws — and sings. Two pendulums, one per
            axis; leaning sets their frequency ratios. When the ratios settle
            near a simple whole-number relationship the traced figure{" "}
            <span className="text-foreground">closes into a still rosette</span>{" "}
            and the two tones lock into a{" "}
            <span className="text-foreground">consonant chord</span>. Between
            those points the figure precesses and the tones beat against each
            other. Sight and sound agree in one gesture.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              onClick={startSound}
              className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              {started ? "Sound live ●" : "Start sound + tilt"}
            </button>
            <button
              onClick={restrike}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Re-strike
            </button>
            <button
              onClick={() => setShowNotes(true)}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Read the design notes
            </button>
          </div>
          {audioError && (
            <p className="mt-3 font-mono text-sm text-destructive">
              {audioError}
            </p>
          )}
          {tiltStatus === "denied" && (
            <p className="mt-3 font-mono text-sm text-destructive">
              Tilt permission denied — drag on the figure or use the sliders
              below.
            </p>
          )}
          {tiltStatus === "unsupported" && (
            <p className="mt-3 text-sm text-muted-foreground">
              No motion sensor here — drag on the figure or use the sliders.
            </p>
          )}
        </header>

        {/* status row */}
        <div className="mb-3 flex flex-wrap items-center gap-x-6 gap-y-1 font-mono text-sm">
          <span className="text-muted-foreground">
            interval:{" "}
            <span className={readout.locked ? "text-primary" : "text-foreground"}>
              {readout.interval}
            </span>{" "}
            <span className="text-muted-foreground">({centsLabel})</span>
          </span>
          <span className="text-muted-foreground">
            state:{" "}
            <span className={readout.locked ? "text-primary" : "text-foreground"}>
              {readout.locked ? "locked ● closed" : "precessing"}
            </span>
          </span>
          <span className="text-muted-foreground">
            ratios:{" "}
            <span className="tabular-nums text-foreground">
              {readout.rx.toFixed(3)} : {readout.ry.toFixed(3)}
            </span>
          </span>
          <span className="text-muted-foreground">
            drive: <span className="text-primary">{sourceLabel}</span>
          </span>
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_260px]">
          {/* ── The figure ──────────────────────────────────────────────────── */}
          <div className="overflow-hidden rounded-lg border border-border bg-[#07060d]">
            <svg
              viewBox={`0 0 ${VB} ${VB}`}
              className="h-auto w-full touch-none select-none"
              onPointerMove={onPointer}
              onPointerDown={onPointer}
            >
              {/* axis guides */}
              <line
                x1={CENTER - RADIUS}
                y1={CENTER}
                x2={CENTER + RADIUS}
                y2={CENTER}
                stroke={VIOLET[800]}
                strokeWidth={1}
                opacity={0.5}
              />
              <line
                x1={CENTER}
                y1={CENTER - RADIUS}
                x2={CENTER}
                y2={CENTER + RADIUS}
                stroke={VIOLET[800]}
                strokeWidth={1}
                opacity={0.5}
              />
              {/* accumulated trail */}
              <path
                ref={trailRef}
                d=""
                fill="none"
                stroke={VIOLET[600]}
                strokeWidth={1.4}
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={0.55}
              />
              {/* bright leading tail */}
              <path
                ref={tailRef}
                d=""
                fill="none"
                stroke={VIOLET[300]}
                strokeWidth={2.4}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {/* per-axis phase nodes (on the guides) + the pen */}
              <circle ref={nodeXRef} cx={CENTER} cy={CENTER} r={3} fill={VIOLET[500]} opacity={0.7} />
              <circle ref={nodeYRef} cx={CENTER} cy={CENTER} r={3} fill={VIOLET[500]} opacity={0.7} />
              <circle ref={penRef} cx={CENTER} cy={CENTER} r={4} fill={VIOLET[100]} />
            </svg>
          </div>

          {/* ── Fallback controls ───────────────────────────────────────────── */}
          <div className="rounded-lg border border-border bg-[#07060d] p-4">
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              manual control
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              No phone to tilt? Drag on the figure, or set each pendulum here.
            </p>
            <label className="mt-4 block text-sm text-muted-foreground">
              X pendulum
              <input
                type="range"
                min={0}
                max={1}
                step={0.001}
                defaultValue={0.5}
                onChange={(e) => onSlider("x", Number(e.target.value))}
                className="mt-1 w-full accent-primary"
              />
            </label>
            <label className="mt-4 block text-sm text-muted-foreground">
              Y pendulum
              <input
                type="range"
                min={0}
                max={1}
                step={0.001}
                defaultValue={0}
                onChange={(e) => onSlider("y", Number(e.target.value))}
                className="mt-1 w-full accent-primary"
              />
            </label>
            <div className="mt-5 border-t border-border pt-4">
              <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                brightness
              </p>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-[width] duration-150"
                  style={{ width: `${Math.round(readout.bright * 100)}%` }}
                />
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Each strike rings down over ~26 s. Tap{" "}
                <span className="text-foreground">Re-strike</span> to swing the
                pendulums again.
              </p>
            </div>
          </div>
        </div>

        <p className="mt-4 max-w-3xl text-sm text-muted-foreground">
          Lock targets are the just ratios{" "}
          <span className="font-mono text-foreground">
            1:1 · 5:4 · 4:3 · 3:2 · 5:3 · 2:1
          </span>{" "}
          — unison, major third, fourth, fifth, major sixth, octave. Nothing is
          quantised: sit between two and you hear the roughness the figure&apos;s
          precession is drawing.
        </p>
      </div>

      {/* ── Design-notes modal ─────────────────────────────────────────────── */}
      {showNotes && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-semibold tracking-tight text-foreground">
              Design notes
            </h2>
            <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                A <span className="text-foreground">harmonograph</span> is a
                Victorian drawing machine (Blackburn, 1844): pendulums swing a
                pen over paper and their interference traces a fading{" "}
                <span className="text-foreground">Lissajous</span> figure. Here
                two pendulums — one per screen axis — are driven by phone tilt,
                and the same two frequencies are two audio oscillators.
              </p>
              <p className="font-mono text-xs text-foreground">
                x = e^(−t/11s) · sin(2π·0.55·rx·t + π/2)
                <br />
                y = e^(−t/11s) · sin(2π·0.55·ry·t)
                <br />
                oscillators = 220·rx and 220·ry (±4¢ detune)
                <br />
                snap: raw → nearest just ratio × Gaussian(σ=0.032)
              </p>
              <p>
                Each ratio is softly pulled toward its nearest just ratio by a
                Gaussian basin — near a target the pull is total (the figure
                closes, the dyad is pure), between targets it&apos;s zero (the
                figure precesses, the tones beat). It is a{" "}
                <span className="text-foreground">basin, not a quantiser</span>:
                continuous pitch is preserved everywhere between the locks.
              </p>
              <p>
                Input degrades: device tilt (tared on the first reading so your
                resting hold is neutral) → drag on the figure → sliders →, after
                a few seconds idle, a seeded{" "}
                <span className="font-mono text-foreground">
                  mulberry32(0x4232)
                </span>{" "}
                self-demo that hunts closed figures. First real input hands back.
              </p>
              <p>
                Full write-up in{" "}
                <span className="font-mono text-foreground">README.md</span> in
                this prototype&apos;s folder.
              </p>
            </div>
            <button
              onClick={() => setShowNotes(false)}
              className="mt-5 min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
