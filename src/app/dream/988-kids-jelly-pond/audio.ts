// audio.ts — kids-safe Web Audio engine for the singing pond.
// The fluid's OWN motion drives the sound:
//   - stirring speed / local velocity  -> soft continuous shimmer voice
//   - splash (fast shove of a cluster)  -> gentle marimba/bell arpeggio up the scale
//   - pooled density under the finger    -> fuller low chord (calm pool) vs bright sparse (scattered)
//   - always-on water-drone pad so it is never silent
//
// Master chain (kids-safe): masterGain ~0.26 -> lowpass ~6.5kHz -> compressor(-10, 20:1).
// All attacks >= 30ms. No harsh or sudden transients.

// A warm Lydian palette (no "wrong" notes). Hz values, ~F Lydian over two octaves.
// F G A B C D E F G A  (Lydian raises the 4th -> B natural), kept gentle and in-key.
const SCALE_HZ: number[] = [
  174.61, // F3
  196.0, // G3
  220.0, // A3
  246.94, // B3 (Lydian #4)
  261.63, // C4
  293.66, // D4
  329.63, // E4
  349.23, // F4
  392.0, // G4
  440.0, // A4
];

// A soft chord pool (root + fifth + tenth) we open up under a big calm pool.
const POOL_CHORD_HZ: number[] = [87.31, 130.81, 174.61, 220.0]; // F2 C3 F3 A3

export interface MotionFrame {
  // 0..1 normalised average speed of particles the finger is touching / overall stir energy
  stir: number;
  // 0..1 how much water is pooled under the finger right now (density)
  pool: number;
  // 0..1 peak local velocity this frame (for shimmer pitch / brightness)
  peak: number;
  // true on the frame a fast cluster-shove splash is detected
  splash: boolean;
  // 0..1 strength of that splash
  splashStrength: number;
}

export class PondAudio {
  private ctx: AudioContext;
  private master: GainNode;
  private lowpass: BiquadFilterNode;
  private comp: DynamicsCompressorNode;

  // always-on water drone pad
  private droneGain: GainNode;
  private droneOscs: OscillatorNode[] = [];
  private droneLfo: OscillatorNode;
  private droneLfoGain: GainNode;

  // continuous shimmer voice (driven by stir/peak)
  private shimmerOsc: OscillatorNode;
  private shimmerGain: GainNode;
  private shimmerFilter: BiquadFilterNode;

  // pool chord voices (driven by pooled density)
  private poolGain: GainNode;
  private poolOscs: OscillatorNode[] = [];

  private lastSparkle = 0;
  private started = false;

  constructor() {
    type WebkitWindow = Window & { webkitAudioContext?: typeof AudioContext };
    const w = window as WebkitWindow;
    const Ctor = window.AudioContext ?? w.webkitAudioContext;
    if (!Ctor) throw new Error("Web Audio API unavailable");
    this.ctx = new Ctor();

    // ---- master chain ----
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.0; // fade in on start

    this.lowpass = this.ctx.createBiquadFilter();
    this.lowpass.type = "lowpass";
    this.lowpass.frequency.value = 6500;
    this.lowpass.Q.value = 0.4;

    this.comp = this.ctx.createDynamicsCompressor();
    this.comp.threshold.value = -10;
    this.comp.knee.value = 24;
    this.comp.ratio.value = 20;
    this.comp.attack.value = 0.02;
    this.comp.release.value = 0.25;

    this.master.connect(this.lowpass);
    this.lowpass.connect(this.comp);
    this.comp.connect(this.ctx.destination);

    // ---- water drone pad (two detuned saws softened) ----
    this.droneGain = this.ctx.createGain();
    this.droneGain.gain.value = 0.16;
    this.droneGain.connect(this.master);

    const droneFilter = this.ctx.createBiquadFilter();
    droneFilter.type = "lowpass";
    droneFilter.frequency.value = 900;
    droneFilter.Q.value = 0.3;
    droneFilter.connect(this.droneGain);

    [87.31, 130.81].forEach((hz, i) => {
      const o = this.ctx.createOscillator();
      o.type = "triangle";
      o.frequency.value = hz;
      o.detune.value = i === 0 ? -6 : 7;
      o.connect(droneFilter);
      this.droneOscs.push(o);
    });

    // slow breathing of the drone filter
    this.droneLfo = this.ctx.createOscillator();
    this.droneLfo.type = "sine";
    this.droneLfo.frequency.value = 0.07;
    this.droneLfoGain = this.ctx.createGain();
    this.droneLfoGain.gain.value = 220;
    this.droneLfo.connect(this.droneLfoGain);
    this.droneLfoGain.connect(droneFilter.frequency);

    // ---- continuous shimmer voice ----
    this.shimmerFilter = this.ctx.createBiquadFilter();
    this.shimmerFilter.type = "bandpass";
    this.shimmerFilter.frequency.value = 1200;
    this.shimmerFilter.Q.value = 2.0;
    this.shimmerFilter.connect(this.master);

    this.shimmerGain = this.ctx.createGain();
    this.shimmerGain.gain.value = 0.0;
    this.shimmerGain.connect(this.shimmerFilter);

    this.shimmerOsc = this.ctx.createOscillator();
    this.shimmerOsc.type = "sine";
    this.shimmerOsc.frequency.value = SCALE_HZ[4];
    this.shimmerOsc.connect(this.shimmerGain);

    // ---- pool chord voices ----
    this.poolGain = this.ctx.createGain();
    this.poolGain.gain.value = 0.0;
    const poolFilter = this.ctx.createBiquadFilter();
    poolFilter.type = "lowpass";
    poolFilter.frequency.value = 1400;
    poolFilter.Q.value = 0.5;
    this.poolGain.connect(poolFilter);
    poolFilter.connect(this.master);

    POOL_CHORD_HZ.forEach((hz) => {
      const o = this.ctx.createOscillator();
      o.type = "triangle";
      o.frequency.value = hz;
      o.detune.value = (Math.random() - 0.5) * 6;
      o.connect(this.poolGain);
      this.poolOscs.push(o);
    });
  }

  /** Must be called from a user gesture (Start button). Pre-inits everything. */
  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    if (this.ctx.state === "suspended") await this.ctx.resume();
    const t = this.ctx.currentTime;
    this.droneOscs.forEach((o) => o.start());
    this.droneLfo.start();
    this.shimmerOsc.start();
    this.poolOscs.forEach((o) => o.start());
    // gentle master fade-in (>= 30ms attack, here ~600ms)
    this.master.gain.setValueAtTime(0.0001, t);
    this.master.gain.linearRampToValueAtTime(0.26, t + 0.6);
  }

  /** Snap a frequency to the nearest scale note (never a wrong note). */
  private snap(idx: number): number {
    const i = Math.max(0, Math.min(SCALE_HZ.length - 1, Math.round(idx)));
    return SCALE_HZ[i];
  }

  /**
   * Feed the fluid's motion into the instrument every animation frame.
   * The simulated motion IS the instrument.
   */
  update(frame: MotionFrame): void {
    if (!this.started) return;
    const t = this.ctx.currentTime;

    // --- continuous shimmer voice from stir + peak velocity ---
    // pitch climbs up the scale with peak velocity; volume follows stir energy
    const noteIdx = frame.peak * (SCALE_HZ.length - 1);
    const targetHz = this.snap(noteIdx);
    this.shimmerOsc.frequency.setTargetAtTime(targetHz, t, 0.08);
    const shimVol = 0.12 * Math.min(1, frame.stir * 1.3);
    this.shimmerGain.gain.setTargetAtTime(shimVol, t, 0.05); // smooth, >=30ms feel
    // brighter filter when fast/scattered, mellower when slow
    this.shimmerFilter.frequency.setTargetAtTime(
      900 + frame.peak * 3200,
      t,
      0.1,
    );

    // --- pool chord from pooled density ---
    // big calm pool -> fuller, louder, lower-passed chord. scattered -> quiet.
    const poolVol = 0.13 * Math.pow(frame.pool, 1.2);
    this.poolGain.gain.setTargetAtTime(poolVol, t, 0.12);

    // --- drone gently breathes with overall stir so it feels alive ---
    this.droneGain.gain.setTargetAtTime(0.13 + frame.stir * 0.06, t, 0.2);

    // --- splash -> gentle marimba/bell arpeggio up the scale ---
    if (frame.splash && t - this.lastSparkle > 0.09) {
      this.lastSparkle = t;
      this.sparkle(frame.splashStrength, frame.pool);
    }
  }

  /** A short, soft arpeggio up the scale — bell/marimba sparkle. */
  private sparkle(strength: number, pool: number): void {
    const t = this.ctx.currentTime;
    // bigger calm pool -> start lower & fuller; scattered -> brighter & sparser
    const baseIdx = Math.floor((1 - pool) * 4); // 0..4
    const steps = 3 + Math.round(strength * 2); // 3..5 notes
    const dest = this.ctx.createGain();
    dest.gain.value = 0.18 + strength * 0.12;
    dest.connect(this.master);

    for (let i = 0; i < steps; i++) {
      const idx = Math.min(SCALE_HZ.length - 1, baseIdx + i * 2);
      const hz = SCALE_HZ[idx];
      const o = this.ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = hz;
      const g = this.ctx.createGain();
      const onset = t + i * 0.055;
      // soft bell envelope: >=30ms attack, gentle decay
      g.gain.setValueAtTime(0.0001, onset);
      g.gain.linearRampToValueAtTime(0.22, onset + 0.035);
      g.gain.exponentialRampToValueAtTime(0.001, onset + 0.5);
      // tiny shimmer partial for marimba sparkle
      const part = this.ctx.createOscillator();
      part.type = "sine";
      part.frequency.value = hz * 2;
      const pg = this.ctx.createGain();
      pg.gain.setValueAtTime(0.0001, onset);
      pg.gain.linearRampToValueAtTime(0.06, onset + 0.035);
      pg.gain.exponentialRampToValueAtTime(0.001, onset + 0.32);
      o.connect(g);
      part.connect(pg);
      g.connect(dest);
      pg.connect(dest);
      o.start(onset);
      part.start(onset);
      o.stop(onset + 0.55);
      part.stop(onset + 0.4);
    }
    // tidy up
    window.setTimeout(() => dest.disconnect(), 1200);
  }

  /** Full teardown. */
  async close(): Promise<void> {
    try {
      const t = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(t);
      this.master.gain.setTargetAtTime(0.0001, t, 0.1);
      this.droneOscs.forEach((o) => o.stop(t + 0.3));
      this.droneLfo.stop(t + 0.3);
      this.shimmerOsc.stop(t + 0.3);
      this.poolOscs.forEach((o) => o.stop(t + 0.3));
    } catch {
      // already stopped
    }
    try {
      await this.ctx.close();
    } catch {
      // already closed
    }
  }
}
