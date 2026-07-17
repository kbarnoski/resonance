// ════════════════════════════════════════════════════════════════════════════
// 1870 — Metastaseis :: audio engine (inverse Xenakis)
//
// Each ruling line the playhead crosses is sounded as a GLISSANDO: one oscillator
// glides from the pitch of the line's low endpoint to the pitch of its high
// endpoint. Steep lines (large vertical span) additionally fire a pizzicato —
// point-density across the surface becoming a percussive energy block, exactly
// the mapping arXiv:2607.06589 proposes when inverting Metastaseis.
//
// Safety: every voice → bus → DynamicsCompressor → master (≤ 0.18), 1s fade-in.
// ════════════════════════════════════════════════════════════════════════════

export interface GlissSpec {
  freqA: number;
  freqB: number;
  span: number;
  register: number;
}

const MASTER_GAIN = 0.18;
const MAX_VOICES = 14;

export class MetastaseisAudio {
  private ctx: AudioContext;
  private master: GainNode;
  private comp: DynamicsCompressorNode;
  private bus: GainNode;
  private active = 0;
  private reduced: boolean;

  constructor(reducedMotion: boolean) {
    const Ctor: typeof AudioContext =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    this.ctx = new Ctor();
    this.reduced = reducedMotion;

    this.master = this.ctx.createGain();
    this.master.gain.value = 0.0001;

    this.comp = this.ctx.createDynamicsCompressor();
    this.comp.threshold.value = -20;
    this.comp.knee.value = 24;
    this.comp.ratio.value = 12;
    this.comp.attack.value = 0.004;
    this.comp.release.value = 0.25;

    this.bus = this.ctx.createGain();
    this.bus.gain.value = 0.9;

    this.bus.connect(this.comp);
    this.comp.connect(this.master);
    this.master.connect(this.ctx.destination);
  }

  /** Resume + 1s fade-in. Safe to call from a user gesture. */
  async start(): Promise<void> {
    if (this.ctx.state === "suspended") {
      await this.ctx.resume();
    }
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(Math.max(0.0001, this.master.gain.value), now);
    this.master.gain.linearRampToValueAtTime(MASTER_GAIN, now + 1.0);
  }

  get currentTime(): number {
    return this.ctx.currentTime;
  }

  get running(): boolean {
    return this.ctx.state === "running";
  }

  /** Sound one ruling line as a gliding oscillator. */
  playGlissando(spec: GlissSpec, sweepDur: number): void {
    if (this.active >= MAX_VOICES) return;
    const now = this.ctx.currentTime;
    const dur = Math.max(0.6, Math.min(2.6, sweepDur));

    const osc = this.ctx.createOscillator();
    osc.type = "sawtooth";
    const fA = clampFreq(spec.freqA);
    const fB = clampFreq(spec.freqB);
    osc.frequency.setValueAtTime(fA, now);
    osc.frequency.exponentialRampToValueAtTime(fB, now + dur); // the glissando

    // Gentle low-pass so sawtooth glissandi stay warm, not harsh.
    const lp = this.ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = Math.min(4200, fB * 5 + 600);
    lp.Q.value = 0.4;

    const g = this.ctx.createGain();
    const peak = this.reduced ? 0.05 : 0.075;
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(peak, now + 0.18);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);

    osc.connect(lp);
    lp.connect(g);
    g.connect(this.bus);

    this.active++;
    osc.onended = () => {
      this.active--;
      osc.disconnect();
      lp.disconnect();
      g.disconnect();
    };
    osc.start(now);
    osc.stop(now + dur + 0.05);

    // Point-density → energy block: steep lines add a pizzicato attack.
    if (spec.span > 0.42 && !this.reduced) {
      this.pizz(spec.register * 2, now);
    }
  }

  private pizz(freq: number, now: number): void {
    const osc = this.ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.value = clampFreq(freq);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.09, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
    osc.connect(g);
    g.connect(this.bus);
    osc.onended = () => {
      osc.disconnect();
      g.disconnect();
    };
    osc.start(now);
    osc.stop(now + 0.26);
  }

  async dispose(): Promise<void> {
    try {
      const now = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.linearRampToValueAtTime(0.0001, now + 0.15);
    } catch {
      // context may already be closing
    }
    try {
      await this.ctx.close();
    } catch {
      // ignore double-close
    }
  }
}

function clampFreq(f: number): number {
  return Math.max(55, Math.min(2100, f));
}
