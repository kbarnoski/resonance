// ════════════════════════════════════════════════════════════════════════════
// audio.ts — the theta–gamma cross-frequency-coupling engine (the REAL coupling).
//
// This is where the literal ~5 Hz theta / ~40 Hz gamma coupling lives, because it
// is perfectly safe in the ear (it is a visual-flicker hazard, not an auditory
// one). Signal path:
//
//   • SUB DRONE      — a steady low sine + two detuned partials for body.
//   • THETA LFO      — a ~5 Hz (3–6.5 Hz) sine. It amplitude-modulates a mid
//                      carrier, so you plainly HEAR the theta pulse.
//   • GAMMA PAC      — a ~40 Hz oscillator run through a VCA whose gain is driven
//                      by a SHARPENED function of the theta phase (a WaveShaper
//                      turns the theta sine into a burst concentrated at the theta
//                      PEAK). That is phase-amplitude coupling: 40 Hz bursts nested
//                      inside each theta cycle. `coupling` scales the burst depth.
//
// Everything sums into a master gain → DynamicsCompressor limiter → destination.
// An AnalyserNode taps the master so the page can draw a small envelope meter and
// feed a glow value back to the shader. Onset/teardown are click-free.
// ════════════════════════════════════════════════════════════════════════════

export interface ThetaAudio {
  resume: () => Promise<void>;
  setCoupling: (v: number) => void; // 0..1 PAC depth
  setThetaRate: (hz: number) => void; // 3..6.5 Hz
  setDeep: (on: boolean) => void;
  energy: () => number; // 0..1 smoothed envelope for the visual glow
  fillWaveform: (out: Float32Array<ArrayBuffer>) => void; // for the audio meter
  dispose: () => void;
}

// Sharpen the theta sine (-1..1) into a positive burst concentrated at the peak.
// gate(x) = max(0, x)^p — near the theta peak x≈1 the gamma fires; elsewhere ~0.
function makeGateCurve(power: number): Float32Array<ArrayBuffer> {
  const n = 1024;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1; // -1..1
    curve[i] = Math.pow(Math.max(0, x), power);
  }
  return curve;
}

export function makeThetaAudio(): ThetaAudio | null {
  const Ctor =
    typeof window !== "undefined"
      ? window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext
      : undefined;
  if (!Ctor) return null;

  let ctx: AudioContext;
  try {
    ctx = new Ctor();
  } catch {
    return null;
  }

  const now0 = ctx.currentTime;

  // ── master: limiter → destination ──
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -8;
  limiter.knee.value = 8;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.25;
  limiter.connect(ctx.destination);

  const master = ctx.createGain();
  master.gain.value = 0.0001; // click-free onset ramp below
  master.connect(limiter);

  const analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  analyser.smoothingTimeConstant = 0.6;
  master.connect(analyser);

  // ── sub drone: steady low sine + two detuned partials for body ──
  const droneOscs: OscillatorNode[] = [];
  const droneMix = ctx.createGain();
  droneMix.gain.value = 0.5;
  droneMix.connect(master);
  {
    const specs: Array<[number, OscillatorType, number, number]> = [
      [55, "sine", 0.5, 0], // sub
      [110, "sine", 0.22, -5], // octave, detuned
      [165, "triangle", 0.12, 6], // fifth-ish body, detuned
    ];
    for (const [f, type, g, cents] of specs) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = f;
      o.detune.value = cents;
      const vg = ctx.createGain();
      vg.gain.value = g;
      o.connect(vg);
      vg.connect(droneMix);
      o.start(now0);
      droneOscs.push(o);
    }
  }

  // ── theta LFO (~5 Hz) ──
  const thetaOsc = ctx.createOscillator();
  thetaOsc.type = "sine";
  thetaOsc.frequency.value = 5;
  thetaOsc.start(now0);

  // ── theta AM of a mid carrier: you HEAR the ~5 Hz pulse ──
  const carrier = ctx.createOscillator();
  carrier.type = "sine";
  carrier.frequency.value = 138.6; // low C#3-ish, cool
  const carrierVCA = ctx.createGain();
  carrierVCA.gain.value = 0.14; // baseline so it never fully cuts
  const thetaAMDepth = ctx.createGain();
  thetaAMDepth.gain.value = 0.1; // set by coupling
  thetaOsc.connect(thetaAMDepth);
  thetaAMDepth.connect(carrierVCA.gain); // a-rate modulation of gain
  carrier.connect(carrierVCA);
  carrierVCA.connect(master);
  carrier.start(now0);

  // ── gamma PAC: 40 Hz bursts gated to the theta peak ──
  const gammaOsc = ctx.createOscillator();
  gammaOsc.type = "sine";
  gammaOsc.frequency.value = 40;
  const gammaVCA = ctx.createGain();
  gammaVCA.gain.value = 0.0001; // driven entirely by the gate signal
  gammaOsc.connect(gammaVCA);

  // give the gamma a little sparkle-band presence
  const gammaTone = ctx.createBiquadFilter();
  gammaTone.type = "highpass";
  gammaTone.frequency.value = 30;
  gammaVCA.connect(gammaTone);
  const gammaLevel = ctx.createGain();
  gammaLevel.gain.value = 0.6;
  gammaTone.connect(gammaLevel);
  gammaLevel.connect(master);

  // theta phase → sharpened burst gate → gamma VCA gain
  const gate = ctx.createWaveShaper();
  gate.curve = makeGateCurve(3.0);
  gate.oversample = "2x";
  const gammaDepth = ctx.createGain();
  gammaDepth.gain.value = 0.0001; // = coupling depth, drives burst amplitude
  thetaOsc.connect(gate);
  gate.connect(gammaDepth);
  gammaDepth.connect(gammaVCA.gain); // a-rate: gammaVCA = gammaOsc * gate * depth
  gammaOsc.start(now0);

  // click-free onset
  master.gain.setTargetAtTime(0.85, now0, 0.6);

  // ── state / smoothing for the visual glow ──
  const wf = new Float32Array(analyser.fftSize);
  let smoothEnergy = 0;
  let coupling = 0.5;
  let deep = false;

  function applyCoupling() {
    const now = ctx.currentTime;
    const c = Math.max(0, Math.min(1, coupling));
    const deepMul = deep ? 1.5 : 1.0;
    // theta AM depth (audible pulse) and gamma burst depth both scale with coupling
    thetaAMDepth.gain.setTargetAtTime(0.11 * c, now, 0.08);
    gammaDepth.gain.setTargetAtTime(Math.max(0.0001, 0.9 * c * deepMul), now, 0.08);
    // sharper bursts when coupling is deep
    gate.curve = makeGateCurve(deep ? 4.0 : 3.0);
  }

  let disposed = false;

  return {
    async resume() {
      if (ctx.state === "suspended") {
        try {
          await ctx.resume();
        } catch {
          /* gesture-gated elsewhere */
        }
      }
    },
    setCoupling(v: number) {
      coupling = Math.max(0, Math.min(1, v));
      applyCoupling();
    },
    setThetaRate(hz: number) {
      const f = Math.max(3, Math.min(6.5, hz));
      thetaOsc.frequency.setTargetAtTime(f, ctx.currentTime, 0.12);
    },
    setDeep(on: boolean) {
      deep = on;
      applyCoupling();
    },
    energy() {
      analyser.getFloatTimeDomainData(wf);
      let sum = 0;
      for (let i = 0; i < wf.length; i++) sum += wf[i] * wf[i];
      const rms = Math.sqrt(sum / wf.length);
      const target = Math.min(1, rms * 3.2);
      smoothEnergy += (target - smoothEnergy) * 0.12;
      return smoothEnergy;
    },
    fillWaveform(out: Float32Array<ArrayBuffer>) {
      analyser.getFloatTimeDomainData(out);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      const now = ctx.currentTime;
      try {
        master.gain.cancelScheduledValues(now);
        master.gain.setValueAtTime(Math.max(0.0001, master.gain.value), now);
        master.gain.setTargetAtTime(0.0001, now, 0.18);
      } catch {
        /* ctx closing */
      }
      const killAt = now + 0.8;
      const allOscs = [...droneOscs, thetaOsc, carrier, gammaOsc];
      for (const o of allOscs) {
        try {
          o.stop(killAt);
        } catch {
          /* already stopped */
        }
      }
      window.setTimeout(() => {
        if (ctx.state !== "closed") ctx.close().catch(() => {});
      }, 900);
    },
  };
}
