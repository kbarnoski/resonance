// engine.ts — a granular time-stretch engine over Karel's recording.
//
// The recording is treated as a GRAIN CORPUS. A read-head crawls through it at
// `readRate` (well under real time) so the ~12s source is stretched across many
// minutes; short overlapping grains are sprayed from the crawling position,
// each transposed to a scale offset within the current hour's spread/register.
// There is no loop point — the head wraps to a fresh offset and the arc keeps
// changing density / register / brightness, so the texture never settles.
//
// Ref: granular synthesis & time-stretching — Curtis Roads, "Microsound" (2001).

import type { ArcLive } from "./arc";

// Consonant transposition offsets (pentatonic-ish, in semitones).
const SCALE = [-12, -9, -7, -5, -3, 0, 2, 4, 7, 9, 12];

export class GranularEngine {
  private ctx: AudioContext;
  private buffer: AudioBuffer;
  private voiceBus: GainNode;
  private lp: BiquadFilterNode;
  private hp: BiquadFilterNode;
  private wet: GainNode;
  private master: GainNode;
  private analyser: AnalyserNode;
  private amp: Uint8Array<ArrayBuffer>;

  private running = false;
  private nextGrainTime = 0;
  private readPos = 0; // seconds into the corpus
  private live: ArcLive | null = null;

  constructor(ctx: AudioContext, buffer: AudioBuffer) {
    this.ctx = ctx;
    this.buffer = buffer;

    this.voiceBus = ctx.createGain();
    this.voiceBus.gain.value = 1;

    // Gentle band: highpass removes rumble, lowpass = the "brightness" control.
    this.hp = ctx.createBiquadFilter();
    this.hp.type = "highpass";
    this.hp.frequency.value = 90;

    this.lp = ctx.createBiquadFilter();
    this.lp.type = "lowpass";
    this.lp.frequency.value = 2000;
    this.lp.Q.value = 0.3;

    // Airy reverb from a generated impulse — keeps the pastel texture open.
    const convolver = ctx.createConvolver();
    convolver.buffer = this.buildImpulse(2.6);
    this.wet = ctx.createGain();
    this.wet.gain.value = 0.42;

    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 3;
    comp.attack.value = 0.02;
    comp.release.value = 0.3;

    this.master = ctx.createGain();
    this.master.gain.value = 0.0001;

    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 512;
    this.amp = new Uint8Array(new ArrayBuffer(this.analyser.fftSize));

    // Routing: voices → hp → lp → (dry + wet reverb) → comp → master → out.
    this.voiceBus.connect(this.hp);
    this.hp.connect(this.lp);
    this.lp.connect(comp); // dry
    this.lp.connect(convolver);
    convolver.connect(this.wet);
    this.wet.connect(comp);
    comp.connect(this.master);
    this.master.connect(this.analyser);
    this.master.connect(ctx.destination);
  }

  private buildImpulse(seconds: number): AudioBuffer {
    const rate = this.ctx.sampleRate;
    const len = Math.floor(rate * seconds);
    const imp = this.ctx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const data = imp.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        const t = i / len;
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 2.6);
      }
    }
    return imp;
  }

  start(): void {
    this.running = true;
    this.readPos = Math.random() * Math.max(0.001, this.buffer.duration - 0.5);
    this.nextGrainTime = this.ctx.currentTime + 0.06;
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(0.0001, now);
    this.master.gain.exponentialRampToValueAtTime(0.9, now + 2.5); // soft fade-in
  }

  stop(): void {
    this.running = false;
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(this.master.gain.value, now);
    this.master.gain.exponentialRampToValueAtTime(0.0001, now + 1.2);
  }

  setParams(live: ArcLive): void {
    this.live = live;
    // Brightness → low-pass cutoff (600Hz..7kHz, exponential feel).
    const cutoff = 600 * Math.pow(11.6, live.brightness);
    this.lp.frequency.setTargetAtTime(cutoff, this.ctx.currentTime, 0.2);
    this.voiceBus.gain.setTargetAtTime(0.5 * live.gain, this.ctx.currentTime, 0.3);
  }

  // Called each animation frame. Advances the crawling read-head and schedules
  // any grains due within the look-ahead window.
  tick(dt: number): void {
    if (!this.running || !this.live) return;
    const live = this.live;
    const now = this.ctx.currentTime;
    const lookahead = 0.12;

    // Crawl the read-head; wrap to a fresh offset (no fixed loop point).
    const usable = Math.max(0.2, this.buffer.duration - live.grainDur - 0.05);
    this.readPos += dt * live.readRate;
    if (this.readPos >= usable) {
      this.readPos = 0.02 + Math.random() * 0.3; // re-enter at a new spot
    }

    const interval = 1 / Math.max(0.5, live.density);
    let guard = 0;
    while (this.nextGrainTime < now + lookahead && guard < 64) {
      this.scheduleGrain(this.nextGrainTime, live);
      const jitter = interval * (0.6 + Math.random() * 0.5);
      this.nextGrainTime += jitter;
      guard++;
    }
    if (this.nextGrainTime < now) this.nextGrainTime = now + 0.02;
  }

  private scheduleGrain(when: number, live: ArcLive): void {
    const layers = live.layers;
    for (let v = 0; v < layers; v++) {
      // Pick a consonant offset within this hour's spread, plus its register.
      const inRange = SCALE.filter((s) => Math.abs(s) <= live.spread + 0.5);
      const pool = inRange.length ? inRange : [0];
      const offset = pool[(Math.random() * pool.length) | 0];
      const semis = live.register + offset;
      const rate = Math.pow(2, semis / 12);

      const src = this.ctx.createBufferSource();
      src.buffer = this.buffer;
      src.playbackRate.value = rate;

      const g = this.ctx.createGain();
      const dur = live.grainDur * (0.85 + Math.random() * 0.4);
      const peak = (0.16 / Math.sqrt(layers)) * (0.7 + Math.random() * 0.5);
      // Windowed envelope (raised-cosine feel via ramps): soft in, soft out.
      g.gain.setValueAtTime(0.0001, when);
      g.gain.linearRampToValueAtTime(peak, when + dur * 0.45);
      g.gain.linearRampToValueAtTime(0.0001, when + dur);

      const pan = this.ctx.createStereoPanner();
      pan.pan.value = (Math.random() * 2 - 1) * 0.7;

      const offsetJitter = (Math.random() * 2 - 1) * 0.02;
      const readAt = Math.min(
        Math.max(0.001, this.readPos + offsetJitter),
        Math.max(0.002, this.buffer.duration - 0.05),
      );

      src.connect(g).connect(pan).connect(this.voiceBus);
      try {
        src.start(when, readAt, dur * rate + 0.02);
        src.stop(when + dur + 0.05);
      } catch {
        // start can throw if `when` is already in the past — skip this grain.
      }
    }
  }

  // A soft, longer cluster to mark the passing of an hour (chime of the hour).
  ringHour(register: number): void {
    if (!this.running) return;
    const when = this.ctx.currentTime + 0.05;
    const chord = [0, 7, 12];
    chord.forEach((c, i) => {
      const src = this.ctx.createBufferSource();
      src.buffer = this.buffer;
      src.playbackRate.value = Math.pow(2, (register + c) / 12);
      const g = this.ctx.createGain();
      const dur = 2.2;
      const t = when + i * 0.06;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.05, t + 0.4);
      g.gain.exponentialRampToValueAtTime(0.0002, t + dur);
      const readAt = Math.min(0.4, Math.max(0.02, this.buffer.duration * 0.35));
      src.connect(g).connect(this.voiceBus);
      try {
        src.start(t, readAt, dur * src.playbackRate.value);
        src.stop(t + dur + 0.1);
      } catch {
        /* past-time guard */
      }
    });
  }

  // RMS level 0..1 for the visuals.
  level(): number {
    this.analyser.getByteTimeDomainData(this.amp);
    let sum = 0;
    for (let i = 0; i < this.amp.length; i++) {
      const x = (this.amp[i] - 128) / 128;
      sum += x * x;
    }
    return Math.min(1, Math.sqrt(sum / this.amp.length) * 2.4);
  }

  dispose(): void {
    this.running = false;
    try {
      this.master.disconnect();
      this.voiceBus.disconnect();
    } catch {
      /* already gone */
    }
  }
}
