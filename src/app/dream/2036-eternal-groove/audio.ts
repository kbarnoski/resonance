// ---------------------------------------------------------------------------
// Risset RHYTHM engine — a Shepard tone for TEMPO.
//
// A stack of N octave-related tempo layers. Layer k sits at log-tempo position
// o_k = (phase + k) mod N (octaves) and fires at
//        tempo_k = baseBPM * 2^(o_k - N/2)   [beats-per-minute].
// A FIXED raised-cosine (Hann) window over the log-tempo axis decides each
// layer's loudness. As `phase` advances, every layer glides UP the octave
// ladder together; when a layer reaches the top (o = N) it wraps to the bottom
// (o = 0) — but the window weight there is ~0, so the wrap is silent. The ear
// therefore hears a tempo that rises (or falls) forever while the pattern is
// static and loops seamlessly. This is Jean-Claude Risset's endless-accelerando
// illusion moved from PITCH to TEMPO.
//
// The Hann window has a useful property: for N layers spaced one octave apart
// over exactly N octaves, the SUM of the weights is constant (N/2) regardless of
// phase — so overall loudness never pulses as layers cross the band.
//
// Timing comes from AudioContext.currentTime via a ~25ms look-ahead scheduler
// (Chris Wilson, "A Tale of Two Clocks"). The `phase` control value is owned by
// the component's rAF loop (smooth 60fps visuals) and read here — timing off the
// audio clock, control values off rAF.
// ---------------------------------------------------------------------------

export const N_LAYERS = 5;

const SCHEDULE_INTERVAL_MS = 25;
const LOOKAHEAD_S = 0.1;
const WEIGHT_FLOOR = 0.02; // below this a layer is inaudible — skip scheduling

/** Fixed raised-cosine window over the log-tempo axis, o in [0, N_LAYERS). */
export function hann(o: number): number {
  return 0.5 - 0.5 * Math.cos((2 * Math.PI * o) / N_LAYERS);
}

/** Wrap a log-tempo position into [0, N_LAYERS). */
export function wrapOct(o: number): number {
  return ((o % N_LAYERS) + N_LAYERS) % N_LAYERS;
}

export interface FlashEvent {
  k: number; // layer index
  t: number; // audio-clock time the strike sounds
  w: number; // window weight at strike time
}

export class RissetRhythmEngine {
  private ac: AudioContext;
  private master: GainNode;
  private noiseBuf: AudioBuffer;
  private timer: number | null = null;
  private next: number[] = [];
  private stopped = false;

  /** Perceived centre tempo (BPM) — the tempo at the window peak. Mutable. */
  baseBPM = 110;
  /** Pending visual strike flashes, drained by the component's rAF loop. */
  readonly flashes: FlashEvent[] = [];

  private getPhase: () => number;

  constructor(getPhase: () => number) {
    this.getPhase = getPhase;
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    this.ac = new Ctor();

    this.master = this.ac.createGain();
    this.master.gain.value = 0.0001;
    this.master.connect(this.ac.destination);

    // One second of white noise, reused for every percussive burst.
    const len = Math.floor(this.ac.sampleRate);
    const buf = this.ac.createBuffer(1, len, this.ac.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;

    const t0 = this.ac.currentTime;
    for (let k = 0; k < N_LAYERS; k++) this.next[k] = t0 + 0.08;
  }

  get audioTime(): number {
    return this.ac.currentTime;
  }

  async start(): Promise<void> {
    if (this.ac.state === "suspended") await this.ac.resume();
    const t = this.ac.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setValueAtTime(Math.max(this.master.gain.value, 0.0001), t);
    this.master.gain.exponentialRampToValueAtTime(0.85, t + 0.35);
    for (let k = 0; k < N_LAYERS; k++) this.next[k] = t + 0.1;
    this.timer = window.setInterval(() => this.poll(), SCHEDULE_INTERVAL_MS);
  }

  private poll(): void {
    if (this.stopped) return;
    const now = this.ac.currentTime;
    const horizon = now + LOOKAHEAD_S;
    const phase = this.getPhase();

    for (let k = 0; k < N_LAYERS; k++) {
      const o = wrapOct(phase + k);
      const tempo = this.baseBPM * Math.pow(2, o - N_LAYERS / 2);
      const w = hann(o);
      const period = 60 / tempo;

      // If a tempo change stranded this layer's clock in the past, catch up.
      if (this.next[k] < now - 0.06) this.next[k] = now;

      while (this.next[k] < horizon) {
        if (w > WEIGHT_FLOOR) {
          this.strike(o / N_LAYERS, w, this.next[k]);
          this.flashes.push({ k, t: this.next[k], w });
        }
        this.next[k] += period;
      }
    }

    if (this.flashes.length > 400) {
      this.flashes.splice(0, this.flashes.length - 400);
    }
  }

  /**
   * One percussive strike. `bright` in [0,1] is the layer's position in the
   * stack (0 = woody/low, 1 = bright/high). Pure rhythm & timbre — no pitch
   * lattice, no melody, no chord.
   */
  private strike(bright: number, w: number, t: number): void {
    const ac = this.ac;
    const amp = w * 0.85;

    // Membrane "tom": a fast downward pitch-swept sine. Higher layers start
    // brighter and decay faster; lower layers are woodier and ring longer.
    const tomDecay = 0.22 - bright * 0.16; // 0.22s .. 0.06s
    const f0 = 70 + bright * 270; // 70Hz .. 340Hz — timbre only, not a scale
    const osc = ac.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(f0, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(f0 * 0.5, 30), t + tomDecay);
    const tg = ac.createGain();
    tg.gain.setValueAtTime(0.0008, t);
    tg.gain.exponentialRampToValueAtTime(amp * 0.9, t + 0.004);
    tg.gain.exponentialRampToValueAtTime(0.0008, t + tomDecay);
    osc.connect(tg);
    tg.connect(this.master);
    osc.start(t);
    osc.stop(t + tomDecay + 0.02);
    osc.onended = () => {
      osc.disconnect();
      tg.disconnect();
    };

    // Filtered-noise transient: the "click"/attack. Bandpass rises with layer.
    const nDecay = 0.11 - bright * 0.08; // 0.11s .. 0.03s
    const src = ac.createBufferSource();
    src.buffer = this.noiseBuf;
    src.playbackRate.value = 0.8 + bright * 0.6;
    const bp = ac.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 500 * Math.pow(2, bright * 3.4); // ~500Hz .. ~5.3kHz
    bp.Q.value = 1.1;
    const ng = ac.createGain();
    const namp = amp * (0.18 + 0.5 * bright);
    ng.gain.setValueAtTime(0.0008, t);
    ng.gain.exponentialRampToValueAtTime(Math.max(namp, 0.0009), t + 0.003);
    ng.gain.exponentialRampToValueAtTime(0.0008, t + nDecay);
    src.connect(bp);
    bp.connect(ng);
    ng.connect(this.master);
    src.start(t);
    src.stop(t + nDecay + 0.02);
    src.onended = () => {
      src.disconnect();
      bp.disconnect();
      ng.disconnect();
    };
  }

  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    const t = this.ac.currentTime;
    try {
      this.master.gain.cancelScheduledValues(t);
      this.master.gain.setValueAtTime(Math.max(this.master.gain.value, 0.0001), t);
      this.master.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
    } catch {
      /* context may already be unusable */
    }
    setTimeout(() => {
      this.ac.close().catch(() => {});
    }, 250);
  }
}
