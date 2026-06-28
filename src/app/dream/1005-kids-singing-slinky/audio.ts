// ─────────────────────────────────────────────────────────────────────────────
// audio.ts · Kids-safe modal/additive synth driven by the slinky's modes.
//
// The standing-wave modes ARE the sound: a bank of ~8 oscillators tuned to the
// harmonic series (the fundamental = the spring's resonance). Mode amplitudes
// follow the chain's projected mode energies, so the tone swells when flicked
// and decays as the wave damps. Plus an always-on soft drone so it's never
// silent. Mandatory kids-safe master chain caps loudness and shrillness.
//
// Fundamental is snapped to D major pentatonic -> no wrong notes.
// ─────────────────────────────────────────────────────────────────────────────

const N_MODES = 8;

// D major pentatonic across a couple of octaves (D3..B4-ish), Hz.
const PENTATONIC: number[] = [
  146.83, // D3
  164.81, // E3
  185.0, // F#3
  220.0, // A3
  246.94, // B3
  293.66, // D4
  329.63, // E4
  369.99, // F#4
];

export function snapPentatonic(t: number): number {
  // t in 0..1 -> pick a pentatonic root
  const i = Math.min(
    PENTATONIC.length - 1,
    Math.max(0, Math.round(t * (PENTATONIC.length - 1))),
  );
  return PENTATONIC[i];
}

export interface SlinkyAudio {
  ctx: AudioContext;
  setFundamental(hz: number): void;
  setModes(amps: Float32Array, swell: number): void;
  close(): Promise<void>;
}

export function buildAudio(): SlinkyAudio | null {
  const Ctor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!Ctor) return null;
  const ctx = new Ctor();

  // ── Kids-safe master chain: gain -> lowpass -> compressor -> destination ──
  const master = ctx.createGain();
  master.gain.value = 0.0; // fade in after start

  const lowpass = ctx.createBiquadFilter();
  lowpass.type = "lowpass";
  lowpass.frequency.value = 6500;

  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -10;
  comp.ratio.value = 20;
  comp.attack.value = 0.02;
  comp.release.value = 0.25;

  master.connect(lowpass);
  lowpass.connect(comp);
  comp.connect(ctx.destination);

  // soft fade-in of the master so the drone arrives gently
  master.gain.setTargetAtTime(0.22, ctx.currentTime, 0.6);

  // ── Modal oscillator bank (the standing-wave modes -> harmonic series) ──
  let fundamental = 146.83;
  const oscs: OscillatorNode[] = [];
  const gains: GainNode[] = [];
  for (let m = 0; m < N_MODES; m++) {
    const o = ctx.createOscillator();
    o.type = m === 0 ? "sine" : "triangle"; // warm, voice/organ-like
    o.frequency.value = fundamental * (m + 1);
    const g = ctx.createGain();
    g.gain.value = 0;
    o.connect(g);
    g.connect(master);
    o.start();
    oscs.push(o);
    gains.push(g);
  }

  // ── Always-on soft drone/pad in the same key (never silent) ──
  const droneOsc = ctx.createOscillator();
  droneOsc.type = "sine";
  droneOsc.frequency.value = fundamental;
  const droneOsc2 = ctx.createOscillator();
  droneOsc2.type = "sine";
  droneOsc2.frequency.value = fundamental * 1.5; // a soft fifth
  const droneGain = ctx.createGain();
  droneGain.gain.value = 0.05;
  // slow breathing LFO on the drone
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 0.12;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 0.025;
  lfo.connect(lfoGain);
  lfoGain.connect(droneGain.gain);
  droneOsc.connect(droneGain);
  droneOsc2.connect(droneGain);
  droneGain.connect(master);
  droneOsc.start();
  droneOsc2.start();
  lfo.start();

  function setFundamental(hz: number): void {
    fundamental = hz;
    const t = ctx.currentTime;
    for (let m = 0; m < N_MODES; m++) {
      oscs[m].frequency.setTargetAtTime(hz * (m + 1), t, 0.05);
    }
    droneOsc.frequency.setTargetAtTime(hz, t, 0.4);
    droneOsc2.frequency.setTargetAtTime(hz * 1.5, t, 0.4);
  }

  function setModes(amps: Float32Array, swell: number): void {
    const t = ctx.currentTime;
    // normalise by mode count so stacking never clips; clamp the swell.
    const s = Math.min(1, Math.max(0, swell));
    const cap = 0.16 / N_MODES;
    for (let m = 0; m < N_MODES; m++) {
      const a = Math.min(1, Math.abs(amps[m] ?? 0));
      const target = a * s * cap;
      // soft attack (setTargetAtTime time-constant >= ~20ms)
      gains[m].gain.setTargetAtTime(target, t, 0.03);
    }
  }

  async function close(): Promise<void> {
    try {
      const t = ctx.currentTime;
      master.gain.setTargetAtTime(0, t, 0.1);
      for (const o of oscs) o.stop(t + 0.3);
      droneOsc.stop(t + 0.3);
      droneOsc2.stop(t + 0.3);
      lfo.stop(t + 0.3);
    } catch {
      // already stopped
    }
    try {
      await ctx.close();
    } catch {
      // already closed
    }
  }

  return { ctx, setFundamental, setModes, close };
}
