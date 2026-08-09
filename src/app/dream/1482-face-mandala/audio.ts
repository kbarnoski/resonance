// audio.ts — the affect-coupled voice of the mandala (Web Audio).
//
// Aesthetic: cosmic, peaceful, meditative — an ambient "heaven" pad with
// deep reverb and slow evolving layers, in the lineage of Max Richter's
// held-string washes. Nothing is percussive or buzzy; everything breathes.
//
// Signal path:
//   pad voices (extended chord) → panner → warm lowpass → level → breath swell
//        → reverb bus ─┬─ dry  → master ─┐
//                      └─ convolver → dark-hall damp → wet → master ─┴─ limiter → out
//   soft glass chimes → reverb bus (drenched)
//
// The chord is an open, suspended voicing over a G pedal — pedal bass, the
// 5th and 9th for air, a quiet major 3rd + 6th for color, high 5th/9th for
// shimmer. Suspension over resolution; color over function.
//
//   jawOpen      → gently opens the lowpass and swells the whole pad.
//   smile        → brings the warm color tones (3rd, 6th) up.
//   browInnerUp  → brings the high shimmer tones in.
//   browDown     → darkens (pulls the lowpass down).
//   pucker       → focuses (narrows the filter toward the fundamental).
//   blink        → a soft glass chime, tuned to the chord, drenched in reverb.
//
// Voice safety: chimes are pooled and capped; oldest is stolen past the cap.

const MAX_BELLS = 8;

type Tier = "pedal" | "core" | "color" | "shimmer";

interface VoiceSpec {
  r: number; // frequency ratio over baseHz
  tier: Tier;
  wave: OscillatorType;
  pan: number;
}

// An open, suspended voicing over the G pedal. Just-intoned ratios for warmth.
const VOICES: VoiceSpec[] = [
  { r: 0.5, tier: "pedal", wave: "triangle", pan: 0 }, // G1 sub
  { r: 1.0, tier: "pedal", wave: "triangle", pan: 0 }, // G2
  { r: 1.5, tier: "core", wave: "triangle", pan: -0.18 }, // D3 (5th)
  { r: 2.0, tier: "core", wave: "triangle", pan: 0.18 }, // G3 (oct)
  { r: 2.25, tier: "core", wave: "sine", pan: -0.1 }, // A3 (9th)
  { r: 2.5, tier: "color", wave: "sine", pan: 0.28 }, // B3 (maj 3rd)
  { r: 3.0, tier: "core", wave: "sine", pan: -0.28 }, // D4 (5th up)
  { r: 10 / 3, tier: "color", wave: "sine", pan: 0.22 }, // E4 (6th/13th)
  { r: 4.5, tier: "shimmer", wave: "sine", pan: -0.38 }, // A4 (9th up)
  { r: 6.0, tier: "shimmer", wave: "sine", pan: 0.38 }, // D5 shimmer
];

// Chord tones for the glass chimes (higher partials of the pad).
const BELL_RATIOS = [2, 2.25, 3, 10 / 3, 4.5, 6];

interface Voice {
  osc: OscillatorNode;
  gain: GainNode;
  tier: Tier;
}

interface Bell {
  osc: OscillatorNode;
  partial: OscillatorNode;
  gain: GainNode;
}

export class FaceAudio {
  private ctx: AudioContext;
  private master: GainNode;
  private limiter: DynamicsCompressorNode;

  // reverb + sends
  private convolver: ConvolverNode;
  private wetGain: GainNode;
  private dryGain: GainNode;
  private reverbBus: GainNode;

  // pad chain
  private droneFilter: BiquadFilterNode;
  private droneLevel: GainNode;
  private breathGain: GainNode;
  private voices: Voice[] = [];

  // slow modulators
  private breathLFO: OscillatorNode;
  private breathDepth: GainNode;
  private driftLFO: OscillatorNode;
  private driftDepth: GainNode;

  private bells: Bell[] = [];
  private disposed = false;
  private baseHz = 98; // G2

  constructor(ctx: AudioContext) {
    this.ctx = ctx;
    const now = ctx.currentTime;

    // --- output: gentle limiter, slow fade-in ---
    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -14;
    this.limiter.knee.value = 22;
    this.limiter.ratio.value = 3;
    this.limiter.attack.value = 0.01;
    this.limiter.release.value = 0.4;
    this.limiter.connect(ctx.destination);

    this.master = ctx.createGain();
    this.master.gain.setValueAtTime(0.0001, now);
    this.master.gain.exponentialRampToValueAtTime(0.24, now + 3.6);
    this.master.connect(this.limiter);

    // --- deep, dark reverb (algorithmic hall IR) ---
    this.convolver = ctx.createConvolver();
    this.convolver.buffer = this.makeIR(5.2, 3.6);

    const wetDamp = ctx.createBiquadFilter();
    wetDamp.type = "lowpass";
    wetDamp.frequency.value = 3600; // soft, dark hall — no fizz
    wetDamp.Q.value = 0.5;

    this.wetGain = ctx.createGain();
    this.wetGain.gain.value = 0.95; // mostly wet — depth
    this.dryGain = ctx.createGain();
    this.dryGain.gain.value = 0.4;

    this.reverbBus = ctx.createGain();
    this.reverbBus.gain.value = 1;
    this.reverbBus.connect(this.dryGain);
    this.reverbBus.connect(this.convolver);
    this.convolver.connect(wetDamp);
    wetDamp.connect(this.wetGain);
    this.dryGain.connect(this.master);
    this.wetGain.connect(this.master);

    // --- pad chain: voices → filter → level → breath → reverb bus ---
    this.breathGain = ctx.createGain();
    this.breathGain.gain.value = 0.78; // breath LFO adds +/-
    this.breathGain.connect(this.reverbBus);

    this.droneLevel = ctx.createGain();
    this.droneLevel.gain.value = 0.5;
    this.droneLevel.connect(this.breathGain);

    this.droneFilter = ctx.createBiquadFilter();
    this.droneFilter.type = "lowpass";
    this.droneFilter.frequency.value = 500;
    this.droneFilter.Q.value = 0.6;
    this.droneFilter.connect(this.droneLevel);

    // slow drift for a living chorus (a few cents of shared detune motion)
    this.driftLFO = ctx.createOscillator();
    this.driftLFO.type = "sine";
    this.driftLFO.frequency.value = 0.06; // ~16s
    this.driftDepth = ctx.createGain();
    this.driftDepth.gain.value = 5; // cents
    this.driftLFO.connect(this.driftDepth);
    this.driftLFO.start(now);

    VOICES.forEach((spec, i) => {
      const osc = ctx.createOscillator();
      osc.type = spec.wave;
      osc.frequency.value = this.baseHz * spec.r;
      osc.detune.value = (i - VOICES.length / 2) * 3; // static chorus spread
      this.driftDepth.connect(osc.detune); // shared slow drift

      const gain = ctx.createGain();
      gain.gain.value = this.baseGainFor(spec.tier);

      const panner = ctx.createStereoPanner();
      panner.pan.value = spec.pan;

      osc.connect(gain);
      gain.connect(panner);
      panner.connect(this.droneFilter);
      osc.start(now);

      this.voices.push({ osc, gain, tier: spec.tier });
    });

    // slow tidal breath over the whole pad
    this.breathLFO = ctx.createOscillator();
    this.breathLFO.type = "sine";
    this.breathLFO.frequency.value = 0.05; // ~20s
    this.breathDepth = ctx.createGain();
    this.breathDepth.gain.value = 0.2;
    this.breathLFO.connect(this.breathDepth);
    this.breathDepth.connect(this.breathGain.gain);
    this.breathLFO.start(now);
  }

  private baseGainFor(tier: Tier): number {
    switch (tier) {
      case "pedal":
        return 0.42;
      case "core":
        return 0.26;
      case "color":
        return 0.05; // smile lifts these
      case "shimmer":
        return 0.02; // brow lifts these
    }
  }

  /** A smooth noise-decay stereo impulse for a soft, deep hall. */
  private makeIR(seconds: number, decay: number): AudioBuffer {
    const rate = this.ctx.sampleRate;
    const len = Math.max(1, Math.floor(rate * seconds));
    const buf = this.ctx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const data = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        const x = i / len;
        // quick smooth build, long exponential tail
        const env = (1 - Math.exp(-x * 40)) * Math.pow(1 - x, decay);
        data[i] = (Math.random() * 2 - 1) * env;
      }
    }
    return buf;
  }

  /** Feed the smoothed facial-affect drive each frame. */
  update(
    jaw: number,
    smile: number,
    brow: number,
    browDown: number,
    pucker: number,
    presence: number,
  ): void {
    if (this.disposed) return;
    const now = this.ctx.currentTime;
    const t = 0.5; // slow, meditative — never abrupt

    // warm, capped lowpass so it never turns buzzy
    const cutoff =
      420 + jaw * 1500 * (1 - browDown * 0.4) - pucker * 260 + smile * 700;
    this.droneFilter.frequency.setTargetAtTime(
      Math.min(3400, Math.max(300, cutoff)),
      now,
      t,
    );
    this.droneFilter.Q.setTargetAtTime(0.5 + pucker * 2, now, t);

    // gentle swell with jaw + presence
    const lvl = (0.5 + jaw * 0.35 + presence * 0.15) * (0.6 + presence * 0.4);
    this.droneLevel.gain.setTargetAtTime(lvl, now, t);

    // color tones bloom with a smile; shimmer with the brows
    this.voices.forEach((v) => {
      let g: number | null = null;
      if (v.tier === "color") g = 0.05 + smile * 0.18;
      else if (v.tier === "shimmer") g = 0.02 + brow * 0.14;
      if (g !== null) v.gain.gain.setTargetAtTime(g, now, t);
    });
  }

  /** A soft glass chime, tuned to the chord and drenched in reverb. */
  strike(intensity: number): void {
    if (this.disposed) return;
    const now = this.ctx.currentTime;
    if (this.bells.length >= MAX_BELLS) {
      const oldest = this.bells.shift();
      if (oldest) this.stopBell(oldest, now);
    }
    const ratio = BELL_RATIOS[Math.floor(Math.random() * BELL_RATIOS.length)];
    const freq = this.baseHz * 2 * ratio; // up in the shimmer register

    const osc = this.ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = freq;

    // a quiet octave partial for a touch of glass — harmonic, not metallic
    const partial = this.ctx.createOscillator();
    partial.type = "sine";
    partial.frequency.value = freq * 2;

    const partialGain = this.ctx.createGain();
    partialGain.gain.value = 0.18;
    partial.connect(partialGain);

    const g = this.ctx.createGain();
    const peak = 0.035 + intensity * 0.06;
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(peak, now + 0.05); // soft attack
    g.gain.exponentialRampToValueAtTime(0.0001, now + 3.4); // long tail

    osc.connect(g);
    partialGain.connect(g);
    g.connect(this.reverbBus);
    osc.start(now);
    partial.start(now);
    osc.stop(now + 3.6);
    partial.stop(now + 3.6);

    const bell: Bell = { osc, partial, gain: g };
    osc.onended = () => {
      const idx = this.bells.indexOf(bell);
      if (idx >= 0) this.bells.splice(idx, 1);
      try {
        g.disconnect();
        partialGain.disconnect();
      } catch {
        /* already gone */
      }
    };
    this.bells.push(bell);
  }

  private stopBell(b: Bell, now: number): void {
    try {
      b.gain.gain.cancelScheduledValues(now);
      b.gain.gain.setTargetAtTime(0.0001, now, 0.3); // gentle, no click
      b.osc.stop(now + 0.9);
      b.partial.stop(now + 0.9);
    } catch {
      /* already stopped */
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    const now = this.ctx.currentTime;
    try {
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setTargetAtTime(0.0001, now, 0.4); // slow fade
    } catch {
      /* ignore */
    }
    const stop = (o: OscillatorNode, at: number) => {
      try {
        o.stop(at);
      } catch {
        /* ignore */
      }
    };
    this.voices.forEach((v) => stop(v.osc, now + 1.2));
    stop(this.breathLFO, now + 1.2);
    stop(this.driftLFO, now + 1.2);
    this.bells.forEach((b) => this.stopBell(b, now));
    this.bells = [];
    // close the context after the fade so tails don't click.
    window.setTimeout(() => {
      if (this.ctx.state !== "closed") this.ctx.close().catch(() => {});
    }, 1400);
  }
}

export async function makeAudio(ctx: AudioContext): Promise<FaceAudio> {
  if (ctx.state === "suspended") await ctx.resume();
  return new FaceAudio(ctx);
}
