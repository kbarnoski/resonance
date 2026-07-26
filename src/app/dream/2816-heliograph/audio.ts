// ─────────────────────────────────────────────────────────────────────────────
// 2816-heliograph — the drone engine (real Web Audio, no stubs).
//
// A slow cosmic-ambient drone whose FOUR channels each map a distinct piece of
// space weather:
//   • solar-wind speed  → base pitch (continuous log glide, never quantized)
//   • Bt (total field)  → harmonic richness / brightness of the upper partials
//   • Bz (southward)    → consonance↔roughness: detune + inharmonicity + noise
//   • Kp (activity)     → slow shimmer swells and sparse "substorm" bell events
//
// Signal path: [partials + noise + bells] → compressor → master(0.15) → out.
// All randomness comes from a caller-supplied mulberry32 stream.
// ─────────────────────────────────────────────────────────────────────────────

import type { DerivedParams } from "./noaa";

// Partials rendered above the fundamental. Higher partials are gated by Bt so
// a weak field sounds dark/soft and a strong field sounds rich/present.
const PARTIALS = [1, 2, 3, 4, 5, 6, 8];
const GLIDE = 1.6; // setTargetAtTime time-constant, s — smooth cosmic glide
const MASTER = 0.15;

interface Partial {
  oscA: OscillatorNode; // in-tune voice
  oscB: OscillatorNode; // detuned twin → beating when Bz turns stormy
  gain: GainNode;
  ratio: number;
}

export class HeliographAudio {
  private ctx: AudioContext;
  private master: GainNode;
  private comp: DynamicsCompressorNode;
  private partials: Partial[] = [];
  private noiseGain: GainNode;
  private noiseFilter: BiquadFilterNode;
  private shimmerLfo: OscillatorNode;
  private shimmerDepth: GainNode;
  private rng: () => number;
  private lastBell = 0; // audio-clock time of last bell event
  private started = false;

  constructor(rng: () => number) {
    this.rng = rng;
    const Ctor: typeof AudioContext =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    this.ctx = new Ctor();
    const now = this.ctx.currentTime;

    this.master = this.ctx.createGain();
    this.master.gain.value = 0.0001; // fade in on start()
    this.comp = this.ctx.createDynamicsCompressor();
    this.comp.threshold.value = -22;
    this.comp.knee.value = 26;
    this.comp.ratio.value = 3.5;
    this.comp.attack.value = 0.02;
    this.comp.release.value = 0.4;
    this.comp.connect(this.master);
    this.master.connect(this.ctx.destination);

    // Fundamental + harmonic partials, each a detunable twin-oscillator pair.
    for (const ratio of PARTIALS) {
      const gain = this.ctx.createGain();
      gain.gain.value = 0.0001;
      gain.connect(this.comp);
      const oscA = this.ctx.createOscillator();
      const oscB = this.ctx.createOscillator();
      oscA.type = "sine";
      oscB.type = "sine";
      oscA.connect(gain);
      oscB.connect(gain);
      oscA.start(now);
      oscB.start(now);
      this.partials.push({ oscA, oscB, gain, ratio });
    }

    // Noise bed — a band of "solar hiss" that rises with southward Bz.
    const noiseBuf = this.ctx.createBuffer(
      1,
      this.ctx.sampleRate * 2,
      this.ctx.sampleRate,
    );
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = this.rng() * 2 - 1;
    const noiseSrc = this.ctx.createBufferSource();
    noiseSrc.buffer = noiseBuf;
    noiseSrc.loop = true;
    this.noiseFilter = this.ctx.createBiquadFilter();
    this.noiseFilter.type = "bandpass";
    this.noiseFilter.frequency.value = 220;
    this.noiseFilter.Q.value = 0.7;
    this.noiseGain = this.ctx.createGain();
    this.noiseGain.gain.value = 0.0001;
    noiseSrc.connect(this.noiseFilter);
    this.noiseFilter.connect(this.noiseGain);
    this.noiseGain.connect(this.comp);
    noiseSrc.start(now);

    // Slow shimmer LFO → amplitude swells whose depth tracks Kp.
    this.shimmerLfo = this.ctx.createOscillator();
    this.shimmerLfo.type = "sine";
    this.shimmerLfo.frequency.value = 0.08; // < 3 Hz, well below any flicker
    this.shimmerDepth = this.ctx.createGain();
    this.shimmerDepth.gain.value = 0;
    this.shimmerLfo.connect(this.shimmerDepth);
    // Shimmer modulates the two highest partials only (keeps the bed steady).
    this.shimmerDepth.connect(this.partials[this.partials.length - 1].gain.gain);
    this.shimmerDepth.connect(this.partials[this.partials.length - 2].gain.gain);
    this.shimmerLfo.start(now);
  }

  /** Unlock audio on a user gesture and fade the drone in. */
  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    if (this.ctx.state === "suspended") await this.ctx.resume();
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setTargetAtTime(MASTER, now, 2.0);
  }

  get running(): boolean {
    return this.started;
  }

  /**
   * Apply the current space-weather state. Everything glides via
   * setTargetAtTime so polls and simulator drift never click.
   */
  update(p: DerivedParams): void {
    if (!this.started) return;
    const now = this.ctx.currentTime;

    // Inharmonicity + beating both grow with Bz-tension. A calm (northward)
    // field keeps ratios integer and detune near zero → near-harmonic drone;
    // a stormy (southward) field bends partials off-integer and splits the
    // twin oscillators apart → audible beating roughness.
    const inharm = p.tension * 0.06; // fractional partial-ratio bend
    const detuneCents = p.tension * 55; // twin-oscillator split

    for (let i = 0; i < this.partials.length; i++) {
      const pt = this.partials[i];
      // Progressive off-integer stretch, stronger on higher partials.
      const bentRatio = pt.ratio * (1 + inharm * i * 0.5);
      const f = p.freq * bentRatio;
      pt.oscA.frequency.setTargetAtTime(f, now, GLIDE);
      pt.oscB.frequency.setTargetAtTime(f, now, GLIDE);
      pt.oscA.detune.setTargetAtTime(-detuneCents, now, GLIDE);
      pt.oscB.detune.setTargetAtTime(detuneCents, now, GLIDE);

      // Base amplitude falls with harmonic index; Bt (brightness) lifts the
      // upper partials so a strong field reads as rich and present.
      const rolloff = 1 / (1 + i * 1.05);
      const upperLift = i === 0 ? 1 : 0.35 + p.brightness * 0.9;
      const amp = 0.16 * rolloff * upperLift;
      pt.gain.gain.setTargetAtTime(amp, now, GLIDE);
    }

    // Noise bed follows the fundamental and swells with tension.
    this.noiseFilter.frequency.setTargetAtTime(p.freq * 3, now, GLIDE);
    this.noiseGain.gain.setTargetAtTime(0.11 * p.tension, now, GLIDE);

    // Shimmer depth (Kp) — slow amplitude swells on the top partials.
    this.shimmerDepth.gain.setTargetAtTime(0.05 * p.intensity, now, GLIDE);
    this.shimmerLfo.frequency.setTargetAtTime(
      0.05 + p.intensity * 0.12,
      now,
      GLIDE,
    );

    // Sparse "substorm" bells — density rises with Kp, kept ambient.
    // Mean interval sweeps from ~14 s (quiet) down to ~3.5 s (Kp 9).
    const meanInterval = 14 - p.intensity * 10.5;
    if (now - this.lastBell > meanInterval * (0.5 + this.rng())) {
      this.lastBell = now;
      this.ping(p, now);
    }
  }

  /** A soft bell partial, tuned to a harmonic of the current drone. */
  private ping(p: DerivedParams, now: number): void {
    const harmonics = [3, 4, 5, 6, 8, 10];
    const h = harmonics[Math.floor(this.rng() * harmonics.length)];
    const osc = this.ctx.createOscillator();
    osc.type = "sine";
    // Storm-detuned bells so even the sparkle sounds unsettled during a storm.
    osc.frequency.value = p.freq * h * (1 + p.tension * 0.04 * (this.rng() - 0.5));
    const g = this.ctx.createGain();
    const peak = 0.05 * (0.5 + p.intensity * 0.5);
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(peak, now + 0.4);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 4.5);
    osc.connect(g);
    g.connect(this.comp);
    osc.start(now);
    osc.stop(now + 5);
  }

  dispose(): void {
    try {
      const now = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setTargetAtTime(0.0001, now, 0.3);
      window.setTimeout(() => {
        this.ctx.close().catch(() => {});
      }, 500);
    } catch {
      this.ctx.close().catch(() => {});
    }
  }
}
