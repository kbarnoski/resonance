// Membrane-mode synthesis for the moon trampoline, Web Audio API only.
// Eb major lullaby. Always-on Eb+Bb drone pad so it is never silent.
// Dent depth bends the low fundamental DOWN (tension-modulation pitch bend,
// cf. Avanzini & Marogna). Ripple energy excites higher drum-skin modes
// (circular-membrane-ish partials).
//
// Kids-safe chain: gain<=0.26 -> lowpass ~6500Hz -> compressor.
// ~12-minute goodnight fade.

// Circular-membrane modal ratios (idealized): (0,1) (1,1) (2,1) (0,2) (3,1)
const MODE_RATIOS = [1.0, 1.59, 2.14, 2.3, 2.65];
const MODE_GAINS = [1.0, 0.5, 0.32, 0.24, 0.16];

const EB2 = 77.78; // fundamental (Eb2)
const BB2 = 116.54; // fifth (Bb2) for the drone
const SESSION_SECONDS = 12 * 60;

export interface AudioEngine {
  ctx: AudioContext;
  resume: () => Promise<void>;
  // Called every visual frame with normalized cloth diagnostics.
  update: (dentNorm: number, rippleNorm: number, settled: boolean) => void;
  // A discrete bounce bloom (ball strikes the sheet hard).
  bloom: (strength: number) => void;
  dispose: () => void;
}

interface ModeVoice {
  osc: OscillatorNode;
  gain: GainNode;
  ratio: number;
  baseGain: number;
}

export function makeAudioEngine(): AudioEngine | null {
  if (typeof window === "undefined") return null;
  const Ctor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!Ctor) return null;
  const ctx = new Ctor();

  // --- Master chain ---
  const master = ctx.createGain();
  master.gain.value = 0.0001;
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 6500;
  lp.Q.value = 0.6;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -10;
  comp.knee.value = 8;
  comp.ratio.value = 20;
  comp.attack.value = 0.03;
  comp.release.value = 0.25;
  master.connect(lp);
  lp.connect(comp);
  comp.connect(ctx.destination);

  const startTime = ctx.currentTime;
  // Soft fade-in to the playing level; then the slow goodnight fade.
  master.gain.cancelScheduledValues(startTime);
  master.gain.setValueAtTime(0.0001, startTime);
  master.gain.exponentialRampToValueAtTime(0.22, startTime + 4);
  // 12-min winding-down: ramp toward near-silence by the end.
  master.gain.setTargetAtTime(0.03, startTime + 60, SESSION_SECONDS / 3);

  // --- Drone pad: Eb + Bb, two detuned saws softened by lowpass ---
  const padGain = ctx.createGain();
  padGain.gain.value = 0.13;
  padGain.connect(master);
  const padFilter = ctx.createBiquadFilter();
  padFilter.type = "lowpass";
  padFilter.frequency.value = 900;
  padFilter.connect(padGain);

  const droneFreqs = [EB2, BB2, EB2 * 2];
  const droneOscs: OscillatorNode[] = [];
  for (const f of droneFreqs) {
    for (const det of [-4, 4]) {
      const o = ctx.createOscillator();
      o.type = "triangle";
      o.frequency.value = f;
      o.detune.value = det;
      const g = ctx.createGain();
      g.gain.value = 0.33;
      o.connect(g);
      g.connect(padFilter);
      o.start();
      droneOscs.push(o);
    }
  }

  // Gentle LFO on the pad filter for a breathing bedtime shimmer.
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 0.08;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 260;
  lfo.connect(lfoGain);
  lfoGain.connect(padFilter.frequency);
  lfo.start();

  // --- Membrane modal bank (sustained, amplitude follows ripple) ---
  const modeBus = ctx.createGain();
  modeBus.gain.value = 0.0;
  modeBus.connect(master);
  const modeFilter = ctx.createBiquadFilter();
  modeFilter.type = "lowpass";
  modeFilter.frequency.value = 2400;
  modeFilter.connect(modeBus);

  // Fundamental an octave up so modes sit in a warm chime register (Eb3).
  const modeFund = EB2 * 2;
  const voices: ModeVoice[] = MODE_RATIOS.map((ratio, i) => {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = modeFund * ratio;
    const gain = ctx.createGain();
    gain.gain.value = 0.0001;
    osc.connect(gain);
    gain.connect(modeFilter);
    osc.start();
    return { osc, gain, ratio, baseGain: MODE_GAINS[i] };
  });

  let lastBloom = 0;

  const resume = async () => {
    if (ctx.state === "suspended") {
      await ctx.resume();
    }
  };

  const update = (dentNorm: number, rippleNorm: number, settled: boolean) => {
    const now = ctx.currentTime;
    const d = Math.min(1, Math.max(0, dentNorm));
    const rip = Math.min(1, Math.max(0, rippleNorm));

    // Dent bends the fundamental DOWN (tension-modulation pitch bend).
    // Up to ~3 semitones flat at full dent.
    const bend = Math.pow(2, (-3 * d) / 12);
    for (const v of voices) {
      v.osc.frequency.setTargetAtTime(modeFund * v.ratio * bend, now, 0.05);
    }

    // Ripple energy opens the modal bank. Settle = warm sustained chord.
    const target = settled ? 0.06 + d * 0.05 : 0.05 + rip * 0.5;
    modeBus.gain.setTargetAtTime(Math.min(0.22, target), now, 0.08);
    // Brightness follows motion (more ripple -> a touch more open).
    modeFilter.frequency.setTargetAtTime(1800 + rip * 2600, now, 0.1);
    // Per-mode gains: higher modes only sing when there's real motion.
    voices.forEach((v, i) => {
      const lift = i === 0 ? 1 : 0.25 + rip * 0.9;
      v.gain.gain.setTargetAtTime(v.baseGain * 0.5 * lift, now, 0.06);
    });
  };

  const bloom = (strength: number) => {
    const now = ctx.currentTime;
    if (now - lastBloom < 0.12) return; // rate-limit blooms
    lastBloom = now;
    const s = Math.min(1, Math.max(0, strength));
    // Soft bloom: a short consonant swell on the modal bus (no clicky attack).
    const env = ctx.createGain();
    env.gain.value = 0.0001;
    env.connect(master);
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = 2200 + s * 1800;
    f.connect(env);
    // Chime on Eb major triad tones (Eb3 G3 Bb3) so it's always consonant.
    const tones = [modeFund, modeFund * 1.26, modeFund * 1.5];
    const oscs: OscillatorNode[] = [];
    for (const t of tones) {
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = t;
      o.connect(f);
      o.start();
      oscs.push(o);
    }
    const peak = 0.03 + s * 0.06;
    env.gain.setValueAtTime(0.0001, now);
    env.gain.exponentialRampToValueAtTime(peak, now + 0.05); // >=30ms attack
    env.gain.exponentialRampToValueAtTime(0.0001, now + 1.4);
    for (const o of oscs) o.stop(now + 1.5);
  };

  const dispose = () => {
    try {
      const now = ctx.currentTime;
      master.gain.cancelScheduledValues(now);
      master.gain.setTargetAtTime(0.0001, now, 0.3);
      for (const o of droneOscs) o.stop(now + 0.6);
      for (const v of voices) v.osc.stop(now + 0.6);
      lfo.stop(now + 0.6);
      setTimeout(() => {
        void ctx.close();
      }, 800);
    } catch {
      // ignore teardown races
    }
  };

  return { ctx, resume, update, bloom, dispose };
}
