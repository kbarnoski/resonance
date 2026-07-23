// audio.ts — the source–filter "vocal" synth for 2410-facesong.
//
// A genuine formant / vowel-morphing voice in the Fant (1960) source–filter
// tradition: a harmonically rich glottal source (two detuned saws + a sub sine)
// passed through three parallel bandpass FORMANT filters. Sweeping the three
// formant centre frequencies between the vowel targets /u/ (oo), /a/ (aah) and
// /i/ (ee) morphs the timbre exactly the way a real vocal tract does.
//
// The face drives it:
//   jawOpen → gate + amplitude + brighter lowpass + open toward "aah"
//   smile   → push the vowel toward "ee" (brighter)
//   pucker  → push the vowel toward "oo" (darker, rounder)
//   brow    → pitch bend (snapped to A minor-pentatonic) + vibrato depth
//   pan     → stereo pan
//   yaw     → a small drone detune
//   blink   → a soft amplitude accent (debounced upstream)
//
// The AudioContext is created ONLY inside the Start gesture (browsers forbid a
// gesture-less context). webkitAudioContext fallback included.

import type { FaceParams } from "./face";

// Vowel formant targets, F1/F2/F3 in Hz (classic measured values).
const VOWEL_OO: [number, number, number] = [300, 870, 2240];
const VOWEL_AAH: [number, number, number] = [730, 1090, 2440];
const VOWEL_EE: [number, number, number] = [270, 2290, 3010];

// A minor pentatonic (semitone offsets from the root): A C D E G.
const PENTATONIC = [0, 3, 5, 7, 10];
const ROOT_HZ = 196.0; // G3 region — a warm vocal-pad root.

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerp3(
  a: [number, number, number],
  b: [number, number, number],
  t: number,
): [number, number, number] {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}

function computeFormants(
  jaw: number,
  smile: number,
  pucker: number,
): [number, number, number] {
  // Base blend oo → aah by how open the mouth is.
  let f = lerp3(VOWEL_OO, VOWEL_AAH, jaw);
  // A smile brightens toward ee.
  f = lerp3(f, VOWEL_EE, smile * 0.7);
  // A pucker rounds back toward oo.
  f = lerp3(f, VOWEL_OO, pucker * 0.7);
  return f;
}

/** Snap a continuous semitone offset to the nearest pentatonic scale degree. */
function snapPentatonic(semis: number): number {
  const octave = Math.floor(semis / 12);
  const within = semis - octave * 12;
  let best = PENTATONIC[0];
  let bestD = Infinity;
  for (const d of PENTATONIC) {
    const dd = Math.abs(within - d);
    if (dd < bestD) {
      bestD = dd;
      best = d;
    }
  }
  return octave * 12 + best;
}

export interface VocalSynth {
  update(p: FaceParams): void;
  blinkAccent(): void;
  stop(): void;
}

interface CtxCtor {
  new (): AudioContext;
}

export function startVocalSynth(): VocalSynth {
  const Ctor: CtxCtor =
    (window.AudioContext as CtxCtor | undefined) ??
    (window as unknown as { webkitAudioContext: CtxCtor }).webkitAudioContext;
  const ctx = new Ctor();
  const now = ctx.currentTime;

  // ── Master chain: accent → panner → master → limiter → destination ────────
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.setValueAtTime(-6, now);
  limiter.knee.setValueAtTime(2, now);
  limiter.ratio.setValueAtTime(20, now);
  limiter.attack.setValueAtTime(0.003, now);
  limiter.release.setValueAtTime(0.25, now);
  limiter.connect(ctx.destination);

  const master = ctx.createGain();
  master.gain.setValueAtTime(0, now);
  master.gain.linearRampToValueAtTime(0.85, now + 0.6);
  master.connect(limiter);

  const panner = ctx.createStereoPanner();
  panner.pan.setValueAtTime(0, now);
  panner.connect(master);

  const accent = ctx.createGain();
  accent.gain.setValueAtTime(1, now);
  accent.connect(panner);

  // Master tone lowpass — opens as the mouth opens.
  const toneLP = ctx.createBiquadFilter();
  toneLP.type = "lowpass";
  toneLP.frequency.setValueAtTime(600, now);
  toneLP.Q.setValueAtTime(0.7, now);
  toneLP.connect(accent);

  // ── Three parallel formant bandpasses summed into the tone stage ──────────
  const formants: BiquadFilterNode[] = [];
  const formantGains = [0.9, 0.7, 0.45];
  const initF = computeFormants(0, 0, 0);
  for (let i = 0; i < 3; i++) {
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.setValueAtTime(initF[i], now);
    bp.Q.setValueAtTime(i === 0 ? 5 : 8, now);
    const fg = ctx.createGain();
    fg.gain.setValueAtTime(formantGains[i], now);
    bp.connect(fg);
    fg.connect(toneLP);
    formants.push(bp);
  }

  // ── Source: two detuned saws + a sub sine, gated by amplitude ─────────────
  const amp = ctx.createGain();
  amp.gain.setValueAtTime(0.05, now); // a quiet hum floor when closed
  for (const bp of formants) amp.connect(bp);

  const oscs: OscillatorNode[] = [];
  const makeOsc = (
    type: OscillatorType,
    freq: number,
    detune: number,
    level: number,
  ): OscillatorNode => {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, now);
    o.detune.setValueAtTime(detune, now);
    const g = ctx.createGain();
    g.gain.setValueAtTime(level, now);
    o.connect(g);
    g.connect(amp);
    oscs.push(o);
    return o;
  };

  const saw1 = makeOsc("sawtooth", ROOT_HZ, -6, 0.5);
  const saw2 = makeOsc("sawtooth", ROOT_HZ, 7, 0.5);
  const sub = makeOsc("sine", ROOT_HZ / 2, 0, 0.4);

  // ── Vibrato LFO → all oscillator detunes ──────────────────────────────────
  const lfo = ctx.createOscillator();
  lfo.type = "sine";
  lfo.frequency.setValueAtTime(5.2, now);
  const lfoDepth = ctx.createGain();
  lfoDepth.gain.setValueAtTime(0, now); // cents; brow/blink raise it
  lfo.connect(lfoDepth);
  lfoDepth.connect(saw1.detune);
  lfoDepth.connect(saw2.detune);

  for (const o of oscs) o.start(now);
  lfo.start(now);

  let stopped = false;
  const T = 0.06; // smoothing time-constant

  const update = (p: FaceParams): void => {
    if (stopped) return;
    const t = ctx.currentTime;

    // Amplitude: open mouth = full swell; closed = quiet hum.
    const targetAmp = 0.05 + p.jawOpen * 0.8;
    amp.gain.setTargetAtTime(targetAmp, t, T);

    // Vowel formants.
    const f = computeFormants(p.jawOpen, p.smile, p.pucker);
    for (let i = 0; i < 3; i++) {
      formants[i].frequency.setTargetAtTime(f[i], t, T);
    }

    // Tone: opens with jaw + smile.
    const cutoff = 500 + p.jawOpen * 3400 + p.smile * 2200;
    toneLP.frequency.setTargetAtTime(cutoff, t, T);

    // Pitch: brow bends ±7 semitones, snapped to the pentatonic scale.
    const semis = snapPentatonic(p.brow * 7);
    const freq = ROOT_HZ * Math.pow(2, semis / 12);
    saw1.frequency.setTargetAtTime(freq, t, T);
    saw2.frequency.setTargetAtTime(freq, t, T);
    sub.frequency.setTargetAtTime(freq / 2, t, T);

    // Yaw → a small drone detune on saw2/sub.
    const yawCents = p.yaw * 12;
    saw2.detune.setTargetAtTime(7 + yawCents, t, T);
    sub.detune.setTargetAtTime(yawCents * 0.5, t, T);

    // Vibrato depth from brow magnitude + a touch of blink.
    const vib = Math.abs(p.brow) * 10 + p.blink * 6;
    lfoDepth.gain.setTargetAtTime(vib, t, T);

    // Pan from head tilt.
    panner.pan.setTargetAtTime(p.pan, t, 0.08);
  };

  const blinkAccent = (): void => {
    if (stopped) return;
    const t = ctx.currentTime;
    accent.gain.cancelScheduledValues(t);
    accent.gain.setValueAtTime(accent.gain.value, t);
    accent.gain.linearRampToValueAtTime(1.18, t + 0.04);
    accent.gain.linearRampToValueAtTime(1.0, t + 0.28);
  };

  const stop = (): void => {
    if (stopped) return;
    stopped = true;
    const t = ctx.currentTime;
    master.gain.cancelScheduledValues(t);
    master.gain.setTargetAtTime(0, t, 0.08);
    for (const o of oscs) {
      try {
        o.stop(t + 0.3);
      } catch {
        /* already stopped */
      }
    }
    try {
      lfo.stop(t + 0.3);
    } catch {
      /* noop */
    }
    setTimeout(() => {
      void ctx.close().catch(() => {});
    }, 400);
  };

  return { update, blinkAccent, stop };
}
