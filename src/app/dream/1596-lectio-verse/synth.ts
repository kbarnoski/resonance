// ════════════════════════════════════════════════════════════════════════════
// Inline Web Audio engine for 1596-lectio-verse — the "reader" synth.
//
// Each word the reading light lands on is SPOKEN as a short just-intonation FM
// tone (a soft struck-reed voice). A low JI under-bed drone sustains beneath so
// the piece is never silent, even before a note is struck.
//
//  - BED    : a sustaining low 7-limit dyad (root + fifth + octave) under a slow
//             filter LFO — the contemplative floor the reading sits on.
//  - SPEAK  : an FM voice rung for each advanced word; pitch comes from the
//             word's seeded scale-step (see verse.ts), mapped onto a 7-limit
//             just-intonation scale across three octaves.
//  - DUCK   : when a real piano recording is loaded, the synth ducks to a soft
//             under-bed so the loaded audio LEADS the reading.
//  - EXTERNAL: loaded-audio routing — a MediaElementSource is connected into
//             `externalInput`, so the piano also passes through the compressor
//             and shares the safety ceiling.
//
// Signal path: every voice + bed -> masterGain (≤ 0.15) -> compressor ->
// destination; externalInput -> compressor -> destination. Polyphony ≤ 12,
// self-cleaning. Gesture-gated: nothing sounds until start() from a user
// gesture. Determinism: the bed noise (none here) and all timing use
// AudioContext currentTime — no wall-clock, no unseeded entropy.
// ════════════════════════════════════════════════════════════════════════════

// 7-limit just-intonation scale (one octave), pure ratios over the root.
const JI = [1, 9 / 8, 5 / 4, 4 / 3, 3 / 2, 5 / 3, 15 / 8];
const ROOT = 138.6; // ~C#3 — a warm reading register
const OCTAVES = 3;

const MASTER_LEAD = 0.15; // synth leads (no file loaded)
const MASTER_DUCK = 0.055; // synth under-bed (piano loaded)

type Voice = { stop: (t: number) => void; endsAt: number };

export class LectioSynth {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private comp: DynamicsCompressorNode | null = null;
  private extGain: GainNode | null = null;
  private voices: Voice[] = [];
  private bedNodes: AudioNode[] = [];
  private started = false;
  private lastSpeak = 0;

  get running(): boolean {
    return this.started;
  }

  /** The live AudioContext (null until start()) — shared with the onset reader. */
  get context(): AudioContext | null {
    return this.ctx;
  }

  /** Input node for loaded-audio (routed through the compressor + safety ceiling). */
  get externalInput(): GainNode | null {
    return this.extGain;
  }

  /** Create + resume the context and light up the sustaining bed. */
  async start(): Promise<void> {
    if (this.started) {
      if (this.ctx && this.ctx.state === "suspended") await this.ctx.resume();
      return;
    }
    const Ctor: typeof AudioContext =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const ctx = new Ctor();
    this.ctx = ctx;

    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.ratio.value = 4;
    comp.attack.value = 0.004;
    comp.release.value = 0.2;
    comp.connect(ctx.destination);
    this.comp = comp;

    const master = ctx.createGain();
    master.gain.value = 0.0;
    master.connect(comp);
    this.master = master;

    // external (loaded piano) bus — also safety-limited through the compressor
    const ext = ctx.createGain();
    ext.gain.value = 0.9;
    ext.connect(comp);
    this.extGain = ext;

    await ctx.resume();
    this.started = true;

    this.buildBed();

    // gentle master fade-in (≤ 3 Hz of change, no clicks)
    const now = ctx.currentTime;
    master.gain.setValueAtTime(0.0, now);
    master.gain.linearRampToValueAtTime(MASTER_LEAD, now + 1.8);
  }

  // ── sustaining under-bed (root + fifth + octave, gently detuned) ───────────
  private buildBed(): void {
    const ctx = this.ctx!;
    const bus = ctx.createGain();
    bus.gain.value = 0.3;

    const filt = ctx.createBiquadFilter();
    filt.type = "lowpass";
    filt.frequency.value = 460;
    filt.Q.value = 0.7;
    filt.connect(bus);
    bus.connect(this.master!);

    // slow filter LFO — a breathing brightness (≪ 3 Hz)
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.05;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 150;
    lfo.connect(lfoGain);
    lfoGain.connect(filt.frequency);
    lfo.start();

    const ratios = [0.5, 1, 3 / 2];
    for (const r of ratios) {
      const base = ROOT * r;
      for (const det of [-3, 3]) {
        const o = ctx.createOscillator();
        o.type = "sine";
        o.frequency.value = base;
        o.detune.value = det;
        const g = ctx.createGain();
        g.gain.value = r === 0.5 ? 0.5 : 0.28;
        o.connect(g);
        g.connect(filt);
        o.start();
        this.bedNodes.push(o, g);
      }
    }
    this.bedNodes.push(bus, filt, lfo, lfoGain);
  }

  /** Duck the synth to an under-bed (piano leads) or restore it to lead. */
  setDucked(ducked: boolean): void {
    if (!this.started || !this.ctx || !this.master) return;
    const now = this.ctx.currentTime;
    const target = ducked ? MASTER_DUCK : MASTER_LEAD;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(this.master.gain.value, now);
    this.master.gain.linearRampToValueAtTime(target, now + 0.4);
  }

  // ── polyphony management ───────────────────────────────────────────────────
  private cull(): void {
    const now = this.ctx!.currentTime;
    this.voices = this.voices.filter((v) => v.endsAt > now);
    while (this.voices.length > 12) {
      const v = this.voices.shift()!;
      v.stop(now);
    }
  }

  /** Map a seeded scale-step index onto a 7-limit JI frequency. */
  freqFromStep(step: number): number {
    const n = JI.length * OCTAVES;
    const idx = Math.min(n - 1, Math.max(0, Math.floor(step)));
    const oct = Math.floor(idx / JI.length);
    const deg = idx % JI.length;
    return ROOT * JI[deg] * Math.pow(2, oct);
  }

  /** Speak one word — a soft FM struck-reed voice at the word's JI pitch. */
  speak(step: number, vel = 1): void {
    if (!this.started || !this.ctx) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    if (now - this.lastSpeak < 0.03) return; // rate-limit onset swarms
    this.lastSpeak = now;
    this.cull();

    const freq = this.freqFromStep(step);

    const carrier = ctx.createOscillator();
    carrier.type = "triangle";
    carrier.frequency.value = freq;

    // FM modulator — a low ratio gives a soft, voiced (not bell-like) timbre
    const mod = ctx.createOscillator();
    mod.type = "sine";
    mod.frequency.value = freq * 1.5;
    const modGain = ctx.createGain();
    modGain.gain.setValueAtTime(freq * 0.9 * vel, now);
    modGain.gain.exponentialRampToValueAtTime(freq * 0.04, now + 0.35);
    mod.connect(modGain);
    modGain.connect(carrier.frequency);

    // a gentle low-pass so louder words are not harsh
    const tone = ctx.createBiquadFilter();
    tone.type = "lowpass";
    tone.frequency.value = 2400;
    tone.Q.value = 0.6;

    const amp = ctx.createGain();
    const peak = 0.2 * vel;
    amp.gain.setValueAtTime(0.0001, now);
    amp.gain.exponentialRampToValueAtTime(peak, now + 0.012);
    amp.gain.exponentialRampToValueAtTime(0.0006, now + 0.7);

    carrier.connect(tone);
    tone.connect(amp);
    amp.connect(this.master!);
    carrier.start(now);
    mod.start(now);
    const endsAt = now + 0.8;
    carrier.stop(endsAt);
    mod.stop(endsAt);

    this.voices.push({
      endsAt,
      stop: (t) => {
        try {
          amp.gain.cancelScheduledValues(t);
          amp.gain.setValueAtTime(Math.max(0.0001, amp.gain.value), t);
          amp.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
          carrier.stop(t + 0.09);
          mod.stop(t + 0.09);
        } catch {
          /* already stopped */
        }
      },
    });
  }

  /** Full teardown — fade, stop, close. */
  async dispose(): Promise<void> {
    if (!this.ctx) return;
    const ctx = this.ctx;
    try {
      const now = ctx.currentTime;
      if (this.master) {
        this.master.gain.cancelScheduledValues(now);
        this.master.gain.setValueAtTime(this.master.gain.value, now);
        this.master.gain.linearRampToValueAtTime(0.0001, now + 0.25);
      }
      for (const v of this.voices) v.stop(now);
      this.voices = [];
      await new Promise((res) => setTimeout(res, 300));
      try {
        this.extGain?.disconnect();
      } catch {
        /* ignore */
      }
      await ctx.close();
    } catch {
      /* ignore */
    } finally {
      this.ctx = null;
      this.master = null;
      this.comp = null;
      this.extGain = null;
      this.bedNodes = [];
      this.voices = [];
      this.started = false;
    }
  }
}
