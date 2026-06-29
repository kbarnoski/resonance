// ─────────────────────────────────────────────────────────────────────────────
// 1056-key-bloom · audio.ts — a warm just-intonation additive/FM organ.
//
//   Each key sounds a polyphonic voice: a small stack of detuned partials plus a
//   gentle 2-op FM shimmer, through a soft attack / long release envelope. All
//   voices feed a shared warm ConvolverNode reverb (the impulse response is
//   synthesised in an OfflineAudioContext at startup — no asset fetch) and a
//   DynamicsCompressor acting as a glue limiter. A low drone bed underneath ties
//   stacked chords into one breathing organ.
//
//   Tuning is 5-limit just intonation off a movable root, so chords beat-lock
//   into the "luminous" consonance the warm psilocybin pole wants.
// ─────────────────────────────────────────────────────────────────────────────

/** 5-limit just-intonation ratios for the scale degrees A S D F G H J K L. */
const JI_RATIOS = [
  1, // unison
  9 / 8, // major second
  5 / 4, // major third
  4 / 3, // perfect fourth
  3 / 2, // perfect fifth
  5 / 3, // major sixth
  15 / 8, // major seventh
  2, // octave
  9 / 4, // ninth
];

const MAX_VOICES = 12;

interface Voice {
  id: number;
  freq: number;
  gain: GainNode;
  oscillators: OscillatorNode[];
  fmGain: GainNode | null;
  fmOsc: OscillatorNode | null;
  startedAt: number;
  released: boolean;
}

/** Render a short, smooth, warm impulse response into an AudioBuffer. */
function renderReverbIR(ctx: BaseAudioContext, seconds: number): Promise<AudioBuffer> {
  const rate = ctx.sampleRate;
  const len = Math.floor(rate * seconds);
  const off = new OfflineAudioContext(2, len, rate);
  // Noise burst shaped by an exponential decay = a simple dense room tail.
  const noise = off.createBuffer(2, len, rate);
  for (let ch = 0; ch < 2; ch++) {
    const data = noise.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      const t = i / len;
      const decay = Math.pow(1 - t, 2.6);
      data[i] = (Math.random() * 2 - 1) * decay;
    }
  }
  const src = off.createBufferSource();
  src.buffer = noise;
  // Low-pass the tail so the room reads warm, not bright/hissy.
  const lp = off.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 2600;
  src.connect(lp).connect(off.destination);
  src.start(0);
  return off.startRendering();
}

export class KeyBloomAudio {
  readonly ctx: AudioContext;
  private master: GainNode;
  private reverb: ConvolverNode | null = null;
  private reverbGain: GainNode;
  private dryGain: GainNode;
  private compressor: DynamicsCompressorNode;
  private droneGain: GainNode;
  private droneOscs: OscillatorNode[] = [];
  private voices = new Map<number, Voice>();
  private nextId = 1;
  private root = 220; // A3 — warm low register.
  private brightness = 1;

  constructor() {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new Ctor();

    this.master = this.ctx.createGain();
    this.master.gain.value = 0.85;

    this.compressor = this.ctx.createDynamicsCompressor();
    this.compressor.threshold.value = -14;
    this.compressor.knee.value = 24;
    this.compressor.ratio.value = 4;
    this.compressor.attack.value = 0.006;
    this.compressor.release.value = 0.25;

    this.dryGain = this.ctx.createGain();
    this.dryGain.gain.value = 0.72;
    this.reverbGain = this.ctx.createGain();
    this.reverbGain.gain.value = 0.55;

    // master -> [dry + reverb] -> compressor -> destination
    this.dryGain.connect(this.compressor);
    this.reverbGain.connect(this.compressor);
    this.master.connect(this.dryGain);
    this.compressor.connect(this.ctx.destination);

    // Low drone bed.
    this.droneGain = this.ctx.createGain();
    this.droneGain.gain.value = 0.0;
    this.droneGain.connect(this.master);
  }

  /** Build the reverb IR and wire it. Safe to call once after construction. */
  async init(): Promise<void> {
    try {
      const ir = await renderReverbIR(this.ctx, 3.0);
      const conv = this.ctx.createConvolver();
      conv.buffer = ir;
      conv.connect(this.reverbGain);
      this.master.connect(conv);
      this.reverb = conv;
    } catch {
      // No reverb available — dry path still works.
      this.reverb = null;
    }
  }

  /** Resume the context (call on first user gesture). */
  async resume(): Promise<void> {
    if (this.ctx.state === "suspended") {
      try {
        await this.ctx.resume();
      } catch {
        /* ignore */
      }
    }
    this.startDrone();
  }

  /** Global brightness multiplier (e.g. wired to the safe flicker). */
  setBrightness(b: number): void {
    this.brightness = Math.max(0, Math.min(1, b));
    const now = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(0.85 * (0.35 + 0.65 * this.brightness), now, 0.05);
  }

  private startDrone(): void {
    if (this.droneOscs.length > 0) return;
    const now = this.ctx.currentTime;
    // Root + fifth, two octaves down, slightly detuned = a warm pad floor.
    const freqs = [this.root / 4, (this.root * (3 / 2)) / 4];
    for (const f of freqs) {
      const o = this.ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = f;
      const g = this.ctx.createGain();
      g.gain.value = 0.5;
      o.connect(g).connect(this.droneGain);
      o.start();
      this.droneOscs.push(o);
    }
    this.droneGain.gain.setTargetAtTime(0.06, now, 1.5);
  }

  /** Frequency (Hz) for a scale degree at a given octave shift. */
  freqFor(degree: number, octaveShift: number): number {
    const ratio = JI_RATIOS[Math.max(0, Math.min(JI_RATIOS.length - 1, degree))];
    return this.root * ratio * Math.pow(2, octaveShift);
  }

  /** Frequency for a raw MIDI note number (equal temperament reference). */
  freqForMidi(note: number): number {
    return 440 * Math.pow(2, (note - 69) / 12);
  }

  /** Start a voice. velocity in [0,1]. Returns the internal voice id. */
  noteOn(freq: number, velocity: number): number {
    if (this.voices.size >= MAX_VOICES) this.stealOldest();
    const now = this.ctx.currentTime;
    const id = this.nextId++;
    const vel = Math.max(0.05, Math.min(1, velocity));

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    const peak = 0.18 * (0.4 + 0.6 * vel);
    gain.gain.exponentialRampToValueAtTime(peak, now + 0.045); // soft attack
    gain.gain.setTargetAtTime(peak * 0.7, now + 0.05, 0.8); // gentle decay-to-sustain
    gain.connect(this.master);

    // Pan subtly by pitch.
    const pan = this.ctx.createStereoPanner();
    const norm = Math.max(-1, Math.min(1, (Math.log2(freq / this.root) - 1) * 0.4));
    pan.pan.value = norm;
    gain.connect(pan);
    pan.connect(this.master);

    const oscillators: OscillatorNode[] = [];
    // Additive partials: fundamental + 2nd + 3rd, lightly detuned for warmth.
    const partials: Array<[number, number, number]> = [
      [1, 1.0, 0],
      [2, 0.35, 3],
      [3, 0.16, -4],
    ];
    for (const [mult, amp, detune] of partials) {
      const o = this.ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = freq * mult;
      o.detune.value = detune;
      const pg = this.ctx.createGain();
      pg.gain.value = amp;
      o.connect(pg).connect(gain);
      o.start(now);
      oscillators.push(o);
    }

    // 2-op FM shimmer on top (carrier = freq, modulator slightly inharmonic).
    let fmOsc: OscillatorNode | null = null;
    let fmGain: GainNode | null = null;
    const carrier = this.ctx.createOscillator();
    carrier.type = "sine";
    carrier.frequency.value = freq;
    const carrierGain = this.ctx.createGain();
    carrierGain.gain.value = 0.12 * vel;
    fmOsc = this.ctx.createOscillator();
    fmOsc.type = "sine";
    fmOsc.frequency.value = freq * 2.005;
    fmGain = this.ctx.createGain();
    fmGain.gain.value = freq * 0.6 * vel; // modulation index
    fmOsc.connect(fmGain).connect(carrier.frequency);
    carrier.connect(carrierGain).connect(gain);
    carrier.start(now);
    fmOsc.start(now);
    oscillators.push(carrier);

    const voice: Voice = {
      id,
      freq,
      gain,
      oscillators,
      fmGain,
      fmOsc,
      startedAt: now,
      released: false,
    };
    this.voices.set(id, voice);
    return id;
  }

  /** Begin the long release of a voice; it self-cleans when silent. */
  noteOff(id: number): void {
    const v = this.voices.get(id);
    if (!v || v.released) return;
    v.released = true;
    const now = this.ctx.currentTime;
    const rel = 1.6; // long, organ-like release
    v.gain.gain.cancelScheduledValues(now);
    v.gain.gain.setValueAtTime(Math.max(0.0001, v.gain.gain.value), now);
    v.gain.gain.exponentialRampToValueAtTime(0.0001, now + rel);
    const stopAt = now + rel + 0.1;
    for (const o of v.oscillators) {
      try {
        o.stop(stopAt);
      } catch {
        /* already stopped */
      }
    }
    if (v.fmOsc) {
      try {
        v.fmOsc.stop(stopAt);
      } catch {
        /* ignore */
      }
    }
    window.setTimeout(() => this.voices.delete(id), (rel + 0.3) * 1000);
  }

  private stealOldest(): void {
    let oldest: Voice | null = null;
    for (const v of this.voices.values()) {
      if (!oldest || v.startedAt < oldest.startedAt) oldest = v;
    }
    if (oldest) this.noteOff(oldest.id);
  }

  /** Tear everything down. */
  async dispose(): Promise<void> {
    const now = this.ctx.currentTime;
    for (const v of this.voices.values()) {
      for (const o of v.oscillators) {
        try {
          o.stop(now);
        } catch {
          /* ignore */
        }
      }
    }
    this.voices.clear();
    for (const o of this.droneOscs) {
      try {
        o.stop(now);
      } catch {
        /* ignore */
      }
    }
    this.droneOscs = [];
    try {
      await this.ctx.close();
    } catch {
      /* ignore */
    }
  }
}

export { JI_RATIOS, MAX_VOICES };
