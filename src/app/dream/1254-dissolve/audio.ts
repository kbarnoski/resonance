// ─────────────────────────────────────────────────────────────────────────────
// 1254-dissolve · audio.ts — a keyboard-played dissociative whole-tone synth.
//
//   Each key sounds a low-latency polyphonic voice: a small stack of detuned
//   oscillators + a faint 2-op FM shimmer through a soft attack / long release,
//   mellowed by a per-voice lowpass so the timbre reads hollow and unmoored — the
//   whole-tone scale never resolves, which is the point (the dissociative pole:
//   nothing settles). Voices feed a shared void reverb (`_shared/psych/
//   convolutionVoid`) whose wet OPENS as dissociation deepens, over a hollow
//   open-fifth drone bed (`_shared/psych/droneBank`). A DynamicsCompressor glues
//   and limits. An AnalyserNode on the dry note bus yields the audio envelope the
//   visual field tracks — until the desync engine unbinds them.
//
//   The audio stream stays IMMEDIATE and playable at all times: the desync is a
//   property of the VISUAL response (see page.tsx), never of what you hear.
// ─────────────────────────────────────────────────────────────────────────────

import { startDroneBank, type DroneBank } from "../_shared/psych/droneBank";
import { createVoidReverb, type VoidReverb } from "../_shared/psych/convolutionVoid";

/** Whole-tone scale, in semitones, for the nine home-row keys A S D F G H J K L.
 *  A whole-tone scale has no leading tone and no perfect fifth of the tonic — it
 *  floats without a home, the auditory analogue of the dissociated body-schema. */
const WHOLE_TONE_SEMITONES = [0, 2, 4, 6, 8, 10, 12, 14, 16];

const MAX_VOICES = 12;

interface Voice {
  id: number;
  gain: GainNode;
  oscillators: OscillatorNode[];
  fmOsc: OscillatorNode | null;
  startedAt: number;
  released: boolean;
}

export class DissolveAudio {
  readonly ctx: AudioContext;
  private master: GainNode;
  private compressor: DynamicsCompressorNode;
  private voiceBus: GainNode; // dry note sum (analysed for the envelope)
  private preBus: GainNode; // voices + drone, routed into the void reverb
  private reverb: VoidReverb;
  private drone: DroneBank;
  private analyser: AnalyserNode;
  private timeData: Uint8Array<ArrayBuffer>;
  private voices = new Map<number, Voice>();
  private nextId = 1;
  private root = 220; // A3 — a calm middle register.
  private energy = 0; // smoothed RMS of the note bus, 0..1.

  constructor() {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    this.ctx = new Ctor();

    // master → compressor(limiter) → destination
    this.compressor = this.ctx.createDynamicsCompressor();
    this.compressor.threshold.value = -14;
    this.compressor.knee.value = 22;
    this.compressor.ratio.value = 4;
    this.compressor.attack.value = 0.006;
    this.compressor.release.value = 0.25;
    this.compressor.connect(this.ctx.destination);

    this.master = this.ctx.createGain();
    this.master.gain.value = 0.42;
    this.master.connect(this.compressor);

    // preBus → void reverb → master
    this.reverb = createVoidReverb(this.ctx, { seconds: 5, decay: 2.2, wet: 0.42 });
    this.reverb.output.connect(this.master);
    this.preBus = this.ctx.createGain();
    this.preBus.connect(this.reverb.input);

    // voiceBus (dry notes only) → preBus, and → analyser for the envelope.
    this.voiceBus = this.ctx.createGain();
    this.voiceBus.connect(this.preBus);
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 512;
    this.analyser.smoothingTimeConstant = 0.6;
    this.voiceBus.connect(this.analyser);
    this.timeData = new Uint8Array(new ArrayBuffer(this.analyser.fftSize));

    // Hollow open-fifth/octave drone bed (dissociative, unresolved).
    this.drone = startDroneBank(this.ctx, this.preBus, {
      root: 55,
      ratios: [1, 3 / 2, 2, 3],
      cutoffLow: 160,
      cutoffHigh: 1400,
      peakGain: 0.12,
    });
  }

  /** Resume on the first user gesture. */
  async resume(): Promise<void> {
    if (this.ctx.state === "suspended") {
      try {
        await this.ctx.resume();
      } catch {
        /* ignore */
      }
    }
  }

  /** Frequency (Hz) for a home-row scale degree. */
  freqFor(degree: number): number {
    const i = Math.max(0, Math.min(WHOLE_TONE_SEMITONES.length - 1, degree));
    return this.root * Math.pow(2, WHOLE_TONE_SEMITONES[i] / 12);
  }

  /** Smoothed note-bus envelope in [0,1] — this is what the visual tracks when
   *  bound. Call once per frame. */
  updateEnergy(): number {
    this.analyser.getByteTimeDomainData(this.timeData);
    let sum = 0;
    for (let i = 0; i < this.timeData.length; i++) {
      const v = (this.timeData[i] - 128) / 128;
      sum += v * v;
    }
    const rms = Math.sqrt(sum / this.timeData.length);
    const target = Math.min(1, rms * 3.2);
    // Attack fast, release slow — an envelope follower.
    const k = target > this.energy ? 0.5 : 0.06;
    this.energy += (target - this.energy) * k;
    return this.energy;
  }

  /** Open the void reverb as dissociation deepens (0..1). */
  setVoidWet(wet: number): void {
    this.reverb.setWet(Math.max(0, Math.min(1, wet)));
  }

  /** Drive the drone bed (0..1). */
  setDroneDrive(d: number): void {
    this.drone.setDrive(Math.max(0, Math.min(1, d)));
  }

  /** Start a voice immediately. velocity in [0,1]. Returns the voice id. */
  noteOn(freq: number, velocity: number): number {
    if (this.voices.size >= MAX_VOICES) this.stealOldest();
    const now = this.ctx.currentTime;
    const id = this.nextId++;
    const vel = Math.max(0.05, Math.min(1, velocity));

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    const peak = 0.16 * (0.4 + 0.6 * vel);
    gain.gain.exponentialRampToValueAtTime(peak, now + 0.02); // low-latency soft attack
    gain.gain.setTargetAtTime(peak * 0.6, now + 0.03, 1.2); // slow decay-to-sustain

    // Per-voice mellow lowpass keeps the timbre hollow, not buzzy.
    const lp = this.ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 1600 + freq * 2;
    lp.Q.value = 0.6;
    gain.connect(lp);
    lp.connect(this.voiceBus);

    const oscillators: OscillatorNode[] = [];
    // Detuned triangle pair + a sine sub — soft and cold.
    const partials: Array<[number, number, number, OscillatorType]> = [
      [1, 0.9, -5, "triangle"],
      [1, 0.9, 5, "triangle"],
      [0.5, 0.5, 0, "sine"],
    ];
    for (const [mult, amp, detune, type] of partials) {
      const o = this.ctx.createOscillator();
      o.type = type;
      o.frequency.value = freq * mult;
      o.detune.value = detune;
      const pg = this.ctx.createGain();
      pg.gain.value = amp;
      o.connect(pg).connect(gain);
      o.start(now);
      oscillators.push(o);
    }

    // Faint inharmonic 2-op FM shimmer (the cold high-frequency edge).
    const carrier = this.ctx.createOscillator();
    carrier.type = "sine";
    carrier.frequency.value = freq;
    const carrierGain = this.ctx.createGain();
    carrierGain.gain.value = 0.09 * vel;
    const fmOsc = this.ctx.createOscillator();
    fmOsc.type = "sine";
    fmOsc.frequency.value = freq * 2.41; // inharmonic → glassy, unsettled
    const fmGain = this.ctx.createGain();
    fmGain.gain.value = freq * 0.45 * vel;
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

  /** Begin a voice's long release; it self-cleans when silent. */
  noteOff(id: number): void {
    const v = this.voices.get(id);
    if (!v || v.released) return;
    v.released = true;
    const now = this.ctx.currentTime;
    const rel = 1.4;
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
    try {
      this.drone.stop();
    } catch {
      /* ignore */
    }
    try {
      await this.ctx.close();
    } catch {
      /* ignore */
    }
  }
}

export { WHOLE_TONE_SEMITONES, MAX_VOICES };
