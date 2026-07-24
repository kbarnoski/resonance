"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createCommaAudio, type CommaAudio } from "./audio";

// ---------------------------------------------------------------------------
// The math of the comma.
//   A pure fifth is 3:2. In cents that is 1200 * log2(3/2) = 701.955 c.
//   Stack twelve of them: 12 * 701.955 = 8423.46 c.
//   Seven octaves is 7 * 1200 = 8400 c.
//   The leftover, 23.46 c, is the PYTHAGOREAN COMMA — the gap by which
//   (3/2)^12 = 129.746x overshoots 2^7 = 128x. The circle of fifths never
//   closes. "Temper" narrows every fifth by comma/12 = 1.955 c until the
//   ring snaps shut into 12-tone equal temperament.
// ---------------------------------------------------------------------------
const ROOT_HZ = 261.63; // C4
const PURE_FIFTH_CENTS = 1200 * Math.log2(1.5); // 701.955
const OCTAVE_CENTS = 1200;
const COMMA_CENTS = 12 * PURE_FIFTH_CENTS - 7 * OCTAVE_CENTS; // 23.460

function fifthCents(temper: number): number {
  return PURE_FIFTH_CENTS - temper * (COMMA_CENTS / 12);
}
function fifthRatio(temper: number): number {
  return Math.pow(2, fifthCents(temper) / 1200);
}
function commaError(temper: number): number {
  return COMMA_CENTS * (1 - temper);
}

// Lower voice of the currently sounding fifth: fold the pitch class of the
// (idx-1)th stacked note into one audible octave above the root.
function lowerHzFor(idx: number, temper: number): number {
  const base = Math.max(0, idx - 1);
  const pc = ((base * fifthCents(temper)) % OCTAVE_CENTS + OCTAVE_CENTS) %
    OCTAVE_CENTS;
  return ROOT_HZ * Math.pow(2, pc / 1200);
}

// --- deterministic idle self-demo clock -----------------------------------
const STEP_S = 1.1; // seconds per stacked fifth
const WALK_S = 11 * STEP_S; // 0 -> 12 fifths
const HOLD1_S = 1.4; // dwell on the overshoot
const UP_S = 4.2; // temper 0 -> 1
const HOLD2_S = 1.4; // dwell on the closed ring
const DOWN_S = 3.0; // temper 1 -> 0
const CYCLE_S = WALK_S + HOLD1_S + UP_S + HOLD2_S + DOWN_S;

interface DemoState {
  n: number;
  temper: number;
  justClosedWalk: boolean; // true on the frame the 12th fifth lands
}

function demoAt(elapsed: number, prevN: number): DemoState {
  const c = elapsed % CYCLE_S;
  if (c < WALK_S) {
    const n = Math.min(12, Math.floor(c / STEP_S) + 1);
    return { n, temper: 0, justClosedWalk: n === 12 && prevN < 12 };
  }
  let t = c - WALK_S;
  if (t < HOLD1_S) return { n: 12, temper: 0, justClosedWalk: false };
  t -= HOLD1_S;
  if (t < UP_S)
    return { n: 12, temper: t / UP_S, justClosedWalk: false };
  t -= UP_S;
  if (t < HOLD2_S) return { n: 12, temper: 1, justClosedWalk: false };
  t -= HOLD2_S;
  return { n: 12, temper: 1 - t / DOWN_S, justClosedWalk: false };
}

const TAU = Math.PI * 2;

export default function Page() {
  const [started, setStarted] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [audioNotice, setAudioNotice] = useState<string | null>(null);

  // Display state (mirrored from refs so readouts + slider stay live).
  const [n, setN] = useState(1);
  const [temper, setTemper] = useState(0);
  const [autonomous, setAutonomous] = useState(true);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioRef = useRef<CommaAudio | null>(null);
  const rafRef = useRef<number | null>(null);

  const nRef = useRef(1);
  const temperRef = useRef(0);
  const autoRef = useRef(true);
  const startedRef = useRef(false);
  const demoStartRef = useRef(0);
  const spinRef = useRef(0);

  // Handoff: any user gesture stops the demo and pins the current state.
  const takeOver = useCallback(() => {
    if (autoRef.current) {
      autoRef.current = false;
      setAutonomous(false);
    }
  }, []);

  const resumeDemo = useCallback(() => {
    autoRef.current = true;
    setAutonomous(true);
    demoStartRef.current = performance.now();
  }, []);

  const addFifth = useCallback(() => {
    takeOver();
    const next = Math.min(12, nRef.current + 1);
    nRef.current = next;
    setN(next);
  }, [takeOver]);

  const resetStack = useCallback(() => {
    takeOver();
    nRef.current = 1;
    setN(1);
  }, [takeOver]);

  const onTemper = useCallback(
    (v: number) => {
      takeOver();
      temperRef.current = v;
      setTemper(v);
    },
    [takeOver]
  );

  const start = useCallback(async () => {
    const engine = createCommaAudio();
    audioRef.current = engine;
    try {
      await engine.start();
    } catch {
      setAudioNotice(
        "Audio could not start on this device — the spiral still runs silently."
      );
    }
    demoStartRef.current = performance.now();
    startedRef.current = true;
    setStarted(true);
  }, []);

  // --- animation + audio drive loop ---------------------------------------
  useEffect(() => {
    if (!started) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx2d = canvas.getContext("2d");
    if (!ctx2d) return;

    let lastDisplayN = -1;
    let lastDisplayTemper = -1;

    const resize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      const size = Math.min(parent.clientWidth, parent.clientHeight);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(size * dpr);
      canvas.height = Math.round(size * dpr);
      canvas.style.width = `${size}px`;
      canvas.style.height = `${size}px`;
    };
    resize();
    const ro = new ResizeObserver(resize);
    if (canvas.parentElement) ro.observe(canvas.parentElement);

    const frame = () => {
      // ---- advance state ----
      if (autoRef.current) {
        const elapsed = (performance.now() - demoStartRef.current) / 1000;
        const d = demoAt(elapsed, nRef.current);
        nRef.current = d.n;
        temperRef.current = d.temper;
        if (d.justClosedWalk && audioRef.current) {
          // Wolf: sound the leftover comma as a rough near-unison.
          const lo = lowerHzFor(12, 0);
          audioRef.current.ping(lo, lo * Math.pow(2, COMMA_CENTS / 1200));
        }
      }
      const curN = nRef.current;
      const curT = temperRef.current;

      // ---- audio ----
      if (audioRef.current) {
        audioRef.current.setInterval(
          lowerHzFor(curN, curT),
          fifthRatio(curT)
        );
      }

      // ---- mirror to React (throttled to real changes) ----
      if (curN !== lastDisplayN) {
        lastDisplayN = curN;
        setN(curN);
      }
      if (Math.abs(curT - lastDisplayTemper) > 0.002) {
        lastDisplayTemper = curT;
        setTemper(curT);
      }

      spinRef.current += 0.0011;
      drawScene(ctx2d, canvas.width, canvas.height, curN, curT, spinRef.current);
      rafRef.current = requestAnimationFrame(frame);
    };
    rafRef.current = requestAnimationFrame(frame);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      ro.disconnect();
    };
  }, [started]);

  // Cleanup audio on unmount.
  useEffect(() => {
    return () => {
      audioRef.current?.dispose();
      audioRef.current = null;
    };
  }, []);

  const centsErr = commaError(temper);
  const fifthC = fifthCents(temper);
  const closed = Math.abs(centsErr) < 0.05;

  return (
    <div className="dark relative flex min-h-[calc(100vh-3rem)] w-full flex-col bg-[#0d0b13] text-foreground">
      {/* header block */}
      <div className="relative z-10 px-5 pt-6 sm:px-8">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          Dream / 2428 · circle of fifths
        </p>
        <h1 className="mt-2 max-w-2xl text-2xl font-semibold tracking-tight text-foreground">
          The circle of fifths that will not close
        </h1>
        <p className="mt-2 max-w-2xl text-base text-muted-foreground">
          Stack twelve pure 3:2 fifths and you land a Pythagorean comma sharp
          of where you began. Hear it, see the ring fail to shut — then temper
          it closed.
        </p>
      </div>

      <button
        onClick={() => setNotesOpen(true)}
        className="absolute right-4 top-4 z-20 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        Read the design notes
      </button>

      {/* stage */}
      <div className="relative flex w-full flex-1 items-center justify-center px-4 py-4">
        <div className="relative aspect-square w-full max-w-[560px]">
          <canvas ref={canvasRef} className="h-full w-full" />
          {!started && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 rounded-lg bg-[#0d0b13]/70 backdrop-blur-sm">
              <button
                onClick={start}
                className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Start — stack the fifths
              </button>
              <p className="max-w-xs text-center text-sm text-muted-foreground">
                Sound and motion begin at once. It will demo itself; touch any
                control to take over.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* readouts + controls */}
      <div className="relative z-10 border-t border-border bg-background/40 px-5 py-5 sm:px-8">
        <div className="flex flex-wrap items-end gap-x-8 gap-y-4">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Cents error vs. octave
            </p>
            <p
              className={`mt-1 text-2xl font-semibold tabular-nums ${
                closed ? "text-primary" : "text-foreground"
              }`}
            >
              {centsErr >= 0.05 ? "+" : ""}
              {centsErr.toFixed(2)}
              <span className="text-base font-normal text-muted-foreground">
                {" "}
                ¢
              </span>
            </p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {closed
                ? "closed — 12-tone equal temperament"
                : "the ring will not close"}
            </p>
          </div>

          <div>
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Fifths stacked
            </p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
              {n}
              <span className="text-base font-normal text-muted-foreground">
                {" "}
                / 12
              </span>
            </p>
            <p className="mt-0.5 text-sm text-muted-foreground tabular-nums">
              each fifth {fifthC.toFixed(2)}¢
            </p>
          </div>

          <div className="min-w-[220px] flex-1">
            <div className="flex items-center justify-between">
              <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                Temper
              </p>
              <span className="font-mono text-xs tabular-nums text-muted-foreground">
                {(temper * 100).toFixed(0)}%
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={1}
              step={0.001}
              value={temper}
              disabled={!started}
              onChange={(e) => onTemper(parseFloat(e.target.value))}
              className="mt-3 w-full accent-primary disabled:opacity-40"
              aria-label="Temper the fifths"
            />
            <div className="mt-1 flex justify-between text-xs text-muted-foreground">
              <span>pure (just)</span>
              <span>equal temperament</span>
            </div>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button
            onClick={addFifth}
            disabled={!started}
            className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40"
          >
            Add a pure fifth
          </button>
          <button
            onClick={resetStack}
            disabled={!started}
            className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40"
          >
            Reset to root
          </button>
          <button
            onClick={resumeDemo}
            disabled={!started || autonomous}
            className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40"
          >
            {autonomous ? "auto-demo running" : "Resume auto-demo"}
          </button>
        </div>

        {audioNotice && (
          <p className="mt-4 text-sm text-destructive">{audioNotice}</p>
        )}
      </div>

      {notesOpen && (
        <DesignNotes onClose={() => setNotesOpen(false)} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Canvas art. Spiral of fifths that overshoots at temper 0 and collapses to
// a closed 12-point ring at temper 1.
// ---------------------------------------------------------------------------
function drawScene(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  n: number,
  temper: number,
  spin: number
) {
  ctx.fillStyle = "#0d0b13";
  ctx.fillRect(0, 0, W, H);

  const cx = W / 2;
  const cy = H / 2;
  const maxR = Math.min(W, H) * 0.4;
  const R0 = maxR * 0.34;
  const dr = (maxR - R0) / 11;
  const start = -Math.PI / 2 + spin;
  const fC = fifthCents(temper);

  const VIOLET = "rgb(150,122,226)";
  const WARM = "rgb(240,176,96)";

  const angleOf = (i: number) => start + (i * fC) / 1200 * TAU;
  const radiusOf = (i: number) => R0 + i * dr * (1 - temper);
  const pointOf = (i: number): [number, number] => {
    const a = angleOf(i);
    const r = radiusOf(i);
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  };

  // Faint reference: the 12 equal-tempered target slots on the inner ring.
  ctx.save();
  for (let i = 0; i < 12; i++) {
    const a = start + (i * (7 / 12)) * TAU; // ET fifths = 700c = 7/12 turn
    const x = cx + R0 * Math.cos(a);
    const y = cy + R0 * Math.sin(a);
    ctx.beginPath();
    ctx.arc(x, y, 2.4, 0, TAU);
    ctx.fillStyle = "rgba(150,122,226,0.28)";
    ctx.fill();
  }
  ctx.restore();

  // The "should-close" ray: where the 13th note lands after exactly 7 turns.
  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,0.10)";
  ctx.setLineDash([4, 6]);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + maxR * 1.02 * Math.cos(start), cy + maxR * 1.02 * Math.sin(start));
  ctx.stroke();
  ctx.restore();

  // The winding thread through all stacked fifths.
  ctx.save();
  ctx.strokeStyle = "rgba(150,122,226,0.55)";
  ctx.lineWidth = 1.6;
  ctx.shadowColor = VIOLET;
  ctx.shadowBlur = 10;
  ctx.beginPath();
  for (let i = 0; i <= n; i++) {
    const [x, y] = pointOf(i);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.restore();

  // The comma gap — the arc between where the spiral ended and the start ray.
  if (n >= 12) {
    const rGap = radiusOf(12);
    const aEnd = angleOf(12);
    const aClose = start + 7 * TAU; // same ray as the root
    ctx.save();
    ctx.strokeStyle = WARM;
    ctx.lineWidth = 5;
    ctx.shadowColor = WARM;
    ctx.shadowBlur = 14;
    ctx.beginPath();
    ctx.arc(cx, cy, rGap, aClose, aEnd, aEnd < aClose);
    ctx.stroke();
    ctx.restore();

    // label the gap
    if (commaError(temper) > 0.4) {
      const aMid = (aClose + aEnd) / 2;
      const lx = cx + (rGap + 22) * Math.cos(aMid);
      const ly = cy + (rGap + 22) * Math.sin(aMid);
      ctx.save();
      ctx.fillStyle = WARM;
      ctx.font =
        "600 13px ui-monospace, SFMono-Regular, Menlo, monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(`+${commaError(temper).toFixed(1)}¢`, lx, ly);
      ctx.restore();
    }
  }

  // Points.
  for (let i = 0; i <= n; i++) {
    const [x, y] = pointOf(i);
    const isRoot = i === 0;
    const isLatest = i === n;
    const rad = isRoot ? 7 : isLatest ? 6 : 4;
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, rad, 0, TAU);
    if (isRoot) {
      ctx.fillStyle = "rgba(255,255,255,0.95)";
    } else if (isLatest) {
      ctx.fillStyle = WARM;
      ctx.shadowColor = WARM;
      ctx.shadowBlur = 12;
    } else {
      ctx.fillStyle = VIOLET;
      ctx.shadowColor = VIOLET;
      ctx.shadowBlur = 8;
    }
    ctx.fill();
    ctx.restore();
  }

  // Center readout for a silent glance.
  const err = commaError(temper);
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = err < 0.05 ? VIOLET : WARM;
  ctx.font = "600 26px ui-sans-serif, system-ui, sans-serif";
  ctx.fillText(`${err >= 0.05 ? "+" : ""}${err.toFixed(2)}¢`, cx, cy - 6);
  ctx.fillStyle = "rgba(255,255,255,0.5)";
  ctx.font = "500 12px ui-monospace, monospace";
  ctx.fillText(
    err < 0.05 ? "ring closed" : "comma error",
    cx,
    cy + 16
  );
  ctx.restore();
}

// ---------------------------------------------------------------------------
function DesignNotes({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="max-h-[85vh] max-w-lg overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-2xl font-semibold tracking-tight text-foreground">
          Why the circle will not close
        </h2>
        <div className="mt-4 space-y-4 text-sm leading-relaxed text-muted-foreground">
          <p>
            A perfect fifth is the ratio 3:2 — multiply a frequency by 1.5 and
            you have stepped up a fifth. In cents that step is 1200·log₂(3/2) =
            701.96¢. Stack twelve of them and you expect to arrive back at the
            root, seven octaves higher.
          </p>
          <p>
            But (3/2)¹² = 129.746, while 2⁷ = 128. Twelve pure fifths overshoot
            seven octaves by a factor of 1.0136 — the{" "}
            <span className="text-foreground">Pythagorean comma</span>, about
            23.46¢. The spiral you see winds past its own tail; the warm arc is
            that leftover gap.
          </p>
          <p>
            Drag <span className="text-foreground">Temper</span> and the comma
            is shared out evenly: each fifth is narrowed by 23.46/12 = 1.955¢,
            shrinking to 700¢ = 2^(7/12) ≈ 1.4983. Now twelve fifths make
            exactly seven octaves, the spiral collapses onto a single 12-point
            ring, and the error goes to 0¢. That is 12-tone equal temperament —
            every key equally usable, every fifth equally (slightly) wrong.
          </p>
          <p>
            Listen while you drag. Each voice is six stacked partials. A pure
            fifth locks its partials together and sits still; a tempered fifth
            pulls them a fraction of a hertz apart, so you hear the faint,
            endless beating that equal temperament trades for the ability to
            modulate. Helmholtz called this beating the seat of dissonance.
          </p>
          <p className="text-xs text-muted-foreground/70">
            After Pythagoras; J. Murray Barbour,{" "}
            <span className="italic">
              Tuning and Temperament: A Historical Survey
            </span>{" "}
            (1951); Hermann von Helmholtz,{" "}
            <span className="italic">On the Sensations of Tone</span> (1863).
          </p>
        </div>
        <button
          onClick={onClose}
          className="mt-6 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          Close
        </button>
      </div>
    </div>
  );
}
