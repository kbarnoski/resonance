// 2304-seismic-choir — additive spatial synthesis engine.
//
// Each earthquake becomes ONE sustained voice in an additive choir. There is NO
// master 0->1 knob: the Earth's live multi-event stream IS the score. Mapping:
//   magnitude  -> loudness + fundamental pitch (bigger quake = deeper, louder)
//   depth (km) -> lowpass cutoff / timbre      (deeper = darker)
//   longitude  -> StereoPanner position         (spatial spread)
//   latitude   -> slight detune / harmonic tilt
// New voices fade in over ~1.5 s. The whole master path runs through a
// DynamicsCompressor limiter at low gain (<= 0.2) with a 1 s fade-in.
//
// Lineage: the IRIS "Seismic Sound Lab" / Ben Holtzman (LDEO) seismic
// sonification work — data-driven drone rather than metaphor.

import type { Quake } from "./data";

const MASTER_GAIN = 0.18; // <= 0.2
const ROOT = 55; // A1 — a felt foundation
// Just-intonation ratios over the root give the choir a consonant, cosmic bed.
const JI = [1, 9 / 8, 6 / 5, 4 / 3, 3 / 2, 5 / 3, 15 / 8, 2];

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

// Magnitude -> fundamental. Bigger quakes sit lower (more gravity); smaller
// ones ring higher. Snapped to a just-intonation degree for consonance.
function quakeFreq(mag: number): number {
  const degree = Math.abs(Math.round(mag * 1.6)) % JI.length;
  const ratio = JI[degree];
  let octave = 0;
  if (mag >= 5.5) octave = -1;
  else if (mag < 3) octave = 1;
  return ROOT * ratio * Math.pow(2, octave);
}

interface Voice {
  osc: OscillatorNode;
  partial: OscillatorNode; // slightly detuned upper partial for warmth
  partialGain: GainNode;
  lp: BiquadFilterNode;
  gain: GainNode;
  pan: StereoPannerNode;
  base: number; // baseline loudness target
}

export interface VoiceLevel {
  id: string;
  place: string;
  mag: number;
  level: number; // 0..1 relative to its own target
}

export class SeismicChoir {
  private ctx: AudioContext;
  private master: GainNode;
  private limiter: DynamicsCompressorNode;
  private drone: OscillatorNode | null = null;
  private droneGain: GainNode | null = null;
  private voices = new Map<string, Voice>();
  private soloId: string | null = null;

  constructor() {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    this.ctx = new Ctor();

    this.master = this.ctx.createGain();
    this.master.gain.value = 0; // fade in on start()

    // Brick-wall limiter so a dense seismic moment never clips.
    this.limiter = this.ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -6;
    this.limiter.knee.value = 4;
    this.limiter.ratio.value = 20;
    this.limiter.attack.value = 0.003;
    this.limiter.release.value = 0.25;

    // Procedural convolver reverb for cosmic-ambient depth.
    const conv = this.ctx.createConvolver();
    conv.buffer = this.makeImpulse(3.6, 2.6);
    const wet = this.ctx.createGain();
    wet.gain.value = 0.55;
    const dry = this.ctx.createGain();
    dry.gain.value = 0.85;

    this.master.connect(dry).connect(this.limiter);
    this.master.connect(conv).connect(wet).connect(this.limiter);
    this.limiter.connect(this.ctx.destination);

    this.startDrone();
  }

  private makeImpulse(seconds: number, decay: number): AudioBuffer {
    const rate = this.ctx.sampleRate;
    const len = Math.floor(rate * seconds);
    const buf = this.ctx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const data = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
      }
    }
    return buf;
  }

  // A near-subsonic bed so the planet is never fully silent between events.
  private startDrone() {
    const osc = this.ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = ROOT / 2;
    const g = this.ctx.createGain();
    g.gain.value = 0.06;
    osc.connect(g).connect(this.master);
    osc.start();
    this.drone = osc;
    this.droneGain = g;
  }

  /** Resume the context and fade the master in over ~1 s. Call on user gesture. */
  async start(): Promise<void> {
    if (this.ctx.state === "suspended") await this.ctx.resume();
    this.master.gain.cancelScheduledValues(this.ctx.currentTime);
    this.master.gain.setValueAtTime(this.master.gain.value, this.ctx.currentTime);
    this.master.gain.linearRampToValueAtTime(
      MASTER_GAIN,
      this.ctx.currentTime + 1
    );
  }

  get state(): AudioContextState {
    return this.ctx.state;
  }

  private makeVoice(q: Quake): Voice {
    const freq = quakeFreq(q.mag);
    // Latitude tilts detune: poleward quakes are pushed a few cents sharp.
    const latDetune = (q.lat / 90) * 9; // +/- 9 cents

    const osc = this.ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.value = freq;
    osc.detune.value = latDetune;

    const partial = this.ctx.createOscillator();
    partial.type = "sine";
    partial.frequency.value = freq * 2;
    partial.detune.value = latDetune + 4;
    const partialGain = this.ctx.createGain();
    // Higher-latitude quakes get a touch more upper harmonic shimmer.
    partialGain.gain.value = 0.12 + Math.abs(q.lat / 90) * 0.18;

    const lp = this.ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.Q.value = 0.8;
    // Deeper quakes are darker: ~3.2 kHz at the surface -> 500 Hz floor deep.
    lp.frequency.value = clamp(3200 - q.depthKm * 5, 500, 3400);

    const gain = this.ctx.createGain();
    gain.gain.value = 0;

    const pan = this.ctx.createStereoPanner();
    pan.pan.value = clamp(q.lon / 180, -1, 1);

    osc.connect(lp);
    partial.connect(partialGain).connect(lp);
    lp.connect(gain).connect(pan).connect(this.master);

    osc.start();
    partial.start();

    // Loudness from magnitude; slow ~1.5 s fade-in.
    const base = clamp(0.03 + (q.mag - 1.5) * 0.028, 0.02, 0.2);
    gain.gain.setTargetAtTime(base, this.ctx.currentTime, 0.6);

    return { osc, partial, partialGain, lp, gain, pan, base };
  }

  /** Reconcile the sounding voices with the desired quake set. */
  update(quakes: Quake[]) {
    const wanted = new Set(quakes.map((q) => q.id));

    for (const [id, v] of this.voices) {
      if (!wanted.has(id)) {
        v.gain.gain.cancelScheduledValues(this.ctx.currentTime);
        v.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 1.0);
        const stopAt = this.ctx.currentTime + 4;
        try {
          v.osc.stop(stopAt);
          v.partial.stop(stopAt);
        } catch {
          /* already scheduled */
        }
        this.voices.delete(id);
      }
    }

    for (const q of quakes) {
      if (!this.voices.has(q.id)) this.voices.set(q.id, this.makeVoice(q));
    }
    this.applyMix();
  }

  /** Foreground one quake's voice (duck the rest); null clears the solo. */
  setSolo(id: string | null) {
    this.soloId = id && this.voices.has(id) ? id : null;
    this.applyMix();
  }

  get solo(): string | null {
    return this.soloId;
  }

  private applyMix() {
    const now = this.ctx.currentTime;
    for (const [id, v] of this.voices) {
      let target = v.base;
      if (this.soloId) {
        target = id === this.soloId ? Math.min(v.base * 2.2, 0.24) : v.base * 0.18;
      }
      v.gain.gain.setTargetAtTime(target, now, 0.5);
    }
    // Pull the ambient bed down a touch while soloing so the voice reads clearly.
    if (this.droneGain) {
      this.droneGain.gain.setTargetAtTime(this.soloId ? 0.02 : 0.06, now, 0.5);
    }
  }

  /** Per-voice loudness for the visual, ordered loudest-magnitude first. */
  levels(quakes: Quake[]): VoiceLevel[] {
    return quakes
      .map((q) => {
        const v = this.voices.get(q.id);
        return {
          id: q.id,
          place: q.place,
          mag: q.mag,
          level: v ? clamp(v.gain.gain.value / Math.max(v.base, 0.001), 0, 1) : 0,
        };
      })
      .sort((a, b) => b.mag - a.mag);
  }

  dispose() {
    const now = this.ctx.currentTime;
    for (const [, v] of this.voices) {
      try {
        v.osc.stop(now);
        v.partial.stop(now);
      } catch {
        /* noop */
      }
    }
    this.voices.clear();
    try {
      this.drone?.stop(now);
    } catch {
      /* noop */
    }
    void this.ctx.close();
  }
}
