"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { FeelingsAudio } from "./audio";
import {
  clamp01,
  computeFeeling,
  palette,
  rgbStr,
  type Feeling,
} from "./harmony";

// Idle auto-drift starts after this many ms with no touch.
const IDLE_MS = 1500;

type Mote = { bx: number; by: number; r: number; ph: number; sp: number };

const MOTES: Mote[] = Array.from({ length: 14 }, (_, i) => ({
  bx: (i * 67) % 100,
  by: (i * 41 + 13) % 100,
  r: 2 + ((i * 7) % 5),
  ph: (i / 14) * Math.PI * 2,
  sp: 0.4 + ((i % 3) * 0.25),
}));

export default function FeelingsSun() {
  const [started, setStarted] = useState(false);
  const [audioFailed, setAudioFailed] = useState(false);
  const [showNotes, setShowNotes] = useState(false);

  const wrapRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<FeelingsAudio | null>(null);
  const rafRef = useRef<number>(0);

  // Sun normalized position (0..1). Start at the happy corner-ish.
  const posRef = useRef({ x: 0.32, y: 0.32 });
  // Smoothed (rendered) position for buttery motion.
  const smoothRef = useRef({ x: 0.32, y: 0.32 });
  const draggingRef = useRef(false);
  const lastTouchRef = useRef<number>(0);
  const lastSparkleRef = useRef<number>(0);
  const lastFaceRef = useRef<number>(0);

  // Visual state mirrored into React only at a low rate for the face/labels.
  const [feeling, setFeeling] = useState<Feeling>(() =>
    computeFeeling(0.32, 0.32),
  );

  // ── pointer handling ──────────────────────────────────────────────────────
  const setFromClient = useCallback((clientX: number, clientY: number) => {
    const el = wrapRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    posRef.current = {
      x: clamp01((clientX - r.left) / r.width),
      y: clamp01((clientY - r.top) / r.height),
    };
    lastTouchRef.current = performance.now();
  }, []);

  const onDown = useCallback(
    (e: React.PointerEvent) => {
      draggingRef.current = true;
      (e.target as Element).setPointerCapture?.(e.pointerId);
      setFromClient(e.clientX, e.clientY);
    },
    [setFromClient],
  );
  const onMove = useCallback(
    (e: React.PointerEvent) => {
      if (!draggingRef.current) return;
      setFromClient(e.clientX, e.clientY);
    },
    [setFromClient],
  );
  const onUp = useCallback(() => {
    draggingRef.current = false;
    lastTouchRef.current = performance.now();
  }, []);

  // ── start (iOS unlock inside gesture) ─────────────────────────────────────
  const handleStart = useCallback(async () => {
    if (started) return;
    try {
      const a = new FeelingsAudio();
      await a.start();
      audioRef.current = a;
    } catch {
      setAudioFailed(true);
    }
    lastTouchRef.current = performance.now();
    setStarted(true);
  }, [started]);

  // ── main animation + audio-morph loop ─────────────────────────────────────
  useEffect(() => {
    if (!started) return;

    const tick = () => {
      const now = performance.now();

      // Hands-off auto-drift: slow Lissajous path if idle.
      if (!draggingRef.current && now - lastTouchRef.current > IDLE_MS) {
        const t = now / 1000;
        posRef.current = {
          x: clamp01(0.5 + 0.36 * Math.sin(t * 0.21)),
          y: clamp01(0.5 + 0.34 * Math.sin(t * 0.27 + 1.1)),
        };
      }

      // Smooth toward target.
      const s = smoothRef.current;
      const p = posRef.current;
      s.x += (p.x - s.x) * 0.12;
      s.y += (p.y - s.y) * 0.12;

      const f = computeFeeling(s.x, s.y);
      audioRef.current?.morph(f);

      // Soft bell sparkle trail while moving.
      const moved =
        Math.abs(p.x - s.x) + Math.abs(p.y - s.y) > 0.004 ||
        (!draggingRef.current && now - lastTouchRef.current > IDLE_MS);
      if (moved && now - lastSparkleRef.current > 320) {
        lastSparkleRef.current = now;
        const scale = [0, 2, 4, 7, 9, 12];
        const note = scale[Math.floor((1 - s.y) * scale.length) % scale.length];
        audioRef.current?.sparkle(note);
      }

      // Drive the DOM/SVG directly via refs for 60fps without re-render.
      const pal = palette(f.w);
      const wrap = wrapRef.current;
      if (wrap) {
        wrap.style.setProperty("--sky-top", pal.skyTop);
        wrap.style.setProperty("--sky-bottom", pal.skyBottom);
        wrap.style.setProperty("--glow", pal.glowStr);
        wrap.style.setProperty("--glow-soft", rgbStr(pal.glow, 0.55));
        wrap.style.setProperty("--sun-x", `${s.x * 100}%`);
        wrap.style.setProperty("--sun-y", `${s.y * 100}%`);
        wrap.style.setProperty("--add", `${f.addLevel.toFixed(3)}`);
      }

      // Low-rate React mirror for the sun's face mouth + labels (~6fps).
      if (now - (lastFaceRef.current ?? 0) > 160) {
        lastFaceRef.current = now;
        setFeeling(f);
      }

      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    const audio = audioRef.current;
    return () => {
      cancelAnimationFrame(rafRef.current);
      audio?.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started]);

  // Mouth path: happy = big smile, cozy = gentle, floaty = small o, dreamy = soft.
  const w = feeling.w;
  const smile = w.happy * 14 + w.cozy * 7 + w.floaty * 2 + w.dreamy * 9;
  const mouthPath = `M -16 6 Q 0 ${6 + smile} 16 6`;
  const eyeOpen = 5 - w.dreamy * 2.2; // dreamy → sleepy/dreamy eyes

  const labelMap: { key: keyof Feeling["w"]; emoji: string }[] = [
    { key: "happy", emoji: "😊" },
    { key: "cozy", emoji: "🫂" },
    { key: "floaty", emoji: "🎈" },
    { key: "dreamy", emoji: "✨" },
  ];
  const dominant = labelMap.reduce((a, b) => (w[a.key] >= w[b.key] ? a : b));

  return (
    <main className="relative h-[100dvh] w-full overflow-hidden bg-black text-foreground">
      <div
        ref={wrapRef}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        className="feelings-sky absolute inset-0 touch-none select-none"
        style={
          {
            "--sky-top": "rgb(255,196,92)",
            "--sky-bottom": "rgb(255,138,92)",
            "--glow": "rgb(255,226,130)",
            "--glow-soft": "rgba(255,226,130,0.55)",
            "--sun-x": "32%",
            "--sun-y": "32%",
            "--add": "0.2",
            background:
              "linear-gradient(180deg, var(--sky-top), var(--sky-bottom))",
          } as React.CSSProperties
        }
      >
        {/* drifting feeling motes */}
        {MOTES.map((m, i) => (
          <span
            key={i}
            className="mote"
            style={
              {
                left: `${m.bx}%`,
                top: `${m.by}%`,
                width: m.r * 2,
                height: m.r * 2,
                animationDelay: `${m.ph}s`,
                animationDuration: `${8 / m.sp}s`,
              } as React.CSSProperties
            }
          />
        ))}

        {/* the friendly sun */}
        <svg
          className="sun-svg"
          viewBox="-60 -60 120 120"
          aria-hidden="true"
          style={{ left: "var(--sun-x)", top: "var(--sun-y)" }}
        >
          <defs>
            <filter id="sunGlow" x="-120%" y="-120%" width="340%" height="340%">
              <feGaussianBlur stdDeviation="9" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <radialGradient id="sunFill" cx="40%" cy="35%" r="75%">
              <stop offset="0%" stopColor="#fff" stopOpacity="0.95" />
              <stop offset="60%" stopColor="var(--glow)" />
              <stop offset="100%" stopColor="var(--glow-soft)" />
            </radialGradient>
          </defs>

          {/* outer glow halo */}
          <circle r="52" fill="var(--glow-soft)" filter="url(#sunGlow)" />
          {/* dreamy shimmer ring fades in with added voice */}
          <circle
            r="46"
            fill="none"
            stroke="var(--glow)"
            strokeWidth="2"
            style={{ opacity: "var(--add)" }}
          />
          {/* sun body */}
          <circle r="38" fill="url(#sunFill)" filter="url(#sunGlow)" />
          {/* face */}
          <g fill="#4a2c1a" stroke="none">
            <ellipse cx="-13" cy="-6" rx="3.4" ry={eyeOpen} />
            <ellipse cx="13" cy="-6" rx="3.4" ry={eyeOpen} />
          </g>
          <path
            d={mouthPath}
            fill="none"
            stroke="#4a2c1a"
            strokeWidth="3.4"
            strokeLinecap="round"
          />
          {/* rosy cheeks */}
          <circle cx="-22" cy="3" r="5" fill="rgba(255,120,120,0.45)" />
          <circle cx="22" cy="3" r="5" fill="rgba(255,120,120,0.45)" />
        </svg>

        {/* decorative corner feeling hints (icons, no reading required) */}
        <div className="corner-hint" style={{ top: 16, left: 16 }}>
          😊
        </div>
        <div className="corner-hint" style={{ top: 16, right: 16 }}>
          ✨
        </div>
        <div className="corner-hint" style={{ bottom: 16, left: 16 }}>
          🫂
        </div>
        <div className="corner-hint" style={{ bottom: 16, right: 16 }}>
          🎈
        </div>

        {/* current-feeling badge (big emoji, decorative label) */}
        <div className="feeling-badge">
          <span className="feeling-emoji">{dominant.emoji}</span>
        </div>
      </div>

      {/* graceful audio-failure notice (visuals stay alive) */}
      {audioFailed && (
        <p className="absolute bottom-20 left-1/2 -translate-x-1/2 rounded-full bg-black/40 px-4 py-2 text-base text-violet-300">
          Sound is napping on this device — keep playing, the sky still moves!
        </p>
      )}

      {/* design notes corner link */}
      <Link
        href="#notes"
        onClick={(e) => {
          e.preventDefault();
          setShowNotes((v) => !v);
        }}
        className="absolute bottom-3 right-3 z-20 rounded-full bg-muted px-3 py-1.5 text-base text-muted-foreground backdrop-blur hover:text-foreground"
      >
        Read the design notes
      </Link>

      {showNotes && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/70 p-6 backdrop-blur">
          <div className="max-w-md rounded-3xl bg-zinc-900/90 p-6 text-foreground shadow-2xl">
            <h2 className="text-xl font-semibold text-foreground">
              Feelings Sun — design notes
            </h2>
            <p className="mt-3 text-base text-foreground">
              Drag the friendly sun across the feelings-sky. Its position
              bilinearly blends four chord <em>feelings</em>: up-left is bright
              <strong> happy</strong> (major), down-left is{" "}
              <strong>cozy</strong> (minor), down-right is{" "}
              <strong>floaty</strong> (suspended), up-right is{" "}
              <strong>dreamy</strong> (add9/maj7).
            </p>
            <p className="mt-3 text-base text-muted-foreground">
              A root drone and a perfect fifth are always sounding, so the
              harmony is always in tune. Two color voices glide continuously —
              never re-triggered — so the chord morphs with no clicks. Inspired
              by Russell&apos;s circumplex of affect and Hevner&apos;s mode/tone
              associations.
            </p>
            <button
              onClick={() => setShowNotes(false)}
              className="mt-5 rounded-full bg-muted px-5 py-2 text-base text-foreground hover:bg-accent"
            >
              Back to playing
            </button>
          </div>
        </div>
      )}

      {/* tap-to-start overlay (iOS audio unlock inside gesture) */}
      {!started && (
        <button
          onClick={handleStart}
          className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-gradient-to-b from-violet-300 via-violet-300 to-violet-400 text-center"
        >
          <span className="text-7xl drop-shadow-lg">🌞</span>
          <span className="mt-6 text-2xl font-semibold text-foreground drop-shadow">
            Tap to play with the Feelings Sun
          </span>
          <span className="mt-2 text-base text-foreground">
            Drag the sun around the sky
          </span>
        </button>
      )}

      <StyleBlock />
    </main>
  );
}

// Local style block kept separate so JSX above stays readable.
function StyleBlock() {
  return (
    <style>{`
      .feelings-sky { transition: background 0.4s linear; }
      .sun-svg {
        position: absolute;
        width: 42vmin; height: 42vmin;
        min-width: 200px; min-height: 200px;
        transform: translate(-50%, -50%);
        cursor: grab;
        filter: drop-shadow(0 0 24px var(--glow-soft));
        animation: sunBob 5s ease-in-out infinite;
      }
      .sun-svg:active { cursor: grabbing; }
      @keyframes sunBob {
        0%,100% { margin-top: 0; }
        50% { margin-top: -6px; }
      }
      .mote {
        position: absolute;
        border-radius: 9999px;
        background: var(--glow);
        opacity: 0.5;
        filter: blur(1px);
        pointer-events: none;
        animation-name: moteFloat;
        animation-timing-function: ease-in-out;
        animation-iteration-count: infinite;
      }
      @keyframes moteFloat {
        0%   { transform: translate(0,0) scale(0.9); opacity: 0.25; }
        50%  { transform: translate(14px,-26px) scale(1.15); opacity: 0.65; }
        100% { transform: translate(0,0) scale(0.9); opacity: 0.25; }
      }
      .corner-hint {
        position: absolute;
        font-size: 30px;
        opacity: 0.55;
        pointer-events: none;
        user-select: none;
      }
      .feeling-badge {
        position: absolute;
        top: 50%; left: 50%;
        transform: translate(-50%, calc(-50% - 30vmin));
        pointer-events: none;
      }
      .feeling-emoji {
        font-size: 40px;
        filter: drop-shadow(0 2px 6px rgba(0,0,0,0.35));
      }
    `}</style>
  );
}
