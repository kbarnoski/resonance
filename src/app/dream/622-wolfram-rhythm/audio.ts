/**
 * 622 — Wolfram Rhythm · audio engine
 * ─────────────────────────────────────────────────────────────────────────────
 * Sound design brief: EDGED / MECHANICAL, not cozy. Each live cell of a freshly
 * born CA row fires a short percussive event — clicks, struck-metal FM blips,
 * tight inharmonic plucks — panned by column, pitched by column over a
 * non-saccharine (whole-tone) scale. Chaotic rules pile up density and feel
 * dangerous; sparse rules feel stark.
 *
 * Master chain: voices → masterGain → DynamicsCompressor (limiter) → destination.
 * Polyphony is capped (oldest voice stolen) so a dense row never clips.
 *
 * Inspired by Iannis Xenakis's use of cellular automata for the severe,
 * architectural register — not warm just-intonation drones.
 */

const MAX_VOICES = 24; // hard polyphony cap; oldest stolen beyond this
const MASTER_GAIN = 0.34; // pre-limiter ceiling

/** Whole-tone-ish, slightly stretched set (semitone offsets from a root). */
const SCALE = [0, 2, 4, 6, 8, 10];

interface ActiveVoice {
  stop: number; // ctx time when this voice has fully decayed
  nodes: AudioNode[];
}

export type Timbre = "metal" | "click" | "pluck";

export class WolframAudio {
  readonly ctx: AudioContext;
  private master: GainNode;
  private limiter: DynamicsCompressorNode;
  private voices: ActiveVoice[] = [];

  timbre: Timbre = "metal";

  constructor() {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    this.ctx = new Ctor();

    this.limiter = this.ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -10;
    this.limiter.knee.value = 6;
    this.limiter.ratio.value = 16;
    this.limiter.attack.value = 0.002;
    this.limiter.release.value = 0.12;

    this.master = this.ctx.createGain();
    this.master.gain.value = MASTER_GAIN;

    this.master.connect(this.limiter);
    this.limiter.connect(this.ctx.destination);
  }

  /** Must be called inside a user gesture (iOS). */
  async resume(): Promise<void> {
    if (this.ctx.state !== "running") await this.ctx.resume();
  }

  setMasterGain(v: number): void {
    this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
  }

  /** Steal the oldest finished/active voices to stay under the cap. */
  private reap(now: number): void {
    this.voices = this.voices.filter((v) => v.stop > now);
    while (this.voices.length >= MAX_VOICES) {
      const v = this.voices.shift();
      if (!v) break;
      for (const n of v.nodes) {
        try {
          (n as OscillatorNode | AudioBufferSourceNode).stop?.();
        } catch {
          /* already stopped */
        }
      }
    }
  }

  private track(v: ActiveVoice): void {
    this.voices.push(v);
  }

  /** Map a column (0..cols-1) to a frequency over the whole-tone scale. */
  private freqForColumn(col: number, cols: number): number {
    // Spread across ~4 octaves. Root A2 = 110 Hz.
    const span = SCALE.length * 4;
    const step = Math.round((col / Math.max(1, cols - 1)) * (span - 1));
    const octave = Math.floor(step / SCALE.length);
    const degree = SCALE[step % SCALE.length];
    const semis = octave * 12 + degree;
    return 110 * Math.pow(2, semis / 12);
  }

  private panForColumn(col: number, cols: number): number {
    return (col / Math.max(1, cols - 1)) * 2 - 1; // -1 .. +1
  }

  /**
   * Fire one cell's note at audio time `time`.
   * `intensity` (0..1) scales gain so dense rows don't pile up loudness.
   */
  fireCell(
    col: number,
    cols: number,
    time: number,
    intensity: number,
  ): void {
    const ctx = this.ctx;
    this.reap(time);

    const pan = ctx.createStereoPanner();
    pan.pan.value = this.panForColumn(col, cols);
    const g = ctx.createGain();
    const freq = this.freqForColumn(col, cols);
    const vol = 0.5 * intensity;

    pan.connect(this.master);
    g.connect(pan);

    let stopAt = time + 0.4;
    const nodes: AudioNode[] = [pan, g];

    if (this.timbre === "metal") {
      // Struck-metal FM blip: two inharmonic partials, fast click attack.
      const carrier = ctx.createOscillator();
      carrier.type = "square";
      carrier.frequency.value = freq;
      const mod = ctx.createOscillator();
      mod.type = "square";
      mod.frequency.value = freq * 2.41; // inharmonic ratio → metallic
      const modGain = ctx.createGain();
      modGain.gain.setValueAtTime(freq * 3.5, time);
      modGain.gain.exponentialRampToValueAtTime(freq * 0.2, time + 0.12);
      mod.connect(modGain);
      modGain.connect(carrier.frequency);

      g.gain.setValueAtTime(0.0001, time);
      g.gain.exponentialRampToValueAtTime(vol, time + 0.002);
      g.gain.exponentialRampToValueAtTime(0.0001, time + 0.22);

      carrier.connect(g);
      carrier.start(time);
      mod.start(time);
      carrier.stop(time + 0.24);
      mod.stop(time + 0.24);
      stopAt = time + 0.24;
      nodes.push(carrier, mod, modGain);
    } else if (this.timbre === "click") {
      // Tight band-passed noise tick — woodblock / glitch.
      const len = Math.ceil(ctx.sampleRate * 0.05);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const bpf = ctx.createBiquadFilter();
      bpf.type = "bandpass";
      bpf.frequency.value = freq * 2;
      bpf.Q.value = 7;
      g.gain.setValueAtTime(vol * 1.4, time);
      g.gain.exponentialRampToValueAtTime(0.0001, time + 0.06);
      src.connect(bpf);
      bpf.connect(g);
      src.start(time);
      src.stop(time + 0.07);
      stopAt = time + 0.07;
      nodes.push(src, bpf);
    } else {
      // Tight inharmonic pluck: detuned triangle with snappy decay.
      const osc = ctx.createOscillator();
      osc.type = "triangle";
      osc.frequency.value = freq;
      const lpf = ctx.createBiquadFilter();
      lpf.type = "lowpass";
      lpf.frequency.setValueAtTime(freq * 8, time);
      lpf.frequency.exponentialRampToValueAtTime(freq * 1.5, time + 0.1);
      lpf.Q.value = 2;
      g.gain.setValueAtTime(0.0001, time);
      g.gain.exponentialRampToValueAtTime(vol, time + 0.003);
      g.gain.exponentialRampToValueAtTime(0.0001, time + 0.18);
      osc.connect(lpf);
      lpf.connect(g);
      osc.start(time);
      osc.stop(time + 0.2);
      stopAt = time + 0.2;
      nodes.push(osc, lpf);
    }

    this.track({ stop: stopAt, nodes });
  }

  close(): void {
    try {
      this.ctx.close();
    } catch {
      /* noop */
    }
  }
}
