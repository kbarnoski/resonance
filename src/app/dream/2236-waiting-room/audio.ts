// ─────────────────────────────────────────────────────────────────────────────
// audio.ts — the spectral / inharmonic voice.
//
// A stretched-partial additive cluster (bell/metal-like, deliberately
// INHARMONIC). No pentatonic scale, no plain just-intonation stack — the
// waiting room does not sing tunes, it rings. Motion opens a lowpass and
// brings the upper partials in; immersion balances the cluster and a slow
// shimmer LFO detunes it. Master gain is capped and compressed. Silent until
// the first motion, then a gentle fade-in.
// ─────────────────────────────────────────────────────────────────────────────

// Inharmonic partial multipliers (bell-like stretched series). Non-integer,
// non-JI, non-pentatonic by construction.
const PARTIALS = [1, 1.87, 2.74, 3.52, 4.61, 5.9, 7.35];
const BASE_HZ = 92;
const MASTER_CAP = 0.2;

type AudioCtor = typeof AudioContext;

export class SpectralAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private filter: BiquadFilterNode | null = null;
  private oscs: OscillatorNode[] = [];
  private gains: GainNode[] = [];
  private lfo: OscillatorNode | null = null;
  private started = false;
  private faded = false;

  async start(): Promise<void> {
    if (this.started) return;
    const w = window as unknown as {
      AudioContext?: AudioCtor;
      webkitAudioContext?: AudioCtor;
    };
    const Ctor = w.AudioContext ?? w.webkitAudioContext;
    if (!Ctor) throw new Error("Web Audio API is unavailable.");
    const ctx = new Ctor();
    if (ctx.state === "suspended") await ctx.resume();

    const master = ctx.createGain();
    master.gain.value = 0;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -20;
    comp.ratio.value = 6;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 260;
    filter.Q.value = 0.8;

    filter.connect(comp);
    comp.connect(master);
    master.connect(ctx.destination);

    // Slow shimmer LFO summed onto every partial's detune param.
    const lfo = ctx.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = 0.12;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 5; // cents
    lfo.connect(lfoGain);

    for (let i = 0; i < PARTIALS.length; i++) {
      const osc = ctx.createOscillator();
      osc.type = i === 0 ? "sine" : "triangle";
      osc.frequency.value = BASE_HZ * PARTIALS[i];
      lfoGain.connect(osc.detune);
      const g = ctx.createGain();
      g.gain.value = 0;
      osc.connect(g);
      g.connect(filter);
      osc.start();
      this.oscs.push(osc);
      this.gains.push(g);
    }
    lfo.start();

    this.ctx = ctx;
    this.master = master;
    this.filter = filter;
    this.lfo = lfo;
    this.started = true;
  }

  /** Drive the voice from the live state. */
  setDrive(energy: number, coherence: number, cx: number): void {
    const ctx = this.ctx;
    const master = this.master;
    const filter = this.filter;
    if (!ctx || !master || !filter) return;
    const t = ctx.currentTime;
    const e = Math.min(1, Math.max(0, energy));
    const c = Math.min(1, Math.max(0, coherence));

    if (!this.faded && e > 0.02) this.faded = true;

    const target = this.faded
      ? MASTER_CAP * (0.12 + 0.88 * Math.min(1, e * 1.2)) * (0.4 + 0.6 * c)
      : 0;
    master.gain.setTargetAtTime(Math.min(MASTER_CAP, target), t, 0.3);

    const cutoff = 220 + e * c * 3200 + c * 900;
    filter.frequency.setTargetAtTime(cutoff, t, 0.25);

    // Higher partials arrive with energy AND immersion — the cluster "binds".
    for (let i = 0; i < this.gains.length; i++) {
      const rolloff = 0.55 / (1 + i * 0.85);
      const upper = i === 0 ? 1 : (0.15 + 0.85 * c) * (0.25 + 0.75 * e);
      this.gains[i].gain.setTargetAtTime(rolloff * upper, t, 0.2);
    }

    // Motion centroid nudges overall pitch — a subtle sense of "where".
    const detune = cx * 90;
    for (const osc of this.oscs) osc.detune.setTargetAtTime(detune, t, 0.3);
  }

  dispose(): void {
    for (const osc of this.oscs) {
      try {
        osc.stop();
      } catch {
        /* already stopped */
      }
    }
    try {
      this.lfo?.stop();
    } catch {
      /* already stopped */
    }
    this.oscs = [];
    this.gains = [];
    this.lfo = null;
    const ctx = this.ctx;
    this.ctx = null;
    this.master = null;
    this.filter = null;
    this.started = false;
    if (ctx) void ctx.close().catch(() => {});
  }
}
