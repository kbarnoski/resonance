/**
 * synth.ts — the binaural choir. Each orb is a small additive drone voice
 * (fundamental + natural overtones + a detuned twin for slow beating) fed
 * through its own HRTF PannerNode, so the whole field is rendered in true
 * binaural space relative to a movable AudioListener.
 *
 *   voice oscs → voiceGain → lowpass → PannerNode(HRTF) ┐
 *                                                        ├→ limiter → master(≤0.15) → out
 *                        ...one panner per orb...        ┘
 */

import { listenerVectors, type Pose } from "./spatial";

type Voice = {
  oscs: OscillatorNode[];
  partialGains: GainNode[];
  voiceGain: GainNode;
  lp: BiquadFilterNode;
  panner: PannerNode;
  lfo: OscillatorNode;
  lfoGain: GainNode;
};

// Natural overtone series (timbre only — the fundamental stays continuous).
const PARTIALS: { mult: number; gain: number; detune: number }[] = [
  { mult: 1.0, gain: 0.6, detune: 0 },
  { mult: 1.0, gain: 0.32, detune: 6 }, // detuned twin → slow chorus beating
  { mult: 2.0, gain: 0.16, detune: 0 },
  { mult: 3.0, gain: 0.08, detune: 0 },
];

const VOICE_LEVEL = 0.11; // per-voice ceiling before spatial attenuation

export class ChoirEngine {
  readonly ctx: AudioContext;
  private master: GainNode;
  private limiter: DynamicsCompressorNode;
  private voices = new Map<number, Voice>();
  private useParams: boolean;

  constructor() {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    this.ctx = new Ctor();

    this.master = this.ctx.createGain();
    this.master.gain.value = 0.0001;

    // Gentle brick-wall so a dense choir can never clip.
    this.limiter = this.ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -8;
    this.limiter.knee.value = 6;
    this.limiter.ratio.value = 12;
    this.limiter.attack.value = 0.003;
    this.limiter.release.value = 0.25;

    this.limiter.connect(this.master);
    this.master.connect(this.ctx.destination);

    this.useParams = typeof this.ctx.listener.forwardX !== "undefined";
    this.setListener(0, 0, true);
  }

  suspended(): boolean {
    return this.ctx.state === "suspended";
  }

  async resume(): Promise<void> {
    try {
      await this.ctx.resume();
    } catch {
      /* resumes on next gesture */
    }
    // Fade the master up to its (safe) ceiling once running.
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(this.master.gain.value, now);
    this.master.gain.linearRampToValueAtTime(0.15, now + 1.2);
  }

  hasVoice(id: number): boolean {
    return this.voices.has(id);
  }

  /** Build + start a voice from an initial pose. */
  addVoice(pose: Pose): void {
    if (this.voices.has(pose.id)) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    const panner = ctx.createPanner();
    panner.panningModel = "HRTF";
    panner.distanceModel = "inverse";
    panner.refDistance = 1;
    panner.maxDistance = 24;
    panner.rolloffFactor = 1;
    panner.coneInnerAngle = 360;
    setXYZ(panner, pose.x, pose.y, pose.z, now);
    panner.connect(this.limiter);

    const voiceGain = ctx.createGain();
    voiceGain.gain.value = 0.0001;
    voiceGain.connect(panner);

    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = Math.min(6000, pose.freq * 8 + 400);
    lp.Q.value = 0.5;
    lp.connect(voiceGain);

    const oscs: OscillatorNode[] = [];
    const partialGains: GainNode[] = [];
    for (const p of PARTIALS) {
      const osc = ctx.createOscillator();
      osc.type = p.mult === 1 ? "sine" : "triangle";
      osc.frequency.value = pose.freq * p.mult;
      osc.detune.value = p.detune;
      const g = ctx.createGain();
      g.gain.value = p.gain;
      osc.connect(g);
      g.connect(lp);
      osc.start(now);
      oscs.push(osc);
      partialGains.push(g);
    }

    // Slow breath LFO on the voice level → the field feels alive.
    const lfo = ctx.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = 0.06 + (pose.id % 5) * 0.017;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = VOICE_LEVEL * 0.28;
    lfo.connect(lfoGain);
    lfoGain.connect(voiceGain.gain);
    lfo.start(now);

    // Fade in — no click.
    voiceGain.gain.setValueAtTime(0.0001, now);
    voiceGain.gain.linearRampToValueAtTime(VOICE_LEVEL, now + 1.0);

    this.voices.set(pose.id, {
      oscs,
      partialGains,
      voiceGain,
      lp,
      panner,
      lfo,
      lfoGain,
    });
  }

  /** Move a voice to its current pose (called per animation frame). */
  updateVoice(pose: Pose): void {
    const v = this.voices.get(pose.id);
    if (!v) return;
    setXYZ(v.panner, pose.x, pose.y, pose.z, this.ctx.currentTime);
  }

  /** Fade a voice out, then tear its nodes down. */
  removeVoice(id: number): void {
    const v = this.voices.get(id);
    if (!v) return;
    this.voices.delete(id);
    const now = this.ctx.currentTime;
    v.voiceGain.gain.cancelScheduledValues(now);
    v.voiceGain.gain.setValueAtTime(v.voiceGain.gain.value, now);
    v.voiceGain.gain.linearRampToValueAtTime(0.0001, now + 0.5);
    window.setTimeout(() => {
      try {
        v.lfo.stop();
        for (const o of v.oscs) o.stop();
        disconnectVoice(v);
      } catch {
        /* already stopped */
      }
    }, 650);
  }

  /** Rotate the whole field around the head. */
  setListener(yaw: number, pitch: number, immediate = false): void {
    const { fwd, up } = listenerVectors(yaw, pitch);
    const l = this.ctx.listener;
    const now = this.ctx.currentTime;
    const tau = immediate ? 0 : 0.08;
    if (this.useParams) {
      smooth(l.forwardX, fwd[0], now, tau);
      smooth(l.forwardY, fwd[1], now, tau);
      smooth(l.forwardZ, fwd[2], now, tau);
      smooth(l.upX, up[0], now, tau);
      smooth(l.upY, up[1], now, tau);
      smooth(l.upZ, up[2], now, tau);
    } else {
      // Legacy Firefox / Safari path.
      (
        l as unknown as {
          setOrientation: (
            fx: number,
            fy: number,
            fz: number,
            ux: number,
            uy: number,
            uz: number,
          ) => void;
        }
      ).setOrientation(fwd[0], fwd[1], fwd[2], up[0], up[1], up[2]);
    }
  }

  dispose(): void {
    for (const id of Array.from(this.voices.keys())) {
      const v = this.voices.get(id)!;
      try {
        v.lfo.stop();
        for (const o of v.oscs) o.stop();
        disconnectVoice(v);
      } catch {
        /* ignore */
      }
      this.voices.delete(id);
    }
    try {
      this.limiter.disconnect();
      this.master.disconnect();
    } catch {
      /* ignore */
    }
    if (this.ctx.state !== "closed") void this.ctx.close();
  }
}

function setXYZ(
  p: PannerNode,
  x: number,
  y: number,
  z: number,
  now: number,
): void {
  if (typeof p.positionX !== "undefined") {
    // Tiny time-constant glide keeps HRTF motion buttery, no zipper noise.
    p.positionX.setTargetAtTime(x, now, 0.02);
    p.positionY.setTargetAtTime(y, now, 0.02);
    p.positionZ.setTargetAtTime(z, now, 0.02);
  } else {
    (
      p as unknown as { setPosition: (x: number, y: number, z: number) => void }
    ).setPosition(x, y, z);
  }
}

function smooth(param: AudioParam, value: number, now: number, tau: number) {
  if (tau <= 0) param.setValueAtTime(value, now);
  else param.setTargetAtTime(value, now, tau);
}

function disconnectVoice(v: Voice): void {
  for (const o of v.oscs) o.disconnect();
  for (const g of v.partialGains) g.disconnect();
  v.lfoGain.disconnect();
  v.lp.disconnect();
  v.voiceGain.disconnect();
  v.panner.disconnect();
}
