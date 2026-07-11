"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// Sunny Hill Roller — a kid (4+) SCULPTS rolling hills with a finger, then TILTS
// the device to roll a glossy ball over their OWN shape. Each hill crest the
// ball crosses rings a pentatonic note, so the hills the child drew ARE the
// melody. Bright daylight scene: blue sky, smiling sun, green/gold hills.
//
// INPUT  : DeviceOrientation (gamma) → roll speed + finger-drag to sculpt hills.
// OUTPUT : inline SVG (sky, sun, hills as a filled path, glossy ball) animated
//          via refs + requestAnimationFrame. No canvas / WebGL / three.js.
// AUDIO  : self-built marimba-ish synth (triangle + partials), C-major
//          pentatonic, kid-safe chain (master ≤0.3 → lowpass → compressor),
//          always-on soft ambient pad so it never feels broken.
//
// Lineage / freshness (see README): LocoRoco (tilt-the-world rolling) + the
// 2025–26 "musical marble run" wave (Marbles Music on Steam; Toy Theater Music
// Marbles; Hackaday procedural marble runs 2025-11-09) — but there the child
// only WATCHES marbles drop. Here the child BUILDS the track by sculpting, so
// the shape is their composition. Sibling lab piece 238-kids-tilt-world rolls a
// marble over FIXED pads; this one lets the child sculpt the hills first.
// ─────────────────────────────────────────────────────────────────────────────

// ── pure layout constants ───────────────────────────────────────────────────
const VIEW_W = 1000;
const VIEW_H = 600;
const HILL_COUNT = 9;
const GROUND_Y = 560; // baseline where hills sit
const MIN_CREST = 120; // smallest hill crest height above baseline
const MAX_CREST = 360; // tallest hill crest height
const BALL_R = 26;

// C major pentatonic across two octaves, low → high. Taller hill = higher note.
// Nothing is ever "wrong": every pitch is in-scale.
const PENTATONIC: number[] = [
  261.63, // C4
  293.66, // D4
  329.63, // E4
  392.0, // G4
  440.0, // A4
  523.25, // C5
  587.33, // D5
  659.25, // E5
];

// Warm hill fill colors (front/back band), cycled per hill for a sunny look.
const HILL_GREENS = ["#7bc043", "#69b33a", "#8fce4f", "#5ea832"];

// ── pure helpers (NOT hooks — never prefix with "use") ───────────────────────

// Map a crest height (px above baseline) → a pentatonic frequency index.
function makePitchIndex(crest: number): number {
  const t = (crest - MIN_CREST) / (MAX_CREST - MIN_CREST);
  const clamped = Math.max(0, Math.min(1, t));
  return Math.round(clamped * (PENTATONIC.length - 1));
}

// x-center of hill i.
function makeHillX(i: number): number {
  const span = VIEW_W / HILL_COUNT;
  return span * (i + 0.5);
}

// Sample the terrain height (y, where smaller y = higher on screen) at a given
// screen x, given the crest heights. Cosine bumps between neighboring crests
// give a smooth rolling LocoRoco-like surface the ball can ride.
function makeTerrainY(x: number, crests: number[]): number {
  const span = VIEW_W / HILL_COUNT;
  const fx = x / span - 0.5; // hill-space coordinate
  const i = Math.floor(fx);
  const frac = fx - i;
  const a = crests[Math.max(0, Math.min(HILL_COUNT - 1, i))];
  const b = crests[Math.max(0, Math.min(HILL_COUNT - 1, i + 1))];
  // smooth cosine interpolation between two crest heights
  const s = 0.5 - 0.5 * Math.cos(Math.PI * frac);
  const crest = a + (b - a) * s;
  return GROUND_Y - crest;
}

// Build the filled SVG path string for the rolling hills.
function drawHillPath(crests: number[]): string {
  const step = 8;
  let d = `M 0 ${VIEW_H}`;
  d += ` L 0 ${makeTerrainY(0, crests).toFixed(1)}`;
  for (let x = step; x <= VIEW_W; x += step) {
    d += ` L ${x} ${makeTerrainY(x, crests).toFixed(1)}`;
  }
  d += ` L ${VIEW_W} ${VIEW_H} Z`;
  return d;
}

type RollMode = "tilt" | "drag" | "asking";

interface AudioGraph {
  ctx: AudioContext;
  master: GainNode;
  lp: BiquadFilterNode;
}

export default function HillRollerPage() {
  const [started, setStarted] = useState(false);
  const [mode, setMode] = useState<RollMode>("asking");
  const [note, setNote] = useState("");
  // crest heights live in state so the SVG re-renders while sculpting.
  const [crests, setCrests] = useState<number[]>(() =>
    Array.from({ length: HILL_COUNT }, (_, i) => {
      // a gentle starter melody so it's alive immediately
      const wave = 0.5 + 0.5 * Math.sin((i / HILL_COUNT) * Math.PI * 2);
      return MIN_CREST + wave * (MAX_CREST - MIN_CREST) * 0.7;
    })
  );

  // refs the rAF loop reads/writes without re-rendering React
  const crestsRef = useRef<number[]>(crests);
  crestsRef.current = crests;
  const audioRef = useRef<AudioGraph | null>(null);
  const tiltRef = useRef(0); // -1..1 from gamma
  const lastTouchRef = useRef(0); // ms timestamp of last interaction
  const draggingRef = useRef<number | null>(null); // hill index being sculpted

  // live SVG element refs (animated imperatively)
  const ballRef = useRef<SVGGElement | null>(null);
  const ballPosRef = useRef({ x: 40, vx: 1.2, y: 0 });
  const svgRef = useRef<SVGSVGElement | null>(null);
  const litRef = useRef<(SVGCircleElement | null)[]>([]);
  const litUntilRef = useRef<number[]>(Array(HILL_COUNT).fill(0));

  // ── audio engine ────────────────────────────────────────────────────────
  const ensureAudio = useCallback((): AudioGraph => {
    if (audioRef.current) {
      if (audioRef.current.ctx.state === "suspended") {
        void audioRef.current.ctx.resume();
      }
      return audioRef.current;
    }
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const ctx = new Ctor();

    // kid-safe chain: voices → master(≤0.3) → lowpass(≤7500) → compressor → out
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -10;
    comp.ratio.value = 20;
    comp.attack.value = 0.003;
    comp.release.value = 0.25;
    comp.connect(ctx.destination);

    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 7000;
    lp.connect(comp);

    const master = ctx.createGain();
    master.gain.value = 0.0001;
    master.gain.setTargetAtTime(0.28, ctx.currentTime, 0.5);
    master.connect(lp);

    // always-on soft ambient pad: C2 + G2 sines through a slow shimmer so the
    // scene never feels broken even before the ball rolls.
    const padGain = ctx.createGain();
    padGain.gain.value = 0.0001;
    padGain.gain.setTargetAtTime(0.05, ctx.currentTime, 1.4);
    padGain.connect(master);
    [65.41, 98.0].forEach((f, i) => {
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = f;
      o.detune.value = i === 0 ? -3 : 3;
      o.connect(padGain);
      o.start();
    });
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.value = 0.08;
    lfoGain.gain.value = 0.02;
    lfo.connect(lfoGain);
    lfoGain.connect(padGain.gain);
    lfo.start();

    audioRef.current = { ctx, master, lp };
    return audioRef.current;
  }, []);

  // ring a soft marimba/bell note. pan ∈ [-1,1] by screen x.
  const ringNote = useCallback((freq: number, pan: number, gain: number) => {
    const a = audioRef.current;
    if (!a) return;
    const { ctx, master } = a;
    const now = ctx.currentTime;

    const panner = ctx.createStereoPanner();
    panner.pan.value = Math.max(-1, Math.min(1, pan));
    panner.connect(master);

    const env = ctx.createGain();
    env.gain.value = 0.0001;
    env.connect(panner);

    // triangle fundamental + two soft sine partials → warm marimba-ish tone.
    const o1 = ctx.createOscillator();
    o1.type = "triangle";
    o1.frequency.value = freq;
    const o2 = ctx.createOscillator();
    o2.type = "sine";
    o2.frequency.value = freq * 2;
    const o2g = ctx.createGain();
    o2g.gain.value = 0.22;
    const o3 = ctx.createOscillator();
    o3.type = "sine";
    o3.frequency.value = freq * 3.01;
    const o3g = ctx.createGain();
    o3g.gain.value = 0.1;
    o1.connect(env);
    o2.connect(o2g);
    o2g.connect(env);
    o3.connect(o3g);
    o3g.connect(env);

    const peak = 0.22 * gain;
    env.gain.setTargetAtTime(peak, now, 0.008);
    env.gain.setTargetAtTime(0.0001, now + 0.06, 0.32);

    o1.start(now);
    o2.start(now);
    o3.start(now);
    const stop = now + 1.6;
    o1.stop(stop);
    o2.stop(stop);
    o3.stop(stop);
    o1.onended = () => {
      panner.disconnect();
      env.disconnect();
      o2g.disconnect();
      o3g.disconnect();
    };
  }, []);

  // preview a hill's note when the child finishes sculpting it.
  const previewHill = useCallback(
    (idx: number, crest: number) => {
      const a = ensureAudio();
      if (!a) return;
      const freq = PENTATONIC[makePitchIndex(crest)];
      const pan = (makeHillX(idx) / VIEW_W) * 2 - 1;
      ringNote(freq, pan, 0.9);
    },
    [ensureAudio, ringNote]
  );

  // ── sculpt by dragging a hill up/down ─────────────────────────────────────
  const pointToHill = useCallback((clientX: number): number => {
    const svg = svgRef.current;
    if (!svg) return -1;
    const r = svg.getBoundingClientRect();
    const x = ((clientX - r.left) / r.width) * VIEW_W;
    const span = VIEW_W / HILL_COUNT;
    return Math.max(0, Math.min(HILL_COUNT - 1, Math.floor(x / span)));
  }, []);

  const sculptAt = useCallback((idx: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg || idx < 0) return;
    const r = svg.getBoundingClientRect();
    const yView = ((clientY - r.top) / r.height) * VIEW_H;
    // higher finger (smaller y) → taller crest
    const crest = Math.max(MIN_CREST, Math.min(MAX_CREST, GROUND_Y - yView));
    setCrests((prev) => {
      const next = prev.slice();
      next[idx] = crest;
      return next;
    });
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      lastTouchRef.current = performance.now();
      ensureAudio();
      const idx = pointToHill(e.clientX);
      draggingRef.current = idx;
      sculptAt(idx, e.clientY);
    },
    [ensureAudio, pointToHill, sculptAt]
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (draggingRef.current === null) return;
      lastTouchRef.current = performance.now();
      sculptAt(draggingRef.current, e.clientY);
    },
    [sculptAt]
  );

  const onPointerUp = useCallback(() => {
    const idx = draggingRef.current;
    if (idx !== null && idx >= 0) {
      previewHill(idx, crestsRef.current[idx]);
    }
    draggingRef.current = null;
  }, [previewHill]);

  // ── physics + render loop ─────────────────────────────────────────────────
  useEffect(() => {
    if (!started) return;
    let raf = 0;
    let prev = performance.now();
    // tracks which hill-crests the ball has rung this pass
    let lastCrestIdx = -1;

    const stepFrame = (t: number) => {
      raf = requestAnimationFrame(stepFrame);
      const dt = Math.min((t - prev) / 1000, 0.05);
      prev = t;
      const cr = crestsRef.current;
      const ball = ballPosRef.current;

      // ── auto-demo when idle ~3s: nudge the ball so a silent glance sees it.
      const idle = t - lastTouchRef.current > 3000;

      // ── horizontal drive: surface gradient (gravity) + tilt + base roll.
      const ahead = makeTerrainY(ball.x + 6, cr);
      const behind = makeTerrainY(ball.x - 6, cr);
      const slope = (ahead - behind) / 12; // +ve = downhill to the right
      // gravity pulls the ball down-slope; tilt adds player push.
      const grav = slope * 26;
      const tilt = tiltRef.current * 9;
      // a gentle baseline forward roll keeps the tune playing even when the
      // device is held flat or there's no sensor; tilt adds/subtracts on top.
      const baseline = mode === "asking" ? 0 : 1.4;
      const drive = baseline + tilt;
      ball.vx += (grav + drive) * dt;
      // friction + clamp so a 4-year-old never loses the ball
      ball.vx *= 0.985;
      ball.vx = Math.max(-9, Math.min(9, ball.vx));
      // keep it always gently moving forward so the melody loops
      if (!idle && ball.vx < 0.5 && tiltRef.current > -0.15) ball.vx = 0.8;

      ball.x += ball.vx * 60 * dt;

      // loop: exit right → re-enter left, replaying the drawn melody.
      if (ball.x > VIEW_W + BALL_R) {
        ball.x = -BALL_R;
        ball.vx = Math.max(1.0, ball.vx * 0.7);
        lastCrestIdx = -1;
      }
      if (ball.x < -BALL_R) {
        ball.x = VIEW_W + BALL_R;
      }

      const surfY = makeTerrainY(ball.x, cr);
      ball.y = surfY - BALL_R;

      // ── ring a note when the ball crosses a hill crest ──
      let nearest = -1;
      let nearestDist = Infinity;
      for (let i = 0; i < HILL_COUNT; i++) {
        const d = Math.abs(ball.x - makeHillX(i));
        if (d < nearestDist) {
          nearestDist = d;
          nearest = i;
        }
      }
      if (nearest !== lastCrestIdx && nearestDist < 28) {
        lastCrestIdx = nearest;
        const freq = PENTATONIC[makePitchIndex(cr[nearest])];
        const pan = (ball.x / VIEW_W) * 2 - 1;
        const vol = 0.55 + Math.min(Math.abs(ball.vx) / 9, 1) * 0.45;
        ringNote(freq, pan, vol);
        litUntilRef.current[nearest] = t + 360;
      }

      // ── imperatively move the ball <g> ──
      const g = ballRef.current;
      if (g) {
        const spin = (ball.x / (Math.PI * BALL_R)) * 180;
        g.setAttribute(
          "transform",
          `translate(${ball.x.toFixed(1)} ${ball.y.toFixed(1)})`
        );
        const inner = g.firstElementChild as SVGGElement | null;
        if (inner) inner.setAttribute("transform", `rotate(${spin.toFixed(1)})`);
      }

      // ── flash the crest markers that just rang ──
      for (let i = 0; i < HILL_COUNT; i++) {
        const c = litRef.current[i];
        if (!c) continue;
        const lit = t < litUntilRef.current[i];
        c.setAttribute("r", lit ? "20" : "10");
        c.setAttribute("opacity", lit ? "1" : "0.55");
      }
    };

    raf = requestAnimationFrame(stepFrame);
    return () => cancelAnimationFrame(raf);
  }, [started, mode, ringNote]);

  // ── start handler: request iOS tilt permission INSIDE the gesture ─────────
  const handleStart = useCallback(async () => {
    ensureAudio();
    lastTouchRef.current = performance.now();
    setStarted(true);

    type OrientCtor = typeof DeviceOrientationEvent & {
      requestPermission?: () => Promise<"granted" | "denied">;
    };
    const D =
      typeof window !== "undefined"
        ? (window.DeviceOrientationEvent as OrientCtor | undefined)
        : undefined;

    let gotEvent = false;
    const onOrient = (e: DeviceOrientationEvent) => {
      if (e.gamma === null) return;
      gotEvent = true;
      const g = Math.max(-30, Math.min(30, e.gamma));
      tiltRef.current = g / 30;
    };

    const enableTilt = () => {
      window.addEventListener("deviceorientation", onOrient);
      setMode("tilt");
      // if no orientation events arrive within ~2s, fall back to a roll button.
      window.setTimeout(() => {
        if (!gotEvent) {
          window.removeEventListener("deviceorientation", onOrient);
          setMode("drag");
          setNote("No tilt here — tap Roll! and sculpt the hills with your finger.");
        }
      }, 2000);
    };

    if (D && typeof D.requestPermission === "function") {
      try {
        const res = await D.requestPermission();
        if (res === "granted") {
          enableTilt();
        } else {
          setMode("drag");
          setNote("Tilt is off — tap Roll! and sculpt the hills with your finger.");
        }
      } catch {
        setMode("drag");
        setNote("Couldn't read tilt — tap Roll! and sculpt with your finger.");
      }
    } else if (D) {
      enableTilt();
    } else {
      setMode("drag");
      setNote("No tilt sensor — tap Roll! and sculpt the hills with your finger.");
    }
  }, [ensureAudio]);

  // big friendly Roll! button — relaunch the ball from the left.
  const handleRoll = useCallback(() => {
    lastTouchRef.current = performance.now();
    ensureAudio();
    ballPosRef.current.x = -BALL_R;
    ballPosRef.current.vx = 2.2;
  }, [ensureAudio]);

  // cleanup audio on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        void audioRef.current.ctx.close();
        audioRef.current = null;
      }
    };
  }, []);

  const hillPath = drawHillPath(crests);

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-[#0b2a4a] text-foreground">
      {/* ── the sunny SVG play area ── */}
      <svg
        ref={svgRef}
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        preserveAspectRatio="xMidYMid slice"
        className="absolute inset-0 h-full w-full touch-none select-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <defs>
          <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3aa6ff" />
            <stop offset="55%" stopColor="#7fd0ff" />
            <stop offset="100%" stopColor="#cdefff" />
          </linearGradient>
          <radialGradient id="sunGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#fff6c0" />
            <stop offset="60%" stopColor="#ffe35a" />
            <stop offset="100%" stopColor="#ffd000" />
          </radialGradient>
          <radialGradient id="ballGrad" cx="35%" cy="30%" r="75%">
            <stop offset="0%" stopColor="#fff" />
            <stop offset="35%" stopColor="#ff8fb0" />
            <stop offset="100%" stopColor="#e23b6d" />
          </radialGradient>
          <linearGradient id="hillGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#9ad84f" />
            <stop offset="100%" stopColor="#4f9b2e" />
          </linearGradient>
        </defs>

        {/* sky */}
        <rect x="0" y="0" width={VIEW_W} height={VIEW_H} fill="url(#sky)" />

        {/* smiling sun */}
        <g>
          {Array.from({ length: 12 }, (_, i) => {
            const ang = (i / 12) * Math.PI * 2;
            const x1 = 150 + Math.cos(ang) * 78;
            const y1 = 120 + Math.sin(ang) * 78;
            const x2 = 150 + Math.cos(ang) * 110;
            const y2 = 120 + Math.sin(ang) * 110;
            return (
              <line
                key={i}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke="#ffe35a"
                strokeWidth={10}
                strokeLinecap="round"
              />
            );
          })}
          <circle cx={150} cy={120} r={66} fill="url(#sunGlow)" />
          <circle cx={130} cy={108} r={8} fill="#7a5a00" />
          <circle cx={172} cy={108} r={8} fill="#7a5a00" />
          <path
            d="M 126 138 Q 150 162 174 138"
            stroke="#7a5a00"
            strokeWidth={7}
            fill="none"
            strokeLinecap="round"
          />
        </g>

        {/* fluffy clouds */}
        <g fill="#ffffff" opacity={0.9}>
          <ellipse cx={520} cy={90} rx={54} ry={26} />
          <ellipse cx={560} cy={78} rx={40} ry={24} />
          <ellipse cx={760} cy={150} rx={48} ry={22} />
          <ellipse cx={800} cy={138} rx={34} ry={20} />
        </g>

        {/* the sculpted rolling hills */}
        <path d={hillPath} fill="url(#hillGrad)" stroke="#3c7d24" strokeWidth={3} />

        {/* crest markers (also light up when the ball rings them) */}
        {crests.map((c, i) => {
          const x = makeHillX(i);
          const y = GROUND_Y - c;
          return (
            <g key={i}>
              <circle
                ref={(el) => {
                  litRef.current[i] = el;
                }}
                cx={x}
                cy={y}
                r={10}
                fill={HILL_GREENS[i % HILL_GREENS.length]}
                stroke="#fffbe0"
                strokeWidth={4}
                opacity={0.55}
              />
              {/* a friendly up/down handle hint */}
              <text
                x={x}
                y={y - 26}
                textAnchor="middle"
                fontSize={30}
                fill="#ffffff"
                opacity={0.85}
                style={{ pointerEvents: "none" }}
              >
                ↕
              </text>
            </g>
          );
        })}

        {/* the glossy rolling ball */}
        <g ref={ballRef} transform="translate(40 400)">
          <g>
            <circle r={BALL_R} fill="url(#ballGrad)" />
            {/* spokes so the spin is visible */}
            <line
              x1={-BALL_R + 6}
              y1={0}
              x2={BALL_R - 6}
              y2={0}
              stroke="#ffffff"
              strokeWidth={3}
              opacity={0.7}
            />
            <line
              x1={0}
              y1={-BALL_R + 6}
              x2={0}
              y2={BALL_R - 6}
              stroke="#ffffff"
              strokeWidth={3}
              opacity={0.7}
            />
            <circle cx={-9} cy={-9} r={6} fill="#ffffff" opacity={0.85} />
          </g>
        </g>
      </svg>

      {/* ── dark UI chrome over the bright play area ── */}
      <div className="pointer-events-none absolute left-0 right-0 top-0 z-10 flex flex-col items-center gap-1 px-4 pt-4 text-center">
        <h1 className="text-xl font-bold text-foreground drop-shadow sm:text-2xl">
          Sunny Hill Roller
        </h1>
        <p className="max-w-md text-base text-foreground drop-shadow">
          Pull the hills up and down with your finger, then tilt to roll the ball
          over your shape — it plays your tune!
        </p>
        {started && note && (
          <p className="max-w-sm text-base text-violet-300 drop-shadow">{note}</p>
        )}
      </div>

      {/* big friendly Roll! button (always handy; essential in drag fallback) */}
      {started && (
        <button
          onClick={handleRoll}
          className="absolute bottom-6 left-1/2 z-10 min-h-[64px] -translate-x-1/2 rounded-full bg-violet-500 px-10 py-4 text-2xl font-extrabold text-foreground shadow-lg ring-4 ring-border transition hover:bg-violet-400 active:scale-95"
        >
          Roll! ⚽
        </button>
      )}

      {/* corner design-notes link */}
      <Link
        href="#"
        className="absolute bottom-3 right-4 z-10 text-base text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
      >
        Design notes
      </Link>

      {/* ── Start overlay (creates AudioContext + asks iOS tilt on tap) ── */}
      {!started && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-6 bg-[#0b2a4a]/85 px-6 text-center">
          <h2 className="text-3xl font-extrabold text-foreground sm:text-4xl">
            Sunny Hill Roller ☀️
          </h2>
          <p className="max-w-md text-base text-foreground sm:text-lg">
            Sculpt sunny hills with your finger. Tilt to roll the ball over the
            hills YOU made — and it sings your melody.
          </p>
          <button
            onClick={handleStart}
            className="min-h-[64px] rounded-full bg-violet-400 px-10 py-4 text-2xl font-extrabold text-[#0b2a4a] shadow-lg ring-4 ring-border transition hover:bg-violet-300 active:scale-95"
          >
            Start ▶
          </button>
          <p className="max-w-sm text-base text-muted-foreground">
            Bright, sound-on play. Tilt your phone/tablet, or use the Roll!
            button.
          </p>
        </div>
      )}
    </main>
  );
}
