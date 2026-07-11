"use client";

/**
 * 408-kids-breath-grove
 * Each slow breath grows a branch of a glowing tree.
 * Over a few minutes your breathing grows a whole luminous grove
 * that *remembered* every breath — with a timelapse replay.
 *
 * For: kids (4+). Calm, bedtime, no reading required, no fail states.
 *
 * References:
 *   - L-systems (Aristid Lindenmayer) — recursive branching grammar
 *   - Pelog / Indonesian gamelan — inharmonic tonal world
 *   - Long-form generative state/memory/evolution (different at minute 3)
 */

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { createBreathDetector, type BreathDetector } from "./breath";
import { makeGroveState, applyBreath, buildTimelapse, type GroveState, type BreathRecord } from "./grove";
import { makeGroveAudio, type GroveAudio } from "./audio";

// ── canvas rendering ──────────────────────────────────────────────────────────

function drawGrove(
  ctx: CanvasRenderingContext2D,
  state: GroveState,
  W: number,
  H: number,
  tSec: number,
  isReplay: boolean,
) {
  const { stage, segments, blossoms, fireflies } = state;

  // Background gradient — deepens with stage
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  if (stage === 1) {
    grad.addColorStop(0, "#050810");
    grad.addColorStop(1, "#0d1520");
  } else if (stage === 2) {
    grad.addColorStop(0, "#060a12");
    grad.addColorStop(1, "#111827");
  } else if (stage === 3) {
    grad.addColorStop(0, "#07091a");
    grad.addColorStop(1, "#0f1330");
  } else {
    // Stage 4: deep violet night
    grad.addColorStop(0, "#08072a");
    grad.addColorStop(0.5, "#120a35");
    grad.addColorStop(1, "#0d1525");
  }
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // Stage 4: aurora glow at top
  if (stage === 4) {
    const auroraAlpha = 0.08 + 0.04 * Math.sin(tSec * 0.22);
    const ag = ctx.createLinearGradient(0, 0, 0, H * 0.45);
    ag.addColorStop(0, `rgba(124,58,237,${auroraAlpha})`);
    ag.addColorStop(0.5, `rgba(16,185,129,${auroraAlpha * 0.6})`);
    ag.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = ag;
    ctx.fillRect(0, 0, W, H);
  }

  // Stage 3+: soft moon glow
  if (stage >= 3) {
    const moonX = W * 0.8;
    const moonY = H * 0.12;
    const moonR = Math.min(W, H) * 0.06;
    const mg = ctx.createRadialGradient(moonX, moonY, 0, moonX, moonY, moonR * 3.5);
    mg.addColorStop(0, "rgba(253,240,200,0.18)");
    mg.addColorStop(0.3, "rgba(253,240,200,0.10)");
    mg.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = mg;
    ctx.fillRect(0, 0, W, H);
    // Moon disc
    ctx.save();
    ctx.globalAlpha = 0.35 + 0.05 * Math.sin(tSec * 0.11);
    ctx.fillStyle = "#fdf0c8";
    ctx.beginPath();
    ctx.arc(moonX, moonY, moonR, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Stars (stage 2+)
  if (stage >= 2) {
    const starSeed = state.seed;
    const numStars = stage >= 3 ? 55 : 30;
    for (let i = 0; i < numStars; i++) {
      const sx = ((starSeed * (i + 1) * 1234567) % 1000) / 1000 * W;
      const sy = ((starSeed * (i + 1) * 7654321) % 1000) / 1000 * H * 0.6;
      const sbright = 0.3 + (((starSeed * (i + 3)) % 100) / 100) * 0.5;
      const spulse = sbright + 0.15 * Math.sin(tSec * 0.7 + i * 0.9);
      ctx.save();
      ctx.globalAlpha = spulse;
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(sx, sy, 0.7 + (i % 3) * 0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  // ── Draw branch segments ──────────────────────────────────────────────────
  for (const seg of segments) {
    if (seg.growT <= 0) continue;
    const t = Math.min(seg.growT, 1);
    const x2 = seg.x1 + (seg.x2 - seg.x1) * t;
    const y2 = seg.y1 + (seg.y2 - seg.y1) * t;

    // Glow pass
    ctx.save();
    ctx.globalAlpha = 0.18 * t;
    ctx.strokeStyle = seg.glowColor;
    ctx.lineWidth = seg.thickness * 3.5;
    ctx.lineCap = "round";
    ctx.shadowColor = seg.glowColor;
    ctx.shadowBlur = seg.thickness * 5;
    ctx.beginPath();
    ctx.moveTo(seg.x1, seg.y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.restore();

    // Solid branch
    ctx.save();
    ctx.globalAlpha = 0.72 * t;
    ctx.strokeStyle = seg.color;
    ctx.lineWidth = seg.thickness;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(seg.x1, seg.y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.restore();
  }

  // ── Draw blossoms ─────────────────────────────────────────────────────────
  for (const bl of blossoms) {
    const alpha = Math.min(bl.alpha, 1);
    if (alpha <= 0) continue;

    ctx.save();
    ctx.globalAlpha = alpha;

    if (bl.type === "leaf") {
      // Teardrop leaf
      ctx.save();
      ctx.translate(bl.x, bl.y);
      ctx.rotate(bl.angle);
      ctx.fillStyle = bl.color;
      ctx.shadowColor = bl.glowColor;
      ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.ellipse(0, 0, bl.r * 0.55, bl.r, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    } else if (bl.type === "flower") {
      // Radial petals
      const petals = 5;
      ctx.shadowColor = bl.glowColor;
      ctx.shadowBlur = 8;
      for (let p = 0; p < petals; p++) {
        const pa = bl.angle + (p / petals) * Math.PI * 2;
        const px = bl.x + Math.cos(pa) * bl.r * 0.7;
        const py = bl.y + Math.sin(pa) * bl.r * 0.7;
        ctx.fillStyle = bl.color;
        ctx.beginPath();
        ctx.arc(px, py, bl.r * 0.55, 0, Math.PI * 2);
        ctx.fill();
      }
      // Center
      ctx.fillStyle = "#fde68a";
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(bl.x, bl.y, bl.r * 0.35, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // Ember — soft glowing dot
      const er = ctx.createRadialGradient(bl.x, bl.y, 0, bl.x, bl.y, bl.r * 1.8);
      er.addColorStop(0, bl.color);
      er.addColorStop(0.5, bl.glowColor + "88");
      er.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = er;
      ctx.beginPath();
      ctx.arc(bl.x, bl.y, bl.r * 1.8, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  // ── Fireflies ─────────────────────────────────────────────────────────────
  for (const ff of fireflies) {
    const glow = 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(ff.phase + tSec * 2.1));
    const fg = ctx.createRadialGradient(ff.x, ff.y, 0, ff.x, ff.y, 6);
    fg.addColorStop(0, ff.color);
    fg.addColorStop(0.4, ff.color + "88");
    fg.addColorStop(1, "rgba(0,0,0,0)");
    ctx.save();
    ctx.globalAlpha = glow * 0.85;
    ctx.fillStyle = fg;
    ctx.beginPath();
    ctx.arc(ff.x, ff.y, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Replay overlay hint
  if (isReplay) {
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = "#a78bfa";
    ctx.font = `bold ${Math.round(Math.min(W, H) * 0.035)}px serif`;
    ctx.textAlign = "center";
    ctx.fillText("✦ replaying your grove ✦", W / 2, H * 0.08);
    ctx.restore();
  }
}

// ── Animate growT for newly-added segments / alpha for blossoms ───────────────

function tickAnimations(
  state: GroveState,
  dt: number,
  growSpeed: number = 1,
): void {
  // Mutate growT and alpha in-place (renderer reads, no re-render needed)
  for (const seg of state.segments) {
    if (seg.growT < 1) {
      seg.growT = Math.min(1, seg.growT + dt * 1.8 * growSpeed);
    }
  }
  for (const bl of state.blossoms) {
    if (bl.alpha < 1) {
      bl.alpha = Math.min(1, bl.alpha + dt * 0.9 * growSpeed);
    }
  }
}

function tickFireflies(state: GroveState, dt: number, W: number, H: number): void {
  for (const ff of state.fireflies) {
    ff.x += ff.vx * dt * 60 * 0.4;
    ff.y += ff.vy * dt * 60 * 0.4;
    ff.phase += dt * 1.1;
    // Soft bounds
    if (ff.x < W * 0.02 || ff.x > W * 0.98) ff.vx *= -1;
    if (ff.y < H * 0.05 || ff.y > H * 0.92) ff.vy *= -1;
  }
}

// ── Auto-demo: generates synthetic breath events ──────────────────────────────

function makeSynthBreath(
  breathIdx: number,
): BreathRecord {
  // vary strength ~0.25..0.85, duration ~1.1..2.5s
  const hash = (breathIdx * 1664525 + 1013904223) >>> 0;
  const frac = (hash % 10000) / 10000;
  const strength = 0.25 + frac * 0.60;
  const duration = 1.1 + frac * 1.4;
  return { index: breathIdx, duration, strength };
}

// ── Component ─────────────────────────────────────────────────────────────────

type AppPhase = "idle" | "active" | "timelapse";

const TIMELAPSE_BREATHS_PER_SEC = 3;  // how fast timelapse runs
const AUTO_DEMO_INTERVAL_MS = 3200;   // ~3.2s between synthetic breaths

export default function KidsBreathGrovePage() {
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const groveRef     = useRef<GroveState>(makeGroveState(Math.floor(Math.random() * 99999)));
  const audioRef     = useRef<GroveAudio | null>(null);
  const actxRef      = useRef<AudioContext | null>(null);
  const detectorRef  = useRef<BreathDetector | null>(null);
  const animRef      = useRef<number>(0);
  const demoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [phase, setPhase]         = useState<AppPhase>("idle");
  const [isDemo, setIsDemo]       = useState(false);
  const [micError, setMicError]   = useState(false);
  const [breathCount, setBreathCount] = useState(0);
  const [stage, setStage]         = useState<1 | 2 | 3 | 4>(1);
  const [canReplay, setCanReplay] = useState(false);

  // Timelapse state
  const tlFramesRef    = useRef<GroveState[]>([]);
  const tlFrameIdxRef  = useRef(0);
  const tlAccRef       = useRef(0);
  const isTlRef        = useRef(false);

  // rAF timing
  const lastMsRef  = useRef(0);
  const tStartRef  = useRef(0);

  // Canvas size (ref only — rendering reads canvasSizeRef directly)
  const canvasSizeRef = useRef({ W: 0, H: 0 });

  // ── resize / DPR ──────────────────────────────────────────────────────────
  useEffect(() => {
    const resize = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const dpr = window.devicePixelRatio || 1;
      const W = window.innerWidth;
      const H = window.innerHeight;
      canvas.width  = W * dpr;
      canvas.height = H * dpr;
      canvas.style.width  = `${W}px`;
      canvas.style.height = `${H}px`;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.scale(dpr, dpr);
      }
      canvasSizeRef.current = { W, H };
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  // ── Handle an incoming breath (real or synthetic) ─────────────────────────
  const handleBreath = useCallback((evt: BreathRecord) => {
    const { W, H } = canvasSizeRef.current;
    const newState = applyBreath(groveRef.current, evt, W, H);
    groveRef.current = newState;
    setBreathCount(newState.breathCount);
    setStage(newState.stage);
    if (newState.stage >= 4 && newState.breathCount >= 15) {
      setCanReplay(true);
    }
    audioRef.current?.setStage(newState.stage);
    audioRef.current?.playBloom(evt.strength);
  }, []);

  // ── Schedule next demo breath ─────────────────────────────────────────────
  const scheduleDemoBreath = useCallback((nextIdx: number) => {
    demoTimerRef.current = setTimeout(() => {
      const evt = makeSynthBreath(nextIdx);
      handleBreath(evt);
      scheduleDemoBreath(nextIdx + 1);
    }, AUTO_DEMO_INTERVAL_MS + (Math.random() - 0.5) * 600);
  }, [handleBreath]);

  // ── Begin (real mic or demo) ──────────────────────────────────────────────
  const startExperience = useCallback(async (demo: boolean) => {
    // Create AudioContext inside gesture (iOS requirement)
    const actx = new AudioContext();
    actxRef.current = actx;
    if (actx.state === "suspended") await actx.resume();

    const audio = makeGroveAudio(actx);
    audioRef.current = audio;

    setIsDemo(demo);
    setPhase("active");

    if (!demo) {
      // Try real mic
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        const det = createBreathDetector(actx, stream, {
          onBreath: (evt) => {
            const bc = groveRef.current.breathCount;
            handleBreath({ index: bc, duration: evt.duration, strength: evt.strength });
          },
        });
        detectorRef.current = det;
        // Safety fallback: if no real breath detected in 8s, run auto-demo
        demoTimerRef.current = setTimeout(() => {
          if (groveRef.current.breathCount === 0) {
            setIsDemo(true);
            scheduleDemoBreath(0);
          }
        }, 8000);
      } catch {
        setMicError(true);
        setIsDemo(true);
        scheduleDemoBreath(0);
      }
    } else {
      scheduleDemoBreath(0);
    }
  }, [handleBreath, scheduleDemoBreath]);

  // ── rAF render loop ───────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== "active" && phase !== "timelapse") return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    tStartRef.current = performance.now();
    lastMsRef.current = tStartRef.current;

    const loop = (nowMs: number) => {
      const { W, H } = canvasSizeRef.current;
      if (W === 0 || H === 0) { animRef.current = requestAnimationFrame(loop); return; }

      const dt = Math.min((nowMs - lastMsRef.current) / 1000, 0.1);
      lastMsRef.current = nowMs;
      const tSec = (nowMs - tStartRef.current) / 1000;

      let renderState: GroveState;

      if (isTlRef.current) {
        // Timelapse mode
        tlAccRef.current += dt * TIMELAPSE_BREATHS_PER_SEC;
        const frames = tlFramesRef.current;
        while (tlAccRef.current >= 1 && tlFrameIdxRef.current < frames.length - 1) {
          tlAccRef.current -= 1;
          tlFrameIdxRef.current++;
        }
        renderState = frames[tlFrameIdxRef.current] ?? groveRef.current;

        // Animate growT for timelapse frames
        tickAnimations(renderState, dt, 4);

        // End of timelapse
        if (tlFrameIdxRef.current >= frames.length - 1) {
          isTlRef.current = false;
          groveRef.current = renderState;
          setPhase("active");
        }
      } else {
        renderState = groveRef.current;
        tickAnimations(renderState, dt, 1);
      }

      tickFireflies(renderState, dt, W, H);
      drawGrove(ctx, renderState, W, H, tSec, isTlRef.current);

      animRef.current = requestAnimationFrame(loop);
    };

    animRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animRef.current);
  }, [phase]);

  // ── Start timelapse ───────────────────────────────────────────────────────
  const startTimelapse = useCallback(() => {
    const { W, H } = canvasSizeRef.current;
    const frames = buildTimelapse(groveRef.current, W, H);
    tlFramesRef.current = frames;
    tlFrameIdxRef.current = 0;
    tlAccRef.current = 0;
    isTlRef.current = true;
    setPhase("timelapse");
  }, []);

  // ── Teardown on unmount ───────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      cancelAnimationFrame(animRef.current);
      if (demoTimerRef.current) clearTimeout(demoTimerRef.current);
      detectorRef.current?.destroy();
      audioRef.current?.close();
    };
  }, []);

  // ── JSX ───────────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 bg-[#050810] overflow-hidden">
      <canvas ref={canvasRef} className="absolute inset-0 touch-none" />

      {/* ── IDLE SCREEN ── */}
      {phase === "idle" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-8 px-6">
          <div className="text-center">
            <h1 className="text-foreground text-3xl font-semibold tracking-wide mb-3">
              breath grove
            </h1>
            <p className="text-muted-foreground text-base">
              breathe slowly — grow a glowing forest
            </p>
          </div>

          {/* Begin button — ≥64px for kids */}
          <button
            onClick={() => { void startExperience(false); }}
            className="flex items-center justify-center bg-violet-600 hover:bg-violet-500 active:bg-violet-700 text-foreground text-2xl font-bold rounded-full transition-colors shadow-lg shadow-violet-900/50"
            style={{ width: 160, height: 160 }}
            aria-label="Begin"
          >
            Begin
          </button>

          {micError && (
            <p className="text-violet-300 text-base text-center max-w-xs">
              microphone not available — auto-demo will run instead
            </p>
          )}

          <button
            onClick={() => { void startExperience(true); }}
            className="text-muted-foreground hover:text-foreground text-base underline transition-colors"
            style={{ minHeight: 44, padding: "10px 16px" }}
          >
            watch the demo
          </button>
        </div>
      )}

      {/* ── ACTIVE HUD ── */}
      {phase === "active" && (
        <>
          {/* Top badge */}
          <div className="pointer-events-none absolute top-5 left-1/2 -translate-x-1/2 flex items-center gap-2">
            {isDemo ? (
              <span className="text-violet-300 text-sm font-mono bg-violet-900/30 px-3 py-1 rounded-full">
                Auto-demo (breathing)
              </span>
            ) : (
              <span className="text-violet-300 text-sm font-mono bg-violet-900/30 px-3 py-1 rounded-full flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-violet-400 animate-pulse inline-block" />
                Listening 🎤
              </span>
            )}
          </div>

          {/* Breath counter */}
          <div className="pointer-events-none absolute top-5 right-4 text-muted-foreground text-sm font-mono">
            {breathCount} breath{breathCount !== 1 ? "s" : ""}
          </div>

          {/* Stage label */}
          {stage >= 2 && (
            <div className="pointer-events-none absolute top-14 right-4 text-violet-300 text-xs font-mono">
              stage {stage}
            </div>
          )}

          {/* Mic error notice */}
          {micError && (
            <div className="pointer-events-none absolute bottom-20 left-1/2 -translate-x-1/2 text-violet-300 text-sm text-center max-w-xs">
              mic unavailable — running auto-demo
            </div>
          )}

          {/* Replay button (unlocks at Stage 4) */}
          {canReplay && (
            <button
              onClick={startTimelapse}
              className="absolute bottom-14 left-1/2 -translate-x-1/2 bg-violet-500/20 hover:bg-violet-500/35 text-violet-300 text-base font-mono px-6 py-3 rounded-full border border-violet-500/40 transition-colors"
              style={{ minHeight: 52 }}
            >
              ✦ replay the grove&apos;s growth
            </button>
          )}
        </>
      )}

      {/* ── TIMELAPSE SCREEN ── */}
      {phase === "timelapse" && (
        <div className="pointer-events-none absolute top-5 left-1/2 -translate-x-1/2 text-violet-300 text-sm font-mono bg-violet-900/30 px-4 py-1.5 rounded-full">
          ✦ watching your grove grow again ✦
        </div>
      )}

      {/* Design notes link */}
      <Link
        href="/dream/408-kids-breath-grove/README.md"
        className="absolute bottom-4 right-4 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        read design notes
      </Link>
    </div>
  );
}
