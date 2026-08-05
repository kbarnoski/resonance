/**
 * 6728 · Comma Walk — additive drawbar-organ voice.
 *
 * Each note is 3 sine partials (1×, 2×, 3×) summed — a stripped tonewheel
 * organ. Frequencies glide with setTargetAtTime so when the tonal center slides
 * a comma you HEAR the harmony sink. Polyphony is capped at ~10 voices with
 * oldest-steal; a DynamicsCompressor limits and master gain stays ≤ 0.2.
 */

interface Voice {
  id: number;
  partials: OscillatorNode[];
  gain: GainNode;
  startedAt: number;
  freq: number;
}

const PARTIAL_MULT = [1, 2, 3];
const PARTIAL_GAIN = [1.0, 0.5, 0.32];
const MAX_VOICES = 10;
const GLIDE = 0.12; // seconds time-constant for pitch/center glide

export class CommaOrganAudio {
  readonly ctx: AudioContext;
  private master: GainNode;
  private comp: DynamicsCompressorNode;
  private voices = new Map<number, Voice>();
  private nextId = 1;

  constructor() {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctor) throw new Error("no-audiocontext");
    this.ctx = new Ctor();
    this.comp = this.ctx.createDynamicsCompressor();
    this.comp.threshold.value = -14;
    this.comp.ratio.value = 12;
    this.comp.attack.value = 0.003;
    this.comp.release.value = 0.25;
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.18;
    this.comp.connect(this.master).connect(this.ctx.destination);
  }

  resume() {
    if (this.ctx.state === "suspended") void this.ctx.resume();
  }

  private steal() {
    if (this.voices.size < MAX_VOICES) return;
    let oldest: Voice | null = null;
    for (const v of this.voices.values()) {
      if (!oldest || v.startedAt < oldest.startedAt) oldest = v;
    }
    if (oldest) this.noteOff(oldest.id, 0.05);
  }

  noteOn(freq: number, velocity = 0.9): number {
    this.steal();
    const t = this.ctx.currentTime;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(
      Math.max(0.02, velocity * 0.22),
      t + 0.02,
    );
    gain.connect(this.comp);
    const partials: OscillatorNode[] = [];
    for (let i = 0; i < PARTIAL_MULT.length; i++) {
      const osc = this.ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq * PARTIAL_MULT[i], t);
      const pg = this.ctx.createGain();
      pg.gain.value = PARTIAL_GAIN[i];
      osc.connect(pg).connect(gain);
      osc.start(t);
      partials.push(osc);
    }
    const id = this.nextId++;
    this.voices.set(id, { id, partials, gain, startedAt: t, freq });
    return id;
  }

  /** Glide a live voice to a new fundamental — the audible comma slide. */
  glide(id: number, freq: number) {
    const v = this.voices.get(id);
    if (!v) return;
    const t = this.ctx.currentTime;
    for (let i = 0; i < v.partials.length; i++) {
      v.partials[i].frequency.setTargetAtTime(
        freq * PARTIAL_MULT[i],
        t,
        GLIDE,
      );
    }
    v.freq = freq;
  }

  noteOff(id: number, release = 0.35) {
    const v = this.voices.get(id);
    if (!v) return;
    const t = this.ctx.currentTime;
    v.gain.gain.cancelScheduledValues(t);
    v.gain.gain.setValueAtTime(Math.max(0.0001, v.gain.gain.value), t);
    v.gain.gain.exponentialRampToValueAtTime(0.0001, t + release);
    for (const osc of v.partials) osc.stop(t + release + 0.05);
    this.voices.delete(id);
  }

  dispose() {
    const t = this.ctx.currentTime;
    for (const v of this.voices.values()) {
      try {
        v.gain.gain.cancelScheduledValues(t);
        for (const osc of v.partials) osc.stop(t);
      } catch {
        /* already stopped */
      }
    }
    this.voices.clear();
    void this.ctx.close();
  }
}
