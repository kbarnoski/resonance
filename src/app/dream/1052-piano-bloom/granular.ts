/**
 * Audio engine for Piano Bloom.
 *
 * Two voicing modes, both driven by "reader" probes placed on the RD field:
 *
 *  1. GRAIN mode — when a real piano recording (any AudioBuffer) is loaded.
 *     Each reader runs a granular playback head over the buffer:
 *       field V  -> grain position (scrub through the recording)
 *       gradient -> grain pitch (playbackRate) + grain density
 *       V intensity -> grain gain
 *     Dense blooms -> thick grain clouds; calm field -> sparse sparse grains.
 *     Grains are short windowed BufferSources scheduled slightly ahead.
 *
 *  2. FELT mode — zero-input fallback. A warm "felt piano" drone/arpeggio bed
 *     (detuned triangle/sine partials, soft attack + long release, slow
 *     evolving chord). Readers modulate filter cutoff, detune and amplitude so
 *     the play-relationship still exists with no file at all.
 *
 * Reference interaction model: Reactive Audio "Growth" (2026) — modulation
 * "readers" placed on an evolving field translate local field values into
 * modulation signals.
 */

export type AudioMode = "grain" | "felt";

/** Per-reader control values, refreshed each frame by the page from the RD
 *  field samples. All 0..1 unless noted. */
export interface ReaderDrive {
  /** field V at the reader (bloom density) */
  v: number;
  /** local gradient / activity at the reader */
  grad: number;
  /** field U at the reader */
  u: number;
  /** reader x in 0..1 (used for stereo pan) */
  x: number;
  /** whether this reader slot is active */
  active: boolean;
}

const NUM_READERS = 4;

// A gentle, always-consonant chord pool for FELT mode (A minor-ish, warm).
const FELT_FREQS = [
  110.0, // A2
  146.83, // D3
  164.81, // E3
  220.0, // A3
  261.63, // C4
  329.63, // E4
];

interface FeltVoice {
  osc: OscillatorNode;
  osc2: OscillatorNode;
  filter: BiquadFilterNode;
  gain: GainNode;
  pan: StereoPannerNode;
  baseFreq: number;
}

export class PianoBloomAudio {
  readonly ctx: AudioContext;
  mode: AudioMode = "felt";

  private master: GainNode;
  private buffer: AudioBuffer | null = null;

  // grain scheduling
  private grainBus: GainNode;
  private nextGrainTime: number[] = new Array(NUM_READERS).fill(0);

  // felt voices (one per reader slot)
  private feltVoices: FeltVoice[] = [];
  private feltBus: GainNode;
  private padOsc: OscillatorNode | null = null;
  private padGain: GainNode | null = null;
  private padFilter: BiquadFilterNode | null = null;

  private drives: ReaderDrive[] = [];
  private disposed = false;

  constructor() {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    this.ctx = new Ctor();

    this.master = this.ctx.createGain();
    this.master.gain.value = 0.0001;
    this.master.connect(this.ctx.destination);

    this.grainBus = this.ctx.createGain();
    this.grainBus.gain.value = 0.9;
    this.grainBus.connect(this.master);

    this.feltBus = this.ctx.createGain();
    this.feltBus.gain.value = 0.9;
    this.feltBus.connect(this.master);

    for (let i = 0; i < NUM_READERS; i++) {
      this.drives.push({ v: 0, grad: 0, u: 1, x: 0.5, active: false });
    }

    this.buildFeltBed();
  }

  /** Must be called from a user gesture. Ramps master up. */
  async start() {
    if (this.ctx.state === "suspended") {
      await this.ctx.resume().catch(() => {});
    }
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setValueAtTime(Math.max(0.0001, this.master.gain.value), t);
    this.master.gain.linearRampToValueAtTime(0.85, t + 1.5);
  }

  setMode(mode: AudioMode) {
    this.mode = mode;
    const t = this.ctx.currentTime;
    const grainTarget = mode === "grain" ? 0.95 : 0.0001;
    const feltTarget = mode === "felt" ? 0.9 : 0.18; // keep a hint of felt bed under grains
    this.grainBus.gain.cancelScheduledValues(t);
    this.grainBus.gain.linearRampToValueAtTime(grainTarget, t + 0.6);
    this.feltBus.gain.cancelScheduledValues(t);
    this.feltBus.gain.linearRampToValueAtTime(feltTarget, t + 0.6);
  }

  /** Load a decoded recording; switches to grain voicing. */
  setBuffer(buffer: AudioBuffer) {
    this.buffer = buffer;
    this.setMode("grain");
  }

  /** True if a real recording is loaded. */
  get hasBuffer() {
    return this.buffer !== null;
  }

  /** Decode an ArrayBuffer (from a dropped/picked file) into an AudioBuffer. */
  async decode(data: ArrayBuffer): Promise<AudioBuffer> {
    return await this.ctx.decodeAudioData(data);
  }

  /** Update one reader's drive values (called each animation frame). */
  setDrive(i: number, drive: ReaderDrive) {
    if (i < 0 || i >= NUM_READERS) return;
    this.drives[i] = drive;
  }

  /** Advance audio scheduling. Call ~each frame. dt in seconds. */
  tick() {
    if (this.disposed) return;
    if (this.mode === "grain" && this.buffer) {
      this.scheduleGrains();
    } else {
      this.updateFelt();
    }
  }

  /* --------------------------- grains --------------------------- */

  private scheduleGrains() {
    const buf = this.buffer;
    if (!buf) return;
    const now = this.ctx.currentTime;
    const lookahead = 0.12; // schedule up to 120ms ahead

    for (let i = 0; i < NUM_READERS; i++) {
      const d = this.drives[i];
      if (!d.active || d.v < 0.04) continue;

      if (this.nextGrainTime[i] < now) this.nextGrainTime[i] = now;

      // density: calm field -> sparse, dense bloom -> thick cloud.
      const density = 4 + d.v * 26 + d.grad * 22; // grains/sec
      const interval = 1 / density;

      while (this.nextGrainTime[i] < now + lookahead) {
        this.spawnGrain(this.nextGrainTime[i], d, buf);
        // jitter so it doesn't sound metronomic
        this.nextGrainTime[i] += interval * (0.7 + Math.random() * 0.6);
      }
    }
  }

  private spawnGrain(when: number, d: ReaderDrive, buf: AudioBuffer) {
    // grain position: V scrubs through the recording, with a little jitter.
    const dur = buf.duration;
    let pos = d.v * dur;
    pos += (Math.random() - 0.5) * 0.08 * dur;
    pos = Math.max(0, Math.min(dur - 0.05, pos));

    // grain length: 40..160ms, longer when calm (smoother), shorter when active
    const grainLen = 0.16 - d.grad * 0.1;

    // pitch: gradient bends pitch up; subtle, musical range.
    const semis = (d.grad - 0.3) * 7 + (d.u - 0.5) * -3;
    const rate = Math.pow(2, semis / 12);

    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;

    const env = this.ctx.createGain();
    const peak = (0.18 + d.v * 0.5) * 0.6;
    env.gain.setValueAtTime(0.0001, when);
    env.gain.linearRampToValueAtTime(peak, when + grainLen * 0.4);
    env.gain.linearRampToValueAtTime(0.0001, when + grainLen);

    const pan = this.ctx.createStereoPanner();
    pan.pan.value = d.x * 2 - 1;

    src.connect(env);
    env.connect(pan);
    pan.connect(this.grainBus);

    src.start(when, pos, grainLen * rate + 0.02);
    src.stop(when + grainLen + 0.05);
    src.onended = () => {
      try {
        src.disconnect();
        env.disconnect();
        pan.disconnect();
      } catch {
        /* ignore */
      }
    };
  }

  /* ---------------------------- felt ---------------------------- */

  private buildFeltBed() {
    // A slow low pad under everything.
    const padOsc = this.ctx.createOscillator();
    padOsc.type = "sine";
    padOsc.frequency.value = 55; // A1
    const padGain = this.ctx.createGain();
    padGain.gain.value = 0.12;
    const padFilter = this.ctx.createBiquadFilter();
    padFilter.type = "lowpass";
    padFilter.frequency.value = 400;
    padOsc.connect(padFilter);
    padFilter.connect(padGain);
    padGain.connect(this.feltBus);
    padOsc.start();
    this.padOsc = padOsc;
    this.padGain = padGain;
    this.padFilter = padFilter;

    // One felt voice per reader slot.
    for (let i = 0; i < NUM_READERS; i++) {
      const baseFreq = FELT_FREQS[(i * 2) % FELT_FREQS.length];
      const osc = this.ctx.createOscillator();
      osc.type = "triangle";
      osc.frequency.value = baseFreq;
      const osc2 = this.ctx.createOscillator();
      osc2.type = "sine";
      osc2.frequency.value = baseFreq * 2.003; // detuned octave shimmer
      const filter = this.ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 600;
      filter.Q.value = 2;
      const gain = this.ctx.createGain();
      gain.gain.value = 0.0001;
      const pan = this.ctx.createStereoPanner();
      pan.pan.value = (i / (NUM_READERS - 1)) * 1.4 - 0.7;

      osc.connect(filter);
      osc2.connect(filter);
      filter.connect(gain);
      gain.connect(pan);
      pan.connect(this.feltBus);
      osc.start();
      osc2.start();

      this.feltVoices.push({ osc, osc2, filter, gain, pan, baseFreq });
    }
  }

  private feltPhase = 0;

  private updateFelt() {
    const t = this.ctx.currentTime;
    this.feltPhase += 0.0025;

    // Slowly evolving pad cutoff so the bed breathes even with no input.
    if (this.padFilter) {
      const c = 320 + Math.sin(this.feltPhase * 0.6) * 180;
      this.padFilter.frequency.setTargetAtTime(c, t, 0.4);
    }

    for (let i = 0; i < NUM_READERS; i++) {
      const v = this.feltVoices[i];
      const d = this.drives[i];
      // Even when a reader is inactive, give a faint always-on breath so the
      // fallback "plays" immediately with no interaction.
      const baseBreath =
        0.04 * (0.5 + 0.5 * Math.sin(this.feltPhase + i * 1.7));
      const driveAmp = d.active ? d.v * 0.3 + d.grad * 0.12 : 0;
      const amp = Math.min(0.34, baseBreath + driveAmp);
      v.gain.gain.setTargetAtTime(amp, t, 0.25);

      // Reader gradient opens the filter; bloom V detunes for movement.
      const cutoff = 500 + (d.active ? d.grad * 2600 + d.v * 900 : 200);
      v.filter.frequency.setTargetAtTime(cutoff, t, 0.2);
      const detune = d.active ? d.v * 12 : 0;
      v.osc.detune.setTargetAtTime(detune, t, 0.3);
      v.osc2.detune.setTargetAtTime(-detune, t, 0.3);
      if (d.active) {
        v.pan.pan.setTargetAtTime(d.x * 2 - 1, t, 0.3);
      }
    }
  }

  /* --------------------------- teardown --------------------------- */

  async dispose() {
    if (this.disposed) return;
    this.disposed = true;
    const t = this.ctx.currentTime;
    try {
      this.master.gain.cancelScheduledValues(t);
      this.master.gain.setValueAtTime(this.master.gain.value, t);
      this.master.gain.linearRampToValueAtTime(0.0001, t + 0.25);
    } catch {
      /* ignore */
    }
    // give the fade a moment, then stop oscillators and close.
    await new Promise((r) => setTimeout(r, 300));
    try {
      this.padOsc?.stop();
      this.feltVoices.forEach((v) => {
        try {
          v.osc.stop();
          v.osc2.stop();
        } catch {
          /* ignore */
        }
      });
    } catch {
      /* ignore */
    }
    try {
      if (this.ctx.state !== "closed") await this.ctx.close();
    } catch {
      /* ignore */
    }
  }
}

export { NUM_READERS };
