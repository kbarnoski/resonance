// ─────────────────────────────────────────────────────────────────────────────
// audio.ts — the sonification of the crack web. Every crack BIRTH strikes a
// soft plucked/struck note; every crack DEATH-collision emits a quieter, damped
// chord-tone. Pitch is drawn from a fixed LYDIAN mode over three octaves,
// indexed by the crack's heading angle; register (octave) is chosen by the
// crack's generation depth — seed cracks ring low, deep descendants ring high.
// A slow sub-bass drone pad sits underneath for depth. Polyphony is bounded
// (voice-steal past 12) and strikes are rate-limited, so the piece stays
// meditative rather than mechanical.
//
// Everything routes into the shared ear-safety master bus.
// ─────────────────────────────────────────────────────────────────────────────

import { createSafeMaster, type SafeMaster } from "../_shared/visionary/safeMaster";

const ROOT = 110; // A2
const LYDIAN = [0, 2, 4, 6, 7, 9, 11]; // semitone offsets
const MAX_VOICES = 12;
const MIN_STRIKE_GAP = 0.045; // seconds — gentle rate limit

interface Voice {
  osc: OscillatorNode;
  gain: GainNode;
  startedAt: number;
}

function pickAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AC =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!AC) return null;
  try {
    return new AC();
  } catch {
    return null;
  }
}

export class CrackSynth {
  readonly ok: boolean;
  private ctx: AudioContext | null;
  private master: SafeMaster | null = null;
  private voices: Voice[] = [];
  private droneOscs: OscillatorNode[] = [];
  private lastStrike = 0;
  private started = false;

  constructor() {
    this.ctx = pickAudioContext();
    this.ok = this.ctx !== null;
    if (this.ctx) {
      try {
        this.master = createSafeMaster(this.ctx, { gain: 0.8 });
      } catch {
        this.master = null;
      }
    }
  }

  get running(): boolean {
    return this.ctx?.state === "running";
  }

  /** Resume the context (needs a user gesture) and start the drone pad. */
  async resume(): Promise<void> {
    if (!this.ctx) return;
    try {
      await this.ctx.resume();
    } catch {
      /* ignore */
    }
    if (!this.started && this.master && this.ctx.state === "running") {
      this.startDrone();
      this.started = true;
    }
  }

  /** A crack birth (struck note) or death (damped tone). */
  strike(gen: number, angleDeg: number, isDeath: boolean): void {
    if (!this.ctx || !this.master || this.ctx.state !== "running") return;
    const now = this.ctx.currentTime;
    if (now - this.lastStrike < MIN_STRIKE_GAP) return;
    this.lastStrike = now;

    const norm = ((angleDeg % 360) + 360) % 360;
    const degree = LYDIAN[Math.min(6, (norm / 360) * 7) | 0];
    const oct = gen <= 1 ? 0 : gen <= 3 ? 1 : 2;
    let freq = ROOT * Math.pow(2, oct) * Math.pow(2, degree / 12);
    if (isDeath) freq *= 0.5; // death tones drop an octave, softer & lower

    const osc = this.ctx.createOscillator();
    osc.type = isDeath ? "sine" : "triangle";
    osc.frequency.value = freq;
    osc.detune.value = (Math.random() * 2 - 1) * 4;

    const lp = this.ctx.createBiquadFilter();
    lp.type = "lowpass";
    // filter opens with register — high descendants ring brighter
    lp.frequency.value = 320 + oct * 700 + (isDeath ? 0 : 520);
    lp.Q.value = 0.6;

    const g = this.ctx.createGain();
    const peak = isDeath ? 0.05 : 0.1;
    const atk = 0.006;
    const dec = isDeath ? 2.2 : 1.0;
    g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(peak, now + atk);
    g.gain.exponentialRampToValueAtTime(0.0008, now + atk + dec);

    osc.connect(lp);
    lp.connect(g);
    g.connect(this.master.input);

    const endAt = now + atk + dec + 0.05;
    osc.start(now);
    osc.stop(endAt);

    const voice: Voice = { osc, gain: g, startedAt: now };
    osc.onended = () => {
      const i = this.voices.indexOf(voice);
      if (i >= 0) this.voices.splice(i, 1);
      try {
        g.disconnect();
        lp.disconnect();
        osc.disconnect();
      } catch {
        /* closing */
      }
    };
    this.voices.push(voice);

    if (this.voices.length > MAX_VOICES) this.stealOldest(now);
  }

  dispose(): void {
    for (const v of this.voices) {
      try {
        v.osc.stop();
      } catch {
        /* already stopped */
      }
    }
    this.voices = [];
    for (const o of this.droneOscs) {
      try {
        o.stop();
      } catch {
        /* already stopped */
      }
    }
    this.droneOscs = [];
    this.master?.disconnect();
    if (this.ctx && this.ctx.state !== "closed") {
      this.ctx.close().catch(() => {});
    }
    this.ctx = null;
  }

  private stealOldest(now: number): void {
    let oldest = this.voices[0];
    for (const v of this.voices) if (v.startedAt < oldest.startedAt) oldest = v;
    try {
      oldest.gain.gain.cancelScheduledValues(now);
      oldest.gain.gain.setTargetAtTime(0.0001, now, 0.03);
      oldest.osc.stop(now + 0.12);
    } catch {
      /* ignore */
    }
  }

  private startDrone(): void {
    if (!this.ctx || !this.master) return;
    const now = this.ctx.currentTime;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(0.06, now + 6);

    const lp = this.ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 220;
    g.connect(lp);
    lp.connect(this.master.input);

    // root + fifth, slightly detuned pair each, breathing beneath the web
    const freqs = [ROOT / 4, (ROOT / 4) * Math.pow(2, 7 / 12)];
    for (const f of freqs) {
      for (const det of [-3, 3]) {
        const o = this.ctx.createOscillator();
        o.type = "sine";
        o.frequency.value = f;
        o.detune.value = det;
        o.connect(g);
        o.start(now);
        this.droneOscs.push(o);
      }
    }
  }
}
