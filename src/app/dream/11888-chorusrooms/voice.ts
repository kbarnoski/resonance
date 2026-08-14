// ─────────────────────────────────────────────────────────────────────────────
// 11888-chorusrooms · voice.ts — the local ensemble engine (one graph per tab).
//
//   This is the "synchronized local-engine" half of the model: this tab renders the
//   WHOLE room — self, peers, phantoms — as its own Web Audio voices, all locked to
//   the shared bar phase from room.ts. Nothing streams between tabs; only the small
//   state (pointer, liveness) crosses the BroadcastChannel, and the local engine
//   turns that state into synchronized sound.
//
//   Each participant is one voice: two lightly-detuned oscillators → a lowpass →
//   an amplitude envelope → a stereo panner → the SAFE MASTER (never the raw output).
//   The voice SOUNDS once per bar, exactly when the shared phase sweeps past its
//   canon slot — so many tabs weave a slow round. Your POINTER shapes only your own
//   voice's timbre and pan; peers shape theirs and send the numbers over. There is
//   no independent drone: silence between entries, continuity from the canon's
//   overlapping tails. Levels stay gentle; everything passes the master limiter.
// ─────────────────────────────────────────────────────────────────────────────

import { createSafeMaster, type SafeMaster } from "../_shared/visionary/safeMaster";
import { clamp } from "./prng";
import type { Participant } from "./types";

// A just-intoned pentatonic over two octaves — always consonant, whoever joins.
const ROOT = 130.81; // C3
const RATIOS = [1, 9 / 8, 5 / 4, 3 / 2, 5 / 3];
export const PITCH_COUNT = RATIOS.length * 2;

export function pitchHz(scaleIdx: number): number {
  const i = ((scaleIdx % PITCH_COUNT) + PITCH_COUNT) % PITCH_COUNT;
  const octave = Math.floor(i / RATIOS.length);
  return ROOT * RATIOS[i % RATIOS.length] * Math.pow(2, octave);
}

const MAX_VOICES = 9; // bound the graph no matter how many tabs open
const ATTACK = 0.5; // s — soft swell in
const RELEASE = 3.4; // s — long overlapping tail = the ensemble pad
const PEAK = 0.13; // per-voice ceiling before the shared limiter

interface Voice {
  oscA: OscillatorNode;
  oscB: OscillatorNode;
  filter: BiquadFilterNode;
  env: GainNode;
  pan: StereoPannerNode | null;
  lastCycle: number; // floor(continuousPhase - slot) — fires when this ticks up
}

export class Ensemble {
  readonly ctx: AudioContext;
  private readonly master: SafeMaster;
  private readonly voices = new Map<string, Voice>();
  private disposed = false;
  private level = 0;
  private readonly buf: Uint8Array;

  constructor() {
    const Ctor: typeof AudioContext =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new Ctor();
    this.master = createSafeMaster(this.ctx, { gain: 0.8 });
    this.buf = new Uint8Array(new ArrayBuffer(this.master.analyser.frequencyBinCount));
  }

  async resume(): Promise<void> {
    if (this.ctx.state !== "running") await this.ctx.resume();
  }

  private makeVoice(cycle: number): Voice {
    const ctx = this.ctx;
    const oscA = ctx.createOscillator();
    oscA.type = "triangle";
    const oscB = ctx.createOscillator();
    oscB.type = "sine";
    oscB.detune.value = 6; // gentle chorus warmth

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 1400;
    filter.Q.value = 0.8;

    const env = ctx.createGain();
    env.gain.value = 0.0001;

    let pan: StereoPannerNode | null = null;
    let tail: AudioNode = env;
    if (typeof ctx.createStereoPanner === "function") {
      pan = ctx.createStereoPanner();
      env.connect(pan);
      tail = pan;
    }

    oscA.connect(filter);
    oscB.connect(filter);
    filter.connect(env);
    tail.connect(this.master.input);
    oscA.start();
    oscB.start();

    return { oscA, oscB, filter, env, pan, lastCycle: cycle };
  }

  private fire(v: Voice, freq: number, presence: number): void {
    const now = this.ctx.currentTime;
    v.oscA.frequency.setValueAtTime(freq, now);
    v.oscB.frequency.setValueAtTime(freq, now);
    const peak = PEAK * (0.35 + 0.65 * presence);
    const g = v.env.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(Math.max(0.0001, g.value), now);
    g.linearRampToValueAtTime(peak, now + ATTACK);
    g.exponentialRampToValueAtTime(0.0001, now + ATTACK + RELEASE);
  }

  /** Sync voices to the participant list and trigger canon entries at `phase`. */
  update(participants: Participant[], phase: number, bar: number, now: number): void {
    if (this.disposed) return;
    const ctxNow = this.ctx.currentTime;
    const cont = bar + phase; // continuous shared phase

    // Trim to the loudest MAX_VOICES so the graph stays bounded.
    const list =
      participants.length <= MAX_VOICES
        ? participants
        : [...participants].sort((a, b) => b.presence - a.presence).slice(0, MAX_VOICES);
    const keep = new Set(list.map((p) => p.id));

    // Retire departed voices (fade, then stop next tick via disposal on absence).
    for (const [id, v] of this.voices) {
      if (!keep.has(id)) {
        try {
          v.env.gain.cancelScheduledValues(ctxNow);
          v.env.gain.setTargetAtTime(0.0001, ctxNow, 0.3);
          v.oscA.stop(ctxNow + 1.2);
          v.oscB.stop(ctxNow + 1.2);
        } catch {
          /* already stopped */
        }
        this.voices.delete(id);
      }
    }

    for (const p of list) {
      let v = this.voices.get(p.id);
      if (!v) {
        v = this.makeVoice(Math.floor(cont - p.slot));
        this.voices.set(p.id, v);
      }
      // Timbre + placement track the pointer, smoothed.
      const bright = 1 - p.py; // top of the room = brighter
      const cutoff = 480 + bright * 3400;
      v.filter.frequency.setTargetAtTime(cutoff, ctxNow, 0.12);
      if (v.pan) v.pan.pan.setTargetAtTime(clamp(p.px * 2 - 1, -1, 1), ctxNow, 0.12);

      // Canon entry: fire once each time the shared phase sweeps past this slot.
      const cycle = Math.floor(cont - p.slot);
      if (cycle > v.lastCycle) {
        v.lastCycle = cycle;
        this.fire(v, pitchHz(p.scaleIdx), p.presence);
      } else if (cycle < v.lastCycle) {
        v.lastCycle = cycle; // clock corrected backward — resync, don't retrigger
      }
    }

    // Read the tamed mix back for a soft global glow.
    this.master.analyser.getByteFrequencyData(this.buf as Uint8Array<ArrayBuffer>);
    let sum = 0;
    for (let i = 0; i < 48 && i < this.buf.length; i++) sum += this.buf[i];
    const rms = sum / (48 * 255);
    this.level += (rms - this.level) * 0.08;
    void now;
  }

  /** Smoothed ensemble level in [0,1] for the visuals. */
  getLevel(): number {
    return this.level;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const v of this.voices.values()) {
      try {
        v.oscA.stop();
        v.oscB.stop();
        v.oscA.disconnect();
        v.oscB.disconnect();
        v.filter.disconnect();
        v.env.disconnect();
        v.pan?.disconnect();
      } catch {
        /* already gone */
      }
    }
    this.voices.clear();
    this.master.disconnect();
    void this.ctx.close();
  }
}
