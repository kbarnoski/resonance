"use client";

/**
 * 868-kids-monster-keys — "Monster Keys"
 *
 * What if a 4-year-old could play a genuinely WRONG (dissonant) note — and
 * dissonance was a friendly wobbly MONSTER they could CALM by resolving it,
 * instead of a forbidden mistake?
 *
 * INPUT: on-screen creature-keys (primary) + Web MIDI (optional bonus)
 * OUTPUT: raw WebGL2 (hand-written GLSL, additive blending)
 * TECHNIQUE: interval-clash scoring -> spawn wobble-monster -> resolve-by-consonance
 * PALETTE: warm, playful, friendly-monster
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { MonsterAudio } from "./audio";
import {
  NOTE_COUNT,
  NOTE_HUE,
  scoreClashes,
  suggestResolution,
  isResolved,
} from "./harmony";
import { Renderer, type CreatureGPU } from "./render";

type MidiStatus = "checking" | "connected" | "none" | "unsupported";

// Visual creature state per note (smoothed targets for WebGL).
type Creature = {
  index: number;
  on: boolean;
  glow: number; // current
  glowT: number; // target
  wobble: number; // current
  wobbleT: number; // target
};

export default function Page() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioRef = useRef<MonsterAudio | null>(null);
  const rendererRef = useRef<Renderer | null>(null);
  const rafRef = useRef(0);
  const glRef = useRef<WebGL2RenderingContext | null>(null);
  const midiRef = useRef<MIDIAccess | null>(null);
  const midiInputsRef = useRef<MIDIInput[]>([]);

  const creaturesRef = useRef<Creature[]>(
    Array.from({ length: NOTE_COUNT }, (_, i) => ({
      index: i,
      on: false,
      glow: 0,
      glowT: 0,
      wobble: 0,
      wobbleT: 0,
    }))
  );
  const lastTouchRef = useRef<number>(0);
  const demoRef = useRef<{ phase: number; t: number }>({ phase: 0, t: 0 });
  const suggestionRef = useRef<number | null>(null);

  const [started, setStarted] = useState(false);
  const [glError, setGlError] = useState<string | null>(null);
  const [midiStatus, setMidiStatus] = useState<MidiStatus>("checking");
  // Re-render React when held set changes (drives key highlight ring).
  const [, setTick] = useState(0);
  const [suggestion, setSuggestion] = useState<number | null>(null);

  // ── Engine: toggle a note creature on/off ──────────────────────────────────
  const toggleNote = useCallback((index: number, velocity = 0.85) => {
    const audio = audioRef.current;
    if (!audio) return;
    lastTouchRef.current = performance.now();
    demoRef.current.phase = 0;
    const cr = creaturesRef.current[index];
    if (audio.isOn(index)) {
      audio.noteOff(index);
      cr.on = false;
      cr.glowT = 0;
      cr.wobbleT = 0;
    } else {
      audio.noteOn(index, velocity);
      cr.on = true;
      cr.glowT = 0.45 + velocity * 0.55;
    }
    refreshHarmony();
    setTick((t) => t + 1);
  }, []);

  // ── Recompute clash scoring + wobble + resolution invitation ───────────────
  const refreshHarmony = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const held = audio.heldIndices();
    const { clashes } = scoreClashes(held);

    // Reset wobble targets, then assign per-note worst clash below.
    for (const cr of creaturesRef.current) cr.wobbleT = 0;
    const perNote = new Map<number, number>();
    for (const c of clashes) {
      perNote.set(c.a, Math.max(perNote.get(c.a) ?? 0, c.strength));
      perNote.set(c.b, Math.max(perNote.get(c.b) ?? 0, c.strength));
    }
    for (const cr of creaturesRef.current) {
      const w = perNote.get(cr.index) ?? 0;
      cr.wobbleT = w;
      audio.applyWobble(cr.index, w);
    }

    const wasClashing = (suggestionRef.current ?? -1) >= 0;
    const sug = suggestResolution(held);
    suggestionRef.current = sug;
    setSuggestion(sug);

    // Reward when a previously-clashing set becomes fully consonant.
    if (wasClashing && isResolved(held) && held.length >= 2) {
      audio.rewardBloom();
      for (const cr of creaturesRef.current) {
        if (cr.on) cr.glowT = Math.min(1, cr.glow + 0.5);
      }
    }
  }, []);

  // ── Start (iOS gesture gate) ────────────────────────────────────────────────
  const handleStart = useCallback(async () => {
    if (started) return;
    const audio = new MonsterAudio();
    const ok = await audio.start();
    if (!ok) {
      setGlError("Audio is not available on this device.");
      return;
    }
    audioRef.current = audio;
    setStarted(true);
    setupMidi();
  }, [started]);

  // ── Web MIDI (optional bonus) ───────────────────────────────────────────────
  const setupMidi = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.requestMIDIAccess) {
      setMidiStatus("unsupported");
      return;
    }
    setMidiStatus("checking");
    navigator
      .requestMIDIAccess({ sysex: false })
      .then((access) => {
        midiRef.current = access;
        const wire = () => {
          for (const inp of midiInputsRef.current) inp.onmidimessage = null;
          const inputs: MIDIInput[] = [];
          access.inputs.forEach((input) => {
            input.onmidimessage = (e: MIDIMessageEvent) => {
              const d = e.data;
              if (!d || d.length < 3) return;
              const status = d[0] & 0xf0;
              const note = d[1];
              const vel = d[2];
              const idx = ((note % 12) + 12) % 12;
              if (status === 0x90 && vel > 0) {
                if (!audioRef.current?.isOn(idx)) toggleNote(idx, vel / 127);
              } else if (status === 0x80 || (status === 0x90 && vel === 0)) {
                if (audioRef.current?.isOn(idx)) toggleNote(idx);
              }
            };
            inputs.push(input);
          });
          midiInputsRef.current = inputs;
          setMidiStatus(inputs.length > 0 ? "connected" : "none");
        };
        wire();
        access.onstatechange = wire;
      })
      .catch(() => setMidiStatus("none"));
  }, [toggleNote]);

  // ── WebGL2 setup + animation loop ───────────────────────────────────────────
  useEffect(() => {
    if (!started) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext("webgl2", {
      alpha: false,
      antialias: true,
      premultipliedAlpha: false,
    });
    if (!gl) {
      setGlError("WebGL2 is not available — the sounds still play, watch and listen.");
    } else {
      glRef.current = gl;
      try {
        rendererRef.current = new Renderer(gl);
      } catch (err) {
        setGlError("Could not start the picture — the sounds still play.");
        rendererRef.current = null;
        console.error(err);
      }
    }

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.floor(canvas.clientWidth * dpr);
      const h = Math.floor(canvas.clientHeight * dpr);
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
    };
    resize();
    window.addEventListener("resize", resize);

    let prev = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - prev) / 1000);
      prev = now;
      const time = now / 1000;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);

      runAutoDemo(now, dt);

      // Smooth creature glow/wobble toward targets.
      const crs = creaturesRef.current;
      for (const cr of crs) {
        cr.glow += (cr.glowT - cr.glow) * Math.min(1, dt * 6);
        cr.wobble += (cr.wobbleT - cr.wobble) * Math.min(1, dt * 4);
      }

      const audio = audioRef.current;
      const energy = audio ? audio.energy() : 0;

      const renderer = rendererRef.current;
      if (renderer && glRef.current) {
        resize();
        const gpu = buildCreatureGPU(crs, time);
        renderer.draw(gpu, time, energy, dpr);
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started]);

  // ── Auto-demo: spawn-then-calm arc on a gentle loop ────────────────────────
  const runAutoDemo = useCallback((now: number, dt: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    if (now - lastTouchRef.current < 1500) return; // child is playing
    const demo = demoRef.current;
    demo.t += dt;

    // Two clashing notes (minor 2nd: do + the note just above it).
    const A = 0; // do
    const B = 1; // the clashing semitone above
    const RES = 7; // a perfect 5th — the calming resolution

    switch (demo.phase) {
      case 0: // ensure clean slate
        for (let i = 0; i < NOTE_COUNT; i++) if (audio.isOn(i)) silentOff(i);
        demo.phase = 1;
        demo.t = 0;
        break;
      case 1: // sound the clash -> visible wobble-monster
        silentOn(A, 0.8);
        silentOn(B, 0.8);
        refreshHarmony();
        demo.phase = 2;
        demo.t = 0;
        break;
      case 2:
        // Hold the wobble-monster on screen ~1s, then resolve (spawn-then-calm).
        if (demo.t > 1.0) {
          // add the resolving note -> monster settles + bloom
          silentOn(RES, 0.85);
          refreshHarmony();
          demo.phase = 3;
          demo.t = 0;
        }
        break;
      case 3:
        if (demo.t > 1.8) {
          for (let i = 0; i < NOTE_COUNT; i++) if (audio.isOn(i)) silentOff(i);
          refreshHarmony();
          demo.phase = 4;
          demo.t = 0;
        }
        break;
      case 4:
        if (demo.t > 0.9) {
          demo.phase = 1;
          demo.t = 0;
        }
        break;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Demo helpers (do NOT mark as user touch).
  const silentOn = useCallback((index: number, vel: number) => {
    const audio = audioRef.current;
    if (!audio || audio.isOn(index)) return;
    audio.noteOn(index, vel);
    const cr = creaturesRef.current[index];
    cr.on = true;
    cr.glowT = 0.5 + vel * 0.5;
    setTick((t) => t + 1);
  }, []);
  const silentOff = useCallback((index: number) => {
    const audio = audioRef.current;
    if (!audio || !audio.isOn(index)) return;
    audio.noteOff(index);
    const cr = creaturesRef.current[index];
    cr.on = false;
    cr.glowT = 0;
    cr.wobbleT = 0;
    setTick((t) => t + 1);
  }, []);

  // ── Teardown ────────────────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      for (const inp of midiInputsRef.current) inp.onmidimessage = null;
      midiInputsRef.current = [];
      if (midiRef.current) midiRef.current.onstatechange = null;
      midiRef.current = null;
      rendererRef.current?.dispose();
      rendererRef.current = null;
      glRef.current = null;
      audioRef.current?.close();
      audioRef.current = null;
    };
  }, []);

  // ── UI ──────────────────────────────────────────────────────────────────────
  const held = audioRef.current?.heldIndices() ?? [];
  const anyClash = scoreClashes(held).worst > 0;

  return (
    <main className="relative h-[100dvh] w-full overflow-hidden bg-[#0e0510] text-white">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full touch-none"
      />

      {/* Title + status overlay */}
      <div className="pointer-events-none absolute left-0 right-0 top-0 z-10 flex flex-col gap-1 p-4">
        <h1 className="text-2xl font-bold text-white/95 drop-shadow">
          Monster Keys
        </h1>
        <p className="font-mono text-base text-white/75 drop-shadow">
          {anyClash
            ? "a wobbly monster appeared! add a glowing key to calm it"
            : "tap the glowing creatures — stack them to make friends"}
        </p>
        <p className="font-mono text-base text-white/75">
          {midiStatus === "connected" && "🎹 connected"}
          {midiStatus === "none" && "🎹 plug in a keyboard — optional"}
          {midiStatus === "checking" && "🎹 looking for a keyboard…"}
          {midiStatus === "unsupported" &&
            "🎹 keyboard not supported here — tap the keys"}
        </p>
        {glError && (
          <p className="font-mono text-base text-rose-300 drop-shadow">{glError}</p>
        )}
      </div>

      {/* Creature-keys row */}
      {started && (
        <div className="absolute bottom-0 left-0 right-0 z-10 flex flex-wrap items-end justify-center gap-2 p-3 pb-5">
          {Array.from({ length: NOTE_COUNT }, (_, i) => {
            const on = held.includes(i);
            const isSuggested = suggestion === i;
            const hue = NOTE_HUE[i];
            return (
              <button
                key={i}
                onPointerDown={(e) => {
                  e.preventDefault();
                  toggleNote(i);
                }}
                aria-label={`creature ${i + 1}`}
                className="relative flex select-none items-center justify-center rounded-3xl border-2 px-4 py-2.5 font-mono text-base font-bold transition-transform active:scale-95"
                style={{
                  width: 76,
                  height: 88,
                  background: on
                    ? `radial-gradient(circle at 50% 35%, hsl(${hue} 90% 70%), hsl(${hue} 85% 45%))`
                    : `radial-gradient(circle at 50% 35%, hsl(${hue} 70% 40%), hsl(${hue} 60% 22%))`,
                  borderColor: isSuggested
                    ? "#fff6cc"
                    : on
                      ? `hsl(${hue} 95% 80%)`
                      : `hsl(${hue} 50% 30%)`,
                  boxShadow: isSuggested
                    ? "0 0 22px 6px rgba(255,240,170,0.85)"
                    : on
                      ? `0 0 20px 4px hsl(${hue} 90% 55% / 0.7)`
                      : "none",
                  animation: isSuggested ? "monsterPulse 1s ease-in-out infinite" : "none",
                  color: "rgba(255,255,255,0.95)",
                }}
              >
                <span aria-hidden className="text-2xl leading-none">
                  {on ? "◕" : "•"}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Start gate (iOS) */}
      {!started && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-6 bg-[#0e0510]/90 p-6 text-center">
          <h1 className="text-2xl font-bold text-white/95">Monster Keys</h1>
          <p className="max-w-md font-mono text-base text-white/75">
            Tap the friendly creatures. Some pairs make a wobbly monster — add a
            glowing key to calm it. No wrong notes, ever.
          </p>
          <button
            onPointerDown={(e) => {
              e.preventDefault();
              void handleStart();
            }}
            aria-label="Start"
            className="flex items-center justify-center gap-3 rounded-full bg-gradient-to-br from-amber-300 to-rose-400 px-8 py-4 text-2xl font-bold text-[#2a0f18] shadow-lg active:scale-95"
            style={{ minWidth: 200, minHeight: 88 }}
          >
            <span aria-hidden className="text-3xl">
              ▶
            </span>
            Play
          </button>
        </div>
      )}

      <style jsx>{`
        @keyframes monsterPulse {
          0%,
          100% {
            transform: scale(1);
          }
          50% {
            transform: scale(1.09);
          }
        }
      `}</style>
    </main>
  );
}

// ── Build the GPU creature list from CPU state ────────────────────────────────
function buildCreatureGPU(crs: Creature[], time: number): CreatureGPU[] {
  const out: CreatureGPU[] = [];
  const active = crs.filter((c) => c.glow > 0.01 || c.on);
  const n = active.length;
  active.forEach((c, i) => {
    // Lay creatures across the upper canvas in a gentle arc.
    const frac = n === 1 ? 0.5 : i / (n - 1);
    const x = 0.16 + frac * 0.68;
    const sway = Math.sin(time * 1.2 + i) * 0.02 * (0.4 + c.wobble);
    const y = 0.4 + Math.sin(time * 0.8 + i * 1.7) * 0.04 + sway;
    const size = 150 + c.glow * 130 + c.wobble * 40;
    out.push({
      x,
      y,
      hue: NOTE_HUE[c.index],
      size,
      wobble: c.wobble,
      glow: c.glow,
    });
  });
  return out;
}
