"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChoirSynth } from "./audio";
import { detectPitch, PitchSmoother } from "./pitch";
import {
  chordForLead,
  hzToMidi,
  snapToCMajor,
  midiToHz,
  DEGREE_NAMES,
  type Chord,
  type Degree,
} from "./harmony";

// Friendly creature colors — warm amber / rose / violet / honey glow.
const CREATURE_COLORS = [
  { core: "#ffd9a0", glow: "#ff9d57" }, // honey-amber (lead)
  { core: "#ffb3c7", glow: "#ff5f8f" }, // rose
  { core: "#d9b3ff", glow: "#a25bff" }, // violet
  { core: "#bfe9c7", glow: "#5fd0a0" }, // soft mint
];

// Tap-a-note fallback row: one button per scale degree, lowest -> highest.
const TAP_NOTES: { degree: Degree; midi: number; label: string }[] = [
  { degree: 0, midi: 60, label: "C" },
  { degree: 1, midi: 62, label: "D" },
  { degree: 2, midi: 64, label: "E" },
  { degree: 3, midi: 65, label: "F" },
  { degree: 4, midi: 67, label: "G" },
  { degree: 5, midi: 69, label: "A" },
  { degree: 6, midi: 71, label: "B" },
];

type MicState = "idle" | "live" | "denied" | "unsupported";

// Shared live state the rAF loop reads (kept in a ref to avoid re-renders).
interface LiveState {
  chord: Chord;
  loudness: number; // 0..1 smoothed mouth-opening
  active: boolean; // is the child currently humming / a note held
  phase: number; // breathing phase
}

const INITIAL_CHORD: Chord = {
  degree: 0,
  roman: "I",
  name: "C",
  lead: 60,
  voices: [48, 55, 64],
  tension: 0,
};

export default function KidsHumChoir() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [started, setStarted] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [micState, setMicState] = useState<MicState>("idle");
  const [degreeLabel, setDegreeLabel] = useState<{ name: string; roman: string }>(
    { name: "C", roman: "I" },
  );
  const [tensionPct, setTensionPct] = useState(0);

  const synthRef = useRef<ChoirSynth | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const bufRef = useRef<Float32Array<ArrayBuffer> | null>(null);
  const smootherRef = useRef<PitchSmoother>(new PitchSmoother());
  const rafRef = useRef<number>(0);
  const liveRef = useRef<LiveState>({
    chord: INITIAL_CHORD,
    loudness: 0,
    active: false,
    phase: 0,
  });
  const lastDegreeRef = useRef<Degree>(0);
  const lastVoiceUpdateRef = useRef<number>(0);

  // ---- apply a new lead pitch: snap, harmonize, voice-lead, sound it ----
  const applyLead = useCallback((midiFloat: number, loudness: number) => {
    const synth = synthRef.current;
    if (!synth) return;
    const { midi, degree } = snapToCMajor(midiFloat);

    // Hysteresis: only re-voice when degree actually changes OR enough time
    // passed, so a wobbly hum on a note boundary doesn't flicker the chord.
    const now = performance.now();
    const changed = degree !== lastDegreeRef.current;
    if (!changed && now - lastVoiceUpdateRef.current < 90) {
      // keep current chord but still update loudness on the synth
      const cur = liveRef.current.chord;
      synth.setChord(cur.lead, cur.voices, loudness, cur.tension);
      liveRef.current.loudness = loudness;
      liveRef.current.active = true;
      return;
    }
    lastDegreeRef.current = degree;
    lastVoiceUpdateRef.current = now;

    const prev = liveRef.current.chord.voices;
    const chord = chordForLead(midi, degree, prev);
    synth.setChord(chord.lead, chord.voices, loudness, chord.tension);

    liveRef.current.chord = chord;
    liveRef.current.loudness = loudness;
    liveRef.current.active = true;
    setDegreeLabel({ name: chord.name, roman: chord.roman });
    setTensionPct(Math.round(chord.tension * 100));
  }, []);

  // ---- tap-a-note fallback: tap a button -> sing that chord ----
  const tapNote = useCallback(
    (midi: number) => {
      applyLead(midi, 0.85);
      // hold it a beat then ease back toward idle so the bloom reads
      window.setTimeout(() => {
        liveRef.current.active = false;
      }, 700);
    },
    [applyLead],
  );

  // ---- main start: gate getUserMedia + AudioContext behind this tap ----
  const start = useCallback(async () => {
    if (started) return;
    setStarted(true);

    const synth = new ChoirSynth();
    synthRef.current = synth;
    synth.start();
    synth.idle();

    // Try the mic. If denied / unsupported, fall back silently to tap row.
    if (
      typeof navigator !== "undefined" &&
      navigator.mediaDevices?.getUserMedia
    ) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
          },
        });
        streamRef.current = stream;
        const ctx = synth.ctx;
        const src = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 2048;
        // IMPORTANT: connect mic -> analyser ONLY. Never to destination
        // (that would create a feedback howl). The choir is the only sound.
        src.connect(analyser);
        analyserRef.current = analyser;
        bufRef.current = new Float32Array(
          new ArrayBuffer(analyser.fftSize * 4),
        );
        setMicState("live");
      } catch {
        setMicState("denied");
      }
    } else {
      setMicState("unsupported");
    }
  }, [started]);

  // ---- the rAF loop: detect pitch (if mic), drive synth + canvas ----
  useEffect(() => {
    if (!started) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx2d = canvas.getContext("2d");
    if (!ctx2d) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => {
      const r = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.floor(r.width * dpr));
      canvas.height = Math.max(1, Math.floor(r.height * dpr));
    };
    resize();
    window.addEventListener("resize", resize);

    const smoother = smootherRef.current;
    let lastActive = 0;

    const frame = () => {
      const synth = synthRef.current;
      const live = liveRef.current;
      live.phase += 0.016;

      // --- pitch detection from mic ---
      const analyser = analyserRef.current;
      const buf = bufRef.current;
      if (analyser && buf && synth) {
        analyser.getFloatTimeDomainData(buf);
        const { hz, rms } = detectPitch(buf, synth.ctx.sampleRate);
        const smooth = smoother.push(hz);
        if (smooth != null) {
          const midiFloat = hzToMidi(smooth);
          const loud = Math.min(1, rms * 12);
          applyLead(midiFloat, loud);
          lastActive = performance.now();
        } else if (performance.now() - lastActive > 350) {
          // gone quiet — ease toward idle held tonic + breathing
          if (live.active) {
            live.active = false;
            synth.idle(0);
          }
          live.loudness *= 0.9;
        }
      }

      // smooth the visible loudness
      const target = live.active ? Math.max(0.25, live.loudness) : 0.0;
      live.loudness += (target - live.loudness) * 0.18;

      drawScene(ctx2d, canvas.width, canvas.height, live, synth);
      rafRef.current = requestAnimationFrame(frame);
    };
    rafRef.current = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
    };
  }, [started, applyLead]);

  // ---- full teardown on unmount ----
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      const stream = streamRef.current;
      if (stream) stream.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      analyserRef.current = null;
      void synthRef.current?.dispose();
      synthRef.current = null;
    };
  }, []);

  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-[#1a1320] text-white">
      {/* warm cozy ground */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 90% at 50% 18%, #3a2440 0%, #241730 45%, #160f20 100%)",
        }}
      />

      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full"
        aria-hidden
      />

      {/* corner: design notes affordance */}
      <button
        onClick={() => setShowNotes((v) => !v)}
        className="absolute right-3 top-3 z-30 min-h-[44px] rounded-full border border-white/15 bg-black/40 px-4 py-2.5 font-mono text-xs text-white/80 backdrop-blur hover:bg-black/60 hover:text-white"
      >
        Read the design notes
      </button>

      {/* header */}
      <div className="pointer-events-none absolute left-0 right-0 top-4 z-20 px-5 text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
          Kids Hum Choir
        </h1>
        <p className="mx-auto mt-1 max-w-xl text-base text-white/80">
          Hum one note and a choir of friendly creatures sings the chord that
          fits — leaning into tension, swooping home when you do.
        </p>
      </div>

      {/* start gate */}
      {!started && (
        <div className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-6 px-6">
          <p className="max-w-md text-center text-base text-white/80">
            Tap start, then hum a note. The creatures will harmonize with you in
            real C-major harmony. No mic? Big note buttons appear instead.
          </p>
          <button
            onClick={start}
            className="min-h-[44px] rounded-full bg-amber-300 px-8 py-3 text-lg font-semibold text-[#2a1a10] shadow-lg shadow-amber-500/20 transition hover:bg-amber-200"
          >
            ▶ Start the choir
          </button>
        </div>
      )}

      {/* live HUD: current chord + tension meter */}
      {started && (
        <div className="pointer-events-none absolute bottom-24 left-0 right-0 z-20 flex flex-col items-center gap-2 px-5">
          <div className="rounded-full border border-white/15 bg-black/40 px-5 py-2 backdrop-blur">
            <span className="font-mono text-xl text-white/95">
              {degreeLabel.name}{" "}
              <span className="text-white/75">{degreeLabel.roman}</span>
            </span>
          </div>
          <div className="flex items-center gap-2 font-mono text-xs text-white/75">
            <span>home</span>
            <span className="relative block h-2 w-40 overflow-hidden rounded-full bg-white/10">
              <span
                className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-amber-300 via-rose-400 to-violet-400 transition-[width] duration-150"
                style={{ width: `${tensionPct}%` }}
              />
            </span>
            <span>tension</span>
          </div>
        </div>
      )}

      {/* mic notice + tap fallback */}
      {started && (
        <div className="absolute bottom-6 left-0 right-0 z-30 flex flex-col items-center gap-3 px-5">
          {(micState === "denied" || micState === "unsupported") && (
            <p className="text-base text-rose-300">
              {micState === "denied"
                ? "No mic access — tap the notes below to sing with the choir."
                : "Mic not available here — tap the notes below to sing with the choir."}
            </p>
          )}
          {micState === "live" && (
            <p className="font-mono text-xs text-white/75">
              listening — hum a note 🎤 (or tap a note below)
            </p>
          )}
          <div className="flex flex-wrap items-center justify-center gap-2">
            {TAP_NOTES.map((n) => (
              <button
                key={n.label}
                onClick={() => tapNote(n.midi)}
                className="min-h-[44px] min-w-[44px] rounded-2xl border border-white/15 bg-white/5 px-4 py-2.5 text-lg font-semibold text-white/95 transition hover:bg-white/15 active:scale-95"
                aria-label={`Sing chord ${n.label}`}
              >
                {n.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* design notes panel */}
      {showNotes && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/70 px-5 backdrop-blur">
          <div className="max-h-[80vh] max-w-lg overflow-y-auto rounded-2xl border border-white/15 bg-[#1c1428] p-6 text-white/90">
            <h2 className="text-xl font-semibold text-white">Design notes</h2>
            <p className="mt-3 text-base text-white/80">
              A child hums one note. We detect the pitch locally with the McLeod
              Pitch Method (a normalized autocorrelation), snap it to the
              nearest C-major scale degree, and build the real diatonic triad on
              it (I, ii, iii, IV, V, vi, vii°). Three companion creature voices
              are voice-led to the nearest chord tones, so the choir glides
              between chords instead of leaping.
            </p>
            <p className="mt-3 text-base text-white/80">
              This is real functional harmony — not a can&apos;t-be-wrong
              pentatonic. Humming the dominant (G / V) or the leading tone (B /
              vii°) makes the choir lean and the harmony tighten; landing home
              on C, E, or G blooms and resolves. The full write-up is in the
              prototype&apos;s{" "}
              <span className="font-mono text-amber-200">README.md</span>.
            </p>
            <p className="mt-3 font-mono text-xs text-white/75">
              Mic audio is processed locally and never uploaded, never routed to
              the speakers (no feedback). Scale: {DEGREE_NAMES.join(" ")} ·
              center {midiToHz(60).toFixed(0)}Hz.
            </p>
            <div className="mt-5 flex items-center justify-between">
              <Link
                href="/dream"
                className="font-mono text-xs text-white/75 hover:text-white"
              >
                ← back to the lab
              </Link>
              <button
                onClick={() => setShowNotes(false)}
                className="min-h-[44px] rounded-full bg-white/10 px-5 py-2.5 text-base text-white/95 hover:bg-white/20"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

// ---------------------------------------------------------------------------
// Canvas2D: soft glowing choir creatures (friendly blobs). Mouths open with
// loudness; bodies lean with tension and bloom on resolution.
// ---------------------------------------------------------------------------
function drawScene(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  live: LiveState,
  synth: ChoirSynth | null,
) {
  ctx.clearRect(0, 0, w, h);

  const { chord, loudness, phase } = live;
  const tension = chord.tension;
  // Lean direction: tension pulls the choir slightly to one side (toward the
  // "pull" of the dominant) and resolution recenters them.
  const lean = tension * 0.06 * w;

  // Lay out four creatures across the lower-middle of the canvas.
  const midis = synth?.voiceMidis ?? [chord.lead, ...chord.voices];
  const count = 4;
  const baseY = h * 0.55;
  const spread = w * 0.66;
  const startX = (w - spread) / 2;

  for (let i = 0; i < count; i++) {
    const col = CREATURE_COLORS[i % CREATURE_COLORS.length];
    const t = count > 1 ? i / (count - 1) : 0.5;
    const x = startX + t * spread + lean;

    // Pitch -> vertical position: higher note floats higher.
    const midi = midis[i] ?? 60;
    const pitchY = baseY - ((midi - 48) / 36) * h * 0.22;
    // Breathing + a gentle sway, faster and tighter under tension.
    const breath = Math.sin(phase * 0.9 + i * 1.3) * (6 + tension * 6);
    const sway = Math.sin(phase * (1.2 + tension) + i) * (8 + tension * 14);
    const y = pitchY + breath;

    // Size blooms on resolution (low tension) and with loudness.
    const baseR = (Math.min(w, h) * 0.075) * (0.8 + i % 2 * 0.15);
    const bloom = (1 - tension) * 0.18 + loudness * 0.28;
    const r = baseR * (1 + bloom);

    const cx = x + sway;
    const cy = y;

    // Outer glow.
    const glowR = r * (2.2 + loudness * 0.8);
    const grad = ctx.createRadialGradient(cx, cy, r * 0.2, cx, cy, glowR);
    grad.addColorStop(0, hexA(col.glow, 0.55 + loudness * 0.3));
    grad.addColorStop(0.5, hexA(col.glow, 0.18));
    grad.addColorStop(1, hexA(col.glow, 0));
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, glowR, 0, Math.PI * 2);
    ctx.fill();

    // Soft body — squash/stretch with the sway for life.
    const squash = 1 + Math.sin(phase * 1.5 + i) * 0.06;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(1 / squash, squash);
    const body = ctx.createRadialGradient(0, -r * 0.25, r * 0.1, 0, 0, r);
    body.addColorStop(0, col.core);
    body.addColorStop(1, hexA(col.glow, 0.85));
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Eyes — two friendly dots.
    const eyeR = r * 0.12;
    const eyeDx = r * 0.32;
    const eyeY = -r * 0.22;
    ctx.fillStyle = "rgba(40,20,30,0.85)";
    for (const sgn of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(cx + sgn * eyeDx, cy + eyeY, eyeR, 0, Math.PI * 2);
      ctx.fill();
    }
    // tiny eye highlights
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    for (const sgn of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(cx + sgn * eyeDx - eyeR * 0.3, cy + eyeY - eyeR * 0.3, eyeR * 0.35, 0, Math.PI * 2);
      ctx.fill();
    }

    // Mouth — opens (an "O") with loudness; this is the singing.
    const mouthOpen = 0.1 + loudness * 0.9;
    const mouthRy = r * 0.18 * mouthOpen + r * 0.04;
    const mouthRx = r * 0.22;
    const mouthY = cy + r * 0.28;
    ctx.fillStyle = "rgba(60,25,40,0.9)";
    ctx.beginPath();
    ctx.ellipse(cx, mouthY, mouthRx, mouthRy, 0, 0, Math.PI * 2);
    ctx.fill();
    // soft inner mouth glow
    ctx.fillStyle = hexA(col.core, 0.5);
    ctx.beginPath();
    ctx.ellipse(cx, mouthY, mouthRx * 0.5, mouthRy * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Idle hint pulse when quiet.
  if (loudness < 0.08) {
    const pulse = 0.4 + Math.sin(phase * 1.4) * 0.3;
    ctx.fillStyle = `rgba(255,225,180,${0.35 * pulse})`;
    ctx.font = `600 ${Math.round(Math.min(w, h) * 0.035)}px ui-sans-serif, system-ui`;
    ctx.textAlign = "center";
    ctx.fillText("hum to me…", w / 2, h * 0.32);
  }
}

/** "#rrggbb" + alpha -> rgba() string. */
function hexA(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r},${g},${b},${a})`;
}
