// breath.ts — turn microphone amplitude into a slow BREATH envelope and detect
// breath cycles. Amplitude only — NO pitch detection. The mic stream goes ONLY
// to the analyser here; it is never connected to any output (no feedback).
//
// Pipeline: MediaStreamSource -> lowpass (~1.2kHz, keep breath band) -> Analyser.
// Each frame we compute a time-domain RMS, then run a slow attack/release
// envelope follower. A rising-then-falling envelope crossing thresholds counts
// one breath cycle (and fires a "top of breath" callback for bowl strikes).

export interface BreathFrame {
  /** Smoothed breath energy 0..1 (the slow swell/ebb). */
  energy: number;
  /** Direction of the envelope: +1 inhaling/rising, -1 exhaling/falling, 0 rest. */
  direction: number;
  /** Total breath cycles detected since start. */
  cycles: number;
  /** True only on the single frame a new breath PEAK (top of inhale) is reached. */
  peaked: boolean;
}

export interface BreathTrackerOptions {
  /** Called once at the top of each detected inhale. */
  onPeak?: (energy: number) => void;
  /** Called once each time a full cycle (peak then return to rest) completes. */
  onCycle?: (count: number) => void;
}

export class BreathTracker {
  private ctx: AudioContext;
  private stream: MediaStream | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private filter: BiquadFilterNode | null = null;
  private analyser: AnalyserNode | null = null;
  private buf: Float32Array<ArrayBuffer> | null = null;

  private env = 0; // smoothed envelope
  private prevEnv = 0;
  private rising = false;
  private peakValue = 0;
  private cycles = 0;
  private opts: BreathTrackerOptions;

  // Adaptive floor/ceiling so quiet and loud rooms both work.
  private floor = 0.0015;
  private ceil = 0.02;

  constructor(ctx: AudioContext, opts: BreathTrackerOptions = {}) {
    this.ctx = ctx;
    this.opts = opts;
  }

  /** Open the mic and wire it into the analyser. Throws if denied/unavailable.
   *  MUST be called from a user gesture. */
  async start(): Promise<void> {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    });
    this.stream = stream;

    const source = this.ctx.createMediaStreamSource(stream);
    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 1200; // keep the breath band, drop hiss
    filter.Q.value = 0.4;

    const analyser = this.ctx.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.6;

    source.connect(filter);
    filter.connect(analyser);
    // analyser is a sink — NOT connected onward. No path to destination.

    this.source = source;
    this.filter = filter;
    this.analyser = analyser;
    this.buf = new Float32Array(new ArrayBuffer(analyser.fftSize * 4));
  }

  /** Sample the mic and advance the envelope. Call once per animation frame. */
  step(dt: number): BreathFrame {
    const analyser = this.analyser;
    const buf = this.buf;
    if (!analyser || !buf) {
      return { energy: 0, direction: 0, cycles: this.cycles, peaked: false };
    }

    analyser.getFloatTimeDomainData(buf);
    let sum = 0;
    for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
    const rms = Math.sqrt(sum / buf.length);

    // Adapt floor/ceiling slowly toward the observed signal range.
    this.floor += (Math.min(this.floor, rms) - this.floor) * Math.min(1, dt * 0.4);
    if (rms > this.ceil) this.ceil += (rms - this.ceil) * Math.min(1, dt * 2);
    else this.ceil += (Math.max(this.floor + 0.004, rms) - this.ceil) * Math.min(1, dt * 0.05);

    const span = Math.max(0.004, this.ceil - this.floor);
    const norm = Math.max(0, Math.min(1, (rms - this.floor) / span));

    // Slow attack / slower release envelope follower → the swell of a breath.
    const attack = Math.min(1, dt * 4);
    const release = Math.min(1, dt * 1.1);
    this.prevEnv = this.env;
    this.env += (norm - this.env) * (norm > this.env ? attack : release);

    return this.advanceState();
  }

  /** Drive the same envelope from an autonomous LFO breath (mic fallback / idle).
   *  `lfo01` is a 0..1 breathing curve the caller supplies. */
  stepAutonomous(lfo01: number): BreathFrame {
    this.prevEnv = this.env;
    this.env = lfo01;
    return this.advanceState();
  }

  private advanceState(): BreathFrame {
    const delta = this.env - this.prevEnv;
    const direction = delta > 0.001 ? 1 : delta < -0.001 ? -1 : 0;

    let peaked = false;

    if (direction > 0) {
      this.rising = true;
      this.peakValue = Math.max(this.peakValue, this.env);
    }

    // Peak: we were rising, now we turn over above a meaningful threshold.
    if (this.rising && direction < 0 && this.peakValue > 0.45) {
      peaked = true;
      this.rising = false;
      this.opts.onPeak?.(this.peakValue);
    }

    // Cycle complete: envelope returns to near-rest after a peak.
    if (!this.rising && this.env < 0.18 && this.peakValue > 0.45) {
      this.cycles += 1;
      this.peakValue = 0;
      this.opts.onCycle?.(this.cycles);
    }

    return {
      energy: this.env,
      direction,
      cycles: this.cycles,
      peaked,
    };
  }

  get cycleCount() {
    return this.cycles;
  }

  /** Stop the mic tracks and disconnect. Always call on teardown. */
  stop() {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    try {
      this.source?.disconnect();
      this.filter?.disconnect();
      this.analyser?.disconnect();
    } catch {
      /* ignore */
    }
    this.source = null;
    this.filter = null;
    this.analyser = null;
    this.buf = null;
  }
}
