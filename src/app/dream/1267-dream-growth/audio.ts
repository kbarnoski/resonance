// ── Dream Growth · spatial struck-resonator engine ──────────────────────────
// Every strike is a physically-modelled MODAL bank — a handful of mildly-
// inharmonic partials (≈ 1, 2.01, 3.0, 4.18, 5.43, 6.79), each with its own
// exponential decay, excited by a short filtered-noise mallet transient — placed
// in 3D by its OWN HRTF PannerNode at the world position of the strike. The
// listener is the walking camera, so the ring arrives from exactly where you
// hit it, and the growing structure you build becomes an instrument you replay
// by walking back through it.
//
// Bed: a slow just-intonation drone (shared droneBank) under a code-generated
// convolution reverb (shared convolutionVoid) whose long tail fills the volume
// the room grows into. Ear-safe chain: strike → panner(HRTF) → { dry → master,
// send → reverb } and drone → master; master (≤0.5) → soft-knee compressor →
// destination.

import { createVoidReverb, type VoidReverb } from "../_shared/psych/convolutionVoid";
import { startDroneBank, type DroneBank } from "../_shared/psych/droneBank";
import type { ListenerPose } from "./scene";

const MODAL_PARTIALS: ReadonlyArray<{ r: number; a: number; d: number }> = [
  { r: 1.0, a: 1.0, d: 1.0 },
  { r: 2.01, a: 0.5, d: 0.62 },
  { r: 3.0, a: 0.32, d: 0.44 },
  { r: 4.18, a: 0.18, d: 0.3 },
  { r: 5.43, a: 0.1, d: 0.22 },
  { r: 6.79, a: 0.06, d: 0.16 },
];

const BASE_DECAY = 3.4;

export class GrowthAudio {
  private ctx: AudioContext;
  private master: GainNode;
  private compressor: DynamicsCompressorNode;
  private reverb: VoidReverb;
  private reverbSend: GainNode;
  private drone: DroneBank;
  private droneGain: GainNode;
  private drive = 0.12;
  private stopped = false;

  constructor() {
    const Ctor: typeof AudioContext =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new Ctor();
    const ctx = this.ctx;

    this.compressor = ctx.createDynamicsCompressor();
    this.compressor.threshold.value = -18;
    this.compressor.knee.value = 24;
    this.compressor.ratio.value = 3;
    this.compressor.attack.value = 0.008;
    this.compressor.release.value = 0.3;
    this.compressor.connect(ctx.destination);

    this.master = ctx.createGain();
    this.master.gain.value = 0.0001;
    this.master.gain.setValueAtTime(0.0001, ctx.currentTime);
    this.master.gain.exponentialRampToValueAtTime(0.5, ctx.currentTime + 3.5);
    this.master.connect(this.compressor);

    // Long reverb fills the growing volume (a nod to adaptive room acoustics).
    this.reverb = createVoidReverb(ctx, { seconds: 5.4, decay: 2.1, wet: 1 });
    this.reverb.setWet(1);
    this.reverb.output.connect(this.master);
    this.reverbSend = ctx.createGain();
    this.reverbSend.gain.value = 0.9;
    this.reverbSend.connect(this.reverb.input);

    this.droneGain = ctx.createGain();
    this.droneGain.gain.value = 0.5;
    this.droneGain.connect(this.master);
    this.drone = startDroneBank(ctx, this.droneGain, {
      root: 55, // A1
      ratios: [1, 6 / 5, 3 / 2, 2, 3], // A-minor/Dorian colour
      cutoffLow: 180,
      cutoffHigh: 1600,
      peakGain: 0.26,
    });
    this.drone.setDrive(this.drive);
  }

  get context(): AudioContext {
    return this.ctx;
  }

  async resume(): Promise<void> {
    if (this.ctx.state === "suspended") {
      try {
        await this.ctx.resume();
      } catch {
        /* ignore */
      }
    }
  }

  setListenerPose(p: ListenerPose): void {
    if (this.stopped) return;
    const l = this.ctx.listener;
    const t = this.ctx.currentTime;
    const smooth = 0.02;
    if (l.positionX) {
      l.positionX.setTargetAtTime(p.px, t, smooth);
      l.positionY.setTargetAtTime(p.py, t, smooth);
      l.positionZ.setTargetAtTime(p.pz, t, smooth);
      l.forwardX.setTargetAtTime(p.fx, t, smooth);
      l.forwardY.setTargetAtTime(p.fy, t, smooth);
      l.forwardZ.setTargetAtTime(p.fz, t, smooth);
      l.upX.setTargetAtTime(p.ux, t, smooth);
      l.upY.setTargetAtTime(p.uy, t, smooth);
      l.upZ.setTargetAtTime(p.uz, t, smooth);
    } else {
      const legacy = l as unknown as {
        setPosition(x: number, y: number, z: number): void;
        setOrientation(fx: number, fy: number, fz: number, ux: number, uy: number, uz: number): void;
      };
      legacy.setPosition(p.px, p.py, p.pz);
      legacy.setOrientation(p.fx, p.fy, p.fz, p.ux, p.uy, p.uz);
    }
  }

  tick(dt: number): void {
    if (this.stopped) return;
    if (this.drive > 0.12) {
      this.drive = Math.max(0.12, this.drive - dt * 0.35);
      this.drone.setDrive(this.drive);
    }
  }

  strike(freq: number, pos: { x: number; y: number; z: number }, intensity = 1): void {
    if (this.stopped || this.ctx.state === "closed") return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    const panner = ctx.createPanner();
    panner.panningModel = "HRTF";
    panner.distanceModel = "inverse";
    panner.refDistance = 2.2;
    panner.rolloffFactor = 1.1;
    panner.maxDistance = 140;
    if (panner.positionX) {
      panner.positionX.setValueAtTime(pos.x, now);
      panner.positionY.setValueAtTime(pos.y, now);
      panner.positionZ.setValueAtTime(pos.z, now);
    } else {
      (panner as unknown as { setPosition(x: number, y: number, z: number): void }).setPosition(
        pos.x, pos.y, pos.z,
      );
    }

    const voice = ctx.createGain();
    voice.gain.value = 1;
    voice.connect(panner);
    panner.connect(this.master);
    panner.connect(this.reverbSend);

    // mallet transient — a short filtered noise click
    const clickLen = 0.03;
    const clickBuf = ctx.createBuffer(1, Math.max(1, Math.floor(clickLen * ctx.sampleRate)), ctx.sampleRate);
    const cd = clickBuf.getChannelData(0);
    let seed = ((freq * 1000) | 0) >>> 0 || 1;
    for (let i = 0; i < cd.length; i++) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      cd[i] = (seed / 0xffffffff) * 2 - 1;
    }
    const click = ctx.createBufferSource();
    click.buffer = clickBuf;
    const clickBp = ctx.createBiquadFilter();
    clickBp.type = "bandpass";
    clickBp.frequency.value = Math.min(9000, freq * 4);
    clickBp.Q.value = 0.7;
    const clickGain = ctx.createGain();
    clickGain.gain.value = 0.18 * intensity;
    click.connect(clickBp);
    clickBp.connect(clickGain);
    clickGain.connect(voice);
    click.start(now);
    click.stop(now + clickLen + 0.02);

    const oscs: OscillatorNode[] = [];
    for (const p of MODAL_PARTIALS) {
      const decay = BASE_DECAY * p.d;
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = freq * p.r;
      osc.detune.value = (Math.random() - 0.5) * 4;
      const g = ctx.createGain();
      const amp = p.a * 0.5 * intensity;
      g.gain.setValueAtTime(0.0001, now);
      g.gain.linearRampToValueAtTime(amp, now + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, now + decay);
      osc.connect(g);
      g.connect(voice);
      osc.start(now);
      osc.stop(now + decay + 0.1);
      oscs.push(osc);
    }

    const last = oscs[0];
    last.onended = () => {
      try {
        voice.disconnect();
        panner.disconnect();
      } catch {
        /* already gone */
      }
    };

    this.drive = Math.min(0.55, this.drive + 0.18 * intensity);
    this.drone.setDrive(this.drive);
  }

  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    const now = this.ctx.currentTime;
    try {
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setValueAtTime(Math.max(0.0001, this.master.gain.value), now);
      this.master.gain.exponentialRampToValueAtTime(0.0001, now + 0.4);
    } catch {
      /* ctx closing */
    }
    try {
      this.drone.stop();
    } catch {
      /* ignore */
    }
    window.setTimeout(() => {
      if (this.ctx.state !== "closed") {
        this.ctx.close().catch(() => {
          /* ignore */
        });
      }
    }, 500);
  }
}
