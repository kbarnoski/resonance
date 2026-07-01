// ─────────────────────────────────────────────────────────────────────────────
// audio.ts — the voice of the lightning organ.
//
//   Every branch site rings a short FM pluck whose pitch ∝ height, so a downward-
//   forking strike sweeps a descending pentatonic arpeggio. A band-passed noise
//   crackle rides each pluck. Branch density drives the shared droneBank level; a
//   bridging connection fires a sub-boom + shimmer. Everything is routed through a
//   DynamicsCompressor into the shared convolution void, then to destination.
//
//   Polyphony is capped with a self-cleaning voice pool (voice-stealing) so a
//   dense storm never leaks nodes. Audio only starts after a user gesture.
//
//   Shared engines composed (do not reimplement):
//     startDroneBank  — src/app/dream/_shared/psych/droneBank.ts
//     createVoidReverb — src/app/dream/_shared/psych/convolutionVoid.ts
// ─────────────────────────────────────────────────────────────────────────────

import { startDroneBank, type DroneBank } from "../_shared/psych/droneBank";
import { createVoidReverb, type VoidReverb } from "../_shared/psych/convolutionVoid";

// A pentatonic (minor) scale over a wide range, in just-ish ratios of a root.
// Height 0 (top) = highest note, height 1 (bottom) = lowest — a descending sweep.
const ROOT_HZ = 55; // A1
const PENTA_RATIOS = [1, 6 / 5, 4 / 3, 3 / 2, 9 / 5]; // minor pentatonic
// build several octaves of notes ascending
function buildScale(): number[] {
  const out: number[] = [];
  for (let oct = 0; oct < 5; oct++) {
    for (const r of PENTA_RATIOS) {
      out.push(ROOT_HZ * r * Math.pow(2, oct));
    }
  }
  return out.filter((f) => f < 4000);
}
const SCALE = buildScale();

const MAX_VOICES = 14;

interface Voice {
  active: boolean;
  endsAt: number;
  carrier: OscillatorNode | null;
  mod: OscillatorNode | null;
  gain: GainNode | null;
  noise: AudioBufferSourceNode | null;
}

export class LightningAudio {
  private ctx: AudioContext;
  private master: GainNode;
  private comp: DynamicsCompressorNode;
  private drone: DroneBank;
  private verb: VoidReverb;
  private pluckBus: GainNode;
  private noiseBuffer: AudioBuffer;

  private voices: Voice[] = [];
  private lastPluckAt = 0;
  private densityEMA = 0;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;

    this.master = ctx.createGain();
    this.master.gain.value = 0.9;

    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -14;
    this.comp.knee.value = 26;
    this.comp.ratio.value = 5;
    this.comp.attack.value = 0.004;
    this.comp.release.value = 0.18;

    this.verb = createVoidReverb(ctx, { seconds: 4.5, decay: 2.6, wet: 0.42 });

    // pluck/crackle bus -> compressor -> void -> master -> destination
    this.pluckBus = ctx.createGain();
    this.pluckBus.gain.value = 0.9;
    this.pluckBus.connect(this.comp);
    this.comp.connect(this.verb.input);
    this.verb.output.connect(this.master);
    this.master.connect(ctx.destination);

    // drone bed also into the void tail for cohesion
    this.drone = startDroneBank(ctx, this.verb.input, {
      root: 55,
      peakGain: 0.18,
      cutoffLow: 140,
      cutoffHigh: 1600,
    });
    this.drone.setDrive(0.1);

    // one shared white-noise buffer for crackle
    const len = Math.floor(ctx.sampleRate * 0.5);
    this.noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const nd = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < len; i++) nd[i] = Math.random() * 2 - 1;

    for (let i = 0; i < MAX_VOICES; i++) {
      this.voices.push({
        active: false,
        endsAt: 0,
        carrier: null,
        mod: null,
        gain: null,
        noise: null,
      });
    }
  }

  private nearestNote(freqTarget: number): number {
    // pick the scale note closest to the target frequency
    let best = SCALE[0];
    let bestD = Infinity;
    for (const f of SCALE) {
      const d = Math.abs(Math.log2(f / freqTarget));
      if (d < bestD) {
        bestD = d;
        best = f;
      }
    }
    return best;
  }

  private takeVoice(now: number): Voice {
    for (const v of this.voices) {
      if (!v.active || v.endsAt <= now) {
        this.stopVoice(v);
        return v;
      }
    }
    // steal the oldest-ending voice
    let oldest = this.voices[0];
    for (const v of this.voices) if (v.endsAt < oldest.endsAt) oldest = v;
    this.stopVoice(oldest);
    return oldest;
  }

  private stopVoice(v: Voice): void {
    const now = this.ctx.currentTime;
    try {
      if (v.gain) {
        v.gain.gain.cancelScheduledValues(now);
        v.gain.gain.setTargetAtTime(0, now, 0.01);
      }
      if (v.carrier) v.carrier.stop(now + 0.05);
      if (v.mod) v.mod.stop(now + 0.05);
      if (v.noise) v.noise.stop(now + 0.05);
    } catch {
      /* already stopped */
    }
    v.active = false;
    v.carrier = null;
    v.mod = null;
    v.gain = null;
    v.noise = null;
  }

  /**
   * Ring a branch note. heightNorm 0 (top) .. 1 (bottom); heat scales level/tone.
   * Rate-limited internally so a burst of branches doesn't machine-gun.
   */
  pluck(heightNorm: number, heat: number): void {
    const ctx = this.ctx;
    const now = ctx.currentTime;
    // throttle: at most ~one pluck per 18ms
    if (now - this.lastPluckAt < 0.018) return;
    this.lastPluckAt = now;

    // top (0) -> high note, bottom (1) -> low note
    const targetHz =
      120 * Math.pow(2, (1 - heightNorm) * 4.2) * (0.9 + heat * 0.2);
    const freq = this.nearestNote(targetHz);

    const v = this.takeVoice(now);
    const dur = 0.28 + heat * 0.25;

    // FM pluck: modulator -> modGain -> carrier.frequency
    const carrier = ctx.createOscillator();
    carrier.type = "sine";
    carrier.frequency.value = freq;
    const mod = ctx.createOscillator();
    mod.type = "sine";
    mod.frequency.value = freq * 2.01; // slightly inharmonic
    const modGain = ctx.createGain();
    modGain.gain.value = freq * (1.2 + heat * 2.0);
    modGain.gain.setTargetAtTime(freq * 0.2, now, 0.08);
    mod.connect(modGain);
    modGain.connect(carrier.frequency);

    const g = ctx.createGain();
    const peak = 0.12 + heat * 0.16;
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(peak, now + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    carrier.connect(g);
    g.connect(this.pluckBus);

    // band-passed noise crackle
    const noise = ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 1800 + heat * 3200;
    bp.Q.value = 3 + heat * 4;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.0001, now);
    ng.gain.exponentialRampToValueAtTime(0.06 + heat * 0.05, now + 0.003);
    ng.gain.exponentialRampToValueAtTime(0.0001, now + 0.06 + heat * 0.05);
    noise.connect(bp);
    bp.connect(ng);
    ng.connect(this.pluckBus);

    carrier.start(now);
    mod.start(now);
    noise.start(now);
    const endsAt = now + dur + 0.05;
    carrier.stop(endsAt);
    mod.stop(endsAt);
    noise.stop(now + 0.2);

    v.active = true;
    v.endsAt = endsAt;
    v.carrier = carrier;
    v.mod = mod;
    v.gain = g;
    v.noise = noise;
  }

  /** A bridging strike — low sub-boom + high shimmer. */
  strike(): void {
    const ctx = this.ctx;
    const now = ctx.currentTime;

    // sub boom
    const sub = ctx.createOscillator();
    sub.type = "sine";
    sub.frequency.setValueAtTime(90, now);
    sub.frequency.exponentialRampToValueAtTime(38, now + 0.5);
    const sg = ctx.createGain();
    sg.gain.setValueAtTime(0.0001, now);
    sg.gain.exponentialRampToValueAtTime(0.5, now + 0.01);
    sg.gain.exponentialRampToValueAtTime(0.0001, now + 0.9);
    sub.connect(sg);
    sg.connect(this.comp);
    sub.start(now);
    sub.stop(now + 1.0);

    // shimmer — a burst of bright noise through a high bandpass
    const noise = ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 4000;
    const shg = ctx.createGain();
    shg.gain.setValueAtTime(0.0001, now);
    shg.gain.exponentialRampToValueAtTime(0.16, now + 0.004);
    shg.gain.exponentialRampToValueAtTime(0.0001, now + 0.4);
    noise.connect(hp);
    hp.connect(shg);
    shg.connect(this.verb.input);
    noise.start(now);
    noise.stop(now + 0.5);

    // momentary drone swell
    this.drone.setDrive(Math.min(1, this.densityEMA * 0.6 + 0.55));
  }

  /** Called each frame with the number of branches emitted this frame. */
  setDensity(branchesThisFrame: number, voltage: number): void {
    // exponential moving average of activity
    this.densityEMA = this.densityEMA * 0.92 + branchesThisFrame * 0.08;
    const drive = Math.min(1, 0.08 + this.densityEMA * 0.14 + voltage * 0.25);
    this.drone.setDrive(drive);
  }

  dispose(): void {
    for (const v of this.voices) this.stopVoice(v);
    try {
      this.drone.stop();
    } catch {
      /* noop */
    }
    try {
      const now = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setTargetAtTime(0, now, 0.05);
    } catch {
      /* noop */
    }
  }
}
