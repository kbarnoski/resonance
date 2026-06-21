"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/*
 * 822 — Shape Drums
 * A polyrhythm toy a 4-year-old can BUILD by choosing how many sides each
 * rotating shape has (= rhythmic subdivision) and how fast it spins (= tempo).
 * Each shape carries one tone of a single warm chord, so any combination is
 * consonant — the child shapes the RHYTHM, never a "wrong note."
 */

// ---- Harmony: one warm add9 / stacked voicing. Each shape = one tone. ----
// Frequencies (Hz) for a Dadd9 / D-major-9-ish stack, low to high.
const CHORD_HZ = [
  146.83, // D3
  220.0, // A3
  293.66, // D4
  369.99, // F#4
  493.88, // B4 (the 9-ish color)
];

// Bold saturated colors on near-black.
const SHAPE_COLORS = [
  "#ff5c8a", // hot pink
  "#4dd2ff", // sky cyan
  "#ffd34d", // amber
  "#7c6cff", // violet
  "#5cffb0", // mint
];

// Speed presets snap to musically-related ratios of a base tempo so
// polyrhythms emerge clean (e.g. 3-against-2, 4-against-3).
const SPEED_PRESETS = [0.5, 1, 1.5, 2];
const BASE_ROT_PER_SEC = 0.28; // base rotations / second at ratio 1.0

const MAX_SHAPES = 5;
const MIN_SIDES = 3;
const MAX_SIDES = 8;

interface ShapeState {
  id: number;
  sides: number;
  speedRatio: number; // index into ratios via value
  colorIdx: number;
  toneIdx: number;
  angle: number; // current rotation (radians)
  flash: number; // 0..1 visual ping decay
  // for edge-detect scheduling: previous vertex-phase bucket
  lastVertex: number;
}

// The trigger line is at the TOP of each shape (angle pointing up, -PI/2).
// A vertex "pings" when it crosses that upward direction.
const TRIGGER_ANGLE = -Math.PI / 2;

function makeShape(id: number, slot: number): ShapeState {
  const sidesByDefault = [3, 4, 5, 6, 7];
  return {
    id,
    sides: sidesByDefault[slot % sidesByDefault.length],
    speedRatio: 1,
    colorIdx: slot % SHAPE_COLORS.length,
    toneIdx: slot % CHORD_HZ.length,
    angle: 0,
    flash: 0,
    lastVertex: 0,
  };
}

// ---------------- Audio ----------------
interface AudioKit {
  ctx: AudioContext;
  master: GainNode;
  delay: DelayNode;
  pad: () => void;
  stopPad: () => void;
}

function makeAudio(): AudioKit | null {
  const AC =
    typeof window !== "undefined"
      ? window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext
      : undefined;
  if (!AC) return null;
  const ctx = new AC();

  const master = ctx.createGain();
  master.gain.value = 0.0;
  master.connect(ctx.destination);
  // gentle fade-in of master so nothing clicks on start
  master.gain.setTargetAtTime(0.85, ctx.currentTime, 0.4);

  // Warmth: a soft feedback delay (light, not frantic).
  const delay = ctx.createDelay(1.0);
  delay.delayTime.value = 0.26;
  const fb = ctx.createGain();
  fb.gain.value = 0.28;
  const delayWet = ctx.createGain();
  delayWet.gain.value = 0.35;
  delay.connect(fb);
  fb.connect(delay);
  delay.connect(delayWet);
  delayWet.connect(master);

  // Soft sustained pad so it's never silent.
  let padNodes: { osc: OscillatorNode; gain: GainNode }[] = [];
  const padGain = ctx.createGain();
  padGain.gain.value = 0.0;
  const padFilter = ctx.createBiquadFilter();
  padFilter.type = "lowpass";
  padFilter.frequency.value = 900;
  padGain.connect(padFilter);
  padFilter.connect(master);

  const pad = () => {
    if (padNodes.length) return;
    // Pad on the two lowest chord tones for a warm bed.
    [CHORD_HZ[0], CHORD_HZ[1]].forEach((hz, i) => {
      const osc = ctx.createOscillator();
      osc.type = "triangle";
      osc.frequency.value = hz;
      osc.detune.value = i === 0 ? -4 : 5;
      const g = ctx.createGain();
      g.gain.value = i === 0 ? 0.5 : 0.32;
      osc.connect(g);
      g.connect(padGain);
      osc.start();
      padNodes.push({ osc, gain: g });
    });
    padGain.gain.setTargetAtTime(0.12, ctx.currentTime, 1.2);
  };
  const stopPad = () => {
    padGain.gain.setTargetAtTime(0.0, ctx.currentTime, 0.3);
    const nodes = padNodes;
    padNodes = [];
    window.setTimeout(() => {
      nodes.forEach((n) => {
        try {
          n.osc.stop();
        } catch {
          /* noop */
        }
      });
    }, 600);
  };

  return { ctx, master, delay, pad, stopPad };
}

// Synthesize a soft marimba/bell-ish ping. Soft transients only.
function schedulePing(kit: AudioKit, hz: number, when: number, vel: number) {
  const { ctx, master, delay } = kit;
  const t = Math.max(when, ctx.currentTime + 0.001);

  const out = ctx.createGain();
  out.gain.value = 0;
  const peak = 0.22 * vel;
  // soft attack (no instant jump), exponential-ish decay
  out.gain.setValueAtTime(0.0001, t);
  out.gain.linearRampToValueAtTime(peak, t + 0.012);
  out.gain.setTargetAtTime(0.0001, t + 0.012, 0.18);

  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.setValueAtTime(2600, t);
  lp.frequency.setTargetAtTime(900, t, 0.2);

  out.connect(lp);
  lp.connect(master);
  lp.connect(delay);

  // 3 detuned partials: fundamental + a soft octave + a fifth shimmer.
  const partials: { mult: number; type: OscillatorType; g: number; det: number }[] =
    [
      { mult: 1, type: "sine", g: 1.0, det: 0 },
      { mult: 2.01, type: "sine", g: 0.32, det: 4 },
      { mult: 3.0, type: "triangle", g: 0.14, det: -6 },
    ];
  const stopAt = t + 1.4;
  partials.forEach((p) => {
    const osc = ctx.createOscillator();
    osc.type = p.type;
    osc.frequency.value = hz * p.mult;
    osc.detune.value = p.det;
    const pg = ctx.createGain();
    pg.gain.value = p.g;
    osc.connect(pg);
    pg.connect(out);
    osc.start(t);
    osc.stop(stopAt);
  });
}

// ---------------- Geometry helpers ----------------
function shapeRadius(canvasMin: number, count: number): number {
  // Shapes shrink a touch as you add more, so 4-5 still fit.
  const base = canvasMin * 0.18;
  const scale = count >= 4 ? 0.82 : count === 3 ? 0.9 : 1;
  return base * scale;
}

interface Layout {
  cx: number;
  cy: number;
  r: number;
}

function layoutFor(
  index: number,
  count: number,
  w: number,
  h: number
): Layout {
  const r = shapeRadius(Math.min(w, h), count);
  if (count === 1) return { cx: w / 2, cy: h * 0.46, r };
  // Arrange in a gentle row, wrapping to 2 rows for 4-5.
  const perRow = count <= 3 ? count : Math.ceil(count / 2);
  const rows = count <= 3 ? 1 : 2;
  const row = Math.floor(index / perRow);
  const col = index % perRow;
  const colsThisRow =
    row === rows - 1 ? count - perRow * (rows - 1) : perRow;
  const gapX = w / (colsThisRow + 1);
  const cx = gapX * (col + 1);
  const cy = rows === 1 ? h * 0.46 : h * (row === 0 ? 0.34 : 0.64);
  return { cx, cy, r };
}

function drawPolygon(
  ctx: CanvasRenderingContext2D,
  layout: Layout,
  s: ShapeState,
  color: string
) {
  const { cx, cy, r } = layout;
  // Trigger line across the top of the shape.
  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,0.16)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx - r * 1.25, cy - r);
  ctx.lineTo(cx + r * 1.25, cy - r);
  ctx.stroke();
  ctx.restore();

  // Glow flash ripple when pinging.
  if (s.flash > 0.01) {
    ctx.save();
    const rr = r * (1 + (1 - s.flash) * 0.7);
    ctx.globalAlpha = s.flash * 0.5;
    ctx.strokeStyle = color;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(cx, cy, rr, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // Polygon body.
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(s.angle);
  ctx.beginPath();
  for (let i = 0; i < s.sides; i++) {
    const a = TRIGGER_ANGLE + (i / s.sides) * Math.PI * 2;
    const px = Math.cos(a) * r;
    const py = Math.sin(a) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = color + "33";
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 12 + s.flash * 26;
  ctx.stroke();

  // Ping dots on each vertex.
  for (let i = 0; i < s.sides; i++) {
    const a = TRIGGER_ANGLE + (i / s.sides) * Math.PI * 2;
    const px = Math.cos(a) * r;
    const py = Math.sin(a) * r;
    ctx.beginPath();
    ctx.arc(px, py, 6, 0, Math.PI * 2);
    ctx.fillStyle = "#fff";
    ctx.shadowBlur = 8;
    ctx.fill();
  }
  ctx.restore();

  // Center remove hint (subtle dot).
  ctx.save();
  ctx.globalAlpha = 0.5;
  ctx.fillStyle = "rgba(255,255,255,0.5)";
  ctx.beginPath();
  ctx.arc(cx, cy, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export default function ShapeDrumsPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [started, setStarted] = useState(false);
  const [audioOk, setAudioOk] = useState(true);
  const [shapes, setShapes] = useState<ShapeState[]>([makeShape(1, 0)]);
  const [showNotes, setShowNotes] = useState(false);

  // Mutable refs the rAF loop reads (avoids re-subscribing each render).
  const shapesRef = useRef<ShapeState[]>(shapes);
  const kitRef = useRef<AudioKit | null>(null);
  const rafRef = useRef<number>(0);
  const lastTsRef = useRef<number>(0);
  const layoutsRef = useRef<Layout[]>([]);
  const idRef = useRef<number>(2);

  useEffect(() => {
    shapesRef.current = shapes;
  }, [shapes]);

  // ---- Start audio on first gesture ----
  const start = useCallback(() => {
    if (started) return;
    setStarted(true);
    const kit = makeAudio();
    if (!kit) {
      setAudioOk(false);
      return;
    }
    kitRef.current = kit;
    kit.ctx
      .resume()
      .then(() => kit.pad())
      .catch(() => setAudioOk(false));
  }, [started]);

  // ---- Animation + scheduling loop ----
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const frame = (ts: number) => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      const dt = lastTsRef.current ? (ts - lastTsRef.current) / 1000 : 0;
      lastTsRef.current = ts;
      const dtClamped = Math.min(dt, 0.05);

      const list = shapesRef.current;
      layoutsRef.current = list.map((_, i) => layoutFor(i, list.length, w, h));

      // Background.
      ctx.clearRect(0, 0, w, h);
      const grad = ctx.createRadialGradient(
        w / 2,
        h * 0.4,
        20,
        w / 2,
        h * 0.4,
        Math.max(w, h)
      );
      grad.addColorStop(0, "#0e0e1a");
      grad.addColorStop(1, "#050507");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      const kit = kitRef.current;
      for (let i = 0; i < list.length; i++) {
        const s = list[i];
        // Advance rotation.
        const rotPerSec = BASE_ROT_PER_SEC * s.speedRatio;
        s.angle += rotPerSec * Math.PI * 2 * dtClamped;
        if (s.angle > Math.PI * 2) s.angle -= Math.PI * 2;

        // Vertex-crossing edge detect: which vertex bucket is at the top now?
        // A vertex sits at the trigger when (angle + k*2pi/sides) ~ 0 mod 2pi.
        // Track the integer count of vertices that have passed the top.
        const phase = (s.angle / (Math.PI * 2)) * s.sides;
        const vertexCount = Math.floor(phase);
        if (vertexCount !== s.lastVertex) {
          // One or more vertices crossed (usually 1).
          const crossings = vertexCount - s.lastVertex;
          s.lastVertex = vertexCount;
          if (crossings > 0 && started && kit && audioOk) {
            schedulePing(
              kit,
              CHORD_HZ[s.toneIdx % CHORD_HZ.length],
              kit.ctx.currentTime + 0.005,
              0.85
            );
          }
          s.flash = 1;
        }

        // Decay flash.
        s.flash = Math.max(0, s.flash - dtClamped * 3.2);

        drawPolygon(ctx, layoutsRef.current[i], s, SHAPE_COLORS[s.colorIdx]);
      }

      rafRef.current = requestAnimationFrame(frame);
    };
    rafRef.current = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
    };
    // started/audioOk read via closure but values captured; restart loop when they change.
  }, [started, audioOk]);

  // ---- Cleanup audio on unmount ----
  useEffect(() => {
    return () => {
      const kit = kitRef.current;
      if (kit) {
        try {
          kit.stopPad();
          kit.ctx.close();
        } catch {
          /* noop */
        }
      }
    };
  }, []);

  // ---- Pointer interaction ----
  const hitTest = (x: number, y: number): number => {
    const list = shapesRef.current;
    const layouts = layoutsRef.current;
    for (let i = list.length - 1; i >= 0; i--) {
      const lo = layouts[i];
      if (!lo) continue;
      if (Math.hypot(x - lo.cx, y - lo.cy) <= lo.r * 1.05) return i;
    }
    return -1;
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!started) {
      start();
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const idx = hitTest(x, y);
    if (idx < 0) return;
    const lo = layoutsRef.current[idx];
    const distCenter = Math.hypot(x - lo.cx, y - lo.cy);

    // Tap near very center => remove shape.
    if (distCenter <= lo.r * 0.32) {
      setShapes((prev) =>
        prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev
      );
      return;
    }

    // Tap elsewhere on the shape => cycle number of sides (3..8, wrap).
    setShapes((prev) =>
      prev.map((s, i) =>
        i === idx
          ? {
              ...s,
              sides:
                s.sides >= MAX_SIDES ? MIN_SIDES : s.sides + 1,
              lastVertex: Math.floor(
                (s.angle / (Math.PI * 2)) *
                  (s.sides >= MAX_SIDES ? MIN_SIDES : s.sides + 1)
              ),
            }
          : s
      )
    );
    // Immediate audible feedback on the tap.
    const kit = kitRef.current;
    if (kit && audioOk) {
      schedulePing(
        kit,
        CHORD_HZ[shapesRef.current[idx].toneIdx % CHORD_HZ.length],
        kit.ctx.currentTime + 0.005,
        0.7
      );
    }
  };

  const addShape = () => {
    if (!started) {
      start();
      return;
    }
    setShapes((prev) => {
      if (prev.length >= MAX_SHAPES) return prev;
      const slot = prev.length;
      const ns = makeShape(idRef.current++, slot);
      return [...prev, ns];
    });
  };

  const cycleSpeed = (idx: number) => {
    setShapes((prev) =>
      prev.map((s, i) => {
        if (i !== idx) return s;
        const cur = SPEED_PRESETS.indexOf(s.speedRatio);
        const next = SPEED_PRESETS[(cur + 1) % SPEED_PRESETS.length];
        return { ...s, speedRatio: next };
      })
    );
  };

  return (
    <main className="relative h-dvh w-screen overflow-hidden bg-[#050507] text-white">
      {/* Full-bleed animated canvas */}
      <canvas
        ref={canvasRef}
        onPointerDown={onPointerDown}
        className="absolute inset-0 h-full w-full touch-none"
      />

      {/* Header */}
      <div className="pointer-events-none absolute left-0 right-0 top-0 z-10 flex flex-col gap-1 p-5">
        <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
          Shape Drums
        </h1>
        <p className="max-w-md text-base text-white/80">
          Build a rhythm by spinning shapes. More sides = more pings. Tap a
          shape to change its sides; the dots make the beat.
        </p>
      </div>

      {/* Controls: + add, and per-shape speed buttons */}
      {started && (
        <div className="absolute bottom-0 left-0 right-0 z-10 flex flex-col gap-3 p-5">
          {/* Speed buttons row — one giant button per shape */}
          <div className="flex flex-wrap items-center gap-3">
            {shapes.map((s, i) => (
              <button
                key={s.id}
                onClick={() => cycleSpeed(i)}
                aria-label={`Change spin speed of shape ${i + 1}`}
                className="flex h-16 min-w-16 items-center justify-center gap-2 rounded-2xl border-2 px-4 py-2.5 text-base font-semibold transition active:scale-95"
                style={{
                  borderColor: SHAPE_COLORS[s.colorIdx],
                  color: SHAPE_COLORS[s.colorIdx],
                  backgroundColor: SHAPE_COLORS[s.colorIdx] + "22",
                }}
              >
                <span aria-hidden className="text-2xl">
                  {s.speedRatio <= 0.5
                    ? "🐢"
                    : s.speedRatio >= 2
                    ? "🐇"
                    : s.speedRatio >= 1.5
                    ? "✦"
                    : "•"}
                </span>
                <span className="font-mono">×{s.speedRatio}</span>
              </button>
            ))}
          </div>

          <div className="flex items-center justify-between gap-3">
            <button
              onClick={addShape}
              disabled={shapes.length >= MAX_SHAPES}
              aria-label="Add a new shape"
              className="flex h-20 w-20 items-center justify-center rounded-full border-2 border-white/40 bg-white/10 text-4xl font-bold text-white transition active:scale-95 disabled:opacity-30"
            >
              +
            </button>
            <p className="text-base text-white/75">
              {shapes.length >= MAX_SHAPES
                ? "Full house!"
                : "Add another shape"}
            </p>
          </div>
        </div>
      )}

      {/* Tap-to-start overlay */}
      {!started && (
        <button
          onClick={start}
          className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 bg-black/70 backdrop-blur-sm"
        >
          <span className="text-2xl font-semibold text-white sm:text-4xl">
            Tap to start
          </span>
          <span className="max-w-xs text-center text-base text-white/80">
            Make spinning shapes sing. Each shape plays a warm note that always
            fits.
          </span>
          {!audioOk && (
            <span className="text-base text-white/75">
              (Sound is off here, but the shapes still spin.)
            </span>
          )}
        </button>
      )}

      {/* Design notes affordance */}
      <button
        onClick={() => setShowNotes((v) => !v)}
        className="absolute right-4 top-4 z-20 rounded-lg border border-white/25 bg-black/40 px-4 py-2.5 text-base text-white/80 transition hover:text-white"
      >
        Read the design notes
      </button>

      {showNotes && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/80 p-6 backdrop-blur">
          <div className="max-w-lg space-y-3 rounded-2xl border border-white/15 bg-[#0c0c16] p-6">
            <h2 className="text-xl font-semibold text-white">Design notes</h2>
            <p className="text-base text-white/80">
              The number of <strong>sides</strong> a shape has is its rhythm
              subdivision — a triangle pings 3 times per spin, a hexagon 6. The
              <strong> spin speed</strong> is its tempo. Two shapes spinning at
              related speeds drift in and out of phase, so the child{" "}
              <em>builds</em> a polyrhythm (3-against-2, 4-against-3) instead of
              tapping pre-approved notes.
            </p>
            <p className="text-base text-white/80">
              Each shape carries one tone of a single warm chord, so every
              combination is consonant. There is no wrong move — only rhythm to
              shape. Inspired by the &quot;polyrhythms in shapes&quot;
              visualizations and the Steve Reich phasing / pendulum-wave
              lineage.
            </p>
            <button
              onClick={() => setShowNotes(false)}
              className="rounded-lg border border-white/25 px-4 py-2.5 text-base text-white/90 hover:text-white"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
