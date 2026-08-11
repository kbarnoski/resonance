// ─────────────────────────────────────────────────────────────────────────────
// audio.ts — the metallic voice of the ferrofluid.
//
//   The field does NOT sing a consonant/just-intonation chord. Its material is
//   INHARMONIC struck/bowed metal: a bank of singing-bowl-like partials on
//   deliberately non-integer, non-JI ratios whose brightness + roughness track
//   the field energy, a low ferric drone underneath, and — on every new spike
//   birth — a short bright metallic "ting" transient. Never silent.
//
//   All voices route into the shared safe master (createSafeMaster) upstream.
// ─────────────────────────────────────────────────────────────────────────────

// Non-integer, non-JI partial ratios of a struck singing bowl (inharmonic).
const BOWL_RATIOS = [1.0, 2.41, 3.83, 5.17, 6.63, 8.21];
const BOWL_WEIGHTS = [1.0, 0.55, 0.42, 0.3, 0.2, 0.13];

// Bright, fast-decaying inharmonic ratios for the spike-birth "ting".
const TING_RATIOS = [1.0, 2.76, 5.4, 8.93];

interface BowlPartial {
  osc: OscillatorNode;
  det: OscillatorNode; // detuned twin → metallic roughness/beating
  detGain: GainNode;
  gain: GainNode;
}

export class FerroAudio {
  private ctx: AudioContext;
  private out: AudioNode;
  private bus: GainNode;
  private tone: BiquadFilterNode; // brightness tracks field energy
  private bowl: BowlPartial[] = [];
  private bowlGain: GainNode;
  private droneGain: GainNode;
  private droneA: OscillatorNode | null = null;
  private droneB: OscillatorNode | null = null;
  private droneFilt: BiquadFilterNode | null = null;
  private tings = new Set<{ nodes: AudioNode[] }>();
  private started = false;
  private f0 = 165;

  constructor(ctx: AudioContext, out: AudioNode) {
    this.ctx = ctx;
    this.out = out;

    this.bus = ctx.createGain();
    this.bus.gain.value = 1;

    this.tone = ctx.createBiquadFilter();
    this.tone.type = "lowpass";
    this.tone.frequency.value = 900;
    this.tone.Q.value = 0.6;
    this.bus.connect(this.tone);
    this.tone.connect(out);

    this.bowlGain = ctx.createGain();
    this.bowlGain.gain.value = 0.0001;
    this.bowlGain.connect(this.bus);

    this.droneGain = ctx.createGain();
    this.droneGain.gain.value = 0.0001;
    this.droneGain.connect(this.bus);
  }

  start() {
    if (this.started) return;
    this.started = true;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    // Low ferric drone — two slightly detuned low voices through a soft lowpass.
    const df = ctx.createBiquadFilter();
    df.type = "lowpass";
    df.frequency.value = 220;
    df.Q.value = 0.7;
    df.connect(this.droneGain);
    this.droneFilt = df;

    const a = ctx.createOscillator();
    a.type = "sawtooth";
    a.frequency.value = 55;
    const b = ctx.createOscillator();
    b.type = "triangle";
    b.frequency.value = 55 * 1.005;
    a.connect(df);
    b.connect(df);
    a.start(now);
    b.start(now);
    this.droneA = a;
    this.droneB = b;
    this.droneGain.gain.setTargetAtTime(0.16, now, 0.6);

    // Inharmonic singing-bowl bank — sustained, brightness tracks the field.
    for (let i = 0; i < BOWL_RATIOS.length; i++) {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = this.f0 * BOWL_RATIOS[i];

      const det = ctx.createOscillator();
      det.type = "sine";
      det.frequency.value = this.f0 * BOWL_RATIOS[i] * 1.003;

      const detGain = ctx.createGain();
      detGain.gain.value = 0.0;

      const gain = ctx.createGain();
      gain.gain.value = BOWL_WEIGHTS[i] * 0.5;

      osc.connect(gain);
      det.connect(detGain);
      detGain.connect(gain);
      gain.connect(this.bowlGain);
      osc.start(now);
      det.start(now);
      this.bowl.push({ osc, det, detGain, gain });
    }
    this.bowlGain.gain.setTargetAtTime(0.05, now, 0.8);
  }

  /** Called every frame with field state (0..1). */
  update(energy: number, centroid: number) {
    if (!this.started) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const e = Math.min(1, Math.max(0, energy));

    // Bowl level rises as spikes erupt; brightness (tone LPF) opens with energy.
    this.bowlGain.gain.setTargetAtTime(0.04 + e * 0.42, now, 0.12);
    const cutoff = 650 + e * 4200 + Math.min(2500, centroid * 0.6);
    this.tone.frequency.setTargetAtTime(cutoff, now, 0.15);

    // Roughness: more inharmonic beating at higher energy.
    const rough = 0.12 + e * 0.55;
    for (const p of this.bowl) p.detGain.gain.setTargetAtTime(rough, now, 0.2);

    // Drone breathes slightly with the field but never drops out.
    this.droneGain.gain.setTargetAtTime(0.12 + e * 0.1, now, 0.4);
    if (this.droneFilt)
      this.droneFilt.frequency.setTargetAtTime(180 + e * 260, now, 0.3);
  }

  /** Fire a bright metallic ting on a new spike birth. strength 0..1. */
  ting(strength: number) {
    if (!this.started) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const s = Math.min(1, Math.max(0.1, strength));
    const base = 520 + s * 520;

    const vg = ctx.createGain();
    vg.gain.value = 0.0;
    vg.connect(this.bus);
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = base * 3;
    bp.Q.value = 1.2;
    vg.connect(bp);
    bp.connect(this.bus);

    const nodes: AudioNode[] = [vg, bp];
    const peak = 0.06 + s * 0.06;
    vg.gain.setValueAtTime(0.0001, now);
    vg.gain.exponentialRampToValueAtTime(peak, now + 0.004);
    vg.gain.exponentialRampToValueAtTime(0.0002, now + 0.28);

    for (let i = 0; i < TING_RATIOS.length; i++) {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = base * TING_RATIOS[i];
      const g = ctx.createGain();
      g.gain.value = 1.0 / (i + 1.4);
      osc.connect(g);
      g.connect(vg);
      osc.start(now);
      osc.stop(now + 0.32);
      nodes.push(osc, g);
    }
    const rec = { nodes };
    this.tings.add(rec);
    window.setTimeout(() => {
      for (const nd of nodes) {
        try {
          nd.disconnect();
        } catch {
          /* already gone */
        }
      }
      this.tings.delete(rec);
    }, 360);
  }

  stop() {
    if (!this.started) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    this.bus.gain.setTargetAtTime(0.0001, now, 0.15);
    const kill = () => {
      try {
        this.droneA?.stop();
        this.droneB?.stop();
      } catch {
        /* stopped */
      }
      for (const p of this.bowl) {
        try {
          p.osc.stop();
          p.det.stop();
        } catch {
          /* stopped */
        }
      }
      for (const rec of this.tings)
        for (const nd of rec.nodes)
          try {
            nd.disconnect();
          } catch {
            /* gone */
          }
      this.tings.clear();
      try {
        this.bus.disconnect();
        this.tone.disconnect();
        this.bowlGain.disconnect();
        this.droneGain.disconnect();
      } catch {
        /* gone */
      }
    };
    window.setTimeout(kill, 220);
    this.started = false;
  }
}
