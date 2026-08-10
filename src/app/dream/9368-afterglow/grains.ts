// grains.ts — the granular "regrowth" cloud for 9368-afterglow.
//
// As the main playback of Karel's recording erodes (see audio.ts), the material
// it loses is refilled by a cloud of short overlapping grains sampled from the
// SAME decoded buffer. Crucially the grains read the PRISTINE buffer directly —
// they never pass through the erosion filterbank — so they are the "remembered"
// un-eroded material. Biased toward the opening of the recording, they are the
// memory of the first, cleanest passes; as the source thins, the cloud grows to
// take its place. The piece dissolves from him into the memory of him.
//
// This is granular resynthesis in the sense of Curtis Roads, *Microsound*: a
// stream of enveloped micro-events (~120–340 ms, raised-cosine windows) whose
// density and level rise over the arc, with a gentle seeded pitch spread.
//
// Deterministic: every offset, duration, pitch and gain is drawn from a
// mulberry32 stream. No Math.random / Date.now.

import { mulberry32 } from "./rng";

export interface GrainCloud {
  /** 0..1 — how present the cloud is (drives level + density). */
  setLevel(level: number): void;
  /** 0..1 — softening amount; opens the cloud lowpass DOWN as it rises. */
  setTone(soften: number): void;
  /** Read-only: current grain spawn count since start (for the visual). */
  grainCount(): number;
  stop(): void;
}

const LOOKAHEAD_SEC = 0.25; // schedule window per tick
const TICK_MS = 90; // scheduler wakeups

export function createGrainCloud(
  ctx: AudioContext,
  buffer: AudioBuffer,
  dest: AudioNode,
  seed: number
): GrainCloud {
  const rand = mulberry32(seed ^ 0x6a11);

  // Bus: grains -> tone lowpass -> level gain -> dest (safe master input).
  const level = ctx.createGain();
  level.gain.value = 0.0001;

  const tone = ctx.createBiquadFilter();
  tone.type = "lowpass";
  tone.frequency.value = 5200; // opens down as the cloud takes over (softening)
  tone.Q.value = 0.4;

  tone.connect(level);
  level.connect(dest);

  let curLevel = 0;
  let count = 0;
  let stopped = false;

  const dur = buffer.duration;

  // Next grain onset time on the audio clock.
  let nextAt = ctx.currentTime + 0.05;

  function spawnGrain(when: number): void {
    // Grain length: short micro-event with a raised-cosine window.
    const gDur = 0.12 + rand() * 0.22;

    // Offset biased toward the OPENING of the recording — the earliest,
    // least-eroded material ("remembered grains"). rand^2 clusters near 0.
    const bias = rand() * rand();
    let offset = bias * dur * 0.7;
    if (offset + gDur > dur) offset = Math.max(0, dur - gDur - 0.01);

    // Gentle pitch spread: mostly within ±2 semitones, occasional octave-down
    // for warmth. Small, so it reads as haze around the note, not transposition.
    const r = rand();
    let semis: number;
    if (r < 0.12) semis = -12; // soft octave-down body
    else semis = (rand() - 0.5) * 4; // ±2 semitones
    const rate = Math.pow(2, semis / 12);

    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = rate;

    const env = ctx.createGain();
    // Raised-cosine (Hann) window approximated with two ramps + a hold.
    const peak = (0.05 + rand() * 0.08) * (0.35 + curLevel);
    const a = gDur * 0.45;
    env.gain.setValueAtTime(0.0001, when);
    env.gain.linearRampToValueAtTime(peak, when + a);
    env.gain.linearRampToValueAtTime(0.0001, when + gDur);

    src.connect(env);
    env.connect(tone);

    src.start(when, offset, gDur + 0.02);
    src.stop(when + gDur + 0.05);
    // Grain nodes are one-shot; let GC reclaim after they finish.
    src.onended = () => {
      try {
        src.disconnect();
        env.disconnect();
      } catch {
        /* already gone */
      }
    };
    count++;
  }

  function schedule(): void {
    if (stopped) return;
    const horizon = ctx.currentTime + LOOKAHEAD_SEC;
    // Density rises with level: sparse (~5/s) early, dense soft cloud (~22/s)
    // when the cloud has fully taken over. Never a machine-gun — grains overlap
    // into a continuous haze rather than a rhythm.
    const rate = 4 + curLevel * 18; // grains per second
    const interval = 1 / rate;
    while (nextAt < horizon) {
      if (curLevel > 0.02) spawnGrain(nextAt);
      // Seeded jitter so onsets never form an audible pulse.
      nextAt += interval * (0.6 + rand() * 0.8);
    }
    if (nextAt < ctx.currentTime) nextAt = ctx.currentTime + 0.02;
  }

  const timer = window.setInterval(schedule, TICK_MS);
  schedule();

  return {
    setLevel(v: number) {
      curLevel = Math.min(1, Math.max(0, v));
      // Level curve: gentle, tops out ~0.9 so it fills the gaps without
      // overwhelming. setTargetAtTime keeps it smooth (no strobe / no click).
      const target = curLevel * 0.9 + 0.0001;
      level.gain.setTargetAtTime(target, ctx.currentTime, 0.6);
    },
    setTone(soften: number) {
      const s = Math.min(1, Math.max(0, soften));
      // Open the lowpass DOWN from 5.2 kHz to ~1.1 kHz as it softens.
      const hz = 5200 - s * 4100;
      tone.frequency.setTargetAtTime(hz, ctx.currentTime, 0.8);
    },
    grainCount() {
      return count;
    },
    stop() {
      stopped = true;
      window.clearInterval(timer);
      try {
        const t = ctx.currentTime;
        level.gain.cancelScheduledValues(t);
        level.gain.setValueAtTime(level.gain.value, t);
        level.gain.linearRampToValueAtTime(0.0001, t + 0.3);
      } catch {
        /* ctx closing */
      }
      window.setTimeout(() => {
        try {
          level.disconnect();
          tone.disconnect();
        } catch {
          /* ok */
        }
      }, 400);
    },
  };
}
