// audio.ts — additive sonification of the SOM.
//
// Every neuron's 12 band values become the gains of 12 partials over a low
// fundamental (C2 ≈ 65 Hz). So when a BMU fires during training you literally
// HEAR the timbre the map is filing away, and the texture settles as the sheet
// orders itself. Click a neuron → a longer sustain of the same additive voice.
//
// Ear safety: nothing touches ctx.destination directly — everything routes into
// createSafeMaster's input (high-shelf cut → lowpass cap → limiter). Polyphony
// is bounded (≤8 voices) with oldest-voice stealing.

import { createSafeMaster, type SafeMaster } from "../_shared/visionary/safeMaster";

const FUND = 65.41; // C2
const MAX_VOICES = 8;

interface Voice {
  gain: GainNode;
  oscs: OscillatorNode[];
  endsAt: number;
}

export class CortexAudio {
  readonly ctx: AudioContext;
  private master: SafeMaster;
  private voices: Voice[] = [];

  constructor(ctx: AudioContext) {
    this.ctx = ctx;
    this.master = createSafeMaster(ctx);
  }

  get running(): boolean {
    return this.ctx.state === "running";
  }

  async resume(): Promise<void> {
    if (this.ctx.state !== "running") await this.ctx.resume();
  }

  /**
   * Play a neuron's learned timbre.
   * @param w      12 band values (partial gains).
   * @param dur    total voice duration in seconds.
   * @param peak   peak level (kept low; the master limiter is the real ceiling).
   */
  trigger(w: Float32Array | number[], dur = 0.2, peak = 0.16): void {
    if (this.ctx.state !== "running") return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    // voice-stealing: cap polyphony, drop the oldest first
    if (this.voices.length >= MAX_VOICES) {
      const v = this.voices.shift();
      if (v) this.killVoice(v, now);
    }

    // normalise partial gains so dense timbres don't run hotter than sparse ones
    let sum = 0;
    for (let b = 0; b < w.length; b++) sum += w[b];
    const norm = sum > 0 ? 1 / sum : 0;

    const voiceGain = ctx.createGain();
    voiceGain.gain.value = 0;
    voiceGain.connect(this.master.input);

    const oscs: OscillatorNode[] = [];
    for (let b = 0; b < w.length; b++) {
      const g = w[b] * norm;
      if (g < 0.01) continue; // skip inaudible partials
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = FUND * (b + 1); // harmonic partial series
      const pg = ctx.createGain();
      pg.gain.value = g;
      osc.connect(pg);
      pg.connect(voiceGain);
      osc.start(now);
      oscs.push(osc);
    }

    // soft envelope: gentle attack, exponential-ish decay
    const attack = Math.min(0.04, dur * 0.25);
    const rel = now + dur;
    voiceGain.gain.setValueAtTime(0, now);
    voiceGain.gain.linearRampToValueAtTime(peak, now + attack);
    voiceGain.gain.setTargetAtTime(0.0001, now + attack, dur * 0.4);

    const voice: Voice = { gain: voiceGain, oscs, endsAt: rel + 0.1 };
    for (const o of oscs) o.stop(rel + 0.1);
    // teardown when the last osc ends
    const last = oscs[oscs.length - 1];
    if (last) {
      last.onended = () => {
        try {
          voiceGain.disconnect();
        } catch {
          /* closing */
        }
        this.voices = this.voices.filter((x) => x !== voice);
      };
    }
    this.voices.push(voice);
  }

  private killVoice(v: Voice, now: number): void {
    try {
      v.gain.gain.cancelScheduledValues(now);
      v.gain.gain.setTargetAtTime(0.0001, now, 0.03);
      for (const o of v.oscs) o.stop(now + 0.12);
    } catch {
      /* already stopped */
    }
  }

  dispose(): void {
    const now = this.ctx.currentTime;
    for (const v of this.voices) {
      try {
        for (const o of v.oscs) {
          o.onended = null;
          o.stop(now);
          o.disconnect();
        }
        v.gain.disconnect();
      } catch {
        /* already gone */
      }
    }
    this.voices = [];
    try {
      this.master.disconnect();
    } catch {
      /* closing */
    }
    if (this.ctx.state !== "closed") {
      this.ctx.close().catch(() => {});
    }
  }
}
