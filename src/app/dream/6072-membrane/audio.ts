// Self-playing generative audio bed for 6072-membrane, plus an 8-band
// AnalyserNode feature extractor. Master gain is kept low and routed through
// a DynamicsCompressor limiter. An optional microphone source can replace the
// generative bed for live performance; it degrades gracefully if denied.

import { makeRng, SEED } from "./prng";

export const BAND_COUNT = 8;

/** Build a short, code-generated impulse response for a soft cathedral tail. */
function buildImpulse(ctx: AudioContext): AudioBuffer {
  const rng = makeRng(SEED ^ 0x51ee);
  const len = Math.floor(ctx.sampleRate * 2.6);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      const decay = Math.pow(1 - i / len, 2.6);
      d[i] = (rng() * 2 - 1) * decay;
    }
  }
  return buf;
}

export class MembraneAudio {
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private freq: Uint8Array = new Uint8Array(0);
  private master: GainNode | null = null;
  private voices: OscillatorNode[] = [];
  private lfos: OscillatorNode[] = [];
  private noiseSrc: AudioBufferSourceNode | null = null;
  private schedTimer: number | null = null;
  private nextNoteAt = 0;
  private step = 0;
  private rng = makeRng(SEED ^ 0xa17c);
  private micStream: MediaStream | null = null;

  readonly bands = new Float32Array(BAND_COUNT);
  private smoothed = new Float32Array(BAND_COUNT);

  /** True once an AudioContext exists and is running. */
  get active(): boolean {
    return this.ctx !== null && this.ctx.state !== "closed";
  }

  /** Start the generative bed (requires a user gesture). */
  async start(): Promise<void> {
    if (this.ctx) {
      await this.ctx.resume();
      return;
    }
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const ctx = new Ctx();
    this.ctx = ctx;
    await ctx.resume();

    // Limiter → destination
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -14;
    limiter.knee.value = 24;
    limiter.ratio.value = 12;
    limiter.attack.value = 0.004;
    limiter.release.value = 0.25;
    limiter.connect(ctx.destination);

    const master = ctx.createGain();
    master.gain.value = 0.16;
    master.connect(limiter);
    this.master = master;

    // Reverb send
    const conv = ctx.createConvolver();
    conv.buffer = buildImpulse(ctx);
    const wet = ctx.createGain();
    wet.gain.value = 0.5;
    conv.connect(wet);
    wet.connect(master);

    // Analyser taps the full mix
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.72;
    analyser.connect(master);
    analyser.connect(conv);
    this.analyser = analyser;
    this.freq = new Uint8Array(analyser.frequencyBinCount);

    // Sustained drone: two detuned saws + a sub sine
    const drone = ctx.createGain();
    drone.gain.value = 0.32;
    drone.connect(analyser);
    const droneFilter = ctx.createBiquadFilter();
    droneFilter.type = "lowpass";
    droneFilter.frequency.value = 900;
    droneFilter.Q.value = 3;
    droneFilter.connect(drone);
    for (const [type, freq, det] of [
      ["sawtooth", 55, -6],
      ["sawtooth", 55, 7],
      ["sine", 27.5, 0],
    ] as const) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = freq;
      o.detune.value = det;
      o.connect(droneFilter);
      o.start();
      this.voices.push(o);
    }
    // Slow filter sweep LFO on the drone
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.05;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 600;
    lfo.connect(lfoGain);
    lfoGain.connect(droneFilter.frequency);
    lfo.start();
    this.lfos.push(lfo);

    // Airy noise texture through a moving bandpass
    const noiseBuf = ctx.createBuffer(
      1,
      ctx.sampleRate * 2,
      ctx.sampleRate,
    );
    const nd = noiseBuf.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = this.rng() * 2 - 1;
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuf;
    noise.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 2600;
    bp.Q.value = 0.7;
    const noiseGain = ctx.createGain();
    noiseGain.gain.value = 0.05;
    noise.connect(bp);
    bp.connect(noiseGain);
    noiseGain.connect(conv);
    noise.start();
    this.noiseSrc = noise;
    const nlfo = ctx.createOscillator();
    nlfo.frequency.value = 0.11;
    const nlfoGain = ctx.createGain();
    nlfoGain.gain.value = 1400;
    nlfo.connect(nlfoGain);
    nlfoGain.connect(bp.frequency);
    nlfo.start();
    this.lfos.push(nlfo);

    // Arpeggiated bell voices scheduled via a look-ahead scheduler
    this.nextNoteAt = ctx.currentTime + 0.1;
    this.step = 0;
    this.schedTimer = window.setInterval(() => this.schedule(), 60);
  }

  /** Look-ahead note scheduler for the shimmering arpeggio. */
  private schedule(): void {
    const ctx = this.ctx;
    const analyser = this.analyser;
    if (!ctx || !analyser) return;
    // A Lydian-ish set over a low A, for a bright unresolved shimmer.
    const scale = [0, 2, 4, 6, 7, 11, 14, 16, 19];
    const horizon = ctx.currentTime + 0.4;
    while (this.nextNoteAt < horizon) {
      const semis = scale[Math.floor(this.rng() * scale.length)];
      const octave = this.rng() < 0.35 ? 12 : 0;
      const freq = 110 * Math.pow(2, (semis + octave) / 12);
      this.playBell(ctx, analyser, freq, this.nextNoteAt);
      // gentle swing between eighth and quarter feel
      const dur = this.rng() < 0.5 ? 0.28 : 0.42;
      this.nextNoteAt += dur;
      this.step++;
    }
  }

  private playBell(
    ctx: AudioContext,
    dest: AudioNode,
    freq: number,
    at: number,
  ): void {
    const o = ctx.createOscillator();
    o.type = "triangle";
    o.frequency.value = freq;
    const o2 = ctx.createOscillator();
    o2.type = "sine";
    o2.frequency.value = freq * 2.01;
    const g = ctx.createGain();
    const peak = 0.12 + this.rng() * 0.06;
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(peak, at + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 1.1);
    const pan = ctx.createStereoPanner();
    pan.pan.value = this.rng() * 1.6 - 0.8;
    o.connect(g);
    o2.connect(g);
    g.connect(pan);
    pan.connect(dest);
    o.start(at);
    o2.start(at);
    o.stop(at + 1.2);
    o2.stop(at + 1.2);
  }

  /** Swap the analysed source to the microphone (falls back on denial). */
  async enableMic(): Promise<boolean> {
    if (!this.ctx || !this.analyser) return false;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
      this.micStream = stream;
      const src = this.ctx.createMediaStreamSource(stream);
      const g = this.ctx.createGain();
      g.gain.value = 1.8;
      src.connect(g);
      g.connect(this.analyser);
      return true;
    } catch {
      return false;
    }
  }

  /** Read + smooth 8 log-spaced band energies (0..1). Call once per frame. */
  update(): Float32Array {
    const a = this.analyser;
    if (!a) return this.bands;
    a.getByteFrequencyData(this.freq as Uint8Array<ArrayBuffer>);
    const n = this.freq.length;
    for (let b = 0; b < BAND_COUNT; b++) {
      const lo = Math.floor(Math.pow(b / BAND_COUNT, 1.7) * n);
      const hi = Math.max(
        lo + 1,
        Math.floor(Math.pow((b + 1) / BAND_COUNT, 1.7) * n),
      );
      let sum = 0;
      for (let i = lo; i < hi; i++) sum += this.freq[i];
      const raw = sum / (hi - lo) / 255;
      // perceptual lift for the quiet high bands
      const shaped = Math.pow(raw, 0.72) * (1 + b * 0.06);
      const s = this.smoothed[b];
      this.smoothed[b] = s + (shaped - s) * (shaped > s ? 0.5 : 0.12);
      this.bands[b] = Math.min(1, this.smoothed[b]);
    }
    return this.bands;
  }

  /** Tear everything down. */
  stop(): void {
    if (this.schedTimer !== null) {
      clearInterval(this.schedTimer);
      this.schedTimer = null;
    }
    for (const v of this.voices) {
      try {
        v.stop();
      } catch {
        /* already stopped */
      }
    }
    for (const l of this.lfos) {
      try {
        l.stop();
      } catch {
        /* already stopped */
      }
    }
    try {
      this.noiseSrc?.stop();
    } catch {
      /* already stopped */
    }
    this.micStream?.getTracks().forEach((t) => t.stop());
    this.voices = [];
    this.lfos = [];
    this.noiseSrc = null;
    this.micStream = null;
    const ctx = this.ctx;
    this.ctx = null;
    this.analyser = null;
    void ctx?.close();
  }
}
