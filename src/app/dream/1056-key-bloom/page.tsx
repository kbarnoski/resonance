"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createSafeFlicker } from "../_shared/psych/safeFlicker";
import { KeyBloomAudio } from "./audio";
import {
  createBloom,
  drawBloom,
  isDead,
  warmRamp,
  type Bloom,
} from "./bloom";

/**
 * 1056 · Key Bloom — a keyboard as a psychedelic organ.
 *
 * Each key plays a just-intonation tone AND seeds a blooming form-constant
 * chrysanthemum (log-polar kaleidoscope). Chords stack into a living mandala you
 * compose in real time. state: psilocybin · pole: intense-warm.
 */

// Computer-keyboard scale mapping: A S D F G H J K L = scale degrees 0..8.
const KEY_ROW = ["a", "s", "d", "f", "g", "h", "j", "k", "l"];
const KEY_LABELS = ["A", "S", "D", "F", "G", "H", "J", "K", "L"];

type Phase = "idle" | "running";

interface ActiveNote {
  voiceId: number;
  bloomId: number;
}

export default function KeyBloomPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioRef = useRef<KeyBloomAudio | null>(null);
  const flickerRef = useRef(
    createSafeFlicker({ maxHz: 3, defaultHz: 1.5, floor: 0.6 }),
  );
  const bloomsRef = useRef<Bloom[]>([]);
  const rafRef = useRef<number | null>(null);
  const startedRef = useRef(false);

  // note-key → { voiceId, bloomId } for held notes (so we can release them).
  const activeRef = useRef<Map<string, ActiveNote>>(new Map());
  const octaveRef = useRef(0);
  const midiAccessRef = useRef<MIDIAccess | null>(null);

  const [phase, setPhase] = useState<Phase>("idle");
  const [shimmer, setShimmer] = useState(false);
  const [midiConnected, setMidiConnected] = useState(false);
  const [pressed, setPressed] = useState<Set<string>>(new Set());

  /* ----------------------------- bloom anchor ----------------------------- */
  // Place each note's bloom around a ring by scale degree so chords fan out.
  const anchorFor = useCallback((degree: number): { cx: number; cy: number } => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const cxBase = w / 2;
    const cyBase = h / 2;
    const radius = Math.min(w, h) * 0.26;
    const ang = (degree / 9) * Math.PI * 2 - Math.PI / 2;
    return {
      cx: cxBase + Math.cos(ang) * radius,
      cy: cyBase + Math.sin(ang) * radius,
    };
  }, []);

  /* ------------------------------ note on/off ----------------------------- */
  const startNote = useCallback(
    (token: string, degree: number, velocity: number) => {
      const audio = audioRef.current;
      if (!audio || activeRef.current.has(token)) return;
      const tSec = audio.ctx.currentTime;
      const freq = audio.freqFor(degree, octaveRef.current);
      const voiceId = audio.noteOn(freq, velocity);
      const { cx, cy } = anchorFor(degree);
      const bloom = createBloom({
        freq,
        noteIndex: degree + octaveRef.current,
        velocity,
        tSec,
        cx,
        cy,
      });
      bloomsRef.current.push(bloom);
      activeRef.current.set(token, { voiceId, bloomId: bloom.id });
    },
    [anchorFor],
  );

  const startMidiNote = useCallback(
    (note: number, velocity: number) => {
      const audio = audioRef.current;
      const token = `midi-${note}`;
      if (!audio || activeRef.current.has(token)) return;
      const tSec = audio.ctx.currentTime;
      const freq = audio.freqForMidi(note);
      const voiceId = audio.noteOn(freq, velocity);
      const w = window.innerWidth;
      const h = window.innerHeight;
      const ang = ((note % 12) / 12) * Math.PI * 2;
      const radius = Math.min(w, h) * 0.26;
      const cx = w / 2 + Math.cos(ang) * radius;
      const cy = h / 2 + Math.sin(ang) * radius;
      const bloom = createBloom({
        freq,
        noteIndex: note,
        velocity,
        tSec,
        cx,
        cy,
      });
      bloomsRef.current.push(bloom);
      activeRef.current.set(token, { voiceId, bloomId: bloom.id });
    },
    [],
  );

  const endNote = useCallback((token: string) => {
    const audio = audioRef.current;
    const active = activeRef.current.get(token);
    if (!audio || !active) return;
    audio.noteOff(active.voiceId);
    const bloom = bloomsRef.current.find((b) => b.id === active.bloomId);
    if (bloom && bloom.releasedAt == null) {
      bloom.releasedAt = audio.ctx.currentTime;
    }
    activeRef.current.delete(token);
  }, []);

  /* ------------------------------ animation ------------------------------ */
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const audio = audioRef.current;
    if (!canvas || !audio) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = window.innerWidth;
    const h = window.innerHeight;
    if (canvas.width !== Math.floor(w * dpr) || canvas.height !== Math.floor(h * dpr)) {
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
    }

    const tSec = audio.ctx.currentTime;
    const flicker = flickerRef.current;
    const bright = flicker.value(tSec);
    audio.setBrightness(bright);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Warm-ember floor (never cold/black), with a slow trailing wash so blooms
    // leave organic afterimages.
    const [er, eg, eb] = warmRamp(0.02);
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = `rgba(${er},${eg},${eb},0.16)`;
    ctx.fillRect(0, 0, w, h);

    // Cull dead blooms.
    bloomsRef.current = bloomsRef.current.filter((b) => !isDead(b, tSec));

    ctx.globalCompositeOperation = "lighter";
    const scale = Math.min(w, h) * 0.16;
    for (const b of bloomsRef.current) {
      ctx.save();
      ctx.translate(b.cx, b.cy);
      drawBloom(ctx, b, tSec, scale, bright);
      ctx.restore();
    }
    ctx.globalCompositeOperation = "source-over";

    rafRef.current = requestAnimationFrame(draw);
  }, []);

  /* ------------------------------ MIDI setup ------------------------------ */
  const setupMidi = useCallback(() => {
    const nav = navigator as Navigator & {
      requestMIDIAccess?: () => Promise<MIDIAccess>;
    };
    if (typeof nav.requestMIDIAccess !== "function") return;
    nav
      .requestMIDIAccess()
      .then((access) => {
        midiAccessRef.current = access;
        const wire = () => {
          let any = false;
          access.inputs.forEach((input) => {
            any = true;
            input.onmidimessage = (e: MIDIMessageEvent) => {
              const data = e.data;
              if (!data || data.length < 3) return;
              const status = data[0] & 0xf0;
              const note = data[1];
              const vel = data[2];
              if (status === 0x90 && vel > 0) {
                startMidiNote(note, vel / 127);
              } else if (status === 0x80 || (status === 0x90 && vel === 0)) {
                endNote(`midi-${note}`);
              }
            };
          });
          setMidiConnected(any);
        };
        wire();
        access.onstatechange = () => wire();
      })
      .catch(() => {
        /* no MIDI — silent, keyboard still works */
      });
  }, [startMidiNote, endNote]);

  /* ------------------------------- start --------------------------------- */
  const handleStart = useCallback(async () => {
    if (startedRef.current) return;
    startedRef.current = true;
    const audio = new KeyBloomAudio();
    audioRef.current = audio;
    await audio.init();
    await audio.resume();
    setPhase("running");
    rafRef.current = requestAnimationFrame(draw);
    setupMidi();
  }, [draw, setupMidi]);

  /* --------------------------- keyboard events --------------------------- */
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const k = e.key.toLowerCase();
      if (k === "z") {
        octaveRef.current = Math.max(-2, octaveRef.current - 1);
        return;
      }
      if (k === "x") {
        octaveRef.current = Math.min(2, octaveRef.current + 1);
        return;
      }
      const degree = KEY_ROW.indexOf(k);
      if (degree === -1) return;
      e.preventDefault();
      if (!startedRef.current) {
        void handleStart();
      }
      startNote(k, degree, 0.85);
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
  }, [startNote, endNote, handleStart]);

  /* ------------------------------- shimmer ------------------------------- */
  useEffect(() => {
    const f = flickerRef.current;
    if (shimmer) f.enable();
    else f.disable();
  }, [shimmer]);

  /* ------------------------------ teardown ------------------------------- */
  useEffect(() => {
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      const access = midiAccessRef.current;
      if (access) {
        access.inputs.forEach((input) => {
          input.onmidimessage = null;
        });
        access.onstatechange = null;
      }
      midiAccessRef.current = null;
      const a = audioRef.current;
      audioRef.current = null;
      if (a) void a.dispose();
      startedRef.current = false;
    };
  }, []);

  /* ------------------ on-screen key pointer handlers --------------------- */
  const onKeyPointerDown = useCallback(
    (k: string, degree: number) => {
      if (!startedRef.current) void handleStart();
      startNote(k, degree, 0.85);
      setPressed((prev) => new Set(prev).add(k));
    },
    [handleStart, startNote],
  );
  const onKeyPointerUp = useCallback(
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

  return (
    <main className="relative h-dvh w-screen overflow-hidden bg-[#170a04] text-foreground">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      {/* Header */}
      <div className="pointer-events-none absolute left-0 right-0 top-0 z-10 p-5 sm:p-7">
        <h1 className="font-semibold text-2xl text-foreground sm:text-3xl">Key Bloom</h1>
        <p className="mt-1 max-w-xl text-base text-foreground">
          A keyboard played as a psychedelic organ — each key sounds a
          just-intonation tone and blooms a chrysanthemum of form-constant
          geometry; chords stack into a living mandala.
        </p>
        <p className="mt-1 font-mono text-sm text-muted-foreground">
          state: psilocybin · pole: intense-warm
        </p>
        {midiConnected && (
          <p className="mt-1 font-mono text-sm text-violet-300/95">
            MIDI keyboard connected — velocity drives bloom size
          </p>
        )}
      </div>

      {/* Idle splash */}
      {phase === "idle" && (
        <div className="absolute inset-0 z-20 flex items-center justify-center">
          <button
            type="button"
            onClick={() => void handleStart()}
            className="rounded-2xl border border-violet-300/40 bg-violet-300/10 px-6 py-3.5 font-semibold text-xl text-violet-300/95 backdrop-blur transition hover:bg-violet-300/20"
          >
            Play — press A–L or tap the keys
          </button>
        </div>
      )}

      {/* Bottom controls + on-screen keyboard */}
      <div className="absolute bottom-0 left-0 right-0 z-10 p-4 sm:p-6">
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <p className="font-mono text-sm text-muted-foreground">
            Keys A S D F G H J K L = scale · Z / X shift octave · MIDI
            auto-detected if present
          </p>
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShimmer((s) => !s)}
              className={`rounded-lg border px-4 py-2.5 font-mono text-sm transition ${
                shimmer
                  ? "border-violet-300/60 bg-violet-300/15 text-violet-300/95"
                  : "border-border bg-muted text-muted-foreground hover:bg-accent"
              }`}
            >
              Shimmer {shimmer ? "on" : "off"}
            </button>
            <button
              type="button"
              onClick={() => {
                flickerRef.current.kill();
                setShimmer(false);
              }}
              className="rounded-lg border border-violet-300/40 bg-violet-300/10 px-4 py-2.5 font-mono text-sm text-violet-300 transition hover:bg-violet-300/20"
            >
              Kill
            </button>
          </div>
        </div>

        {/* On-screen keyboard */}
        <div className="flex justify-center gap-1.5 sm:gap-2">
          {KEY_ROW.map((k, i) => {
            const isDown = pressed.has(k);
            const [r, g, b] = warmRamp(0.35 + (i / KEY_ROW.length) * 0.5);
            return (
              <button
                key={k}
                type="button"
                aria-label={`Scale degree ${i + 1}`}
                onPointerDown={(e) => {
                  e.preventDefault();
                  onKeyPointerDown(k, i);
                }}
                onPointerUp={() => onKeyPointerUp(k)}
                onPointerLeave={() => {
                  if (pressed.has(k)) onKeyPointerUp(k);
                }}
                onPointerCancel={() => onKeyPointerUp(k)}
                className="flex h-16 min-w-[44px] flex-1 select-none items-center justify-center rounded-lg border font-mono text-sm transition-transform"
                style={{
                  borderColor: `rgba(${r},${g},${b},0.5)`,
                  background: isDown
                    ? `rgba(${r},${g},${b},0.42)`
                    : `rgba(${r},${g},${b},0.12)`,
                  color: "rgba(255,236,200,0.95)",
                  transform: isDown ? "translateY(2px) scale(0.97)" : "none",
                }}
              >
                {KEY_LABELS[i]}
              </button>
            );
          })}
        </div>
      </div>

      {/* Design notes link */}
      <Link
        href="/dream/1056-key-bloom/README.md"
        className="absolute right-4 top-4 z-20 font-mono text-sm text-muted-foreground underline decoration-muted-foreground underline-offset-4 transition hover:text-foreground"
      >
        Read the design notes
      </Link>
    </main>
  );
}
