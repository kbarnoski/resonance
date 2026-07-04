// ─────────────────────────────────────────────────────────────────────────────
// audio.ts — the "consciousness" synth. Its character tracks the Ising order
// parameter and temperature so you HEAR the phase transition:
//
//   • Below Tc (ordered / frozen): a single stable low drone. Low audio entropy.
//   • Near  Tc (critical bloom):   a bank of consonant detuned partials that
//     slowly reorganise, a 1/f-modulated shimmer, and sonified "avalanche"
//     events when a large spin cluster flips.
//   • Above Tc (overload):         noise pushes in and the partials detune wider
//     toward dissonance.
//
// Output only — no microphone. Everything runs through a DynamicsCompressor
// limiter to protect the listener. Gesture-gated: nothing sounds until start()
// is called from a user gesture.
// ─────────────────────────────────────────────────────────────────────────────

export interface SynthParams {
  /** 0..1 nearness to Tc (the critical bloom). */
  crit: number;
  /** 0..1 magnetization / order parameter (1 = frozen single domain). */
  order: number;
  /** 0..1 how far above Tc (overload / noise). */
  heat: number;
}

const PARTIAL_RATIOS = [1, 2, 3, 4, 5, 6, 8]; // harmonic series → consonant
const BASE_HZ = 96; // low root

export class IsingSynth {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private drone: OscillatorNode | null = null;
  private droneGain: GainNode | null = null;
  private partials: { osc: OscillatorNode; gain: GainNode; lfo: OscillatorNode; ratio: number }[] = [];
  private partialBus: GainNode | null = null;
  private noise: AudioBufferSourceNode | null = null;
  private noiseFilter: BiquadFilterNode | null = null;
  private noiseGain: GainNode | null = null;
  private started = false;

  get isRunning(): boolean {
    return this.started;
  }

  /** Must be called from a user gesture. Returns false if Web Audio is absent. */
  async start(): Promise<boolean> {
    if (this.started) return true;
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return false;
    const ctx = new Ctor();
    this.ctx = ctx;
    const now = ctx.currentTime;

    // master → limiter → destination
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -8;
    limiter.knee.value = 6;
    limiter.ratio.value = 12;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.25;
    limiter.connect(ctx.destination);

    const master = ctx.createGain();
    master.gain.setValueAtTime(0, now);
    master.gain.linearRampToValueAtTime(0.85, now + 1.2);
    master.connect(limiter);
    this.master = master;

    // low drone (always present; loud when ordered)
    const droneGain = ctx.createGain();
    droneGain.gain.value = 0.0001;
    const droneFilter = ctx.createBiquadFilter();
    droneFilter.type = "lowpass";
    droneFilter.frequency.value = 320;
    const drone = ctx.createOscillator();
    drone.type = "triangle";
    drone.frequency.value = BASE_HZ / 2; // sub-root
    drone.connect(droneFilter);
    droneFilter.connect(droneGain);
    droneGain.connect(master);
    drone.start();
    this.drone = drone;
    this.droneGain = droneGain;

    // consonant partial bank (loud near Tc), each slowly modulated → "reorganise"
    const partialBus = ctx.createGain();
    partialBus.gain.value = 0.0001;
    partialBus.connect(master);
    this.partialBus = partialBus;
    PARTIAL_RATIOS.forEach((ratio, i) => {
      const osc = ctx.createOscillator();
      osc.type = i < 3 ? "sine" : "triangle";
      osc.frequency.value = BASE_HZ * ratio;
      const gain = ctx.createGain();
      gain.gain.value = 0.9 / (ratio * 0.8 + 1); // gentle 1/f-ish rolloff
      // slow amplitude LFO → the partials swell in and out of one another
      const lfo = ctx.createOscillator();
      lfo.type = "sine";
      lfo.frequency.value = 0.05 + i * 0.017; // incommensurate slow rates
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 0.4;
      lfo.connect(lfoGain);
      lfoGain.connect(gain.gain);
      osc.connect(gain);
      gain.connect(partialBus);
      osc.start();
      lfo.start();
      this.partials.push({ osc, gain, lfo, ratio });
    });

    // noise bed (overload above Tc)
    const noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const nd = noiseBuf.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuf;
    noise.loop = true;
    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = "bandpass";
    noiseFilter.frequency.value = 1600;
    noiseFilter.Q.value = 0.7;
    const noiseGain = ctx.createGain();
    noiseGain.gain.value = 0.0001;
    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(master);
    noise.start();
    this.noise = noise;
    this.noiseFilter = noiseFilter;
    this.noiseGain = noiseGain;

    if (ctx.state === "suspended") {
      try {
        await ctx.resume();
      } catch {
        /* ignore */
      }
    }
    this.started = true;
    return true;
  }

  /** Continuously steer the timbre from the simulation observables. */
  update(p: SynthParams): void {
    const ctx = this.ctx;
    if (!ctx || !this.started) return;
    const now = ctx.currentTime;
    const tau = 0.12; // smoothing
    const set = (param: AudioParam, v: number) => param.setTargetAtTime(v, now, tau);

    const crit = clamp01(p.crit);
    const order = clamp01(p.order);
    const heat = clamp01(p.heat);

    // drone: strongest when frozen/ordered, recedes as the lattice melts
    if (this.droneGain) set(this.droneGain.gain, 0.05 + 0.5 * order * (1 - 0.6 * heat));

    // partials: bloom at criticality
    if (this.partialBus) set(this.partialBus.gain, 0.04 + 0.6 * crit);
    // detune widens with heat → consonant near Tc, dissonant above it
    const spread = 4 + heat * 90; // cents of drift at the top partial
    this.partials.forEach((pt, i) => {
      const cents = ((i % 2 === 0 ? 1 : -1) * spread * (i + 1)) / this.partials.length;
      set(pt.osc.detune, cents);
    });

    // noise overload above Tc; brighten and open the band as it climbs
    if (this.noiseGain) set(this.noiseGain.gain, 0.5 * heat * heat);
    if (this.noiseFilter) {
      set(this.noiseFilter.frequency, 900 + heat * 4200);
      set(this.noiseFilter.Q, 0.7 + heat * 3.5);
    }
  }

  /** Sonify a spin-cluster avalanche: a short consonant bell burst. `strength`
   *  ∈ [0,1] scales loudness and brightness. Most vivid near criticality. */
  avalanche(strength: number): void {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master || !this.started) return;
    const now = ctx.currentTime;
    const s = clamp01(strength);
    const root = BASE_HZ * 3 * (1 + 0.5 * s);
    const partials = [1, 2, 3, 4.2];
    partials.forEach((r, i) => {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = root * r;
      const g = ctx.createGain();
      const amp = (0.16 * s) / (i + 1);
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(Math.max(amp, 0.0002), now + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.5 + 0.6 * s);
      osc.connect(g);
      g.connect(master);
      osc.start(now);
      osc.stop(now + 1.3);
    });
  }

  /** Full teardown: stop every node and close the context. */
  async stop(): Promise<void> {
    if (!this.started) return;
    this.started = false;
    const ctx = this.ctx;
    try {
      this.master?.gain.cancelScheduledValues(ctx?.currentTime ?? 0);
      this.drone?.stop();
      this.noise?.stop();
      for (const pt of this.partials) {
        pt.osc.stop();
        pt.lfo.stop();
      }
    } catch {
      /* ignore */
    }
    this.partials = [];
    this.drone = null;
    this.noise = null;
    this.partialBus = null;
    this.noiseGain = null;
    this.noiseFilter = null;
    this.droneGain = null;
    this.master = null;
    try {
      await ctx?.close();
    } catch {
      /* ignore */
    }
    this.ctx = null;
  }
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
