// ─────────────────────────────────────────────────────────────────────────────
// 313 · Kids Tone Tower — audio engine
//
// Warm mallet/marimba-ish voices (triangle/sine + a bright partial), short
// envelopes via setTargetAtTime, a soft always-on pad so it never feels broken,
// a synthesized convolver reverb (no audio files), and a brick-wall
// DynamicsCompressor limiter + modest master gain so it is always safe for
// small ears.
// ─────────────────────────────────────────────────────────────────────────────

// G-major hexachord frequencies (G A B C D E). The 4 playable tiles use
// G A B D — a clean subset, deliberately NOT C-major-pentatonic.
export const SCALE = {
  G3: 196.0,
  A3: 220.0,
  B3: 246.94,
  C4: 261.63,
  D4: 293.66,
  E4: 329.63,
} as const;

export type NoteName = keyof typeof SCALE;

// The 4 tiles, low → high. Each has a warm pitch color (used by canvas + UI).
export const TILES: { note: NoteName; hz: number; color: string }[] = [
  { note: "G3", hz: SCALE.G3, color: "#f0a04b" }, // warm amber
  { note: "A3", hz: SCALE.A3, color: "#e36588" }, // rose
  { note: "B3", hz: SCALE.B3, color: "#7bc47f" }, // green
  { note: "D4", hz: SCALE.D4, color: "#5aa9e6" }, // sky blue
];

// Full scale pool used when the target sequence grows (G A B C D E).
export const SCALE_POOL: NoteName[] = ["G3", "A3", "B3", "C4", "D4", "E4"];

export function colorForNote(note: NoteName): string {
  const t = TILES.find((x) => x.note === note);
  if (t) return t.color;
  // C4 / E4 (only appear in the grown target sequence) get their own warm hues.
  if (note === "C4") return "#c792ea"; // lilac
  if (note === "E4") return "#ffd166"; // soft gold
  return "#ffffff";
}

export class ToneTowerAudio {
  ctx: AudioContext;
  private master: GainNode;
  private limiter: DynamicsCompressorNode;
  private reverb: ConvolverNode;
  private padGain: GainNode;
  private ok = true;

  constructor() {
    const AC = (window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext) as typeof AudioContext;
    this.ctx = new AC();

    // Master gain — modest, before the limiter.
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;

    // Brick-wall-ish limiter: low threshold, high ratio, fast attack.
    this.limiter = this.ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -10;
    this.limiter.knee.value = 0;
    this.limiter.ratio.value = 20;
    this.limiter.attack.value = 0.003;
    this.limiter.release.value = 0.25;

    // Synthesized reverb (decaying filtered noise impulse, no audio files).
    this.reverb = this.ctx.createConvolver();
    this.reverb.buffer = this.makeImpulse(1.8, 2.4);
    const reverbGain = this.ctx.createGain();
    reverbGain.gain.value = 0.28;

    // Always-on soft pad (a quiet G drone) so it never feels broken.
    this.padGain = this.ctx.createGain();
    this.padGain.gain.value = 0.0;

    // Wiring: master → limiter → destination. Reverb send taps master.
    this.master.connect(this.limiter);
    this.master.connect(reverbGain);
    reverbGain.connect(this.reverb);
    this.reverb.connect(this.limiter);
    this.limiter.connect(this.ctx.destination);

    this.padGain.connect(this.master);
  }

  get available(): boolean {
    return this.ok;
  }

  async resume(): Promise<void> {
    try {
      if (this.ctx.state !== "running") await this.ctx.resume();
      this.startPad();
    } catch {
      this.ok = false;
    }
  }

  // A soft two-oscillator G pad that fades in and stays on quietly.
  private startPad(): void {
    if (this.padGain.gain.value > 0.001) return; // already running
    const now = this.ctx.currentTime;
    const voices = [SCALE.G3 / 2, SCALE.D4 / 2]; // low G + D, an open fifth
    for (const hz of voices) {
      const osc = this.ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = hz;
      const lfo = this.ctx.createOscillator();
      lfo.type = "sine";
      lfo.frequency.value = 0.12;
      const lfoGain = this.ctx.createGain();
      lfoGain.gain.value = 1.5;
      lfo.connect(lfoGain);
      lfoGain.connect(osc.frequency);
      osc.connect(this.padGain);
      osc.start();
      lfo.start();
    }
    this.padGain.gain.setTargetAtTime(0.05, now, 1.5);
  }

  private makeImpulse(seconds: number, decay: number): AudioBuffer {
    const rate = this.ctx.sampleRate;
    const len = Math.max(1, Math.floor(seconds * rate));
    const buf = this.ctx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const data = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        const env = Math.pow(1 - i / len, decay);
        data[i] = (Math.random() * 2 - 1) * env;
      }
    }
    return buf;
  }

  // A warm marimba-ish pluck: sine fundamental + a soft triangle partial,
  // short percussive envelope. `when` is an absolute ctx time (default: now).
  playNote(hz: number, when?: number, gain = 0.9): void {
    if (!this.ok) return;
    const t = when ?? this.ctx.currentTime;

    const voiceGain = this.ctx.createGain();
    voiceGain.gain.setValueAtTime(0.0001, t);
    voiceGain.gain.exponentialRampToValueAtTime(gain, t + 0.006);
    voiceGain.gain.setTargetAtTime(0.0001, t + 0.05, 0.22);
    voiceGain.connect(this.master);

    // Fundamental (sine).
    const o1 = this.ctx.createOscillator();
    o1.type = "sine";
    o1.frequency.value = hz;
    const g1 = this.ctx.createGain();
    g1.gain.value = 0.8;
    o1.connect(g1);
    g1.connect(voiceGain);

    // Bright partial (triangle, +1 octave, quieter, faster decay) = mallet edge.
    const o2 = this.ctx.createOscillator();
    o2.type = "triangle";
    o2.frequency.value = hz * 2;
    const g2 = this.ctx.createGain();
    g2.gain.setValueAtTime(0.0001, t);
    g2.gain.exponentialRampToValueAtTime(0.22, t + 0.005);
    g2.gain.setTargetAtTime(0.0001, t + 0.02, 0.09);
    o2.connect(g2);
    g2.connect(voiceGain);

    o1.start(t);
    o2.start(t);
    o1.stop(t + 1.6);
    o2.stop(t + 1.6);
  }

  // Soft landing "thud-chime" when a correct block settles.
  playLand(hz: number, when?: number): void {
    if (!this.ok) return;
    const t = when ?? this.ctx.currentTime;
    this.playNote(hz, t, 0.85);
    // A low soft thump under it.
    const o = this.ctx.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(70, t + 0.18);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.4, t + 0.01);
    g.gain.setTargetAtTime(0.0001, t + 0.03, 0.1);
    o.connect(g);
    g.connect(this.master);
    o.start(t);
    o.stop(t + 0.6);
  }

  // Gentle descending "aw" when the top block topples — NOT a buzzer.
  playTopple(when?: number): void {
    if (!this.ok) return;
    const t = when ?? this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(330, t);
    o.frequency.exponentialRampToValueAtTime(160, t + 0.5);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.35, t + 0.02);
    g.gain.setTargetAtTime(0.0001, t + 0.1, 0.18);
    o.connect(g);
    g.connect(this.master);
    o.start(t);
    o.stop(t + 1.0);
  }

  dispose(): void {
    try {
      this.ctx.close();
    } catch {
      /* ignore */
    }
  }
}
