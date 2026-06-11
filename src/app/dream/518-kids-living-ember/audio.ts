/**
 * audio.ts — Evolving lullaby synth for the Living Ember.
 *
 * Architecture:
 *   Master bus: masterGain → lowpass (≤8 kHz) → limiter → destination
 *   Sub hum:  very low sine (C2) for warmth — never silent
 *   Pad:      4 pentatonic / just-intonation detuned sines through a warm
 *             filter that slowly sweeps with the ember drift
 *   Drift:    a second slowly-detuning oscillator layer adds shimmer over time
 *   Bell/pluck: triggered on each hum burst — soft sine with exp decay
 *
 * AudioContext MUST be created inside a user gesture (call buildAudio()
 * from a button handler).
 *
 * No new npm dependencies. Web Audio API only.
 */

import type { EmberState } from "./memory";
import { BASE_F } from "./memory";

// Pentatonic drone pitches (Hz) — C3 major pentatonic, just intonation
// Ratios: 1, 9/8, 5/4, 3/2, 5/3
const DRONE_FREQS = [
  130.81,              // C3
  130.81 * (9 / 8),   // D3 (just major 2nd)
  130.81 * (5 / 4),   // E3 (just major 3rd)
  130.81 * (3 / 2),   // G3 (just perfect 5th)
  130.81 * (5 / 3),   // A3 (just major 6th)
];

export interface EmberAudio {
  ctx: AudioContext;
  /** Update synth parameters from the current EmberState. Call ~4×/s. */
  updateFromState: (state: EmberState) => void;
  /** Trigger a soft bell pluck (called on hum burst detection). */
  triggerBell: () => void;
  /** Tear down all nodes and close context. */
  dispose: () => void;
}

/**
 * Build and return the audio engine.
 * MUST be called inside a user-gesture handler for iOS AudioContext unlock.
 */
export function buildAudio(): EmberAudio {
  const Ctx =
    window.AudioContext ||
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).webkitAudioContext as typeof AudioContext;
  const ctx = new Ctx();

  // ── Master bus ──────────────────────────────────────────────────────────────
  // Chain: masterGain → masterLp (kids-safe ≤8 kHz) → limiter → destination
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -4;
  limiter.knee.value = 3;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.25;

  const masterLp = ctx.createBiquadFilter();
  masterLp.type = "lowpass";
  masterLp.frequency.value = 7800; // kids-safe ceiling
  masterLp.Q.value = 0.5;

  const masterGain = ctx.createGain();
  masterGain.gain.value = 0.18; // modest overall level

  masterGain.connect(masterLp);
  masterLp.connect(limiter);
  limiter.connect(ctx.destination);

  // ── Sub hum (C2, always present) ────────────────────────────────────────────
  const subOsc = ctx.createOscillator();
  subOsc.type = "sine";
  subOsc.frequency.value = 65.41; // C2
  const subGain = ctx.createGain();
  subGain.gain.value = 0.07;
  subOsc.connect(subGain);
  subGain.connect(masterGain);
  subOsc.start();

  // ── Warm pad ─────────────────────────────────────────────────────────────────
  // Two layers: stable layer + slowly detuning drift layer
  const padFilter = ctx.createBiquadFilter();
  padFilter.type = "lowpass";
  padFilter.frequency.value = 1200;
  padFilter.Q.value = 0.7;
  padFilter.connect(masterGain);

  // Stable triad layer: notes 0 (C3), 2 (E3), 3 (G3)
  const stableOscs: OscillatorNode[] = [];
  const droneIndices = [0, 2, 3];
  for (const noteIdx of droneIndices) {
    const baseFreq = DRONE_FREQS[noteIdx];
    // 2-voice detuned unison per note for warmth
    for (const detune of [-2, 2]) {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = baseFreq * Math.pow(2, detune / 1200);
      const g = ctx.createGain();
      g.gain.value = 0.028;
      osc.connect(g);
      g.connect(padFilter);
      osc.start();
      stableOscs.push(osc);
    }
    // Add gentle 2nd harmonic (very quiet) for warmth body
    const osc2 = ctx.createOscillator();
    osc2.type = "sine";
    osc2.frequency.value = baseFreq * 2.01;
    const g2 = ctx.createGain();
    g2.gain.value = 0.010;
    osc2.connect(g2);
    g2.connect(padFilter);
    osc2.start();
    stableOscs.push(osc2);
  }

  // Drift layer: a slowly modulating oscillator that evolves over time
  const driftOsc = ctx.createOscillator();
  driftOsc.type = "sine";
  driftOsc.frequency.value = DRONE_FREQS[4]; // A3
  const driftGain = ctx.createGain();
  driftGain.gain.value = 0.015;
  const driftFilter = ctx.createBiquadFilter();
  driftFilter.type = "bandpass";
  driftFilter.frequency.value = 600;
  driftFilter.Q.value = 1.5;
  driftOsc.connect(driftFilter);
  driftFilter.connect(driftGain);
  driftGain.connect(masterGain);
  driftOsc.start();

  // ── Bell pluck synth ─────────────────────────────────────────────────────────
  let bellBaseIdx = 0;

  function triggerBell(): void {
    // Pick a pentatonic pitch 2 octaves up, cycle through the scale
    const freq = DRONE_FREQS[bellBaseIdx % DRONE_FREQS.length] * 4;
    bellBaseIdx = (bellBaseIdx + 1) % DRONE_FREQS.length;
    const now = ctx.currentTime;

    const bellOsc = ctx.createOscillator();
    bellOsc.type = "sine";
    bellOsc.frequency.setValueAtTime(freq * 1.012, now);
    bellOsc.frequency.exponentialRampToValueAtTime(freq, now + 0.08);

    const bellGain = ctx.createGain();
    bellGain.gain.setValueAtTime(0.0, now);
    bellGain.gain.linearRampToValueAtTime(0.10, now + 0.01);
    bellGain.gain.exponentialRampToValueAtTime(0.0001, now + 1.8);

    const bellLp = ctx.createBiquadFilter();
    bellLp.type = "lowpass";
    bellLp.frequency.value = 5000;

    bellOsc.connect(bellLp);
    bellLp.connect(masterGain);
    bellOsc.start(now);
    bellOsc.stop(now + 2.0);
  }

  // ── State-driven update (~4×/s) ──────────────────────────────────────────────
  // Maps EmberState drift → filter cutoff, sub pitch, master warmth.
  // NO expensive GPU readback — pure CPU drift state drives audio.
  let lastBellTrigger = -5;

  function updateFromState(state: EmberState): void {
    const now = ctx.currentTime;

    // Pad filter cutoff: slowly sweeps 600–2400 Hz with bloom + hum
    const targetCutoff = 650 + state.bloom * 900 + state.humBoost * 800;
    padFilter.frequency.setTargetAtTime(targetCutoff, now, 1.5);

    // Drift layer: slowly glide to new scale degree as f drifts
    const driftDegree = Math.floor(((state.f - BASE_F) / 0.06 + 0.5) * DRONE_FREQS.length) % DRONE_FREQS.length;
    const targetDriftFreq = DRONE_FREQS[Math.max(0, driftDegree)] * 2;
    driftOsc.frequency.setTargetAtTime(
      Math.max(100, Math.min(600, targetDriftFreq)),
      now,
      6.0
    );
    driftFilter.frequency.setTargetAtTime(
      400 + state.bloom * 500,
      now,
      3.0
    );

    // Sub oscillator drifts very slightly (±1.5 semitones) with bloom
    const subTarget = 65.41 * Math.pow(2, (state.bloom - 0.5) * 0.25);
    subOsc.frequency.setTargetAtTime(
      Math.max(55, Math.min(80, subTarget)),
      now,
      5.0
    );

    // Trigger a soft bell when child hums
    if (state.humBoost > 0.28 && state.t - lastBellTrigger > 2.0) {
      lastBellTrigger = state.t;
      triggerBell();
    }

    // Master gain warms slightly with cumulative hum
    const warmth = Math.min(1.0, state.totalHum * 0.12);
    masterGain.gain.setTargetAtTime(0.18 + warmth * 0.08, now, 2.5);
  }

  function dispose(): void {
    try { subOsc.stop(); } catch { /* already stopped */ }
    for (const osc of stableOscs) {
      try { osc.stop(); } catch { /* already stopped */ }
    }
    try { driftOsc.stop(); } catch { /* already stopped */ }
    void ctx.close();
  }

  return { ctx, updateFromState, triggerBell, dispose };
}
