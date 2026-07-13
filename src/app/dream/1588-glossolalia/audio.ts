// ════════════════════════════════════════════════════════════════════════════
// Inline Web Audio engine for 1588-glossolalia.
//
// The language-flood becomes music where the light touches it:
//  - PAD DRONE   : a sustaining low just-intonation dyad (root+fifth+octave)
//                  under a slow filter LFO — the piece is never silent.
//  - WASH        : a very quiet band-passed noise bed — the "syntactic hiss"
//                  under the pad, reinforcing the flood.
//  - MALLET/BELL : an FM pluck rung when a word passes through an aperture;
//                  pitch comes from the aperture's vertical position mapped onto
//                  a 7-limit just-intonation scale.
//  - TICK        : a tiny click per keystroke while steering.
//  - CHORD       : a JI chord ignited on tap/click (a burst-aperture).
//
// Signal path: every voice -> masterGain (≤ 0.16) -> DynamicsCompressor ->
// destination. Polyphony is capped (≤ 12) and self-cleaning. Gesture-gated:
// nothing sounds until start() is called from a user gesture.
//
// Determinism: no unseeded entropy, no wall-clock. The noise buffer is filled
// from a seeded mulberry32 PRNG; all timing uses AudioContext currentTime.
// ════════════════════════════════════════════════════════════════════════════

import { mulberry32 } from "./text";

// 7-limit just-intonation scale (one octave), pure ratios over the root.
const JI = [1, 9 / 8, 5 / 4, 4 / 3, 3 / 2, 5 / 3, 15 / 8];
const ROOT = 110; // A2
const OCTAVES = 3;

type Voice = { gain: GainNode; stop: (t: number) => void; endsAt: number };

export class GlossolaliaAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private comp: DynamicsCompressorNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private voices: Voice[] = [];
  private padNodes: AudioNode[] = [];
  private started = false;
  private lastMallet = 0;

  get running(): boolean {
    return this.started;
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
    comp.threshold.value = -18;
    comp.ratio.value = 4;
    comp.attack.value = 0.004;
    comp.release.value = 0.2;
    comp.connect(ctx.destination);
    this.comp = comp;

    const master = ctx.createGain();
    master.gain.value = 0.0;
    master.connect(comp);
    this.master = master;

    // a short seeded noise buffer, reused by wash + ticks
    const len = Math.floor(ctx.sampleRate * 1.5);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    const rng = mulberry32(0x9157);
    for (let i = 0; i < len; i++) data[i] = rng() * 2 - 1;
    this.noiseBuf = buf;

    await ctx.resume();
    this.started = true;

    this.buildPad();
    this.buildWash();

    // gentle master fade-in (≤ 3 Hz of change, no clicks)
    const now = ctx.currentTime;
    master.gain.setValueAtTime(0.0, now);
    master.gain.linearRampToValueAtTime(0.15, now + 2.0);
  }

  // ── sustaining pad drone (root + fifth + octave, detuned) ─────────────────
  private buildPad(): void {
    const ctx = this.ctx!;
    const bus = ctx.createGain();
    bus.gain.value = 0.32;

    const filt = ctx.createBiquadFilter();
    filt.type = "lowpass";
    filt.frequency.value = 520;
    filt.Q.value = 0.7;
    filt.connect(bus);
    bus.connect(this.master!);

    // slow filter LFO — a breathing brightness (≪ 3 Hz)
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.05;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 180;
    lfo.connect(lfoGain);
    lfoGain.connect(filt.frequency);
    lfo.start();

    const ratios = [1, 3 / 2, 2];
    for (const r of ratios) {
      const base = ROOT * r;
      for (const det of [-3, 3]) {
        const o = ctx.createOscillator();
        o.type = "sine";
        o.frequency.value = base;
        o.detune.value = det;
        const g = ctx.createGain();
        g.gain.value = r === 1 ? 0.5 : 0.3;
        o.connect(g);
        g.connect(filt);
        o.start();
        this.padNodes.push(o, g);
      }
    }
    this.padNodes.push(bus, filt, lfo, lfoGain);
  }

  // ── quiet band-passed noise wash (the "syntactic hiss") ───────────────────
  private buildWash(): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 900;
    bp.Q.value = 0.8;
    const g = ctx.createGain();
    g.gain.value = 0.02;
    src.connect(bp);
    bp.connect(g);
    g.connect(this.master!);

    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lg = ctx.createGain();
    lg.gain.value = 400;
    lfo.connect(lg);
    lg.connect(bp.frequency);
    lfo.start();
    src.start();
    this.padNodes.push(src, bp, g, lfo, lg);
  }

  // ── polyphony management ──────────────────────────────────────────────────
  private cull(): void {
    const now = this.ctx!.currentTime;
    this.voices = this.voices.filter((v) => v.endsAt > now);
    while (this.voices.length > 12) {
      const v = this.voices.shift()!;
      v.stop(now);
    }
  }

  /** Map a vertical fraction (0 top … 1 bottom) to a JI frequency. */
  freqFromFrac(frac: number): number {
    const n = JI.length * OCTAVES;
    const idx = Math.min(n - 1, Math.max(0, Math.floor((1 - frac) * n)));
    const oct = Math.floor(idx / JI.length);
    const deg = idx % JI.length;
    return ROOT * JI[deg] * Math.pow(2, oct);
  }

  // ── FM mallet / bell — rung by a word crossing an aperture ────────────────
  mallet(freq: number, vel = 1): void {
    if (!this.started || !this.ctx) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    if (now - this.lastMallet < 0.035) return; // rate limit swarms
    this.lastMallet = now;
    this.cull();

    const carrier = ctx.createOscillator();
    carrier.type = "sine";
    carrier.frequency.value = freq;

    const mod = ctx.createOscillator();
    mod.type = "sine";
    mod.frequency.value = freq * 2.01; // inharmonic-ish partial → bell
    const modGain = ctx.createGain();
    modGain.gain.setValueAtTime(freq * 1.6 * vel, now);
    modGain.gain.exponentialRampToValueAtTime(freq * 0.02, now + 0.5);
    mod.connect(modGain);
    modGain.connect(carrier.frequency);

    const amp = ctx.createGain();
    const peak = 0.22 * vel;
    amp.gain.setValueAtTime(0.0001, now);
    amp.gain.exponentialRampToValueAtTime(peak, now + 0.006);
    amp.gain.exponentialRampToValueAtTime(0.0006, now + 0.9);

    carrier.connect(amp);
    amp.connect(this.master!);
    carrier.start(now);
    mod.start(now);
    const endsAt = now + 1.0;
    carrier.stop(endsAt);
    mod.stop(endsAt);

    this.voices.push({
      gain: amp,
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

  /** Tiny click per keystroke. */
  tick(): void {
    if (!this.started || !this.ctx || !this.noiseBuf) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 2600;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.06, now);
    g.gain.exponentialRampToValueAtTime(0.0005, now + 0.045);
    src.connect(hp);
    hp.connect(g);
    g.connect(this.master!);
    src.start(now);
    src.stop(now + 0.06);
  }

  /** JI chord ignited on tap. `frac` sets the root register. */
  chord(frac: number): void {
    if (!this.started) return;
    const root = this.freqFromFrac(frac);
    const voicing = [1, 5 / 4, 3 / 2, 2];
    voicing.forEach((r, i) => {
      this.mallet(root * r, 0.7 - i * 0.08);
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
      await new Promise((res) => setTimeout(res, 320));
      await ctx.close();
    } catch {
      /* ignore */
    } finally {
      this.ctx = null;
      this.master = null;
      this.comp = null;
      this.padNodes = [];
      this.started = false;
    }
  }
}
