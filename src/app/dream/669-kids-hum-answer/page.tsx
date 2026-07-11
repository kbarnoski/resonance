"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

/* ───────────────────────────────────────────────────────────────────────────
   669-kids-hum-answer — hum one note, an unseen friend leans on a tense note
   and SIGHS down to rest.

   Off-the-glass, audio-first. A child hums a single note into the mic; the app
   detects the pitch (autocorrelation, Chris Wilson approach + RMS gate +
   parabolic interpolation + clarity gate, octave-collapsed) and an unseen
   choir answers — but it does NOT resolve right away. It builds a SUSPENSION
   CHAIN over the child's note as a tonic: it leans on a tense held note, then
   steps DOWN by step to release; leans again, releases again; finally settles
   to full rest. Textbook common-practice suspensions: 4–3, then 7–6, then 2–1.

   The denial of closure, then closure. Children perceive tonal closure and its
   denial as emotional states well before they can name major/minor, so this is
   the most age-robust harmonic event we can offer.

   Visual is deliberately minimal: a near-black screen with ONE soft breathing
   radial glow (CSS) that pulses with the post-limiter amplitude and shifts hue
   (violet/blue while TENSE → warmer/calmer as it RESOLVES). Works eyes-closed.

   NO samples, NO AI — the answering voices are synthesized "ah" voices
   (formant-bandpassed sawtooth) with Web Audio. Nothing is recorded or sent.
─────────────────────────────────────────────────────────────────────────── */

// ── Pitch detection: autocorrelation (Chris Wilson) with refinements ────────

const SAMPLE_MIN_HZ = 75;
const SAMPLE_MAX_HZ = 1000;
const RMS_GATE = 0.01; // silence floor
const CLARITY_GATE = 0.9; // peak-correlation threshold (0..1)

/** Detect a fundamental from a time-domain buffer. Returns Hz or -1.
 *  Time-domain autocorrelation with an RMS gate, a clarity gate, and a
 *  parabolic-interpolation refine on the best lag. */
function detectPitch(buf: Float32Array<ArrayBuffer>, sampleRate: number): number {
  const size = buf.length;

  // RMS gate — bail on silence.
  let rms = 0;
  for (let i = 0; i < size; i++) rms += buf[i] * buf[i];
  rms = Math.sqrt(rms / size);
  if (rms < RMS_GATE) return -1;

  // Trim leading/trailing low-amplitude regions for a cleaner correlation.
  const thresh = 0.2;
  let start = 0;
  let end = size - 1;
  for (let i = 0; i < size / 2; i++) {
    if (Math.abs(buf[i]) < thresh) start = i;
    else break;
  }
  for (let i = 1; i < size / 2; i++) {
    if (Math.abs(buf[size - i]) < thresh) end = size - i;
    else break;
  }
  const trimmed = buf.subarray(start, end);
  const n = trimmed.length;
  if (n < 2) return -1;

  const minLag = Math.floor(sampleRate / SAMPLE_MAX_HZ);
  const maxLag = Math.min(n - 1, Math.floor(sampleRate / SAMPLE_MIN_HZ));

  // Autocorrelation across the candidate lag range.
  const corr = new Float32Array(maxLag + 1);
  for (let lag = minLag; lag <= maxLag; lag++) {
    let sum = 0;
    for (let i = 0; i < n - lag; i++) sum += trimmed[i] * trimmed[i + lag];
    corr[lag] = sum;
  }

  // Find the first strong peak after the correlation has dipped.
  let bestLag = -1;
  let bestVal = 0;
  const corr0 = corr[minLag] || 1;
  let dipped = false;
  for (let lag = minLag + 1; lag <= maxLag; lag++) {
    const norm = corr[lag] / corr0;
    if (!dipped && norm < 0.5) dipped = true;
    if (dipped && corr[lag] > bestVal) {
      bestVal = corr[lag];
      bestLag = lag;
    }
  }
  if (bestLag < 0) return -1;

  // Clarity gate: normalised peak correlation must be high enough.
  const clarity = bestVal / (corr0 || 1);
  if (clarity < CLARITY_GATE) return -1;

  // Parabolic interpolation around the best lag for sub-sample accuracy.
  const y0 = corr[bestLag - 1] ?? bestVal;
  const y1 = bestVal;
  const y2 = corr[bestLag + 1] ?? bestVal;
  const denom = y0 - 2 * y1 + y2;
  let refinedLag = bestLag;
  if (denom !== 0) refinedLag = bestLag - (0.5 * (y2 - y0)) / denom;

  return sampleRate / refinedLag;
}

/** Octave-collapse: fold a detected frequency into a comfortable child-voice
 *  band (~196–392 Hz, G3..G4) to defend against octave errors. */
function collapseOctave(hz: number): number {
  let f = hz;
  while (f > 392) f /= 2;
  while (f < 196) f *= 2;
  return f;
}

// ── Suspension chain: figures resolving DOWN by step over a held tonic ──────
// Each step gives a TENSE interval (semitones above tonic) held, then it
// resolves DOWN by step to a CONSONANT interval. Classic 4–3, 7–6, 2–1.

interface SuspStep {
  label: string; // for design clarity / debugging
  tense: number; // semitones above tonic for the dissonant suspended tone
  rest: number; // semitones above tonic after resolving down a step
}

// 4–3: P4 (5 st) → M3 (4 st). 7–6: m7 (10) → M6 (9). 2–1: M2 (2) → unison (0).
const SUSPENSION_CHAIN: SuspStep[] = [
  { label: "4–3", tense: 5, rest: 4 },
  { label: "7–6", tense: 10, rest: 9 },
  { label: "2–1", tense: 2, rest: 0 },
];

const HOLD_MS = 1100; // how long the tense note leans before the sigh
const RESOLVE_MS = 900; // how long the resolved note rests before the next lean
const GLIDE_MS = 320; // the downward "sigh" portamento time

function hzFromTonic(tonic: number, semitones: number): number {
  return tonic * Math.pow(2, semitones / 12);
}

// ── Synth voices: formant-bandpassed sawtooth "ah" ──────────────────────────

interface Voice {
  osc: OscillatorNode;
  gain: GainNode;
  formants: BiquadFilterNode[];
}

interface Engine {
  ctx: AudioContext;
  master: GainNode;
  comp: DynamicsCompressorNode;
  meter: AnalyserNode;
  meterBuf: Float32Array<ArrayBuffer>;
}

// "ah" vowel formant centres (Hz) — three bandpass resonators.
const AH_FORMANTS = [800, 1150, 2900];

function makeVoice(eng: Engine): Voice {
  const { ctx, master } = eng;
  const osc = ctx.createOscillator();
  osc.type = "sawtooth";

  const gain = ctx.createGain();
  gain.gain.value = 0;

  // Parallel formant bandpasses summed into the voice gain.
  const formants = AH_FORMANTS.map((f) => {
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = f;
    bp.Q.value = 6;
    osc.connect(bp);
    bp.connect(gain);
    return bp;
  });

  gain.connect(master);
  osc.start();
  return { osc, gain, formants };
}

function disposeVoice(v: Voice) {
  try {
    v.osc.stop();
  } catch {
    /* already stopped */
  }
  v.osc.disconnect();
  v.gain.disconnect();
  v.formants.forEach((f) => f.disconnect());
}

const VOICE_GAIN = 0.16; // capped per-voice gain

// ── Component ───────────────────────────────────────────────────────────────

type Phase = "idle" | "listening" | "answering";

export default function HumAnswerPage() {
  const [started, setStarted] = useState(false);
  const [micOn, setMicOn] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");

  // Visual state driven by audio (kept in refs + a light rAF re-render).
  const [glow, setGlow] = useState({ level: 0, tension: 0 });

  // Audio + lifecycle refs.
  const engineRef = useRef<Engine | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const micAnalyserRef = useRef<AnalyserNode | null>(null);
  const micBufRef = useRef<Float32Array<ArrayBuffer> | null>(null);
  const rafRef = useRef<number | null>(null);
  const timersRef = useRef<number[]>([]);
  const answeringRef = useRef(false);
  const lastAnswerAtRef = useRef(0);
  const tensionRef = useRef(0); // 0 rest .. 1 fully tense (drives hue)
  const stableHzRef = useRef<{ hz: number; since: number }>({ hz: -1, since: 0 });

  const schedule = useCallback((fn: () => void, ms: number) => {
    const id = window.setTimeout(fn, ms);
    timersRef.current.push(id);
  }, []);

  // Play the full suspension chain over a detected tonic.
  const runSuspensionChain = useCallback(
    (tonicHz: number) => {
      const eng = engineRef.current;
      if (!eng || answeringRef.current) return;
      answeringRef.current = true;
      setPhase("answering");
      lastAnswerAtRef.current = performance.now();

      const { ctx } = eng;
      const now = ctx.currentTime;

      // A steady tonic drone underneath the suspensions (the "rest" anchor).
      const drone = makeVoice(eng);
      drone.osc.frequency.setValueAtTime(tonicHz / 2, now); // octave below
      drone.gain.gain.setValueAtTime(0, now);
      drone.gain.gain.linearRampToValueAtTime(VOICE_GAIN * 0.7, now + 0.4);

      // The moving "answer" voice that leans and sighs.
      const lead = makeVoice(eng);

      let t = now + 0.25; // small breath before the first lean
      const steps = SUSPENSION_CHAIN;

      // Set the lead's first tense pitch and fade it in.
      lead.osc.frequency.setValueAtTime(hzFromTonic(tonicHz, steps[0].tense), t);
      lead.gain.gain.setValueAtTime(0, t);
      lead.gain.gain.linearRampToValueAtTime(VOICE_GAIN, t + 0.35);

      const holdS = HOLD_MS / 1000;
      const resolveS = RESOLVE_MS / 1000;
      const glideS = GLIDE_MS / 1000;

      let cursorMsFromStart = 250; // mirror `t` offset in ms for UI timers

      steps.forEach((step, i) => {
        const tenseHz = hzFromTonic(tonicHz, step.tense);
        const restHz = hzFromTonic(tonicHz, step.rest);

        // If not the first step, glide UP into the new tense note (re-lean).
        if (i > 0) {
          lead.osc.frequency.setValueAtTime(
            hzFromTonic(tonicHz, steps[i - 1].rest),
            t,
          );
          lead.osc.frequency.linearRampToValueAtTime(tenseHz, t + 0.18);
          t += 0.18;
          cursorMsFromStart += 180;
        }

        // LEAN: hold the tense note.
        const leanStart = cursorMsFromStart;
        schedule(() => {
          tensionRef.current = 1;
        }, leanStart);
        t += holdS;
        cursorMsFromStart += HOLD_MS;

        // SIGH: glide DOWN by step to the rest tone (the resolution).
        lead.osc.frequency.setValueAtTime(tenseHz, t);
        lead.osc.frequency.linearRampToValueAtTime(restHz, t + glideS);
        const sighStart = cursorMsFromStart;
        schedule(() => {
          tensionRef.current = 0; // calm: hue warms
        }, sighStart);
        t += glideS + resolveS;
        cursorMsFromStart += GLIDE_MS + RESOLVE_MS;
      });

      // Final release: fade everything to rest.
      const fadeAt = t;
      lead.gain.gain.setValueAtTime(VOICE_GAIN, fadeAt);
      lead.gain.gain.linearRampToValueAtTime(0.0001, fadeAt + 1.1);
      drone.gain.gain.setValueAtTime(VOICE_GAIN * 0.7, fadeAt);
      drone.gain.gain.linearRampToValueAtTime(0.0001, fadeAt + 1.4);

      const totalMs = cursorMsFromStart + 1600;
      schedule(() => {
        disposeVoice(lead);
        disposeVoice(drone);
        answeringRef.current = false;
        tensionRef.current = 0;
        setPhase(micOn ? "listening" : "idle");
      }, totalMs);
    },
    [schedule, micOn],
  );

  // The render/analysis loop: drives the glow and (when mic is on) listens.
  const startLoop = useCallback(() => {
    const tick = () => {
      const eng = engineRef.current;
      if (!eng) return;

      // Post-limiter amplitude for the breathing glow.
      eng.meter.getFloatTimeDomainData(eng.meterBuf);
      let sum = 0;
      for (let i = 0; i < eng.meterBuf.length; i++) {
        sum += eng.meterBuf[i] * eng.meterBuf[i];
      }
      const amp = Math.sqrt(sum / eng.meterBuf.length);

      // Smooth tension for the hue shift.
      const target = tensionRef.current;
      // ease toward target
      setGlow((g) => {
        const level = g.level + (Math.min(1, amp * 8) - g.level) * 0.18;
        const tension = g.tension + (target - g.tension) * 0.08;
        return { level, tension };
      });

      // Mic listening: detect a held note and trigger an answer.
      const analyser = micAnalyserRef.current;
      const buf = micBufRef.current;
      if (analyser && buf && !answeringRef.current) {
        analyser.getFloatTimeDomainData(buf);
        const raw = detectPitch(buf, eng.ctx.sampleRate);
        const nowMs = performance.now();
        if (raw > 0) {
          const hz = collapseOctave(raw);
          const stable = stableHzRef.current;
          // Require the pitch to be roughly stable for a short window so we
          // answer a deliberate hum, not a passing glissando.
          if (stable.hz > 0 && Math.abs(1200 * Math.log2(hz / stable.hz)) < 70) {
            if (
              nowMs - stable.since > 350 &&
              nowMs - lastAnswerAtRef.current > 1800
            ) {
              runSuspensionChain(hz);
              stableHzRef.current = { hz: -1, since: nowMs };
            }
          } else {
            stableHzRef.current = { hz, since: nowMs };
          }
        } else {
          stableHzRef.current = { hz: -1, since: nowMs };
        }
      }

      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [runSuspensionChain]);

  // Auto-demo loop: synthesize a "child" note + trigger the answer.
  const startDemoLoop = useCallback(() => {
    const fire = () => {
      if (!engineRef.current) return;
      if (!answeringRef.current) {
        const eng = engineRef.current;
        // A gentle synthesized "child" note (the call), then the answer.
        const demoTonics = [261.63, 293.66, 246.94, 220.0]; // C4 D4 B3 A3
        const tonic = demoTonics[Math.floor(Math.random() * demoTonics.length)];

        const call = makeVoice(eng);
        const now = eng.ctx.currentTime;
        call.osc.frequency.setValueAtTime(tonic, now);
        call.gain.gain.setValueAtTime(0, now);
        call.gain.gain.linearRampToValueAtTime(VOICE_GAIN * 0.9, now + 0.25);
        call.gain.gain.setValueAtTime(VOICE_GAIN * 0.9, now + 0.8);
        call.gain.gain.linearRampToValueAtTime(0.0001, now + 1.3);
        schedule(() => disposeVoice(call), 1500);

        // Answer arrives after the call settles.
        schedule(() => runSuspensionChain(tonic), 1100);
      }
      schedule(fire, 7000);
    };
    schedule(fire, 600);
  }, [schedule, runSuspensionChain]);

  // ── Start: unlock AudioContext + request mic INSIDE the gesture handler ──
  const handleStart = useCallback(async () => {
    if (started) return;
    setStarted(true);

    const AC = window.AudioContext || (window as unknown as {
      webkitAudioContext: typeof AudioContext;
    }).webkitAudioContext;
    const ctx = new AC();
    if (ctx.state === "suspended") {
      try {
        await ctx.resume();
      } catch {
        /* will resume on next gesture */
      }
    }

    // SAFE master chain: gain (≤0.4) → compressor → destination, + meter tap.
    const master = ctx.createGain();
    master.gain.value = 0.34;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.knee.value = 24;
    comp.ratio.value = 12;
    comp.attack.value = 0.006;
    comp.release.value = 0.18;
    const meter = ctx.createAnalyser();
    meter.fftSize = 1024;
    // Allocate over an explicit ArrayBuffer so the buffer's type is
    // Float32Array<ArrayBuffer>, which getFloatTimeDomainData expects in TS 5.
    const meterBuf = new Float32Array(new ArrayBuffer(meter.fftSize * 4));

    master.connect(comp);
    comp.connect(meter);
    meter.connect(ctx.destination);

    engineRef.current = { ctx, master, comp, meter, meterBuf };

    // Try the mic — inside this same gesture.
    let gotMic = false;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      src.connect(analyser); // analysis only — NOT routed to output
      micAnalyserRef.current = analyser;
      micBufRef.current = new Float32Array(new ArrayBuffer(analyser.fftSize * 4));
      gotMic = true;
    } catch {
      gotMic = false;
    }

    if (gotMic) {
      setMicOn(true);
      setMicError(null);
      setPhase("listening");
    } else {
      setMicOn(false);
      setMicError(
        "Mic is off — playing a gentle demo so you can still hear the answer.",
      );
      setPhase("idle");
      startDemoLoop();
    }

    startLoop();
  }, [started, startLoop, startDemoLoop]);

  // ── Full cleanup on unmount ──────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      timersRef.current.forEach((t) => window.clearTimeout(t));
      timersRef.current = [];
      const stream = streamRef.current;
      if (stream) stream.getTracks().forEach((tr) => tr.stop());
      const eng = engineRef.current;
      if (eng && eng.ctx.state !== "closed") {
        eng.ctx.close().catch(() => {
          /* already closing */
        });
      }
      engineRef.current = null;
    };
  }, []);

  // ── Visual: hue from tension (violet/blue tense → warm calm at rest) ─────
  // tension 1 → violet ~265°, tension 0 → warm amber ~35°.
  const hue = 35 + (265 - 35) * glow.tension;
  const glowSize = 30 + glow.level * 42; // vmin radius of the soft glow
  const glowAlpha = 0.18 + glow.level * 0.55;
  const breathe = 0.92 + 0.08 * Math.sin(Date.now() / 1400);

  return (
    <main className="relative min-h-dvh w-full overflow-hidden bg-[#050407] text-foreground">
      {/* The single breathing radial glow. */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
        style={{
          width: `${glowSize * 2 * breathe}vmin`,
          height: `${glowSize * 2 * breathe}vmin`,
          borderRadius: "50%",
          background: `radial-gradient(circle, hsla(${hue}, 78%, 62%, ${glowAlpha}) 0%, hsla(${hue}, 70%, 45%, ${glowAlpha * 0.5}) 35%, transparent 70%)`,
          filter: "blur(8px)",
          transition: "background 700ms linear",
        }}
      />

      {/* Minimal, typography-compliant overlay. */}
      <div className="relative z-10 flex min-h-dvh flex-col items-center justify-between px-6 py-8">
        <header className="w-full max-w-md text-center">
          <h1 className="font-semibold text-2xl text-foreground sm:text-3xl">
            Hum &amp; Answer
          </h1>
          <p className="mt-3 text-base text-foreground">
            Hum one note, close your eyes — an unseen friend leans on a tense
            note and sighs down to rest.
          </p>
        </header>

        <div className="flex w-full max-w-md flex-col items-center gap-4">
          {!started ? (
            <button
              type="button"
              onClick={handleStart}
              className="min-h-[44px] rounded-full bg-violet-500/90 px-8 py-2.5 text-base font-medium text-foreground shadow-lg transition-colors hover:bg-violet-400/90 active:bg-violet-500"
            >
              Hum a note
            </button>
          ) : (
            <p className="min-h-[44px] text-center text-base text-violet-300">
              {phase === "answering"
                ? "…leaning, then resting."
                : micOn
                  ? "Listening — hum a note and hold it."
                  : "Demo playing — listen for the sigh."}
            </p>
          )}

          {micError && (
            <p className="max-w-sm text-center text-base text-violet-300">
              {micError}
            </p>
          )}
        </div>

        <footer className="w-full max-w-md text-center">
          <p className="text-base text-muted-foreground">
            Nothing is recorded, stored, or sent. Your voice is heard only on
            this device.
          </p>
          <Link
            href="/dream/669-kids-hum-answer/README.md"
            className="mt-3 inline-block text-base text-muted-foreground underline decoration-muted-foreground underline-offset-4 transition-colors hover:text-foreground"
          >
            Design notes
          </Link>
        </footer>
      </div>
    </main>
  );
}
