// Choir of Strangers — audio engine.
//
// The insight (from the 2026 web-collaborative-music literature): tabs exchange
// only CONTROL events, never audio. Every tab SYNTHESIZES its own voice locally.
// So this engine owns a small bank of just-intonation voice slots — this tab's
// own voice, plus any deterministic "phantom" companions this tab is covering.
// Live peer voices are made by THEIR tabs; here they stay silent (visual only).
//
// Each voice = a stack of pure sine partials at ratio x tonic, through a soft
// lowpass into a shared convolver reverb. A single slow amplitude LFO — driven
// by the WALL CLOCK (Date.now), which every tab shares — makes the whole choir
// breathe together without transmitting a single sample.
//
// Master chain: voices -> reverb/dry -> compressor -> master gain -> out.
// Audio only starts on a user gesture (start()).

const MASTER_GAIN = 0.19;
const VOICE_MAX = 0.15; // per-voice ceiling before breath/level scaling

// Deterministic PRNG for the reverb impulse — NEVER Math.random at module load.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type VoiceSlot = {
  oscs: OscillatorNode[];
  gain: GainNode;
};

export class ChoirAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private comp: DynamicsCompressorNode | null = null;
  private wet: GainNode | null = null;
  private vibrato: OscillatorNode | null = null;
  private voices: VoiceSlot[] = [];
  private reducedMotion = false;
  private started = false;

  constructor(reducedMotion: boolean) {
    this.reducedMotion = reducedMotion;
  }

  get isRunning(): boolean {
    return this.started;
  }

  /** Build one voice slot per just-intonation ratio, all silent at first. */
  async start(tonic: number, ratios: number[]): Promise<void> {
    if (this.started) return;
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctx) throw new Error("Web Audio unavailable");
    const ctx = new Ctx();
    this.ctx = ctx;
    if (ctx.state === "suspended") await ctx.resume();

    const master = ctx.createGain();
    master.gain.value = 0;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -20;
    comp.knee.value = 26;
    comp.ratio.value = 3;
    comp.attack.value = 0.008;
    comp.release.value = 0.35;
    comp.connect(master);
    master.connect(ctx.destination);
    this.master = master;
    this.comp = comp;

    // ---- shared convolver reverb (deterministic impulse) -----------------
    const convolver = ctx.createConvolver();
    convolver.buffer = this.buildImpulse(ctx, 2.6);
    const wet = ctx.createGain();
    wet.gain.value = 0.42;
    convolver.connect(wet).connect(comp);
    this.wet = wet;

    // ---- one shared, subtle vibrato for gentle life (local flavor) -------
    const vibrato = ctx.createOscillator();
    vibrato.type = "sine";
    vibrato.frequency.value = this.reducedMotion ? 0.18 : 0.32;
    const vibratoGain = ctx.createGain();
    vibratoGain.gain.value = 3.5; // cents
    vibrato.connect(vibratoGain);
    vibrato.start();
    this.vibrato = vibrato;

    // ---- voice bank ------------------------------------------------------
    for (const ratio of ratios) {
      const f = tonic * ratio;
      const vgain = ctx.createGain();
      vgain.gain.value = 0;
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = Math.min(4200, f * 8);
      lp.Q.value = 0.6;
      lp.connect(vgain);
      // dry + wet
      vgain.connect(comp);
      vgain.connect(convolver);

      const oscs: OscillatorNode[] = [];
      // pure partials: fundamental, octave, soft twelfth — no detune (JI stays pure)
      const partials: Array<[number, OscillatorType, number]> = [
        [1, "sine", 0.5],
        [2, "sine", 0.16],
        [3, "sine", 0.07],
      ];
      for (const [mult, type, amp] of partials) {
        const o = ctx.createOscillator();
        o.type = type;
        o.frequency.value = f * mult;
        vibratoGain.connect(o.detune);
        const g = ctx.createGain();
        g.gain.value = amp;
        o.connect(g).connect(lp);
        o.start();
        oscs.push(o);
      }
      this.voices.push({ oscs, gain: vgain });
    }

    const now = ctx.currentTime;
    master.gain.setValueAtTime(0, now);
    master.gain.linearRampToValueAtTime(MASTER_GAIN, now + 1.4);
    this.started = true;
  }

  /** Set every voice's audible level in one pass. Levels already include the
   *  shared breath envelope and any me/phantom weighting; live-peer voices are
   *  passed as 0 (their own tab produces that sound). */
  setLevels(levels: number[]): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const now = ctx.currentTime;
    for (let i = 0; i < this.voices.length; i++) {
      const lvl = Math.max(0, Math.min(1, levels[i] ?? 0));
      this.voices[i].gain.gain.setTargetAtTime(lvl * VOICE_MAX, now, 0.05);
    }
  }

  private buildImpulse(ctx: AudioContext, seconds: number): AudioBuffer {
    const rate = ctx.sampleRate;
    const len = Math.floor(rate * seconds);
    const buf = ctx.createBuffer(2, len, rate);
    const rand = mulberry32(0x1832c401);
    for (let ch = 0; ch < 2; ch++) {
      const data = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        const decay = Math.pow(1 - i / len, 2.6);
        data[i] = (rand() * 2 - 1) * decay;
      }
    }
    return buf;
  }

  stop(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    for (const v of this.voices) {
      for (const o of v.oscs) {
        try {
          o.stop();
        } catch {
          /* already stopped */
        }
      }
    }
    try {
      this.vibrato?.stop();
    } catch {
      /* noop */
    }
    this.voices = [];
    this.vibrato = null;
    window.setTimeout(() => {
      ctx.close().catch(() => {
        /* noop */
      });
    }, 60);
    this.ctx = null;
    this.master = null;
    this.comp = null;
    this.wet = null;
    this.started = false;
  }
}
