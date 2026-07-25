// ════════════════════════════════════════════════════════════════════════════
// 2664 · Quantum Whispers — audio.
//
// Web Audio only. The player's keys drive polyphonic LEAD voices; each agent has
// its own FM timbre triggered on collapse. Free 12-TET / continuous cents (no
// scale snapping) so DIVERGENCE produces real, controllable dissonance. A
// DynamicsCompressor acts as the master limiter; master gain stays ≤ 0.2. Silent
// until start() is called from a user gesture (autoplay policy).
// ════════════════════════════════════════════════════════════════════════════

// per-agent FM character: [carrier ratio contribution, mod ratio, mod index]
const AGENT_TIMBRE: { ratio: number; index: number }[] = [
  { ratio: 1.0, index: 1.4 },
  { ratio: 1.5, index: 0.9 },
  { ratio: 2.01, index: 2.2 },
];

export class QuantumAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private comp: DynamicsCompressorNode | null = null;
  private leads = new Map<string, { osc: OscillatorNode; g: GainNode }>();

  async start(): Promise<void> {
    if (!this.ctx) {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      this.ctx = new Ctor();
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -10;
      comp.knee.value = 6;
      comp.ratio.value = 12;
      comp.attack.value = 0.003;
      comp.release.value = 0.12;
      const master = this.ctx.createGain();
      master.gain.value = 0.18; // ≤ 0.2 master
      master.connect(comp);
      comp.connect(this.ctx.destination);
      this.master = master;
      this.comp = comp;
    }
    if (this.ctx.state === "suspended") {
      await this.ctx.resume();
    }
  }

  get ready(): boolean {
    return this.ctx != null && this.master != null;
  }

  // ── polyphonic lead: the player's own instrument ──────────────────────────
  leadOn(key: string, freq: number): void {
    if (!this.ctx || !this.master) return;
    if (this.leads.has(key)) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.16, now + 0.012);
    g.gain.linearRampToValueAtTime(0.11, now + 0.14);
    osc.connect(g);
    g.connect(this.master);
    osc.start(now);
    this.leads.set(key, { osc, g });
  }

  leadOff(key: string): void {
    if (!this.ctx) return;
    const v = this.leads.get(key);
    if (!v) return;
    this.leads.delete(key);
    const now = this.ctx.currentTime;
    v.g.gain.cancelScheduledValues(now);
    v.g.gain.setValueAtTime(Math.max(0.0001, v.g.gain.value), now);
    v.g.gain.exponentialRampToValueAtTime(0.0001, now + 0.25);
    v.osc.stop(now + 0.3);
  }

  // ── agent collapse voice: enveloped FM pluck ──────────────────────────────
  playAgent(agentIndex: number, freq: number, vel: number, delay: number): void {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime + Math.max(0, delay);
    const tim = AGENT_TIMBRE[agentIndex % AGENT_TIMBRE.length];
    const car = this.ctx.createOscillator();
    car.type = "sine";
    car.frequency.value = freq;
    const mod = this.ctx.createOscillator();
    mod.type = "sine";
    mod.frequency.value = freq * tim.ratio;
    const modGain = this.ctx.createGain();
    modGain.gain.value = freq * tim.index;
    mod.connect(modGain);
    modGain.connect(car.frequency);
    const g = this.ctx.createGain();
    const peak = 0.22 * vel;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
    car.connect(g);
    g.connect(this.master);
    car.start(t);
    mod.start(t);
    car.stop(t + 0.7);
    mod.stop(t + 0.7);
    const cleanup = () => {
      try {
        car.disconnect();
        mod.disconnect();
        modGain.disconnect();
        g.disconnect();
      } catch {
        /* already gone */
      }
    };
    car.onended = cleanup;
  }

  // ── ghost self-demo voice: a soft lead pluck ──────────────────────────────
  playGhost(freq: number, vel: number, delay: number): void {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime + Math.max(0, delay);
    const osc = this.ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.value = freq;
    const g = this.ctx.createGain();
    const peak = 0.1 * vel;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t);
    osc.stop(t + 0.6);
    osc.onended = () => {
      try {
        osc.disconnect();
        g.disconnect();
      } catch {
        /* already gone */
      }
    };
  }

  dispose(): void {
    for (const [, v] of this.leads) {
      try {
        v.osc.stop();
        v.osc.disconnect();
        v.g.disconnect();
      } catch {
        /* no-op */
      }
    }
    this.leads.clear();
    if (this.ctx) {
      const c = this.ctx;
      this.ctx = null;
      this.master = null;
      this.comp = null;
      c.close().catch(() => {
        /* no-op */
      });
    }
  }
}
