// ════════════════════════════════════════════════════════════════════════════
// 1596 — lectio-verse · the audio-file onset detector (the score-follower).
//
// THE HEADLINE MECHANISM. Load a real piano recording (drag-drop or file
// picker); it plays through a MediaElementSource -> AnalyserNode. Each animation
// frame we compute the SPECTRAL FLUX — the sum of positive bin-to-bin increases
// in magnitude between successive spectra (Bello et al., "A Tutorial on Onset
// Detection in Music Signals", IEEE TSALP 2005). A note attack shows up as a
// broadband rise in energy, so flux spikes on each struck note.
//
// A spike becomes an ONSET when it exceeds an ADAPTIVE THRESHOLD (running mean +
// k·std over a short window) AND is a local peak AND lies outside a REFRACTORY
// window (so one attack fires once). Every onset ADVANCES the reading light to
// the next word — so the piano's phrasing drives the reading: a run of fast
// notes rushes a line, a held chord lets a word glow.
//
// This is a lightweight cousin of real-time audio-to-score alignment — Online
// Time Warping (Dixon, 2005) and Matchmaker (arXiv:2510.10087) — but instead of
// aligning to a known score it advances a monotonic reading cursor per attack.
//
// Determinism: the DETECTOR uses only live audio + AudioContext time; the words
// it advances through come from the seeded codex (verse.ts). No wall-clock and
// no unseeded entropy anywhere.
// ════════════════════════════════════════════════════════════════════════════

const FFT_SIZE = 1024; // 512 magnitude bins
const HISTORY = 43; // ~0.7s of flux at 60fps — the adaptive-threshold window
const REFRACTORY = 0.07; // seconds — min gap between reported onsets
const THRESH_K = 1.6; // std multiplier for the adaptive threshold
const THRESH_FLOOR = 0.008; // ignore flux below this (silence / room tone)

export type OnsetReaderOpts = {
  ctx: AudioContext;
  /** Node the playing audio is routed into (e.g. the synth's externalInput). */
  destination: AudioNode;
  onError?: (message: string) => void;
  onEnded?: () => void;
};

export class OnsetReader {
  private ctx: AudioContext;
  private dest: AudioNode;
  private el: HTMLAudioElement | null = null;
  private src: MediaElementAudioSourceNode | null = null;
  private analyser: AnalyserNode | null = null;
  private objectUrl: string | null = null;

  private spec: Uint8Array<ArrayBuffer>;
  private prev: Float32Array;
  private history: Float32Array;
  private histIdx = 0;
  private histFill = 0;
  private prevFlux = 0;
  private lastOnset = 0;
  private onError?: (message: string) => void;
  private onEnded?: () => void;

  active = false;

  constructor(opts: OnsetReaderOpts) {
    this.ctx = opts.ctx;
    this.dest = opts.destination;
    this.onError = opts.onError;
    this.onEnded = opts.onEnded;
    this.spec = new Uint8Array(new ArrayBuffer(FFT_SIZE / 2));
    this.prev = new Float32Array(FFT_SIZE / 2);
    this.history = new Float32Array(HISTORY);
  }

  /** Load a File, wire it through an analyser, and begin playback (looping). */
  async load(file: File): Promise<void> {
    if (!file.type.startsWith("audio/") && !/\.(mp3|wav|ogg|m4a|flac|aac)$/i.test(file.name)) {
      this.onError?.("That file is not audio — drop an audio recording (mp3, wav, …).");
      return;
    }
    this.teardownMedia();

    const url = URL.createObjectURL(file);
    this.objectUrl = url;
    const el = new Audio();
    el.src = url;
    el.loop = true;
    el.crossOrigin = "anonymous";
    this.el = el;

    el.addEventListener("error", () => {
      this.onError?.("Could not decode that audio file — try another recording.");
      this.active = false;
    });
    el.addEventListener("ended", () => this.onEnded?.());

    try {
      const src = this.ctx.createMediaElementSource(el);
      const analyser = this.ctx.createAnalyser();
      analyser.fftSize = FFT_SIZE;
      analyser.smoothingTimeConstant = 0.5;
      src.connect(analyser);
      analyser.connect(this.dest); // pass-through to the safety-limited bus
      this.src = src;
      this.analyser = analyser;

      // reset detector state for the new file
      this.prev.fill(0);
      this.history.fill(0);
      this.histIdx = 0;
      this.histFill = 0;
      this.prevFlux = 0;
      this.lastOnset = 0;

      await el.play();
      this.active = true;
    } catch {
      this.onError?.("Could not start audio playback — the browser blocked it.");
      this.active = false;
    }
  }

  /**
   * Advance one frame. Returns true when a note onset is detected this frame.
   * Call once per rAF while `active`.
   */
  update(): boolean {
    const analyser = this.analyser;
    if (!analyser || !this.active) return false;
    analyser.getByteFrequencyData(this.spec);

    // spectral flux: sum of positive magnitude increases, normalised
    let flux = 0;
    const bins = this.spec.length;
    for (let i = 0; i < bins; i++) {
      const v = this.spec[i] / 255;
      const d = v - this.prev[i];
      if (d > 0) flux += d;
      this.prev[i] = v;
    }
    flux /= bins;

    // adaptive threshold from the running window
    let mean = 0;
    const n = this.histFill;
    for (let i = 0; i < n; i++) mean += this.history[i];
    mean = n > 0 ? mean / n : 0;
    let varSum = 0;
    for (let i = 0; i < n; i++) {
      const d = this.history[i] - mean;
      varSum += d * d;
    }
    const std = n > 1 ? Math.sqrt(varSum / n) : 0;
    const threshold = Math.max(THRESH_FLOOR, mean + THRESH_K * std);

    // push into ring buffer
    this.history[this.histIdx] = flux;
    this.histIdx = (this.histIdx + 1) % HISTORY;
    if (this.histFill < HISTORY) this.histFill++;

    const now = this.ctx.currentTime;
    const isPeak = flux > this.prevFlux; // rising edge
    const clear = now - this.lastOnset > REFRACTORY;
    const onset = flux > threshold && isPeak && clear;
    this.prevFlux = flux;
    if (onset) this.lastOnset = now;
    return onset;
  }

  /** Live flux (0..~1) for the meter, and whether audio is playing. */
  get level(): number {
    return this.prevFlux;
  }

  private teardownMedia(): void {
    try {
      this.el?.pause();
    } catch {
      /* ignore */
    }
    try {
      this.src?.disconnect();
    } catch {
      /* ignore */
    }
    try {
      this.analyser?.disconnect();
    } catch {
      /* ignore */
    }
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }
    this.src = null;
    this.analyser = null;
    this.el = null;
    this.active = false;
  }

  /** Full teardown — pause, disconnect, revoke object URL. */
  dispose(): void {
    this.teardownMedia();
  }
}
