// audio.ts — modal physical-modeling bronze gamelan, driven by live sea-state.
//
// Each "key" is struck like a bronze metallophone: a short noise/impulse
// exciter feeds a bank of high-Q BiquadFilter bandpass resonators tuned to
// INHARMONIC partial ratios (the bronze metallophone spectrum), pitched to a
// slendro or pelög scale. The resonators ring and decay.
//
// THE CONSEQUENCE (the point of the piece) — one `roughness` value from the
// sea simultaneously:
//   (a) densifies the strike rate,
//   (b) drops the register lower,
//   (c) lowers resonator Q (more clang, less sing),
//   (d) detunes each bronze partial by up to ±35 cents,
// so heavy seas roughen into a beating, slightly-detuned clang while calm
// seas stay sparse, high and sweet. `period` → base tempo, `direction` →
// stereo pan, `swell` → an underlying low drone swell.
//
// Two independent "sea voices" (A and B) let you crossfade two oceans at once.
// Everything passes through a compressor + brick-wall limiter; 2s fade-in on
// start; panic mute. An AnalyserNode TAPS the master for visuals only — it is
// never routed to output.

import type { SeaDrive } from "./marine";

export const SLENDRO_CENTS = [0, 231, 474, 717, 955];
export const PELOG_CENTS = [0, 120, 258, 539, 675, 785, 943];

export type TuningName = "slendro" | "pelog";

export function tuningCents(name: TuningName): number[] {
  return name === "slendro" ? SLENDRO_CENTS : PELOG_CENTS;
}

// Inharmonic partial ratios of a struck bronze metallophone (saron/gendér-ish):
// not integer multiples — that inharmonicity is what makes bronze sound bronze.
const BRONZE_PARTIALS = [1.0, 2.76, 5.4, 8.93];
const PARTIAL_GAINS = [1.0, 0.55, 0.32, 0.18];

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const centsToRatio = (c: number) => Math.pow(2, c / 1200);

// A single sea voice: its own strike scheduler + drone, driven by its own
// SeaDrive. Two of these (A,B) are crossfaded by the engine.
class SeaVoice {
  private ctx: AudioContext;
  private out: GainNode; // crossfade-controlled bus into the engine
  private noiseBuffer: AudioBuffer;
  private droneGain: GainNode;
  private droneFilter: BiquadFilterNode;
  private droneVoices: OscillatorNode[] = [];

  tuning: TuningName = "slendro";
  snap = false; // groove quantize toggle
  drive: SeaDrive = { roughness: 0.3, period: 8, direction: 180, swell: 0.3 };

  // scheduler state
  private nextStrikeAt = 0; // ctx time of next free/quantized strike
  private gridStep = 0; // current quantized grid spacing (s) when snapping

  constructor(ctx: AudioContext, noiseBuffer: AudioBuffer, master: GainNode) {
    this.ctx = ctx;
    this.noiseBuffer = noiseBuffer;

    this.out = ctx.createGain();
    this.out.gain.value = 1;
    this.out.connect(master);

    // underlying low drone swell (driven by `swell`)
    this.droneGain = ctx.createGain();
    this.droneGain.gain.value = 0.0001;
    this.droneFilter = ctx.createBiquadFilter();
    this.droneFilter.type = "lowpass";
    this.droneFilter.frequency.value = 240;
    this.droneFilter.Q.value = 0.7;
    this.droneGain.connect(this.droneFilter);
    this.droneFilter.connect(this.out);

    const droneBase = 55; // ~A1 gong-ish bed
    const partials = [1, 1.5, 2.01, 3.0];
    for (const p of partials) {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = droneBase * p;
      const g = ctx.createGain();
      g.gain.value = 1 / partials.length;
      osc.connect(g);
      g.connect(this.droneGain);
      osc.start();
      this.droneVoices.push(osc);
    }

    this.nextStrikeAt = ctx.currentTime + 0.2;
  }

  setCrossfadeGain(g: number) {
    const now = this.ctx.currentTime;
    this.out.gain.cancelScheduledValues(now);
    this.out.gain.setTargetAtTime(Math.max(0.0001, g), now, 0.08);
  }

  setDrive(d: SeaDrive) {
    this.drive = d;
    // drone swell tracks `swell`: louder + brighter for big long-period swell.
    const now = this.ctx.currentTime;
    const level = 0.02 + d.swell * 0.16;
    this.droneGain.gain.setTargetAtTime(level, now, 1.5);
    this.droneFilter.frequency.setTargetAtTime(120 + d.swell * 380, now, 2.0);
  }

  // Pick a scale frequency. `register` 0..1 (1 = high/calm). Rough seas pull
  // the whole register lower.
  private pickFreq(register: number): number {
    const cents = tuningCents(this.tuning);
    const n = cents.length;
    const octaves = 3;
    const totalSteps = octaves * n;
    const idx = Math.min(
      totalSteps - 1,
      Math.max(0, Math.round(register * (totalSteps - 1))),
    );
    const octave = Math.floor(idx / n);
    const degree = idx % n;
    // ~G2 base; rough seas already lowered `register`, dropping the octave.
    const base = 98.0;
    return base * Math.pow(2, octave + cents[degree] / 1200);
  }

  // Strike one bronze key NOW (or at `when`). The roughness consequence lives
  // here: detune, Q, register and brightness all bend with d.roughness.
  strike(when: number) {
    const ctx = this.ctx;
    const d = this.drive;
    const r = clamp01(d.roughness);

    // (b) register: rough seas drop lower. Add jitter so it is a melody.
    const register = clamp01((1 - r) * 0.85 + Math.random() * 0.25 - 0.05);
    const freq = this.pickFreq(register);

    // (c) Q: calm → high-Q (sings), rough → low-Q (clang). 38 → 6.
    const q = 6 + (1 - r) * 32;
    // strike loudness/decay: rough strikes shorter + a touch louder/harsher.
    const decay = 2.6 - r * 1.6; // 2.6s calm … 1.0s rough
    const peak = 0.18 + r * 0.12;

    // (a)+(d) handled below: detune per partial up to ±35 cents with roughness.
    const detuneSpan = 35 * r; // cents

    // pan from wave direction (0..360 → -1..1)
    const pan = Math.cos((d.direction * Math.PI) / 180);
    const panner = ctx.createStereoPanner();
    panner.pan.value = Math.max(-1, Math.min(1, pan));

    const voiceGain = ctx.createGain();
    voiceGain.gain.value = 0.0001;
    voiceGain.connect(panner);
    panner.connect(this.out);

    // exciter: short filtered noise burst (the mallet hitting bronze)
    const noise = ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;
    const exFilter = ctx.createBiquadFilter();
    exFilter.type = "bandpass";
    exFilter.frequency.value = Math.min(9000, freq * 3 + 800);
    exFilter.Q.value = 0.7;
    const exGain = ctx.createGain();
    // brighter, harder excitation for rough seas
    exGain.gain.setValueAtTime(peak * (0.5 + r * 0.5), when);
    exGain.gain.exponentialRampToValueAtTime(0.0001, when + 0.05);

    noise.connect(exFilter);
    exFilter.connect(exGain);

    const resonators: BiquadFilterNode[] = [];
    for (let i = 0; i < BRONZE_PARTIALS.length; i++) {
      const ratio = BRONZE_PARTIALS[i];
      // (d) detune this partial by a random amount within ±detuneSpan cents.
      const detune = (Math.random() * 2 - 1) * detuneSpan;
      const partialFreq = Math.min(
        18000,
        freq * ratio * centsToRatio(detune),
      );
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = partialFreq;
      bp.Q.value = q * (1 - i * 0.12); // higher partials a touch less ringy
      const pg = ctx.createGain();
      pg.gain.value = PARTIAL_GAINS[i];
      // each resonator is excited by the SAME noise burst
      exGain.connect(bp);
      bp.connect(pg);
      pg.connect(voiceGain);
      resonators.push(bp);
    }

    // ring envelope on the summed resonator bus
    voiceGain.gain.setValueAtTime(0.0001, when);
    voiceGain.gain.exponentialRampToValueAtTime(peak, when + 0.004);
    voiceGain.gain.exponentialRampToValueAtTime(0.0001, when + decay);

    noise.start(when);
    noise.stop(when + 0.08);

    const cleanup = () => {
      try {
        noise.disconnect();
        exFilter.disconnect();
        exGain.disconnect();
        for (const bp of resonators) bp.disconnect();
        voiceGain.disconnect();
        panner.disconnect();
      } catch {
        /* already torn down */
      }
    };
    noise.onended = () => {
      // resonators keep ringing after the exciter stops; clean up at decay end.
      setTimeout(cleanup, decay * 1000 + 300);
    };
  }

  /**
   * Advance this voice's scheduler up to `horizon` (ctx time). Schedules
   * strikes either freely (Poisson-ish raw ocean rhythm) or quantized to a
   * tempo grid derived from the wave period when `snap` is on.
   */
  schedule(now: number, horizon: number) {
    const d = this.drive;
    const r = clamp01(d.roughness);

    if (this.snap) {
      // groove: one beat per wave period, subdivided 2× → quantized strikes.
      // The grid spacing follows `period`; density (probability per slot)
      // follows roughness, so storms fill the groove, calm seas leave gaps.
      const beat = Math.max(0.18, d.period / 2);
      this.gridStep = beat;
      if (this.nextStrikeAt < now) this.nextStrikeAt = now;
      while (this.nextStrikeAt < horizon) {
        // density 0.25 (calm) … 0.95 (storm)
        const density = 0.25 + r * 0.7;
        if (Math.random() < density) this.strike(this.nextStrikeAt);
        this.nextStrikeAt += beat;
      }
    } else {
      // free: Poisson-ish arrivals. Mean rate rises sharply with roughness.
      // calm ~0.8 strikes/s … storm ~7 strikes/s.
      const rate = 0.8 + r * 6.2;
      if (this.nextStrikeAt < now) this.nextStrikeAt = now;
      while (this.nextStrikeAt < horizon) {
        this.strike(this.nextStrikeAt);
        // exponential inter-arrival gap
        const u = Math.max(1e-4, Math.random());
        this.nextStrikeAt += -Math.log(u) / rate;
      }
    }
  }

  dispose() {
    try {
      for (const osc of this.droneVoices) {
        try {
          osc.stop();
        } catch {
          /* noop */
        }
        osc.disconnect();
      }
      this.droneGain.disconnect();
      this.droneFilter.disconnect();
      this.out.disconnect();
    } catch {
      /* noop */
    }
  }
}

export class GamelanEngine {
  readonly ctx: AudioContext;
  readonly analyser: AnalyserNode;
  private master: GainNode;
  private compressor: DynamicsCompressorNode;
  private limiter: DynamicsCompressorNode;
  private fadeGain: GainNode; // 2s fade-in + panic mute live here

  readonly voiceA: SeaVoice;
  readonly voiceB: SeaVoice;

  private raf = 0;
  private disposed = false;
  private crossfade = 0; // 0 = A only, 1 = B only
  muted = false;

  constructor() {
    type WithWebkit = typeof window & {
      webkitAudioContext?: typeof AudioContext;
    };
    const Ctor =
      window.AudioContext || (window as WithWebkit).webkitAudioContext;
    this.ctx = new Ctor();
    const ctx = this.ctx;

    // master chain: voices → master → compressor → limiter → fade → out
    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -2;
    this.limiter.knee.value = 0;
    this.limiter.ratio.value = 20;
    this.limiter.attack.value = 0.002;
    this.limiter.release.value = 0.18;

    this.compressor = ctx.createDynamicsCompressor();
    this.compressor.threshold.value = -16;
    this.compressor.knee.value = 22;
    this.compressor.ratio.value = 4;
    this.compressor.attack.value = 0.006;
    this.compressor.release.value = 0.25;

    this.master = ctx.createGain();
    this.master.gain.value = 0.8;

    this.fadeGain = ctx.createGain();
    this.fadeGain.gain.value = 0.0001;

    this.master.connect(this.compressor);
    this.compressor.connect(this.limiter);
    this.limiter.connect(this.fadeGain);
    this.fadeGain.connect(ctx.destination);

    // Analyser TAPS the master for visuals — NOT routed to output.
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.analyser.smoothingTimeConstant = 0.82;
    this.master.connect(this.analyser);

    // shared noise buffer for all exciters
    const len = Math.floor(ctx.sampleRate * 0.3);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < len; i++) ch[i] = Math.random() * 2 - 1;

    this.voiceA = new SeaVoice(ctx, buf, this.master);
    this.voiceB = new SeaVoice(ctx, buf, this.master);
    this.applyCrossfade();

    // 2s gentle fade-in.
    const now = ctx.currentTime;
    this.fadeGain.gain.setValueAtTime(0.0001, now);
    this.fadeGain.gain.exponentialRampToValueAtTime(1.0, now + 2.0);

    this.loop();
  }

  resume() {
    if (this.ctx.state !== "running") void this.ctx.resume();
  }

  setTuning(t: TuningName) {
    this.voiceA.tuning = t;
    this.voiceB.tuning = t;
  }

  setSnap(on: boolean) {
    this.voiceA.snap = on;
    this.voiceB.snap = on;
  }

  // 0 = A only, 1 = B only, middle = both seas layered.
  setCrossfade(x: number) {
    this.crossfade = Math.min(1, Math.max(0, x));
    this.applyCrossfade();
  }

  private applyCrossfade() {
    // equal-power-ish, gain-limited so layered middle stays musical.
    const x = this.crossfade;
    const gA = Math.cos((x * Math.PI) / 2);
    const gB = Math.sin((x * Math.PI) / 2);
    this.voiceA.setCrossfadeGain(gA * 0.95);
    this.voiceB.setCrossfadeGain(gB * 0.95);
  }

  setMuted(m: boolean) {
    this.muted = m;
    const now = this.ctx.currentTime;
    this.fadeGain.gain.cancelScheduledValues(now);
    this.fadeGain.gain.setTargetAtTime(m ? 0.0001 : 1.0, now, 0.06);
  }

  // Drive the master spectrum tap for the shader: returns 0..1 loudness.
  masterLevel(): number {
    const arr = new Uint8Array(this.analyser.fftSize);
    this.analyser.getByteTimeDomainData(arr);
    let sum = 0;
    for (let i = 0; i < arr.length; i++) {
      const v = (arr[i] - 128) / 128;
      sum += v * v;
    }
    return Math.min(1, Math.sqrt(sum / arr.length) * 3.2);
  }

  private loop = () => {
    if (this.disposed) return;
    const now = this.ctx.currentTime;
    const horizon = now + 0.2; // schedule 200ms ahead
    this.voiceA.schedule(now, horizon);
    this.voiceB.schedule(now, horizon);
    this.raf = requestAnimationFrame(this.loop);
  };

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.voiceA.dispose();
    this.voiceB.dispose();
    try {
      this.master.disconnect();
      this.compressor.disconnect();
      this.limiter.disconnect();
      this.fadeGain.disconnect();
      this.analyser.disconnect();
    } catch {
      /* noop */
    }
    void this.ctx.close();
  }
}
