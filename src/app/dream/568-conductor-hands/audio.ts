// audio.ts — two-voice polytempo synth engine for 568-conductor-hands.
//
// Each voice is a warm pluck synth (sine fundamental + a soft octave partial,
// fast pluck envelope) playing the SAME consonant pentatonic melodic cell.
// Voice B is transposed up a fifth so the two voices are distinguishable but
// every pitch stays consonant — the ONLY tension in the piece is metric.
//
// Each voice runs its own look-ahead scheduler (a setInterval ~25 ms that
// schedules osc.start(t) ~120 ms ahead — sample-accurate, never setTimeout-
// per-note). Master chain ends in a limiter so it can never blast.

// D-major pentatonic across two octaves — zero harmonic tension.
const PENTATONIC: number[] = [
  293.66, 329.63, 369.99, 440.0, 493.88, // D4 E4 F#4 A4 B4
  587.33, 659.25, 739.99, 880.0, 987.77, // D5 E5 F#5 A5 B5
];

// Rising-then-falling melodic cell (indices into PENTATONIC).
const CELL: number[] = [0, 2, 4, 3, 6, 5, 1, 3];

const FIFTH = 1.5; // voice B transposed up a perfect fifth (consonant)

const SCHEDULE_INTERVAL_MS = 25;
const LOOKAHEAD_S = 0.12;

export interface BeatInfo {
  voice: 0 | 1;
  time: number; // AudioContext time the beat fires
  freq: number;
}

interface VoiceRuntime {
  beatPeriodS: number; // current inter-beat interval (seconds)
  nextBeatTime: number; // AudioContext time of the next scheduled beat
  cellPos: number;
  transpose: number;
}

export class PolytempoEngine {
  readonly ctx: AudioContext;
  private master: GainNode;
  private limiter: DynamicsCompressorNode;
  private voiceGains: GainNode[];
  private voices: VoiceRuntime[];
  private timer: number | null = null;
  // Called (best-effort, on the next animation frame) when a beat is scheduled,
  // so the visual layer can flash that voice in sync.
  onBeat: ((b: BeatInfo) => void) | null = null;

  constructor() {
    const AC: typeof AudioContext =
      window.AudioContext ||
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).webkitAudioContext;
    this.ctx = new AC();

    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;

    // Brick-wall-ish limiter so the two voices can never blast.
    this.limiter = this.ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -10;
    this.limiter.knee.value = 6;
    this.limiter.ratio.value = 20;
    this.limiter.attack.value = 0.003;
    this.limiter.release.value = 0.25;

    this.master.connect(this.limiter);
    this.limiter.connect(this.ctx.destination);

    // Per-voice gain so each can be panned / coloured independently.
    const panA = this.ctx.createStereoPanner();
    panA.pan.value = -0.45;
    const panB = this.ctx.createStereoPanner();
    panB.pan.value = 0.45;
    const gA = this.ctx.createGain();
    gA.gain.value = 0.9;
    const gB = this.ctx.createGain();
    gB.gain.value = 0.9;
    gA.connect(panA);
    gB.connect(panB);
    panA.connect(this.master);
    panB.connect(this.master);
    this.voiceGains = [gA, gB];

    const now = this.ctx.currentTime;
    // Default tempi: voice A 96 BPM, voice B locked at A × φ.
    const basePeriod = 60 / 96;
    this.voices = [
      {
        beatPeriodS: basePeriod,
        nextBeatTime: now + 0.2,
        cellPos: 0,
        transpose: 1,
      },
      {
        beatPeriodS: basePeriod / 1.6180339887,
        nextBeatTime: now + 0.2,
        cellPos: 0,
        transpose: FIFTH,
      },
    ];
  }

  start(): void {
    if (this.timer !== null) return;
    const now = this.ctx.currentTime;
    for (const v of this.voices) v.nextBeatTime = now + 0.2;
    this.timer = window.setInterval(
      () => this.tick(),
      SCHEDULE_INTERVAL_MS,
    );
  }

  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async resume(): Promise<void> {
    if (this.ctx.state === "suspended") {
      try {
        await this.ctx.resume();
      } catch {
        /* ignore */
      }
    }
  }

  // Set a voice's tempo from a beat period (seconds). Clamped to a sane range.
  setVoicePeriod(voice: 0 | 1, periodS: number): void {
    const clamped = Math.max(0.18, Math.min(2.0, periodS));
    this.voices[voice].beatPeriodS = clamped;
  }

  getVoicePeriod(voice: 0 | 1): number {
    return this.voices[voice].beatPeriodS;
  }

  // The look-ahead scheduler: enqueue every beat that falls within LOOKAHEAD_S.
  private tick(): void {
    const horizon = this.ctx.currentTime + LOOKAHEAD_S;
    for (let i = 0; i < this.voices.length; i++) {
      const v = this.voices[i];
      while (v.nextBeatTime < horizon) {
        const idx = CELL[v.cellPos % CELL.length];
        const freq = PENTATONIC[idx] * v.transpose;
        this.scheduleNote(this.voiceGains[i], freq, v.nextBeatTime);
        if (this.onBeat) {
          const at = v.nextBeatTime;
          const voiceIdx = i as 0 | 1;
          // Fire the visual flash close to audible time.
          const delayMs = Math.max(0, (at - this.ctx.currentTime) * 1000);
          window.setTimeout(() => {
            this.onBeat?.({ voice: voiceIdx, time: at, freq });
          }, delayMs);
        }
        v.cellPos = (v.cellPos + 1) % CELL.length;
        v.nextBeatTime += v.beatPeriodS;
      }
    }
  }

  // Warm pluck: sine fundamental + soft octave partial, fast pluck envelope.
  private scheduleNote(dest: GainNode, freq: number, t: number): void {
    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(0.22, t + 0.005);
    env.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
    env.connect(dest);

    const osc = this.ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(freq, t);

    const partial = this.ctx.createOscillator();
    partial.type = "sine";
    partial.frequency.setValueAtTime(freq * 2, t);
    const partialGain = this.ctx.createGain();
    partialGain.gain.value = 0.25;
    partial.connect(partialGain);
    partialGain.connect(env);

    osc.connect(env);

    osc.start(t);
    partial.start(t);
    osc.stop(t + 1.0);
    partial.stop(t + 1.0);
  }

  close(): void {
    this.stop();
    this.ctx.close().catch(() => {});
  }
}
