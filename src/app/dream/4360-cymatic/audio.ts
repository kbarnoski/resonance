// ─────────────────────────────────────────────────────────────────────────────
// 4360 · Cymatic — additive/modal synthesis of the driven plate tone.
//
// We do NOT analyse external audio. We SYNTHESISE the tone the plate is being
// driven with: a fundamental at the drive frequency f plus a couple of the plate's
// inharmonic partials (a bowed-metal-plate timbre), gently amplitude-modulated so
// it "hums". As the drive nears a mode's resonance the whole voice swells and
// brightens (the plate rings harder). Every pitch move rides setTargetAtTime so a
// frequency sweep sounds continuous. Route → lowpass → compressor limiter →
// master (~0.2) → destination.
// ─────────────────────────────────────────────────────────────────────────────

interface Partial {
  osc: OscillatorNode;
  gain: GainNode;
  ratio: number; // inharmonic multiple of the fundamental
  level: number; // relative amplitude
}

export class PlateAudio {
  private ctx: AudioContext;
  private master: GainNode;
  private voice: GainNode; // sums the partials
  private filter: BiquadFilterNode;
  private tremGain: GainNode; // amplitude-modulated node
  private tremLfo: OscillatorNode;
  private partials: Partial[] = [];
  private started = false;
  private freq = 196;

  // Free-square-plate-like partial ratios (mildly inharmonic → metallic hum).
  private static readonly RATIOS: [number, number][] = [
    [1.0, 1.0], // fundamental
    [2.0, 0.34],
    [3.41, 0.16],
    [5.06, 0.07],
  ];

  constructor(ctx: AudioContext) {
    this.ctx = ctx;

    this.master = ctx.createGain();
    this.master.gain.value = 0.0;

    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 24;
    comp.ratio.value = 4;
    comp.attack.value = 0.006;
    comp.release.value = 0.2;

    this.filter = ctx.createBiquadFilter();
    this.filter.type = "lowpass";
    this.filter.frequency.value = 900;
    this.filter.Q.value = 0.9;

    this.tremGain = ctx.createGain();
    this.tremGain.gain.value = 0.85; // baseline; LFO adds a small ripple

    this.voice = ctx.createGain();
    this.voice.gain.value = 0.9;

    // signal path: partials → voice → tremGain → filter → master → comp → out
    this.voice.connect(this.tremGain);
    this.tremGain.connect(this.filter);
    this.filter.connect(this.master);
    this.master.connect(comp);
    comp.connect(ctx.destination);

    // tremolo LFO gently rides the tremGain amplitude → the plate "hums"
    this.tremLfo = ctx.createOscillator();
    this.tremLfo.type = "sine";
    this.tremLfo.frequency.value = 5.2;
    const tremDepth = ctx.createGain();
    tremDepth.gain.value = 0.12;
    this.tremLfo.connect(tremDepth);
    tremDepth.connect(this.tremGain.gain);

    for (const [ratio, level] of PlateAudio.RATIOS) {
      const osc = ctx.createOscillator();
      osc.type = ratio === 1.0 ? "triangle" : "sine";
      osc.frequency.value = this.freq * ratio;
      const gain = ctx.createGain();
      gain.gain.value = level;
      osc.connect(gain);
      gain.connect(this.voice);
      this.partials.push({ osc, gain, ratio, level });
    }
  }

  start() {
    if (this.started) return;
    this.started = true;
    const t = this.ctx.currentTime;
    this.tremLfo.start(t);
    for (const p of this.partials) p.osc.start(t);
    this.master.gain.setTargetAtTime(0.2, t, 0.9);
  }

  // Called every frame. f = drive frequency (Hz); strength = 0..1 resonance
  // closeness (how hard the plate rings). Pitch glides continuously.
  update(f: number, strength: number) {
    this.freq = f;
    const t = this.ctx.currentTime;
    for (const p of this.partials) {
      p.osc.frequency.setTargetAtTime(f * p.ratio, t, 0.05);
    }
    // brighter + louder near a resonance peak, darker in the gaps between figures
    this.filter.frequency.setTargetAtTime(500 + strength * 3200, t, 0.18);
    this.master.gain.setTargetAtTime(0.11 + strength * 0.14, t, 0.25);
  }

  resume(): Promise<void> {
    if (this.ctx.state === "suspended") return this.ctx.resume();
    return Promise.resolve();
  }

  suspended(): boolean {
    return this.ctx.state === "suspended";
  }

  async stop() {
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(0, t, 0.25);
    await new Promise((res) => setTimeout(res, 320));
    try {
      this.tremLfo.stop();
    } catch {
      /* already stopped */
    }
    for (const p of this.partials) {
      try {
        p.osc.stop();
      } catch {
        /* already stopped */
      }
    }
    try {
      await this.ctx.close();
    } catch {
      /* already closed */
    }
  }
}
