/* ──────────────────────────────────────────────────────────────────────────
   audio.ts — the sounding heart of the séance.

   Two distinct sound sources share one safe master bus:

   1. The INHARMONIC BED — an evolving spectral drone whose partials use
      deliberately NON-integer ratios so it never collapses into a familiar
      chord. It stays a texture, not a cadence. Its amplitudes morph slowly.
      An AnalyserNode taps this bed to compute the spectral DESCRIPTOR that
      drives the next dreamed image.

   2. The RE-SONIFIER — a small bank of (≤64) oscillators, one per spectrogram
      row (log-spaced ~80 Hz … 6 kHz). A column of the dreamed image is read
      every step and its per-row brightness becomes the per-oscillator gain.
      Sweeping the column index left→right plays the picture as sound.

   Everything is summed through a lowpass + DynamicsCompressor and a hard-
   capped master gain so the 64-voice bank can never be harsh or loud.
   ────────────────────────────────────────────────────────────────────────── */

export const N_BINS = 48; // oscillator-bank size (rows of the spectrogram) — ≤64
export const F_LO = 80; // Hz, bottom row
export const F_HI = 6000; // Hz, top row

// Log-spaced centre frequency for spectrogram row r (0 = low … N-1 = high).
export function rowFreq(r: number): number {
  const t = r / (N_BINS - 1);
  return F_LO * Math.pow(F_HI / F_LO, t);
}

// Deliberately inharmonic partial ratios — non-integer, never a chord.
const PARTIALS = [1, 2.07, 3.31, 4.62, 5.4, 6.83, 8.19, 9.74];
const BASE_HZ = 96; // low fundamental for the bed

export interface Descriptor {
  low: number; // 0..1 energy in low band
  mid: number;
  high: number;
  centroid: number; // 0..1 normalised brightness
  flatness: number; // 0..1 roughness / noisiness
  density: number; // 0..1 how much of the spectrum is active
}

export class SeanceAudio {
  ctx: AudioContext;
  master: GainNode;
  lowpass: BiquadFilterNode;
  comp: DynamicsCompressorNode;
  analyser: AnalyserNode;

  // inharmonic bed
  bedGain: GainNode;
  bedOscs: { osc: OscillatorNode; gain: GainNode; ratio: number }[] = [];
  bedLfo: OscillatorNode;
  bedTimer: number | null = null;
  bedPhase = 0;

  // re-sonifier bank
  reGain: GainNode;
  bank: { osc: OscillatorNode; gain: GainNode }[] = [];

  private freqData: Uint8Array<ArrayBuffer>;

  constructor() {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    this.ctx = new AC();

    // master chain: [sources] → lowpass → compressor → master → destination
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.0; // faded in on begin

    this.lowpass = this.ctx.createBiquadFilter();
    this.lowpass.type = "lowpass";
    this.lowpass.frequency.value = 7200;
    this.lowpass.Q.value = 0.4;

    this.comp = this.ctx.createDynamicsCompressor();
    this.comp.threshold.value = -22;
    this.comp.knee.value = 24;
    this.comp.ratio.value = 12;
    this.comp.attack.value = 0.004;
    this.comp.release.value = 0.25;

    this.lowpass.connect(this.comp);
    this.comp.connect(this.master);
    this.master.connect(this.ctx.destination);

    // analyser taps the bed (its spectrum becomes the descriptor)
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.analyser.smoothingTimeConstant = 0.78;
    this.freqData = new Uint8Array(
      new ArrayBuffer(this.analyser.frequencyBinCount)
    );

    // ── inharmonic bed ──────────────────────────────────────────────────────
    this.bedGain = this.ctx.createGain();
    this.bedGain.gain.value = 0.0;
    this.bedGain.connect(this.lowpass);
    this.bedGain.connect(this.analyser); // analyser reads only the bed

    PARTIALS.forEach((ratio, i) => {
      const osc = this.ctx.createOscillator();
      osc.type = i === 0 ? "triangle" : "sine";
      osc.frequency.value = BASE_HZ * ratio;
      osc.detune.value = (i - PARTIALS.length / 2) * 2.5;
      const g = this.ctx.createGain();
      g.gain.value = 0.18 / Math.sqrt(PARTIALS.length);
      osc.connect(g);
      g.connect(this.bedGain);
      osc.start();
      this.bedOscs.push({ osc, gain: g, ratio });
    });

    // slow shimmer on the whole bed
    this.bedLfo = this.ctx.createOscillator();
    this.bedLfo.frequency.value = 0.045;
    const lfoG = this.ctx.createGain();
    lfoG.gain.value = 0.025;
    this.bedLfo.connect(lfoG);
    lfoG.connect(this.bedGain.gain);
    this.bedLfo.start();

    // ── re-sonifier bank ────────────────────────────────────────────────────
    this.reGain = this.ctx.createGain();
    this.reGain.gain.value = 0.0;
    this.reGain.connect(this.lowpass);

    for (let r = 0; r < N_BINS; r++) {
      const osc = this.ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = rowFreq(r);
      // a touch of detune per voice so the bank reads as a field not a comb
      osc.detune.value = ((r % 3) - 1) * 3;
      const g = this.ctx.createGain();
      g.gain.value = 0.0;
      osc.connect(g);
      g.connect(this.reGain);
      osc.start();
      this.bank.push({ osc, gain: g });
    }
  }

  async resume() {
    if (this.ctx.state === "suspended") await this.ctx.resume();
  }

  fadeIn() {
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(this.master.gain.value, now);
    // HARD CAP on master so the summed bank can never be harsh / loud
    this.master.gain.linearRampToValueAtTime(0.34, now + 4);
    this.bedGain.gain.linearRampToValueAtTime(0.16, now + 5);
    this.reGain.gain.linearRampToValueAtTime(0.14, now + 5);
  }

  // Slowly morph the bed partial amplitudes over time so it keeps evolving.
  startBedMorph() {
    if (this.bedTimer !== null) window.clearInterval(this.bedTimer);
    const tick = () => {
      this.bedPhase += 0.06;
      const now = this.ctx.currentTime;
      this.bedOscs.forEach((v, i) => {
        // each partial breathes on its own slow sinusoid
        const env =
          0.5 +
          0.5 * Math.sin(this.bedPhase * (0.5 + i * 0.21) + i * 1.7);
        const target = (0.04 + 0.16 * env) / Math.sqrt(PARTIALS.length);
        v.gain.gain.cancelScheduledValues(now);
        v.gain.gain.setValueAtTime(v.gain.gain.value, now);
        v.gain.gain.linearRampToValueAtTime(target, now + 1.6);
      });
    };
    tick();
    this.bedTimer = window.setInterval(tick, 1600);
  }

  // Read the bed spectrum from the analyser and reduce it to a descriptor.
  readDescriptor(): Descriptor {
    this.analyser.getByteFrequencyData(this.freqData);
    const data = this.freqData;
    const n = data.length;
    const nyquist = this.ctx.sampleRate / 2;

    let lowE = 0,
      midE = 0,
      highE = 0,
      total = 0,
      centroidNum = 0,
      active = 0;
    let logSum = 0,
      linSum = 0,
      counted = 0;

    for (let i = 0; i < n; i++) {
      const v = data[i] / 255;
      const f = (i / n) * nyquist;
      total += v;
      centroidNum += v * f;
      if (v > 0.06) active++;
      if (f < 350) lowE += v;
      else if (f < 1800) midE += v;
      else highE += v;
      // spectral flatness over linear magnitude (geometric / arithmetic mean)
      const m = v + 1e-4;
      logSum += Math.log(m);
      linSum += m;
      counted++;
    }

    const bandTotal = lowE + midE + highE || 1;
    const centroidHz = total > 0 ? centroidNum / total : 0;
    const geo = Math.exp(logSum / counted);
    const arith = linSum / counted;
    const flatness = arith > 0 ? Math.min(1, geo / arith) : 0;

    return {
      low: lowE / bandTotal,
      mid: midE / bandTotal,
      high: highE / bandTotal,
      centroid: Math.min(1, centroidHz / 4000),
      flatness,
      density: Math.min(1, active / (n * 0.5)),
    };
  }

  // Drive the oscillator bank from one spectrogram column (amplitudes 0..1,
  // length N_BINS, bottom row = low pitch). Gains are ramped, never stepped,
  // to avoid zipper clicks.
  setColumn(amps: Float32Array) {
    const now = this.ctx.currentTime;
    const ramp = 0.07; // smooth toward the new column over ~70ms
    for (let r = 0; r < N_BINS; r++) {
      const a = Math.max(0, Math.min(1, amps[r] || 0));
      // perceptual shaping + tiny per-voice ceiling so the sum stays safe
      const g = (a * a) * 0.05;
      const gn = this.bank[r].gain;
      gn.gain.cancelScheduledValues(now);
      gn.gain.setValueAtTime(gn.gain.value, now);
      gn.gain.linearRampToValueAtTime(g, now + ramp);
    }
  }

  // Silence the bank smoothly (used on image cross-fades).
  hushBank() {
    const now = this.ctx.currentTime;
    for (const v of this.bank) {
      v.gain.gain.cancelScheduledValues(now);
      v.gain.gain.setValueAtTime(v.gain.gain.value, now);
      v.gain.gain.linearRampToValueAtTime(0, now + 0.12);
    }
  }

  async stop() {
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(this.master.gain.value, now);
    this.master.gain.linearRampToValueAtTime(0, now + 1.5);
    if (this.bedTimer !== null) {
      window.clearInterval(this.bedTimer);
      this.bedTimer = null;
    }
  }

  async close() {
    if (this.bedTimer !== null) {
      window.clearInterval(this.bedTimer);
      this.bedTimer = null;
    }
    try {
      for (const v of this.bedOscs) v.osc.stop();
      for (const v of this.bank) v.osc.stop();
      this.bedLfo.stop();
    } catch {
      /* already stopped */
    }
    try {
      await this.ctx.close();
    } catch {
      /* already closed */
    }
  }
}
