"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 490 — Disintegration
// An homage to William Basinski, *The Disintegration Loops* (2002).
//
// A short warm modal loop is synthesized into a mutable sample buffer (a "tape").
// Each time the loop passes the playhead, a small random, IRREVERSIBLE round of
// damage is baked directly into the samples: amplitude bleeds away, high
// frequencies erode first, and dropouts tear permanent holes. The decay state
// PERSISTS and ACCUMULATES — once a region is gone it is gone. Over several
// minutes the loop thins, gaps open, and it crumbles toward silence. Listening
// is what consumes it.
//
// All synthesis + visuals + UI live in this folder. Web Audio API + Canvas2D only.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { renderLoop, makeRoomTone } from "./audio";
import { DisintegrationTape } from "./decay";

const LOOP_SECONDS = 8.6; // length of one tape loop
const REGION_COUNT = 256; // resolution of the decay field

type Phase = "idle" | "playing" | "gone";

export default function DisintegrationPage() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [canvasOk, setCanvasOk] = useState(true);

  // ── Audio refs ────────────────────────────────────────────────────────────
  const ctxRef = useRef<AudioContext | null>(null);
  const tapeRef = useRef<DisintegrationTape | null>(null);
  const masterRef = useRef<GainNode | null>(null);
  const roomRef = useRef<{ gain: GainNode; stop: () => void } | null>(null);
  const sourcesRef = useRef<AudioBufferSourceNode[]>([]);
  // when (in ctx time) the currently-scheduled last loop ENDS — next is queued here
  const nextStartRef = useRef(0);
  const schedTimerRef = useRef<number | null>(null);
  const holdingRef = useRef(false);

  // ── Visual refs ───────────────────────────────────────────────────────────
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef(0);
  // normalized playhead position 0..1 within the current loop, for the visual
  const playheadRef = useRef(0);
  // ctx time at which the currently-AUDIBLE loop started (for playhead calc)
  const audibleStartRef = useRef(0);

  // ── Scheduler ───────────────────────────────────────────────────────────────
  // We keep ~2 loops queued ahead. Each scheduled loop first advances the decay
  // (baking irreversible damage into tape.samples), then copies the now-eroded
  // samples into a fresh AudioBuffer and queues it seamlessly after the last.
  const scheduleAhead = useCallback(() => {
    const ctx = ctxRef.current;
    const tape = tapeRef.current;
    const master = masterRef.current;
    const room = roomRef.current;
    if (!ctx || !tape || !master) return;

    const SCHEDULE_HORIZON = 2.0; // seconds of audio to keep queued
    while (nextStartRef.current < ctx.currentTime + SCHEDULE_HORIZON) {
      // 1) advance the disintegration BEFORE rendering this pass
      tape.setHold(holdingRef.current);
      tape.step();

      // 2) bake the eroded samples into a one-shot AudioBuffer
      const buf = ctx.createBuffer(1, tape.length, tape.sampleRate);
      buf.getChannelData(0).set(tape.samples);

      const src = ctx.createBufferSource();
      src.buffer = buf;

      // 3) amplitude also bleeds with mean survival so it sinks toward silence
      const mean = tape.meanSurvival();
      const passGain = ctx.createGain();
      passGain.gain.value = Math.max(0, 0.0001 + 0.95 * mean);
      src.connect(passGain).connect(master);

      const startAt = nextStartRef.current;
      src.start(startAt);
      // track which loop is becoming audible (for the playhead)
      const localStart = startAt;
      src.onended = () => {
        // drop reference so it can be GC'd
        sourcesRef.current = sourcesRef.current.filter(
          (node: AudioBufferSourceNode) => node !== src
        );
      };
      // mark audible start when this one actually begins
      const delayMs = Math.max(0, (localStart - ctx.currentTime) * 1000);
      window.setTimeout(() => {
        audibleStartRef.current = localStart;
      }, delayMs);

      sourcesRef.current.push(src);
      nextStartRef.current = startAt + LOOP_SECONDS;

      // 4) fade the room-tone floor down as the music dies — never abrupt
      if (room) {
        const floor = Math.max(0, 0.06 * (0.35 + 0.65 * mean));
        room.gain.gain.setTargetAtTime(floor, ctx.currentTime, 2);
      }

      // 5) true end: when essentially nothing remains, stop scheduling
      if (tape.isNearlyGone()) {
        if (room) room.gain.gain.setTargetAtTime(0, ctx.currentTime, 8);
        setPhase("gone");
        return;
      }
    }
  }, []);

  // periodic scheduler tick
  useEffect(() => {
    if (phase !== "playing") return;
    schedTimerRef.current = window.setInterval(scheduleAhead, 250);
    return () => {
      if (schedTimerRef.current !== null) {
        window.clearInterval(schedTimerRef.current);
        schedTimerRef.current = null;
      }
    };
  }, [phase, scheduleAhead]);

  // ── Visual loop ─────────────────────────────────────────────────────────────
  const drawFrame = useCallback(() => {
    const canvas = canvasRef.current;
    const tape = tapeRef.current;
    const ctxAudio = ctxRef.current;
    if (!canvas) {
      rafRef.current = requestAnimationFrame(drawFrame);
      return;
    }
    const g = canvas.getContext("2d");
    if (!g) {
      setCanvasOk(false);
      return; // audio keeps running without the canvas
    }

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cw = canvas.clientWidth;
    const ch = canvas.clientHeight;
    if (canvas.width !== cw * dpr || canvas.height !== ch * dpr) {
      canvas.width = cw * dpr;
      canvas.height = ch * dpr;
    }
    g.setTransform(dpr, 0, 0, dpr, 0, 0);

    // dark indigo field, slight ghosting trail
    g.fillStyle = "rgba(10, 5, 20, 0.32)";
    g.fillRect(0, 0, cw, ch);

    if (tape) {
      // advance the visual playhead from the audible loop start
      if (ctxAudio) {
        const elapsed = ctxAudio.currentTime - audibleStartRef.current;
        const wrapped = ((elapsed % LOOP_SECONDS) + LOOP_SECONDS) % LOOP_SECONDS;
        playheadRef.current = wrapped / LOOP_SECONDS;
      }
      drawTapeRing(g, cw, ch, tape, playheadRef.current);
    }

    rafRef.current = requestAnimationFrame(drawFrame);
  }, []);

  useEffect(() => {
    rafRef.current = requestAnimationFrame(drawFrame);
    return () => cancelAnimationFrame(rafRef.current);
  }, [drawFrame]);

  // ── Start (must run inside the user gesture for iOS) ─────────────────────────
  const handleStart = useCallback(async () => {
    if (phase === "playing") return;
    setError(null);
    try {
      const AC: typeof AudioContext =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AC();
      ctxRef.current = ctx;
      // iOS: resume inside the gesture
      if (ctx.state === "suspended") await ctx.resume();

      // master chain → brick-wall limiter → destination
      const master = ctx.createGain();
      master.gain.value = 0.9;
      const limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = -2;
      limiter.knee.value = 0;
      limiter.ratio.value = 20;
      limiter.attack.value = 0.003;
      limiter.release.value = 0.25;
      master.connect(limiter).connect(ctx.destination);
      masterRef.current = master;

      // build the tape from a freshly rendered loop
      const samples = renderLoop(ctx.sampleRate, LOOP_SECONDS);
      const tape = new DisintegrationTape(
        { sampleRate: ctx.sampleRate, length: samples.length, regionCount: REGION_COUNT },
        samples
      );
      tapeRef.current = tape;

      // always-present room-tone floor
      roomRef.current = makeRoomTone(ctx, limiter);

      // prime the schedule a hair into the future for a clean first start
      nextStartRef.current = ctx.currentTime + 0.12;
      audibleStartRef.current = nextStartRef.current;

      setPhase("playing");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start audio.");
    }
  }, [phase]);

  // ── Listener gesture: "hold to remember" (slow decay, never reverse) ─────────
  const setHold = useCallback((on: boolean) => {
    holdingRef.current = on;
  }, []);

  // ── Re-excite: tap the ring to flicker a faded region back (at a global cost) ─
  const handleCanvasTap = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const tape = tapeRef.current;
    const canvas = canvasRef.current;
    if (!tape || !canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left - rect.width / 2;
    const y = e.clientY - rect.top - rect.height / 2;
    // angle around the ring → normalized loop position
    let ang = Math.atan2(y, x); // -π..π, 0 = +x (3 o'clock)
    ang = ang + Math.PI / 2; // rotate so top = loop start
    if (ang < 0) ang += Math.PI * 2;
    const norm = ang / (Math.PI * 2);
    tape.reExcite(norm);
  }, []);

  // ── Teardown ────────────────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      if (schedTimerRef.current !== null) window.clearInterval(schedTimerRef.current);
      for (const s of sourcesRef.current) {
        try {
          s.stop();
        } catch {
          /* already stopped */
        }
      }
      sourcesRef.current = [];
      roomRef.current?.stop();
      const ctx = ctxRef.current;
      if (ctx && ctx.state !== "closed") void ctx.close();
    };
  }, []);

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <main className="min-h-screen w-full bg-[#0a0514] text-foreground flex flex-col items-center">
      <div className="w-full max-w-3xl px-5 py-8 flex flex-col items-center gap-5">
        <div className="w-full flex items-center justify-between">
          <Link
            href="/dream"
            className="font-mono text-base text-muted-foreground hover:text-foreground min-h-[44px] flex items-center"
          >
            ← dream
          </Link>
          <span className="font-mono text-base text-muted-foreground">490</span>
        </div>

        <header className="text-center flex flex-col gap-2 mt-2">
          <h1 className="font-semibold text-3xl sm:text-4xl text-foreground">
            Disintegration
          </h1>
          <p className="text-base text-muted-foreground max-w-xl">
            A warm loop that physically crumbles as you listen. Each pass
            permanently erodes its own tape — minute five is not minute one.
            You cannot save it; you can only shape how it dies.
          </p>
        </header>

        <div className="relative w-full aspect-square max-w-[560px] mt-1">
          <canvas
            ref={canvasRef}
            onPointerDown={handleCanvasTap}
            className="absolute inset-0 h-full w-full rounded-full touch-none"
          />
          {phase === "idle" && (
            <button
              type="button"
              onClick={handleStart}
              className="absolute inset-0 m-auto h-[120px] w-[120px] rounded-full bg-violet-500/20 text-violet-300 font-mono text-lg min-h-[44px] flex items-center justify-center hover:bg-violet-500/30 transition-colors"
            >
              start
            </button>
          )}
        </div>

        {!canvasOk && (
          <p className="text-base text-muted-foreground text-center">
            Canvas unavailable on this device — the audio still disintegrates,
            you just won&apos;t see the ring.
          </p>
        )}

        {error && (
          <p className="font-mono text-base text-violet-300 text-center">{error}</p>
        )}

        {phase !== "idle" && (
          <div className="flex flex-col items-center gap-3 w-full">
            <p className="text-base text-muted-foreground text-center max-w-md">
              {phase === "gone"
                ? "The loop is gone. What you heard was consumed in the hearing."
                : "Tap the ring to re-excite a faded region — it returns as a ghost, and the rest decays faster to pay for it."}
            </p>
            <button
              type="button"
              onPointerDown={() => setHold(true)}
              onPointerUp={() => setHold(false)}
              onPointerLeave={() => setHold(false)}
              disabled={phase === "gone"}
              className="px-4 py-2.5 min-h-[44px] rounded-md bg-violet-500/20 text-violet-300 font-mono text-base hover:bg-violet-500/30 disabled:opacity-40 transition-colors touch-none select-none"
            >
              hold to remember
            </button>
          </div>
        )}

        <p className="font-mono text-base text-muted-foreground text-center mt-2 max-w-lg">
          after William Basinski — The Disintegration Loops (2002)
        </p>
      </div>
    </main>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Visual: a glowing circular "tape ring". Each region is an arc segment whose
// brightness/thickness = surviving content, whose hue cools as it muffles, and
// which tears into a dark gap once dead. A slow playhead sweeps the ring.
// ─────────────────────────────────────────────────────────────────────────────
function drawTapeRing(
  g: CanvasRenderingContext2D,
  cw: number,
  ch: number,
  tape: DisintegrationTape,
  playhead: number
): void {
  const cx = cw / 2;
  const cy = ch / 2;
  const baseR = Math.min(cw, ch) * 0.34;
  const regions = tape.regions;
  const n = regions.length;
  const startCutoff = Math.min(16000, tape.sampleRate / 2.2);

  g.save();
  g.translate(cx, cy);
  g.lineCap = "round";

  for (let i = 0; i < n; i++) {
    const r = regions[i];
    const a0 = (i / n) * Math.PI * 2 - Math.PI / 2;
    const a1 = ((i + 1) / n) * Math.PI * 2 - Math.PI / 2;
    const mid = (a0 + a1) / 2;

    if (r.torn || r.survival <= 0.015) {
      // a torn gap — faint cold scar so the ruin is still legible
      g.beginPath();
      g.strokeStyle = "rgba(70, 50, 110, 0.10)";
      g.lineWidth = 1;
      g.arc(0, 0, baseR, a0, a1);
      g.stroke();
      continue;
    }

    const surv = r.survival; // 0..1
    // brightness from cutoff: bright = full band, dim/cool = muffled
    const bright = Math.max(0, Math.min(1, Math.log2(r.cutoff / 200) / Math.log2(startCutoff / 200)));
    const thickness = 2 + surv * 22;
    const radius = baseR + (surv - 0.5) * 10;

    // hue: warm violet/amber when alive & bright → cold indigo as it muffles
    const hue = 250 + bright * 35; // 250 (indigo) .. ~285 (violet)
    const light = 18 + surv * 42 + bright * 18;
    const alpha = 0.18 + surv * 0.72;

    g.beginPath();
    g.strokeStyle = `hsla(${hue}, ${40 + bright * 45}%, ${light}%, ${alpha})`;
    g.lineWidth = thickness;
    g.arc(0, 0, radius, a0, a1);
    g.stroke();

    // a soft glow core for the still-living, still-bright regions
    if (surv > 0.4 && bright > 0.3) {
      g.beginPath();
      g.strokeStyle = `hsla(${hue + 10}, 80%, ${70}%, ${(surv - 0.4) * 0.5 * bright})`;
      g.lineWidth = thickness * 0.4;
      g.arc(0, 0, radius, a0, a1);
      g.stroke();
    }

    // faint radial filament inward — the ring feels like a physical reel
    const inner = radius - thickness * 0.5;
    g.beginPath();
    g.strokeStyle = `hsla(${hue}, 50%, 60%, ${surv * 0.06})`;
    g.lineWidth = 1;
    g.moveTo(Math.cos(mid) * (inner - 6), Math.sin(mid) * (inner - 6));
    g.lineTo(Math.cos(mid) * inner, Math.sin(mid) * inner);
    g.stroke();
  }

  // playhead: a thin bright sweep
  const pa = playhead * Math.PI * 2 - Math.PI / 2;
  g.beginPath();
  g.strokeStyle = "rgba(216, 180, 254, 0.85)";
  g.lineWidth = 2;
  g.moveTo(Math.cos(pa) * (baseR - 18), Math.sin(pa) * (baseR - 18));
  g.lineTo(Math.cos(pa) * (baseR + 18), Math.sin(pa) * (baseR + 18));
  g.stroke();
  // a small dot at the playhead tip
  g.beginPath();
  g.fillStyle = "rgba(216, 180, 254, 0.9)";
  g.arc(Math.cos(pa) * baseR, Math.sin(pa) * baseR, 2.5, 0, Math.PI * 2);
  g.fill();

  // center: aggregate survival as a fading ember + readout
  const mean = tape.meanSurvival();
  const emberR = 4 + mean * 30;
  const grad = g.createRadialGradient(0, 0, 0, 0, 0, emberR);
  grad.addColorStop(0, `hsla(270, 70%, 70%, ${0.18 * mean})`);
  grad.addColorStop(1, "hsla(270, 70%, 40%, 0)");
  g.fillStyle = grad;
  g.beginPath();
  g.arc(0, 0, emberR, 0, Math.PI * 2);
  g.fill();

  g.restore();

  // text readout (kept outside the rotated frame)
  g.save();
  g.font = "13px ui-monospace, monospace";
  g.fillStyle = "rgba(255,255,255,0.55)";
  g.textAlign = "center";
  g.fillText(
    `pass ${tape.passCount} · ${Math.round(mean * 100)}% remains`,
    cw / 2,
    ch / 2 + 6
  );
  g.restore();
}
