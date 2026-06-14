// audio.ts — warm, kid-safe Web Audio engine for "Move the Sun"
// Master chain for EVERY voice: source -> master gain -> lowpass (<=8kHz) -> compressor/limiter -> destination.
// Chime stones are tuned to JUST INTONATION over a low warm root (NOT C-major pentatonic).

// Just-intonation ratios over the root — a warm major / Lydian-leaning set:
// 1/1, 9/8, 5/4, 11/8 (soft Lydian #4), 3/2, 5/3, 15/8, 2/1, 9/4
export const JI_RATIOS = [
  1 / 1,
  9 / 8,
  5 / 4,
  11 / 8,
  3 / 2,
  5 / 3,
  15 / 8,
  2 / 1,
  9 / 4,
];

const ROOT_HZ = 146.83; // D3-ish warm root

export interface Engine {
  ctx: AudioContext;
  master: GainNode;
  // a slowly evolving warm pad so it's never silent
  setDusk: (amount01: number) => void;
  // ring a tuned chime
  strike: (noteIndex: number, velocity: number, brightness01: number) => void;
}

export function makeEngine(): Engine {
  const Ctor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctor();

  // ---- master kid-safe chain ----
  const master = ctx.createGain();
  master.gain.value = 0.0001;
  master.gain.linearRampToValueAtTime(0.7, ctx.currentTime + 1.2);

  const lowpass = ctx.createBiquadFilter();
  lowpass.type = "lowpass";
  lowpass.frequency.value = 7000; // <= 8kHz, no harsh ring
  lowpass.Q.value = 0.5;

  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -16;
  comp.knee.value = 24;
  comp.ratio.value = 12;
  comp.attack.value = 0.003;
  comp.release.value = 0.25;

  master.connect(lowpass);
  lowpass.connect(comp);
  comp.connect(ctx.destination);

  // ---- ambient pad (two detuned saws through a gentle filter) ----
  const padGain = ctx.createGain();
  padGain.gain.value = 0.08;
  const padFilter = ctx.createBiquadFilter();
  padFilter.type = "lowpass";
  padFilter.frequency.value = 600;
  padFilter.Q.value = 0.4;
  padGain.connect(padFilter);
  padFilter.connect(master);

  const padFreqs = [ROOT_HZ * 0.5, ROOT_HZ * 0.5 * (3 / 2), ROOT_HZ * 0.5 * (5 / 4)];
  padFreqs.forEach((f, i) => {
    const o = ctx.createOscillator();
    o.type = "triangle";
    o.frequency.value = f;
    o.detune.value = (i - 1) * 4;
    const g = ctx.createGain();
    g.gain.value = i === 0 ? 0.6 : 0.35;
    o.connect(g);
    g.connect(padGain);
    o.start();
    // slow LFO breathing on the pad gain
    const lfo = ctx.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = 0.05 + i * 0.013;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.12;
    lfo.connect(lfoGain);
    lfoGain.connect(g.gain);
    lfo.start();
  });

  function setDusk(amount01: number) {
    const a = Math.max(0, Math.min(1, amount01));
    // deepen + open the pad slightly at dusk for warmth
    const now = ctx.currentTime;
    padFilter.frequency.setTargetAtTime(500 + a * 700, now, 0.5);
    padGain.gain.setTargetAtTime(0.07 + a * 0.06, now, 0.5);
  }

  function strike(noteIndex: number, velocity: number, brightness01: number) {
    const ratio = JI_RATIOS[((noteIndex % JI_RATIOS.length) + JI_RATIOS.length) % JI_RATIOS.length];
    const freq = ROOT_HZ * ratio;
    const now = ctx.currentTime;
    const vel = Math.max(0.05, Math.min(1, velocity));

    // warm bell-ish voice: fundamental (sine) + soft body (triangle) + a gentle 5th
    const voiceGain = ctx.createGain();
    const peak = 0.12 * vel;
    voiceGain.gain.setValueAtTime(0.0001, now);
    voiceGain.gain.exponentialRampToValueAtTime(peak, now + 0.012);
    voiceGain.gain.exponentialRampToValueAtTime(0.0001, now + 1.8);

    // per-strike softening filter, brighter when the sun is high
    const vFilter = ctx.createBiquadFilter();
    vFilter.type = "lowpass";
    vFilter.frequency.value = 1400 + brightness01 * 2600;
    vFilter.Q.value = 0.6;
    voiceGain.connect(vFilter);
    vFilter.connect(master);

    const partials: Array<[OscillatorType, number, number]> = [
      ["sine", 1, 1],
      ["triangle", 2.01, 0.32],
      ["sine", 3.0, 0.16],
    ];
    partials.forEach(([type, mult, amp]) => {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = freq * mult;
      const g = ctx.createGain();
      g.gain.value = amp;
      o.connect(g);
      g.connect(voiceGain);
      o.start(now);
      o.stop(now + 1.9);
    });
  }

  return { ctx, master, setDusk, strike };
}
