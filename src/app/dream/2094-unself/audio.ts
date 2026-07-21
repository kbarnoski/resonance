/**
 * The audio journey for 2094 · Unself.
 *
 * Drones only — no struck, plucked, or percussive events anywhere, and no
 * pitched lattice (not pentatonic, not a just-intonation stack, never the
 * Chladni set). Two sustained tone CLUSTERS built on an irregular, deliberately
 * non-harmonic ratio set, so the harmony beats and blurs rather than resolves.
 *
 *   • PRESENT "you"  — a warm, lightly stereo cluster. Loud when embodied.
 *   • GHOST "you"    — the same cluster, detuned ~-30 cents, lowpassed toward
 *                      cotton-wool, mono-collapsed and DELAYED (0.4 → 3 s) — the
 *                      sonic twin of the visual doppelgänger. Crossfades in as D
 *                      rises and its delay grows behind you.
 *
 * The research payload made audible:
 *   • DESYNC — a motion shimmer driven by the arc's LAGGED motion value, so the
 *     sonic response to your movement comes apart from what you see (up to
 *     ~600 ms behind at the peak).
 *   • TIME DILATION — every setTargetAtTime glide time is stretched by 1/timeScale,
 *     so the whole mix slows as D rises and snaps back on RETURN.
 *   • A convolution-reverb VOID (seeded synthetic IR) opening toward the
 *     dissolution peak, with a lowpass that opens at the light moment.
 *
 * Master ~0.14 → DynamicsCompressor → destination; resumed from the Begin
 * gesture; full teardown on dispose. No Math.random / Date.now — the IR is a
 * seeded PRNG.
 */

import { mulberry32 } from "./arc";

const MASTER_TARGET = 0.14;
const F0 = 55;
// Irregular, non-harmonic-series cluster ratios: close beats + wide spacings.
const RATIOS = [1, 1.06, 1.19, 1.78, 2.02, 2.67];
const GHOST_DETUNE = Math.pow(2, -30 / 1200); // ~-30 cents

function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}

interface Voice {
  osc: OscillatorNode;
  gain: GainNode;
  lfo: OscillatorNode;
  lfoGain: GainNode;
  base: number;
}

/** A short seeded impulse response — a decaying diffuse "void". */
function makeImpulse(ctx: AudioContext, seconds: number): AudioBuffer {
  const rate = ctx.sampleRate;
  const len = Math.max(1, Math.floor(rate * seconds));
  const buf = ctx.createBuffer(2, len, rate);
  const rng = mulberry32(0x2094_1e2a);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      const env = Math.pow(1 - i / len, 2.6);
      data[i] = (rng() * 2 - 1) * env;
    }
  }
  return buf;
}

export class UnselfAudio {
  readonly ctx: AudioContext;
  private master: GainNode;
  private comp: DynamicsCompressorNode;

  private presentBus: GainNode;
  private presentPan: StereoPannerNode;
  private presentLp: BiquadFilterNode;

  private ghostBus: GainNode;
  private ghostIn: GainNode;
  private ghostLp: BiquadFilterNode;
  private ghostDelay: DelayNode;

  private reverbSend: GainNode;
  private reverbLp: BiquadFilterNode;
  private convolver: ConvolverNode;
  private reverbWet: GainNode;

  private present: Voice[] = [];
  private ghost: Voice[] = [];
  private disposed = false;

  constructor() {
    const Ctor: typeof AudioContext =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new Ctor();
    const ctx = this.ctx;

    this.master = ctx.createGain();
    this.master.gain.value = 0;

    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -20;
    this.comp.knee.value = 14;
    this.comp.ratio.value = 4;
    this.comp.attack.value = 0.03;
    this.comp.release.value = 0.5;
    this.comp.connect(this.master);
    this.master.connect(ctx.destination);

    // ── PRESENT bus — warm, lightly stereo.
    this.presentLp = ctx.createBiquadFilter();
    this.presentLp.type = "lowpass";
    this.presentLp.frequency.value = 1500;
    this.presentLp.Q.value = 0.5;
    this.presentPan = ctx.createStereoPanner();
    this.presentPan.pan.value = 0;
    this.presentBus = ctx.createGain();
    this.presentBus.gain.value = 1;
    this.presentBus.connect(this.presentLp);
    this.presentLp.connect(this.presentPan);
    this.presentPan.connect(this.comp);

    // ── GHOST bus — cotton-wool lowpass, mono, delayed one step removed.
    this.ghostIn = ctx.createGain();
    this.ghostIn.gain.value = 1;
    this.ghostLp = ctx.createBiquadFilter();
    this.ghostLp.type = "lowpass";
    this.ghostLp.frequency.value = 650;
    this.ghostLp.Q.value = 0.6;
    this.ghostDelay = ctx.createDelay(4);
    this.ghostDelay.delayTime.value = 0.4;
    this.ghostBus = ctx.createGain();
    this.ghostBus.gain.value = 0.0001;
    this.ghostIn.connect(this.ghostLp);
    this.ghostLp.connect(this.ghostDelay);
    this.ghostDelay.connect(this.ghostBus);
    this.ghostBus.connect(this.comp);

    // ── Reverb VOID — send from both selves, opens toward the peak.
    this.reverbSend = ctx.createGain();
    this.reverbSend.gain.value = 0.12;
    this.reverbLp = ctx.createBiquadFilter();
    this.reverbLp.type = "lowpass";
    this.reverbLp.frequency.value = 500;
    this.convolver = ctx.createConvolver();
    this.convolver.buffer = makeImpulse(ctx, 4.5);
    this.reverbWet = ctx.createGain();
    this.reverbWet.gain.value = 0.12;
    this.reverbSend.connect(this.reverbLp);
    this.reverbLp.connect(this.convolver);
    this.convolver.connect(this.reverbWet);
    this.reverbWet.connect(this.comp);
    // Both selves feed the void.
    this.presentPan.connect(this.reverbSend);
    this.ghostBus.connect(this.reverbSend);

    // ── Voices.
    this.present = RATIOS.map((r, i) => this.buildVoice(F0 * r, i, this.presentBus, false));
    this.ghost = RATIOS.map((r, i) =>
      this.buildVoice(F0 * r * GHOST_DETUNE, i, this.ghostIn, true),
    );
  }

  private buildVoice(freq: number, i: number, dest: AudioNode, ghostly: boolean): Voice {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = i % 3 === 0 ? "triangle" : "sine";
    osc.frequency.value = freq;
    osc.detune.value = (((i * 37) % 11) - 5) * (ghostly ? 1.4 : 0.7); // living beats

    const gain = ctx.createGain();
    gain.gain.value = 0;

    const lfo = ctx.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = 0.024 + i * 0.011;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0;
    lfo.connect(lfoGain);
    lfoGain.connect(gain.gain);

    osc.connect(gain);
    gain.connect(dest);

    const base = (ghostly ? 0.05 : 0.06) / (1 + i * 0.35);
    return { osc, gain, lfo, lfoGain, base };
  }

  async start(): Promise<void> {
    if (this.ctx.state === "suspended") await this.ctx.resume();
    const now = this.ctx.currentTime;
    for (const v of [...this.present, ...this.ghost]) {
      v.osc.start(now);
      v.lfo.start(now);
      v.gain.gain.setTargetAtTime(v.base * 0.6, now, 4);
      v.lfoGain.gain.setTargetAtTime(v.base * 0.5, now, 4);
    }
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(0, now);
    this.master.gain.linearRampToValueAtTime(MASTER_TARGET, now + 3);
  }

  /** Follow the arc. Everything glides; glide times stretch as time dilates. */
  update(s: {
    D: number;
    ghostNorm: number;
    ghostDelaySec: number;
    delayedMotion: number;
    dissolve: number;
    centerGlow: number;
    timeScale: number;
  }): void {
    if (this.disposed) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const tau = 0.5 / Math.max(0.3, s.timeScale); // TIME DILATION stretches glides

    // Equal-power crossfade present → ghost as dissociation deepens.
    const g = clamp(0.5 * s.D + 0.5 * s.ghostNorm, 0, 1);
    const pres = Math.cos((g * Math.PI) / 2);
    const gho = Math.sin((g * Math.PI) / 2);
    this.presentBus.gain.setTargetAtTime(pres, now, tau);
    this.ghostBus.gain.setTargetAtTime(gho, now, tau);

    // DESYNC: the motion shimmer follows the LAGGED motion value, so the sonic
    // response to your movement comes apart from what you see.
    const shimmer = clamp(s.delayedMotion, 0, 1);
    this.presentLp.frequency.setTargetAtTime(1200 + shimmer * 900, now, tau);
    this.presentPan.pan.setTargetAtTime((shimmer * 2 - 1) * 0.35 * (1 - s.D), now, tau);

    // The ghost drifts further behind and further underwater as it peels off.
    this.ghostDelay.delayTime.setTargetAtTime(s.ghostDelaySec, now, tau * 2);
    this.ghostLp.frequency.setTargetAtTime(650 - s.D * 250, now, tau);

    // The void opens toward the dissolution peak; its lowpass opens at the light.
    this.reverbWet.gain.setTargetAtTime(0.12 + s.dissolve * 0.7, now, tau);
    this.reverbSend.gain.setTargetAtTime(0.12 + s.D * 0.35, now, tau);
    this.reverbLp.frequency.setTargetAtTime(500 + s.centerGlow * 3600, now, tau);
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    const now = this.ctx.currentTime;
    try {
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setValueAtTime(this.master.gain.value, now);
      this.master.gain.linearRampToValueAtTime(0, now + 0.6);
    } catch {
      /* ctx closing */
    }
    const stopAt = now + 0.7;
    for (const v of [...this.present, ...this.ghost]) {
      try {
        v.osc.stop(stopAt);
        v.lfo.stop(stopAt);
      } catch {
        /* already stopped */
      }
    }
    window.setTimeout(() => {
      void this.ctx.close();
    }, 900);
  }
}
