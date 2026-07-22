// ─────────────────────────────────────────────────────────────────────────────
// 2276-oceanic-gather / audio.ts — the HRTF "many-voices → one" spatial engine.
//
// N bell voices ride a sphere around the listener's head. A single played Union
// parameter U∈[0,1] simultaneously (a) lerps every voice inward toward head
// centre, (b) eases each voice's microtonal detune toward a shared unison, (c)
// tightens amplitude beat-lock, and (d) blooms brightness + reverb wet. Many → one.
//
// No React here — this is a plain class the component drives each frame.
// ─────────────────────────────────────────────────────────────────────────────

import { createVoidReverb, type VoidReverb } from "../_shared/psych/convolutionVoid";
import { mulberry32 } from "./rng";

// D-Dorian scale degrees (semitone offsets from D) used to fan the voices out at
// U=0. Root D3 = 146.83 Hz. NOT pentatonic / not a JI ratio stack: a plain modal
// spread that collapses to a single unison D as U→1.
const D3 = 146.83;
const DORIAN_SEMITONES = [0, 2, 3, 5, 7, 9, 10, 12, 14, 15, 17, 19];

function semisToHz(base: number, semis: number): number {
  return base * Math.pow(2, semis / 12);
}

/** A single spatial bell voice: 2–3 detuned partials sharing one panner. */
interface Voice {
  panner: PannerNode;
  gain: GainNode;
  partials: OscillatorNode[];
  partialGains: GainNode[];
  lp: BiquadFilterNode;
  // Static sphere seat (unit vector) — where this voice lives at U=0.
  seat: [number, number, number];
  // Base scale-degree frequency for this voice (its "world-voice" pitch).
  degreeHz: number;
  // Per-partial cent offset that eases to 0 at U=1 (the microtonal detune).
  partialCents: number[];
  // Slow independent detune LFO parameters (phase + rate + depth in cents).
  detunePhase: number;
  detuneRate: number;
  detuneDepth: number;
  // Beat-lock tremolo phase.
  tremPhase: number;
  tremRate: number;
}

export class OceanicAudio {
  ctx: AudioContext | null = null;
  master: GainNode | null = null;
  comp: DynamicsCompressorNode | null = null;
  analyser: AnalyserNode | null = null;
  reverb: VoidReverb | null = null;
  voices: Voice[] = [];
  ok = false;
  private startedAt = 0;

  // Exposed so the visual can read where each voice currently sits.
  positions: [number, number, number][] = [];

  readonly N = 12;
  readonly radius = 4;

  start(): boolean {
    try {
      const AC: typeof AudioContext =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return false;
      const ctx = new AC();
      this.ctx = ctx;

      const master = ctx.createGain();
      master.gain.value = 0.18;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -18;
      comp.knee.value = 24;
      comp.ratio.value = 3.5;
      comp.attack.value = 0.01;
      comp.release.value = 0.28;

      const reverb = createVoidReverb(ctx, { seconds: 5, decay: 2.6, wet: 0.15 });

      // master → reverb → compressor → destination
      master.connect(reverb.input);
      reverb.output.connect(comp);
      comp.connect(ctx.destination);

      // Analyser tapped off master, NEVER routed onward to output.
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.85;
      master.connect(analyser);

      this.master = master;
      this.comp = comp;
      this.reverb = reverb;
      this.analyser = analyser;

      // Listener at origin, facing -Z, up +Y. Guard older Safari.
      const l = ctx.listener;
      const now = ctx.currentTime;
      if (l.positionX) {
        l.positionX.setValueAtTime(0, now);
        l.positionY.setValueAtTime(0, now);
        l.positionZ.setValueAtTime(0, now);
      } else if ((l as unknown as { setPosition?: (x: number, y: number, z: number) => void }).setPosition) {
        (l as unknown as { setPosition: (x: number, y: number, z: number) => void }).setPosition(0, 0, 0);
      }
      if (l.forwardX) {
        l.forwardX.setValueAtTime(0, now);
        l.forwardY.setValueAtTime(0, now);
        l.forwardZ.setValueAtTime(-1, now);
        l.upX.setValueAtTime(0, now);
        l.upY.setValueAtTime(1, now);
        l.upZ.setValueAtTime(0, now);
      } else if (
        (l as unknown as { setOrientation?: (...a: number[]) => void }).setOrientation
      ) {
        (l as unknown as { setOrientation: (...a: number[]) => void }).setOrientation(0, 0, -1, 0, 1, 0);
      }

      const rng = mulberry32(0x2276);

      for (let i = 0; i < this.N; i++) {
        // Fibonacci-sphere seat so voices distribute evenly all around the head.
        const y = 1 - (i + 0.5) * (2 / this.N); // -1..1
        const r = Math.sqrt(Math.max(0, 1 - y * y));
        const golden = Math.PI * (3 - Math.sqrt(5));
        const theta = golden * i;
        const seat: [number, number, number] = [
          Math.cos(theta) * r,
          y,
          Math.sin(theta) * r,
        ];

        const panner = ctx.createPanner();
        panner.panningModel = "HRTF";
        panner.distanceModel = "inverse";
        panner.refDistance = 1;
        panner.maxDistance = 20;
        panner.rolloffFactor = 0.9;

        const gain = ctx.createGain();
        gain.gain.value = 0; // faded in on begin

        const lp = ctx.createBiquadFilter();
        lp.type = "lowpass";
        lp.frequency.value = 900; // dark at U=0, opens with U
        lp.Q.value = 0.4;

        // Voice pitch = a Dorian degree.
        const degreeHz = semisToHz(D3, DORIAN_SEMITONES[i % DORIAN_SEMITONES.length]);

        // 3 partials (bell-ish): fundamental + two inharmonic-ish overtones.
        const partialMults = [1, 2.01, 3.02];
        const partialLevels = [1, 0.42, 0.22];
        const partials: OscillatorNode[] = [];
        const partialGains: GainNode[] = [];
        const partialCents: number[] = [];
        for (let p = 0; p < partialMults.length; p++) {
          const osc = ctx.createOscillator();
          osc.type = "sine";
          osc.frequency.value = degreeHz * partialMults[p];
          // Each partial gets its own microtonal offset up to ~±35 cents at U=0.
          const cents = (rng() * 2 - 1) * 35;
          partialCents.push(cents);
          osc.detune.value = cents;
          const pg = ctx.createGain();
          pg.gain.value = partialLevels[p] * 0.5;
          osc.connect(pg);
          pg.connect(lp);
          osc.start();
          partials.push(osc);
          partialGains.push(pg);
        }

        lp.connect(gain);
        gain.connect(panner);
        panner.connect(master);

        this.setPannerPos(panner, seat[0] * this.radius, seat[1] * this.radius, seat[2] * this.radius);

        this.voices.push({
          panner,
          gain,
          partials,
          partialGains,
          lp,
          seat,
          degreeHz,
          partialCents,
          detunePhase: rng() * Math.PI * 2,
          detuneRate: 0.05 + rng() * 0.12,
          detuneDepth: 8 + rng() * 14,
          tremPhase: rng() * Math.PI * 2,
          tremRate: 0.8 + rng() * 2.4,
        });
        this.positions.push([seat[0] * this.radius, seat[1] * this.radius, seat[2] * this.radius]);
      }

      this.startedAt = ctx.currentTime;
      // Gentle collective fade-in.
      this.voices.forEach((v) => {
        v.gain.gain.setTargetAtTime(0.5, ctx.currentTime, 1.4);
      });

      this.ok = true;
      return true;
    } catch {
      this.ok = false;
      return false;
    }
  }

  private setPannerPos(panner: PannerNode, x: number, y: number, z: number): void {
    if (panner.positionX) {
      const t = this.ctx ? this.ctx.currentTime : 0;
      panner.positionX.setValueAtTime(x, t);
      panner.positionY.setValueAtTime(y, t);
      panner.positionZ.setValueAtTime(z, t);
    } else {
      (panner as unknown as { setPosition: (x: number, y: number, z: number) => void }).setPosition(x, y, z);
    }
  }

  /**
   * Drive one frame. `U` is the played Union parameter (already slew-limited by
   * the caller). `tSec` is elapsed audio-context seconds for the slow LFOs.
   */
  update(U: number, tSec: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.ok) return;
    const u = Math.min(1, Math.max(0, U));
    const easeIn = u * u; // sharpens convergence near the top
    // Center of union: just in front of the crown, inside the skull.
    const cx = 0,
      cy = 0,
      cz = 0.2;

    for (let i = 0; i < this.voices.length; i++) {
      const v = this.voices[i];

      // (a) POSITION: lerp sphere seat → head centre as U rises.
      const sx = v.seat[0] * this.radius;
      const sy = v.seat[1] * this.radius;
      const sz = v.seat[2] * this.radius;
      const px = sx + (cx - sx) * easeIn;
      const py = sy + (cy - sy) * easeIn;
      const pz = sz + (cz - sz) * easeIn;
      this.setPannerPos(v.panner, px, py, pz);
      this.positions[i] = [px, py, pz];

      // (b) DETUNE → UNISON. At U=0 each partial holds its microtonal offset plus
      // a slow independent wander; both ease to 0 (shared unison) as U→1.
      const wander =
        Math.sin(tSec * v.detuneRate * Math.PI * 2 + v.detunePhase) * v.detuneDepth;
      const detuneScale = 1 - u; // collapses to 0
      for (let p = 0; p < v.partials.length; p++) {
        const centTarget = (v.partialCents[p] + wander) * detuneScale;
        v.partials[p].detune.setTargetAtTime(centTarget, ctx.currentTime, 0.08);
      }

      // Pitch glide: each voice's fundamental eases from its Dorian degree toward
      // the shared unison D as U rises (the many pitches become one).
      const glideHz = v.degreeHz + (D3 - v.degreeHz) * easeIn;
      const mults = [1, 2.01, 3.02];
      for (let p = 0; p < v.partials.length; p++) {
        v.partials[p].frequency.setTargetAtTime(glideHz * mults[p], ctx.currentTime, 0.12);
      }

      // (c) BEAT-LOCK: at U=0 each voice pulses on its own tremolo rate; as U→1
      // the tremolo depth fades so the field fuses into one steady presence.
      const tremDepth = 0.18 * (1 - u);
      const trem = 1 - tremDepth + tremDepth * Math.sin(tSec * v.tremRate * Math.PI * 2 + v.tremPhase);
      // Voices closest to convergence also swell slightly (warm master bloom).
      const swell = 0.5 + 0.28 * easeIn;
      v.gain.gain.setTargetAtTime(swell * trem, ctx.currentTime, 0.05);

      // (d) BRIGHTNESS bloom: lowpass opens from 900 → ~4200 Hz with U.
      const cutoff = 900 + 3300 * easeIn;
      v.lp.frequency.setTargetAtTime(cutoff, ctx.currentTime, 0.15);
    }

    // Reverb wet blooms with union; master swells warmly (compressor holds ceiling).
    if (this.reverb) this.reverb.setWet(0.15 + 0.55 * u);
    if (this.master) this.master.gain.setTargetAtTime(0.18 + 0.05 * easeIn, ctx.currentTime, 0.2);
  }

  /** RMS 0..1 off the analyser for the visual (never affects audio output). */
  level(): number {
    const a = this.analyser;
    if (!a) return 0;
    const buf = new Uint8Array(a.fftSize);
    a.getByteTimeDomainData(buf);
    let sum = 0;
    for (let i = 0; i < buf.length; i++) {
      const s = (buf[i] - 128) / 128;
      sum += s * s;
    }
    return Math.min(1, Math.sqrt(sum / buf.length) * 3.2);
  }

  async stop(): Promise<void> {
    const ctx = this.ctx;
    this.ok = false;
    if (!ctx) return;
    try {
      this.voices.forEach((v) => v.partials.forEach((o) => o.stop()));
    } catch {
      /* already stopped */
    }
    this.voices = [];
    try {
      await ctx.close();
    } catch {
      /* already closed */
    }
    this.ctx = null;
  }

  elapsed(): number {
    return this.ctx ? this.ctx.currentTime - this.startedAt : 0;
  }
}
