// ════════════════════════════════════════════════════════════════════════════
// Reflections (5576) — BINAURAL AUDIO ENGINE (from scratch, no audio libraries)
//
// Each voice-source is a small just-intoned pad (two detuned oscillators → a
// gentle low-pass), breathing on a slow LFO so the room is always ringing. The
// image-source lattice (see acoustics.ts) turns every reflection into one audio
// TAP: pad → DelayNode → air-absorption low-pass → gain → HRTF PannerNode →
// master. The panner is positioned at the image source's direction relative to
// the head, so a reflection genuinely arrives from the wall that threw it. As
// the listener walks, `update()` re-ramps every delay, gain, cutoff, and panner
// position with setTargetAtTime — the acoustics re-render around you. Everything
// sums through a DynamicsCompressor limiter with master gain <= 0.2.
// ════════════════════════════════════════════════════════════════════════════

import {
  buildWalls,
  buildImageSources,
  computeTap,
  type ImageStruct,
  type Vec2,
} from "./acoustics";

const REFLECT_COEFF = 0.72; // per-bounce wall absorption
const PANNER_RADIUS = 1.6; // fixed HRTF radius (metres); our gain owns distance
const RAMP_TC = 0.06; // setTargetAtTime time-constant (s)

export interface SourceSpec {
  pos: Vec2;
  ratio: number; // just-intonation ratio over the base frequency
  lfoHz: number; // breathing rate
}

interface TapNodes {
  img: ImageStruct;
  delay: DelayNode;
  lp: BiquadFilterNode;
  gain: GainNode;
  panner: PannerNode;
}

interface Voice {
  spec: SourceSpec;
  padGain: GainNode;
  osc1: OscillatorNode;
  osc2: OscillatorNode;
  lfo: OscillatorNode;
  taps: TapNodes[];
}

function rampParam(p: AudioParam, value: number, t: number) {
  try {
    p.setTargetAtTime(value, t, RAMP_TC);
  } catch {
    p.value = value;
  }
}

function placePanner(panner: PannerNode, x: number, z: number, t: number) {
  // Modern browsers expose positionX/Y/Z as AudioParams; older ones need
  // setPosition(). Guard both.
  const px = panner.positionX as AudioParam | undefined;
  if (px && typeof px.setTargetAtTime === "function") {
    rampParam(panner.positionX, x, t);
    rampParam(panner.positionY, 0, t);
    rampParam(panner.positionZ, z, t);
  } else {
    (panner as unknown as { setPosition: (a: number, b: number, c: number) => void }).setPosition(x, 0, z);
  }
}

export class RoomAudio {
  readonly ctx: AudioContext;
  private master: GainNode;
  private limiter: DynamicsCompressorNode;
  private voices: Voice[] = [];
  private lx: number;
  private ly: number;

  constructor(
    lx: number,
    ly: number,
    sources: SourceSpec[],
    baseHz: number,
    maxOrder: number,
  ) {
    this.lx = lx;
    this.ly = ly;
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    this.ctx = new Ctor();

    // Keep the AudioListener at the identity pose; we move the panners instead
    // (avoids cross-browser quirks with listener orientation). Forward = -z.
    const L = this.ctx.listener;
    if (L.positionX) {
      L.positionX.value = 0;
      L.positionY.value = 0;
      L.positionZ.value = 0;
    }

    this.limiter = this.ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -14;
    this.limiter.knee.value = 8;
    this.limiter.ratio.value = 12;
    this.limiter.attack.value = 0.003;
    this.limiter.release.value = 0.25;

    this.master = this.ctx.createGain();
    this.master.gain.value = 0.0001;
    this.limiter.connect(this.master).connect(this.ctx.destination);

    const walls = buildWalls(lx, ly);
    const now = this.ctx.currentTime;

    for (const spec of sources) {
      const freq = baseHz * spec.ratio;
      const padGain = this.ctx.createGain();
      padGain.gain.value = 0.5;

      const padFilter = this.ctx.createBiquadFilter();
      padFilter.type = "lowpass";
      padFilter.frequency.value = 2400;
      padFilter.Q.value = 0.6;

      const osc1 = this.ctx.createOscillator();
      osc1.type = "sawtooth";
      osc1.frequency.value = freq;
      osc1.detune.value = -6;
      const osc2 = this.ctx.createOscillator();
      osc2.type = "sawtooth";
      osc2.frequency.value = freq;
      osc2.detune.value = +6;

      const oscMix = this.ctx.createGain();
      oscMix.gain.value = 0.5;
      osc1.connect(oscMix);
      osc2.connect(oscMix);
      oscMix.connect(padFilter).connect(padGain);

      // Slow breathing LFO on the pad amplitude (deterministic, no JS loop).
      const lfo = this.ctx.createOscillator();
      lfo.type = "sine";
      lfo.frequency.value = spec.lfoHz;
      const lfoDepth = this.ctx.createGain();
      lfoDepth.gain.value = 0.22;
      lfo.connect(lfoDepth).connect(padGain.gain);

      const imgs = buildImageSources(spec.pos, walls, maxOrder);
      const taps: TapNodes[] = [];
      for (const img of imgs) {
        const delay = this.ctx.createDelay(1.5);
        const lp = this.ctx.createBiquadFilter();
        lp.type = "lowpass";
        lp.frequency.value = 8000;
        const gain = this.ctx.createGain();
        gain.gain.value = 0.0001;
        const panner = this.ctx.createPanner();
        panner.panningModel = "HRTF";
        panner.distanceModel = "inverse";
        panner.rolloffFactor = 0; // our own gain owns distance attenuation
        panner.refDistance = 1;
        padGain.connect(delay).connect(lp).connect(gain).connect(panner);
        panner.connect(this.limiter);
        taps.push({ img, delay, lp, gain, panner });
      }

      osc1.start(now);
      osc2.start(now);
      lfo.start(now);
      this.voices.push({ spec, padGain, osc1, osc2, lfo, taps });
    }
  }

  /** Fade master in after the user gesture. */
  start() {
    if (this.ctx.state === "suspended") void this.ctx.resume();
    rampParam(this.master.gain, 0.2, this.ctx.currentTime);
  }

  /**
   * Re-render the acoustics around a new listener pose.
   * facing = heading angle (rad); forward = (cos, sin) in plan coords.
   */
  update(listener: Vec2, facing: number) {
    const t = this.ctx.currentTime;
    const fx = Math.cos(facing);
    const fy = Math.sin(facing);
    // Right vector (plan is y-down): rotate forward by +90deg.
    const rx = -fy;
    const ry = fx;
    for (const v of this.voices) {
      for (const tap of v.taps) {
        const info = computeTap(listener, v.spec.pos, tap.img, REFLECT_COEFF);
        rampParam(tap.delay.delayTime, Math.min(info.delay, 1.4), t);
        rampParam(tap.lp.frequency, info.cutoff, t);
        rampParam(tap.gain.gain, info.gain, t);
        const forwardComp = info.worldDir.x * fx + info.worldDir.y * fy;
        const rightComp = info.worldDir.x * rx + info.worldDir.y * ry;
        placePanner(
          tap.panner,
          rightComp * PANNER_RADIUS,
          -forwardComp * PANNER_RADIUS,
          t,
        );
      }
    }
  }

  dispose() {
    try {
      rampParam(this.master.gain, 0.0001, this.ctx.currentTime);
    } catch {
      /* noop */
    }
    for (const v of this.voices) {
      for (const o of [v.osc1, v.osc2, v.lfo]) {
        try {
          o.stop();
        } catch {
          /* already stopped */
        }
        try {
          o.disconnect();
        } catch {
          /* noop */
        }
      }
    }
    // Give the fade a beat, then close.
    const ctx = this.ctx;
    setTimeout(() => {
      if (ctx.state !== "closed") void ctx.close();
    }, 120);
  }
}
