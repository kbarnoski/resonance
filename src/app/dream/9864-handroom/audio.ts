// audio.ts — the binaural Web Audio room for 9864 · Handroom.
//
// You (the AudioListener) are FIXED at the origin. Six 2-op-FM voices tuned to a
// just-intonation chord (1/1 9/8 5/4 3/2 5/3 15/8 over ~130 Hz) each feed their
// OWN HRTF PannerNode placed in 3-D space around your head. Moving a source
// updates its panner position via setTargetAtTime, so it audibly travels around
// you. A source's HEIGHT (y) raises a per-source lowpass cutoff + a small gain
// lift, so lifting a voice literally makes it bloom. Grabbing pulls it in close,
// and the inverse distance model makes it swell.
//
// Everything is summed through the shared ear-safety master (gain 0.16).

import {
  RATIOS,
  FUNDAMENTAL,
  homePosition,
  heightNorm,
  dist3,
  type Vec3,
} from "./field";
import { createSafeMaster, type SafeMaster } from "../_shared/visionary/safeMaster";
import { handroomRng } from "./prng";

interface ListenerLike {
  positionX?: AudioParam;
  positionY?: AudioParam;
  positionZ?: AudioParam;
  forwardX?: AudioParam;
  forwardY?: AudioParam;
  forwardZ?: AudioParam;
  upX?: AudioParam;
  upY?: AudioParam;
  upZ?: AudioParam;
  setPosition?: (x: number, y: number, z: number) => void;
  setOrientation?: (
    fx: number,
    fy: number,
    fz: number,
    ux: number,
    uy: number,
    uz: number,
  ) => void;
}

interface Voice {
  car: OscillatorNode;
  mod: OscillatorNode;
  modGain: GainNode;
  lp: BiquadFilterNode;
  gain: GainNode;
  panner: PannerNode;
}

function setPannerPos(p: PannerNode, v: Vec3, t: number, tc: number): void {
  if (p.positionX) {
    p.positionX.setTargetAtTime(v.x, t, tc);
    p.positionY.setTargetAtTime(v.y, t, tc);
    p.positionZ.setTargetAtTime(v.z, t, tc);
  } else {
    // Older Safari
    (p as unknown as { setPosition: (x: number, y: number, z: number) => void }).setPosition(
      v.x,
      v.y,
      v.z,
    );
  }
}

export class HandroomAudio {
  private ctx: AudioContext;
  private master: SafeMaster;
  private voices: Voice[] = [];
  private running = false;
  /** Per-source perceived gain, for the live readout. */
  readonly displayGain: number[] = [];
  /** Whether HRTF was available (else equalpower). */
  readonly hrtf: boolean;

  constructor() {
    const Ctor: typeof AudioContext =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new Ctor();
    this.master = createSafeMaster(this.ctx, { gain: 0.16 });

    // FIXED listener at the origin, facing -Z, up +Y.
    const L = this.ctx.listener as unknown as ListenerLike;
    if (L.positionX) {
      L.positionX.value = 0;
      L.positionY!.value = 0;
      L.positionZ!.value = 0;
      L.forwardX!.value = 0;
      L.forwardY!.value = 0;
      L.forwardZ!.value = -1;
      L.upX!.value = 0;
      L.upY!.value = 1;
      L.upZ!.value = 0;
    } else {
      L.setPosition?.(0, 0, 0);
      L.setOrientation?.(0, 0, -1, 0, 1, 0);
    }

    const rng = handroomRng();
    let hrtfOk = true;
    for (let i = 0; i < RATIOS.length; i++) {
      const freq = FUNDAMENTAL * RATIOS[i];

      const car = this.ctx.createOscillator();
      car.type = "sine";
      car.frequency.value = freq;
      car.detune.value = (rng() - 0.5) * 7; // seeded warmth

      // 2-op FM: modulator at 2× → carrier.frequency
      const mod = this.ctx.createOscillator();
      mod.type = "sine";
      mod.frequency.value = freq * 2;
      const modGain = this.ctx.createGain();
      modGain.gain.value = freq * 0.6; // modest, warm index

      const lp = this.ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 700;
      lp.Q.value = 0.9;

      const gain = this.ctx.createGain();
      gain.gain.value = 0;

      const panner = this.ctx.createPanner();
      try {
        panner.panningModel = "HRTF";
        if (panner.panningModel !== "HRTF") hrtfOk = false;
      } catch {
        panner.panningModel = "equalpower";
        hrtfOk = false;
      }
      panner.distanceModel = "inverse";
      panner.refDistance = 1;
      panner.rolloffFactor = 1.1;
      panner.maxDistance = 20;
      setPannerPos(panner, homePosition(i), this.ctx.currentTime, 0.001);

      mod.connect(modGain);
      modGain.connect(car.frequency);
      car.connect(lp);
      lp.connect(gain);
      gain.connect(panner);
      panner.connect(this.master.input);
      car.start();
      mod.start();

      this.voices.push({ car, mod, modGain, lp, gain, panner });
      this.displayGain.push(0);
    }
    this.hrtf = hrtfOk;
  }

  get contextState(): AudioContextState {
    return this.ctx.state;
  }

  async start(): Promise<void> {
    if (this.running) return;
    if (this.ctx.state === "suspended") await this.ctx.resume();
    this.running = true;
  }

  /** Per-frame update for one source: move its panner, set brightness from
   *  height, set loudness from distance + grab. */
  setSource(i: number, pos: Vec3, held: boolean): void {
    const v = this.voices[i];
    if (!v) return;
    const t = this.ctx.currentTime;
    setPannerPos(v.panner, pos, t, 0.05);

    const hn = heightNorm(pos.y);
    v.lp.frequency.setTargetAtTime(400 + hn * 3200, t, 0.08);

    const d = dist3(pos);
    const loud = 1 / (1 + 1.1 * Math.max(0, d - 1)); // mirrors inverse model
    const g = (0.1 + hn * 0.06) * (held ? 1.3 : 1.0);
    v.gain.gain.setTargetAtTime(this.running ? g : 0, t, 0.1);
    this.displayGain[i] = this.running ? g * loud : 0;
  }

  stop(): void {
    const t = this.ctx.currentTime;
    for (const v of this.voices) {
      try {
        v.gain.gain.cancelScheduledValues(t);
        v.gain.gain.setTargetAtTime(0, t, 0.1);
      } catch {
        /* closing */
      }
    }
    this.running = false;
    window.setTimeout(() => {
      for (const v of this.voices) {
        try {
          v.car.stop();
          v.mod.stop();
        } catch {
          /* already stopped */
        }
      }
      this.master.disconnect();
      void this.ctx.close();
    }, 300);
  }
}
