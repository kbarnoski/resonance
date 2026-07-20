// Web Audio sonification of the scintillating scotoma. Everything is generated
// in-browser (no samples, no network). Two coupled layers driven by the same
// wave state that drives the visuals:
//
//   • the scintillating EDGE  -> a shimmering band of drifting, detuned high
//     partials whose brightness tracks the wavefront's speed & position,
//     tremolo'd by the SAME slow (<=3 Hz) scintillation LFO as the picture.
//   • the SCOTOMA (spreading blindness) -> a migrating spectral NOTCH swept
//     through a soft drone, so the "blind" region is audible as a hole.
//
// Harmony is deliberately NON-just / NON-scalar: an inharmonic set of
// irrational partial ratios that slowly detune. (Not the banned Chladni set.)

import type { WaveState } from "./webgl";

// Inharmonic partial ratios — irrational, no octaves, no just intervals,
// and NOT the banned 1 / 2.76 / 5.40 / 8.93 glass-plate set.
const SHIMMER_RATIOS = [1.0, 1.487, 2.113, 2.879, 3.561, 4.402, 5.233];
const DRONE_RATIOS = [1.0, 1.335, 1.828, 2.427];

export type AuraEngine = {
  step: (state: WaveState) => void;
  stop: () => void;
};

export function startAuraEngine(ctx: AudioContext): AuraEngine {
  const now = ctx.currentTime;

  // ── Master chain: gain -> soft-clip limiter -> destination ──
  const master = ctx.createGain();
  master.gain.value = 0.0;
  master.gain.setValueAtTime(0.0, now);
  master.gain.linearRampToValueAtTime(0.14, now + 4.0);

  const shaper = ctx.createWaveShaper();
  const curve = new Float32Array(1024);
  for (let i = 0; i < curve.length; i++) {
    const x = (i / (curve.length - 1)) * 2 - 1;
    curve[i] = Math.tanh(x * 1.8); // gentle saturating limiter
  }
  shaper.curve = curve;
  shaper.oversample = "4x";

  master.connect(shaper).connect(ctx.destination);

  // ── Drone bed: low inharmonic partials -> migrating notch -> lowpass ──
  const droneBase = 62.0; // Hz
  const droneGain = ctx.createGain();
  droneGain.gain.value = 0.5;

  // The scotoma: two cascaded notch filters that migrate through the drone.
  const notchA = ctx.createBiquadFilter();
  notchA.type = "notch";
  notchA.frequency.value = 420;
  notchA.Q.value = 3.2;
  const notchB = ctx.createBiquadFilter();
  notchB.type = "notch";
  notchB.frequency.value = 900;
  notchB.Q.value = 2.4;

  const droneLP = ctx.createBiquadFilter();
  droneLP.type = "lowpass";
  droneLP.frequency.value = 1400;
  droneLP.Q.value = 0.4;

  droneGain.connect(notchA).connect(notchB).connect(droneLP).connect(master);

  const droneOscs: OscillatorNode[] = [];
  const droneLFOs: OscillatorNode[] = [];
  for (let i = 0; i < DRONE_RATIOS.length; i++) {
    const osc = ctx.createOscillator();
    osc.type = i === 0 ? "sine" : "triangle";
    osc.frequency.value = droneBase * DRONE_RATIOS[i];
    const g = ctx.createGain();
    g.gain.value = 0.9 / (i + 1.4);
    // slow independent detune drift so the bed never sits still
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.03 + i * 0.017;
    const lfoDepth = ctx.createGain();
    lfoDepth.gain.value = 4 + i * 2; // cents
    lfo.connect(lfoDepth).connect(osc.detune);
    osc.connect(g).connect(droneGain);
    osc.start(now);
    lfo.start(now);
    droneOscs.push(osc);
    droneLFOs.push(lfo);
  }

  // ── Shimmer band: drifting detuned high partials, tremolo'd by scint LFO ──
  const shimmerBase = 660.0; // Hz
  const shimmerBright = ctx.createBiquadFilter();
  shimmerBright.type = "bandpass";
  shimmerBright.frequency.value = 1600;
  shimmerBright.Q.value = 0.7;

  const shimmerGain = ctx.createGain();
  shimmerGain.gain.value = 0.0; // opened by scint LFO + wave brightness

  // Scintillation tremolo LFO — the SAME phenomenon the eye sees. <=3 Hz.
  const scintLFO = ctx.createOscillator();
  scintLFO.type = "sine";
  scintLFO.frequency.value = 2.6; // Hz, matches the visual uScintRate
  const scintDepth = ctx.createGain();
  scintDepth.gain.value = 0.5;
  const scintBias = ctx.createConstantSource();
  scintBias.offset.value = 0.5; // gain floor so it never fully gates off
  scintLFO.connect(scintDepth).connect(shimmerGain.gain);
  scintBias.connect(shimmerGain.gain);
  scintLFO.start(now);
  scintBias.start(now);

  shimmerBright.connect(shimmerGain).connect(master);

  const shimmerOscs: OscillatorNode[] = [];
  const shimmerLFOs: OscillatorNode[] = [];
  for (let i = 0; i < SHIMMER_RATIOS.length; i++) {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = shimmerBase * SHIMMER_RATIOS[i];
    const g = ctx.createGain();
    g.gain.value = 0.16 / (i * 0.5 + 1);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.05 + i * 0.023;
    const lfoDepth = ctx.createGain();
    lfoDepth.gain.value = 6 + i * 3; // cents of slow shimmer detune
    lfo.connect(lfoDepth).connect(osc.detune);
    osc.connect(g).connect(shimmerBright);
    osc.start(now);
    lfo.start(now);
    shimmerOscs.push(osc);
    shimmerLFOs.push(lfo);
  }

  let lastRadius = 0;
  let lastTime = 0;

  const step = (state: WaveState) => {
    const t = ctx.currentTime;
    const dt = Math.max(1e-3, state.time - lastTime);
    const speed = Math.abs(state.radius - lastRadius) / dt; // wavefront speed
    lastRadius = state.radius;
    lastTime = state.time;

    // Edge brightness tracks position (further out => brighter/thinner) plus a
    // kick from wavefront speed. This couples the sonic shimmer to the picture.
    const posTerm = Math.min(1, state.radius / 1.4);
    const speedTerm = Math.min(1, speed * 6.0);
    const bright = 0.32 * (0.4 + 0.6 * posTerm) + 0.2 * speedTerm;
    shimmerGain.gain.cancelScheduledValues(t);
    // reassert the LFO-driven envelope centre; depth stays constant, centre moves
    scintDepth.gain.setTargetAtTime(0.5 * bright, t, 0.4);
    scintBias.offset.setTargetAtTime(0.5 * bright, t, 0.4);

    const bandCenter = 1200 + posTerm * 2600;
    shimmerBright.frequency.setTargetAtTime(bandCenter, t, 0.5);

    // The scotoma notch migrates upward through the drone as the front advances,
    // so the audible "hole" travels just like the blind region on screen.
    const notchF = 300 + state.progress * 1500 + posTerm * 600;
    notchA.frequency.setTargetAtTime(notchF, t, 0.6);
    notchB.frequency.setTargetAtTime(notchF * 1.9, t, 0.6);
    // notch deepens (Q up) mid-journey when the scotoma is most active
    const activity = Math.sin(Math.PI * Math.min(1, state.progress));
    notchA.Q.setTargetAtTime(2.5 + activity * 4.0, t, 0.6);
    notchB.Q.setTargetAtTime(2.0 + activity * 3.0, t, 0.6);

    // Drone slowly opens then closes over the arc.
    droneLP.frequency.setTargetAtTime(900 + activity * 1400, t, 0.8);
  };

  const stop = () => {
    const t = ctx.currentTime;
    try {
      master.gain.cancelScheduledValues(t);
      master.gain.setTargetAtTime(0.0001, t, 0.25);
    } catch {
      /* context may be closing */
    }
    const stopAt = t + 0.8;
    const all = [
      ...droneOscs,
      ...droneLFOs,
      ...shimmerOscs,
      ...shimmerLFOs,
      scintLFO,
    ];
    for (const o of all) {
      try {
        o.stop(stopAt);
      } catch {
        /* already stopped */
      }
    }
    try {
      scintBias.stop(stopAt);
    } catch {
      /* already stopped */
    }
  };

  return { step, stop };
}
