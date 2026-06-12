/**
 * audio.ts — Singing motifs for 529-kids-doodle-choir
 *
 * Master bus chain:
 *   masterGain → lowpass (≤ 8 kHz) → DynamicsCompressor (−6 dB, 20:1) → destination
 *
 * All envelopes via setTargetAtTime — no sharp transients.
 * All notes in C major / C pentatonic so nothing ever clashes.
 * MUST be called inside a user gesture (Start button) for iOS AudioContext unlock.
 *
 * Reference: Quick, Draw! (Jongejan, Ha et al., Google 2016)
 * DoodleNet: yining1023 — https://github.com/yining1023/doodlenet
 */

import type { Archetype } from './classify';

// ── C-major / C-pentatonic note frequencies ───────────────────────────────────

const C3 = 130.81;
const G3 = 196.00;
const A3 = 220.00;
const C4 = 261.63;
const D4 = 293.66;
const E4 = 329.63;
const G4 = 392.00;
const A4 = 440.00;
const C5 = 523.25;
const E5 = 659.25;
const G5 = 783.99;

// ── Motif definitions ─────────────────────────────────────────────────────────
// Each note: { freq, dur (s), delay (s from motif start), gain (0–1), type }

interface MotifNote {
  freq: number;
  dur: number;
  delay: number;
  gain: number;
  type: OscillatorType;
}

const MOTIFS: Record<Archetype, MotifNote[]> = {
  // sun — rising warm pad, C major triad arpeggio up
  sun: [
    { freq: C4, dur: 0.50, delay: 0.00, gain: 0.16, type: 'sine' },
    { freq: E4, dur: 0.50, delay: 0.22, gain: 0.16, type: 'sine' },
    { freq: G4, dur: 0.60, delay: 0.44, gain: 0.18, type: 'sine' },
    { freq: C5, dur: 0.90, delay: 0.68, gain: 0.20, type: 'sine' },
  ],
  // fish — bubbly descending arpeggio, open intervals
  fish: [
    { freq: G4, dur: 0.18, delay: 0.00, gain: 0.14, type: 'triangle' },
    { freq: E4, dur: 0.18, delay: 0.14, gain: 0.14, type: 'triangle' },
    { freq: C4, dur: 0.18, delay: 0.28, gain: 0.15, type: 'triangle' },
    { freq: G3, dur: 0.18, delay: 0.42, gain: 0.14, type: 'triangle' },
    { freq: A3, dur: 0.30, delay: 0.56, gain: 0.16, type: 'triangle' },
    { freq: C4, dur: 0.40, delay: 0.78, gain: 0.18, type: 'sine'     },
  ],
  // bird — quick chirpy high motif
  bird: [
    { freq: E5, dur: 0.10, delay: 0.00, gain: 0.13, type: 'triangle' },
    { freq: G5, dur: 0.10, delay: 0.09, gain: 0.14, type: 'triangle' },
    { freq: E5, dur: 0.10, delay: 0.18, gain: 0.13, type: 'triangle' },
    { freq: A4, dur: 0.12, delay: 0.28, gain: 0.15, type: 'triangle' },
    { freq: G4, dur: 0.14, delay: 0.40, gain: 0.16, type: 'triangle' },
    { freq: E4, dur: 0.30, delay: 0.55, gain: 0.17, type: 'sine'     },
  ],
  // plant — gentle bell-like bloom (root → octave)
  plant: [
    { freq: G3, dur: 0.40, delay: 0.00, gain: 0.14, type: 'sine' },
    { freq: C4, dur: 0.45, delay: 0.28, gain: 0.15, type: 'sine' },
    { freq: E4, dur: 0.50, delay: 0.58, gain: 0.16, type: 'sine' },
    { freq: G4, dur: 0.60, delay: 0.90, gain: 0.18, type: 'sine' },
    { freq: C5, dur: 0.80, delay: 1.25, gain: 0.20, type: 'sine' },
  ],
  // cloud — airy whoosh chord (all notes together, slow attack)
  cloud: [
    { freq: C4, dur: 1.20, delay: 0.00, gain: 0.10, type: 'sine' },
    { freq: G4, dur: 1.20, delay: 0.06, gain: 0.10, type: 'sine' },
    { freq: E4, dur: 1.20, delay: 0.12, gain: 0.10, type: 'sine' },
    { freq: A4, dur: 1.20, delay: 0.18, gain: 0.09, type: 'sine' },
    { freq: D4, dur: 1.00, delay: 0.24, gain: 0.08, type: 'sine' },
  ],
  // star — short twinkle (pentatonic leaps)
  star: [
    { freq: C4,  dur: 0.14, delay: 0.00, gain: 0.15, type: 'triangle' },
    { freq: G4,  dur: 0.14, delay: 0.12, gain: 0.18, type: 'triangle' },
    { freq: E4,  dur: 0.14, delay: 0.24, gain: 0.16, type: 'triangle' },
    { freq: A4,  dur: 0.14, delay: 0.36, gain: 0.19, type: 'triangle' },
    { freq: G4,  dur: 0.14, delay: 0.48, gain: 0.18, type: 'triangle' },
    { freq: C5,  dur: 0.50, delay: 0.62, gain: 0.22, type: 'sine'     },
  ],
  // critter — playful staccato walking bassline
  critter: [
    { freq: G3, dur: 0.16, delay: 0.00, gain: 0.16, type: 'triangle' },
    { freq: A3, dur: 0.16, delay: 0.16, gain: 0.15, type: 'triangle' },
    { freq: C4, dur: 0.16, delay: 0.32, gain: 0.16, type: 'triangle' },
    { freq: D4, dur: 0.16, delay: 0.48, gain: 0.15, type: 'triangle' },
    { freq: E4, dur: 0.16, delay: 0.64, gain: 0.16, type: 'triangle' },
    { freq: G4, dur: 0.30, delay: 0.80, gain: 0.18, type: 'sine'     },
  ],
  // home — soft warm chord
  home: [
    { freq: C3, dur: 0.80, delay: 0.00, gain: 0.12, type: 'sine' },
    { freq: G3, dur: 0.80, delay: 0.05, gain: 0.12, type: 'sine' },
    { freq: E4, dur: 0.80, delay: 0.10, gain: 0.13, type: 'sine' },
    { freq: G4, dur: 0.70, delay: 0.15, gain: 0.12, type: 'sine' },
    { freq: C5, dur: 0.60, delay: 0.40, gain: 0.14, type: 'sine' },
  ],
};

// ── Persistent choir loop notes (each creature loops its motif quietly) ────────

const LOOP_INTERVAL_MS: Record<Archetype, number> = {
  sun: 4800, fish: 3800, bird: 3000, plant: 6000,
  cloud: 7000, star: 3500, critter: 3200, home: 5500,
};

// ── Build audio engine ─────────────────────────────────────────────────────────

export interface ChoirAudio {
  ctx: AudioContext;
  sing(archetype: Archetype): void;
  addToChoir(archetype: Archetype): void;
  dispose(): void;
}

export function buildChoirAudio(): ChoirAudio {
  const Ctx = window.AudioContext ||
    (window as unknown as Record<string, typeof AudioContext>)['webkitAudioContext'];
  const ctx = new Ctx();

  // ── Master bus ──────────────────────────────────────────────────────────────
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -6;
  limiter.knee.value = 2;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.25;
  limiter.connect(ctx.destination);

  const masterLp = ctx.createBiquadFilter();
  masterLp.type = 'lowpass';
  masterLp.frequency.value = 7800;
  masterLp.Q.value = 0.5;
  masterLp.connect(limiter);

  const masterGain = ctx.createGain();
  masterGain.gain.value = 0.55;
  masterGain.connect(masterLp);

  // ── Ambient background pad (very quiet C major hum) ─────────────────────────
  const ambientGain = ctx.createGain();
  ambientGain.gain.value = 0.0;
  ambientGain.connect(masterGain);

  for (const freq of [C3, G3, C4]) {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.value = 0.028;
    osc.connect(g);
    g.connect(ambientGain);
    osc.start();
  }
  ambientGain.gain.setTargetAtTime(1.0, ctx.currentTime + 0.2, 2.0);

  // ── Choir loop state ────────────────────────────────────────────────────────
  const loopTimers: Map<Archetype, ReturnType<typeof setInterval>> = new Map();
  const loopGains: Map<Archetype, GainNode> = new Map();

  function playMotif(archetype: Archetype, gain: GainNode, volume = 1.0): void {
    const motif = MOTIFS[archetype];
    const now = ctx.currentTime;

    for (const note of motif) {
      const osc = ctx.createOscillator();
      osc.type = note.type;
      osc.frequency.value = note.freq;

      const env = ctx.createGain();
      env.gain.value = 0;
      const attackTime = 0.04;
      const decayTime = note.dur * 0.6;
      env.gain.setTargetAtTime(note.gain * volume, now + note.delay, attackTime);
      env.gain.setTargetAtTime(0.0, now + note.delay + decayTime, note.dur * 0.35);

      osc.connect(env);
      env.connect(gain);
      osc.start(now + note.delay);
      osc.stop(now + note.delay + note.dur + 0.5);
    }
  }

  // Sing a one-shot motif (on recognition)
  function sing(archetype: Archetype): void {
    playMotif(archetype, masterGain, 1.0);
  }

  // Add archetype to the living choir (starts looping quietly)
  function addToChoir(archetype: Archetype): void {
    if (loopTimers.has(archetype)) return; // already in choir

    // Create a quiet dedicated gain for this choir member
    const choirMemberGain = ctx.createGain();
    choirMemberGain.gain.value = 0.32;
    choirMemberGain.connect(masterGain);
    loopGains.set(archetype, choirMemberGain);

    // Immediate play, then loop
    playMotif(archetype, choirMemberGain, 0.6);
    const interval = LOOP_INTERVAL_MS[archetype];
    const timer = setInterval(() => {
      playMotif(archetype, choirMemberGain, 0.45);
    }, interval);
    loopTimers.set(archetype, timer);
  }

  function dispose(): void {
    for (const timer of loopTimers.values()) clearInterval(timer);
    loopTimers.clear();
    ctx.close();
  }

  return { ctx, sing, addToChoir, dispose };
}
