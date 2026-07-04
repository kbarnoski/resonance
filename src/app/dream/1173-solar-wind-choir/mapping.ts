// ─────────────────────────────────────────────────────────────────────────────
// mapping.ts — the data → music engine for 1173-solar-wind-choir.
//
// computeTargets(data) turns one SolarWind sample into a set of smooth targets
// that BOTH the audio graph and the canvas read from. Every value is a plain,
// bounded number so parameter ramps never surprise. Nothing here touches the
// DOM or Web Audio — it is pure so it can be unit-reasoned and reused by render.
//
//   wind speed → overall register/energy + streak speed on canvas
//   density    → number of active choir voices / chord richness
//   Bz         → consonant↔tense harmony cross-fade + palette toward violet
//   Bt         → high-shelf shimmer / brightness of the choir
//   Kp         → aurora sparkle: extra shimmer voices + aurora ribbon brightness
// ─────────────────────────────────────────────────────────────────────────────

import type { SolarWind } from "./feeds";

// Just-intonation ratios over a base frequency: a warm major-ish scale that
// stacks into a rich, singable cluster. Index order = voice order.
export const JI_RATIOS = [1 / 1, 9 / 8, 5 / 4, 4 / 3, 3 / 2, 5 / 3, 15 / 8, 2 / 1];
export const VOICE_COUNT = JI_RATIOS.length; // 8

// A darker/tenser alternative tuning blended in as Bz goes strongly negative:
// minor third and tritone-ish 7-limit intervals add unrest without dissonant
// beating chaos. Same length as JI_RATIOS so we can crossfade per voice.
export const TENSE_RATIOS = [1 / 1, 9 / 8, 6 / 5, 7 / 5, 3 / 2, 8 / 5, 9 / 5, 2 / 1];

export interface VoiceTarget {
  /** Detuned base ratio for this voice after consonant↔tense crossfade. */
  ratio: number;
  /** 0..1 target loudness for this voice (0 = faded out). */
  gain: number;
  /** Formant/peaking filter centre in Hz for a vocal colour. */
  formantHz: number;
}

export interface Targets {
  /** Base frequency of the choir in Hz (register), driven by wind speed. */
  baseHz: number;
  /** Per-voice targets, length VOICE_COUNT. */
  voices: VoiceTarget[];
  /** Master shimmer high-shelf gain in dB (Bt). */
  shimmerDb: number;
  /** Vibrato depth in cents (energy from wind speed). */
  vibratoCents: number;
  /** Aurora sparkle 0..1 (Kp). */
  sparkle: number;
  /** Harmony tension 0..1 (Bz negative → 1). */
  tension: number;
  // ── shared visual conveniences (normalised) ──
  speed01: number;
  density01: number;
  bz: number;
  bt: number;
  kp: number;
  /** Palette hue shift toward violet 0..1 (Bz negative). */
  violet: number;
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Pure mapping from a live/fallback sample to smooth audio + visual targets.
 * All inputs are re-clamped defensively (the sample may be the raw fallback).
 */
export function computeTargets(data: SolarWind): Targets {
  const speed = Math.min(800, Math.max(250, data.speed));
  const density = Math.min(30, Math.max(0, data.density));
  const bz = Math.min(20, Math.max(-20, data.bz));
  const bt = Math.min(30, Math.max(0, data.bt));
  const kp = Math.min(9, Math.max(0, data.kp));

  // Normalised drivers.
  const speed01 = clamp01((speed - 250) / (800 - 250));
  const density01 = clamp01(density / 30);
  const bt01 = clamp01(bt / 30);
  const kp01 = clamp01(kp / 9);
  // Tension rises as Bz goes negative (southward). Bz >= 0 → calm (0).
  const tension = clamp01(-bz / 18);
  const violet = tension;

  // Faster wind lifts the whole choir a little: warm alto → mezzo register.
  const baseHz = lerp(132, 174, speed01);

  // Denser wind = more active voices. Always keep at least the low three so the
  // piece never falls silent, up to all eight when the wind is thick.
  const activeVoices = Math.round(lerp(3, VOICE_COUNT, density01));

  const voices: VoiceTarget[] = [];
  for (let i = 0; i < VOICE_COUNT; i++) {
    const consonant = JI_RATIOS[i];
    const tense = TENSE_RATIOS[i];
    const ratio = lerp(consonant, tense, tension);

    // Voice on if within the active window; upper voices fade last.
    const on = i < activeVoices;
    // Upper voices are quieter; sparkle (Kp) lifts the very top voices as
    // aurora "shimmer voices".
    const topBias = i >= VOICE_COUNT - 2 ? kp01 * 0.5 : 0;
    const base = on ? lerp(0.85, 0.45, i / VOICE_COUNT) + topBias : 0;
    const gain = clamp01(base);

    voices.push({ ratio, gain, formantHz: lerp(500, 2600, i / VOICE_COUNT) });
  }

  return {
    baseHz,
    voices,
    // Bt brightens the choir via a high-shelf; storms with strong total field
    // shimmer more. Range roughly -3..+9 dB.
    shimmerDb: lerp(-3, 9, bt01),
    // Energy → vibrato depth, kept gentle.
    vibratoCents: lerp(4, 14, speed01),
    sparkle: kp01,
    tension,
    speed01,
    density01,
    bz,
    bt,
    kp,
    violet,
  };
}
