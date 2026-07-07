// ─────────────────────────────────────────────────────────────────────────────
// audio.ts — the swarm becomes a choir.
//
// We do NOT create one oscillator per agent. Instead the phase circle is split
// into PHASE_BINS buckets; each bucket owns exactly one voice. Every frame we
// count how many agents fall in each bucket, quantise that bucket's mean phase
// to a fixed consonant scale (just-intonation pentatonic), and drive the voice's
// pitch, pan and gain from that. So:
//
//   phase θ            → pitch (quantised, always consonant)
//   spatial angle      → stereo pan (per voice, from the bucket's mean position)
//   phase coherence R  → drone intensity + brightness (master lowpass)
//   spatial coherence  → chord "spread" / detune shimmer
//
// Synced swarm  → a few buckets dominate → unison / stacked chord.
// Active wave   → buckets cycle round the circle → shimmering arpeggio.
//
// Master gain ≤ 0.4, routed through a DynamicsCompressor limiter.
// ─────────────────────────────────────────────────────────────────────────────

import type { OrderParams } from "./swarmalator";

export const PHASE_BINS = 12;

// Just-intonation pentatonic ratios over two octaves — every pair is consonant.
const SCALE = [1, 9 / 8, 5 / 4, 3 / 2, 5 / 3, 2, 9 / 4, 5 / 2, 3, 10 / 3];
const ROOT_HZ = 146.83; // D3

interface Voice {
  osc: OscillatorNode;
  osc2: OscillatorNode; // detuned partner for shimmer
  gain: GainNode;
  pan: StereoPannerNode;
}

export class ChoirAudio {
  private ctx: AudioContext;
  private master: GainNode;
  private limiter: DynamicsCompressorNode;
  private brightness: BiquadFilterNode;
  private voices: Voice[] = [];
  private drone: { osc: OscillatorNode; gain: GainNode } | null = null;
  private started = false;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;

    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -8;
    this.limiter.knee.value = 6;
    this.limiter.ratio.value = 12;
    this.limiter.attack.value = 0.003;
    this.limiter.release.value = 0.18;

    this.brightness = ctx.createBiquadFilter();
    this.brightness.type = "lowpass";
    this.brightness.frequency.value = 900;
    this.brightness.Q.value = 0.6;

    this.master = ctx.createGain();
    this.master.gain.value = 0.0001;

    this.brightness.connect(this.limiter);
    this.limiter.connect(this.master);
    this.master.connect(ctx.destination);
  }

  start() {
    if (this.started) return;
    this.started = true;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    // Sub drone — a low sine tied to the root, its level following R.
    const dOsc = ctx.createOscillator();
    dOsc.type = "sine";
    dOsc.frequency.value = ROOT_HZ / 2;
    const dGain = ctx.createGain();
    dGain.gain.value = 0.0001;
    dOsc.connect(dGain);
    dGain.connect(this.brightness);
    dOsc.start();
    this.drone = { osc: dOsc, gain: dGain };

    // One voice per phase bin.
    for (let b = 0; b < PHASE_BINS; b++) {
      const osc = ctx.createOscillator();
      osc.type = "triangle";
      const osc2 = ctx.createOscillator();
      osc2.type = "sine";
      const gain = ctx.createGain();
      gain.gain.value = 0.0001;
      const pan = ctx.createStereoPanner();
      osc.connect(gain);
      osc2.connect(gain);
      gain.connect(pan);
      pan.connect(this.brightness);
      osc.start();
      osc2.start();
      this.voices.push({ osc, osc2, gain, pan });
    }

    this.master.gain.setValueAtTime(0.0001, now);
    this.master.gain.exponentialRampToValueAtTime(0.32, now + 2.0);
  }

  /**
   * Push the current swarm state into the choir.
   * @param binCounts   agents per phase bin
   * @param binAngle    mean spatial angle (radians) per bin
   * @param binPhase    mean phase (radians) per bin
   * @param o           global order parameters
   */
  update(
    binCounts: number[],
    binAngle: number[],
    binPhase: number[],
    o: OrderParams,
  ) {
    if (!this.started) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const total = binCounts.reduce((a, c) => a + c, 0) || 1;

    // Brightness opens with phase coherence — synced = brighter.
    const cutoff = 500 + o.R * 3200 + o.meanSpeed * 400;
    this.brightness.frequency.setTargetAtTime(cutoff, t, 0.15);

    // Drone swells with coherence, so a synced swarm hums a firm root.
    if (this.drone) {
      const dLevel = 0.05 + o.R * 0.14;
      this.drone.gain.gain.setTargetAtTime(dLevel, t, 0.25);
    }

    for (let b = 0; b < PHASE_BINS; b++) {
      const v = this.voices[b];
      const share = binCounts[b] / total;
      // Quantise this bin's mean phase to the consonant scale.
      const frac = (binPhase[b] / (Math.PI * 2)) % 1;
      const idx = Math.min(
        SCALE.length - 1,
        Math.max(0, Math.floor(((frac + 1) % 1) * SCALE.length)),
      );
      const freq = ROOT_HZ * SCALE[idx];
      v.osc.frequency.setTargetAtTime(freq, t, 0.05);
      v.osc2.frequency.setTargetAtTime(freq, t, 0.05);
      // Spatial coherence controls the detune shimmer between the two partials.
      const cents = 4 + (1 - Math.max(o.Splus, o.Sminus)) * 22;
      v.osc2.detune.setTargetAtTime(cents, t, 0.1);
      // Pan from spatial angle of this bucket.
      v.pan.pan.setTargetAtTime(Math.sin(binAngle[b]) * 0.85, t, 0.1);
      // Gain from population share, gently compressed so no single voice screams.
      const level = share > 0.001 ? Math.min(0.16, 0.05 + share * 0.7) : 0.0;
      v.gain.gain.setTargetAtTime(level, t, 0.08);
    }
  }

  stop() {
    const now = this.ctx.currentTime;
    try {
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setTargetAtTime(0.0001, now, 0.1);
    } catch {
      /* context may already be closing */
    }
    const kill = () => {
      try {
        this.drone?.osc.stop();
      } catch { /* already stopped */ }
      for (const v of this.voices) {
        try { v.osc.stop(); v.osc2.stop(); } catch { /* already stopped */ }
      }
      try {
        this.brightness.disconnect();
        this.limiter.disconnect();
        this.master.disconnect();
      } catch { /* already disconnected */ }
    };
    setTimeout(kill, 250);
  }
}
