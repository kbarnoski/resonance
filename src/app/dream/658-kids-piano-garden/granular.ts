// granular.ts — granular resynthesis engine over Karel's recorded piano.
// Every grain's playbackRate is pitch-quantized to a C-major pentatonic ratio
// set, so there are no wrong notes. A kid-safe master chain limits volume,
// brightness and dynamics. Self-contained; no shared imports.

// C-major pentatonic semitone offsets across ±2 octaves.
const PENTATONIC_SEMITONES = [
  -24, -22, -20, -17, -15, // octave -2
  -12, -10, -8, -5, -3, //  octave -1
  0, 2, 4, 7, 9, //          octave 0
  12, 14, 16, 19, 21, //     octave +1
];

/** Map a 0..1 degree to a pentatonic playbackRate ratio (2^(semi/12)). */
export function rateForDegree(degree01: number): number {
  const clamped = Math.max(0, Math.min(0.9999, degree01));
  const idx = Math.floor(clamped * PENTATONIC_SEMITONES.length);
  const semi = PENTATONIC_SEMITONES[idx];
  return Math.pow(2, semi / 12);
}

interface SingingFlower {
  id: number;
  // read position in the source buffer (seconds) and pitch ratio
  readPos: number;
  rate: number;
  // smooth amplitude this flower contributes to its grain cloud
  gain: number;
  bornAt: number;
  fading: boolean;
}

export interface GranularConfig {
  maxVoices: number; // hard cap on concurrent grains
  maxFlowers: number; // cap on simultaneously-singing flowers
}

export class GranularEngine {
  private ctx: AudioContext;
  private buffer: AudioBuffer;
  private master: GainNode;
  private lowpass: BiquadFilterNode;
  private comp: DynamicsCompressorNode;
  private padBus: GainNode;
  private flowerBus: GainNode;

  private liveGrains: { src: AudioBufferSourceNode; endsAt: number }[] = [];
  private flowers: SingingFlower[] = [];
  private nextFlowerId = 1;
  private cfg: GranularConfig;

  // scheduling
  private lastPadGrain = 0;
  private startTime = 0;

  constructor(ctx: AudioContext, buffer: AudioBuffer, cfg: GranularConfig) {
    this.ctx = ctx;
    this.buffer = buffer;
    this.cfg = cfg;

    // Kid-safe master chain: gain (<=0.5) -> lowpass (<=7.5k) -> comp -> dest
    this.master = ctx.createGain();
    this.master.gain.value = 0.0; // fade in
    this.lowpass = ctx.createBiquadFilter();
    this.lowpass.type = "lowpass";
    this.lowpass.frequency.value = 7000;
    this.lowpass.Q.value = 0.4;
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -22;
    this.comp.knee.value = 26;
    this.comp.ratio.value = 4;
    this.comp.attack.value = 0.01;
    this.comp.release.value = 0.28;

    this.padBus = ctx.createGain();
    this.padBus.gain.value = 0.5;
    this.flowerBus = ctx.createGain();
    this.flowerBus.gain.value = 0.85;

    this.padBus.connect(this.master);
    this.flowerBus.connect(this.master);
    this.master.connect(this.lowpass);
    this.lowpass.connect(this.comp);
    this.comp.connect(ctx.destination);
  }

  start() {
    this.startTime = this.ctx.currentTime;
    // gentle fade-in so the start is never a hard transient
    this.master.gain.setValueAtTime(0.0, this.ctx.currentTime);
    this.master.gain.linearRampToValueAtTime(0.5, this.ctx.currentTime + 3.5);
  }

  /** Schedule one windowed grain. window via raised-cosine (Hann) GainNode env. */
  private spawnGrain(
    readPos: number,
    rate: number,
    durMs: number,
    amp: number,
    bus: AudioNode,
    pan: number,
  ) {
    if (this.liveGrains.length >= this.cfg.maxVoices) {
      // steal oldest
      const oldest = this.liveGrains.shift();
      if (oldest) {
        try {
          oldest.src.stop();
        } catch {
          /* already stopped */
        }
      }
    }
    const now = this.ctx.currentTime;
    const dur = durMs / 1000;
    const src = this.ctx.createBufferSource();
    src.buffer = this.buffer;
    src.playbackRate.value = rate;

    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0.0001, now);
    // Hann-like: rise to peak at mid-grain, fall to zero. Use ramps for a
    // soft attack (no harsh transients) — quarter rise, then decay.
    env.gain.linearRampToValueAtTime(amp, now + dur * 0.5);
    env.gain.linearRampToValueAtTime(0.0001, now + dur);

    const panner = this.ctx.createStereoPanner();
    panner.pan.value = Math.max(-1, Math.min(1, pan));

    src.connect(env);
    env.connect(panner);
    panner.connect(bus);

    const offset = Math.max(0, Math.min(this.buffer.duration - dur - 0.001, readPos));
    try {
      src.start(now, offset, dur);
    } catch {
      return;
    }
    src.stop(now + dur + 0.02);
    const rec = { src, endsAt: now + dur };
    this.liveGrains.push(rec);
    src.onended = () => {
      const i = this.liveGrains.indexOf(rec);
      if (i >= 0) this.liveGrains.splice(i, 1);
    };
  }

  /**
   * Called each animation frame. Schedules the always-on pad grain-cloud
   * (driven by the seed) and each singing flower's sustained cloud.
   * @param seedReadPos  read position in seconds chosen by the seed x
   * @param seedRate     pitch ratio chosen by the seed
   * @param seedPan      -1..1 stereo placement from seed x
   */
  tick(seedReadPos: number, seedRate: number, seedPan: number) {
    const now = this.ctx.currentTime;

    // Always-on gentle pad cloud — one grain every ~90ms so it's never silent.
    if (now - this.lastPadGrain > 0.09) {
      this.lastPadGrain = now;
      const jitter = (Math.random() - 0.5) * 0.12; // small read jitter (s)
      this.spawnGrain(
        seedReadPos + jitter,
        seedRate,
        70 + Math.random() * 40,
        0.14,
        this.padBus,
        seedPan * 0.6,
      );
    }

    // Each singing flower: sustained cloud at its own pitch + read position.
    for (const f of this.flowers) {
      // probability gate keeps voice count bounded while feeling continuous
      if (Math.random() < 0.18) {
        const jitter = (Math.random() - 0.5) * 0.08;
        this.spawnGrain(
          f.readPos + jitter,
          f.rate,
          60 + Math.random() * 50,
          0.1 * f.gain,
          this.flowerBus,
          (Math.random() - 0.5) * 1.2,
        );
      }
      // smooth gain toward target (fade in on bloom, fade out on steal)
      const target = f.fading ? 0 : 1;
      f.gain += (target - f.gain) * 0.02;
    }

    // retire fully-faded flowers
    this.flowers = this.flowers.filter((f) => !(f.fading && f.gain < 0.01));
  }

  /** Bloom a new singing flower; returns its id. Steals oldest past the cap. */
  bloomFlower(readPos: number, degree01: number): number {
    const active = this.flowers.filter((f) => !f.fading);
    if (active.length >= this.cfg.maxFlowers) {
      // begin fading the oldest non-fading flower
      active.sort((a, b) => a.bornAt - b.bornAt);
      active[0].fading = true;
    }
    const id = this.nextFlowerId++;
    this.flowers.push({
      id,
      readPos: Math.max(0, Math.min(this.buffer.duration - 0.2, readPos)),
      rate: rateForDegree(degree01),
      gain: 0.0001,
      bornAt: this.ctx.currentTime,
      fading: false,
    });
    return id;
  }

  get singingCount(): number {
    return this.flowers.filter((f) => !f.fading).length;
  }

  get bufferDuration(): number {
    return this.buffer.duration;
  }

  /** Lullaby fade-down over the given seconds. */
  fadeDown(seconds: number) {
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(this.master.gain.value, now);
    this.master.gain.linearRampToValueAtTime(0.0001, now + seconds);
  }

  dispose() {
    for (const g of this.liveGrains) {
      try {
        g.src.stop();
      } catch {
        /* noop */
      }
    }
    this.liveGrains = [];
    this.flowers = [];
    try {
      this.master.disconnect();
      this.lowpass.disconnect();
      this.comp.disconnect();
      this.padBus.disconnect();
      this.flowerBus.disconnect();
    } catch {
      /* noop */
    }
  }
}
