"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 14848 · Holdlight — a recording with no play button. Sound exists only while
// you actively, effortfully hold your attention on it, and fades the instant you
// let go.
//
//   "What if a recording had no play button — what if sound existed only while
//    you actively held your attention on it, and faded the instant you let go?"
//
//   Five of Karel's real piano takes are five thin FILAMENTS of light on a
//   near-black field. There is no play button and no latch. To hear a take you
//   press-and-HOLD its filament: its looping audio fades in and its thread
//   brightens, tautens, and quivers to its OWN live analyser. Release and both
//   the sound and the light decay over ~1.5s. Attention is finite — at most two
//   filaments may be held at once; a third press is gently refused. And attention
//   has memory: every UNHELD thread accrues `neglect`, dimming and thinning and
//   taking longer to bloom back; a thread left fully neglected long enough goes
//   permanently dark for the session. This is the opposite of a fader bank —
//   presence is scarce and enacted, never set-and-forget.
//
//   REFS  Pauline Oliveros, *Deep Listening* (attention as an active, whole-body
//   discipline); the 2026 framing of the listener as "composer-performer" whose
//   attention is the primary creative tool (ACM Creativity & Cognition 2026).
//   All audio is Karel's verified catalog, routed through one createSafeMaster;
//   there is zero synthesis. Austere inline SVG, achromatic grayscale only.
// ─────────────────────────────────────────────────────────────────────────────

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { REAL_TRACKS, loadRealTrackBuffer } from "../_shared/welcomeHome";
import {
  createSafeMaster,
  type SafeMaster,
} from "../_shared/visionary/safeMaster";
import { PrototypeNav } from "../_shared/prototype-nav";

// ── tunables ────────────────────────────────────────────────────────────────
const THREAD_COUNT = 5;
const MAX_HELD = 2; // finite attention
const VOICE_CEIL = 0.62; // per-voice audible ceiling (safeMaster tames the sum)

const TAU_UP = 0.55; // presence rise time-constant at zero neglect (s)
const TAU_DOWN = 1.5; // release decay time-constant (s) — the "fade on let go"
const TAU_ENERGY = 0.06; // analyser smoothing (s)
const TAU_AFTER = 1.4; // afterimage ghost decay (s)
const TAU_REFUSE = 0.42; // "can't" pulse decay (s)

const NEGLECT_RISE = 1 / 105; // per second while unheld (~105s to full)
const NEGLECT_FALL = 1 / 16; // per second while held (recovers in ~16s)
const REVIVE_PENALTY = 0.72; // revive-rate scaled by (1 − 0.72·neglect)
const LOSS_HOLD_MS = 8000; // full neglect sustained this long → permanent loss

// SVG geometry
const VIEW_W = 620;
const VIEW_H = 440;
const MARGIN_X = 74;
const TOP_Y = 44;
const BOT_Y = 402;
const SEGMENTS = 22;

interface Thread {
  id: string;
  title: string;
  cx: number;
  seed: number;
  // audio
  gainNode: GainNode | null;
  source: AudioBufferSourceNode | null;
  analyser: AnalyserNode | null;
  analyserBuf: Float32Array | null;
  loadStarted: boolean;
  loading: boolean;
  failed: boolean;
  // living state
  presence: number; // 0..1 — brightness + audio envelope
  neglect: number; // 0..1 — memory of inattention
  energy: number; // 0..1 — smoothed own-analyser RMS (quiver)
  afterimage: number; // 0..1 — ghost of the last-held brightness
  refuse: number; // 0..1 — brief "can't" pulse
  fullNeglectSince: number | null;
  lost: boolean;
  prevHeld: boolean;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

// cheap deterministic per-point wobble in [-1,1]
function wobble(i: number, seed: number, t: number): number {
  const s = Math.sin(i * 12.9898 + seed * 78.233 + t) * 43758.5453;
  return (s - Math.floor(s)) * 2 - 1;
}

// build the filament path for a thread at the current frame
function drawFilament(th: Thread, now: number): string {
  const span = BOT_Y - TOP_Y;
  // taut when present; wandering when neglected/idle
  const wander = 7 * (1 - th.presence) * (1 + th.neglect * 0.5) + th.refuse * 12;
  const quiver = th.energy * 6 * th.presence;
  const slowPh = now * 0.0011 + th.seed;
  const fastPh = now * 0.02;
  let d = "";
  for (let i = 0; i <= SEGMENTS; i++) {
    const yf = i / SEGMENTS;
    const y = TOP_Y + yf * span;
    const env = Math.sin(yf * Math.PI); // pinned at both ends
    const slow = Math.sin(yf * 3.0 + slowPh) * wander;
    const fine = wobble(i, th.seed, fastPh) * quiver;
    const x = th.cx + (slow + fine) * env;
    d += (i === 0 ? "M" : "L") + x.toFixed(2) + " " + y.toFixed(2) + " ";
  }
  return d.trim();
}

export default function HoldlightPage() {
  const [started, setStarted] = useState(false);
  const [fatal, setFatal] = useState<string | null>(null);
  const [, setTick] = useState(0);

  const ctxRef = useRef<AudioContext | null>(null);
  const safeRef = useRef<SafeMaster | null>(null);
  const threadsRef = useRef<Thread[]>([]);
  const rafRef = useRef<number | null>(null);
  const lastFrameRef = useRef<number>(0);
  const startedRef = useRef(false);

  // held state, split by input source so pointer + key releases don't collide
  const pointerHeldRef = useRef<Set<string>>(new Set());
  const keyHeldRef = useRef<Set<string>>(new Set());

  const tracks = useMemo(() => REAL_TRACKS.slice(0, THREAD_COUNT), []);

  const heldCount = useCallback((): number => {
    const u = new Set<string>();
    pointerHeldRef.current.forEach((id) => u.add(id));
    keyHeldRef.current.forEach((id) => u.add(id));
    return u.size;
  }, []);

  // ── lazy loader: decode + wire one voice the first time it is held ──────────
  const startLoad = useCallback((th: Thread) => {
    const ctx = ctxRef.current;
    const safe = safeRef.current;
    if (!ctx || !safe || th.loadStarted) return;
    th.loadStarted = true;
    th.loading = true;
    void (async () => {
      try {
        const { buffer } = await loadRealTrackBuffer(ctx, th.id);
        if (ctxRef.current !== ctx) return; // torn down mid-load
        const gainNode = ctx.createGain();
        gainNode.gain.value = 0.0001;
        gainNode.connect(safe.input);
        // per-filament analyser tap — each thread quivers to its OWN energy
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        analyser.smoothingTimeConstant = 0.5;
        gainNode.connect(analyser);
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.loop = true;
        source.connect(gainNode);
        source.start(0);
        th.gainNode = gainNode;
        th.source = source;
        th.analyser = analyser;
        th.analyserBuf = new Float32Array(new ArrayBuffer(analyser.fftSize * 4));
        th.loading = false;
      } catch {
        th.loading = false;
        th.failed = true;
      }
    })();
  }, []);

  // ── the frame loop ──────────────────────────────────────────────────────────
  const runFrame = useCallback(() => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    const now = performance.now();
    let dt = (now - lastFrameRef.current) / 1000;
    lastFrameRef.current = now;
    if (!(dt > 0)) dt = 1 / 60;
    if (dt > 0.05) dt = 0.05;
    const ctxTime = ctx.currentTime;

    const pHeld = pointerHeldRef.current;
    const kHeld = keyHeldRef.current;

    for (const th of threadsRef.current) {
      // permanent loss: full neglect sustained long enough is true loss
      if (th.neglect >= 0.999) {
        if (th.fullNeglectSince === null) th.fullNeglectSince = now;
        else if (now - th.fullNeglectSince > LOSS_HOLD_MS) th.lost = true;
      } else {
        th.fullNeglectSince = null;
      }

      let held = !th.lost && (pHeld.has(th.id) || kHeld.has(th.id));
      if (th.lost) {
        // a lost thread cannot be revived — drop it from any held set
        pHeld.delete(th.id);
        kHeld.delete(th.id);
        held = false;
      }

      if (held) {
        if (!th.loadStarted) startLoad(th);
        th.neglect = Math.max(0, th.neglect - NEGLECT_FALL * dt);
        // long-neglected threads bloom back slower
        const reviveScale = Math.max(0.15, 1 - REVIVE_PENALTY * th.neglect);
        const tauUp = TAU_UP / reviveScale;
        th.presence += (1 - th.presence) * (1 - Math.exp(-dt / tauUp));
        // own live energy → quiver
        if (th.analyser && th.analyserBuf) {
          th.analyser.getFloatTimeDomainData(
            th.analyserBuf as unknown as Float32Array<ArrayBuffer>,
          );
          let rms = 0;
          const b = th.analyserBuf;
          for (let i = 0; i < b.length; i++) rms += b[i] * b[i];
          rms = Math.sqrt(rms / b.length);
          const target = Math.min(1, rms * 7);
          th.energy += (target - th.energy) * (1 - Math.exp(-dt / TAU_ENERGY));
        }
      } else {
        th.neglect = Math.min(1, th.neglect + NEGLECT_RISE * dt);
        th.presence += (0 - th.presence) * (1 - Math.exp(-dt / TAU_DOWN));
        th.energy += (0 - th.energy) * (1 - Math.exp(-dt / TAU_ENERGY));
      }

      // afterimage: capture the brightness at the moment of release
      if (th.prevHeld && !held && th.presence > 0.15) {
        th.afterimage = Math.max(th.afterimage, th.presence);
      }
      th.afterimage *= Math.exp(-dt / TAU_AFTER);
      th.refuse *= Math.exp(-dt / TAU_REFUSE);
      th.prevHeld = held;

      // presence IS the audio envelope
      if (th.gainNode) {
        th.gainNode.gain.setTargetAtTime(th.presence * VOICE_CEIL, ctxTime, 0.05);
      }
    }

    setTick((n) => (n + 1) % 1_000_000);
    rafRef.current = requestAnimationFrame(runFrame);
  }, [startLoad]);

  // ── start the engine inside a user gesture (first press) ────────────────────
  const ensureStarted = useCallback((): boolean => {
    if (startedRef.current) return true;
    try {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      if (!AC) {
        setFatal("This browser has no Web Audio support, so the threads cannot sound.");
        return false;
      }
      const ctx = new AC();
      void ctx.resume();
      const safe = createSafeMaster(ctx);
      ctxRef.current = ctx;
      safeRef.current = safe;
      threadsRef.current = tracks.map((t, i) => ({
        id: t.id,
        title: t.title,
        cx:
          MARGIN_X +
          (i * (VIEW_W - 2 * MARGIN_X)) / (THREAD_COUNT - 1),
        seed: (i + 1) * 1.7,
        gainNode: null,
        source: null,
        analyser: null,
        analyserBuf: null,
        loadStarted: false,
        loading: false,
        failed: false,
        presence: 0,
        neglect: 0,
        energy: 0,
        afterimage: 0,
        refuse: 0,
        fullNeglectSince: null,
        lost: false,
        prevHeld: false,
      }));
      startedRef.current = true;
      setStarted(true);
      lastFrameRef.current = performance.now();
      rafRef.current = requestAnimationFrame(runFrame);
      return true;
    } catch (e) {
      setFatal(e instanceof Error ? e.message : "Could not start the audio engine.");
      return false;
    }
  }, [tracks, runFrame]);

  // ── hold / release plumbing (the finite-attention gate) ─────────────────────
  const tryHold = useCallback(
    (id: string, source: "pointer" | "key") => {
      const th = threadsRef.current.find((t) => t.id === id);
      if (th && th.lost) return; // truly gone for the session
      const set = source === "pointer" ? pointerHeldRef.current : keyHeldRef.current;
      const already = pointerHeldRef.current.has(id) || keyHeldRef.current.has(id);
      if (!already && heldCount() >= MAX_HELD) {
        // attention is full — refuse with a brief "can't" pulse
        if (th) th.refuse = 1;
        return;
      }
      set.add(id);
    },
    [heldCount],
  );

  const release = useCallback((id: string, source: "pointer" | "key") => {
    const set = source === "pointer" ? pointerHeldRef.current : keyHeldRef.current;
    set.delete(id);
  }, []);

  // ── "let it all rest" — reset neglect, afterimages, loss; silence all ───────
  const rest = useCallback(() => {
    pointerHeldRef.current.clear();
    keyHeldRef.current.clear();
    for (const th of threadsRef.current) {
      th.neglect = 0;
      th.afterimage = 0;
      th.refuse = 0;
      th.fullNeglectSince = null;
      th.lost = false;
      th.prevHeld = false;
      // presence + audio decay away naturally through the frame loop
    }
    setTick((n) => n + 1);
  }, []);

  // ── keyboard fallback: hold 1–5 ─────────────────────────────────────────────
  useEffect(() => {
    const idxOfKey = (k: string) => "12345".indexOf(k);
    const down = (e: KeyboardEvent) => {
      const i = idxOfKey(e.key);
      if (i < 0 || i >= tracks.length) return;
      if (e.repeat) return;
      e.preventDefault();
      if (!ensureStarted()) return;
      const th = threadsRef.current[i];
      if (th) tryHold(th.id, "key");
    };
    const up = (e: KeyboardEvent) => {
      const i = idxOfKey(e.key);
      if (i < 0) return;
      const th = threadsRef.current[i];
      if (th) release(th.id, "key");
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [ensureStarted, tryHold, release, tracks.length]);

  // ── teardown ────────────────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      for (const th of threadsRef.current) {
        try {
          th.source?.stop();
          th.source?.disconnect();
          th.gainNode?.disconnect();
          th.analyser?.disconnect();
        } catch {
          /* noop */
        }
      }
      threadsRef.current = [];
      try {
        safeRef.current?.disconnect();
      } catch {
        /* noop */
      }
      safeRef.current = null;
      const ctx = ctxRef.current;
      if (ctx && ctx.state !== "closed") void ctx.close();
      ctxRef.current = null;
    };
  }, []);

  // ── render snapshot ─────────────────────────────────────────────────────────
  const threads = threadsRef.current;
  const now = typeof performance !== "undefined" ? performance.now() : 0;
  const activeHeld = heldCount();

  return (
    <main className="min-h-screen bg-background px-5 py-10 text-foreground sm:px-8">
      <div className="mx-auto flex max-w-3xl flex-col gap-7">
        <header className="flex flex-col gap-3">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            14848 · Holdlight
          </p>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Hold the light
          </h1>
          <p className="max-w-2xl text-base text-muted-foreground">
            Five of Karel&apos;s real piano takes, each a thin thread of light.
            There is no play button. A take sounds only while you press and{" "}
            <span className="text-foreground">hold</span> its thread — let go and
            both the sound and the light fade. You can hold at most two at once,
            and a thread left untended slowly dims into neglect, until it is gone.
          </p>
        </header>

        {/* ── controls ── */}
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={rest}
            className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            Let it all rest
          </button>
          <div className="flex flex-wrap items-center gap-2 font-mono text-xs uppercase tracking-wider text-muted-foreground">
            <span className="rounded-md border border-border px-2 py-1">
              {activeHeld} / {MAX_HELD} attention
            </span>
            <span className="rounded-md border border-border px-2 py-1">
              {started ? "listening" : "resting"}
            </span>
          </div>
        </div>

        <p className="text-sm text-muted-foreground">
          Press and hold a thread to keep it present. On a keyboard, hold keys{" "}
          <span className="font-mono text-xs text-foreground">1 2 3 4 5</span>.
        </p>

        {fatal && (
          <p className="text-base text-destructive" role="alert">
            {fatal}
          </p>
        )}

        {/* ── the filaments ── */}
        <div
          className="touch-none select-none rounded-lg border border-border bg-[#060609] p-3"
          style={{ touchAction: "none" }}
        >
          <svg
            viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
            className="mx-auto w-full max-w-[620px]"
            role="img"
            aria-label={`Five threads of light, one per recording; ${activeHeld} of ${MAX_HELD} currently held and sounding`}
          >
            <defs>
              <radialGradient id="hl-bg" cx="50%" cy="42%" r="70%">
                <stop offset="0%" stopColor="#0c0c11" />
                <stop offset="100%" stopColor="#040406" />
              </radialGradient>
              <filter id="hl-glow" x="-60%" y="-30%" width="220%" height="160%">
                <feGaussianBlur stdDeviation="3.4" result="b" />
                <feMerge>
                  <feMergeNode in="b" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            <rect x="0" y="0" width={VIEW_W} height={VIEW_H} fill="url(#hl-bg)" />

            {threads.map((th) => {
              const held = pointerHeldRef.current.has(th.id) || keyHeldRef.current.has(th.id);
              const d = drawFilament(th, now);
              // achromatic luminance: bright with presence, dimmed by neglect
              const lum = clamp01((0.24 + th.presence * 0.74) * (1 - th.neglect * 0.42));
              const L = (lum * 100).toFixed(1);
              const opacity = clamp01(
                0.32 + th.presence * 0.68 - th.neglect * 0.22 + th.refuse * 0.4,
              );
              const width = Math.max(
                0.4,
                0.9 + th.presence * 2.7 - th.neglect * 0.75,
              );
              const glowing = th.presence > 0.14 && !th.lost;

              // afterimage ghost geometry (same path, faded brightness)
              const ghostL = (30 + th.afterimage * 58).toFixed(1);
              const ghostO = clamp01(th.afterimage * 0.34);

              return (
                <g key={th.id}>
                  {/* afterimage ghost, beneath the live thread */}
                  {th.afterimage > 0.02 && (
                    <path
                      d={d}
                      fill="none"
                      stroke={`hsl(0 0% ${ghostL}%)`}
                      strokeWidth={0.8 + th.afterimage * 1.6}
                      strokeLinecap="round"
                      opacity={ghostO}
                    />
                  )}

                  {/* the living filament */}
                  <g filter={glowing ? "url(#hl-glow)" : undefined}>
                    <path
                      d={d}
                      fill="none"
                      stroke={th.lost ? "hsl(0 0% 9%)" : `hsl(0 0% ${L}%)`}
                      strokeWidth={th.lost ? 0.5 : width}
                      strokeLinecap="round"
                      opacity={th.lost ? 0.16 : opacity}
                      strokeDasharray={th.loading ? "3 7" : undefined}
                      strokeDashoffset={th.loading ? -(now * 0.03) % 10 : undefined}
                    />
                  </g>

                  {/* anchor beads top + bottom */}
                  <circle
                    cx={th.cx}
                    cy={TOP_Y}
                    r={held ? 3.4 : 2.2}
                    fill={th.lost ? "hsl(0 0% 12%)" : `hsl(0 0% ${L}%)`}
                    opacity={th.lost ? 0.3 : 0.55 + th.presence * 0.45}
                  />
                  <circle
                    cx={th.cx}
                    cy={BOT_Y}
                    r={held ? 3.4 : 2.2}
                    fill={th.lost ? "hsl(0 0% 12%)" : `hsl(0 0% ${L}%)`}
                    opacity={th.lost ? 0.3 : 0.55 + th.presence * 0.45}
                  />

                  {/* generous, invisible tap target (≥44px wide) */}
                  <rect
                    x={th.cx - 26}
                    y={TOP_Y - 14}
                    width={52}
                    height={BOT_Y - TOP_Y + 28}
                    fill="transparent"
                    style={{ cursor: th.lost ? "not-allowed" : "pointer" }}
                    onPointerDown={(e) => {
                      e.preventDefault();
                      (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
                      if (!ensureStarted()) return;
                      tryHold(th.id, "pointer");
                    }}
                    onPointerUp={() => release(th.id, "pointer")}
                    onPointerCancel={() => release(th.id, "pointer")}
                    onLostPointerCapture={() => release(th.id, "pointer")}
                  />
                </g>
              );
            })}

            {/* pre-start hint threads so the field is legible before first touch */}
            {!started &&
              tracks.map((t, i) => {
                const cx =
                  MARGIN_X + (i * (VIEW_W - 2 * MARGIN_X)) / (THREAD_COUNT - 1);
                return (
                  <g key={`ghost-${t.id}`} pointerEvents="none">
                    <line
                      x1={cx}
                      y1={TOP_Y}
                      x2={cx}
                      y2={BOT_Y}
                      stroke="hsl(0 0% 26%)"
                      strokeWidth={0.9}
                      opacity={0.5}
                    />
                    <circle cx={cx} cy={TOP_Y} r={2.2} fill="hsl(0 0% 30%)" opacity={0.5} />
                    <circle cx={cx} cy={BOT_Y} r={2.2} fill="hsl(0 0% 30%)" opacity={0.5} />
                    <rect
                      x={cx - 26}
                      y={TOP_Y - 14}
                      width={52}
                      height={BOT_Y - TOP_Y + 28}
                      fill="transparent"
                      style={{ cursor: "pointer" }}
                      onPointerDown={(e) => {
                        e.preventDefault();
                        (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
                        if (!ensureStarted()) return;
                        tryHold(t.id, "pointer");
                      }}
                      onPointerUp={() => release(t.id, "pointer")}
                      onPointerCancel={() => release(t.id, "pointer")}
                      onLostPointerCapture={() => release(t.id, "pointer")}
                    />
                  </g>
                );
              })}
          </svg>
        </div>

        {/* ── legend: which take is which thread, and its neglect memory ── */}
        <div className="grid grid-cols-5 gap-x-2">
          {tracks.map((t, i) => {
            const th = threads[i];
            const held = th
              ? pointerHeldRef.current.has(th.id) || keyHeldRef.current.has(th.id)
              : false;
            const failed = th?.failed;
            const lost = th?.lost;
            const neglect = th?.neglect ?? 0;
            const labelClass = failed
              ? "text-destructive"
              : lost
                ? "text-muted-foreground/50"
                : held || (th?.presence ?? 0) > 0.15
                  ? "text-foreground"
                  : "text-muted-foreground";
            return (
              <div key={t.id} className="flex min-w-0 flex-col items-center gap-1.5">
                <span
                  className={`w-full truncate text-center text-sm ${labelClass}`}
                  title={t.title}
                >
                  {t.title}
                </span>
                <div className="h-1 w-full overflow-hidden rounded-full bg-border">
                  <div
                    className="h-full bg-muted-foreground transition-[width] duration-200"
                    style={{ width: `${Math.round(neglect * 100)}%` }}
                  />
                </div>
                <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  {failed ? "failed" : lost ? "gone" : held ? "held" : "neglect"}
                </span>
              </div>
            );
          })}
        </div>

        {/* ── design notes ── */}
        <details className="border-t border-border pt-4">
          <summary className="cursor-pointer font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground hover:text-foreground">
            Read the design notes
          </summary>
          <div className="mt-3 flex flex-col gap-2 text-sm leading-relaxed text-muted-foreground">
            <p>
              This is an anti-mixer. A fader bank lets you set a level and walk
              away; here presence is scarce and enacted. Holding a thread routes
              its looping audio — one of Karel&apos;s verified recordings — through
              a per-voice gain envelope that <em>is</em> the brightness you see,
              driven entirely by whether you are pressing. Release and the envelope
              decays over about a second and a half; you cannot set-and-forget.
            </p>
            <p>
              Attention is finite: at most two threads may sound at once, and a
              third press is refused with a brief pulse rather than granted. And
              attention has memory. Every unheld thread accrues neglect, which
              dims and thins it and scales its revive-rate by (1 − 0.72·neglect),
              so a long-neglected thread blooms back slowly. A thread left fully
              neglected long enough goes permanently dark for the session — true
              loss, revivable only by letting everything rest.
            </p>
            <p>
              Each thread quivers to its own live AnalyserNode tap, not a shared
              mix, so the light is that take&apos;s own energy. Every audible sound
              routes through a single createSafeMaster; there is zero synthesis.
              The palette is committed grayscale — white through graphite,
              luminance only.
            </p>
            <p>
              Lineage: Pauline Oliveros, <em>Deep Listening</em> — attention as an
              active, effortful discipline rather than a passive reception; and the
              2026 framing of the listener as composer-performer whose attention is
              the primary creative tool (ACM Creativity &amp; Cognition 2026).
            </p>
            <Link
              href="/dream"
              className="text-muted-foreground underline decoration-dotted underline-offset-4 hover:text-foreground"
            >
              ← back to the dream lab
            </Link>
          </div>
        </details>
      </div>

      <PrototypeNav slugs={["14848-holdlight"]} />
    </main>
  );
}
