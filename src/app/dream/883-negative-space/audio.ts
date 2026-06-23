// audio.ts — the WARM PAD that blooms in the gaps of your sound.
//
// Signal graph:
//   [N pad voices: 2 detuned osc each] ─┐
//   [sub drone osc] ────────────────────┼─► masterGain ─► reverb (Convolver)
//                                        │                    │
//                                        └────── dry ─────────┴─► limiter ─► dest
//
// The master gain is driven by (bloom level) * (1 - duck): more stillness raises
// it; any sound ducks it fast toward an always-on near-silent root. The mic is
// NEVER part of this graph — it is analysis only (see page.tsx / README).

const ROOT_HZ = 110; // A2 — warm low root.

// Gentle consonant stack (just-ish intonation) climbing toward a full warm chord.
// Each entry adds one more voice the longer you stay still. Order matters: it
// builds root → fifth → octave → third → ninth → high-fifth (a slow bloom).
const PARTIALS: ReadonlyArray<number> = [
  1, // root
  3 / 2, // fifth
  2, // octave
  5 / 2, // major third (octave up)
  3, // twelfth
  15 / 4, // major seventh-ish high color
];

interface Voice {
  oscA: OscillatorNode;
  oscB: OscillatorNode;
  gain: GainNode;
}

export class PadEngine {
  readonly ctx: AudioContext;
  private master: GainNode;
  private voices: Voice[] = [];
  private sub: { osc: OscillatorNode; gain: GainNode } | null = null;
  private started = false;

  constructor() {
    const Ctor: typeof AudioContext =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    this.ctx = new Ctor();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.0001;
  }

  /** Build & start all nodes. Must be called from a user gesture. */
  start() {
    if (this.started) return;
    this.started = true;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    // Reverb via a synthesized short impulse (no assets, no deps).
    const reverb = ctx.createConvolver();
    reverb.buffer = makeImpulse(ctx, 2.4, 2.6);
    const wet = ctx.createGain();
    wet.gain.value = 0.55;
    const dry = ctx.createGain();
    dry.gain.value = 0.7;

    // Limiter so the bloom is soft, never harsh.
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -10;
    limiter.knee.value = 18;
    limiter.ratio.value = 12;
    limiter.attack.value = 0.005;
    limiter.release.value = 0.25;

    this.master.connect(dry);
    this.master.connect(reverb);
    reverb.connect(wet);
    dry.connect(limiter);
    wet.connect(limiter);
    limiter.connect(ctx.destination);

    // Pad voices — each is two slightly detuned oscillators for warmth.
    PARTIALS.forEach((mult, i) => {
      const f = ROOT_HZ * mult;
      const gain = ctx.createGain();
      gain.gain.value = 0.0001;
      const oscA = ctx.createOscillator();
      const oscB = ctx.createOscillator();
      oscA.type = i < 2 ? "triangle" : "sine";
      oscB.type = "sine";
      oscA.frequency.value = f;
      oscB.frequency.value = f;
      oscA.detune.value = -6 - i;
      oscB.detune.value = 6 + i;
      oscA.connect(gain);
      oscB.connect(gain);
      gain.connect(this.master);
      oscA.start(now);
      oscB.start(now);
      this.voices.push({ oscA, oscB, gain });
    });

    // Soft sub drone — the "always-on near-silent root" so it's never dead.
    const subOsc = ctx.createOscillator();
    const subGain = ctx.createGain();
    subOsc.type = "sine";
    subOsc.frequency.value = ROOT_HZ / 2;
    subGain.gain.value = 0.0001;
    subOsc.connect(subGain);
    subGain.connect(this.master);
    subOsc.start(now);
    this.sub = { osc: subOsc, gain: subGain };
  }

  /** Drive the bloom. `bloom` 0..1 = how many voices are lit; `duck` 0..1. */
  update(bloom: number, duck: number) {
    if (!this.started) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const n = PARTIALS.length;

    // Master: a tiny always-on floor + bloom, all ducked hard by sound.
    const open = 1 - duck;
    const target = (0.012 + 0.16 * bloom) * open;
    this.master.gain.setTargetAtTime(Math.max(0.0008, target), t, 0.08);

    // Per-voice: voice i fully fades in as bloom passes i/n.
    for (let i = 0; i < n; i++) {
      const lit = clamp01((bloom - i / n) / (1 / n));
      // High partials sit quieter so the chord stays warm, not bright.
      const ceiling = i < 3 ? 0.9 : 0.5;
      const g = 0.0001 + lit * ceiling * 0.22;
      this.voices[i].gain.gain.setTargetAtTime(g, t, 0.6);
    }

    if (this.sub) {
      this.sub.gain.gain.setTargetAtTime(0.05 + 0.06 * bloom, t, 0.5);
    }
  }

  /** Slowly evolve the high partials so a full chord keeps breathing. */
  evolve(timeSec: number) {
    if (!this.started) return;
    const t = this.ctx.currentTime;
    for (let i = 2; i < this.voices.length; i++) {
      const drift = Math.sin(timeSec * 0.07 + i) * (2 + i);
      this.voices[i].oscA.detune.setTargetAtTime(-6 - i + drift, t, 1.5);
    }
  }

  async dispose() {
    try {
      const now = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setTargetAtTime(0.0001, now, 0.05);
      this.voices.forEach((v) => {
        try {
          v.oscA.stop(now + 0.2);
          v.oscB.stop(now + 0.2);
        } catch {
          /* already stopped */
        }
      });
      if (this.sub) {
        try {
          this.sub.osc.stop(now + 0.2);
        } catch {
          /* already stopped */
        }
      }
      await new Promise((r) => setTimeout(r, 240));
    } finally {
      try {
        await this.ctx.close();
      } catch {
        /* already closed */
      }
    }
  }
}

function makeImpulse(ctx: AudioContext, seconds: number, decay: number) {
  const rate = ctx.sampleRate;
  const len = Math.max(1, Math.floor(seconds * rate));
  const buf = ctx.createBuffer(2, len, rate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      const env = Math.pow(1 - i / len, decay);
      data[i] = (Math.random() * 2 - 1) * env;
    }
  }
  return buf;
}

function clamp01(x: number) {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}
