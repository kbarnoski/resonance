// audio.ts — 2108-remap-field voice bank (Web Audio API).
//
// Each visible territory is a VOICE. A bank of N=20 sustained voices, each =
// two slightly detuned oscillators through a per-voice lowpass, panned by its
// territory's screen-x. Base pitches are drawn from a warm Lydian set (NOT a
// major/minor pentatonic) on a slowly drifting root.
//
// Coupling to the arc: as `coherence` drops, EVERY voice glides toward a common
// centre pitch and its filter converges → at the floor it is ONE boundless pad
// (unison-ish, blended). As coherence rises on the return, the voices
// re-differentiate to the NEW pitch set (re-rolled from the same integer that
// moved the visual seeds).
//
// Continuous drone only — NO struck/plucked/percussive events. Master chain
// ends in a DynamicsCompressor limiter. Full teardown on dispose().

import type { Seed } from "./arc";

const VOICE_COUNT = 20;
// Lydian scale degrees in semitones — warm, non-pentatonic.
const LYDIAN = [0, 2, 4, 6, 7, 9, 11];

function mulberry32(a: number): () => number {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function midiToFreq(m: number): number {
  return 440 * Math.pow(2, (m - 69) / 12);
}

function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}

interface Voice {
  oscA: OscillatorNode;
  oscB: OscillatorNode;
  filter: BiquadFilterNode;
  gain: GainNode;
  pan: StereoPannerNode;
  interval: number; // semitones above the drifting root
  ownCutoff: number; // Hz, this voice's coherent-state cutoff
}

export class VoiceBank {
  private ctx: AudioContext;
  private master: GainNode;
  private comp: DynamicsCompressorNode;
  private voices: Voice[] = [];
  private disposed = false;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;
    const now = ctx.currentTime;

    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.setValueAtTime(-14, now);
    this.comp.knee.setValueAtTime(24, now);
    this.comp.ratio.setValueAtTime(4, now);
    this.comp.attack.setValueAtTime(0.01, now);
    this.comp.release.setValueAtTime(0.28, now);

    this.master = ctx.createGain();
    this.master.gain.setValueAtTime(0.0001, now);
    this.master.connect(this.comp);
    this.comp.connect(ctx.destination);

    for (let i = 0; i < VOICE_COUNT; i++) {
      const oscA = ctx.createOscillator();
      const oscB = ctx.createOscillator();
      oscA.type = "sawtooth";
      oscB.type = "triangle";
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.Q.setValueAtTime(0.6, now);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.9 / VOICE_COUNT, now);
      const pan = ctx.createStereoPanner();

      oscA.connect(filter);
      oscB.connect(filter);
      filter.connect(gain);
      gain.connect(pan);
      pan.connect(this.master);

      oscA.start(now);
      oscB.start(now);

      this.voices.push({
        oscA,
        oscB,
        filter,
        gain,
        pan,
        interval: 0,
        ownCutoff: 900,
      });
    }

    // Fade the master in gently — no click, no sudden onset.
    this.master.gain.linearRampToValueAtTime(0.85, now + 2.2);
  }

  // Assign a new pitch set + panning. Called at start and again while the
  // field is at the floor (coherence≈0) so the pitch jump is inaudible — the
  // voices are already unison — and they glide OUT to the new map on return.
  setMap(mapSeed: number, seeds: Seed[]): void {
    if (this.disposed) return;
    const rng = mulberry32((Math.imul(mapSeed, 0x27d4eb2f) ^ 0xdeadbeef) >>> 0);
    for (let i = 0; i < this.voices.length; i++) {
      const v = this.voices[i];
      const degree = LYDIAN[Math.floor(rng() * LYDIAN.length)];
      const octave = Math.floor(rng() * 3); // 0..2 octaves up
      v.interval = degree + octave * 12;
      v.ownCutoff = 420 + rng() * 1500;
      const s = seeds[i % seeds.length];
      const px = clamp((s?.x ?? 0.5) * 2 - 1, -1, 1);
      v.pan.pan.setTargetAtTime(px, this.ctx.currentTime, 0.4);
    }
  }

  // Called every frame with the live coherence + a monotonic time (seconds).
  update(coherence: number, timeSec: number): void {
    if (this.disposed) return;
    const now = this.ctx.currentTime;
    const coh = clamp(coherence, 0, 1);
    const unison = Math.pow(1 - coh, 0.8); // 0 = differentiated, 1 = one pad

    // Root drifts very slowly (≈ full cycle over ~10 min) so the whole field
    // breathes tonally without ever landing on a fixed key.
    const root = 45 + 3 * Math.sin(timeSec * 0.011);
    const centre = root + 12;

    // Detune spread tightens toward unison at the floor.
    const detune = 7 * coh + 1.5;

    for (const v of this.voices) {
      const ownMidi = root + v.interval;
      const targetMidi = ownMidi + (centre - ownMidi) * unison;
      const f = midiToFreq(targetMidi);
      v.oscA.frequency.setTargetAtTime(f, now, 0.3);
      v.oscB.frequency.setTargetAtTime(f, now, 0.3);
      v.oscA.detune.setTargetAtTime(-detune, now, 0.3);
      v.oscB.detune.setTargetAtTime(detune, now, 0.3);
      // Filters converge to a common cutoff as coherence drops → merged timbre.
      const cutoff = v.ownCutoff + (1400 - v.ownCutoff) * unison;
      v.filter.frequency.setTargetAtTime(cutoff, now, 0.4);
    }
  }

  // Fade out over `fadeSec`, then stop every oscillator. The caller closes the
  // AudioContext after the tail. Returns the fade time so the caller can wait.
  dispose(fadeSec = 0.6): number {
    if (this.disposed) return 0;
    this.disposed = true;
    const now = this.ctx.currentTime;
    try {
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setValueAtTime(this.master.gain.value, now);
      this.master.gain.linearRampToValueAtTime(0.0001, now + fadeSec);
    } catch {
      /* context may already be closing */
    }
    for (const v of this.voices) {
      try {
        v.oscA.stop(now + fadeSec + 0.05);
        v.oscB.stop(now + fadeSec + 0.05);
      } catch {
        /* already stopped */
      }
    }
    return fadeSec + 0.1;
  }
}
