"use client";

// 671-glasswork — "Glasswork". A tender, 3am generative music-box whose harmony
// breathes through REAL four-part voice-leading: on each chord change every
// voice glides (audible portamento) to its NEAREST chord tone, so you can SEE
// the threads cross and HEAR the pad slide rather than jump.
//
// Five subsystems: harmonic random-walk (compose.ts) · nearest-tone
// voice-leading engine (voiceleading.ts) · weighted never-repeating melody +
// scheduler (compose.ts + this file) · 4-voice glass synth with reverb +
// feedback-delay shimmer (synth.ts) · inline-SVG renderer (this file).
//
// References: Eno (Music for Airports, Reflection), Budd (The Pearl),
// Satie (Gymnopédies). Technique anchor: classical voice-leading.
//
// It plays itself. Zero interaction required — Begin and listen.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  HarmonyState,
  MelodyState,
  initialHarmony,
  initialMelody,
  nextChord,
  nextMelody,
} from "./compose";
import { VOICE_WINDOWS, planVoices } from "./voiceleading";
import { GlassworkSynth, createSynth } from "./synth";

type Phase = "idle" | "playing" | "error";

// Visual MIDI range, used to map pitch → vertical position.
const VIS_MIDI_LO = 26;
const VIS_MIDI_HI = 90;

// A glowing node on screen (one per pad voice; melody sparks are separate).
interface VoiceVisual {
  midi: number; // current sounding pitch
  x: number; // 0..1 horizontal slot (fixed per voice)
  bloom: number; // 0..1 onset bloom envelope
}

// A fading thread tracing a voice's glide from A → B.
interface Thread {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  life: number; // 1 → 0
}

// A brief bright spark from a melody bell.
interface Spark {
  x: number;
  y: number;
  life: number; // 1 → 0
  r: number;
}

// Map MIDI → vertical position (0 top .. 1 bottom). High pitch = high on screen.
function midiToY(midi: number): number {
  const t = (midi - VIS_MIDI_LO) / (VIS_MIDI_HI - VIS_MIDI_LO);
  const c = Math.min(1, Math.max(0, t));
  return 1 - c;
}

export default function GlassworkPage() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  // Throttled UI mirror (~24fps) so React doesn't re-render every rAF.
  const [tick, setTick] = useState(0);

  const ctxRef = useRef<AudioContext | null>(null);
  const synthRef = useRef<GlassworkSynth | null>(null);
  const harmonyRef = useRef<HarmonyState>(initialHarmony());
  const melodyRef = useRef<MelodyState>(initialMelody());

  const voiceVisRef = useRef<VoiceVisual[]>(
    VOICE_WINDOWS.map((_, i) => ({
      midi: [38, 53, 60, 65][i],
      x: 0.18 + i * 0.21,
      bloom: 0,
    })),
  );
  const threadsRef = useRef<Thread[]>([]);
  const sparksRef = useRef<Spark[]>([]);

  // Scheduling timers (audio-clock-ish, driven by performance.now()).
  const rafRef = useRef(0);
  const lastFrameRef = useRef(0);
  const nextChordAtRef = useRef(0);
  const nextMelodyAtRef = useRef(0);
  const chordDurRef = useRef(8000); // ms; ~6-10s, pointer can shorten

  // Pointer mood (gentle, optional). bright = height, busy = horizontal.
  const brightRef = useRef(0.5);
  const busyRef = useRef(0.5);
  const restStoneRef = useRef(0); // 0..1 pull-to-tonic, set on click, decays
  const lastInteractRef = useRef(0);

  // ── Trigger one chord change: plan voice-leading, glide, draw threads ─────
  const runChordChange = useCallback((now: number) => {
    const synth = synthRef.current;
    if (!synth) return;
    const restPull = restStoneRef.current;
    const harmony = harmonyRef.current;
    const chord = nextChord(harmony, restPull);
    harmony.current = chord;

    const bend = brightRef.current;
    const current = synth.voices.map((v) => v.currentMidi);
    const plan = planVoices(current, chord.pcs, bend);

    // Glide duration 0.4-0.8s, a touch longer when calm (low busy).
    const glideSec = 0.5 + (1 - busyRef.current) * 0.3;

    plan.targets.forEach((target, i) => {
      const from = current[i];
      synth.glideVoice(i, target, glideSec);
      // visual: thread from old position to new, plus retarget node + bloom
      const vis = voiceVisRef.current[i];
      const x1 = vis.x;
      const y1 = midiToY(from);
      const y2 = midiToY(target);
      if (from !== target) {
        threadsRef.current.push({ x1, y1, x2: vis.x, y2, life: 1 });
      }
      vis.midi = target;
      vis.bloom = 1;
    });

    // sub follows the chord root (first listed pc, nearest octave to bass voice)
    const rootPc = chord.pcs[0];
    let rootMidi = 38;
    for (let m = 30; m <= 50; m++) {
      if (((m % 12) + 12) % 12 === rootPc) {
        rootMidi = m;
        break;
      }
    }
    synth.setSubRoot(rootMidi, glideSec);

    // decay the stone after it's been applied
    restStoneRef.current = Math.max(0, restPull - 0.5);

    // next chord in ~6-10s, shortened by "busy" (pointer right)
    const base = 9500 - busyRef.current * 3500; // 6000..9500
    chordDurRef.current = base * (0.9 + Math.random() * 0.2);
    nextChordAtRef.current = now + chordDurRef.current;
  }, []);

  // ── Trigger one melody event ──────────────────────────────────────────────
  const runMelodyStep = useCallback((now: number) => {
    const synth = synthRef.current;
    if (!synth) return;
    const bright = brightRef.current;
    const ev = nextMelody(melodyRef.current, harmonyRef.current.current, bright);
    if (ev.note !== null) {
      synth.pluckBell(ev.note, ev.velocity, bright);
      sparksRef.current.push({
        x: 0.5 + (Math.random() - 0.5) * 0.5,
        y: midiToY(ev.note),
        life: 1,
        r: 4 + ev.velocity * 8,
      });
    }
    // note spacing: slow and breathing. faster when busy/bright.
    const beat = 720 - busyRef.current * 240; // ms per slot
    const mult = Math.random() < 0.3 ? 2 : 1; // occasional long held note
    nextMelodyAtRef.current = now + beat * mult;
  }, []);

  // ── The clock: schedule events + advance/draw visuals (~throttled) ────────
  const frame = useCallback(
    (now: number) => {
      rafRef.current = requestAnimationFrame(frame);
      const dt = lastFrameRef.current ? now - lastFrameRef.current : 16;
      lastFrameRef.current = now;

      // schedule harmony + melody off the same performance clock
      if (now >= nextChordAtRef.current) runChordChange(now);
      if (now >= nextMelodyAtRef.current) runMelodyStep(now);

      // idle: return mood to autonomous neutral after ~1.5s
      if (now - lastInteractRef.current > 1500) {
        brightRef.current += (0.5 - brightRef.current) * 0.02;
        busyRef.current += (0.5 - busyRef.current) * 0.02;
      }

      // advance visual envelopes
      const decay = Math.exp(-dt / 650);
      for (const v of voiceVisRef.current) v.bloom *= decay;
      const tdecay = dt / 1100;
      threadsRef.current = threadsRef.current.filter((t) => {
        t.life -= tdecay;
        return t.life > 0;
      });
      const sdecay = dt / 900;
      sparksRef.current = sparksRef.current.filter((s) => {
        s.life -= sdecay;
        return s.life > 0;
      });

      // throttle React re-render to ~24fps
      if (now - lastTickRef.current > 41) {
        lastTickRef.current = now;
        setTick((x) => (x + 1) & 0xffff);
      }
    },
    [runChordChange, runMelodyStep],
  );
  const lastTickRef = useRef(0);

  // ── Start (must create AudioContext inside the gesture) ───────────────────
  const begin = useCallback(async () => {
    try {
      const Ctor: typeof AudioContext =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      if (!Ctor) throw new Error("AudioContext unavailable");
      const ctx = new Ctor();
      await ctx.resume();
      ctxRef.current = ctx;
      const synth = createSynth(ctx);
      synthRef.current = synth;

      // prime schedule: first chord shortly after start, melody after pad swells
      const now = performance.now();
      lastFrameRef.current = now;
      nextChordAtRef.current = now + 600;
      nextMelodyAtRef.current = now + 3200;
      setPhase("playing");
      rafRef.current = requestAnimationFrame(frame);
    } catch (e) {
      setErrorMsg(
        e instanceof Error ? e.message : "Audio could not start on this device.",
      );
      setPhase("error");
    }
  }, [frame]);

  // ── Teardown ──────────────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      const synth = synthRef.current;
      if (synth) synth.teardown();
      const ctx = ctxRef.current;
      if (ctx && ctx.state !== "closed") ctx.close().catch(() => {});
      synthRef.current = null;
      ctxRef.current = null;
    };
  }, []);

  // ── Pointer mood (gentle, optional) ───────────────────────────────────────
  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (phase !== "playing") return;
    const rect = e.currentTarget.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width;
    const py = (e.clientY - rect.top) / rect.height;
    brightRef.current = Math.min(1, Math.max(0, 1 - py)); // higher = brighter
    busyRef.current = Math.min(1, Math.max(0, px)); // right = busier
    lastInteractRef.current = performance.now();
    const synth = synthRef.current;
    if (synth) synth.setShimmer(brightRef.current);
  }, [phase]);

  const onPointerDown = useCallback(() => {
    if (phase !== "playing") return;
    restStoneRef.current = 1; // drop a stone: pull harmony home next change
    lastInteractRef.current = performance.now();
  }, [phase]);

  // ── Render (reads refs; tick forces the throttled redraw) ─────────────────
  void tick; // tick drives re-render; value itself unused
  const voices = voiceVisRef.current;
  const threads = threadsRef.current;
  const sparks = sparksRef.current;
  const chordId = harmonyRef.current.current.id;

  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-[#06070b] text-foreground">
      {/* SVG field */}
      <div
        className="absolute inset-0 touch-none"
        onPointerMove={onPointerMove}
        onPointerDown={onPointerDown}
      >
        <svg
          className="h-full w-full"
          viewBox="0 0 1000 1000"
          preserveAspectRatio="xMidYMid slice"
          aria-hidden="true"
        >
          <defs>
            <radialGradient id="gw-node" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#cfe3ff" stopOpacity="0.95" />
              <stop offset="35%" stopColor="#9fb8ff" stopOpacity="0.55" />
              <stop offset="100%" stopColor="#5566aa" stopOpacity="0" />
            </radialGradient>
            <radialGradient id="gw-spark" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="1" />
              <stop offset="40%" stopColor="#e7d9ff" stopOpacity="0.7" />
              <stop offset="100%" stopColor="#b39ddb" stopOpacity="0" />
            </radialGradient>
            <radialGradient id="gw-bg" cx="50%" cy="38%" r="75%">
              <stop offset="0%" stopColor="#101326" stopOpacity="1" />
              <stop offset="100%" stopColor="#06070b" stopOpacity="1" />
            </radialGradient>
            <filter id="gw-blur" x="-60%" y="-60%" width="220%" height="220%">
              <feGaussianBlur stdDeviation="6" />
            </filter>
            <filter id="gw-softblur" x="-40%" y="-40%" width="180%" height="180%">
              <feGaussianBlur stdDeviation="2.2" />
            </filter>
          </defs>

          <rect x="0" y="0" width="1000" height="1000" fill="url(#gw-bg)" />

          {/* voice-leading threads */}
          <g filter="url(#gw-softblur)">
            {threads.map((t, i) => (
              <line
                key={`th-${i}`}
                x1={t.x1 * 1000}
                y1={t.y1 * 1000}
                x2={t.x2 * 1000}
                y2={t.y2 * 1000}
                stroke="#aebcff"
                strokeOpacity={0.5 * t.life}
                strokeWidth={1.4}
                strokeLinecap="round"
              />
            ))}
          </g>

          {/* pad voice nodes */}
          <g filter="url(#gw-blur)">
            {voices.map((v, i) => {
              const cx = v.x * 1000;
              const cy = midiToY(v.midi) * 1000;
              const r = 26 + v.bloom * 34;
              const op = 0.4 + v.bloom * 0.55;
              return (
                <circle
                  key={`v-${i}`}
                  cx={cx}
                  cy={cy}
                  r={r}
                  fill="url(#gw-node)"
                  opacity={op}
                />
              );
            })}
          </g>

          {/* melody sparks */}
          <g>
            {sparks.map((s, i) => (
              <circle
                key={`sp-${i}`}
                cx={s.x * 1000}
                cy={s.y * 1000}
                r={s.r + (1 - s.life) * 10}
                fill="url(#gw-spark)"
                opacity={s.life}
              />
            ))}
          </g>
        </svg>
      </div>

      {/* HUD / controls */}
      <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-6 sm:p-10">
        <header className="max-w-xl">
          <h1 className="font-semibold text-3xl text-foreground sm:text-4xl">
            Glasswork
          </h1>
          <p className="mt-2 text-base text-muted-foreground">
            A 3am music-box whose harmony breathes through real four-part
            voice-leading — watch each voice glide to its nearest tone as the
            chord changes.
          </p>
        </header>

        {phase === "idle" && (
          <div className="pointer-events-auto flex flex-col items-start gap-3">
            <button
              type="button"
              onClick={begin}
              className="min-h-[44px] rounded-full border border-violet-300/40 bg-violet-300/10 px-6 py-2.5 text-base font-medium text-violet-300 transition-colors hover:bg-violet-300/20"
            >
              Begin
            </button>
            <p className="max-w-md text-sm text-muted-foreground">
              Plays itself. Optional: move the pointer — higher is brighter,
              further right is busier. A tap drops a stone, pulling the harmony
              toward rest.
            </p>
          </div>
        )}

        {phase === "error" && (
          <div className="pointer-events-auto max-w-md">
            <p className="text-base text-violet-300">
              {errorMsg ?? "Audio is unavailable on this device."}
            </p>
          </div>
        )}

        {phase === "playing" && (
          <div className="flex items-end justify-between">
            <p className="font-mono text-sm text-muted-foreground">
              chord <span className="text-muted-foreground">{chordId}</span> · nearest-
              tone voice-leading · D Dorian
            </p>
            <details className="pointer-events-auto max-w-xs text-right">
              <summary className="cursor-pointer font-mono text-sm text-muted-foreground hover:text-muted-foreground">
                design notes
              </summary>
              <p className="mt-2 text-sm text-muted-foreground">
                A tension-weighted random walk picks a new diatonic chord every
                6–10s. An exhaustive 4-voice search then assigns voices to the
                nearest chord tones (doublings penalised) and each pad voice
                portamentos to its target — the glide you hear and see. A
                separate weighted melody never repeats a note and arches over
                each phrase. Eno · Budd · Satie.
              </p>
            </details>
          </div>
        )}
      </div>
    </main>
  );
}
