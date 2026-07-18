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
// that resonance and swell — a real consonant JI dyad you hear appear at the
// instant you see the lock arc.
//
// CYCLE-2 additions:
//   • CRYSTALLIZATION — a lock held ≥3.5 s deposits its exact interval as a
//     PERSISTENT sustained sine dyad into a chord stack (≤3 dyads = ≤6 tones,
//     drop-oldest when full). Each crystal decays over ~32 s unless re-captured,
//     so the composed chord honestly dies when nobody drives it.
//   • CONJUNCTION BELLS — a bright inharmonic transient when two planets cross
//     the same heliocentric sight-line (borrowed from the armillary sibling).
//
// Safety: master ≤ 0.17 → lowpass → compressor → destination. Bounded voice
// budget (2 star + 5 planet + ≤4 pings + ≤3 bells + ≤6 crystal tones). All
// param changes are ramped (no zipper/clicks). Full teardown on stop().

const ROOT = 65.41; // C2 — the star's fundamental
const MASTER_MAX = 0.17;
const MAX_PINGS = 4;
const MAX_BELLS = 3;
export const MAX_CRYSTALS = 3; // ≤3 sustained dyads = ≤6 crystallized tones
const CRYSTAL_PEAK = 0.034; // per-tone peak gain of a crystallized voice

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

interface Bell {
  oscs: OscillatorNode[];
  endsAt: number;
}

interface Crystal {
  id: string;
  oscs: OscillatorNode[];
  gains: GainNode[];
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
  private bells: Bell[] = [];
  private crystals: Crystal[] = [];
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
    // reap finished bells
    this.bells = this.bells.filter((b) => {
      if (b.endsAt < t) {
        for (const o of b.oscs) {
          try {
            o.stop();
          } catch {
            /* already stopped */
          }
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

  /** CYCLE-2: a bright, slightly inharmonic bell when two planets pass through
   *  conjunction. Two ringing partials give it the armillary-chime timbre. */
  bell(freq: number): void {
    if (!this.running || this.bells.length >= MAX_BELLS) return;
    const t = this.ctx.currentTime;
    const f = Math.max(120, Math.min(1900, freq));
    const oscs: OscillatorNode[] = [];
    // fundamental + a stretched partial (2.76 ≈ a real bell's hum→prime)
    for (const [mult, peak, dur] of [
      [1, 0.06, 1.7],
      [2.76, 0.024, 1.15],
    ] as const) {
      const o = this.ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = f * mult;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(peak, t + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(this.master);
      o.start(t);
      o.stop(t + dur + 0.05);
      oscs.push(o);
    }
    this.bells.push({ oscs, endsAt: t + 1.85 });
  }

  /** CYCLE-2: create (or refresh) a persistent crystallized dyad. Returns true
   *  when a brand-new crystal was born (for the visual etch-bloom). */
  crystallize(id: string, baseFreq: number, ratio: number): boolean {
    if (!this.running) return false;
    const existing = this.crystals.find((c) => c.id === id);
    if (existing) return false; // already sounding; page refreshes its life
    // drop the oldest when the stack is full
    if (this.crystals.length >= MAX_CRYSTALS) {
      const oldest = this.crystals.shift();
      if (oldest) this.stopCrystal(oldest);
    }
    const t = this.ctx.currentTime;
    const oscs: OscillatorNode[] = [];
    const gains: GainNode[] = [];
    for (const f of [baseFreq, baseFreq * ratio]) {
      const o = this.ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = f;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(CRYSTAL_PEAK, t + 1.4); // soft bloom-in
      o.connect(g).connect(this.master);
      o.start(t);
      oscs.push(o);
      gains.push(g);
    }
    this.crystals.push({ id, oscs, gains });
    return true;
  }

  /** Set a crystallized dyad's level (0..1 of peak) as its life decays. */
  setCrystalLevel(id: string, level: number): void {
    if (!this.running) return;
    const c = this.crystals.find((x) => x.id === id);
    if (!c) return;
    const t = this.ctx.currentTime;
    const target = Math.max(0.0001, CRYSTAL_PEAK * Math.max(0, Math.min(1, level)));
    for (const g of c.gains) g.gain.setTargetAtTime(target, t, 0.4);
  }

  /** CYCLE-3: retune a crystallized dyad's two tones to absolute frequencies.
   *  The page owns the adaptive-JI tuning math and pushes the solved freqs here;
   *  both oscillators glide (no zipper) so flipping strict↔adaptive is audible as
   *  the whole chord sliding in or out of lock against the fixed star drone. */
  setCrystalFreqs(id: string, fLow: number, fHigh: number): void {
    if (!this.running) return;
    const c = this.crystals.find((x) => x.id === id);
    if (!c || c.oscs.length < 2) return;
    const t = this.ctx.currentTime;
    c.oscs[0].frequency.setTargetAtTime(Math.max(20, fLow), t, 0.22);
    c.oscs[1].frequency.setTargetAtTime(Math.max(20, fHigh), t, 0.22);
  }

  /** Remove a fully-decayed crystallized dyad. */
  removeCrystal(id: string): void {
    const idx = this.crystals.findIndex((x) => x.id === id);
    if (idx < 0) return;
    const [c] = this.crystals.splice(idx, 1);
    this.stopCrystal(c);
  }

  private stopCrystal(c: Crystal): void {
    const t = this.ctx.currentTime;
    for (const g of c.gains) {
      try {
        g.gain.cancelScheduledValues(t);
        g.gain.setTargetAtTime(0.0001, t, 0.25);
      } catch {
        /* noop */
      }
    }
    for (const o of c.oscs) {
      try {
        o.stop(t + 0.9);
      } catch {
        /* noop */
      }
    }
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
      const groups: OscillatorNode[][] = [
        this.starOsc,
        this.planets.map((p) => p.osc),
        this.pings.map((p) => p.osc),
        this.bells.flatMap((b) => b.oscs),
        this.crystals.flatMap((c) => c.oscs),
      ];
      for (const grp of groups) {
        for (const o of grp) {
          try {
            o.stop();
          } catch {
            /* noop */
          }
        }
      }
      ctx.close().catch(() => {});
    };
    window.setTimeout(stopAll, 260);
  }
}
