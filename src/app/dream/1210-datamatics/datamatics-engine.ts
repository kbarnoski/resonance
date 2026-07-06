// ════════════════════════════════════════════════════════════════════════════
// DATAMATICS (1210) — audio engine
//
// The drawn spectrogram column is resynthesised as ADDITIVE PURE SINES: one
// OscillatorNode per frequency row, its gain tracking the brightness of that
// row in the column currently under the playhead. Row → log frequency (a clean,
// pre-snapped log grid), brightness → partial amplitude. Hard high-contrast
// onsets fire a short band-passed noise TICK. Clinical Ikeda test-tone register:
// pure sines + filtered-noise clicks, no warmth, no FM, no grain.
//
// Everything is hard-limited: master gain ramps up from 0, dense columns are
// energy-normalised per-partial, and a DynamicsCompressor sits on the bus as a
// brick-wall so a fully-painted column can never spike.
// ════════════════════════════════════════════════════════════════════════════

export const ROWS = 64; // frequency rows == sine partials
export const MIN_HZ = 55; // bottom of the score
export const MAX_HZ = 7500; // top of the score

/** Row index (0 = bottom / low) → frequency on a clean log grid. */
export function rowFreq(row: number): number {
  const t = row / (ROWS - 1);
  return MIN_HZ * Math.pow(MAX_HZ / MIN_HZ, t);
}

export class DatamaticsEngine {
  private ctx: AudioContext;
  private master: GainNode; // partial bus, gain ramped from 0
  private comp: DynamicsCompressorNode; // brick-wall limiter
  private oscs: OscillatorNode[] = [];
  private gains: GainNode[] = [];
  private clickBus: GainNode;
  private noiseBuf: AudioBuffer;
  private level: number;
  private lastClickAt = -1;
  private disposed = false;

  constructor(ctx: AudioContext, level = 0.34) {
    this.ctx = ctx;
    this.level = level;

    // ── bus: partials → master(gain 0) ─┐
    //        clicks    → clickBus ───────┼→ compressor(limiter) → destination
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -10;
    comp.knee.value = 4;
    comp.ratio.value = 20;
    comp.attack.value = 0.002;
    comp.release.value = 0.18;
    comp.connect(ctx.destination);
    this.comp = comp;

    const master = ctx.createGain();
    master.gain.setValueAtTime(0.0001, ctx.currentTime);
    master.connect(comp);
    this.master = master;

    const clickBus = ctx.createGain();
    clickBus.gain.value = 0.55;
    clickBus.connect(comp);
    this.clickBus = clickBus;

    // ── one pure sine oscillator per frequency row ──
    for (let i = 0; i < ROWS; i++) {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = rowFreq(i);
      const g = ctx.createGain();
      g.gain.value = 0;
      osc.connect(g).connect(master);
      osc.start();
      this.oscs.push(osc);
      this.gains.push(g);
    }

    // ── a short white-noise buffer for the onset ticks ──
    const n = Math.floor(ctx.sampleRate * 0.12);
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;
  }

  /** Ramp the master bus up from silence (call after ctx.resume). */
  start() {
    if (this.disposed) return;
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setValueAtTime(0.0001, t);
    this.master.gain.exponentialRampToValueAtTime(this.level, t + 1.1);
  }

  /**
   * Push the active column's brightnesses (length ROWS, 0..1) into the partial
   * bank. Energy-normalised so a dense column stays roughly as loud as a sparse
   * one — dense columns just spread the energy across more partials rather than
   * getting harsh. Gains glide (setTargetAtTime) so the timbre morphs smoothly.
   */
  setColumn(bright: Float32Array, smoothTime = 0.03) {
    if (this.disposed) return;
    let total = 0;
    for (let i = 0; i < ROWS; i++) total += bright[i];
    const scale = 0.44 / Math.sqrt(Math.max(1, total));
    const t = this.ctx.currentTime;
    for (let i = 0; i < ROWS; i++) {
      const b = bright[i];
      const g = b > 0.004 ? b * scale : 0;
      this.gains[i].gain.setTargetAtTime(g, t, smoothTime);
    }
  }

  /** Fire a crisp band-passed noise tick for a hard onset (intensity 0..1). */
  triggerClick(intensity: number) {
    if (this.disposed) return;
    const t = this.ctx.currentTime;
    if (t - this.lastClickAt < 0.045) return; // audio de-dupe
    this.lastClickAt = t;

    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const bp = this.ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 3200 + 2600 * Math.min(1, intensity);
    bp.Q.value = 1.4;
    const g = this.ctx.createGain();
    const amp = 0.28 + 0.4 * Math.min(1, intensity);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(amp, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    src.connect(bp).connect(g).connect(this.clickBus);
    src.start(t);
    src.stop(t + 0.09);
    src.onended = () => {
      try {
        src.disconnect();
        bp.disconnect();
        g.disconnect();
      } catch {
        /* already gone */
      }
    };
  }

  /** Ramp the bus down (pause) without tearing anything down. */
  silence() {
    if (this.disposed) return;
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setTargetAtTime(0.0001, t, 0.06);
  }

  /** Ramp back up after silence(). */
  unsilence() {
    if (this.disposed) return;
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setTargetAtTime(this.level, t, 0.15);
  }

  /** Stop and disconnect absolutely everything, then close the context. */
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const o of this.oscs) {
      try {
        o.stop();
      } catch {
        /* already stopped */
      }
      try {
        o.disconnect();
      } catch {
        /* already gone */
      }
    }
    for (const g of this.gains) {
      try {
        g.disconnect();
      } catch {
        /* already gone */
      }
    }
    for (const node of [this.master, this.clickBus, this.comp]) {
      try {
        node.disconnect();
      } catch {
        /* already gone */
      }
    }
    this.oscs = [];
    this.gains = [];
  }
}
