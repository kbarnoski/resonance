// Wave-terrain audio engine.
//
// Every voice is an OscillatorNode driven by a shared PeriodicWave that is
// rebuilt from the current terrain+orbit. Pitch = note frequency; timbre =
// the terrain shape scanned by the orbit. Morphing rebuilds the wave with a
// short crossfade to avoid clicks.

import {
  Orbit,
  TerrainId,
  sampleWaveform,
  waveformToFourier,
} from "./terrain";

const WAVE_SAMPLES = 1024;
const HARMONICS = 256;

interface Voice {
  osc: OscillatorNode;
  gain: GainNode;
  freq: number;
  releasing: boolean;
}

export class TerrainSynth {
  ctx: AudioContext;
  private master: GainNode;
  private lowpass: BiquadFilterNode;
  private comp: DynamicsCompressorNode;
  private wave: PeriodicWave;
  private voices = new Map<string, Voice>();

  constructor() {
    this.ctx = new AudioContext();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.0;

    this.lowpass = this.ctx.createBiquadFilter();
    this.lowpass.type = "lowpass";
    this.lowpass.frequency.value = 8000;
    this.lowpass.Q.value = 0.4;

    this.comp = this.ctx.createDynamicsCompressor();
    this.comp.threshold.value = -18;
    this.comp.knee.value = 12;
    this.comp.ratio.value = 12;
    this.comp.attack.value = 0.003;
    this.comp.release.value = 0.25;

    this.master.connect(this.lowpass);
    this.lowpass.connect(this.comp);
    this.comp.connect(this.ctx.destination);

    // initial silent placeholder wave
    this.wave = this.buildWave("dunes", { radius: 0.6, lobes: 2, twist: 0.3, rot: 0 }, 0);

    // fade master in
    const now = this.ctx.currentTime;
    this.master.gain.setValueAtTime(0.0, now);
    this.master.gain.linearRampToValueAtTime(0.26, now + 0.4);
  }

  private buildWave(id: TerrainId, orb: Orbit, m: number): PeriodicWave {
    const samples = sampleWaveform(id, orb, m, WAVE_SAMPLES);
    const { real, imag } = waveformToFourier(samples, HARMONICS);
    return this.ctx.createPeriodicWave(real, imag, { disableNormalization: false });
  }

  // Rebuild the shared timbre and apply it to all live voices with a swap.
  setTerrain(id: TerrainId, orb: Orbit, m: number) {
    try {
      this.wave = this.buildWave(id, orb, m);
    } catch {
      return;
    }
    for (const v of this.voices.values()) {
      if (!v.releasing) v.osc.setPeriodicWave(this.wave);
    }
  }

  private amplitudeForCount(): number {
    const n = Math.max(1, this.voices.size);
    return 0.85 / Math.sqrt(n);
  }

  private rebalance() {
    const amp = this.amplitudeForCount();
    const now = this.ctx.currentTime;
    for (const v of this.voices.values()) {
      if (!v.releasing) v.gain.gain.setTargetAtTime(amp, now, 0.04);
    }
  }

  noteOn(key: string, freq: number, velocity = 1) {
    if (this.voices.has(key)) return;
    if (this.voices.size >= 6) {
      // steal the oldest
      const first = this.voices.keys().next().value;
      if (first) this.noteOff(first);
    }
    const osc = this.ctx.createOscillator();
    osc.setPeriodicWave(this.wave);
    osc.frequency.value = freq;
    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    osc.connect(gain);
    gain.connect(this.master);
    osc.start();
    const v: Voice = { osc, gain, freq, releasing: false };
    this.voices.set(key, v);
    const amp = this.amplitudeForCount() * (0.4 + 0.6 * velocity);
    const now = this.ctx.currentTime;
    gain.gain.cancelScheduledValues(now);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(amp, now + 0.015);
    this.rebalance();
  }

  noteOff(key: string) {
    const v = this.voices.get(key);
    if (!v) return;
    v.releasing = true;
    this.voices.delete(key);
    const now = this.ctx.currentTime;
    v.gain.gain.cancelScheduledValues(now);
    v.gain.gain.setTargetAtTime(0, now, 0.08);
    v.osc.stop(now + 0.6);
    v.osc.onended = () => {
      try {
        v.osc.disconnect();
        v.gain.disconnect();
      } catch {
        /* already gone */
      }
    };
    this.rebalance();
  }

  // Frequencies currently sounding, for the visualizer.
  activeFreqs(): number[] {
    return [...this.voices.values()].filter((v) => !v.releasing).map((v) => v.freq);
  }

  resume() {
    if (this.ctx.state === "suspended") void this.ctx.resume();
  }

  dispose() {
    for (const key of [...this.voices.keys()]) this.noteOff(key);
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setTargetAtTime(0, now, 0.05);
    setTimeout(() => {
      try {
        this.master.disconnect();
        this.lowpass.disconnect();
        this.comp.disconnect();
        void this.ctx.close();
      } catch {
        /* noop */
      }
    }, 300);
  }
}

// ── musical scale ──────────────────────────────────────────────────────────
// D Dorian across ~2 octaves (D E F G A B C, then up). Adult instrument.
const D_DORIAN_SEMITONES = [0, 2, 3, 5, 7, 9, 10]; // from D
const D3 = 146.832; // D3 base

export function scaleFreq(degree: number): number {
  // degree 0 == D3; wraps through the mode across octaves.
  const oct = Math.floor(degree / 7);
  const idx = ((degree % 7) + 7) % 7;
  const semis = D_DORIAN_SEMITONES[idx] + oct * 12;
  return D3 * Math.pow(2, semis / 12);
}

// Home-row + accidentals mapping → scale degree index.
// Lower row = lower octave, upper letters = higher.
export const KEY_TO_DEGREE: Record<string, number> = {
  a: 0,
  s: 1,
  d: 2,
  f: 3,
  g: 4,
  h: 5,
  j: 6,
  k: 7,
  l: 8,
  // upper row continues higher
  q: 7,
  w: 8,
  e: 9,
  r: 10,
  t: 11,
  y: 12,
  u: 13,
  i: 14,
  o: 15,
  p: 16,
};

export function midiToFreq(note: number): number {
  return 440 * Math.pow(2, (note - 69) / 12);
}
