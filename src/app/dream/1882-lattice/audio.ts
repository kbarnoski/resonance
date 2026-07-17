// ════════════════════════════════════════════════════════════════════════════
// 1882-lattice — voice engine (Web Audio API, no npm deps)
//
// A small polyphonic synth built for JUST INTONATION: every voice is tuned to
// an exact frequency (base × ratio), so held nodes ring as beatless just chords.
// Pure 3/2 and 5/4 intervals produce no beating; wider lattice jumps stack into
// richer, tenser spectra — the consonance is audible, not just drawn.
//
// Signal path per voice:
//   3 harmonic partials (1×, 2×, 3×, gently detuned) → voice gain (ADSR)
//     → voice lowpass → shared DynamicsCompressor → master gain (≤0.18)
//       → destination
//
// The AudioContext is created only on a user gesture and fully torn down on
// unmount. Voices are pooled and reused.
// ════════════════════════════════════════════════════════════════════════════

export const BASE_FREQ = 261.63; // ~C4, the 1/1 tonic
const MASTER_GAIN = 0.18;
const VOICE_COUNT = 16;

const ATTACK = 0.045;
const RELEASE = 0.55;
const PEAK = 0.9; // pre-master per-voice peak

interface Voice {
  oscs: OscillatorNode[];
  gain: GainNode;
  lp: BiquadFilterNode;
  activeKey: number; // node index currently held, or -1
  freeAt: number; // ctx time when this voice becomes reusable
}

export class LatticeSynth {
  private ctx: AudioContext;
  private master: GainNode;
  private comp: DynamicsCompressorNode;
  private voices: Voice[] = [];
  private held = new Map<number, Voice>(); // node index → voice
  private drone: { oscs: OscillatorNode[]; gain: GainNode } | null = null;

  constructor() {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    this.ctx = new Ctor();

    this.master = this.ctx.createGain();
    this.master.gain.value = MASTER_GAIN;

    this.comp = this.ctx.createDynamicsCompressor();
    this.comp.threshold.value = -18;
    this.comp.knee.value = 24;
    this.comp.ratio.value = 3;
    this.comp.attack.value = 0.006;
    this.comp.release.value = 0.25;

    this.comp.connect(this.master);
    this.master.connect(this.ctx.destination);

    for (let i = 0; i < VOICE_COUNT; i++) {
      this.voices.push(this.buildVoice());
    }
  }

  resume() {
    if (this.ctx.state === "suspended") void this.ctx.resume();
  }

  private buildVoice(): Voice {
    const gain = this.ctx.createGain();
    gain.gain.value = 0;

    const lp = this.ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 2400;
    lp.Q.value = 0.6;

    gain.connect(lp);
    lp.connect(this.comp);

    // Three harmonic partials give a soft, organ-ish timbre. Slight detune on
    // the upper partials adds life without breaking just-intonation beating on
    // the fundamentals (the ear locks to the fundamental).
    const partials = [
      { mult: 1, level: 0.6, detune: 0, type: "sine" as OscillatorType },
      { mult: 2, level: 0.22, detune: 3, type: "sine" as OscillatorType },
      { mult: 3, level: 0.12, detune: -4, type: "triangle" as OscillatorType },
    ];
    const oscs: OscillatorNode[] = [];
    for (const p of partials) {
      const o = this.ctx.createOscillator();
      o.type = p.type;
      o.detune.value = p.detune;
      const pg = this.ctx.createGain();
      pg.gain.value = p.level;
      o.connect(pg);
      pg.connect(gain);
      o.start();
      // stash multiplier on the node for retuning
      (o as unknown as { _mult: number })._mult = p.mult;
      oscs.push(o);
    }
    return { oscs, gain, lp, activeKey: -1, freeAt: 0 };
  }

  private pickVoice(): Voice {
    const now = this.ctx.currentTime;
    // prefer a genuinely idle voice
    for (const v of this.voices) {
      if (v.activeKey === -1 && v.freeAt <= now) return v;
    }
    // else steal the oldest-to-free
    let best = this.voices[0];
    for (const v of this.voices) if (v.freeAt < best.freeAt) best = v;
    return best;
  }

  /** Start a node ringing at an exact just frequency. */
  noteOn(nodeIndex: number, freq: number) {
    if (this.held.has(nodeIndex)) return;
    const v = this.pickVoice();
    const now = this.ctx.currentTime;

    for (const o of v.oscs) {
      const mult = (o as unknown as { _mult: number })._mult;
      o.frequency.setValueAtTime(freq * mult, now);
    }
    // brighter lowpass for higher notes so top of the lattice stays present
    v.lp.frequency.setValueAtTime(
      Math.min(6000, 1400 + freq * 4),
      now,
    );
    v.gain.gain.cancelScheduledValues(now);
    v.gain.gain.setValueAtTime(v.gain.gain.value, now);
    v.gain.gain.linearRampToValueAtTime(PEAK, now + ATTACK);
    v.activeKey = nodeIndex;
    v.freeAt = Number.POSITIVE_INFINITY;
    this.held.set(nodeIndex, v);
  }

  /** Release a held node. */
  noteOff(nodeIndex: number) {
    const v = this.held.get(nodeIndex);
    if (!v) return;
    const now = this.ctx.currentTime;
    v.gain.gain.cancelScheduledValues(now);
    v.gain.gain.setValueAtTime(v.gain.gain.value, now);
    v.gain.gain.linearRampToValueAtTime(0, now + RELEASE);
    v.activeKey = -1;
    v.freeAt = now + RELEASE;
    this.held.delete(nodeIndex);
  }

  /** A faint tonic + fifth drone bed so silence isn't a dead screen. */
  startDrone() {
    if (this.drone) return;
    const now = this.ctx.currentTime;
    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    gain.gain.linearRampToValueAtTime(0.05, now + 3);
    const lp = this.ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 700;
    gain.connect(lp);
    lp.connect(this.comp);

    const freqs = [BASE_FREQ / 2, (BASE_FREQ / 2) * 1.5]; // tonic + pure fifth, low
    const oscs: OscillatorNode[] = [];
    for (const f of freqs) {
      const o = this.ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = f;
      const g = this.ctx.createGain();
      g.gain.value = 0.5;
      o.connect(g);
      g.connect(gain);
      o.start();
      oscs.push(o);
    }
    this.drone = { oscs, gain };
  }

  /** Master level, for the reduced-motion / mute affordance. */
  setMaster(level: number) {
    const now = this.ctx.currentTime;
    this.master.gain.linearRampToValueAtTime(level, now + 0.1);
  }

  /** Fully tear down: stop every oscillator and close the context. */
  dispose() {
    const now = this.ctx.currentTime;
    try {
      for (const v of this.voices) {
        v.gain.gain.cancelScheduledValues(now);
        v.gain.gain.setValueAtTime(0, now);
        for (const o of v.oscs) {
          try {
            o.stop(now + 0.05);
          } catch {
            /* already stopped */
          }
        }
      }
      if (this.drone) {
        for (const o of this.drone.oscs) {
          try {
            o.stop(now + 0.05);
          } catch {
            /* noop */
          }
        }
      }
    } finally {
      // give the ramps a moment, then close
      setTimeout(() => {
        void this.ctx.close();
      }, 120);
    }
  }
}
