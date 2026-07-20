/**
 * The derealization crossfade for 2080 · Exo Vantage.
 *
 * The bed is the shared just-intonation droneBank plus a few sparse sustained
 * tones. But the piece has TWO copies of that bed:
 *
 *   • DRY — clear, present, lightly stereo. This is your body's own sound,
 *     heard from inside. Loud when you are embodied.
 *
 *   • DETACHED — a duplicate of the same material, but DETUNED (~-28 cents),
 *     LOWPASS-filtered toward "cotton wool / underwater", given a short
 *     slap-delay (one-step-removed), and STEREO-COLLAPSED to mono. This is the
 *     documented DPDR percept: everything sounds unreal, muffled, like a
 *     recording of something happening to someone else.
 *
 * As the detachment scalar rises, an equal-power crossfade moves the mix from
 * DRY toward DETACHED; settle back and it returns to clear/present. No struck
 * bells, no percussion — drones and tones only. Master ≤ 0.3, resumed from the
 * Begin gesture; full teardown on dispose.
 */

import { startDroneBank, type DroneBank } from "../_shared/psych/droneBank";

const F0 = 55; // A1
const DETUNE_CENTS = -28;
const MASTER_TARGET = 0.28;
// Sparse sustained tones (just partials, non-percussive, non-Chladni).
const TONE_PARTIALS = [3, 4, 6, 9];

function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}

interface ToneVoice {
  osc: OscillatorNode;
  gain: GainNode;
  lfo: OscillatorNode;
  lfoGain: GainNode;
  base: number;
}

export class ExoAudio {
  readonly ctx: AudioContext;
  private master: GainNode;
  private comp: DynamicsCompressorNode;

  private dryBus: GainNode;
  private dryPan: StereoPannerNode;
  private detBus: GainNode;

  // Detached processing chain input → lowpass → slap-delay → mono → detBus.
  private detInput: GainNode;
  private detLp: BiquadFilterNode;
  private detDelay: DelayNode;
  private detFeedback: GainNode;

  private droneDry: DroneBank;
  private droneDet: DroneBank;
  private dryTones: ToneVoice[] = [];
  private detTones: ToneVoice[] = [];
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
    this.comp.threshold.value = -18;
    this.comp.knee.value = 12;
    this.comp.ratio.value = 4;
    this.comp.attack.value = 0.02;
    this.comp.release.value = 0.4;

    this.comp.connect(this.master);
    this.master.connect(ctx.destination);

    // ── DRY bus: present, lightly stereo.
    this.dryBus = ctx.createGain();
    this.dryBus.gain.value = 1;
    this.dryPan = ctx.createStereoPanner();
    this.dryPan.pan.value = 0;
    this.dryBus.connect(this.dryPan);
    this.dryPan.connect(this.comp);

    // ── DETACHED bus + its "one-step-removed" processing.
    this.detBus = ctx.createGain();
    this.detBus.gain.value = 0.0001;

    this.detInput = ctx.createGain();
    this.detInput.gain.value = 1;

    this.detLp = ctx.createBiquadFilter();
    this.detLp.type = "lowpass";
    this.detLp.frequency.value = 1200;
    this.detLp.Q.value = 0.6;

    this.detDelay = ctx.createDelay(0.5);
    this.detDelay.delayTime.value = 0.13; // short slap
    this.detFeedback = ctx.createGain();
    this.detFeedback.gain.value = 0.3;

    // input → lowpass → (dry-of-delay + delayed) → mono collapse → detBus.
    // Collapse to mono: a single mono gain fanned to both channels via detBus
    // (a plain GainNode sums channels; feeding one mono source keeps it centred).
    this.detInput.connect(this.detLp);
    this.detLp.connect(this.detBus); // direct (filtered) path
    this.detLp.connect(this.detDelay);
    this.detDelay.connect(this.detFeedback);
    this.detFeedback.connect(this.detDelay); // feedback loop
    this.detDelay.connect(this.detBus); // slap path
    this.detBus.connect(this.comp);

    // ── Two copies of the bed. The detached copy is detuned at the source.
    const detFactor = Math.pow(2, DETUNE_CENTS / 1200);
    this.droneDry = startDroneBank(ctx, this.dryBus, { root: F0, peakGain: 0.2 });
    this.droneDet = startDroneBank(ctx, this.detInput, { root: F0 * detFactor, peakGain: 0.2 });

    // ── Sparse sustained tones, mirrored dry + detached (detuned).
    this.dryTones = TONE_PARTIALS.map((ratio, i) => this.buildTone(F0 * ratio, i, this.dryBus));
    this.detTones = TONE_PARTIALS.map((ratio, i) =>
      this.buildTone(F0 * ratio * detFactor, i, this.detInput),
    );
  }

  private buildTone(freq: number, i: number, dest: AudioNode): ToneVoice {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = freq;
    osc.detune.value = (((i * 31) % 9) - 4) * 0.8; // deterministic living beats

    const gain = ctx.createGain();
    gain.gain.value = 0;

    // Slow amplitude LFO → the tones swell in and out sparsely.
    const lfo = ctx.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = 0.031 + i * 0.013;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0;
    lfo.connect(lfoGain);
    lfoGain.connect(gain.gain);

    osc.connect(gain);
    gain.connect(dest);

    const base = 0.04 / (1 + i * 0.5);
    return { osc, gain, lfo, lfoGain, base };
  }

  /** Resume + ramp up from the user gesture; start every oscillator. */
  async start(): Promise<void> {
    if (this.ctx.state === "suspended") await this.ctx.resume();
    const now = this.ctx.currentTime;
    for (const t of [...this.dryTones, ...this.detTones]) {
      t.osc.start(now);
      t.lfo.start(now);
      // Bring each tone to its resting swell level.
      t.gain.gain.setTargetAtTime(t.base * 0.6, now, 3);
      t.lfoGain.gain.setTargetAtTime(t.base * 0.5, now, 3);
    }
    this.droneDry.setDrive(0.25);
    this.droneDet.setDrive(0.25);
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(0, now);
    this.master.gain.linearRampToValueAtTime(MASTER_TARGET, now + 2.2);
  }

  /** Follow the detachment scalar. Everything glides — no clicks. */
  update(detach: number, tiltX: number): void {
    if (this.disposed) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const d = clamp(detach, 0, 1);
    const tau = 0.4;

    // Equal-power crossfade: dry → detached as you leave the body.
    const dry = Math.cos((d * Math.PI) / 2);
    const det = Math.sin((d * Math.PI) / 2);
    this.dryBus.gain.setTargetAtTime(dry, now, tau);
    this.detBus.gain.setTargetAtTime(det, now, tau);

    // Dry keeps a little stereo presence; detached is already mono/centred.
    this.dryPan.pan.setTargetAtTime(clamp(tiltX * 0.6, -1, 1) * (1 - d), now, tau);

    // The detached copy sinks further underwater and one-step-removed as d rises.
    const cutoff = 1200 * Math.pow(420 / 1200, d); // 1200 → 420 Hz
    this.detLp.frequency.setTargetAtTime(cutoff, now, tau);
    this.detFeedback.gain.setTargetAtTime(0.28 + d * 0.22, now, tau);

    // The bed opens a touch with detachment.
    this.droneDry.setDrive(0.2 + d * 0.15);
    this.droneDet.setDrive(0.2 + d * 0.25);
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
      /* ctx closing */
    }
    this.droneDry.stop();
    this.droneDet.stop();
    const stopAt = now + 0.6;
    for (const t of [...this.dryTones, ...this.detTones]) {
      try {
        t.osc.stop(stopAt);
        t.lfo.stop(stopAt);
      } catch {
        /* already stopped */
      }
    }
    window.setTimeout(() => {
      void this.ctx.close();
    }, 800);
  }
}
