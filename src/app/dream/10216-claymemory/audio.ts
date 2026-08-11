// audio.ts — the sound of plastic clay for 10216 · Clay Memory.
//
// Two layers, both records of the sculpting:
//   1. A struck-bar DRONE at free-bar inharmonic ratios 1 : 2.76 : 5.40 (the modes
//      of a free–free bar — deliberately NOT just intonation, NOT a harmonic
//      series). Root ~110 Hz. As accumulated PLASTIC deformation grows, a lowpass
//      closes and the root sags — the more you've sculpted, the darker the tone,
//      so the drone is itself a record of the shape.
//   2. Strain-driven GRANULAR squelch: fast particle motion / yielding fires short
//      band-passed noise "wet clay" grains; a low "thup" fires when a region
//      crosses the plastic yield ("it took the shape"). Capped voices + the shared
//      safe master limiter. Never silent once started (the drone always sounds).
//
// No microphone is opened — the camera is the input, not audio-in.

import { createSafeMaster, type SafeMaster } from "../_shared/visionary/safeMaster";
import { mulberry32, SEED } from "./rng";

const BAR_RATIOS = [1, 2.76, 5.4]; // free–free bar modes (inharmonic)
const MAX_GRAINS = 20;

export class ClayAudio {
  private ctx: AudioContext;
  private master: SafeMaster;
  private rng = mulberry32(SEED ^ 0x9a7);
  private noise: AudioBuffer;

  private droneOscs: OscillatorNode[] = [];
  private droneGains: GainNode[] = [];
  private droneLP: BiquadFilterNode;
  private droneBus: GainNode;
  private grainBus: GainNode;

  private grainVoices = 0;
  private grainAcc = 0;
  private running = false;

  constructor() {
    const Ctor: typeof AudioContext =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new Ctor();
    this.master = createSafeMaster(this.ctx, { gain: 0.16 });

    // seeded noise buffer (~1 s) for the wet-clay grains.
    const len = Math.floor(this.ctx.sampleRate);
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const nd = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) nd[i] = this.rng() * 2 - 1;

    // ── drone bus: struck-bar partials → darkening lowpass → master ─────────────
    this.droneLP = this.ctx.createBiquadFilter();
    this.droneLP.type = "lowpass";
    this.droneLP.frequency.value = 1400;
    this.droneLP.Q.value = 0.7;

    this.droneBus = this.ctx.createGain();
    this.droneBus.gain.value = 0.9;
    this.droneLP.connect(this.droneBus);
    this.droneBus.connect(this.master.input);

    this.grainBus = this.ctx.createGain();
    this.grainBus.gain.value = 0.9;
    this.grainBus.connect(this.master.input);
  }

  async start(): Promise<void> {
    if (this.running) return;
    if (this.ctx.state === "suspended") {
      try {
        await this.ctx.resume();
      } catch {
        /* stays suspended → visuals keep running silently */
      }
    }
    const now = this.ctx.currentTime;
    const root = 110;
    for (let i = 0; i < BAR_RATIOS.length; i++) {
      const osc = this.ctx.createOscillator();
      osc.type = i === 0 ? "triangle" : "sine";
      osc.frequency.value = root * BAR_RATIOS[i];
      osc.detune.value = (this.rng() - 0.5) * 5; // seeded shimmer / slow beating

      const g = this.ctx.createGain();
      // higher inharmonic partials sit quieter (a bar's modes decay with order).
      g.gain.value = 0;
      g.gain.setTargetAtTime([0.5, 0.16, 0.07][i], now, 0.6);

      osc.connect(g);
      g.connect(this.droneLP);
      osc.start();
      this.droneOscs.push(osc);
      this.droneGains.push(g);
    }
    this.running = true;
  }

  /** Fold the sim state into sound. Call every frame after solver.step(). */
  update(motion: number, plastic: number, yieldEnergy: number, dt: number): void {
    if (!this.running) return;
    const now = this.ctx.currentTime;

    // Darken the drone as plastic memory accumulates.
    const cutoff = 1400 - plastic * 1050; // 1400 → 350 Hz
    this.droneLP.frequency.setTargetAtTime(Math.max(300, cutoff), now, 0.2);
    const root = 110 - plastic * 20; // root sags as the piece deepens
    for (let i = 0; i < this.droneOscs.length; i++) {
      this.droneOscs[i].frequency.setTargetAtTime(root * BAR_RATIOS[i], now, 0.25);
    }

    // Strain-driven grains: fast motion → more wet-clay squelch.
    const rate = Math.min(60, motion * 900); // grains/sec
    this.grainAcc += rate * dt;
    while (this.grainAcc >= 1) {
      this.grainAcc -= 1;
      this.spawnGrain(now, Math.min(1, motion * 40), plastic);
    }

    // A low "thup" when a region crosses yield — the satisfying "it took" cue.
    if (yieldEnergy > 0.02) {
      this.thup(now, Math.min(1, yieldEnergy * 6));
    }
  }

  private spawnGrain(now: number, energy: number, plastic: number): void {
    if (this.grainVoices >= MAX_GRAINS) return;
    this.grainVoices++;

    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = false;
    const off = this.rng() * (this.noise.duration - 0.1);
    src.playbackRate.value = 0.7 + this.rng() * 0.9;

    const bp = this.ctx.createBiquadFilter();
    bp.type = "bandpass";
    // brighter grains when moving fast; wetter (lower) when the clay is heavy.
    bp.frequency.value = 220 + energy * 900 - plastic * 120 + this.rng() * 180;
    bp.Q.value = 3 + this.rng() * 5;

    const g = this.ctx.createGain();
    const dur = 0.05 + this.rng() * 0.09;
    const peak = 0.05 + energy * 0.16;
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(peak, now + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);

    src.connect(bp);
    bp.connect(g);
    g.connect(this.grainBus);
    src.start(now, off, dur + 0.02);
    src.onended = () => {
      this.grainVoices = Math.max(0, this.grainVoices - 1);
      try {
        src.disconnect();
        bp.disconnect();
        g.disconnect();
      } catch {
        /* closing */
      }
    };
  }

  private thup(now: number, amp: number): void {
    // low sine drop + a damped noise burst = a soft, satisfying "it took shape".
    const osc = this.ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(150, now);
    osc.frequency.exponentialRampToValueAtTime(52, now + 0.16);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.22 * amp + 0.02, now + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
    osc.connect(g);
    g.connect(this.grainBus);
    osc.start(now);
    osc.stop(now + 0.24);
    osc.onended = () => {
      try {
        osc.disconnect();
        g.disconnect();
      } catch {
        /* closing */
      }
    };
  }

  stop(): void {
    this.running = false;
    for (const o of this.droneOscs) {
      try {
        o.stop();
        o.disconnect();
      } catch {
        /* closing */
      }
    }
    this.master.disconnect();
    if (this.ctx.state !== "closed") {
      this.ctx.close().catch(() => {});
    }
  }
}
