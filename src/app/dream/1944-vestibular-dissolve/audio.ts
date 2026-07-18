/**
 * Spatial dissolution drone for 1944 · Vestibular Dissolve.
 *
 * The sound IS the gravity vector. Two layers over a low fundamental (~55 Hz):
 *
 *   • ANCHOR — a low body-tone (fundamental + its just fifth) panned centre.
 *     Loud and grounding when "down" is settled; it THINS as orientation is
 *     lost and returns as you settle level. This is your body in the sound.
 *
 *   • SHIMMER — a bank of high spectral / just-intonation partials (NON-
 *     pentatonic: 3, 4, 5, 6, 7, 9, 11 × f0, lightly detuned). As "down"
 *     dissolves the spectral tilt lifts (higher partials bloom) AND the
 *     partials SPREAD across the stereo field — the weightless, boundless
 *     drift of the K-hole / NDE loss of the body.
 *
 * A master StereoPanner follows the gravity vector's left-right component.
 * Everything glides via setTargetAtTime — no clicks, no strobes in sound.
 * Signal: voices → bus → compressor → master (≤0.16, ramped from a gesture).
 */

const F0 = 55;
// High just-intonation / spectral partials (non-pentatonic).
const PARTIALS = [3, 4, 5, 6, 7, 9, 11];
const MASTER_TARGET = 0.16;

interface Shimmer {
  osc: OscillatorNode;
  gain: GainNode;
  panner: StereoPannerNode;
  lfo: OscillatorNode;
  lfoGain: GainNode;
  base: number; // resting level
  spread: number; // -1..1 stereo bias when dissolved
  tilt: number; // 0..1 how much this partial responds to dissolve
}

function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}

export class DissolveAudio {
  readonly ctx: AudioContext;
  private master: GainNode;
  private comp: DynamicsCompressorNode;
  private bus: GainNode;
  private masterPan: StereoPannerNode;

  private anchorGain: GainNode;
  private anchorOscs: OscillatorNode[] = [];
  private shimmers: Shimmer[] = [];
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
    this.comp.attack.value = 0.02;
    this.comp.release.value = 0.4;

    this.masterPan = ctx.createStereoPanner();
    this.masterPan.pan.value = 0;

    this.bus = ctx.createGain();
    this.bus.gain.value = 1;

    this.bus.connect(this.comp);
    this.comp.connect(this.masterPan);
    this.masterPan.connect(this.master);
    this.master.connect(ctx.destination);

    // ── Anchor: fundamental + just fifth, centre-panned.
    this.anchorGain = ctx.createGain();
    this.anchorGain.gain.value = 0.0;
    this.anchorGain.connect(this.bus);
    for (const ratio of [1, 1.5]) {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = F0 * ratio;
      osc.detune.value = (ratio - 1.25) * 5;
      const g = ctx.createGain();
      g.gain.value = ratio === 1 ? 1 : 0.5;
      osc.connect(g);
      g.connect(this.anchorGain);
      this.anchorOscs.push(osc);
    }

    // ── Shimmer: high partials, each with its own panner + slow amplitude LFO.
    PARTIALS.forEach((ratio, i) => {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = F0 * ratio;
      // Small fixed detune per partial → living beats (deterministic, index-based).
      osc.detune.value = (((i * 37) % 11) - 5) * 0.9;

      const gain = ctx.createGain();
      gain.gain.value = 0;

      const panner = ctx.createStereoPanner();
      panner.pan.value = 0;

      // Slow amplitude shimmer.
      const lfo = ctx.createOscillator();
      lfo.type = "sine";
      lfo.frequency.value = 0.05 + i * 0.017;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 0;
      lfo.connect(lfoGain);
      lfoGain.connect(gain.gain);

      osc.connect(gain);
      gain.connect(panner);
      panner.connect(this.bus);

      const base = 0.05 / (1 + i * 0.35); // higher partials quieter at rest
      const spread = i % 2 === 0 ? 1 : -1; // alternate L/R when dissolved
      const tilt = 0.2 + (i / (PARTIALS.length - 1)) * 0.8; // highs respond most

      this.shimmers.push({ osc, gain, panner, lfo, lfoGain, base, spread, tilt });
    });
  }

  /** Resume + ramp up from a user gesture, and start every oscillator. */
  async start(): Promise<void> {
    if (this.ctx.state === "suspended") await this.ctx.resume();
    const now = this.ctx.currentTime;
    for (const o of this.anchorOscs) o.start(now);
    for (const s of this.shimmers) {
      s.osc.start(now);
      s.lfo.start(now);
    }
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(0, now);
    this.master.gain.linearRampToValueAtTime(MASTER_TARGET, now + 2.0);
  }

  /** Follow the gravity vector. Everything glides. */
  update(dissolve: number, gx: number): void {
    if (this.disposed) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const d = clamp(dissolve, 0, 1);
    const tau = 0.35; // glide time-constant

    // Anchor thins as "down" is lost, returns as you settle level.
    const anchorLevel = 0.55 * (1 - d * 0.85);
    this.anchorGain.gain.setTargetAtTime(anchorLevel, now, tau);

    // Master pan follows left-right gravity.
    this.masterPan.pan.setTargetAtTime(clamp(gx * 0.85, -1, 1), now, tau);

    for (const s of this.shimmers) {
      // Spectral tilt: partials bloom with dissolve, highs most of all.
      const level = s.base * (0.08 + d * s.tilt);
      s.gain.gain.setTargetAtTime(level, now, tau);
      s.lfoGain.gain.setTargetAtTime(level * 0.4, now, tau);
      // Stereo spread grows with dissolve, biased by device left-right.
      const pan = clamp(gx * 0.35 + s.spread * d * 0.75, -1, 1);
      s.panner.pan.setTargetAtTime(pan, now, tau);
    }
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    const now = this.ctx.currentTime;
    try {
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setValueAtTime(this.master.gain.value, now);
      this.master.gain.linearRampToValueAtTime(0, now + 0.5);
    } catch {
      /* noop */
    }
    const stopAt = now + 0.6;
    const stop = (o: OscillatorNode) => {
      try {
        o.stop(stopAt);
      } catch {
        /* already stopped */
      }
    };
    this.anchorOscs.forEach(stop);
    this.shimmers.forEach((s) => {
      stop(s.osc);
      stop(s.lfo);
    });
    window.setTimeout(() => {
      void this.ctx.close();
    }, 800);
  }
}
