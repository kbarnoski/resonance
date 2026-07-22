// ─────────────────────────────────────────────────────────────────────────────
// 2264-crystal-bloom · audio.ts — a glassy C-Lydian bell organ.
//
//   Each key sounds a soft, luminous voice: a small additive stack of detuned
//   partials plus a gentle 2-op FM shimmer, shaped by a slow attack and a long
//   release so held chords ring like struck glass. All voices feed a shared
//   light reverb (impulse response synthesised in an OfflineAudioContext at
//   startup from a SEEDED noise burst — no asset fetch, no Math.random) and a
//   DynamicsCompressor glue-limiter. A quiet drone bed underneath fuses stacked
//   chords into one over-bright plenum.
//
//   HARMONY = C-Lydian (C D E F# G A B), equal temperament — the bright modal
//   colour the ecstatic/arrival pole wants. As the crystalline structure grows,
//   `energy` lifts a shimmer octave so the plenum reads brighter the more you
//   play. NOT pentatonic, NOT just-intonation stacks, NOT Bohlen-Pierce.
// ─────────────────────────────────────────────────────────────────────────────

import { mulberry32, SEED } from "./rng";

/** C-Lydian scale degrees for A S D F G H J K L, in semitones above the root. */
const LYDIAN_SEMITONES = [0, 2, 4, 6, 7, 9, 11, 12, 14];

const MAX_VOICES = 14;

interface Voice {
  id: number;
  gain: GainNode;
  oscillators: OscillatorNode[];
  fmOsc: OscillatorNode | null;
  startedAt: number;
  released: boolean;
}

/** Render a short, smooth impulse response into an AudioBuffer (seeded noise). */
function renderReverbIR(ctx: BaseAudioContext, seconds: number): Promise<AudioBuffer> {
  const rate = ctx.sampleRate;
  const len = Math.floor(rate * seconds);
  const off = new OfflineAudioContext(2, len, rate);
  const noise = off.createBuffer(2, len, rate);
  const rand = mulberry32(SEED ^ 0x9e3779b1); // seeded — never Math.random
  for (let ch = 0; ch < 2; ch++) {
    const data = noise.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      const t = i / len;
      const decay = Math.pow(1 - t, 2.3);
      data[i] = (rand() * 2 - 1) * decay;
    }
  }
  const src = off.createBufferSource();
  src.buffer = noise;
  const hp = off.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 320; // keep the tail airy/glassy, not muddy
  src.connect(hp).connect(off.destination);
  src.start(0);
  return off.startRendering();
}

export class CrystalAudio {
  readonly ctx: AudioContext;
  private master: GainNode;
  private reverbGain: GainNode;
  private dryGain: GainNode;
  private compressor: DynamicsCompressorNode;
  private droneGain: GainNode;
  private droneOscs: OscillatorNode[] = [];
  private voices = new Map<number, Voice>();
  private nextId = 1;
  private root = 130.81; // C3 — a bright but grounded register
  private brightness = 1;

  constructor() {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new Ctor();

    this.master = this.ctx.createGain();
    this.master.gain.value = 0.8;

    this.compressor = this.ctx.createDynamicsCompressor();
    this.compressor.threshold.value = -15;
    this.compressor.knee.value = 26;
    this.compressor.ratio.value = 4;
    this.compressor.attack.value = 0.006;
    this.compressor.release.value = 0.28;

    this.dryGain = this.ctx.createGain();
    this.dryGain.gain.value = 0.7;
    this.reverbGain = this.ctx.createGain();
    this.reverbGain.gain.value = 0.45; // light reverb

    this.dryGain.connect(this.compressor);
    this.reverbGain.connect(this.compressor);
    this.master.connect(this.dryGain);
    this.compressor.connect(this.ctx.destination);

    this.droneGain = this.ctx.createGain();
    this.droneGain.gain.value = 0.0;
    this.droneGain.connect(this.master);
  }

  /** Build the reverb IR and wire it. Safe to call once after construction. */
  async init(): Promise<void> {
    try {
      const ir = await renderReverbIR(this.ctx, 2.6);
      const conv = this.ctx.createConvolver();
      conv.buffer = ir;
      conv.connect(this.reverbGain);
      this.master.connect(conv);
    } catch {
      /* no reverb — dry path still sounds */
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

  /** Global brightness multiplier (wired to the shared safe flicker). */
  setBrightness(b: number): void {
    this.brightness = Math.max(0, Math.min(1, b));
    const now = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(0.8 * (0.4 + 0.6 * this.brightness), now, 0.05);
  }

  private startDrone(): void {
    if (this.droneOscs.length > 0) return;
    const now = this.ctx.currentTime;
    // Root + fifth two octaves down = a warm plenum floor under the bells.
    const freqs = [this.root / 4, (this.root * Math.pow(2, 7 / 12)) / 4];
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
    this.droneGain.gain.setTargetAtTime(0.05, now, 1.6);
  }

  /** Frequency (Hz) for a C-Lydian scale degree at a given octave shift. */
  freqFor(degree: number, octaveShift: number): number {
    const semi = LYDIAN_SEMITONES[Math.max(0, Math.min(LYDIAN_SEMITONES.length - 1, degree))];
    return this.root * Math.pow(2, semi / 12 + octaveShift);
  }

  /**
   * Start a glassy voice. velocity in [0,1]; energy in [0,1] lifts a shimmer
   * octave as the crystalline structure grows. Returns the internal voice id.
   */
  noteOn(freq: number, velocity: number, energy: number): number {
    if (this.voices.size >= MAX_VOICES) this.stealOldest();
    const now = this.ctx.currentTime;
    const vel = Math.max(0.05, Math.min(1, velocity));
    const en = Math.max(0, Math.min(1, energy));
    const id = this.nextId++;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    const peak = 0.16 * (0.45 + 0.55 * vel);
    gain.gain.exponentialRampToValueAtTime(peak, now + 0.05); // gentle attack
    gain.gain.setTargetAtTime(peak * 0.72, now + 0.06, 0.9); // ease to sustain

    const pan = this.ctx.createStereoPanner();
    pan.pan.value = Math.max(-1, Math.min(1, (Math.log2(freq / this.root) - 1) * 0.35));
    gain.connect(pan).connect(this.master);

    const oscillators: OscillatorNode[] = [];
    // Additive partials: fundamental + gently detuned upper partials = glass.
    const partials: Array<[number, number, number]> = [
      [1, 1.0, 0],
      [2, 0.34, 4],
      [3, 0.14, -5],
      [4.01, 0.06 + 0.14 * en, 6], // shimmer octave-and-a-bit, brighter with energy
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

    // 2-op FM shimmer (carrier = freq, modulator slightly inharmonic).
    const carrier = this.ctx.createOscillator();
    carrier.type = "sine";
    carrier.frequency.value = freq;
    const carrierGain = this.ctx.createGain();
    carrierGain.gain.value = 0.1 * vel;
    const fmOsc = this.ctx.createOscillator();
    fmOsc.type = "sine";
    fmOsc.frequency.value = freq * 2.004;
    const fmGain = this.ctx.createGain();
    fmGain.gain.value = freq * (0.5 + 0.4 * en) * vel; // modulation index
    fmOsc.connect(fmGain).connect(carrier.frequency);
    carrier.connect(carrierGain).connect(gain);
    carrier.start(now);
    fmOsc.start(now);
    oscillators.push(carrier);

    this.voices.set(id, {
      id,
      gain,
      oscillators,
      fmOsc,
      startedAt: now,
      released: false,
    });
    return id;
  }

  /** Begin the long release of a voice; it self-cleans when silent. */
  noteOff(id: number): void {
    const v = this.voices.get(id);
    if (!v || v.released) return;
    v.released = true;
    const now = this.ctx.currentTime;
    const rel = 2.0; // long, bell-like release
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

export { LYDIAN_SEMITONES, MAX_VOICES };
