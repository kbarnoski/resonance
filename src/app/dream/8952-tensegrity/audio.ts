// audio.ts — the coupled-network pluck synth.
//
// Every cable in the tensegrity is a real string: its LIVE TENSION sets its
// pitch (higher tension = higher pitch, exactly like tightening a guitar
// string — f ∝ sqrt(T/µ)). When you pluck a node we voice each cable that
// touches it, so one grab drops a whole chord out of the coupled net. The
// timbre is Karplus-Strong (a plucked-string physical model): a short seeded
// noise burst fed through a tuned delay + low-pass, rendered offline into an
// AudioBuffer and played — steel-string bright, no drone bed.
//
// Tuning is strictly equal-tempered (12-TET), snapped to a cool minor
// pentatonic. No just-intonation, no sustained pad.

import { mulberry32 } from "./prng";
import { createSafeMaster } from "../_shared/visionary/safeMaster";

// Minor-pentatonic scale degrees (semitones) tiled across octaves.
const PENT = [0, 3, 5, 7, 10];
const BASE_MIDI = 45; // A2 — steel/graphite low end

function midiToFreq(m: number): number {
  return 440 * Math.pow(2, (m - 69) / 12);
}

/** Map a normalised tension (0..1) to a snapped equal-tempered frequency. */
export function tensionToFreq(tNorm: number): number {
  const t = Math.max(0, Math.min(1, tNorm));
  // Span ~2.4 octaves of the pentatonic.
  const steps = PENT.length * 3 - 1; // 14 available notes
  const idx = Math.round(t * steps);
  const octave = Math.floor(idx / PENT.length);
  const degree = idx % PENT.length;
  const midi = BASE_MIDI + octave * 12 + PENT[degree];
  return midiToFreq(midi);
}

export interface AudioEngine {
  ctx: AudioContext;
  pluck: (freq: number, gain: number, tNorm: number) => void;
  dispose: () => void;
}

/**
 * Create the engine. Must be called from a user gesture (browsers gate audio).
 * Returns null if the Web Audio API is unavailable.
 */
export function createAudioEngine(): AudioEngine | null {
  const Ctor =
    typeof window !== "undefined"
      ? window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext
      : undefined;
  if (!Ctor) return null;

  const ctx = new Ctor();

  // Master chain: gentle bus compression-ish limiter + a touch of shimmer.
  const master = ctx.createGain();
  master.gain.value = 0.85;

  // A short bright plate-ish send so the steel rings a little (NOT a drone).
  const wet = ctx.createGain();
  wet.gain.value = 0.22;
  const delay = ctx.createDelay(0.5);
  delay.delayTime.value = 0.13;
  const fb = ctx.createGain();
  fb.gain.value = 0.28;
  const tone = ctx.createBiquadFilter();
  tone.type = "highpass";
  tone.frequency.value = 500;
  delay.connect(fb);
  fb.connect(tone);
  tone.connect(delay);
  delay.connect(master);

  // Route through the shared ear-safety bus (shelf + lowpass + limiter)
  // instead of connecting to ctx.destination directly.
  const safe = createSafeMaster(ctx);
  master.connect(safe.input);

  const noiseRng = mulberry32(0x8952);
  let voiceCount = 0;

  const pluck = (freq: number, gain: number, tNorm: number) => {
    if (ctx.state === "closed") return;
    if (voiceCount > 24) return; // cheap voice cap
    const sr = ctx.sampleRate;
    const dur = 0.9 + tNorm * 0.6;
    const N = Math.max(2, Math.floor(sr / freq));
    const len = Math.floor(sr * dur);
    const buf = ctx.createBuffer(1, len, sr);
    const out = buf.getChannelData(0);

    // Karplus-Strong: seeded noise excitation -> tuned averaging feedback.
    const ring = new Float32Array(N);
    for (let i = 0; i < N; i++) ring[i] = noiseRng() * 2 - 1;
    // Brighter attack for higher tension.
    const damp = 0.494 + (1 - tNorm) * 0.008; // higher pitch decays faster
    let p = 0;
    for (let i = 0; i < len; i++) {
      const cur = ring[p];
      const nxt = ring[(p + 1) % N];
      const v = damp * (cur + nxt);
      out[i] = cur;
      ring[p] = v;
      p = (p + 1) % N;
    }

    const src = ctx.createBufferSource();
    src.buffer = buf;

    const vca = ctx.createGain();
    const now = ctx.currentTime;
    const peak = Math.max(0.02, Math.min(0.5, gain));
    vca.gain.setValueAtTime(0, now);
    vca.gain.linearRampToValueAtTime(peak, now + 0.004);
    vca.gain.exponentialRampToValueAtTime(0.0008, now + dur);

    // A little body: brightness tracks tension.
    const body = ctx.createBiquadFilter();
    body.type = "bandpass";
    body.frequency.value = freq * (1.5 + tNorm);
    body.Q.value = 0.7;

    src.connect(body);
    body.connect(vca);
    vca.connect(master);
    vca.connect(wet);
    wet.connect(delay);

    voiceCount++;
    src.onended = () => {
      voiceCount--;
      src.disconnect();
      body.disconnect();
      vca.disconnect();
    };
    src.start(now);
    src.stop(now + dur + 0.05);
  };

  const dispose = () => {
    try {
      master.disconnect();
      wet.disconnect();
      delay.disconnect();
      fb.disconnect();
      tone.disconnect();
      safe.disconnect();
    } catch {
      /* already gone */
    }
    if (ctx.state !== "closed") void ctx.close();
  };

  return { ctx, pluck, dispose };
}
