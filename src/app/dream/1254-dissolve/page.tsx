"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { prefersReducedMotion } from "../_shared/psych/safeFlicker";
import { DissolveAudio } from "./audio";
import {
  MAX_NOTES,
  makeFieldRig,
  drawField,
  disposeFieldRig,
  type FieldRig,
  type FieldState,
} from "./field";

/**
 * 1254 · dissolve — the K-hole where the senses stop agreeing.
 *
 * You play the computer keyboard (a floating whole-tone scale). At first the sound
 * you hear and the ring you see are tightly bound. Over the session the AUDIO-VISUAL
 * DESYNC ENGINE unbinds them: the visual response lags, drifts out of phase, dilates
 * into slow motion, thins its slow rhythm while a fine grain climbs, and shears into
 * a melting void. "Re-bind" snaps them back so you feel the difference.
 * state: ketamine · pole: dissociative.
 */

// Home-row keys → whole-tone scale degrees 0..8.
const KEY_ROW = ["a", "s", "d", "f", "g", "h", "j", "k", "l"];
const KEY_LABELS = ["A", "S", "D", "F", "G", "H", "J", "K", "L"];

// Desync engine constants.
const AUTO_RAMP_SECONDS = 90; // desync auto-climbs 0→1 over ~90s of play
const MAX_LAG = 1.1; // seconds the visual onset lags the audio at full desync
const REBIND_KEY = " "; // spacebar re-binds

type Phase = "idle" | "running";

interface VNote {
  id: number;
  degree: number;
  vel: number;
  freqN: number; // 0..1 pitch tint
  realAge: number; // wall seconds since the audio onset
  visAge: number; // dilated visual age (starts once the lag elapses)
  appeared: boolean;
  baseX: number;
  baseY: number;
  jx: number; // drift direction (seeded)
  jy: number;
}

export default function DissolvePage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioRef = useRef<DissolveAudio | null>(null);
  const rigRef = useRef<FieldRig | null>(null);
  const rafRef = useRef<number | null>(null);
  const startedRef = useRef(false);

  // Desync engine state (refs so the RAF loop reads live values).
  const desyncRef = useRef(0); // eased, live value
  const desyncTargetRef = useRef(0); // where it is heading
  const driftRef = useRef(true); // auto-climb toward full desync?
  const visualClockRef = useRef(0); // dilated
  const realClockRef = useRef(0);
  const lfoPhaseRef = useRef(0); // detuned visual LFO phase
  const lastTimeRef = useRef(0);
  const reducedRef = useRef(false);

  // Notes & held-voice bookkeeping.
  const notesRef = useRef<VNote[]>([]);
  const nextNoteIdRef = useRef(1);
  const activeRef = useRef<Map<string, { voiceId: number }>>(new Map());
  const seedRef = useRef(0x1254dead);

  // Reusable uniform buffers (avoid per-frame allocation).
  const bufRef = useRef({
    pos: new Float32Array(MAX_NOTES * 2),
    age: new Float32Array(MAX_NOTES),
    freqN: new Float32Array(MAX_NOTES),
    vel: new Float32Array(MAX_NOTES),
    on: new Float32Array(MAX_NOTES),
  });

  const [phase, setPhase] = useState<Phase>("idle");
  const [desyncPct, setDesyncPct] = useState(0);
  const [pressed, setPressed] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  // Seeded LCG for jitter (no Math.random at module scope, and deterministic).
  const rand = useCallback((): number => {
    seedRef.current = (seedRef.current * 1664525 + 1013904223) >>> 0;
    return seedRef.current / 0xffffffff;
  }, []);

  /* ------------------------------ note onset ----------------------------- */
  const startNote = useCallback(
    (token: string, degree: number, velocity: number) => {
      const audio = audioRef.current;
      if (!audio || activeRef.current.has(token)) return;
      // Audio fires IMMEDIATELY — the stream you hear is never desynced.
      const freq = audio.freqFor(degree);
      const voiceId = audio.noteOn(freq, velocity);
      activeRef.current.set(token, { voiceId });

      // The VISUAL note enters the desync pipeline: anchored by scale degree
      // around a ring, with a seeded drift direction for the melt.
      const ang = (degree / KEY_ROW.length) * Math.PI * 2 - Math.PI / 2;
      const radius = 0.30;
      const jitter = 0.03;
      notesRef.current.push({
        id: nextNoteIdRef.current++,
        degree,
        vel: velocity,
        freqN: Math.max(0, Math.min(1, degree / (KEY_ROW.length - 1))),
        realAge: 0,
        visAge: 0,
        appeared: false,
        baseX: Math.cos(ang) * radius + (rand() - 0.5) * jitter,
        baseY: Math.sin(ang) * radius + (rand() - 0.5) * jitter,
        jx: (rand() - 0.5) * 2,
        jy: (rand() - 0.5) * 2,
      });
      if (notesRef.current.length > MAX_NOTES) {
        notesRef.current.splice(0, notesRef.current.length - MAX_NOTES);
      }
    },
    [rand],
  );

  const endNote = useCallback((token: string) => {
    const audio = audioRef.current;
    const active = activeRef.current.get(token);
    if (!audio || !active) return;
    audio.noteOff(active.voiceId);
    activeRef.current.delete(token);
  }, []);

  /* ------------------------------ render loop ---------------------------- */
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const rig = rigRef.current;
    const audio = audioRef.current;
    if (!canvas || !rig || !audio) return;

    const now = performance.now() / 1000;
    let dt = now - lastTimeRef.current;
    lastTimeRef.current = now;
    if (!(dt > 0) || dt > 0.1) dt = 0.016; // clamp/first-frame guard
    const reduced = reducedRef.current;

    // Resize (DPR capped at 1.6).
    const dpr = Math.min(1.6, window.devicePixelRatio || 1);
    const w = window.innerWidth;
    const h = window.innerHeight;
    const bw = Math.floor(w * dpr);
    const bh = Math.floor(h * dpr);
    if (canvas.width !== bw || canvas.height !== bh) {
      canvas.width = bw;
      canvas.height = bh;
      rig.gl.viewport(0, 0, bw, bh);
    }

    // ── Desync engine: advance the desync amount ──
    if (driftRef.current) {
      desyncTargetRef.current = Math.min(
        1,
        desyncTargetRef.current + dt / AUTO_RAMP_SECONDS,
      );
    }
    // ease the live value toward its target (fast enough to FEEL a re-bind)
    desyncRef.current +=
      (desyncTargetRef.current - desyncRef.current) * Math.min(1, dt * 2.2);
    const desync = desyncRef.current;

    // Time dilation: the visual clock runs slower as desync deepens.
    const timeScale = (1 - desync * 0.72) * (reduced ? 0.6 : 1);
    realClockRef.current += dt;
    visualClockRef.current += dt * timeScale;

    // The visual onset lag grows with desync.
    const lag = desync * MAX_LAG;

    // Advance every note through the desync pipeline; cull the dissolved.
    const lifetime = 2.4 + desync * 5.5; // stretched notes linger longer
    const notes = notesRef.current;
    for (let i = notes.length - 1; i >= 0; i--) {
      const n = notes[i];
      n.realAge += dt;
      if (!n.appeared && n.realAge >= lag) n.appeared = true;
      if (n.appeared) {
        n.visAge += dt * timeScale;
        if (n.visAge > lifetime) {
          notes.splice(i, 1);
        }
      }
    }

    // Audio envelope, and the coupled visual drive.
    const energy = audio.updateEnergy();
    // Detuned visual LFO — its rate does NOT match the audio, so once desync is
    // up the field breathes out of phase with what you hear (phase-drift).
    lfoPhaseRef.current += dt * timeScale * 0.9;
    const lfo = 0.5 + 0.5 * Math.sin(lfoPhaseRef.current * 2 * Math.PI * 0.11);
    const visualDrive = energy * (1 - desync) + lfo * desync;

    // Deepen the audio void as dissociation grows.
    audio.setVoidWet(0.42 + desync * 0.42);
    audio.setDroneDrive(0.18 + energy * 0.5 + desync * 0.22);

    // ── Pack note uniforms ──
    const buf = bufRef.current;
    const driftAmt = desync * 0.11;
    const count = Math.min(MAX_NOTES, notes.length);
    for (let i = 0; i < count; i++) {
      const n = notes[i];
      const px = n.baseX + n.jx * n.visAge * driftAmt;
      const py = n.baseY + n.jy * n.visAge * driftAmt - n.visAge * 0.008;
      buf.pos[i * 2] = px;
      buf.pos[i * 2 + 1] = py;
      buf.age[i] = n.visAge;
      buf.freqN[i] = n.freqN;
      buf.vel[i] = n.vel;
      buf.on[i] = n.appeared ? 1 : 0;
    }

    const state: FieldState = {
      time: visualClockRef.current,
      real: realClockRef.current,
      desync,
      energy: visualDrive,
      slowAmp: 1 - desync,
      shimmer: desync,
      flicker: 1, // steady; grain is spatial, never a luminance strobe
      reduced: reduced ? 1 : 0,
      count,
      pos: buf.pos,
      age: buf.age,
      freqN: buf.freqN,
      vel: buf.vel,
      on: buf.on,
    };
    drawField(rig, state);

    // Reflect the live desync into the UI a few times a second (cheap).
    const pct = Math.round(desync * 100);
    setDesyncPct((prev) => (prev === pct ? prev : pct));

    rafRef.current = requestAnimationFrame(draw);
  }, []);

  /* ------------------------------- start --------------------------------- */
  const handleStart = useCallback(async () => {
    if (startedRef.current) return;
    startedRef.current = true;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rig = makeFieldRig(canvas);
    if (!rig) {
      setError("WebGL2 is unavailable in this browser — the void cannot render.");
      startedRef.current = false;
      return;
    }
    rigRef.current = rig;

    reducedRef.current = prefersReducedMotion();
    const audio = new DissolveAudio();
    audioRef.current = audio;
    await audio.resume();

    // Reset the desync engine clocks.
    desyncRef.current = 0;
    desyncTargetRef.current = 0;
    driftRef.current = true;
    visualClockRef.current = 0;
    realClockRef.current = 0;
    lfoPhaseRef.current = 0;
    lastTimeRef.current = performance.now() / 1000;

    setPhase("running");
    rafRef.current = requestAnimationFrame(draw);
  }, [draw]);

  /* --------------------------- desync controls --------------------------- */
  const onDesyncSlider = useCallback((v: number) => {
    driftRef.current = false; // manual override pauses the auto-climb
    desyncTargetRef.current = Math.max(0, Math.min(1, v));
  }, []);

  const rebind = useCallback(() => {
    // Ramp desync back to 0 so the viewer FEELS the senses snap together again.
    driftRef.current = false;
    desyncTargetRef.current = 0;
  }, []);

  const letItDrift = useCallback(() => {
    driftRef.current = true;
    desyncTargetRef.current = desyncRef.current;
  }, []);

  /* --------------------------- keyboard events --------------------------- */
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return; // ignore OS auto-repeat so held keys don't retrigger
      if (e.key === REBIND_KEY) {
        e.preventDefault();
        rebind();
        return;
      }
      const k = e.key.toLowerCase();
      const degree = KEY_ROW.indexOf(k);
      if (degree === -1) return;
      e.preventDefault();
      if (!startedRef.current) {
        void handleStart();
        // defer the note until audio exists next frame
        window.setTimeout(() => startNote(k, degree, 0.85), 40);
      } else {
        startNote(k, degree, 0.85);
      }
      setPressed((prev) => {
        const next = new Set(prev);
        next.add(k);
        return next;
      });
    };
    const onKeyUp = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      const degree = KEY_ROW.indexOf(k);
      if (degree === -1) return;
      endNote(k);
      setPressed((prev) => {
        const next = new Set(prev);
        next.delete(k);
        return next;
      });
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [handleStart, startNote, endNote, rebind]);

  /* ------------------------------ teardown ------------------------------- */
  useEffect(() => {
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      const rig = rigRef.current;
      rigRef.current = null;
      if (rig) disposeFieldRig(rig);
      const a = audioRef.current;
      audioRef.current = null;
      if (a) void a.dispose();
      startedRef.current = false;
    };
  }, []);

  /* ------------------ on-screen pad pointer handlers --------------------- */
  const onPadDown = useCallback(
    (k: string, degree: number) => {
      if (!startedRef.current) {
        void handleStart();
        window.setTimeout(() => startNote(k, degree, 0.85), 40);
      } else {
        startNote(k, degree, 0.85);
      }
      setPressed((prev) => new Set(prev).add(k));
    },
    [handleStart, startNote],
  );
  const onPadUp = useCallback(
    (k: string) => {
      endNote(k);
      setPressed((prev) => {
        const next = new Set(prev);
        next.delete(k);
        return next;
      });
    },
    [endNote],
  );

  const bound = desyncPct < 8;

  return (
    <main className="relative h-dvh w-screen overflow-hidden bg-[#080a0d] text-white">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      {/* Header */}
      <div className="pointer-events-none absolute left-0 right-0 top-0 z-10 p-5 sm:p-7">
        <h1 className="font-serif text-2xl text-white sm:text-3xl">dissolve</h1>
        <p className="mt-1 max-w-xl text-base text-white/85">
          Play the keyboard: at first the sound you hear and the shape you see are
          bound together — then the senses slowly stop agreeing.
        </p>
        <p className="mt-1 font-mono text-sm text-white/60">
          state: ketamine · pole: dissociative
        </p>
      </div>

      {error && (
        <div className="absolute left-1/2 top-1/2 z-30 -translate-x-1/2 -translate-y-1/2 rounded-xl border border-rose-300/40 bg-rose-950/40 px-5 py-4">
          <p className="text-base text-rose-300">{error}</p>
        </div>
      )}

      {/* Idle splash */}
      {phase === "idle" && !error && (
        <div className="absolute inset-0 z-20 flex items-center justify-center">
          <button
            type="button"
            onClick={() => void handleStart()}
            className="min-h-[44px] rounded-2xl border border-slate-300/40 bg-slate-300/10 px-6 py-3.5 font-serif text-xl text-slate-100 backdrop-blur transition hover:bg-slate-300/20"
          >
            Begin — press A–L or tap the pads
          </button>
        </div>
      )}

      {/* Bottom controls + on-screen pads */}
      <div className="absolute bottom-0 left-0 right-0 z-10 p-4 sm:p-6">
        {/* Desync indicator + controls */}
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-3">
            <span className="font-mono text-sm text-white/75">desync</span>
            <div className="h-2 w-40 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-violet-300/80 transition-[width] duration-150"
                style={{ width: `${desyncPct}%` }}
              />
            </div>
            <span className="w-24 font-mono text-sm text-violet-300">
              {desyncPct}% {bound ? "· bound" : "· unbinding"}
            </span>
          </div>

          <input
            aria-label="Desync amount"
            type="range"
            min={0}
            max={100}
            value={desyncPct}
            onChange={(e) => onDesyncSlider(Number(e.target.value) / 100)}
            className="h-2 w-40 cursor-pointer accent-violet-300"
          />

          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={rebind}
              className="min-h-[44px] rounded-lg border border-violet-300/50 bg-violet-300/10 px-4 py-2.5 font-mono text-sm text-violet-300 transition hover:bg-violet-300/20"
            >
              Re-bind (snap senses back)
            </button>
            <button
              type="button"
              onClick={letItDrift}
              className="min-h-[44px] rounded-lg border border-white/20 bg-white/5 px-4 py-2.5 font-mono text-sm text-white/75 transition hover:bg-white/10"
            >
              Let it drift
            </button>
          </div>
        </div>

        <p className="mb-3 font-mono text-sm text-white/70">
          Keys A S D F G H J K L = a floating whole-tone scale · Spacebar = re-bind ·
          drag the slider to force the K-hole
        </p>

        {/* On-screen pads (phone-friendly, no physical keyboard needed) */}
        <div className="flex justify-center gap-1.5 sm:gap-2">
          {KEY_ROW.map((k, i) => {
            const isDown = pressed.has(k);
            return (
              <button
                key={k}
                type="button"
                aria-label={`Scale degree ${i + 1}`}
                onPointerDown={(e) => {
                  e.preventDefault();
                  onPadDown(k, i);
                }}
                onPointerUp={() => onPadUp(k)}
                onPointerLeave={() => {
                  if (pressed.has(k)) onPadUp(k);
                }}
                onPointerCancel={() => onPadUp(k)}
                className={`flex h-16 min-h-[44px] min-w-[44px] flex-1 select-none items-center justify-center rounded-lg border px-4 py-2.5 font-mono text-sm transition-transform ${
                  isDown
                    ? "border-slate-200/70 bg-slate-200/30 text-white"
                    : "border-white/20 bg-white/5 text-white/80 hover:bg-white/10"
                }`}
                style={{ transform: isDown ? "translateY(2px) scale(0.97)" : "none" }}
              >
                {KEY_LABELS[i]}
              </button>
            );
          })}
        </div>
      </div>

      {/* Design notes link */}
      <Link
        href="/dream/1254-dissolve/README.md"
        className="absolute right-4 top-4 z-20 font-mono text-sm text-white/60 underline decoration-white/30 underline-offset-4 transition hover:text-white/85"
      >
        Read the design notes
      </Link>
    </main>
  );
}
