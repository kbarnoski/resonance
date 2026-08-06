/**
 * 7480 — Einstein: audio engine.
 *
 * A gentle cosmic-ambient synth driven by the Spectre tiling. As a playhead
 * walks the tiles in substitution order, each tile triggers one soft FM voice.
 *
 * Pitch mapping — the concept made audible:
 *   Each Spectre appears in one of 12 orientations (30-degree steps). Because
 *   the monotile tiling is APERIODIC, the stream of orientations the playhead
 *   meets never settles into a period — so the melody never loops. Orientation
 *   is mapped to a just-intonation major-pentatonic gamut spanning ~2 octaves,
 *   giving a genuinely non-repeating, non-random melodic plane.
 *
 * Long-form arc: over ~2.5 minutes the harmonic rhythm slows, releases
 * lengthen, the register sinks, a fifth-drone swells, and the reverb opens —
 * so minute 3 sounds nothing like second 0, yet never resolves or repeats.
 */

// Just-intonation major pentatonic ratios.
const PENTA = [1 / 1, 9 / 8, 5 / 4, 3 / 2, 5 / 3];

/** Orientation index (0..11) -> just-intonation frequency multiplier. */
function ratioForOrient(orient: number): number {
  const degree = PENTA[orient % 5];
  const octave = Math.floor(orient / 5); // 0, 1, or 2
  return degree * Math.pow(2, octave);
}

export interface EinsteinAudio {
  trigger: (orient: number, pan: number, isMystic: boolean, arcPhase: number) => void;
  setArc: (arcPhase: number) => void;
  suspend: () => void;
  resume: () => void;
  readonly ctxState: () => string;
  dispose: () => void;
}

export function buildAudioEngine(): EinsteinAudio {
  const Ctor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!Ctor) throw new Error("Web Audio unavailable");

  const ctx = new Ctor();

  // Master chain: (dry + reverb) -> master -> soft limiter -> destination.
  const master = ctx.createGain();
  master.gain.value = 0.9;

  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -8;
  limiter.knee.value = 24;
  limiter.ratio.value = 4;
  limiter.attack.value = 0.005;
  limiter.release.value = 0.25;

  master.connect(limiter);
  limiter.connect(ctx.destination);

  // ── Algorithmic reverb: parallel feedback combs into a darkening lowpass ────
  const reverbIn = ctx.createGain();
  const reverbOut = ctx.createGain();
  reverbOut.gain.value = 0.32; // wet level, raised over the arc

  const combDelays = [0.0977, 0.1247, 0.1601, 0.1931];
  const combFeedbacks: GainNode[] = [];
  for (const dt of combDelays) {
    const delay = ctx.createDelay(1.0);
    delay.delayTime.value = dt;
    const fb = ctx.createGain();
    fb.gain.value = 0.76;
    const damp = ctx.createBiquadFilter();
    damp.type = "lowpass";
    damp.frequency.value = 2600;
    reverbIn.connect(delay);
    delay.connect(damp);
    damp.connect(fb);
    fb.connect(delay); // feedback loop
    damp.connect(reverbOut);
    combFeedbacks.push(fb);
  }
  reverbOut.connect(master);

  // ── Fifth-drone pad (swells in over the arc) ────────────────────────────────
  const droneGain = ctx.createGain();
  droneGain.gain.value = 0.0001;
  droneGain.connect(master);
  droneGain.connect(reverbIn);
  const droneFreqs = [55, 55 * (3 / 2), 110]; // A1, E2, A2
  const droneOscs: OscillatorNode[] = [];
  for (let i = 0; i < droneFreqs.length; i++) {
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.value = droneFreqs[i];
    const detune = ctx.createGain();
    detune.gain.value = 1 / droneFreqs.length;
    o.connect(detune);
    detune.connect(droneGain);
    // slow, gentle vibrato via a shared LFO would be nice; keep it still + pure.
    o.start();
    droneOscs.push(o);
  }

  let disposed = false;

  function setArc(arcPhase: number): void {
    if (disposed) return;
    const t = ctx.currentTime;
    const p = Math.min(1, Math.max(0, arcPhase));
    // Reverb opens up and lengthens.
    reverbOut.gain.setTargetAtTime(0.32 + 0.28 * p, t, 1.5);
    for (const fb of combFeedbacks) {
      fb.gain.setTargetAtTime(0.76 + 0.12 * p, t, 1.5);
    }
    // Drone swells from silence to a soft bed.
    droneGain.gain.setTargetAtTime(0.0001 + 0.09 * p, t, 3.0);
  }

  function trigger(
    orient: number,
    pan: number,
    isMystic: boolean,
    arcPhase: number,
  ): void {
    if (disposed || ctx.state !== "running") return;

    const now = ctx.currentTime;
    const p = Math.min(1, Math.max(0, arcPhase));

    // Register sinks over the arc; base ~ A3 falling toward A2-ish.
    const base = 220 * Math.pow(2, -0.9 * p);
    const freq = base * ratioForOrient(orient);

    // Envelope: soft attack, long release that lengthens over the arc.
    const attack = 0.03 + 0.05 * Math.random();
    const release = 1.4 + 2.6 * p + Math.random() * 0.6;
    const peak = (isMystic ? 0.12 : 0.085) * (1 - 0.25 * p);

    const voice = ctx.createGain();
    voice.gain.setValueAtTime(0.0001, now);
    voice.gain.exponentialRampToValueAtTime(peak, now + attack);
    voice.gain.exponentialRampToValueAtTime(0.0001, now + attack + release);

    const panner = ctx.createStereoPanner();
    panner.pan.value = Math.max(-1, Math.min(1, pan));
    voice.connect(panner);

    const dry = ctx.createGain();
    dry.gain.value = 0.6;
    const wet = ctx.createGain();
    wet.gain.value = 0.9;
    panner.connect(dry);
    panner.connect(wet);
    dry.connect(master);
    wet.connect(reverbIn);

    // FM carrier + modulator. Mystic tiles get a brighter, bell-like ratio.
    const carrier = ctx.createOscillator();
    carrier.type = "sine";
    carrier.frequency.value = freq;

    const modRatio = isMystic ? 2.01 : 1.0;
    const mod = ctx.createOscillator();
    mod.type = "sine";
    mod.frequency.value = freq * modRatio;
    const modIndex = ctx.createGain();
    // Modulation index eases off over the arc for a mellower late texture.
    modIndex.gain.value = freq * (isMystic ? 1.4 : 0.7) * (1 - 0.4 * p);
    mod.connect(modIndex);
    modIndex.connect(carrier.frequency);

    carrier.connect(voice);

    // A quiet sub sine an octave down for warmth.
    const sub = ctx.createOscillator();
    sub.type = "sine";
    sub.frequency.value = freq / 2;
    const subGain = ctx.createGain();
    subGain.gain.value = 0.35;
    sub.connect(subGain);
    subGain.connect(voice);

    const stop = now + attack + release + 0.1;
    carrier.start(now);
    mod.start(now);
    sub.start(now);
    carrier.stop(stop);
    mod.stop(stop);
    sub.stop(stop);
  }

  function suspend(): void {
    if (!disposed) void ctx.suspend();
  }
  function resume(): void {
    if (!disposed) void ctx.resume();
  }
  function dispose(): void {
    if (disposed) return;
    disposed = true;
    for (const o of droneOscs) {
      try {
        o.stop();
      } catch {
        /* already stopped */
      }
    }
    void ctx.close();
  }

  // Resume in case the constructor left it suspended (autoplay policy).
  void ctx.resume();

  return {
    trigger,
    setArc,
    suspend,
    resume,
    ctxState: () => ctx.state,
    dispose,
  };
}
