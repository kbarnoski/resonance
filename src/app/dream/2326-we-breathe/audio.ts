// audio.ts — the collective breath drone (Web Audio).
//
// A warm sustained pad of a few detuned partials, low-passed and routed through
// a void reverb + compressor. Its sound tracks the room's coherence R:
//   • low R  → partials detune and BEAT against one another (audibly "many").
//   • high R → partials pull toward unison, the filter opens, the pad blooms
//              fuller and brighter (audibly "one").
// The collective breath phase gently swells the master gain and filter (inhale
// louder/opening, exhale softer). There is NO single intensity dial — every
// parameter is driven by the emergent R and the collective breath.
//
// Master gain is kept modest (≤0.2), 1s fade-in, silent until a user gesture.

import { createVoidReverb, type VoidReverb } from "../_shared/psych/convolutionVoid";

// Harmonic-ish partial ratios over a warm low fundamental — a soft, open voicing.
const FUNDAMENTAL = 98; // Hz (~G2)
const RATIOS = [1, 1.5, 2, 3, 4];
const MASTER_CEIL = 0.2;

export class CollectiveBreath {
  private ctx: AudioContext;
  private master: GainNode;
  private comp: DynamicsCompressorNode;
  private filter: BiquadFilterNode;
  private verb: VoidReverb;
  private oscs: OscillatorNode[] = [];
  private gains: GainNode[] = [];
  private started = false;

  constructor() {
    const Ctx: typeof AudioContext =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    this.ctx = new Ctx();

    this.master = this.ctx.createGain();
    this.master.gain.value = 0; // fade in after start

    this.comp = this.ctx.createDynamicsCompressor();
    this.comp.threshold.value = -24;
    this.comp.ratio.value = 4;
    this.comp.attack.value = 0.02;
    this.comp.release.value = 0.3;

    this.filter = this.ctx.createBiquadFilter();
    this.filter.type = "lowpass";
    this.filter.frequency.value = 500;
    this.filter.Q.value = 0.6;

    this.verb = createVoidReverb(this.ctx, { seconds: 5, decay: 2.4, wet: 0.35 });

    // partials -> filter -> reverb -> compressor -> master -> out
    this.filter.connect(this.verb.input);
    this.verb.output.connect(this.comp);
    this.comp.connect(this.master);
    this.master.connect(this.ctx.destination);

    for (let i = 0; i < RATIOS.length; i++) {
      const osc = this.ctx.createOscillator();
      osc.type = i % 2 === 0 ? "sine" : "triangle";
      osc.frequency.value = FUNDAMENTAL * RATIOS[i];
      const g = this.ctx.createGain();
      // Upper partials quieter — a warm, rounded spectrum.
      g.gain.value = 0.9 / (1 + i * 0.9);
      osc.connect(g);
      g.connect(this.filter);
      this.oscs.push(osc);
      this.gains.push(g);
    }
  }

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    if (this.ctx.state === "suspended") await this.ctx.resume();
    const now = this.ctx.currentTime;
    for (const o of this.oscs) o.start();
    // 1s fade-in.
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(0, now);
    this.master.gain.linearRampToValueAtTime(MASTER_CEIL * 0.7, now + 1);
  }

  /** Drive the pad from the emergent state. Call each frame.
   *  @param R          collective coherence 0..1
   *  @param breathSwell 0..1 (0.5+0.5·sin(meanPhase))
   *  @param meanEnergy  average breath amplitude 0..1
   */
  update(R: number, breathSwell: number, meanEnergy: number): void {
    if (!this.started) return;
    const now = this.ctx.currentTime;
    const t = 0.12; // smoothing time-constant

    // Detune: wide when incoherent (beating "many"), ~unison when coherent.
    const spreadCents = (1 - R) * 22; // up to ±22 cents of clash
    for (let i = 0; i < this.oscs.length; i++) {
      // Alternate sign so partials beat against each other, not all up.
      const sign = i % 2 === 0 ? 1 : -1;
      const cents = sign * spreadCents * (0.4 + i * 0.2);
      this.oscs[i].detune.setTargetAtTime(cents, now, t);
    }

    // Filter: opens with coherence AND with the collective inhale.
    const cutoff = 360 + R * 1400 + breathSwell * 500 * (0.4 + 0.6 * R);
    this.filter.frequency.setTargetAtTime(cutoff, now, t);

    // Reverb blooms wetter (more "shared space") as the room coheres.
    this.verb.setWet(0.28 + R * 0.22);

    // Master swell: collective breath opens/closes; energy adds a little body.
    const level =
      MASTER_CEIL * (0.45 + 0.4 * breathSwell + 0.15 * meanEnergy);
    this.master.gain.setTargetAtTime(Math.min(MASTER_CEIL, level), now, t);
  }

  async dispose(): Promise<void> {
    const now = this.ctx.currentTime;
    try {
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setTargetAtTime(0, now, 0.2);
    } catch {
      /* ignore */
    }
    for (const o of this.oscs) {
      try {
        o.stop(now + 0.4);
      } catch {
        /* already stopped */
      }
    }
    // Give the fade a moment, then close.
    setTimeout(() => {
      void this.ctx.close();
    }, 500);
  }
}
