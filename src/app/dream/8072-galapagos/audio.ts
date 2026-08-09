// ─────────────────────────────────────────────────────────────────────────────
// 8072-galapagos · audio.ts
//
// The population IS a chord. Each organism's genome projects to a gentle 2-op FM
// voice (see genome.ts · readVoice) that pulses on its own ostinato. Selected
// organisms sing louder; the whole grid breathes as a soft consonant bed over a
// shared just-intonation drone.
//
// Voice budget: 9 organisms × (carrier + modulator) = 18 oscillators, + the
// shared drone bank. Bounded and calm by design.
//
// Determinism: no randomness or wall-clock here. All timing comes from the
// AudioContext clock; the pulse envelope is a pure function of (rhythmHz, duty, t)
// so page.tsx can reuse the SAME formula to drive the visual breathing.
// ─────────────────────────────────────────────────────────────────────────────

import { readVoice, type Genome } from "./genome";
import { startDroneBank, type DroneBank } from "../_shared/visionary/droneBank";

/**
 * The per-voice pulse envelope — a raised-cosine hump over the first `duty`
 * fraction of each ostinato cycle, on a small floor so the chord never fully
 * dies. Pure: same inputs → same output, whatever clock you feed it.
 */
export function voiceEnvelope(rhythmHz: number, duty: number, tSec: number): number {
  const phase = (((tSec * rhythmHz) % 1) + 1) % 1;
  let e = 0;
  if (phase < duty) {
    const p = phase / duty; // 0..1 across the "on" window
    e = 0.5 - 0.5 * Math.cos(p * 2 * Math.PI); // smooth hump
  }
  return 0.12 + 0.88 * e;
}

interface Voice {
  carrier: OscillatorNode;
  mod: OscillatorNode;
  modGain: GainNode;
  gain: GainNode;
  rhythmHz: number;
  duty: number;
  base: number; // resting level for this voice
}

const ROOT = 110; // A2 — organism fundamentals ride a JI scale above this

export class GalapagosAudio {
  private ctx: AudioContext;
  private master: GainNode;
  private comp: DynamicsCompressorNode;
  private drone: DroneBank | null = null;
  private voices: Voice[] = [];

  constructor(ctx: AudioContext) {
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.85;
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -18;
    this.comp.ratio.value = 3.5;
    this.master.connect(this.comp).connect(ctx.destination);

    try {
      this.drone = startDroneBank(ctx, this.master, { root: 55, peakGain: 0.18 });
      this.drone.setDrive(0.28);
    } catch {
      this.drone = null;
    }
  }

  /** Rebuild every voice from a new population (called on breed). */
  setPopulation(genomes: Genome[]): void {
    this.teardownVoices();
    const now = this.ctx.currentTime;
    for (const g of genomes) {
      const v = readVoice(g, ROOT);
      const carrier = this.ctx.createOscillator();
      carrier.type = v.timbre;
      carrier.frequency.value = v.freq;
      const mod = this.ctx.createOscillator();
      mod.type = "sine";
      mod.frequency.value = v.freq * v.modRatio;
      const modGain = this.ctx.createGain();
      modGain.gain.value = v.modIndex;
      const gain = this.ctx.createGain();
      gain.gain.value = 0.0001;

      mod.connect(modGain).connect(carrier.frequency);
      carrier.connect(gain).connect(this.master);
      carrier.start(now);
      mod.start(now);

      this.voices.push({
        carrier,
        mod,
        modGain,
        gain,
        rhythmHz: v.rhythmHz,
        duty: v.duty,
        base: 0.05,
      });
    }
  }

  /** Reuse the exact pulse the audio hears — page.tsx drives visual breathing with this. */
  envelopeAt(i: number, tSec: number): number {
    const v = this.voices[i];
    if (!v) return 0.5;
    return voiceEnvelope(v.rhythmHz, v.duty, tSec);
  }

  /** Per-frame: pulse each voice; selected organisms sing louder. */
  tick(selected: Set<number>): void {
    const now = this.ctx.currentTime;
    for (let i = 0; i < this.voices.length; i++) {
      const v = this.voices[i];
      const env = voiceEnvelope(v.rhythmHz, v.duty, now);
      const emphasis = selected.has(i) ? 1.9 : selected.size > 0 ? 0.55 : 1.0;
      const target = v.base * env * emphasis;
      v.gain.gain.setTargetAtTime(target, now, 0.06);
    }
  }

  now(): number {
    return this.ctx.currentTime;
  }

  private teardownVoices(): void {
    const now = this.ctx.currentTime;
    for (const v of this.voices) {
      try {
        v.gain.gain.cancelScheduledValues(now);
        v.gain.gain.setTargetAtTime(0.0001, now, 0.04);
        v.carrier.stop(now + 0.25);
        v.mod.stop(now + 0.25);
      } catch {
        /* already stopped */
      }
    }
    this.voices = [];
  }

  dispose(): void {
    this.teardownVoices();
    try {
      this.drone?.stop();
    } catch {
      /* noop */
    }
    try {
      this.master.disconnect();
      this.comp.disconnect();
    } catch {
      /* noop */
    }
  }
}
