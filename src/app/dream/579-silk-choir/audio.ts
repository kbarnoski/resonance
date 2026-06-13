/**
 * audio.ts — the warm choir/bowed-string voices that BEND with the silk.
 *
 * The sheet is split into a handful of vertical regions (voices). Each voice
 * sustains one note of a consonant just-intonation chord around A2 (110 Hz).
 * Its pitch and timbre glide CONTINUOUSLY with that region's tension: pulling
 * the silk taut raises the pitch a little and opens a lowpass (brighter, more
 * present); letting it billow lets the voice sigh back home. There is no
 * discrete note-tapping anywhere — this is an Ondes-Martenot / Theremin-style
 * continuously-bent instrument expressed through cloth.
 *
 * Every parameter move is a setTargetAtTime portamento so nothing clicks. The
 * master chain is kids-safe: gain -> lowpass(<=8kHz) -> compressor -> out.
 */

// Just-intonation chord over A2: 1/1, 9/8, 5/4, 3/2, 2/1, 9/4 — a bright,
// open major-add9 voicing. Six voices = six regions.
const ROOT_HZ = 110; // A2
const RATIOS = [1, 9 / 8, 5 / 4, 3 / 2, 2, 9 / 4];

export const VOICE_COUNT = RATIOS.length;

type Voice = {
  base: number; // rest frequency (Hz)
  oscA: OscillatorNode; // detuned saw pair -> bowed/choir body
  oscB: OscillatorNode;
  oscSub: OscillatorNode; // soft triangle underneath for warmth
  mix: GainNode;
  filter: BiquadFilterNode; // per-voice brightness opens with tension
  level: GainNode;
};

export class SilkChoir {
  readonly ctx: AudioContext;
  private master: GainNode;
  private voices: Voice[] = [];
  private started = false;

  constructor() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const Ctor = window.AudioContext || (window as any).webkitAudioContext;
    this.ctx = new Ctor();

    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.0001;

    // Kids-safe master chain.
    const tame = ctx.createBiquadFilter();
    tame.type = "lowpass";
    tame.frequency.value = 7600; // <= 8 kHz
    tame.Q.value = 0.5;

    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -10;
    comp.knee.value = 8;
    comp.ratio.value = 20;
    comp.attack.value = 0.01;
    comp.release.value = 0.25;

    this.master.connect(tame);
    tame.connect(comp);
    comp.connect(ctx.destination);
  }

  /** Build the voices and fade the choir in. Call inside a user gesture. */
  start(): void {
    if (this.started) return;
    this.started = true;
    const ctx = this.ctx;
    if (ctx.state === "suspended") void ctx.resume();
    const now = ctx.currentTime;

    for (let i = 0; i < VOICE_COUNT; i++) {
      const base = ROOT_HZ * RATIOS[i];

      const oscA = ctx.createOscillator();
      oscA.type = "sawtooth";
      oscA.frequency.value = base;
      oscA.detune.value = -6;

      const oscB = ctx.createOscillator();
      oscB.type = "sawtooth";
      oscB.frequency.value = base;
      oscB.detune.value = 6;

      const oscSub = ctx.createOscillator();
      oscSub.type = "triangle";
      oscSub.frequency.value = base;

      const mix = ctx.createGain();
      mix.gain.value = 0.5;
      oscA.connect(mix);
      oscB.connect(mix);
      const subMix = ctx.createGain();
      subMix.gain.value = 0.32;
      oscSub.connect(subMix);

      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 600; // dark at rest
      filter.Q.value = 1.2;
      mix.connect(filter);
      subMix.connect(filter);

      const level = ctx.createGain();
      // Lower voices a touch louder for a warm bed.
      level.gain.value = 0.0001;
      filter.connect(level);
      level.connect(this.master);

      oscA.start(now);
      oscB.start(now);
      oscSub.start(now);

      // Slow swell so it never clicks in.
      const target = 0.16 / Math.sqrt(i + 1);
      level.gain.setTargetAtTime(target, now, 1.4);

      this.voices.push({ base, oscA, oscB, oscSub, mix, filter, level });
    }

    // Bring up the master gently.
    this.master.gain.setTargetAtTime(0.7, now, 0.8);
  }

  /**
   * Drive the choir from the membrane's per-region tension (0..1).
   * Pitch glides up to ~+5 semitones at full stretch; the lowpass opens and the
   * voice gets a little louder/brighter. All via setTargetAtTime portamento.
   */
  setTensions(tensions: number[]): void {
    if (!this.started) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    for (let i = 0; i < this.voices.length; i++) {
      const v = this.voices[i];
      const t = Math.max(0, Math.min(1, tensions[i] ?? 0));
      // Continuous pitch bend: up to ~5 semitones (factor 2^(5/12)).
      const bend = Math.pow(2, (t * 5) / 12);
      const f = v.base * bend;
      const glide = 0.09; // smooth, audibly continuous
      v.oscA.frequency.setTargetAtTime(f, now, glide);
      v.oscB.frequency.setTargetAtTime(f, now, glide);
      v.oscSub.frequency.setTargetAtTime(f * 0.5, now, glide);

      // Brighten with tension: 600 Hz -> ~3.6 kHz.
      const cutoff = 600 + t * 3000;
      v.filter.frequency.setTargetAtTime(cutoff, now, 0.12);

      // Swell slightly when pulled.
      const base = 0.16 / Math.sqrt(i + 1);
      v.level.gain.setTargetAtTime(base * (1 + t * 0.6), now, 0.15);
    }
  }

  /** Fade everything out and free the context. */
  stop(): void {
    const ctx = this.ctx;
    const now = ctx.currentTime;
    this.master.gain.setTargetAtTime(0.0001, now, 0.3);
    setTimeout(() => {
      for (const v of this.voices) {
        try {
          v.oscA.stop();
          v.oscB.stop();
          v.oscSub.stop();
        } catch {
          /* already stopped */
        }
      }
      void ctx.close();
    }, 600);
  }
}
