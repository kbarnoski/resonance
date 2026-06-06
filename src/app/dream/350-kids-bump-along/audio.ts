/**
 * audio.ts — Web Audio synthesis for Bump Along creatures.
 * All helpers are named with non-hook prefixes (make*, play*, build*, start*).
 * No audio files — fully synthesized warm bell/marimba timbre.
 * Safe audio: routed through DynamicsCompressor + lowpass limiter.
 */

export interface AudioRig {
  ctx: AudioContext;
  master: GainNode;
  limiter: DynamicsCompressorNode;
  lpf: BiquadFilterNode;
  ambientNodes: AudioNode[];
}

/** Pentatonic C major across two octaves: C3 E3 G3 A3 C4 E4 G4 A4
 *  Mapped left (low/big) → right (high/small), matching BANDIMAL convention. */
export const PENTA_HZ = [
  130.81, // C3
  164.81, // E3
  196.0,  // G3
  220.0,  // A3
  261.63, // C4
  329.63, // E4
  392.0,  // G4
  440.0,  // A4
];

/** Build the master audio rig with compressor + lowpass for safe sound. */
export function buildRig(): AudioRig {
  const ctx = new AudioContext();

  // Master gain
  const master = ctx.createGain();
  master.gain.value = 0.72;

  // Gentle lowpass — cuts harsh highs above ~9kHz
  const lpf = ctx.createBiquadFilter();
  lpf.type = "lowpass";
  lpf.frequency.value = 9000;
  lpf.Q.value = 0.5;

  // DynamicsCompressor as brick-wall limiter
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -6;
  limiter.knee.value = 3;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.001;
  limiter.release.value = 0.08;

  // Chain: master → lpf → limiter → destination
  master.connect(lpf);
  lpf.connect(limiter);
  limiter.connect(ctx.destination);

  return { ctx, master, limiter, lpf, ambientNodes: [] };
}

/** Start a soft ambient drone chord (C3 + G3 + E3) — always on, very quiet. */
export function startAmbientDrone(rig: AudioRig): void {
  const { ctx, master } = rig;
  const droneFreqs = [130.81, 196.0, 164.81]; // C3, G3, E3

  const nodes: AudioNode[] = [];

  droneFreqs.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = freq;

    // Slight detuning for warmth
    const detuneAmount = [0, 2, -1][i] ?? 0;
    osc.detune.value = detuneAmount;

    const g = ctx.createGain();
    g.gain.value = 0;

    osc.connect(g);
    g.connect(master);
    osc.start();

    // Slow fade in for the drone
    g.gain.setTargetAtTime(0.018, ctx.currentTime, 2.0);

    nodes.push(osc, g);
  });

  rig.ambientNodes = nodes;
}

/** Play a warm bell/marimba note for creature at index `noteIdx`.
 *  Uses additive synthesis: fundamental sine + harmonics + attack noise. */
export function playCreatureNote(
  rig: AudioRig,
  noteIdx: number,
  velocityScale = 1.0
): void {
  const { ctx, master } = rig;
  const freq = PENTA_HZ[noteIdx] ?? PENTA_HZ[0];
  const now = ctx.currentTime;
  const vel = Math.max(0.2, Math.min(1.0, velocityScale));

  // Marimba-ish: strong fundamental + octave + 3rd harmonic, quick decay
  const fundamentalPeak = 0.38 * vel;
  const harmonic2Peak = 0.12 * vel;
  const harmonic3Peak = 0.06 * vel;

  const makeTone = (f: number, peak: number, decay: number) => {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = f;

    const g = ctx.createGain();
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(peak, now + 0.008);
    g.gain.exponentialRampToValueAtTime(0.001, now + decay);

    osc.connect(g);
    g.connect(master);
    osc.start(now);
    osc.stop(now + decay + 0.05);
  };

  // Fundamental — longer decay for low notes, shorter for high
  const baseDur = 0.9 + (1 - noteIdx / 7) * 0.5; // 0.9–1.4s
  makeTone(freq, fundamentalPeak, baseDur);
  makeTone(freq * 2, harmonic2Peak, baseDur * 0.55);
  makeTone(freq * 3, harmonic3Peak, baseDur * 0.3);

  // Soft attack click — gives marimba "knock"
  const clickOsc = ctx.createOscillator();
  clickOsc.type = "triangle";
  clickOsc.frequency.value = freq * 4;
  const clickG = ctx.createGain();
  clickG.gain.setValueAtTime(0.04 * vel, now);
  clickG.gain.exponentialRampToValueAtTime(0.001, now + 0.025);
  clickOsc.connect(clickG);
  clickG.connect(master);
  clickOsc.start(now);
  clickOsc.stop(now + 0.03);
}

/** Play a chord for when two waves meet in the middle. */
export function playMeetingChord(rig: AudioRig, noteIdxA: number, noteIdxB: number): void {
  playCreatureNote(rig, noteIdxA, 0.85);
  playCreatureNote(rig, noteIdxB, 0.85);
  // If they're adjacent, also play the one between them
  if (Math.abs(noteIdxA - noteIdxB) === 2) {
    const mid = Math.floor((noteIdxA + noteIdxB) / 2);
    // Small delay for shimmer
    setTimeout(() => playCreatureNote(rig, mid, 0.5), 60);
  }
}

/** Tear down the audio rig cleanly. */
export function teardownRig(rig: AudioRig): void {
  try {
    rig.ambientNodes.forEach((n) => {
      if (n instanceof OscillatorNode) {
        try { n.stop(); } catch { /* already stopped */ }
      }
    });
    rig.ctx.close().catch(() => {/* ignore */});
  } catch {
    // Ignore teardown errors
  }
}
