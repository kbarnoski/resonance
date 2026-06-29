// ─────────────────────────────────────────────────────────────────────────────
// audio.ts — the "listener" probe voices: consonant bells + a resting drone.
//
//   Each probe on the wave field samples local energy; when a ripple crests
//   under it the probe rings a short additive bell (sine partials with inharmonic
//   stretch + fast decay), tuned to a just-intonation pentatonic set, through a
//   shared reverb. A soft sustained drone sits underneath so idle = near silence
//   + faint warmth, and a strike blooms consonant tone. All Web Audio API; the
//   AudioContext must be resumed on a user gesture (Start / first touch).
// ─────────────────────────────────────────────────────────────────────────────

import { PENTA_RATIOS } from "./wave";

const BASE_HZ = 146.83; // ~D3 — warm, cosmic-ambient root

/** Build a short impulse-response convolver reverb without any asset. */
function makeReverb(ctx: AudioContext, seconds = 3.4): ConvolverNode {
  const rate = ctx.sampleRate;
  const len = Math.floor(rate * seconds);
  const buf = ctx.createBuffer(2, len, rate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      const t = i / len;
      // exponentially-decaying noise tail, gentle
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 2.6);
    }
  }
  const conv = ctx.createConvolver();
  conv.buffer = buf;
  return conv;
}

export class RippleAudio {
  readonly ctx: AudioContext;
  private master: GainNode;
  private dry: GainNode;
  private wet: GainNode;
  private reverb: ConvolverNode;
  private drone: GainNode;
  private droneOscs: OscillatorNode[] = [];
  private lastRing: number[] = [];
  private started = false;

  constructor() {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new Ctx();

    this.master = this.ctx.createGain();
    this.master.gain.value = 0.0; // fade in on start
    this.master.connect(this.ctx.destination);

    this.reverb = makeReverb(this.ctx);
    this.wet = this.ctx.createGain();
    this.wet.gain.value = 0.55;
    this.dry = this.ctx.createGain();
    this.dry.gain.value = 0.8;
    this.reverb.connect(this.wet).connect(this.master);
    this.dry.connect(this.master);

    // resting drone: two detuned sines + a fifth, very soft
    this.drone = this.ctx.createGain();
    this.drone.gain.value = 0.06;
    this.drone.connect(this.dry);
    this.drone.connect(this.reverb);
    for (const [mult, detune] of [
      [1, -4],
      [1, 5],
      [1.5, 0],
    ] as const) {
      const o = this.ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = BASE_HZ * mult * 0.5; // an octave down, sub-warm
      o.detune.value = detune;
      o.connect(this.drone);
      this.droneOscs.push(o);
    }
  }

  /** Resume + fade in. Call from a user gesture. */
  async start(): Promise<void> {
    if (this.ctx.state === "suspended") await this.ctx.resume();
    if (!this.started) {
      this.started = true;
      for (const o of this.droneOscs) o.start();
      const now = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setValueAtTime(this.master.gain.value, now);
      this.master.gain.linearRampToValueAtTime(0.9, now + 1.2);
    }
  }

  get running(): boolean {
    return this.started && this.ctx.state === "running";
  }

  /** Ring probe `idx` with brightness/loudness from `energy` (0..~1).
   *  Self-rate-limited so a sustained ripple pulses rather than screams. */
  ring(idx: number, ratioIdx: number, energy: number): void {
    if (!this.started) return;
    const now = this.ctx.currentTime;
    if ((this.lastRing[idx] ?? 0) > now - 0.14) return;
    const gain = Math.min(0.5, energy);
    if (gain < 0.02) return;
    this.lastRing[idx] = now;

    const ratio = PENTA_RATIOS[ratioIdx % PENTA_RATIOS.length];
    const f0 = BASE_HZ * ratio;
    const bell = this.ctx.createGain();
    bell.gain.value = 0;
    bell.connect(this.dry);
    bell.connect(this.reverb);

    // additive inharmonic bell partials
    const partials = [
      [1.0, 1.0],
      [2.01, 0.5],
      [2.99, 0.32],
      [4.2, 0.16],
      [5.43, 0.09],
    ] as const;
    const dur = 1.6 + energy * 1.2;
    for (const [pm, pg] of partials) {
      const o = this.ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = f0 * pm;
      const g = this.ctx.createGain();
      g.gain.value = 0;
      const peak = gain * pg;
      g.gain.setValueAtTime(0, now);
      g.gain.linearRampToValueAtTime(peak, now + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, now + dur * (0.5 + 0.5 / pm));
      o.connect(g).connect(bell);
      o.start(now);
      o.stop(now + dur + 0.1);
    }
    bell.gain.setValueAtTime(1, now);
    // free the bell node group after the tail
    window.setTimeout(() => {
      try {
        bell.disconnect();
      } catch {
        /* already gone */
      }
    }, (dur + 0.3) * 1000);
  }

  setReverb(amount: number): void {
    const now = this.ctx.currentTime;
    this.wet.gain.setTargetAtTime(0.2 + 0.7 * amount, now, 0.1);
  }

  /** Stop and release everything. */
  dispose(): void {
    try {
      const now = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.linearRampToValueAtTime(0, now + 0.15);
    } catch {
      /* ignore */
    }
    for (const o of this.droneOscs) {
      try {
        o.stop();
      } catch {
        /* not started */
      }
    }
    window.setTimeout(() => {
      this.ctx.close().catch(() => {
        /* ignore */
      });
    }, 220);
  }
}
