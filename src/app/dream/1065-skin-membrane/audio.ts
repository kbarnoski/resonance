// audio.ts — physical modal synthesis of a circular drumhead (no React, no DOM).
//
// A bank of 8 bandpass resonators tuned to the modal ratios of an ideal
// circular membrane (ratios of the zeros of Bessel functions J_m). Membrane
// TENSION (mean spring stretch) drives the fundamental via portamento — so
// bending the skin audibly glides the pitch. That coupling, tension IS pitch,
// is the whole instrument. A quiet continuous filtered-noise excitation keeps
// the modes singing under steady tension; pokes/tears inject short noise
// bursts. A master lowpass opens with the visual brightness proxy, a small
// feedback-delay reverb gives body, and a compressor/limiter prevents clipping.
//
// Refs: physical modeling of a drumhead via its Bessel-zero modal ratios;
// see README.md.

// Modal ratios of a circular membrane (drumhead) — ratios of Bessel zeros to
// the (0,1) fundamental. Inharmonic, which is exactly the membrane character.
const MODAL_RATIOS = [1.0, 1.593, 2.136, 2.296, 2.653, 2.918, 3.156, 3.501];
// Relative gain per mode — higher modes quieter (energy rolls off).
const MODAL_GAINS = [1.0, 0.62, 0.5, 0.42, 0.34, 0.28, 0.22, 0.18];
// Resonator Q per mode — sharper at the bottom for a singing low body.
const MODAL_Q = [22, 20, 18, 17, 15, 14, 13, 12];

const FUND_MIN = 70;
const FUND_MAX = 520;

// A pentatonic-ish set of just ratios (in cents → multipliers) to gently quantize
// the fundamental so glides land on musical pitches. Documented as optional in
// the brief; it noticeably improves musicality.
const SCALE = [1, 9 / 8, 5 / 4, 3 / 2, 5 / 3, 2]; // major pentatonic + octave

function quantizeFreq(f: number): number {
  const base = FUND_MIN;
  const octaves = Math.log2(f / base);
  const octFloor = Math.floor(octaves);
  const within = octaves - octFloor; // 0..1 inside this octave
  // Find nearest scale step (in octave fraction = log2 of ratio).
  let best = SCALE[0];
  let bestErr = Infinity;
  for (const r of SCALE) {
    const frac = Math.log2(r);
    const err = Math.abs(frac - within);
    if (err < bestErr) {
      bestErr = err;
      best = r;
    }
  }
  return base * Math.pow(2, octFloor) * best;
}

export interface ModalDrivers {
  tension: number; // 0..1 → fundamental
  excitation: number; // 0..1 → continuous mode drive level
  brightness: number; // 0..1 → master lowpass cutoff
}

interface ModeNode {
  filter: BiquadFilterNode;
  gain: GainNode;
}

export class ModalEngine {
  private ctx: AudioContext;
  private modes: ModeNode[] = [];
  private master: GainNode;
  private lowpass: BiquadFilterNode;
  private limiter: DynamicsCompressorNode;
  private noiseSource: AudioBufferSourceNode;
  private noiseGain: GainNode; // continuous excitation level
  private burstBuffer: AudioBuffer;
  // Reverb (feedback delay).
  private delay: DelayNode;
  private feedback: GainNode;
  private wet: GainNode;

  private currentFund = FUND_MIN;
  private stopped = false;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;

    // ── Master chain: modes → lowpass → master gain → limiter → destination.
    this.lowpass = ctx.createBiquadFilter();
    this.lowpass.type = "lowpass";
    this.lowpass.frequency.value = 900;
    this.lowpass.Q.value = 0.7;

    this.master = ctx.createGain();
    this.master.gain.value = 0.0;

    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -6;
    this.limiter.knee.value = 6;
    this.limiter.ratio.value = 14;
    this.limiter.attack.value = 0.003;
    this.limiter.release.value = 0.18;

    // Feedback-delay reverb for body.
    this.delay = ctx.createDelay(0.5);
    this.delay.delayTime.value = 0.13;
    this.feedback = ctx.createGain();
    this.feedback.gain.value = 0.42;
    this.wet = ctx.createGain();
    this.wet.gain.value = 0.32;

    this.lowpass.connect(this.master);
    this.master.connect(this.limiter);
    // dry
    this.limiter.connect(ctx.destination);
    // wet send
    this.master.connect(this.delay);
    this.delay.connect(this.feedback);
    this.feedback.connect(this.delay); // recirculate
    this.delay.connect(this.wet);
    this.wet.connect(this.limiter);

    // ── Resonator bank: bandpass filters in parallel into the lowpass.
    for (let i = 0; i < MODAL_RATIOS.length; i++) {
      const filter = ctx.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.value = this.currentFund * MODAL_RATIOS[i];
      filter.Q.value = MODAL_Q[i];
      const gain = ctx.createGain();
      gain.gain.value = MODAL_GAINS[i] * 0.5;
      filter.connect(gain);
      gain.connect(this.lowpass);
      this.modes.push({ filter, gain });
    }

    // ── Continuous excitation: looping low-level white noise into all modes.
    const noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const nd = noiseBuf.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = (Math.random() * 2 - 1) * 0.5;
    this.noiseSource = ctx.createBufferSource();
    this.noiseSource.buffer = noiseBuf;
    this.noiseSource.loop = true;
    this.noiseGain = ctx.createGain();
    this.noiseGain.gain.value = 0.0;
    this.noiseSource.connect(this.noiseGain);
    for (const m of this.modes) this.noiseGain.connect(m.filter);

    // ── Pre-rendered short burst buffer for pluck/tear excitation.
    const burstLen = Math.floor(ctx.sampleRate * 0.06);
    this.burstBuffer = ctx.createBuffer(1, burstLen, ctx.sampleRate);
    const bd = this.burstBuffer.getChannelData(0);
    for (let i = 0; i < burstLen; i++) {
      const env = Math.pow(1 - i / burstLen, 2);
      bd[i] = (Math.random() * 2 - 1) * env;
    }
  }

  start(): void {
    const now = this.ctx.currentTime;
    this.noiseSource.start();
    // Fade master in so the awakening is gentle, not a click.
    this.master.gain.setValueAtTime(0.0, now);
    this.master.gain.linearRampToValueAtTime(0.9, now + 0.8);
    // A faint continuous breath so idle steady tone is present.
    this.noiseGain.gain.setValueAtTime(0.0, now);
    this.noiseGain.gain.linearRampToValueAtTime(0.014, now + 1.2);
  }

  // Per-frame driver update. Cheap; called every rAF.
  update(d: ModalDrivers): void {
    if (this.stopped) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    // Tension → fundamental (musical range), quantized, with portamento.
    const raw = FUND_MIN + (FUND_MAX - FUND_MIN) * Math.min(Math.max(d.tension, 0), 1);
    const target = quantizeFreq(raw);
    this.currentFund = target;
    for (let i = 0; i < this.modes.length; i++) {
      const f = target * MODAL_RATIOS[i];
      // setTargetAtTime → audible glide as the skin bends.
      this.modes[i].filter.frequency.setTargetAtTime(f, now, 0.06);
    }

    // Brightness → master lowpass opens.
    const cutoff = 500 + Math.min(Math.max(d.brightness, 0), 1) * 6500;
    this.lowpass.frequency.setTargetAtTime(cutoff, now, 0.05);

    // Excitation → continuous noise drive level (steady tension stays audible).
    const drive = 0.012 + Math.min(Math.max(d.excitation, 0), 1) * 0.05;
    this.noiseGain.gain.setTargetAtTime(drive, now, 0.08);
  }

  // Inject a short noise burst (a pluck or a tear snap). `strength` 0..1.
  strike(strength: number): void {
    if (this.stopped) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.burstBuffer;
    const g = ctx.createGain();
    g.gain.value = Math.min(Math.max(strength, 0), 1) * 0.9;
    src.connect(g);
    for (const m of this.modes) g.connect(m.filter);
    src.start(now);
    src.stop(now + 0.07);
    src.onended = () => {
      try {
        src.disconnect();
        g.disconnect();
      } catch {
        // already gone
      }
    };
  }

  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    const now = this.ctx.currentTime;
    try {
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setValueAtTime(this.master.gain.value, now);
      this.master.gain.linearRampToValueAtTime(0.0, now + 0.15);
    } catch {
      // ignore
    }
    // Disconnect everything shortly after the fade.
    window.setTimeout(() => {
      try {
        this.noiseSource.stop();
      } catch {
        // already stopped
      }
      const nodes: AudioNode[] = [
        this.lowpass,
        this.master,
        this.limiter,
        this.noiseSource,
        this.noiseGain,
        this.delay,
        this.feedback,
        this.wet,
      ];
      for (const m of this.modes) {
        nodes.push(m.filter, m.gain);
      }
      for (const node of nodes) {
        try {
          node.disconnect();
        } catch {
          // ignore
        }
      }
    }, 200);
  }
}
