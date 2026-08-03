import { midiToFreq } from "./spiral";

// ─────────────────────────────────────────────────────────────────────────────
// A clean, analytical Web Audio synth. Every sounded note is a soft plucked
// triangle voice through a lowpass and a short delay tail, summed into a master
// gain (≤ 0.2) and a DynamicsCompressor so stacked chords never clip. The piece
// makes real sound with no MIDI device attached.
// ─────────────────────────────────────────────────────────────────────────────

export class NoteSynth {
  private ctx: AudioContext;
  private master: GainNode;
  private comp: DynamicsCompressorNode;
  private filter: BiquadFilterNode;
  private delay: DelayNode;
  private feedback: GainNode;
  private wet: GainNode;
  private muted = false;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;

    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -18;
    this.comp.knee.value = 24;
    this.comp.ratio.value = 3;
    this.comp.attack.value = 0.005;
    this.comp.release.value = 0.25;

    this.master = ctx.createGain();
    this.master.gain.value = 0.18;

    this.filter = ctx.createBiquadFilter();
    this.filter.type = "lowpass";
    this.filter.frequency.value = 2300;
    this.filter.Q.value = 0.5;

    // Short reverb-ish delay tail for a crystalline bloom.
    this.delay = ctx.createDelay(1.0);
    this.delay.delayTime.value = 0.24;
    this.feedback = ctx.createGain();
    this.feedback.gain.value = 0.32;
    this.wet = ctx.createGain();
    this.wet.gain.value = 0.35;

    // filter → (dry) → master, and filter → delay ⟳ → wet → master
    this.filter.connect(this.master);
    this.filter.connect(this.delay);
    this.delay.connect(this.feedback);
    this.feedback.connect(this.delay);
    this.delay.connect(this.wet);
    this.wet.connect(this.master);

    this.master.connect(this.comp);
    this.comp.connect(ctx.destination);
  }

  setMuted(m: boolean) {
    this.muted = m;
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setTargetAtTime(m ? 0.0001 : 0.18, now, 0.05);
  }

  /** Play a soft plucked note. `when` is an AudioContext time (defaults to now). */
  play(midi: number, velocity = 0.8, when?: number, dur = 0.9) {
    if (this.muted) return;
    const ctx = this.ctx;
    const t0 = when ?? ctx.currentTime;
    const freq = midiToFreq(midi);

    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.value = freq;

    // A quiet sine an octave up adds a little glassy shimmer.
    const shimmer = ctx.createOscillator();
    shimmer.type = "sine";
    shimmer.frequency.value = freq * 2;

    const g = ctx.createGain();
    const peak = 0.28 * Math.max(0.15, Math.min(1, velocity));
    const attack = 0.008;
    const decay = Math.max(0.4, dur);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(peak, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0008, t0 + attack + decay);

    const sg = ctx.createGain();
    sg.gain.value = 0.25;

    osc.connect(g);
    shimmer.connect(sg);
    sg.connect(g);
    g.connect(this.filter);

    const stop = t0 + attack + decay + 0.05;
    osc.start(t0);
    shimmer.start(t0);
    osc.stop(stop);
    shimmer.stop(stop);

    const cleanup = () => {
      osc.disconnect();
      shimmer.disconnect();
      sg.disconnect();
      g.disconnect();
    };
    osc.onended = cleanup;
  }

  dispose() {
    try {
      this.master.disconnect();
      this.comp.disconnect();
      this.filter.disconnect();
      this.delay.disconnect();
      this.feedback.disconnect();
      this.wet.disconnect();
    } catch {
      // already torn down
    }
  }
}
