// ─────────────────────────────────────────────────────────────────────────────
// 1784-second-sight — audio bed for the hallucination machine.
//
//   Sight and sound share ONE dose and ONE salience field. At dose 0 the bed is
//   a calm, near-sine room-tone (harmonic partials, almost no detune). As the
//   reducing valve opens the same voices are pulled INHARMONIC and detuned into
//   a shimmering breakthrough drone, a high "shimmer" bus fades up, and the
//   master brightness filter opens with the salience DENSITY of the scene.
//
//   When a region "wakes up" (a salience cell crosses threshold) the page calls
//   wake() to strike a short iridescent tone — the sonic echo of a creature
//   growing into view.
//
//   Determinism: no Math.random / Date in any decision path. The one noise
//   buffer is filled from a fixed-seed PRNG; all event timing is decided on the
//   CPU from the integer frame counter. ctx.currentTime is used ONLY for
//   Web-Audio scheduling, which is allowed. The bed self-plays with no camera.
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

const BASE_FREQ = 55.0; // A1 — low, warm fundamental
// Harmonic (calm) partial ratios and their inharmonic (breakthrough) targets.
// As dose rises each partial slides from harmonic → detuned-inharmonic.
const PARTIALS: { calm: number; wild: number; gain: number }[] = [
  { calm: 1.0, wild: 1.0, gain: 0.5 },
  { calm: 2.0, wild: 2.14, gain: 0.32 },
  { calm: 3.0, wild: 3.37, gain: 0.22 },
  { calm: 4.0, wild: 4.62, gain: 0.16 },
  { calm: 5.0, wild: 5.83, gain: 0.11 },
];
// short-tone pitch set (Hz) — a soft, slightly exotic scale
const WAKE_SCALE = [220.0, 261.63, 311.13, 349.23, 415.3, 523.25];

export class SecondSightAudio {
  private ctx: AudioContext;
  private master: GainNode;
  private comp: DynamicsCompressorNode;
  private bright: BiquadFilterNode;
  private padGain: GainNode;
  private shimmerBus: GainNode;
  private wakeBus: GainNode;
  private noiseGain: GainNode;
  private noiseFilter: BiquadFilterNode;
  private padOscs: OscillatorNode[] = [];
  private shimmerOscs: OscillatorNode[] = [];
  private noiseSrc: AudioBufferSourceNode | null = null;
  private started = false;
  private muted = false;
  private volume = 0.14;
  private wakeIndex = 0;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;

    this.master = ctx.createGain();
    this.master.gain.value = 0.0001;

    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -18;
    this.comp.knee.value = 24;
    this.comp.ratio.value = 3.5;
    this.comp.attack.value = 0.02;
    this.comp.release.value = 0.3;

    // master brightness — opens with salience density
    this.bright = ctx.createBiquadFilter();
    this.bright.type = "lowpass";
    this.bright.frequency.value = 700;
    this.bright.Q.value = 0.5;

    this.bright.connect(this.comp);
    this.comp.connect(this.master);
    this.master.connect(ctx.destination);

    // ── pad voices (each partial = two slightly detuned oscillators) ──────────
    this.padGain = ctx.createGain();
    this.padGain.gain.value = 0.0;
    this.padGain.connect(this.bright);
    for (const p of PARTIALS) {
      for (let s = 0; s < 2; s++) {
        const osc = ctx.createOscillator();
        osc.type = s === 0 ? "sine" : "triangle";
        osc.frequency.value = BASE_FREQ * p.calm;
        osc.detune.value = s === 0 ? -3 : 3;
        const g = ctx.createGain();
        g.gain.value = p.gain / (s === 0 ? 1 : 1.8);
        osc.connect(g);
        g.connect(this.padGain);
        this.padOscs.push(osc);
      }
    }

    // ── shimmer bus (high inharmonic partials, fades up with dose) ────────────
    this.shimmerBus = ctx.createGain();
    this.shimmerBus.gain.value = 0.0;
    this.shimmerBus.connect(this.bright);
    const shimRatios = [6.83, 8.41, 10.19, 12.74];
    for (const r of shimRatios) {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = BASE_FREQ * r;
      osc.detune.value = 5;
      const g = ctx.createGain();
      g.gain.value = 0.05 / (r * 0.15);
      osc.connect(g);
      g.connect(this.shimmerBus);
      this.shimmerOscs.push(osc);
    }

    // ── dark noise wash ───────────────────────────────────────────────────────
    this.noiseFilter = ctx.createBiquadFilter();
    this.noiseFilter.type = "bandpass";
    this.noiseFilter.frequency.value = 500;
    this.noiseFilter.Q.value = 0.6;
    this.noiseGain = ctx.createGain();
    this.noiseGain.gain.value = 0.0;
    this.noiseFilter.connect(this.noiseGain);
    this.noiseGain.connect(this.bright);

    // ── wake-tone bus ─────────────────────────────────────────────────────────
    this.wakeBus = ctx.createGain();
    this.wakeBus.gain.value = 0.8;
    this.wakeBus.connect(this.comp);
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
    for (const osc of this.shimmerOscs) osc.start();

    this.padGain.gain.setValueAtTime(0.0001, now);
    this.padGain.gain.linearRampToValueAtTime(0.5, now + 4.0);
    this.master.gain.setValueAtTime(0.0001, now);
    this.master.gain.exponentialRampToValueAtTime(
      this.muted ? 0.0001 : this.volume,
      now + 3.0,
    );
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (!this.started) return;
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setTargetAtTime(m ? 0.0001 : this.volume, now, 0.2);
  }

  setVolume(v: number): void {
    this.volume = Math.max(0.0001, Math.min(0.3, v));
    if (!this.started || this.muted) return;
    const now = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.volume, now, 0.1);
  }

  /**
   * Per-frame update. `dose` 0..1 opens the reducing valve; `density` 0..1 is
   * the mean salience of the scene → spectral brightness.
   */
  step(dose: number, density: number): void {
    if (!this.started) return;
    const now = this.ctx.currentTime;

    // partials slide harmonic → inharmonic, detune widens
    for (let i = 0; i < PARTIALS.length; i++) {
      const p = PARTIALS[i];
      const ratio = p.calm + (p.wild - p.calm) * dose;
      const freq = BASE_FREQ * ratio;
      const oscA = this.padOscs[i * 2];
      const oscB = this.padOscs[i * 2 + 1];
      oscA.frequency.setTargetAtTime(freq, now, 0.3);
      oscB.frequency.setTargetAtTime(freq, now, 0.3);
      const det = 3 + dose * 14;
      oscA.detune.setTargetAtTime(-det, now, 0.3);
      oscB.detune.setTargetAtTime(det, now, 0.3);
    }

    // brightness opens with salience density (and a little with dose)
    const cut = 480 + density * 2600 + dose * 900;
    this.bright.frequency.setTargetAtTime(cut, now, 0.25);

    // shimmer and noise fade up with dose / density
    this.shimmerBus.gain.setTargetAtTime(0.02 + dose * dose * 0.5, now, 0.4);
    this.noiseGain.gain.setTargetAtTime(0.015 + density * 0.05, now, 0.4);
    this.padGain.gain.setTargetAtTime(0.42 - dose * 0.1, now, 0.5);
  }

  /** Strike a short iridescent tone when a salience region wakes up. */
  wake(strength: number, dose: number): void {
    if (!this.started) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    const fund = WAKE_SCALE[this.wakeIndex % WAKE_SCALE.length];
    this.wakeIndex += 1;

    const voice = ctx.createGain();
    voice.gain.value = 0.0;
    voice.connect(this.wakeBus);

    const peak = 0.05 + strength * 0.06;
    voice.gain.setValueAtTime(0.0001, now);
    voice.gain.linearRampToValueAtTime(peak, now + 0.015);
    voice.gain.exponentialRampToValueAtTime(0.0001, now + 1.8 + dose);

    // inharmonic struck-metal partials, pulled wider with dose
    const partials = [1.0, 2.0 + dose * 0.4, 2.76 + dose * 0.6, 3.94];
    for (let i = 0; i < partials.length; i++) {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = fund * partials[i];
      const g = ctx.createGain();
      g.gain.value = 0.5 / (i + 1);
      osc.connect(g);
      g.connect(voice);
      osc.start(now);
      osc.stop(now + 2.2 + dose);
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
      try {
        osc.stop(stopAt);
      } catch {
        /* already stopped */
      }
    }
    for (const osc of this.shimmerOscs) {
      try {
        osc.stop(stopAt);
      } catch {
        /* already stopped */
      }
    }
    try {
      this.noiseSrc?.stop(stopAt);
    } catch {
      /* already stopped */
    }
  }
}
