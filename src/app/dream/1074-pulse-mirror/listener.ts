// listener.ts — the perception half of Pulse Mirror.
//
// Two things live here, both speaking ONE interface (OnsetSource):
//
//   1. MicListener   — a real spectral-flux onset detector on an AnalyserNode.
//   2. DemoPerformer — a self-clocking synthetic onset generator so the whole
//                      follow-and-answer loop is demonstrable with NO mic.
//
// Both emit onset events (a timestamp on the AudioContext clock) into a shared
// TempoTracker, which folds inter-onset intervals into a beat period, a beat
// phase, and a confidence. The scheduler (engine.ts) reads the tracker to place
// answers on the PREDICTED next beat.
//
// References embedded in the design:
//   • Dannenberg 1984 — on-line accompaniment: match/predict, don't lag.
//   • Ellis 2007 — beat tracking as period + phase over onset strength.

/** A single accepted onset. `time` is on the AudioContext clock (seconds). */
export interface OnsetEvent {
  time: number;
  /** 0..1 salience of the onset (spectral-flux peak height, normalized). */
  strength: number;
}

/** Anything that can drive the tracker: real mic or synthetic performer. */
export interface OnsetSource {
  /** Called each frame; pushes any new onsets into the given tracker. */
  poll(tracker: TempoTracker): void;
  /** Human-readable mode for the badge. */
  readonly kind: "mic" | "demo";
  dispose(): void;
}

// ── Tempo / beat tracker ─────────────────────────────────────────────────────
// A rolling buffer of inter-onset intervals (IOIs). The median IOI, octave-
// folded into a musical range, is the beat PERIOD. Beat phase is carried from
// the most recent onset. Confidence falls out of how tightly the IOIs cluster.

const IOI_MIN = 0.3; // s  (~200 BPM)
const IOI_MAX = 1.0; // s  (~60 BPM)
const IOI_BUFFER = 12;

export interface TempoState {
  period: number; // beat period in seconds
  bpm: number;
  phase: number; // 0..1, position within the current beat at `phaseTime`
  phaseTime: number; // AudioContext time the phase was sampled
  confidence: number; // 0..1
  lastOnsetTime: number;
  onsetCount: number;
}

export class TempoTracker {
  private iois: number[] = [];
  private lastOnset = -1;
  private period = 0.55; // sensible default ~109 BPM
  private confidence = 0;
  private onsetCount = 0;
  /** Most recent onsets (times), for the visual caller blooms. */
  readonly recentOnsets: OnsetEvent[] = [];

  /** Fold any interval into the musical range by halving/doubling. */
  private static fold(interval: number): number {
    let v = interval;
    while (v > IOI_MAX) v /= 2;
    while (v < IOI_MIN) v *= 2;
    return v;
  }

  addOnset(ev: OnsetEvent): void {
    this.onsetCount += 1;
    this.recentOnsets.push(ev);
    if (this.recentOnsets.length > 32) this.recentOnsets.shift();

    if (this.lastOnset >= 0) {
      const raw = ev.time - this.lastOnset;
      if (raw > 0.08 && raw < 2.4) {
        this.iois.push(TempoTracker.fold(raw));
        if (this.iois.length > IOI_BUFFER) this.iois.shift();
        this.recomputePeriod();
      }
    }
    this.lastOnset = ev.time;
  }

  private recomputePeriod(): void {
    if (this.iois.length < 2) return;
    const sorted = [...this.iois].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    const median =
      sorted.length % 2 === 0
        ? (sorted[mid - 1] + sorted[mid]) / 2
        : sorted[mid];
    // Smooth toward the new median so tempo glides rather than jumps.
    this.period = this.period * 0.6 + median * 0.4;

    // Confidence from spread: tight cluster around the median → high.
    const mean = sorted.reduce((a, b) => a + b, 0) / sorted.length;
    const variance =
      sorted.reduce((a, b) => a + (b - mean) * (b - mean), 0) / sorted.length;
    const std = Math.sqrt(variance);
    const spread = std / Math.max(0.05, mean); // coefficient of variation
    const fromSpread = Math.max(0, 1 - spread * 3.5);
    const fromCount = Math.min(1, this.iois.length / 6);
    this.confidence = fromSpread * fromCount;
  }

  /** Sample the tracker state at time `now` (AudioContext seconds). */
  sample(now: number): TempoState {
    let phase = 0;
    if (this.lastOnset >= 0 && this.period > 0) {
      phase = ((now - this.lastOnset) / this.period) % 1;
      if (phase < 0) phase += 1;
    }
    return {
      period: this.period,
      bpm: 60 / this.period,
      phase,
      phaseTime: now,
      confidence: this.confidence,
      lastOnsetTime: this.lastOnset,
      onsetCount: this.onsetCount,
    };
  }

  /**
   * The next beat time strictly after `after`. Beats are anchored to the last
   * accepted onset and repeat every `period`. This is what the anticipatory
   * scheduler commits answers to.
   */
  nextBeatAfter(after: number): number {
    if (this.lastOnset < 0) return after + this.period;
    const elapsed = after - this.lastOnset;
    const n = Math.floor(elapsed / this.period) + 1;
    return this.lastOnset + n * this.period;
  }
}

// ── Mic listener: spectral-flux onset detection ──────────────────────────────

const FFT_SIZE = 1024;
const FLUX_WINDOW = 43; // ~0.7 s of frames at 60 fps → adaptive threshold window
const REFRACTORY_S = 0.09; // 90 ms minimum gap between accepted onsets
const THRESH_K = 1.6; // adaptive threshold = mean + K·std

export class MicListener implements OnsetSource {
  readonly kind = "mic" as const;
  private analyser: AnalyserNode;
  private ctx: AudioContext;
  private stream: MediaStream;
  private highpass: BiquadFilterNode;
  private srcNode: MediaStreamAudioSourceNode;
  private prevMag: Float32Array<ArrayBuffer>;
  private freqData: Float32Array<ArrayBuffer>;
  private fluxHistory: number[] = [];
  private lastAccept = -1;

  private constructor(
    ctx: AudioContext,
    stream: MediaStream,
    analyser: AnalyserNode,
    highpass: BiquadFilterNode,
    srcNode: MediaStreamAudioSourceNode,
  ) {
    this.ctx = ctx;
    this.stream = stream;
    this.analyser = analyser;
    this.highpass = highpass;
    this.srcNode = srcNode;
    const bins = analyser.frequencyBinCount;
    this.prevMag = new Float32Array(new ArrayBuffer(bins * 4));
    this.freqData = new Float32Array(new ArrayBuffer(bins * 4));
  }

  static async open(ctx: AudioContext): Promise<MicListener> {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    });
    const srcNode = ctx.createMediaStreamSource(stream);
    // ~120 Hz highpass rejects rumble/handling before analysis.
    const highpass = ctx.createBiquadFilter();
    highpass.type = "highpass";
    highpass.frequency.value = 120;
    highpass.Q.value = 0.7;
    const analyser = ctx.createAnalyser();
    analyser.fftSize = FFT_SIZE;
    analyser.smoothingTimeConstant = 0;
    srcNode.connect(highpass);
    highpass.connect(analyser);
    return new MicListener(ctx, stream, analyser, highpass, srcNode);
  }

  poll(tracker: TempoTracker): void {
    const a = this.analyser;
    a.getFloatFrequencyData(this.freqData);
    const bins = this.freqData.length;

    // Positive spectral flux: sum of positive bin-to-bin magnitude increases.
    // getFloatFrequencyData returns dB; convert to a bounded linear-ish scale.
    let flux = 0;
    for (let i = 0; i < bins; i++) {
      const db = this.freqData[i];
      const mag = db < -100 ? 0 : Math.pow(10, db / 40); // gentle magnitude
      const diff = mag - this.prevMag[i];
      if (diff > 0) flux += diff;
      this.prevMag[i] = mag;
    }

    // Adaptive threshold over a short window: mean + K·std.
    this.fluxHistory.push(flux);
    if (this.fluxHistory.length > FLUX_WINDOW) this.fluxHistory.shift();
    const h = this.fluxHistory;
    const mean = h.reduce((s, v) => s + v, 0) / h.length;
    let varSum = 0;
    for (const v of h) varSum += (v - mean) * (v - mean);
    const std = Math.sqrt(varSum / h.length);
    const threshold = mean + THRESH_K * std;

    const now = this.ctx.currentTime;
    const past = now - this.lastAccept >= REFRACTORY_S;
    if (
      this.fluxHistory.length >= 8 &&
      flux > threshold &&
      flux > 0.0001 &&
      past
    ) {
      this.lastAccept = now;
      const strength = Math.min(1, (flux - mean) / Math.max(1e-6, std * 4));
      tracker.addOnset({ time: now, strength });
    }
  }

  dispose(): void {
    try {
      this.srcNode.disconnect();
      this.highpass.disconnect();
      this.analyser.disconnect();
    } catch {
      /* already torn down */
    }
    for (const t of this.stream.getTracks()) t.stop();
  }
}

// ── Demo performer: self-clocking synthetic onsets ───────────────────────────
// Wanders ~90–120 BPM with slight humanization, emitting onsets through the
// SAME interface so the follow-and-answer loop runs entirely headless.

export class DemoPerformer implements OnsetSource {
  readonly kind = "demo" as const;
  private ctx: AudioContext;
  private nextOnset: number;
  private bpm = 104;
  private targetBpm = 104;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;
    this.nextOnset = ctx.currentTime + 0.4;
  }

  private period(): number {
    return 60 / this.bpm;
  }

  poll(tracker: TempoTracker): void {
    const now = this.ctx.currentTime;
    while (this.nextOnset <= now) {
      const strength = 0.55 + Math.random() * 0.4;
      tracker.addOnset({ time: this.nextOnset, strength });

      // Drift the target tempo slowly within a jazzy 90–120 BPM band.
      if (Math.random() < 0.15) {
        this.targetBpm = 90 + Math.random() * 30;
      }
      this.bpm += (this.targetBpm - this.bpm) * 0.06;

      // Humanize: +/- up to ~8% of the period, occasional syncopated skip.
      const jitter = (Math.random() - 0.5) * 0.16 * this.period();
      const step = Math.random() < 0.12 ? this.period() * 2 : this.period();
      this.nextOnset += step + jitter;
    }
  }

  dispose(): void {
    /* nothing to free */
  }
}
