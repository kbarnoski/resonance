"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { detectPitchHz, hzToMidi, midiToHz } from "./pitch";

/* ───────────────────────────────────────────────────────────────────────────
   1033-kids-hum-blossom — "Hum Blossom"

   ONE question: What if humming a note made a flower bloom in tune with you?

   A child hums into the mic. We detect the pitch in real time (autocorrelation /
   YIN-lite, in pitch.ts — verified by pitch.test.ts), snap it to the nearest
   chord tone of a slowly-cycling diatonic I–vi–IV–V progression in C major, and
   a soft 3-voice "ah" choir answers by harmonizing that chord underneath. A
   glowing flower grows from a bud: petals sprout while a tone is sustained, and
   petal/glow color tracks the detected pitch (low = warm red/orange → high =
   violet/white).

   Subsystems: (1) mic → AnalyserNode, (2) autocorrelation pitch detection,
   (3) functional-harmony choir engine, (4) organic Canvas2D flower render.

   MIC SAFETY: the mic connects to the AnalyserNode ONLY — never to
   audioContext.destination — so there is no feedback howl. Nothing is recorded
   or sent. Fallback: no mic / denied → a gentle auto-demo hum drives everything.
─────────────────────────────────────────────────────────────────────────── */

// ── Harmony: diatonic I–vi–IV–V in C major ──────────────────────────────────
// Each chord is a set of MIDI pitch classes (root + third + fifth, plus a few
// octaves) the child's note can snap to, and a 3-voice "ah" voicing to sing.
const KEY_ROOT_MIDI = 60; // C4

interface Chord {
  name: string;
  // pitch classes (0-11) that count as chord tones for snapping
  tones: number[];
  // 3-voice choir voicing as MIDI notes (low → high)
  voicing: number[];
}

// I = C, vi = Am, IV = F, V = G
const PROGRESSION: Chord[] = [
  { name: "I (C)", tones: [0, 4, 7], voicing: [48, 55, 64] }, // C3 G3 E4
  { name: "vi (Am)", tones: [9, 0, 4], voicing: [45, 52, 60] }, // A2 E3 C4
  { name: "IV (F)", tones: [5, 9, 0], voicing: [41, 53, 60] }, // F2 F3 C4
  { name: "V (G)", tones: [7, 11, 2], voicing: [43, 55, 62] }, // G2 G3 D4
];

const CHORD_PERIOD_MS = 3400; // how long each chord is held

/** Snap a (fractional) MIDI note to the nearest chord tone of `chord`,
 *  keeping it near the original octave. Returns a MIDI note number. */
function snapToChord(midi: number, chord: Chord): number {
  const pc = ((Math.round(midi) % 12) + 12) % 12;
  let best = chord.tones[0];
  let bestDist = 99;
  for (const t of chord.tones) {
    // smallest circular distance in semitones
    let d = Math.abs(pc - t);
    d = Math.min(d, 12 - d);
    if (d < bestDist) {
      bestDist = d;
      best = t;
    }
  }
  const baseOctave = Math.floor(Math.round(midi) / 12);
  // candidate notes in nearby octaves; pick closest to the input midi
  let snapped = baseOctave * 12 + best;
  let snapDist = Math.abs(snapped - midi);
  for (const o of [baseOctave - 1, baseOctave + 1]) {
    const cand = o * 12 + best;
    const dist = Math.abs(cand - midi);
    if (dist < snapDist) {
      snapDist = dist;
      snapped = cand;
    }
  }
  return snapped;
}

// ── Color: map pitch (MIDI) to a warm→cool hue ──────────────────────────────
// Low notes = warm (red/orange ~15°), high notes = violet/white (~280°).
function midiToHue(midi: number): number {
  const lo = KEY_ROOT_MIDI - 12; // C3
  const hi = KEY_ROOT_MIDI + 18; // F#5
  const t = Math.max(0, Math.min(1, (midi - lo) / (hi - lo)));
  return 15 + t * 265;
}

// ── Petal state ─────────────────────────────────────────────────────────────
interface Petal {
  angle: number; // radians around the center
  len: number; // 0..1 grown length
  targetLen: number;
  width: number;
  hue: number;
  born: number; // ms timestamp
}

export default function HumBlossomPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [started, setStarted] = useState(false);
  const [micOn, setMicOn] = useState(false);
  const [micNotice, setMicNotice] = useState<string | null>(null);
  const [chordName, setChordName] = useState("I (C)");

  // Audio graph + analysis refs (kept out of React state to avoid re-renders).
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const masterRef = useRef<GainNode | null>(null);
  const choirRef = useRef<{ osc: OscillatorNode; gain: GainNode; filter: BiquadFilterNode }[]>([]);
  const padRef = useRef<{ osc: OscillatorNode; gain: GainNode } | null>(null);
  const timeBufRef = useRef<Float32Array<ArrayBuffer> | null>(null);
  const rafRef = useRef<number | null>(null);

  // Live analysis values shared between the audio loop and the render loop.
  const stateRef = useRef({
    rms: 0,
    pitchMidi: -1, // detected, smoothed
    snappedMidi: -1,
    sustain: 0, // 0..1, how long a tone has been held
    chordIndex: 0,
    lastChordSwitch: 0,
    demoPhase: 0,
  });

  const petalsRef = useRef<Petal[]>([]);
  const lastPetalAtRef = useRef(0);

  // ── Build / retune the 3-voice choir to a chord ───────────────────────────
  const applyChord = useCallback((chord: Chord, when: number) => {
    const ctx = audioCtxRef.current;
    const voices = choirRef.current;
    if (!ctx || voices.length === 0) return;
    chord.voicing.forEach((midi, i) => {
      const v = voices[i];
      if (!v) return;
      const hz = midiToHz(midi);
      v.osc.frequency.setTargetAtTime(hz, when, 0.25);
      // formant-ish bandpass tracks the voice for an "ah" timbre
      v.filter.frequency.setTargetAtTime(hz * 3.2 + 250, when, 0.25);
    });
  }, []);

  // ── Set choir loudness from how strongly the child is humming ─────────────
  const applyChoirGain = useCallback((amount: number) => {
    const ctx = audioCtxRef.current;
    const voices = choirRef.current;
    if (!ctx) return;
    const target = Math.max(0, Math.min(1, amount));
    voices.forEach((v, i) => {
      // upper voices a touch softer so the chord doesn't get harsh
      const g = target * (0.16 - i * 0.03);
      v.gain.gain.setTargetAtTime(g, ctx.currentTime, 0.12);
    });
  }, []);

  // ── Render loop ───────────────────────────────────────────────────────────
  const drawFrame = useCallback((nowMs: number) => {
    const canvas = canvasRef.current;
    const ctx = audioCtxRef.current;
    const analyser = analyserRef.current;
    const buf = timeBufRef.current;
    const s = stateRef.current;

    // ---- Audio analysis (mic) or synthetic demo hum ----
    if (analyser && buf && micOn) {
      analyser.getFloatTimeDomainData(buf);
      let rms = 0;
      for (let i = 0; i < buf.length; i++) rms += buf[i] * buf[i];
      rms = Math.sqrt(rms / buf.length);
      s.rms = rms;
      const hz = detectPitchHz(buf, ctx ? ctx.sampleRate : 44100);
      if (hz > 0) {
        const m = hzToMidi(hz);
        s.pitchMidi = s.pitchMidi < 0 ? m : s.pitchMidi * 0.7 + m * 0.3;
      } else {
        s.pitchMidi = -1;
      }
    } else if (!micOn) {
      // Auto-demo: a slow rising/falling synthetic hum.
      s.demoPhase += 0.004;
      const sweep = Math.sin(s.demoPhase) * 0.5 + 0.5; // 0..1
      const m = KEY_ROOT_MIDI - 3 + sweep * 16; // glides ~A3..E5
      s.pitchMidi = m;
      s.rms = 0.05 + 0.03 * Math.sin(s.demoPhase * 1.7);
    }

    // ---- Chord cycling ----
    if (nowMs - s.lastChordSwitch > CHORD_PERIOD_MS) {
      s.lastChordSwitch = nowMs;
      s.chordIndex = (s.chordIndex + 1) % PROGRESSION.length;
      const chord = PROGRESSION[s.chordIndex];
      applyChord(chord, ctx ? ctx.currentTime : 0);
      setChordName(chord.name);
    }
    const chord = PROGRESSION[s.chordIndex];

    // ---- Snap detected pitch to a chord tone ----
    const voiced = s.pitchMidi > 0 && s.rms > 0.012;
    if (voiced) {
      s.snappedMidi = snapToChord(s.pitchMidi, chord);
      s.sustain = Math.min(1, s.sustain + 0.03);
    } else {
      s.snappedMidi = -1;
      s.sustain = Math.max(0, s.sustain - 0.02);
    }

    // Choir answers proportional to how strongly + steadily we're humming.
    applyChoirGain(voiced ? 0.5 + 0.5 * s.sustain : 0.04);

    // ---- Grow petals while a tone is sustained ----
    const hue = s.snappedMidi > 0 ? midiToHue(s.snappedMidi) : midiToHue(s.pitchMidi);
    const petals = petalsRef.current;
    if (voiced && s.sustain > 0.25 && nowMs - lastPetalAtRef.current > 220 && petals.length < 28) {
      lastPetalAtRef.current = nowMs;
      const idx = petals.length;
      petals.push({
        angle: idx * 2.399963, // golden angle for a natural phyllotaxis spread
        len: 0,
        targetLen: 0.65 + 0.35 * Math.random(),
        width: 0.5 + 0.25 * Math.random(),
        hue,
        born: nowMs,
      });
    }
    for (const p of petals) p.len += (p.targetLen - p.len) * 0.06;

    // ---- Draw ----
    if (canvas) {
      const c2d = canvas.getContext("2d");
      if (c2d) drawBlossom(c2d, canvas, s, hue, voiced, nowMs);
    }

    rafRef.current = requestAnimationFrame(drawFrame);
  }, [applyChoirGain, applyChord, micOn]);

  // Canvas drawing extracted so it stays readable.
  function drawBlossom(
    c2d: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    s: { sustain: number; snappedMidi: number },
    hue: number,
    voiced: boolean,
    nowMs: number,
  ) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
      canvas.width = w * dpr;
      canvas.height = h * dpr;
    }
    c2d.setTransform(dpr, 0, 0, dpr, 0, 0);

    // soft spring-garden background wash
    const bg = c2d.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, "#0b1020");
    bg.addColorStop(1, "#120a1c");
    c2d.fillStyle = bg;
    c2d.fillRect(0, 0, w, h);

    const cx = w / 2;
    const cy = h * 0.56;
    const baseR = Math.min(w, h) * 0.06;
    const breathe = 1 + 0.04 * Math.sin(nowMs / 600);

    // stem
    c2d.strokeStyle = "rgba(120,200,150,0.45)";
    c2d.lineWidth = Math.max(3, baseR * 0.25);
    c2d.beginPath();
    c2d.moveTo(cx, cy);
    c2d.quadraticCurveTo(cx - baseR * 0.6, cy + h * 0.18, cx, h * 0.96);
    c2d.stroke();

    const petals = petalsRef.current;
    const maxLen = Math.min(w, h) * 0.26;

    // glow halo behind the blossom, intensity tied to sustain
    const glowR = baseR + maxLen * 0.9 * (0.4 + 0.6 * s.sustain);
    const halo = c2d.createRadialGradient(cx, cy, baseR * 0.5, cx, cy, glowR * 2);
    const a = 0.18 + 0.5 * s.sustain;
    halo.addColorStop(0, `hsla(${hue}, 85%, 65%, ${a})`);
    halo.addColorStop(0.5, `hsla(${hue}, 80%, 55%, ${a * 0.4})`);
    halo.addColorStop(1, "transparent");
    c2d.fillStyle = halo;
    c2d.beginPath();
    c2d.arc(cx, cy, glowR * 2, 0, Math.PI * 2);
    c2d.fill();

    // petals (teardrop shapes radiating out)
    c2d.save();
    c2d.translate(cx, cy);
    for (const p of petals) {
      const L = p.len * maxLen * breathe;
      const wdt = p.width * baseR * 1.4;
      const ph = (p.hue + (nowMs - p.born) * 0.002) % 360;
      c2d.save();
      c2d.rotate(p.angle);
      const grad = c2d.createLinearGradient(0, baseR * 0.4, 0, -L);
      grad.addColorStop(0, `hsla(${ph}, 80%, 60%, 0.95)`);
      grad.addColorStop(1, `hsla(${(ph + 30) % 360}, 90%, 78%, 0.7)`);
      c2d.fillStyle = grad;
      c2d.beginPath();
      c2d.moveTo(0, baseR * 0.3);
      c2d.quadraticCurveTo(wdt, -L * 0.45, 0, -L);
      c2d.quadraticCurveTo(-wdt, -L * 0.45, 0, baseR * 0.3);
      c2d.fill();
      c2d.restore();
    }
    c2d.restore();

    // bud / center
    const center = c2d.createRadialGradient(cx, cy, 0, cx, cy, baseR * 1.3);
    center.addColorStop(0, `hsla(${(hue + 40) % 360}, 90%, ${voiced ? 88 : 70}%, 1)`);
    center.addColorStop(1, `hsla(${hue}, 75%, 45%, 1)`);
    c2d.fillStyle = center;
    c2d.beginPath();
    c2d.arc(cx, cy, baseR * (1 + 0.15 * s.sustain) * breathe, 0, Math.PI * 2);
    c2d.fill();
  }

  // ── Start everything ──────────────────────────────────────────────────────
  const runStart = useCallback(async () => {
    if (started) return;
    setStarted(true);

    const AudioCtor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioCtor();
    audioCtxRef.current = ctx;
    if (ctx.state === "suspended") await ctx.resume();

    // master gain → soft limiter → destination
    const master = ctx.createGain();
    master.gain.value = 0.9;
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -10;
    limiter.knee.value = 8;
    limiter.ratio.value = 12;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.25;
    master.connect(limiter);
    limiter.connect(ctx.destination);
    masterRef.current = master;

    // 3-voice "ah" choir: filtered saws, gentle.
    const chord0 = PROGRESSION[0];
    choirRef.current = chord0.voicing.map((midi) => {
      const osc = ctx.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.value = midiToHz(midi);
      const filter = ctx.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.value = midiToHz(midi) * 3.2 + 250;
      filter.Q.value = 4;
      const gain = ctx.createGain();
      gain.gain.value = 0.04;
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(master);
      osc.start();
      return { osc, gain, filter };
    });

    // always-on soft ambient pad (a low C drone)
    const padOsc = ctx.createOscillator();
    padOsc.type = "sine";
    padOsc.frequency.value = midiToHz(KEY_ROOT_MIDI - 12); // C3
    const padGain = ctx.createGain();
    padGain.gain.value = 0.05;
    padOsc.connect(padGain);
    padGain.connect(master);
    padOsc.start();
    padRef.current = { osc: padOsc, gain: padGain };

    // Try the mic. On failure, fall through to the auto-demo.
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      // MIC SAFETY: source → analyser ONLY. Never connect to destination.
      src.connect(analyser);
      analyserRef.current = analyser;
      timeBufRef.current = new Float32Array(new ArrayBuffer(analyser.fftSize * 4));
      setMicOn(true);
    } catch {
      setMicOn(false);
      setMicNotice("Mic is off — playing a gentle demo hum so the flower still blooms.");
    }

    stateRef.current.lastChordSwitch = performance.now();
    rafRef.current = requestAnimationFrame(drawFrame);
  }, [started, drawFrame]);

  // Keep the rAF loop bound to the latest drawFrame (micOn changes it).
  useEffect(() => {
    if (!started) return;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(drawFrame);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [started, drawFrame]);

  // ── Cleanup on unmount ────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      choirRef.current.forEach((v) => {
        try {
          v.osc.stop();
        } catch {
          /* already stopped */
        }
      });
      try {
        padRef.current?.osc.stop();
      } catch {
        /* already stopped */
      }
      streamRef.current?.getTracks().forEach((t) => t.stop());
      const ctx = audioCtxRef.current;
      if (ctx && ctx.state !== "closed") void ctx.close();
    };
  }, []);

  return (
    <main className="relative min-h-dvh w-full overflow-hidden bg-[#0b1020] text-foreground">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      <div className="relative z-10 flex min-h-dvh flex-col items-center justify-between px-6 py-8">
        <header className="w-full max-w-md text-center">
          <h1 className="font-semibold text-2xl text-foreground sm:text-3xl">Hum Blossom</h1>
          <p className="mt-3 text-base text-foreground">
            Hum a note and a glowing flower blooms in tune with you — a soft choir
            sings a chord back.
          </p>
        </header>

        <div className="flex w-full max-w-md flex-col items-center gap-4">
          {!started ? (
            <button
              type="button"
              onClick={runStart}
              className="min-h-[44px] rounded-full bg-violet-500/90 px-10 py-3 text-lg font-semibold text-foreground shadow-lg transition-colors hover:bg-violet-400/90 active:bg-violet-500"
            >
              Hum to bloom 🌸
            </button>
          ) : (
            <p className="min-h-[44px] text-center text-base text-foreground">
              {micOn ? "Listening — hum and hold a note!" : "Demo blooming — listen to the choir."}
              <span className="ml-2 text-muted-foreground">chord: {chordName}</span>
            </p>
          )}

          {micNotice && (
            <p className="max-w-sm text-center text-base text-violet-300">{micNotice}</p>
          )}
        </div>

        <footer className="w-full max-w-md text-center">
          <p className="text-base text-muted-foreground">
            Nothing is recorded or sent. Your voice is heard only on this device.
          </p>
          <Link
            href="/dream/1033-kids-hum-blossom/README.md"
            className="mt-3 inline-block text-base text-muted-foreground underline decoration-muted-foreground underline-offset-4 transition-colors hover:text-foreground"
          >
            Read the design notes
          </Link>
        </footer>
      </div>
    </main>
  );
}
