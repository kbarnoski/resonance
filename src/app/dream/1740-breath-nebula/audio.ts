// ─────────────────────────────────────────────────────────────────────────────
// 1740-breath-nebula — cosmic-ambient audio.
//
// Deliberately NOT a static consonant just-intonation wash. The bed is a soft
// evolving pad built from inharmonic partials in detuned pairs (slow beating +
// shimmer), a filtered-noise "wind" that rises on inhale, and sparse bell pings
// on exhale. The whole thing is driven by the breath signal so it is alive, not
// a flat drone.
//
//   master graph:  [pad + wind + bells] → DynamicsCompressor → gain(0.15) → dest
//
// Determinism: no Math.random / Date in the update path. The noise buffer is
// filled once with a fixed-seed mulberry32 PRNG; bell pitches step through a
// fixed scale by an integer counter. ctx.currentTime is used only for Web Audio
// scheduling / ramps, which the brief allows.
// ─────────────────────────────────────────────────────────────────────────────

function makeMulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Inharmonic pad partials (ratios drift off the harmonic series → shimmer).
const PAD_PARTIALS = [1.0, 2.01, 3.03, 4.98, 6.02];
// Bell partials — Risset-ish inharmonic set for a struck-metal timbre.
const BELL_PARTIALS = [0.56, 1.0, 1.19, 1.71, 2.74, 3.0];
// Exhale bells walk this pentatonic-ish set (Hz), deterministically.
const BELL_SCALE = [220.0, 261.63, 329.63, 392.0, 493.88, 587.33];

const BASE_FREQ = 55.0; // A1

export class NebulaAudio {
  private ctx: AudioContext;
  private master: GainNode;
  private comp: DynamicsCompressorNode;
  private padGain: GainNode;
  private padFilter: BiquadFilterNode;
  private windGain: GainNode;
  private windFilter: BiquadFilterNode;
  private bellBus: GainNode;
  private padOscs: OscillatorNode[] = [];
  private detuneLfos: OscillatorNode[] = [];
  private noiseSrc: AudioBufferSourceNode | null = null;
  private started = false;
  private bellCooldown = 0;
  private bellIndex = 0;
  private prevVel = 0;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;

    this.master = ctx.createGain();
    this.master.gain.value = 0.0001;

    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -18;
    this.comp.knee.value = 24;
    this.comp.ratio.value = 3.2;
    this.comp.attack.value = 0.02;
    this.comp.release.value = 0.28;

    this.comp.connect(this.master);
    this.master.connect(ctx.destination);

    // ── Pad ────────────────────────────────────────────────────────────────
    this.padFilter = ctx.createBiquadFilter();
    this.padFilter.type = "lowpass";
    this.padFilter.frequency.value = 900;
    this.padFilter.Q.value = 0.5;

    this.padGain = ctx.createGain();
    this.padGain.gain.value = 0.0;
    this.padFilter.connect(this.padGain);
    this.padGain.connect(this.comp);

    for (const ratio of PAD_PARTIALS) {
      const freq = BASE_FREQ * ratio;
      // detuned pair → slow beating
      for (let s = 0; s < 2; s++) {
        const osc = ctx.createOscillator();
        osc.type = s === 0 ? "sine" : "triangle";
        osc.frequency.value = freq;
        osc.detune.value = s === 0 ? -5 : 5;

        // per-partial gentle detune LFO for evolving shimmer
        const lfo = ctx.createOscillator();
        lfo.type = "sine";
        lfo.frequency.value = 0.03 + ratio * 0.017;
        const lfoGain = ctx.createGain();
        lfoGain.gain.value = 3 + ratio; // cents of wobble
        lfo.connect(lfoGain);
        lfoGain.connect(osc.detune);

        const pg = ctx.createGain();
        // higher partials quieter
        pg.gain.value = 0.5 / (ratio * (s === 0 ? 1 : 1.6));
        osc.connect(pg);
        pg.connect(this.padFilter);

        this.padOscs.push(osc);
        this.detuneLfos.push(lfo);
      }
    }

    // ── Wind (filtered noise) ─────────────────────────────────────────────────
    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = "bandpass";
    this.windFilter.frequency.value = 500;
    this.windFilter.Q.value = 0.7;

    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0.0;
    this.windFilter.connect(this.windGain);
    this.windGain.connect(this.comp);

    // ── Bell bus ──────────────────────────────────────────────────────────────
    this.bellBus = ctx.createGain();
    this.bellBus.gain.value = 0.9;
    this.bellBus.connect(this.comp);
  }

  private makeNoiseBuffer(): AudioBuffer {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * 2);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    const rnd = makeMulberry32(0x1234abcd);
    for (let i = 0; i < len; i++) data[i] = rnd() * 2 - 1;
    return buf;
  }

  /** Start the pad + wind and fade the master in. Call from the Begin gesture. */
  start(): void {
    if (this.started) return;
    this.started = true;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    const noise = ctx.createBufferSource();
    noise.buffer = this.makeNoiseBuffer();
    noise.loop = true;
    noise.connect(this.windFilter);
    noise.start();
    this.noiseSrc = noise;

    for (const osc of this.padOscs) osc.start();
    for (const lfo of this.detuneLfos) lfo.start();

    // exponential-ish fade in
    this.padGain.gain.setValueAtTime(0.0001, now);
    this.padGain.gain.linearRampToValueAtTime(0.5, now + 3.0);
    this.master.gain.setValueAtTime(0.0001, now);
    this.master.gain.exponentialRampToValueAtTime(0.15, now + 2.5);
  }

  /** Per-frame update. dt is the fixed timestep (1/60); breathAmp 0..1;
   *  breathVel is the signed breath derivative (>0 inhale, <0 exhale). */
  step(dt: number, breathAmp: number, breathVel: number): void {
    if (!this.started) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    // Wind swells with inhale amplitude + rising motion; filter opens up too.
    const windTarget = Math.min(0.5, breathAmp * 0.4 + Math.max(0, breathVel) * 6.0);
    this.windGain.gain.setTargetAtTime(windTarget, now, 0.15);
    this.windFilter.frequency.setTargetAtTime(400 + breathAmp * 1600, now, 0.2);

    // Pad brightens with breath (filter cutoff follows amplitude).
    this.padFilter.frequency.setTargetAtTime(600 + breathAmp * 1400, now, 0.3);
    this.padGain.gain.setTargetAtTime(0.32 + breathAmp * 0.28, now, 0.4);

    // Sparse bell on exhale onset (breath turns from rising to falling).
    this.bellCooldown -= dt;
    const exhaleOnset = this.prevVel > 0.001 && breathVel < -0.0015;
    if (exhaleOnset && this.bellCooldown <= 0) {
      this.strikeBell(now);
      this.bellCooldown = 1.8; // seconds
    }
    this.prevVel = breathVel;
  }

  private strikeBell(now: number): void {
    const ctx = this.ctx;
    const fund = BELL_SCALE[this.bellIndex % BELL_SCALE.length];
    this.bellIndex += 1;

    const voice = ctx.createGain();
    voice.gain.value = 0.0;
    voice.connect(this.bellBus);

    const peak = 0.16;
    voice.gain.setValueAtTime(0.0001, now);
    voice.gain.linearRampToValueAtTime(peak, now + 0.008);
    voice.gain.exponentialRampToValueAtTime(0.0001, now + 3.2);

    for (let i = 0; i < BELL_PARTIALS.length; i++) {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = fund * BELL_PARTIALS[i];
      const pg = ctx.createGain();
      pg.gain.value = 0.7 / (i + 1);
      osc.connect(pg);
      pg.connect(voice);
      osc.start(now);
      osc.stop(now + 3.4);
    }
  }

  stop(): void {
    const now = this.ctx.currentTime;
    try {
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setTargetAtTime(0.0001, now, 0.15);
    } catch {
      /* ctx may be closing */
    }
    const stopAt = now + 0.4;
    for (const osc of this.padOscs) {
      try { osc.stop(stopAt); } catch { /* already stopped */ }
    }
    for (const lfo of this.detuneLfos) {
      try { lfo.stop(stopAt); } catch { /* already stopped */ }
    }
    try { this.noiseSrc?.stop(stopAt); } catch { /* already stopped */ }
  }
}
