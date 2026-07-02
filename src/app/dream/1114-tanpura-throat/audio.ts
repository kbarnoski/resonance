/* ───────────────────────────────────────────────────────────────────────────
   audio.ts — the "Tanpura Throat" engine.

   Signal flow:

     mic  ─▶ micGain  ─┐
                       ├─▶ analyser        (ANALYSIS ONLY — never to speakers)
     cantor ─▶ swell ─▶ cantorGain ─┘

     strings (Karplus-Strong bank) ─┐
     low sine pad ──────────────────┼─▶ master ─▶ limiter ─▶ destination
                                     │
     (drone bed re-plucks a few of the strings on a slow cycle)

   The microphone is only ever measured — it is never routed to the output, so
   there is no monitoring/feedback howl. The "cantor" is a synthetic vowel-like
   singer wired into the SAME analyser as the mic, so with no mic and no
   interaction the pitch/partial detection still fires and the strings still
   ring. Everything you actually HEAR is the string bank answering.
─────────────────────────────────────────────────────────────────────────── */

import {
  JI_RATIOS,
  DRONE_ROOT_HZ,
  createKSString,
  makeNoiseBuffer,
  type KSString,
} from "./strings";

/** Tones the autonomous cantor glides between (drone-friendly JI degrees). */
const CANTOR_TONES = [110, 110, 165, 137.5, 220, 183.33, 146.67];

/** Vowel formant triples (F1, F2, F3) in Hz — "ah", "oo", "ee", "oh". */
const VOWELS: ReadonlyArray<[number, number, number]> = [
  [720, 1240, 2600],
  [320, 870, 2240],
  [300, 2200, 2960],
  [500, 1000, 2500],
];

export interface TanpuraEngine {
  ctx: AudioContext;
  analyser: AnalyserNode;
  timeBuf: Float32Array;
  freqBuf: Float32Array;
  strings: KSString[];
  freqs: number[];
  /** Slow tanpura cycle over the drone strings (Pa Sa Sa' Sa). */
  droneCycle: number[];
  pluck: (i: number, strength: number, when: number, rng: () => number) => void;
  connectMic: (stream: MediaStream) => void;
  /** Advance the cantor's glide/swell/vowel. Call once per frame. */
  updateCantor: (nowSec: number, rng: () => number) => void;
  dispose: () => void;
}

export function createEngine(seedRng: () => number): TanpuraEngine {
  const AudioCtor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new AudioCtor();

  // ── Master → limiter → destination ──────────────────────────────────────
  const master = ctx.createGain();
  master.gain.value = 0.85;
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -12;
  limiter.knee.value = 8;
  limiter.ratio.value = 14;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.25;
  master.connect(limiter);
  limiter.connect(ctx.destination);

  // ── Analyser (shared by mic + cantor) ───────────────────────────────────
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 2048;
  analyser.smoothingTimeConstant = 0.5;
  const timeBuf = new Float32Array(new ArrayBuffer(analyser.fftSize * 4));
  const freqBuf = new Float32Array(new ArrayBuffer(analyser.frequencyBinCount * 4));

  const micGain = ctx.createGain();
  micGain.gain.value = 0; // raised when the mic is granted
  micGain.connect(analyser);

  // ── Sympathetic string bank ─────────────────────────────────────────────
  const noise = makeNoiseBuffer(ctx, seedRng);
  const freqs = JI_RATIOS.map((r) => DRONE_ROOT_HZ * r);
  const strings = freqs.map((f, i) => createKSString(ctx, f, master, noise, i));

  // A gentle sustained sub-pad so the room is never dead between plucks.
  const pad = ctx.createOscillator();
  pad.type = "sine";
  pad.frequency.value = DRONE_ROOT_HZ / 2; // 55 Hz
  const padGain = ctx.createGain();
  padGain.gain.value = 0.05;
  pad.connect(padGain);
  padGain.connect(master);
  pad.start();

  // ── The autonomous cantor: 2 detuned saws → 3 formant bandpasses ────────
  const cantorGain = ctx.createGain();
  cantorGain.gain.value = 1; // auto mode on until the mic takes over
  cantorGain.connect(analyser);

  const swell = ctx.createGain();
  swell.gain.value = 0.12;
  swell.connect(cantorGain);

  const cOsc1 = ctx.createOscillator();
  cOsc1.type = "sawtooth";
  cOsc1.frequency.value = CANTOR_TONES[0];
  const cOsc2 = ctx.createOscillator();
  cOsc2.type = "sawtooth";
  cOsc2.frequency.value = CANTOR_TONES[0] * 1.006;
  const cPre = ctx.createGain();
  cPre.gain.value = 0.5;
  cOsc1.connect(cPre);
  cOsc2.connect(cPre);

  const formants = VOWELS[0].map((hz, i) => {
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = hz;
    bp.Q.value = 6 + i * 2;
    const g = ctx.createGain();
    g.gain.value = i === 0 ? 1 : 0.6 - i * 0.15;
    cPre.connect(bp);
    bp.connect(g);
    g.connect(swell);
    return bp;
  });
  cOsc1.start();
  cOsc2.start();

  // Cantor scheduling state.
  let nextGlideAt = 0;
  let vowelIdx = 0;

  const updateCantor = (nowSec: number, rng: () => number) => {
    if (nowSec < nextGlideAt) return;
    nextGlideAt = nowSec + 2.0 + rng() * 2.6;

    const tone = CANTOR_TONES[Math.floor(rng() * CANTOR_TONES.length)];
    cOsc1.frequency.setTargetAtTime(tone, nowSec, 0.35);
    cOsc2.frequency.setTargetAtTime(tone * 1.006, nowSec, 0.35);

    // Breathe: swell up then ease down before the next phrase.
    const peak = 0.16 + rng() * 0.12;
    swell.gain.cancelScheduledValues(nowSec);
    swell.gain.setTargetAtTime(peak, nowSec, 0.5);
    swell.gain.setTargetAtTime(0.05, nowSec + 1.4, 0.7);

    // Morph the vowel.
    vowelIdx = (vowelIdx + 1 + Math.floor(rng() * 2)) % VOWELS.length;
    const v = VOWELS[vowelIdx];
    formants.forEach((bp, i) => bp.frequency.setTargetAtTime(v[i], nowSec, 0.4));
  };

  // ── Mic wiring (analysis only) ──────────────────────────────────────────
  let micSource: MediaStreamAudioSourceNode | null = null;
  const connectMic = (stream: MediaStream) => {
    micSource = ctx.createMediaStreamSource(stream);
    micSource.connect(micGain);
    const t = ctx.currentTime;
    micGain.gain.setTargetAtTime(1.4, t, 0.3);
    // Fade the synthetic singer out so your voice takes the lead.
    cantorGain.gain.setTargetAtTime(0.0, t, 0.6);
  };

  const pluck = (i: number, strength: number, when: number, rng: () => number) => {
    const s = strings[i];
    if (s) s.pluck(strength, when, rng);
  };

  const dispose = () => {
    try {
      cOsc1.stop();
      cOsc2.stop();
      pad.stop();
    } catch {
      /* already stopped */
    }
    strings.forEach((s) => s.dispose());
    micSource?.disconnect();
    if (ctx.state !== "closed") void ctx.close();
  };

  return {
    ctx,
    analyser,
    timeBuf,
    freqBuf,
    strings,
    freqs,
    droneCycle: [4, 0, 7, 0], // Pa, Sa, Sa', Sa
    pluck,
    connectMic,
    updateCantor,
    dispose,
  };
}
