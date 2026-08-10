"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 9592 — Disintegration
//
// THE ONE QUESTION
//   What if a recording could only ever be heard FEWER times — a piece that
//   permanently, irreversibly erases itself as it plays, until it decays to
//   silence and cannot be recovered without starting over?
//
// A short loop of pure, austere just-intonation tones plays. Every pass through
// the loop, one note-event (grain) is PERMANENTLY lost — removed from the buffer
// for good — while a monotonic "erosion" value lowers a global lowpass, drops
// gain, and opens more silence between events. State only ever moves toward
// decay. Once it reaches silence, nothing recovers it: the sole way back is
// "Begin again", which starts a fresh loop from zero.
//
// Named reference: William Basinski, *The Disintegration Loops* (2002) — tape
// whose ferrite shed off the plastic each pass of the playhead, so the recording
// physically destroyed itself as it was heard.
//
// All synthesis + visuals + UI live in this folder. Web Audio API + Canvas2D only.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import { createSafeMaster, type SafeMaster } from "../_shared/visionary/safeMaster";
import { prefersReducedMotion } from "../_shared/visionary/safeFlicker";
import { PrototypeNav } from "../_shared/prototype-nav";

// ── Tuning of the piece ──────────────────────────────────────────────────────
const FUNDAMENTAL = 73.42; // Hz — a low D2, austere and papery
const RATIOS = [1, 5 / 4, 3 / 2, 15 / 8, 2]; // pure just-intonation drone chord
const GRAIN_COUNT = 30; // note-events in one pristine loop
const LOOP_SECONDS = 5.6; // one pass of the tape past the playhead
const EROSION_PASSES = 24; // passes over which erosion travels 0 → 1

type Grain = {
  ratio: number; // pitch ratio above the fundamental
  pos: number; // 0..1 position of the event within the loop
  alive: boolean; // once false, PERMANENTLY false
  fade: number; // visual alpha, animates 0..1 (drops to 0 when killed)
};

type DecayState = {
  grains: Grain[];
  erosion: number; // 0 (pristine) .. 1 (dust), monotonic
  passes: number;
  epoch: number; // performance.now() of loop-time origin
  audioEpoch: number; // ctx.currentTime origin for scheduling (−1 = no audio)
  done: boolean; // true silence reached
};

function freshState(now: number): DecayState {
  const grains: Grain[] = [];
  for (let i = 0; i < GRAIN_COUNT; i++) {
    grains.push({
      ratio: RATIOS[i % RATIOS.length],
      // spread events across the loop with a little jitter so it breathes
      pos: (i + 0.5) / GRAIN_COUNT + (Math.sin(i * 12.9898) * 0.5) / GRAIN_COUNT,
      alive: true,
      fade: 1,
    });
  }
  return {
    grains,
    erosion: 0,
    passes: 0,
    epoch: now,
    audioEpoch: -1,
    done: false,
  };
}

// Advance the decay by exactly one loop pass. IRREVERSIBLE: kills grains and
// only ever raises erosion. Nothing here can move state back toward life.
function advancePass(s: DecayState) {
  if (s.done) return;
  s.passes += 1;
  s.erosion = Math.min(1, s.erosion + 1 / EROSION_PASSES);

  const alive = s.grains.filter((g) => g.alive);
  // kill one grain per pass; a second once the tape is far gone, so the last
  // survivors don't linger forever.
  const kills = alive.length > 0 ? (s.erosion > 0.6 ? 2 : 1) : 0;
  for (let k = 0; k < kills; k++) {
    const living = s.grains.filter((g) => g.alive);
    if (living.length === 0) break;
    // erode from the high partials first (like tape losing its top end), with
    // a little randomness so the strip empties unevenly.
    living.sort((a, b) => b.ratio - a.ratio || Math.random() - 0.5);
    living[0].alive = false;
  }

  if (s.grains.every((g) => !g.alive) && s.erosion >= 1) s.done = true;
}

export default function DisintegrationPage() {
  const [audioOn, setAudioOn] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [remaining, setRemaining] = useState(GRAIN_COUNT);
  const [passes, setPasses] = useState(0);
  const [done, setDone] = useState(false);
  const [audioErr, setAudioErr] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stateRef = useRef<DecayState | null>(null);
  const rafRef = useRef(0);
  const passTimerRef = useRef(0); // wall-clock loop index already applied

  // audio
  const ctxRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<SafeMaster | null>(null);
  const schedRef = useRef<number | null>(null);
  const nextBoundaryRef = useRef(0);
  const reducedRef = useRef(false);

  // ── Schedule one loop's worth of grain events at ctx time t0 ──────────────
  const scheduleLoop = useCallback((t0: number) => {
    const ctx = ctxRef.current;
    const master = masterRef.current;
    const s = stateRef.current;
    if (!ctx || !master || !s) return;

    const erosion = s.erosion;
    // erosion pulls the world down: cutoff falls, level falls, silence widens.
    const cutoff = 2000 * Math.pow(0.06, erosion) + 110; // ~2110 → ~130 Hz
    const level = Math.pow(1 - erosion, 1.4); // → 0
    const skipProb = erosion * 0.55; // more dropouts as it wears

    for (const g of s.grains) {
      if (!g.alive) continue;
      if (Math.random() < skipProb) continue; // inter-event silence grows
      const t = t0 + g.pos * LOOP_SECONDS;
      const freq = FUNDAMENTAL * g.ratio;

      const osc = ctx.createOscillator();
      osc.type = "triangle";
      osc.frequency.value = freq;
      osc.detune.value = (Math.random() - 0.5) * 5;

      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = cutoff;
      lp.Q.value = 0.4;

      const env = ctx.createGain();
      // soft swell then long release — overlapping grains read as a drone
      const peak = 0.16 * level * (0.7 + 0.3 * (1 / g.ratio));
      const atk = 0.5;
      const rel = 2.6;
      env.gain.setValueAtTime(0.0001, t);
      env.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + atk);
      env.gain.exponentialRampToValueAtTime(0.0001, t + atk + rel);

      osc.connect(lp);
      lp.connect(env);
      env.connect(master.input);
      osc.start(t);
      osc.stop(t + atk + rel + 0.05);
    }
  }, []);

  const startAudio = useCallback(async () => {
    if (ctxRef.current) return;
    try {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const ctx = new Ctor();
      await ctx.resume();
      ctxRef.current = ctx;
      masterRef.current = createSafeMaster(ctx, { gain: 0.16 });

      const s = stateRef.current;
      if (s) s.audioEpoch = ctx.currentTime;
      nextBoundaryRef.current = ctx.currentTime + 0.15;

      // lookahead scheduler — keeps ~1s of loop queued to the audio clock
      schedRef.current = window.setInterval(() => {
        const c = ctxRef.current;
        if (!c) return;
        while (nextBoundaryRef.current < c.currentTime + 1.0) {
          scheduleLoop(nextBoundaryRef.current);
          nextBoundaryRef.current += LOOP_SECONDS;
        }
      }, 140);

      setAudioOn(true);
      setAudioErr(null);
    } catch {
      setAudioErr("Audio unavailable — the visual decay still plays.");
    }
  }, [scheduleLoop]);

  const stopAudio = useCallback(() => {
    if (schedRef.current !== null) {
      clearInterval(schedRef.current);
      schedRef.current = null;
    }
    masterRef.current?.disconnect();
    masterRef.current = null;
    const ctx = ctxRef.current;
    ctxRef.current = null;
    if (ctx) ctx.close().catch(() => {});
    setAudioOn(false);
  }, []);

  // ── Begin again — the ONLY recovery. A fresh, pristine loop from zero. ─────
  const beginAgain = useCallback(() => {
    const now = performance.now();
    stateRef.current = freshState(now);
    passTimerRef.current = 0;
    setRemaining(GRAIN_COUNT);
    setPasses(0);
    setDone(false);
    const ctx = ctxRef.current;
    if (ctx) {
      stateRef.current.audioEpoch = ctx.currentTime;
      nextBoundaryRef.current = ctx.currentTime + 0.15;
    }
  }, []);

  // ── Init: the visual timeline self-runs on load, audio or not ─────────────
  useEffect(() => {
    if (typeof window === "undefined") return;
    reducedRef.current = prefersReducedMotion();
    stateRef.current = freshState(performance.now());

    const canvas = canvasRef.current;
    const ctx2d = canvas?.getContext("2d");
    if (!canvas || !ctx2d) return;

    let dpr = Math.min(2, window.devicePixelRatio || 1);
    const resize = () => {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = canvas.clientWidth || window.innerWidth;
      const h = canvas.clientHeight || window.innerHeight;
      canvas.width = Math.max(1, Math.floor(w * dpr));
      canvas.height = Math.max(1, Math.floor(h * dpr));
    };
    resize();
    window.addEventListener("resize", resize);

    let uiAccum = 0;

    const frame = () => {
      const s = stateRef.current;
      if (!s) {
        rafRef.current = requestAnimationFrame(frame);
        return;
      }
      const now = performance.now();

      // wall-clock drives the irreversible passes — runs with or without audio
      const loopIndex = Math.floor((now - s.epoch) / (LOOP_SECONDS * 1000));
      while (passTimerRef.current < loopIndex) {
        passTimerRef.current += 1;
        advancePass(s);
      }

      // animate each grain's visual fade toward its (alive?1:0) target
      const reduced = reducedRef.current;
      const fadeStep = reduced ? 0.012 : 0.03;
      for (const g of s.grains) {
        const target = g.alive ? 1 : 0;
        if (g.fade < target) g.fade = Math.min(target, g.fade + fadeStep);
        else if (g.fade > target) g.fade = Math.max(target, g.fade - fadeStep);
      }

      draw(ctx2d, canvas.width, canvas.height, dpr, s, now, reduced);

      // throttle React chrome updates to a few times a second
      uiAccum += 1;
      if (uiAccum >= 12) {
        uiAccum = 0;
        const alive = s.grains.reduce((n, g) => n + (g.alive ? 1 : 0), 0);
        setRemaining(alive);
        setPasses(s.passes);
        setDone(s.done);
      }

      rafRef.current = requestAnimationFrame(frame);
    };
    rafRef.current = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
    };
  }, []);

  // cleanup audio on unmount
  useEffect(() => () => stopAudio(), [stopAudio]);

  return (
    <div className="relative h-screen w-full overflow-hidden bg-background">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      {/* ── Header / counter chrome ─────────────────────────────────────────── */}
      <div className="pointer-events-none absolute left-4 top-4 flex flex-col gap-1">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          9592 · disintegration
        </p>
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground/80">
          notes remaining: {remaining} / {GRAIN_COUNT}
        </p>
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground/60">
          passes: {passes}
          {done ? " · silence" : ""}
        </p>
      </div>

      {/* ── Controls ────────────────────────────────────────────────────────── */}
      <div className="absolute right-4 top-4 flex items-center gap-2">
        {!audioOn ? (
          <button
            onClick={startAudio}
            className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Play
          </button>
        ) : (
          <button
            onClick={stopAudio}
            className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            Mute
          </button>
        )}
        <button
          onClick={beginAgain}
          className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          Begin again
        </button>
      </div>

      {audioErr && (
        <div className="pointer-events-none absolute left-1/2 top-4 w-fit max-w-[90vw] -translate-x-1/2 rounded-md border border-border bg-background/80 px-4 py-2 text-center text-sm text-muted-foreground backdrop-blur-sm">
          {audioErr}
        </div>
      )}

      {/* ── Center caption when the tape has emptied out ─────────────────────── */}
      {done && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <p className="max-w-md px-6 text-center text-base leading-relaxed text-muted-foreground">
            The loop has erased itself. It cannot be recovered — only begun again.
          </p>
        </div>
      )}

      {/* ── Design notes ────────────────────────────────────────────────────── */}
      <button
        onClick={() => setNotesOpen(true)}
        className="absolute bottom-3 right-4 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground/70 transition-colors hover:text-foreground"
      >
        Design notes
      </button>

      {notesOpen && (
        <div
          className="absolute inset-0 z-10 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm"
          onClick={() => setNotesOpen(false)}
        >
          <div
            className="max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              9592 · disintegration
            </p>
            <h2 className="mt-2 text-xl font-semibold tracking-tight text-foreground">
              A recording you can only hear fewer times
            </h2>
            <div className="mt-4 space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                A short loop of pure just-intonation tones plays over a low
                fundamental. Every pass through the loop, one note is permanently
                and irreversibly lost — removed from the loop for good — while a
                monotonic erosion lowers a lowpass filter, drops the level, and
                opens more silence between events. The state only ever moves
                toward decay.
              </p>
              <p>
                Over a couple of minutes the strip of tick-marks empties, dust
                accumulates, and it fades to true silence. Once gone, nothing
                recovers it: the only way to hear the full loop again is
                &ldquo;Begin again&rdquo;, which starts a fresh loop from zero.
              </p>
              <p>
                After William Basinski, <em>The Disintegration Loops</em> (2002)
                — magnetic tape whose ferrite shed off the plastic each pass of
                the playhead, so the recording destroyed itself as it was heard.
              </p>
            </div>
            <button
              onClick={() => setNotesOpen(false)}
              className="mt-5 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Close
            </button>
          </div>
        </div>
      )}

      <PrototypeNav slugs={["9592-disintegration"]} />
    </div>
  );
}

// ── Monochrome film-grain / dust rendering ───────────────────────────────────
// Stark, papery, cold. A horizontal strip of tick-marks (one per note-event);
// each lost tick fades out for good and a wash of grain accumulates.
function draw(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  dpr: number,
  s: DecayState,
  now: number,
  reduced: boolean,
) {
  const erosion = s.erosion;

  // ash / near-white paper ground, cooling very slightly as it decays
  const ground = 232 - erosion * 14; // 232 → 218
  ctx.fillStyle = `rgb(${ground}, ${ground - 1}, ${ground - 4})`;
  ctx.fillRect(0, 0, W, H);

  const cx = W / 2;
  const stripY = H / 2;
  const stripW = Math.min(W * 0.8, 1100 * dpr);
  const x0 = cx - stripW / 2;
  const tickH = Math.min(H * 0.26, 190 * dpr);

  // faint baseline of the strip
  ctx.strokeStyle = `rgba(40, 40, 46, ${0.1 * (1 - erosion * 0.5)})`;
  ctx.lineWidth = Math.max(1, dpr);
  ctx.beginPath();
  ctx.moveTo(x0, stripY);
  ctx.lineTo(x0 + stripW, stripY);
  ctx.stroke();

  // the tick-marks — one per note-event, taller for lower ratios
  for (const g of s.grains) {
    if (g.fade <= 0.001) continue;
    const gx = x0 + g.pos * stripW;
    const h = tickH * (0.55 + 0.45 * (1 / g.ratio));
    // ink fades with the grain's death AND dims globally with erosion
    const a = g.fade * (0.32 + 0.38 * (1 - erosion));
    ctx.strokeStyle = `rgba(28, 28, 34, ${a})`;
    ctx.lineWidth = Math.max(1, dpr * 1.3);
    ctx.beginPath();
    ctx.moveTo(gx, stripY - h / 2);
    ctx.lineTo(gx, stripY + h / 2);
    ctx.stroke();
  }

  // a soft playhead sweeping the strip in loop-time (the tape passing the head)
  const loopPhase = ((now - s.epoch) / (LOOP_SECONDS * 1000)) % 1;
  const px = x0 + loopPhase * stripW;
  const grad = ctx.createLinearGradient(px - 30 * dpr, 0, px + 30 * dpr, 0);
  const pa = 0.14 * (1 - erosion * 0.7);
  grad.addColorStop(0, "rgba(30,30,36,0)");
  grad.addColorStop(0.5, `rgba(30,30,36,${pa})`);
  grad.addColorStop(1, "rgba(30,30,36,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(px - 30 * dpr, stripY - tickH / 2, 60 * dpr, tickH);

  // ── accumulating dust — low-contrast, calm; denser as it decays ───────────
  const baseDust = reduced ? 90 : 220;
  const maxDust = reduced ? 500 : 1700;
  const count = Math.floor(baseDust + erosion * maxDust);
  const maxA = reduced ? 0.05 : 0.08;
  ctx.fillStyle = `rgba(36, 36, 42, 1)`;
  for (let i = 0; i < count; i++) {
    const rx = Math.random() * W;
    const ry = Math.random() * H;
    const a = Math.random() * maxA;
    const sz = Math.random() < 0.12 ? 2 * dpr : dpr;
    ctx.globalAlpha = a;
    ctx.fillRect(rx, ry, sz, sz);
  }
  ctx.globalAlpha = 1;

  // a faint vignette to keep it cold and papery at the edges
  const vg = ctx.createRadialGradient(cx, stripY, W * 0.2, cx, stripY, W * 0.7);
  vg.addColorStop(0, "rgba(0,0,0,0)");
  vg.addColorStop(1, `rgba(20,20,26,${0.06 + erosion * 0.08})`);
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);
}
