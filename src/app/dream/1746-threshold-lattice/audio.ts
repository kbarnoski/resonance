// ─────────────────────────────────────────────────────────────────────────────
// 1746-threshold-lattice — hypnagogic audio bed.
//
// The calm dream pole, not the grit pole: a deliberately soft, warm, consonant
// bed that DARKENS and softens as `depth` rises (the sleeper sinking), with
// sparse gentle bells and low startle "thuds" fired by the myoclonic-jerk state
// machine in page.tsx.
//
//   master graph:  [pad + noise + bells + thuds] → DynamicsCompressor
//                    → gain(0.12) → destination
//
// Determinism: NO Math.random / Date in any decision path. The noise buffer is
// filled once from a fixed-seed mulberry32 PRNG; bell timing is decided from the
// integer frame counter passed into step(); bell pitch walks a fixed scale by an
// integer index. ctx.currentTime is used ONLY for Web-Audio scheduling / ramps,
// which the brief allows. So the piece self-demos from a deterministic schedule
// even with no mic and no speakers.
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

// Warm consonant pad — low harmonic partials (a hypnagogic drone, calm pole).
const PAD_PARTIALS = [1.0, 1.5, 2.0, 3.0]; // just-intonation-ish, deliberately soft
// Bell partials — Risset-ish inharmonic struck-metal set.
const BELL_PARTIALS = [0.56, 1.0, 1.19, 1.71, 2.74];
// Bells walk this low pentatonic set (Hz), deterministically.
const BELL_SCALE = [174.61, 196.0, 233.08, 261.63, 293.66];

const BASE_FREQ = 43.65; // ~F1 — a low, warm fundamental

export class ThresholdAudio {
  private ctx: AudioContext;
  private master: GainNode;
  private comp: DynamicsCompressorNode;
  private padGain: GainNode;
  private padFilter: BiquadFilterNode;
  private noiseGain: GainNode;
  private noiseFilter: BiquadFilterNode;
  private bellBus: GainNode;
  private thudBus: GainNode;
  private padOscs: OscillatorNode[] = [];
  private detuneLfos: OscillatorNode[] = [];
  private noiseSrc: AudioBufferSourceNode | null = null;
  private started = false;
  private muted = false;

  // deterministic bell scheduler (integer-frame driven)
  private prng = makeMulberry32(0x51ec7a11);
  private nextBellFrame = 90;
  private bellIndex = 0;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;

    this.master = ctx.createGain();
    this.master.gain.value = 0.0001;

    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -20;
    this.comp.knee.value = 26;
    this.comp.ratio.value = 3.5;
    this.comp.attack.value = 0.03;
    this.comp.release.value = 0.35;

    this.comp.connect(this.master);
    this.master.connect(ctx.destination);

    // ── warm pad ──────────────────────────────────────────────────────────────
    this.padFilter = ctx.createBiquadFilter();
    this.padFilter.type = "lowpass";
    this.padFilter.frequency.value = 700;
    this.padFilter.Q.value = 0.4;
    this.padGain = ctx.createGain();
    this.padGain.gain.value = 0.0;
    this.padFilter.connect(this.padGain);
    this.padGain.connect(this.comp);

    for (const ratio of PAD_PARTIALS) {
      const freq = BASE_FREQ * ratio;
      for (let s = 0; s < 2; s++) {
        const osc = ctx.createOscillator();
        osc.type = s === 0 ? "sine" : "triangle";
        osc.frequency.value = freq;
        osc.detune.value = s === 0 ? -4 : 4; // slow beating
        const lfo = ctx.createOscillator();
        lfo.type = "sine";
        lfo.frequency.value = 0.02 + ratio * 0.011;
        const lfoGain = ctx.createGain();
        lfoGain.gain.value = 2 + ratio;
        lfo.connect(lfoGain);
        lfoGain.connect(osc.detune);
        const pg = ctx.createGain();
        pg.gain.value = 0.5 / (ratio * (s === 0 ? 1 : 1.7));
        osc.connect(pg);
        pg.connect(this.padFilter);
        this.padOscs.push(osc);
        this.detuneLfos.push(lfo);
      }
    }

    // ── dark noise wash (soft, filtered) ───────────────────────────────────────
    this.noiseFilter = ctx.createBiquadFilter();
    this.noiseFilter.type = "lowpass";
    this.noiseFilter.frequency.value = 600;
    this.noiseFilter.Q.value = 0.3;
    this.noiseGain = ctx.createGain();
    this.noiseGain.gain.value = 0.0;
    this.noiseFilter.connect(this.noiseGain);
    this.noiseGain.connect(this.comp);

    // ── bell + thud buses ──────────────────────────────────────────────────────
    this.bellBus = ctx.createGain();
    this.bellBus.gain.value = 0.8;
    this.bellBus.connect(this.comp);

    this.thudBus = ctx.createGain();
    this.thudBus.gain.value = 0.9;
    this.thudBus.connect(this.comp);
  }

  private makeNoiseBuffer(): AudioBuffer {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * 2);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    const rnd = makeMulberry32(0x9e3779b9);
    for (let i = 0; i < len; i++) data[i] = rnd() * 2 - 1;
    return buf;
  }

  /** Start pad + noise and fade the master in. Call from the Enter gesture. */
  start(): void {
    if (this.started) return;
    this.started = true;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    const noise = ctx.createBufferSource();
    noise.buffer = this.makeNoiseBuffer();
    noise.loop = true;
    noise.connect(this.noiseFilter);
    noise.start();
    this.noiseSrc = noise;

    for (const osc of this.padOscs) osc.start();
    for (const lfo of this.detuneLfos) lfo.start();

    this.padGain.gain.setValueAtTime(0.0001, now);
    this.padGain.gain.linearRampToValueAtTime(0.5, now + 4.0);
    this.master.gain.setValueAtTime(0.0001, now);
    this.master.gain.exponentialRampToValueAtTime(this.muted ? 0.0001 : 0.12, now + 3.0);
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (!this.started) return;
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setTargetAtTime(m ? 0.0001 : 0.12, now, 0.2);
  }

  /**
   * Per-frame update. `frame` is the integer frame counter; `depth` 0..1 is the
   * descent state; `still` 0..1 is the fast stillness channel. All timing
   * decisions come from `frame`, so the schedule is deterministic and headless.
   */
  step(frame: number, depth: number, still: number): void {
    if (!this.started) return;
    const now = this.ctx.currentTime;

    // Pad warms & darkens as depth rises: cutoff drops, level lifts gently.
    const padCut = 720 - depth * 360;             // 720 → 360 Hz (softer/warmer)
    this.padFilter.frequency.setTargetAtTime(padCut, now, 0.5);
    this.padGain.gain.setTargetAtTime(0.32 + depth * 0.22, now, 0.6);

    // Noise wash swells slightly with stillness, but stays dark and low.
    const noiseCut = 520 - depth * 260;
    this.noiseFilter.frequency.setTargetAtTime(noiseCut, now, 0.5);
    this.noiseGain.gain.setTargetAtTime(0.03 + still * 0.05, now, 0.4);

    // Sparse bells, decided purely from the integer frame counter. They grow
    // a little more frequent as depth rises (more imagery near the threshold).
    if (frame >= this.nextBellFrame) {
      if (depth > 0.12) this.strikeBell(now, depth);
      // interval 4.5 s (shallow) → 2.5 s (deep), with deterministic jitter.
      const baseSec = 4.5 - depth * 2.0;
      const jitter = (this.prng() - 0.5) * 1.6;
      this.nextBellFrame = frame + Math.max(60, Math.round((baseSec + jitter) * 60));
    }
  }

  private strikeBell(now: number, depth: number): void {
    const ctx = this.ctx;
    const fund = BELL_SCALE[this.bellIndex % BELL_SCALE.length];
    this.bellIndex += 1;

    const voice = ctx.createGain();
    voice.gain.value = 0.0;
    voice.connect(this.bellBus);

    const peak = 0.09 + depth * 0.05;
    voice.gain.setValueAtTime(0.0001, now);
    voice.gain.linearRampToValueAtTime(peak, now + 0.01);
    voice.gain.exponentialRampToValueAtTime(0.0001, now + 3.4);

    for (let i = 0; i < BELL_PARTIALS.length; i++) {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = fund * BELL_PARTIALS[i];
      const pg = ctx.createGain();
      pg.gain.value = 0.6 / (i + 1);
      osc.connect(pg);
      pg.connect(voice);
      osc.start(now);
      osc.stop(now + 3.6);
    }
  }

  /** A soft low startle "thud" — fired by the myoclonic-jerk state machine. */
  thud(strength: number): void {
    if (!this.started) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    const voice = ctx.createGain();
    voice.gain.value = 0.0;
    voice.connect(this.thudBus);

    const osc = ctx.createOscillator();
    osc.type = "sine";
    const f0 = 92.0 * (0.9 + strength * 0.3);
    osc.frequency.setValueAtTime(f0, now);
    osc.frequency.exponentialRampToValueAtTime(38.0, now + 0.35); // pitch drop = "body"

    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 220;

    const peak = 0.10 + strength * 0.10;
    voice.gain.setValueAtTime(0.0001, now);
    voice.gain.linearRampToValueAtTime(peak, now + 0.012);
    voice.gain.exponentialRampToValueAtTime(0.0001, now + 0.6);

    osc.connect(lp);
    lp.connect(voice);
    osc.start(now);
    osc.stop(now + 0.7);
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
