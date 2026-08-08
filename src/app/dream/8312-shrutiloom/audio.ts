// ── The coupled drone loom (Web Audio) ────────────────────────────────────────
// Every committed string is an additive, tanpura-like plucked drone voice that
// rings and decays over tens of seconds. Voices are woven into a coupling graph
// (weights from loom.ts): each frame, a loud string leaks energy into its
// JI-consonant neighbours, so older strings physically swell and shimmer when
// you add or re-sing a consonant one — audible sympathetic resonance, not a
// static drone stack.

import { couplingWeight, mulberry32 } from "./loom";

/** Tanpura-ish partial mix with a touch of jawari buzz in the upper partials. */
const PARTIALS: ReadonlyArray<{ mult: number; gain: number; detune: number }> =
  [
    { mult: 1, gain: 1.0, detune: 0 },
    { mult: 2, gain: 0.55, detune: 1.5 },
    { mult: 3, gain: 0.7, detune: -2 }, // jawari lifts the 3rd/4th partials
    { mult: 4, gain: 0.5, detune: 3 },
    { mult: 5, gain: 0.28, detune: -3.5 },
    { mult: 6, gain: 0.18, detune: 4 },
  ];

const DECAY_TAU = 24; // seconds — natural drone decay unless refreshed
const COUPLE_RATE = 0.9; // how fast consonant neighbours draw energy
const MAX_ENERGY = 1.35;
const MAX_VOICES = 14;

interface Voice {
  id: number;
  freq: number;
  /** JS-side energy scalar 0..MAX_ENERGY; drives the voice gain. */
  energy: number;
  /** Slow shimmer LFO phase (radians). */
  lfo: number;
  lfoRate: number;
  gain: GainNode;
  oscs: OscillatorNode[];
}

export interface StringState {
  id: number;
  freq: number;
  energy: number;
}

export class LoomAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private voices: Voice[] = [];
  private weights = new Map<string, number>();
  private nextId = 0;
  private rng = mulberry32(0x8312);

  /** Create/resume the AudioContext. Safe to call repeatedly. */
  async start(): Promise<void> {
    if (!this.ctx) {
      const Ctx: typeof AudioContext =
        window.AudioContext ||
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (window as any).webkitAudioContext;
      const ctx = new Ctx();
      this.ctx = ctx;

      const master = ctx.createGain();
      master.gain.value = 0.0001;
      master.gain.setTargetAtTime(0.5, ctx.currentTime, 1.5);

      // Gentle low-pass to keep the drone warm, then a synthesized reverb tail
      // for a reverent, room-filling Dream House quality.
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 3200;
      lp.Q.value = 0.4;

      const conv = ctx.createConvolver();
      conv.buffer = this.makeReverbIR(ctx);
      const wet = ctx.createGain();
      wet.gain.value = 0.55;
      const dry = ctx.createGain();
      dry.gain.value = 0.75;

      master.connect(lp);
      lp.connect(dry);
      lp.connect(conv);
      conv.connect(wet);
      dry.connect(ctx.destination);
      wet.connect(ctx.destination);

      this.master = master;
    }
    if (this.ctx.state === "suspended") {
      try {
        await this.ctx.resume();
      } catch {
        /* ignore — will retry on next gesture */
      }
    }
  }

  get running(): boolean {
    return this.ctx !== null && this.ctx.state === "running";
  }

  /** The live AudioContext (created by start()), for wiring a mic analyser. */
  get audioContext(): AudioContext | null {
    return this.ctx;
  }

  /** Deterministic exponentially-decaying noise impulse response. */
  private makeReverbIR(ctx: AudioContext): AudioBuffer {
    const dur = 3.2;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        const t = i / len;
        const env = Math.pow(1 - t, 2.6);
        data[i] = (this.rng() * 2 - 1) * env;
      }
    }
    return buf;
  }

  private key(a: number, b: number): string {
    return a < b ? `${a}:${b}` : `${b}:${a}`;
  }

  /** Commit a new string at `freq` and pluck it. Returns its voice id, or the
   *  id of the existing near-unison voice (which gets re-excited instead). */
  addString(freq: number): number {
    const ctx = this.ctx;
    if (!ctx || !this.master) return -1;

    // Re-singing an existing string refreshes it rather than duplicating.
    const existing = this.voices.find(
      (v) => Math.abs(1200 * Math.log2(v.freq / freq)) < 8,
    );
    if (existing) {
      this.excite(freq, 1);
      return existing.id;
    }

    // Evict the quietest voice if we are at capacity.
    if (this.voices.length >= MAX_VOICES) {
      let qi = 0;
      for (let i = 1; i < this.voices.length; i++) {
        if (this.voices[i].energy < this.voices[qi].energy) qi = i;
      }
      this.removeVoice(qi);
    }

    const gain = ctx.createGain();
    gain.gain.value = 0.0001;
    gain.connect(this.master);

    const oscs: OscillatorNode[] = [];
    const now = ctx.currentTime;
    for (const p of PARTIALS) {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = freq * p.mult;
      osc.detune.value = p.detune;
      const pg = ctx.createGain();
      // Normalize partial gains against the summed partial energy.
      pg.gain.value = (p.gain / 3.1) * 0.9;
      osc.connect(pg);
      pg.connect(gain);
      osc.start(now);
      oscs.push(osc);
    }

    const voice: Voice = {
      id: this.nextId++,
      freq,
      energy: 1.0, // pluck impulse
      lfo: this.rng() * Math.PI * 2,
      lfoRate: 0.06 + this.rng() * 0.09,
      gain,
      oscs,
    };

    // Precompute coupling weights against existing voices, and inject the
    // pluck's sympathetic swell into consonant neighbours right away.
    for (const other of this.voices) {
      const w = couplingWeight(voice.freq, other.freq);
      this.weights.set(this.key(voice.id, other.id), w);
      other.energy = Math.min(MAX_ENERGY, other.energy + w * 0.7);
    }
    this.voices.push(voice);
    return voice.id;
  }

  /** Inject energy into the string nearest `freq` (singing near it, or an
   *  external excitation). Also splashes into its consonant neighbours. */
  excite(freq: number, strength: number): void {
    if (this.voices.length === 0) return;
    let nearest = this.voices[0];
    let best = Infinity;
    for (const v of this.voices) {
      const d = Math.abs(1200 * Math.log2(v.freq / freq));
      if (d < best) {
        best = d;
        nearest = v;
      }
    }
    if (best > 45) return; // too far from any string to excite it
    nearest.energy = Math.min(MAX_ENERGY, nearest.energy + 0.5 * strength);
    for (const other of this.voices) {
      if (other === nearest) continue;
      const w = this.weightBetween(nearest.id, other.id, nearest.freq, other.freq);
      other.energy = Math.min(MAX_ENERGY, other.energy + w * 0.45 * strength);
    }
  }

  private weightBetween(
    ida: number,
    idb: number,
    fa: number,
    fb: number,
  ): number {
    const k = this.key(ida, idb);
    let w = this.weights.get(k);
    if (w === undefined) {
      w = couplingWeight(fa, fb);
      this.weights.set(k, w);
    }
    return w;
  }

  /** Advance the physical model by dt seconds: decay + sympathetic transfer,
   *  then push energies to the audio gains. Call every animation frame. */
  step(dt: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const d = Math.min(0.1, Math.max(0, dt));

    // Continuous sympathetic transfer: each loud string feeds its consonant
    // neighbours a little every frame (the ongoing jawari hum).
    const inject = new Float32Array(this.voices.length);
    for (let i = 0; i < this.voices.length; i++) {
      const a = this.voices[i];
      if (a.energy < 0.05) continue;
      for (let j = 0; j < this.voices.length; j++) {
        if (i === j) continue;
        const b = this.voices[j];
        const w = this.weightBetween(a.id, b.id, a.freq, b.freq);
        if (w <= 0.05) continue;
        // Transfer scales with the driver's energy and their consonance, and
        // with how much "headroom" the neighbour has (so it swells, not blows).
        const head = Math.max(0, 1 - b.energy);
        inject[j] += w * a.energy * head * COUPLE_RATE * d;
      }
    }

    const now = ctx.currentTime;
    for (let i = 0; i < this.voices.length; i++) {
      const v = this.voices[i];
      v.energy *= Math.exp(-d / DECAY_TAU);
      v.energy = Math.min(MAX_ENERGY, v.energy + inject[i]);
      v.lfo += v.lfoRate * d * Math.PI * 2;
      const shimmer = 1 + 0.12 * Math.sin(v.lfo);
      const target = Math.max(0.0001, v.energy * 0.5 * shimmer);
      v.gain.gain.setTargetAtTime(target, now, 0.08);
    }
  }

  private removeVoice(idx: number): void {
    const v = this.voices[idx];
    const ctx = this.ctx;
    if (ctx) {
      const now = ctx.currentTime;
      v.gain.gain.cancelScheduledValues(now);
      v.gain.gain.setTargetAtTime(0.0001, now, 0.3);
      for (const o of v.oscs) {
        try {
          o.stop(now + 1.2);
        } catch {
          /* already stopped */
        }
      }
    }
    // Drop any stored weights that reference this voice.
    for (const k of Array.from(this.weights.keys())) {
      if (k.startsWith(`${v.id}:`) || k.endsWith(`:${v.id}`)) {
        this.weights.delete(k);
      }
    }
    this.voices.splice(idx, 1);
  }

  /** Snapshot for the visual layer. */
  snapshot(): StringState[] {
    return this.voices.map((v) => ({
      id: v.id,
      freq: v.freq,
      energy: v.energy,
    }));
  }

  /** Coupling weight between two live voice ids (0 if either is gone). */
  weightOf(ida: number, idb: number): number {
    const a = this.voices.find((v) => v.id === ida);
    const b = this.voices.find((v) => v.id === idb);
    if (!a || !b) return 0;
    return this.weightBetween(a.id, b.id, a.freq, b.freq);
  }

  close(): void {
    for (let i = this.voices.length - 1; i >= 0; i--) {
      const v = this.voices[i];
      for (const o of v.oscs) {
        try {
          o.stop();
        } catch {
          /* ignore */
        }
        try {
          o.disconnect();
        } catch {
          /* ignore */
        }
      }
      try {
        v.gain.disconnect();
      } catch {
        /* ignore */
      }
    }
    this.voices = [];
    this.weights.clear();
    if (this.ctx) {
      const c = this.ctx;
      this.ctx = null;
      this.master = null;
      c.close().catch(() => {
        /* ignore */
      });
    }
  }
}
