// Two clearly distinct 12-TET voices for the duet. No drone bed — every note is
// a short, self-decaying event so silence between phrases is real silence.
//
//   YOU      — a mellow triangle "mallet" with a second partial and a lowpass
//              that closes as the note decays.
//   DUETMIND — a brighter 2:1 FM voice (sine carrier, sine modulator) with a
//              falling modulation index, so it reads as a different instrument.

export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export interface DuetSynth {
  playHuman(midi: number, when: number, dur: number): void;
  playAgent(midi: number, when: number, dur: number): void;
  dispose(): void;
}

export function createDuet(ctx: AudioContext): DuetSynth {
  const master = ctx.createGain();
  master.gain.value = 0.82;
  const hp = ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 85;
  hp.connect(master);
  master.connect(ctx.destination);
  const bus = hp;

  function envelope(
    g: GainNode,
    when: number,
    dur: number,
    peak: number,
    attack: number,
  ): void {
    const t = Math.max(when, ctx.currentTime);
    g.gain.cancelScheduledValues(t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(attack + 0.03, dur));
  }

  function playHuman(midi: number, when: number, dur: number): void {
    const t = Math.max(when, ctx.currentTime + 0.0005);
    const f = midiToFreq(midi);
    const d = Math.min(Math.max(dur, 0.12), 0.6);

    const o = ctx.createOscillator();
    o.type = "triangle";
    o.frequency.value = f;
    const o2 = ctx.createOscillator();
    o2.type = "sine";
    o2.frequency.value = f * 2.004;
    const partial = ctx.createGain();
    partial.gain.value = 0.22;

    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(2800, t);
    lp.frequency.exponentialRampToValueAtTime(820, t + d);

    const g = ctx.createGain();
    o.connect(g);
    o2.connect(partial);
    partial.connect(g);
    g.connect(lp);
    lp.connect(bus);

    envelope(g, t, d + 0.16, 0.5, 0.006);
    const end = t + d + 0.28;
    o.start(t);
    o2.start(t);
    o.stop(end);
    o2.stop(end);
  }

  function playAgent(midi: number, when: number, dur: number): void {
    const t = Math.max(when, ctx.currentTime + 0.0005);
    const f = midiToFreq(midi);
    const d = Math.min(Math.max(dur, 0.12), 0.6);

    const car = ctx.createOscillator();
    car.type = "sine";
    car.frequency.value = f;
    const mod = ctx.createOscillator();
    mod.type = "sine";
    mod.frequency.value = f * 2;
    const modGain = ctx.createGain();
    modGain.gain.setValueAtTime(f * 3.2, t);
    modGain.gain.exponentialRampToValueAtTime(f * 0.35, t + d);
    mod.connect(modGain);
    modGain.connect(car.frequency);

    const g = ctx.createGain();
    car.connect(g);
    g.connect(bus);

    envelope(g, t, d + 0.2, 0.38, 0.004);
    const end = t + d + 0.3;
    car.start(t);
    mod.start(t);
    car.stop(end);
    mod.stop(end);
  }

  function dispose(): void {
    try {
      master.disconnect();
    } catch {
      // already gone
    }
  }

  return { playHuman, playAgent, dispose };
}
