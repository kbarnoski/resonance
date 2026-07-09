"use client";

// 1314-motif-weave — "Motif Weave".
// What if the journey REMEMBERED you MUSICALLY? Every melodic phrase you play
// is recorded into a never-cleared library and woven back in later — transposed,
// stretched, harmonised, reversed, set in canon — so at minute 6 you literally
// hear irreversible echoes of the phrase you played at minute 1. Each remembered
// motif is also a persistent luminous thread in a woven light-field. A single-
// performer echo of teamLab's "The World of Irreversible Change" (2026): the work
// changes irreversibly with your presence; you become part of its structure.
//
// SSR-safe: no window/AudioContext at module scope — all behind the Begin gate
// and inside effects. Pointer PLAYS melody; mic amplitude is "breath" with a
// graceful pointer-only fallback. Photosensitive-safe: smooth luminance only,
// any flicker through SafeFlicker (≤3 Hz, opt-in, instant kill).

import { useCallback, useEffect, useRef, useState } from "react";
import { MotifEngine } from "./engine";
import { drawWeave } from "./weave";
import { createSafeFlicker, SafeFlicker, prefersReducedMotion } from "../_shared/psych/safeFlicker";

type Phase = "idle" | "running";

export default function MotifWeavePage() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [flickerOn, setFlickerOn] = useState(false);
  const [micMsg, setMicMsg] = useState<string | null>(null);
  const [micState, setMicState] = useState<"off" | "on" | "denied">("off");
  const [hud, setHud] = useState({
    phaseName: "drifting off",
    elapsed: 0,
    tempo: 52,
    motifs: 0,
    played: 0,
    recalls: 0,
    breath: 0,
    note: "",
  });

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<MotifEngine | null>(null);
  const flickerRef = useRef<SafeFlicker | null>(null);
  const rafRef = useRef(0);
  const lastTsRef = useRef(0);
  const dprRef = useRef(1);
  const drawingRef = useRef(false); // is a pointer gesture in progress?

  // ── Engine + render loop (client-only; alive before Begin). ─────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const g = canvas.getContext("2d");
    if (!g) {
      setMicMsg("Canvas2D unavailable in this browser.");
      return;
    }

    const engine = new MotifEngine();
    engineRef.current = engine;
    flickerRef.current = createSafeFlicker({ maxHz: 3, defaultHz: 1.3, floor: 0.6 });

    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      dprRef.current = dpr;
      const w = canvas.clientWidth || window.innerWidth;
      const h = canvas.clientHeight || window.innerHeight;
      canvas.width = Math.max(1, Math.round(w * dpr));
      canvas.height = Math.max(1, Math.round(h * dpr));
    };
    resize();
    window.addEventListener("resize", resize);

    let hudTick = 0;
    const frame = (ts: number) => {
      rafRef.current = requestAnimationFrame(frame);
      const last = lastTsRef.current || ts;
      const dt = (ts - last) / 1000;
      lastTsRef.current = ts;

      engine.tick(dt);
      const flick = flickerRef.current ? flickerRef.current.value(ts / 1000) : 1;
      drawWeave(g, engine, {
        W: canvas.width,
        H: canvas.height,
        dpr: dprRef.current,
        nowMs: performance.now(),
        flick,
      });

      if (ts - hudTick > 140) {
        hudTick = ts;
        setHud({
          phaseName: engine.phaseName,
          elapsed: engine.elapsed,
          tempo: engine.tempoBpm,
          motifs: engine.motifs.length,
          played: engine.playedCount,
          recalls: engine.recallTotal,
          breath: engine.breath,
          note: engine.lastNote,
        });
      }
    };
    rafRef.current = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
      engineRef.current?.dispose();
      engineRef.current = null;
    };
  }, []);

  // ── Begin: unlock audio (browser autoplay requires a gesture). ──────────────
  const begin = useCallback(async () => {
    const engine = engineRef.current;
    if (!engine) return;
    await engine.start();
    setPhase("running");
  }, []);

  const beginAgain = useCallback(() => {
    engineRef.current?.beginAgain();
  }, []);

  // ── Mic breath (graceful fallback). ─────────────────────────────────────────
  const enableMic = useCallback(async () => {
    const engine = engineRef.current;
    if (!engine || !engine.active) return;
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setMicState("denied");
      setMicMsg("Mic unavailable — breath disabled; pointer play still works.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      engine.attachMic(stream);
      setMicState("on");
      setMicMsg(null);
    } catch {
      setMicState("denied");
      setMicMsg("Mic denied — breath disabled; pointer play still works.");
    }
  }, []);

  // ── Pointer performance: drag PLAYS melody the piece will remember. ─────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const norm = (clientX: number, clientY: number) => {
      const r = canvas.getBoundingClientRect();
      return {
        nx: (clientX - r.left) / Math.max(1, r.width),
        ny: (clientY - r.top) / Math.max(1, r.height),
      };
    };
    const onDown = (ev: PointerEvent) => {
      const eng = engineRef.current;
      if (!eng || !eng.active) return;
      drawingRef.current = true;
      eng.beginGesture();
      const { nx, ny } = norm(ev.clientX, ev.clientY);
      eng.playPointerNote(nx, ny);
      canvas.setPointerCapture?.(ev.pointerId);
    };
    const onMove = (ev: PointerEvent) => {
      if (!drawingRef.current) return;
      const eng = engineRef.current;
      if (!eng) return;
      const { nx, ny } = norm(ev.clientX, ev.clientY);
      eng.playPointerNote(nx, ny);
    };
    const onUp = () => {
      if (!drawingRef.current) return;
      drawingRef.current = false;
      engineRef.current?.endGesture();
    };

    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onUp);
    canvas.addEventListener("pointerleave", onUp);
    return () => {
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
      canvas.removeEventListener("pointerleave", onUp);
    };
  }, []);

  const toggleFlicker = useCallback(() => {
    const f = flickerRef.current;
    if (!f) return;
    if (f.enabled) {
      f.kill();
      setFlickerOn(false);
    } else {
      f.enable();
      setFlickerOn(true);
    }
  }, []);

  const mmss = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };
  const pct = (x: number) => Math.round(x * 100);

  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-[#06040e] text-white">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none" />

      <span className="absolute left-4 top-4 z-20 rounded-md bg-black/45 px-3 py-1.5 font-mono text-sm text-white/75">
        Canvas2D · woven memory
      </span>
      <a
        href="/dream/1314-motif-weave/README.md"
        target="_blank"
        rel="noreferrer"
        className="absolute right-4 top-4 z-20 font-mono text-sm text-white/75 underline decoration-white/40 underline-offset-4 hover:text-white"
      >
        Read the design notes ↗
      </a>

      <div className="relative z-10 flex min-h-screen flex-col justify-between p-6 md:p-10">
        {/* Header */}
        <header className="max-w-2xl">
          <h1 className="text-2xl font-semibold tracking-tight text-white md:text-3xl">Motif Weave</h1>
          <p className="mt-2 text-base text-white/75">
            A long-form dream that <span className="text-violet-300">remembers you musically</span>. Every phrase you
            play is recorded into a growing library and woven back in later — transposed, stretched, harmonised,
            reversed — so at minute six you hear irreversible echoes of what you played at minute one. Each remembered
            motif becomes a persistent thread of light in the weave.
          </p>
          {micMsg && <p className="mt-2 text-base text-rose-300">{micMsg}</p>}
        </header>

        {/* Center: Begin */}
        <section className="flex flex-col items-start gap-3">
          {phase === "idle" && (
            <>
              <button
                onClick={() => void begin()}
                className="min-h-[44px] rounded-md border border-violet-400/40 bg-violet-500/15 px-4 py-2.5 text-base font-medium text-violet-100 hover:bg-violet-500/25"
              >
                Begin · enter the weave
              </button>
              <p className="max-w-xl font-mono text-sm text-white/55">
                the loom already drifts below — tap Begin to give it sound, then drag to play a phrase it will remember
              </p>
            </>
          )}
        </section>

        {/* Footer: live readout + controls */}
        {phase === "running" && (
          <footer className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 font-mono text-sm text-white/75">
              <span>
                phase <span className="text-violet-300">{hud.phaseName}</span>
              </span>
              <span>
                {mmss(hud.elapsed)} · <span className="text-white/95">{Math.round(hud.tempo)} bpm</span>
              </span>
              <span>
                threads <span className="text-amber-200">{hud.motifs}</span>
              </span>
              <span>
                you played <span className="text-emerald-300">{hud.played}</span>
              </span>
              <span>
                recalls <span className="text-violet-200">{hud.recalls}</span>
              </span>
              <span className="text-white/55">
                breath {pct(hud.breath)}
                {hud.note ? ` · ${hud.note}` : ""}
              </span>
            </div>

            <p className="max-w-2xl text-base text-white/75">
              Drag anywhere to play a melody — position sets pitch. Release and it is committed to memory forever (within
              this run) and will return, transformed, minutes later. Let go entirely and idle seed phrases keep the dream
              alive on their own.
            </p>

            <div className="flex flex-wrap items-center gap-2">
              {micState === "off" && (
                <button
                  onClick={() => void enableMic()}
                  className="min-h-[44px] rounded-md border border-white/20 bg-white/5 px-4 py-2.5 text-base text-white/90 hover:bg-white/10"
                >
                  Add breath (mic)
                </button>
              )}
              {micState === "on" && (
                <span className="font-mono text-sm text-emerald-300">breath active — exhale to brighten the dream</span>
              )}
              <button
                onClick={toggleFlicker}
                className={`min-h-[44px] rounded-md px-4 py-2.5 text-base ${
                  flickerOn ? "bg-white/25 text-white" : "bg-white/5 text-white/75 hover:bg-white/10"
                }`}
              >
                {flickerOn ? "flicker on (≤3 Hz) — tap to kill" : "add gentle flicker (≤3 Hz)"}
              </button>
              <button
                onClick={beginAgain}
                className="min-h-[44px] rounded-md border border-white/15 bg-white/5 px-4 py-2.5 text-base text-white/75 hover:bg-white/10"
              >
                Begin again (clear memory)
              </button>
            </div>
            {prefersReducedMotion() && (
              <p className="font-mono text-sm text-white/55">reduced-motion respected — drift only, no flicker</p>
            )}
          </footer>
        )}
      </div>
    </main>
  );
}
