/**
 * synth.ts — Whole-tone sing-back for the Mouth Mirror.
 *
 * Tonal world: a WHOLE-TONE scale (6 equal 200-cent steps). It has no leading
 * tone and no tonic, so it feels dreamy and unanchored — a "foreign tonal
 * world". NOT D-Dorian, NOT C-major pentatonic.
 *
 *   C4=261.63  D4=293.66  E4=329.63  F#4=369.99  G#4=415.30  A#4=466.16
 *
 * The head sings a vowel back by exciting a warm oscillator stack and shaping
 * it through TWO bandpass filters tuned to the detected F1/F2, so the sung
 * note actually sounds like the vowel the child made. Soft attack/release.
 *
 * Safety: everything passes through a master gain → DynamicsCompressor used as
 * a brick-wall limiter so it can never blast small ears. The mic is NEVER
 * routed here — only an AnalyserNode reads it.
 */

import type { VowelId } from "./lpc";

// Whole-tone scale, one per vowel. Indices map a..u to ascending notes so each
// vowel gets a recognisable pitch.
export const WHOLE_TONE_HZ: Record<VowelId, number> = {
  a: 261.63, // C4
  e: 293.66, // D4
  i: 329.63, // E4
  o: 369.99, // F#4  (whole step above E)
  u: 415.30, // G#4
};

// Canonical formants for shaping the sing-back when no live formant is given.
const VOWEL_FORMANTS: Record<VowelId, { f1: number; f2: number; f3: number }> = {
  a: { f1: 730, f2: 1090, f3: 2440 },
  e: { f1: 530, f2: 1840, f3: 2480 },
  i: { f1: 270, f2: 2290, f3: 3010 },
  o: { f1: 570, f2: 840, f3: 2410 },
  u: { f1: 300, f2: 870, f3: 2240 },
};

export interface SingBackEngine {
  /** Sing a vowel back, optionally shaped by live F1/F2. */
  sing: (vowel: VowelId, f1?: number, f2?: number) => void;
  /** Quiet idle breath pad gain (0..1-ish small). */
  setBreath: (level: number) => void;
  dispose: () => void;
}

function safeStop(n: AudioNode): void {
  try {
    (n as OscillatorNode).stop();
  } catch {
    /* already stopped */
  }
}

/**
 * Build the sing-back engine. All output flows through a limiter so peaks are
 * clamped — safe for small ears.
 */
export function createSingBack(ctx: AudioContext): SingBackEngine {
  // Brick-wall limiter (DynamicsCompressor with aggressive settings).
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -10;
  limiter.knee.value = 0;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.18;

  const master = ctx.createGain();
  master.gain.value = 0.5; // conservative headroom before the limiter
  master.connect(limiter);
  limiter.connect(ctx.destination);

  // ── Idle breath pad: two detuned sines, very soft, gently undulating ──
  const breathGain = ctx.createGain();
  breathGain.gain.value = 0;
  breathGain.connect(master);
  const breathOscs: OscillatorNode[] = [];
  [110, 110 * 1.5].forEach((f, i) => {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    const lfo = ctx.createOscillator();
    const lg = ctx.createGain();
    o.type = "sine";
    o.frequency.value = f;
    g.gain.value = i === 0 ? 0.5 : 0.3;
    lfo.type = "sine";
    lfo.frequency.value = 0.08 + i * 0.03;
    lg.gain.value = f * 0.004;
    lfo.connect(lg);
    lg.connect(o.frequency);
    o.connect(g);
    g.connect(breathGain);
    o.start();
    lfo.start();
    breathOscs.push(o, lfo);
  });

  function setBreath(level: number): void {
    const t = ctx.currentTime;
    breathGain.gain.setTargetAtTime(Math.max(0, level) * 0.05, t, 0.4);
  }

  // ── Sing a vowel-coloured note ──
  function sing(vowel: VowelId, liveF1?: number, liveF2?: number): void {
    const t0 = ctx.currentTime;
    const f0 = WHOLE_TONE_HZ[vowel];
    const canon = VOWEL_FORMANTS[vowel];
    // Blend detected (expressive) with canonical (stable).
    const f1 = liveF1 !== undefined ? liveF1 * 0.4 + canon.f1 * 0.6 : canon.f1;
    const f2 = liveF2 !== undefined ? liveF2 * 0.4 + canon.f2 * 0.6 : canon.f2;

    // Glottal-ish source: sawtooth (rich harmonics) + soft sub sine.
    const src = ctx.createGain();
    src.gain.value = 1;

    const saw = ctx.createOscillator();
    saw.type = "sawtooth";
    saw.frequency.value = f0;
    const sub = ctx.createOscillator();
    sub.type = "sine";
    sub.frequency.value = f0;
    const subG = ctx.createGain();
    subG.gain.value = 0.35;
    saw.connect(src);
    sub.connect(subG);
    subG.connect(src);

    // Two formant bandpasses (+ a faint F3 for character).
    const mk = (freq: number, q: number) => {
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = freq;
      bp.Q.value = q;
      return bp;
    };
    const bp1 = mk(f1, 7);
    const bp2 = mk(f2, 8);
    const bp3 = mk(canon.f3, 6);

    const noteGain = ctx.createGain();
    noteGain.gain.value = 0;

    src.connect(bp1);
    src.connect(bp2);
    src.connect(bp3);
    bp1.connect(noteGain);
    bp2.connect(noteGain);
    bp3.connect(noteGain);
    noteGain.connect(master);

    // Soft attack / hold / release envelope.
    const peak = 0.22;
    const attack = 0.12, hold = 0.55, release = 0.6;
    noteGain.gain.setValueAtTime(0, t0);
    noteGain.gain.linearRampToValueAtTime(peak, t0 + attack);
    noteGain.gain.setValueAtTime(peak, t0 + attack + hold);
    noteGain.gain.linearRampToValueAtTime(0.0001, t0 + attack + hold + release);

    saw.start(t0);
    sub.start(t0);
    const stopAt = t0 + attack + hold + release + 0.05;
    saw.stop(stopAt);
    sub.stop(stopAt);
    saw.onended = () => {
      [saw, sub, subG, bp1, bp2, bp3, noteGain, src].forEach((n) =>
        n.disconnect()
      );
    };
  }

  function dispose(): void {
    breathOscs.forEach(safeStop);
    breathGain.disconnect();
    master.disconnect();
    limiter.disconnect();
  }

  return { sing, setBreath, dispose };
}
