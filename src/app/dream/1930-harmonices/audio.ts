// audio.ts — the just-intonation voice engine for 1930-harmonices.
//
// THESIS: the famous ESO orbital sonifications (TOI-178, TRAPPIST-1) all
// de-risk their resonant-planet chains down to a PENTATONIC scale — a pretty
// crutch that throws away the actual physics. But orbital resonance already IS
// just intonation: a 3:2 period ratio is a pure fifth, 2:1 an octave, 5:4 a
// pure major third. This engine plays the TRUE just-intonation the orbits give
// us, never a pentatonic or 12-TET fake.
//
// The star sounds a low drone at ROOT. Each planet is a voice whose pitch
// glides with its orbital period (shorter period → higher). When a pair CAPTURES
// into resonance, its two voices lock to the EXACT integer frequency ratio of
// that resonance (the deeper planet's pitch snapped to a just degree of the
// star's lattice, the other set to exactly p/q above it) and swell — a real
// consonant JI dyad you hear appear at the instant you see the lock arc.
//
// Safety: master ≤ 0.17 → lowpass → compressor → destination. Fixed voice
// budget (2 star + 5 planet oscillators + ≤4 capture pings = 11 < 12). All
// param changes are ramped (no zipper/clicks). Full teardown on stop().

const ROOT = 65.41; // C2 — the star's fundamental
const MASTER_MAX = 0.17;
const MAX_PINGS = 4;

/** Just-intonation degrees within one octave (pure integer ratios). */
const JI_DEGREES = [
  1, // unison
  16 / 15, // minor second
  9 / 8, // major second
  6 / 5, // minor third
  5 / 4, // major third
  4 / 3, // perfect fourth
  45 / 32, // tritone
  3 / 2, // perfect fifth
  8 / 5, // minor sixth
  5 / 3, // major sixth
  9 / 5, // minor seventh
  15 / 8, // major seventh
];

/** Snap an arbitrary frequency to the nearest just degree above ROOT. */
export function snapToJI(freq: number): number {
  let best = ROOT;
  let bestErr = Infinity;
  for (let oct = 0; oct <= 4; oct++) {
    const base = ROOT * Math.pow(2, oct);
    for (const d of JI_DEGREES) {
      const f = base * d;
      const err = Math.abs(Math.log2(f / freq));
      if (err < bestErr) {
        bestErr = err;
        best = f;
      }
    }
  }
  return best;
}

/** Continuous voice pitch from an orbital period (shorter → higher). */
export function glideFreqForPeriod(period: number): number {
  const T = Math.max(2.5, Math.min(20, period));
  return ROOT * (18 / T);
}

export interface VoiceState {
  freq: number;
  gain: number;
}

interface Ping {
  osc: OscillatorNode;
  gain: GainNode;
  endsAt: number;
}

export class OrreryVoices {
  private ctx: AudioContext;
  private master: GainNode;
  private lp: BiquadFilterNode;
  private comp: DynamicsCompressorNode;

  private starOsc: OscillatorNode[] = [];
  private starGain: GainNode;

  private planets: { osc: OscillatorNode; gain: GainNode }[] = [];
  private pings: Ping[] = [];
  private running = false;

  constructor(planetCount: number) {
    const Ctor: typeof AudioContext =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    this.ctx = new Ctor();

    this.comp = this.ctx.createDynamicsCompressor();
    this.comp.threshold.value = -16;
    this.comp.knee.value = 10;
    this.comp.ratio.value = 12;
    this.comp.attack.value = 0.005;
    this.comp.release.value = 0.3;
    this.comp.connect(this.ctx.destination);

    this.lp = this.ctx.createBiquadFilter();
    this.lp.type = "lowpass";
    this.lp.frequency.value = 2600;
    this.lp.Q.value = 0.4;
    this.lp.connect(this.comp);

    this.master = this.ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(this.lp);

    // star drone: fundamental + soft octave
    this.starGain = this.ctx.createGain();
    this.starGain.gain.value = 0.5;
    this.starGain.connect(this.master);
    for (const [ratio, level] of [
      [1, 0.6],
      [2, 0.18],
    ] as const) {
      const o = this.ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = ROOT * ratio;
      const g = this.ctx.createGain();
      g.gain.value = level;
      o.connect(g).connect(this.starGain);
      o.start();
      this.starOsc.push(o);
    }

    // planet voices
    for (let i = 0; i < planetCount; i++) {
      const o = this.ctx.createOscillator();
      o.type = "triangle";
      o.frequency.value = ROOT * 2;
      const g = this.ctx.createGain();
      g.gain.value = 0.0001;
      o.connect(g).connect(this.master);
      o.start();
      this.planets.push({ osc: o, gain: g });
    }
  }

  async start(): Promise<void> {
    if (this.running) return;
    await this.ctx.resume();
    this.running = true;
    // gentle master fade-in
    const t = this.ctx.currentTime;
    this.master.gain.setValueAtTime(0.0001, t);
    this.master.gain.exponentialRampToValueAtTime(MASTER_MAX, t + 1.2);
  }

  /** Per-frame update. `calm` 0..1 pulls everything toward the lone drone. */
  update(voices: VoiceState[], calm: number): void {
    if (!this.running) return;
    const t = this.ctx.currentTime;
    const tc = 0.09; // glide/ramp smoothing
    for (let i = 0; i < this.planets.length; i++) {
      const v = voices[i];
      if (!v) continue;
      // as calm rises, planets glide up toward the drone octave and fade out
      const droneF = ROOT * 2;
      const freq = v.freq * (1 - calm) + droneF * calm;
      const gain = v.gain * (1 - 0.85 * calm);
      this.planets[i].osc.frequency.setTargetAtTime(freq, t, tc);
      this.planets[i].gain.gain.setTargetAtTime(
        Math.max(0.0001, gain),
        t,
        tc,
      );
    }
    // drone swells as the piece dies
    this.starGain.gain.setTargetAtTime(0.5 + 0.4 * calm, t, 0.2);
    // reap finished pings
    this.pings = this.pings.filter((p) => {
      if (p.endsAt < t) {
        try {
          p.osc.stop();
        } catch {
          /* already stopped */
        }
        return false;
      }
      return true;
    });
  }

  /** A short bell transient at the instant a resonance captures. */
  ping(freq: number): void {
    if (!this.running || this.pings.length >= MAX_PINGS) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = "sine";
    o.frequency.value = freq * 2;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.09, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + 1.0);
    this.pings.push({ osc: o, gain: g, endsAt: t + 1.0 });
  }

  stop(): void {
    this.running = false;
    const t = this.ctx.currentTime;
    try {
      this.master.gain.cancelScheduledValues(t);
      this.master.gain.setTargetAtTime(0.0001, t, 0.1);
    } catch {
      /* noop */
    }
    const ctx = this.ctx;
    const stopAll = () => {
      for (const o of this.starOsc) {
        try {
          o.stop();
        } catch {
          /* noop */
        }
      }
      for (const p of this.planets) {
        try {
          p.osc.stop();
        } catch {
          /* noop */
        }
      }
      for (const p of this.pings) {
        try {
          p.osc.stop();
        } catch {
          /* noop */
        }
      }
      ctx.close().catch(() => {});
    };
    window.setTimeout(stopAll, 260);
  }
}
