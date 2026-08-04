// audio.ts — physical-modeling drum voice (no React, no DOM).
//
// The membrane on screen is a real 2-D wave simulation (waveGPU.ts). The AUDIO
// is tapped from the *same physics*: a strike at grid position (nx, ny) rings a
// bank of modal resonators tuned to the modal ratios of an ideal circular
// membrane — the ratios of the zeros of the Bessel functions J_m, exactly the
// inharmonic voice of a real drumhead. This is the practical, reliable side of
// Julius O. Smith III's digital-waveguide-mesh idea: rather than sampling the
// 2-D mesh at audio rate (infeasible in JS), we drive resonators tuned to the
// mesh's modal frequencies and let *where* and *how hard* you strike shape the
// modal mix — center strikes boom the low modes, rim strikes ring the highs,
// exactly as the physical membrane does.
//
// Position also selects pitch: the drumhead is voiced like a tuned tongue /
// hang drum — angle around the head walks a scale, radius sets the register —
// so drumming around the skin plays a melody. Each strike is a short additive
// voice (sine partials at the Bessel ratios, per-mode exponential decay).
//
// Safety: master gain <= 0.18, a DynamicsCompressor limiter on the bus, and a
// hard cap on simultaneous voices. See README.md.

// Modal ratios of a circular membrane (drumhead): ratios of the Bessel zeros to
// the (0,1) fundamental. Inharmonic — the signature drum timbre.
const MODAL_RATIOS = [1.0, 1.593, 2.136, 2.296, 2.653, 2.918, 3.156, 3.501];

export interface Tuning {
  id: string;
  label: string;
  base: number; // fundamental (Hz) at the rim's lowest note
  scale: number[]; // frequency multipliers over `base` (one octave)
  octaves: number; // how many octaves center->rim spans
  bodyHz: number; // soft sub-body drone frequency
}

export const TUNINGS: Tuning[] = [
  {
    id: "ashiko",
    label: "Ashiko",
    base: 98, // G2
    scale: [1, 6 / 5, 4 / 3, 3 / 2, 9 / 5], // minor pentatonic
    octaves: 2,
    bodyHz: 49,
  },
  {
    id: "hang",
    label: "Hang",
    base: 146.83, // D3
    scale: [1, 9 / 8, 5 / 4, 3 / 2, 5 / 3], // major pentatonic
    octaves: 2,
    bodyHz: 73.4,
  },
  {
    id: "tabla",
    label: "Tabla",
    base: 130.81, // C3
    scale: [1, 9 / 8, 6 / 5, 3 / 2, 27 / 16], // Kafi-ish
    octaves: 1,
    bodyHz: 65.4,
  },
];

const MAX_VOICES = 14;

export class ModalDrum {
  private ctx: AudioContext;
  private master: GainNode;
  private limiter: DynamicsCompressorNode;
  private wet: GainNode; // reverb send return
  private delay: DelayNode;
  private feedback: GainNode;
  private body: OscillatorNode | null = null;
  private bodyGain: GainNode;
  private tuning: Tuning;
  private voices = 0;
  private stopped = false;
  private startedAt = 0;

  constructor(ctx: AudioContext, tuning: Tuning) {
    this.ctx = ctx;
    this.tuning = tuning;

    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -8;
    this.limiter.knee.value = 8;
    this.limiter.ratio.value = 16;
    this.limiter.attack.value = 0.003;
    this.limiter.release.value = 0.2;

    this.master = ctx.createGain();
    this.master.gain.value = 0.0; // faded in on start()

    // Short feedback-delay reverb for room / body.
    this.delay = ctx.createDelay(0.5);
    this.delay.delayTime.value = 0.14;
    this.feedback = ctx.createGain();
    this.feedback.gain.value = 0.38;
    this.wet = ctx.createGain();
    this.wet.gain.value = 0.28;

    this.master.connect(this.limiter);
    this.limiter.connect(ctx.destination);
    // wet loop
    this.master.connect(this.delay);
    this.delay.connect(this.feedback);
    this.feedback.connect(this.delay);
    this.delay.connect(this.wet);
    this.wet.connect(this.limiter);

    // Soft sub-body drone — the shell resonance under the skin.
    this.bodyGain = ctx.createGain();
    this.bodyGain.gain.value = 0.0;
    this.bodyGain.connect(this.master);
  }

  start(): void {
    if (this.startedAt) return;
    const now = this.ctx.currentTime;
    this.startedAt = now;
    // Master fades up gently — an awakening, not a click. <= 0.18 ceiling.
    this.master.gain.setValueAtTime(0.0, now);
    this.master.gain.linearRampToValueAtTime(0.16, now + 1.2);

    const body = this.ctx.createOscillator();
    body.type = "sine";
    body.frequency.value = this.tuning.bodyHz;
    body.connect(this.bodyGain);
    body.start(now);
    this.bodyGain.gain.setValueAtTime(0.0, now);
    this.bodyGain.gain.linearRampToValueAtTime(0.02, now + 2.0);
    this.body = body;
  }

  setTuning(t: Tuning): void {
    this.tuning = t;
    if (this.body) {
      this.body.frequency.setTargetAtTime(t.bodyHz, this.ctx.currentTime, 0.1);
    }
  }

  /** Map a normalized strike (nx, ny in [-1,1], centre = 0) to a pitch. */
  private pitchFor(nx: number, ny: number): number {
    const t = this.tuning;
    const r = Math.min(1, Math.hypot(nx, ny));
    let ang = Math.atan2(ny, nx) / (Math.PI * 2) + 0.5; // 0..1
    ang = ang - Math.floor(ang);
    const step = Math.min(t.scale.length - 1, Math.floor(ang * t.scale.length));
    const oct = Math.floor(r * t.octaves); // centre low, rim high
    return t.base * Math.pow(2, oct) * t.scale[step];
  }

  /** Feed continuous field energy into a faint shimmer of the body drone. */
  setEnergy(energy: number): void {
    if (this.stopped) return;
    const e = Math.min(1, Math.max(0, energy));
    const g = 0.014 + e * 0.03;
    this.bodyGain.gain.setTargetAtTime(g, this.ctx.currentTime, 0.12);
  }

  /**
   * Strike the head. `nx,ny` normalized [-1,1]; `strength` 0..1.
   * Radius shapes the modal mix (centre -> low modes boom, rim -> highs ring).
   */
  strike(nx: number, ny: number, strength: number): void {
    if (this.stopped) return;
    if (this.voices >= MAX_VOICES) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const s = Math.min(1, Math.max(0, strength));
    if (s < 0.02) return;

    const fund = this.pitchFor(nx, ny);
    const r = Math.min(1, Math.hypot(nx, ny));

    const voiceBus = ctx.createGain();
    voiceBus.gain.value = 1.0;
    voiceBus.connect(this.master);

    this.voices++;
    let alive = MODAL_RATIOS.length;
    const done = () => {
      alive--;
      if (alive <= 0) {
        try {
          voiceBus.disconnect();
        } catch {
          /* gone */
        }
        this.voices = Math.max(0, this.voices - 1);
      }
    };

    for (let i = 0; i < MODAL_RATIOS.length; i++) {
      const freq = fund * MODAL_RATIOS[i];
      if (freq > 12000) {
        alive--;
        continue;
      }
      // Rim strikes lift the upper modes; centre strikes favour the low ones.
      const modeBias = i === 0 ? 1.0 : 0.4 + 0.9 * r;
      const rolloff = 1 / (1 + i * 0.9);
      const peak = s * 0.09 * rolloff * modeBias;
      if (peak < 0.0004) {
        alive--;
        continue;
      }
      // Higher modes decay faster — energy rolls off the skin quickly.
      const decay = (0.9 + 2.4 / (1 + i * 0.7)) * (0.7 + 0.6 * (1 - r));

      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = freq;
      // A touch of inharmonic detune for liveliness.
      osc.detune.value = (i % 2 === 0 ? 1 : -1) * i * 1.5;

      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0, now);
      g.gain.linearRampToValueAtTime(peak, now + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0005, now + decay);

      osc.connect(g);
      g.connect(voiceBus);
      osc.start(now);
      osc.stop(now + decay + 0.05);
      osc.onended = () => {
        try {
          osc.disconnect();
          g.disconnect();
        } catch {
          /* gone */
        }
        done();
      };
    }
    if (alive <= 0) {
      // Every partial was culled — release the voice slot immediately.
      try {
        voiceBus.disconnect();
      } catch {
        /* gone */
      }
      this.voices = Math.max(0, this.voices - 1);
    }
  }

  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    const now = this.ctx.currentTime;
    try {
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setValueAtTime(this.master.gain.value, now);
      this.master.gain.linearRampToValueAtTime(0.0, now + 0.2);
    } catch {
      /* ignore */
    }
    window.setTimeout(() => {
      try {
        this.body?.stop();
      } catch {
        /* stopped */
      }
      for (const n of [
        this.master,
        this.limiter,
        this.delay,
        this.feedback,
        this.wet,
        this.bodyGain,
      ]) {
        try {
          n.disconnect();
        } catch {
          /* ignore */
        }
      }
    }, 260);
  }
}
