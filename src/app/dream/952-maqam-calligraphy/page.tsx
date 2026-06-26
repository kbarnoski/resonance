"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { MAQAMAT, MaqamName, TET_LINES } from "./maqam";
import {
  advance,
  initSayr,
  nextPhrase,
  NoteEvent,
  SayrState,
  Stage,
  stageAt,
  STAGE_LABEL,
} from "./sayr";
import { AudioEngine, buildEngine, playNote, teardown } from "./audio";

// ── pitch ↔ screen mapping ────────────────────────────────────────────────
const TONIC_HZ = 293.66; // D
const CENTS_LO = -260;
const CENTS_HI = 1460;

// A point along the written brushstroke (history for the scrolling line).
interface StrokePoint {
  t: number; // ms timestamp
  cents: number;
  weight: number; // stroke weight
  hue: number;
  rest: boolean;
  glideFrom: number | null; // for curved sweep rendering
  flourish: boolean; // grace/trill → little loop
}

const MAQAM_NAMES = Object.keys(MAQAMAT) as MaqamName[];

interface UiState {
  maqam: string;
  jins: string;
  stage: Stage;
  pos: number;
  lastMod: string | null;
}

export default function MaqamCalligraphy() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [started, setStarted] = useState(false);
  const [audioOk, setAudioOk] = useState<boolean | null>(null);
  const [startMaqam, setStartMaqam] = useState<MaqamName>("Rast");

  // live readouts (mirrored from refs so the UI re-renders)
  const [ui, setUi] = useState<UiState>({
    maqam: "Rast",
    jins: "Rast",
    stage: "qarar-low",
    pos: 0,
    lastMod: null,
  });

  const [showNotes, setShowNotes] = useState(false);

  // mutable engine state, kept out of React render loop
  const engRef = useRef<AudioEngine | null>(null);
  const sayrRef = useRef<SayrState | null>(null);
  const strokeRef = useRef<StrokePoint[]>([]);
  const rafRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);
  const queueRef = useRef<NoteEvent[]>([]);
  const nextNoteAtRef = useRef<number>(0);
  const tintRef = useRef<{ hue: number; flash: number }>({ hue: 42, flash: 0 });
  const demoRef = useRef<boolean>(false);

  const TOTAL_MS = 5.5 * 60 * 1000;

  // ── y mapping: pitch in cents → screen y (high pitch = top) ──
  const yFor = useCallback((cents: number, h: number) => {
    const f = (cents - CENTS_LO) / (CENTS_HI - CENTS_LO);
    return h - f * h;
  }, []);

  // ── the autonomous note clock (drives synth + appends to the stroke) ──
  const tick = useCallback(
    (nowMs: number) => {
      const sayr = sayrRef.current;
      if (!sayr) return;

      const elapsed = nowMs - startTimeRef.current;
      const mod = advance(sayr, elapsed, TOTAL_MS);
      if (mod) {
        tintRef.current.flash = 1;
        setUi((u: UiState) => ({ ...u, lastMod: mod }));
      }

      // schedule the next note when the current one's time is up
      if (nowMs >= nextNoteAtRef.current) {
        if (queueRef.current.length === 0) {
          queueRef.current = nextPhrase(sayr);
        }
        const ev = queueRef.current.shift();
        if (ev) {
          const eng = engRef.current;
          if (eng && !demoRef.current) playNote(eng, ev);

          tintRef.current.hue = ev.jinsHue;
          if (!ev.rest) {
            strokeRef.current.push({
              t: nowMs,
              cents: ev.cents,
              weight: 2 + ev.emphasis * 12,
              hue: ev.jinsHue,
              rest: false,
              glideFrom: ev.glide ? ev.prevCents : null,
              flourish: ev.grace != null || ev.trill,
            });
          }
          nextNoteAtRef.current = nowMs + ev.durationMs;
        }
      }

      // update UI readout a few times a second
      const st = stageAt(sayr.pos);
      setUi((u: UiState) =>
        u.maqam === sayr.maqam && u.stage === st && Math.abs(u.pos - sayr.pos) < 0.004
          ? u
          : { ...u, maqam: sayr.maqam, jins: sayr.def.lower, stage: st, pos: sayr.pos }
      );
    },
    [TOTAL_MS]
  );

  // ── the render loop ──
  const draw = useCallback(
    (nowMs: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== Math.floor(w * dpr) || canvas.height !== Math.floor(h * dpr)) {
        canvas.width = Math.floor(w * dpr);
        canvas.height = Math.floor(h * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const sayr = sayrRef.current;

      // ── ground: deep ink-blue with gold margin illumination ──
      const bg = ctx.createLinearGradient(0, 0, 0, h);
      bg.addColorStop(0, "#0a0e1f");
      bg.addColorStop(0.5, "#0d1226");
      bg.addColorStop(1, "#080a18");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);

      // illuminated-manuscript frame (soft gold margins)
      const margin = 26;
      ctx.save();
      ctx.strokeStyle = "rgba(214,176,92,0.32)";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(margin, margin, w - margin * 2, h - margin * 2);
      ctx.strokeStyle = "rgba(214,176,92,0.14)";
      ctx.lineWidth = 4;
      ctx.strokeRect(margin - 6, margin - 6, w - (margin - 6) * 2, h - (margin - 6) * 2);
      // corner gold glow
      const corners: [number, number][] = [
        [margin, margin],
        [w - margin, margin],
        [margin, h - margin],
        [w - margin, h - margin],
      ];
      corners.forEach(([cx, cy]) => {
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, 60);
        g.addColorStop(0, "rgba(220,182,98,0.18)");
        g.addColorStop(1, "rgba(220,182,98,0)");
        ctx.fillStyle = g;
        ctx.fillRect(cx - 60, cy - 60, 120, 120);
      });
      ctx.restore();

      // tint flash on modulation: a wash across the field
      const tint = tintRef.current;
      if (tint.flash > 0.001) {
        ctx.fillStyle = `hsla(${tint.hue}, 70%, 55%, ${0.12 * tint.flash})`;
        ctx.fillRect(0, 0, w, h);
        tint.flash *= 0.94;
      }

      // ── faint ghost 12-TET grid (dimmer, for contrast) ──
      ctx.save();
      ctx.strokeStyle = "rgba(150,170,210,0.06)";
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 8]);
      for (const c of TET_LINES) {
        const y = yFor(c, h);
        ctx.beginPath();
        ctx.moveTo(margin, y);
        ctx.lineTo(w - margin, y);
        ctx.stroke();
      }
      ctx.restore();

      // ── active jins exact-cents guide-lines (gold, where quarter-tones sit) ──
      if (sayr) {
        ctx.save();
        for (const deg of sayr.scale) {
          if (deg.cents < CENTS_LO || deg.cents > CENTS_HI) continue;
          const y = yFor(deg.cents, h);
          const neutral = deg.role === "neutral";
          const tonicOrGh = deg.role === "tonic" || deg.role === "ghammaz";
          ctx.strokeStyle = neutral
            ? `hsla(${tint.hue}, 80%, 62%, 0.5)`
            : tonicOrGh
              ? "rgba(220,182,98,0.42)"
              : "rgba(200,170,110,0.16)";
          ctx.lineWidth = tonicOrGh ? 1.6 : neutral ? 1.3 : 0.8;
          ctx.beginPath();
          ctx.moveTo(margin, y);
          ctx.lineTo(w - margin, y);
          ctx.stroke();

          // label the characteristic degrees
          if (neutral || tonicOrGh) {
            ctx.fillStyle = neutral
              ? `hsla(${tint.hue}, 85%, 72%, 0.85)`
              : "rgba(232,200,128,0.85)";
            ctx.font = "12px ui-serif, Georgia, serif";
            const label =
              deg.role === "tonic"
                ? "qarar"
                : deg.role === "ghammaz"
                  ? "ghammaz"
                  : `${deg.cents}¢`;
            ctx.fillText(label, w - margin - 60, y - 4);
          }
        }
        ctx.restore();
      }

      // tanbura drone baseline glow at tonic + fifth
      [0, 700].forEach((c) => {
        const y = yFor(c, h);
        const g = ctx.createLinearGradient(0, y - 8, 0, y + 8);
        g.addColorStop(0, "rgba(222,184,100,0)");
        g.addColorStop(0.5, "rgba(222,184,100,0.22)");
        g.addColorStop(1, "rgba(222,184,100,0)");
        ctx.fillStyle = g;
        ctx.fillRect(margin, y - 8, w - margin * 2, 16);
      });

      // ── the calligraphic brushstroke (right-to-left scroll) ──
      const points = strokeRef.current;
      const WINDOW_MS = 16000; // how much recent past stays on screen
      // prune old points
      while (points.length > 1 && nowMs - points[0].t > WINDOW_MS + 2000) {
        points.shift();
      }
      const xRight = w - margin - 8;
      const xLeft = margin + 8;
      const span = xRight - xLeft;
      const xFor = (t: number) => xRight - ((nowMs - t) / WINDOW_MS) * span;

      if (points.length > 1) {
        ctx.save();
        ctx.lineCap = "round";
        ctx.lineJoin = "round";

        for (let i = 1; i < points.length; i++) {
          const a = points[i - 1];
          const b = points[i];
          const xa = xFor(a.t);
          const xb = xFor(b.t);
          if (xb < xLeft) continue;
          const ya = yFor(a.cents, h);
          const yb = yFor(b.cents, h);
          // age fade
          const age = (nowMs - b.t) / WINDOW_MS;
          const alpha = Math.max(0, 1 - age) * 0.9;

          // ink-and-gold: outer gold glow + inner ink core
          ctx.lineWidth = b.weight + 5;
          ctx.strokeStyle = `hsla(${b.hue}, 70%, 55%, ${alpha * 0.18})`;
          drawSeg(ctx, xa, ya, xb, yb, b.glideFrom != null, yFor(b.glideFrom ?? b.cents, h));

          ctx.lineWidth = b.weight;
          ctx.strokeStyle = `hsla(${b.hue}, 60%, 78%, ${alpha})`;
          drawSeg(ctx, xa, ya, xb, yb, b.glideFrom != null, yFor(b.glideFrom ?? b.cents, h));

          // flourish: a small luminous loop for grace/trill
          if (b.flourish && xb >= xLeft) {
            ctx.beginPath();
            ctx.strokeStyle = `hsla(${b.hue}, 75%, 80%, ${alpha * 0.7})`;
            ctx.lineWidth = Math.max(1, b.weight * 0.4);
            ctx.arc(xb, yb, 4 + b.weight * 0.3, 0, Math.PI * 2);
            ctx.stroke();
          }
        }

        // the wet "brush tip" at the writing edge (current note)
        const tip = points[points.length - 1];
        const xt = xFor(tip.t);
        const yt = yFor(tip.cents, h);
        if (xt >= xLeft && xt <= xRight + 4) {
          const g = ctx.createRadialGradient(xt, yt, 0, xt, yt, 16);
          g.addColorStop(0, `hsla(${tip.hue}, 85%, 85%, 0.95)`);
          g.addColorStop(1, `hsla(${tip.hue}, 80%, 60%, 0)`);
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(xt, yt, 16, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }

      // demo notice if no audio
      if (demoRef.current) {
        ctx.fillStyle = "rgba(253,164,175,0.85)";
        ctx.font = "13px ui-sans-serif, system-ui";
        ctx.fillText("silent visual demo — no audio device", margin + 8, h - margin - 10);
      }

      // run the note clock
      if (started || demoRef.current) tick(nowMs);

      rafRef.current = requestAnimationFrame(draw);
    },
    [yFor, started, tick]
  );

  // start the rAF loop once mounted (so the field is alive even before Begin)
  useEffect(() => {
    rafRef.current = requestAnimationFrame(draw);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [draw]);

  // ── begin the taqsim (gesture-gated) ──
  const begin = useCallback(async () => {
    if (started) return;
    sayrRef.current = initSayr(startMaqam);
    strokeRef.current = [];
    queueRef.current = [];
    startTimeRef.current = performance.now();
    nextNoteAtRef.current = performance.now();
    tintRef.current = { hue: 42, flash: 1 };

    const eng = buildEngine(TONIC_HZ);
    if (eng) {
      try {
        await eng.ctx.resume();
        engRef.current = eng;
        demoRef.current = false;
        setAudioOk(true);
      } catch {
        engRef.current = null;
        demoRef.current = true;
        setAudioOk(false);
      }
    } else {
      demoRef.current = true;
      setAudioOk(false);
    }
    setStarted(true);
  }, [started, startMaqam]);

  // auto-demo: if the visitor never presses Begin, run a silent visual after a beat
  useEffect(() => {
    if (started) return;
    const id = setTimeout(() => {
      if (started || sayrRef.current) return;
      sayrRef.current = initSayr(startMaqam);
      strokeRef.current = [];
      queueRef.current = [];
      startTimeRef.current = performance.now();
      nextNoteAtRef.current = performance.now();
      demoRef.current = true;
    }, 900);
    return () => clearTimeout(id);
  }, [started, startMaqam]);

  // cleanup on unmount
  useEffect(() => {
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      if (engRef.current) teardown(engRef.current);
      engRef.current = null;
    };
  }, []);

  // light steering
  const nudge = useCallback((m: MaqamName) => {
    if (sayrRef.current) sayrRef.current.steerToward = m;
  }, []);
  const headHome = useCallback(() => {
    if (sayrRef.current) sayrRef.current.steerRest = true;
  }, []);

  const minutes = Math.floor((ui.pos * 5.5));
  const seconds = Math.floor((ui.pos * 5.5 - minutes) * 60);

  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-[#080a18] text-white">
      {/* canvas field */}
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      {/* top hero / readouts */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex flex-col gap-2 p-5 sm:p-7">
        <h1 className="font-serif text-3xl font-semibold tracking-wide text-white/95 sm:text-4xl">
          Maqam Calligraphy
        </h1>
        <p className="max-w-2xl text-base text-white/75">
          A living Arabic <span className="text-amber-300/95">taqsim</span> — a free-meter
          solo that wanders in exact microtonal cents and writes itself as a luminous
          calligraphic line, so you can see the quarter-tones sit between the piano&apos;s
          cracks.
        </p>

        {(started || demoRef.current) && (
          <div className="mt-1 flex flex-wrap items-center gap-x-5 gap-y-1 text-base">
            <span className="text-white/90">
              maqam <span className="font-serif text-amber-300/95">{ui.maqam}</span>
            </span>
            <span className="text-white/80">
              jins <span className="text-amber-300/95">{ui.jins}</span>
            </span>
            <span className="text-white/75">{STAGE_LABEL[ui.stage]}</span>
            <span className="text-white/55 tabular-nums">
              {minutes}:{seconds.toString().padStart(2, "0")} / 5:30
            </span>
            {ui.lastMod && (
              <span className="text-violet-300">modulated {ui.lastMod}</span>
            )}
          </div>
        )}
      </div>

      {/* pre-start panel */}
      {!started && (
        <div className="absolute inset-0 z-20 flex items-center justify-center p-6">
          <div className="w-full max-w-lg rounded-2xl border border-amber-300/20 bg-[#0b1024]/80 p-6 backdrop-blur-sm">
            <p className="text-base text-white/80">
              Choose a starting maqam. Once begun, it plays a full self-developing taqsim
              hands-free for about five and a half minutes — opening low at the{" "}
              <span className="text-amber-300/95">qarar</span>, reaching the{" "}
              <span className="text-amber-300/95">ghammaz</span>, modulating to a related
              maqam at the peak, then descending home.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {MAQAM_NAMES.map((m) => (
                <button
                  key={m}
                  onClick={() => setStartMaqam(m)}
                  className={`min-h-[44px] rounded-xl border px-4 py-2.5 text-base transition ${
                    startMaqam === m
                      ? "border-amber-300/70 bg-amber-300/15 text-amber-200"
                      : "border-white/15 text-white/75 hover:border-white/30"
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
            <button
              onClick={begin}
              className="mt-5 min-h-[44px] w-full rounded-xl border border-amber-300/60 bg-amber-300/20 px-4 py-2.5 text-lg font-medium text-amber-100 transition hover:bg-amber-300/30"
            >
              Begin taqsim
            </button>
          </div>
        </div>
      )}

      {/* steering controls (during play) */}
      {started && (
        <div className="absolute inset-x-0 bottom-0 z-10 flex flex-wrap items-center gap-2 p-5 sm:p-7">
          <span className="mr-1 text-base text-white/55">nudge next modulation</span>
          {MAQAM_NAMES.map((m) => (
            <button
              key={m}
              onClick={() => nudge(m)}
              className="min-h-[44px] rounded-xl border border-white/15 px-4 py-2.5 text-base text-white/75 transition hover:border-amber-300/50 hover:text-amber-200"
            >
              {m}
            </button>
          ))}
          <button
            onClick={headHome}
            className="min-h-[44px] rounded-xl border border-rose-300/30 px-4 py-2.5 text-base text-rose-300 transition hover:border-rose-300/60"
          >
            rest — head home
          </button>
        </div>
      )}

      {/* audio-failure notice */}
      {audioOk === false && (
        <div className="absolute left-5 top-32 z-10 max-w-sm rounded-xl border border-rose-300/30 bg-[#0b1024]/80 p-3 text-base text-rose-300">
          No audio device available — showing the calligraphic field as a silent visual
          demo. The melodic engine is still running.
        </div>
      )}

      {/* design notes affordance */}
      <div className="absolute right-4 top-4 z-30">
        <button
          onClick={() => setShowNotes((s) => !s)}
          className="min-h-[44px] rounded-lg border border-white/15 px-3 py-2 text-base text-white/55 transition hover:text-white/80"
        >
          Design notes
        </button>
        {showNotes && (
          <div className="mt-2 w-72 rounded-xl border border-white/15 bg-[#0b1024]/90 p-4 text-base text-white/75">
            <p>
              Every pitch is an exact cents offset from a D tonic — quarter-tones are
              first-class, never snapped to the 12-TET grid (the faint dashed lines). The
              gold lines mark the active jins; the half-flats glow between the cracks.
            </p>
            <p className="mt-2 text-white/55">
              Full theory, references, and an honest &quot;unverified&quot; note are in{" "}
              <span className="text-amber-300/95">README.md</span> in this prototype&apos;s
              folder.
            </p>
            <Link
              href="/dream"
              className="mt-3 inline-block text-violet-300 hover:underline"
            >
              ← back to the dream lab
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}

// ── helper: draw a segment, curved if it's a portamento sweep ─────────────
function drawSeg(
  ctx: CanvasRenderingContext2D,
  xa: number,
  ya: number,
  xb: number,
  yb: number,
  glide: boolean,
  yFrom: number
) {
  ctx.beginPath();
  ctx.moveTo(xa, ya);
  if (glide) {
    // a smooth microtonal arc rather than a stair-step
    const mx = (xa + xb) / 2;
    const my = (yFrom + yb) / 2;
    ctx.quadraticCurveTo(mx, my, xb, yb);
  } else {
    ctx.lineTo(xb, yb);
  }
  ctx.stroke();
}
