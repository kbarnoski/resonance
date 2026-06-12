/**
 * audio.ts — Web Audio synthesis engine for the murmuration
 * Maps emergent 3D flock state → harmony in C-major pentatonic.
 * Always-on ambient pad; sub-flock clusters → distinct voices.
 */

import type { FlockState, ClusterInfo } from './flock';

// C-major pentatonic frequencies across 4 octaves (C2–C6)
// C D E G A pattern
const PENTA_BASE: number[] = [];
for (let oct = 2; oct <= 5; oct++) {
  const c = 65.41 * Math.pow(2, oct - 2); // C2 = 65.41 Hz
  PENTA_BASE.push(c, c * 1.122, c * 1.260, c * 1.498, c * 1.682);
}
// Available pitches: 20 notes C2 up to ~A5

// ── Types ──────────────────────────────────────────────────────────────────────

interface ClusterVoice {
  clusterId: number;
  osc: OscillatorNode;
  osc2: OscillatorNode;
  gain: GainNode;
  active: boolean;
  freq: number;
}

interface AudioEngine {
  ctx: AudioContext;
  updateState: (state: FlockState) => void;
  dispose: () => void;
}

// ── Factory ────────────────────────────────────────────────────────────────────

export function makeAudioEngine(): AudioEngine {
  // iOS-safe AudioContext creation inside gesture
  const CtxClass: typeof AudioContext =
    window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new CtxClass();

  // ── Master chain: gain → lowpass → compressor → destination ──
  const master = ctx.createGain();
  master.gain.value = 0.82;

  const lpf = ctx.createBiquadFilter();
  lpf.type = 'lowpass';
  lpf.frequency.value = 7200;
  lpf.Q.value = 0.6;

  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -6;
  comp.knee.value = 4;
  comp.ratio.value = 18;
  comp.attack.value = 0.003;
  comp.release.value = 0.18;

  master.connect(lpf);
  lpf.connect(comp);
  comp.connect(ctx.destination);

  // ── Always-on ambient pad (C2 + G2) ──────────────────────────
  function makePadOsc(freq: number, type: OscillatorType, gain: number): OscillatorNode {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.value = gain;
    osc.connect(g);
    g.connect(master);
    osc.start();
    return osc;
  }

  // Soft pad: two detuned sines + a gentle triangle for warmth
  makePadOsc(65.41, 'sine', 0.06);       // C2
  makePadOsc(65.41 * 1.004, 'sine', 0.04); // C2 slightly detuned
  makePadOsc(98.0, 'sine', 0.045);        // G2
  makePadOsc(98.0 * 0.998, 'triangle', 0.025); // G2 detuned

  // Slow LFO tremolo on ambient pad
  const padGain = ctx.createGain();
  padGain.gain.value = 0.9;
  const tremoloLfo = ctx.createOscillator();
  tremoloLfo.frequency.value = 0.35;
  const tremoloDepth = ctx.createGain();
  tremoloDepth.gain.value = 0.08;
  tremoloLfo.connect(tremoloDepth);
  tremoloDepth.connect(padGain.gain);
  tremoloLfo.start();
  padGain.connect(master);

  // ── Sparkle layer: high pitched airy wash ─────────────────────
  const sparkleGain = ctx.createGain();
  sparkleGain.gain.value = 0;
  sparkleGain.connect(master);

  const sparkleOsc = ctx.createOscillator();
  sparkleOsc.type = 'sine';
  sparkleOsc.frequency.value = 1320; // E6
  sparkleOsc.connect(sparkleGain);
  sparkleOsc.start();

  const sparkleOsc2 = ctx.createOscillator();
  sparkleOsc2.type = 'sine';
  sparkleOsc2.frequency.value = 1056; // C6
  sparkleOsc2.connect(sparkleGain);
  sparkleOsc2.start();

  // ── Cluster voice pool (max 4 voices) ────────────────────────
  const voices: ClusterVoice[] = [];

  function makePentaFreq(heightNorm: number, clusterIdx: number): number {
    // Map height (−1 to +1) to octave range 2–5
    const t = (heightNorm + 1) / 2; // 0–1
    const baseIdx = Math.floor(t * 12); // 0–12 steps across notes
    // Offset each voice by an interval for harmony
    const offsets = [0, 2, 4, 7]; // unison, third, fifth, seventh of pentatonic
    const noteIdx = Math.min(PENTA_BASE.length - 1, baseIdx + offsets[clusterIdx % offsets.length]);
    return PENTA_BASE[noteIdx] ?? PENTA_BASE[PENTA_BASE.length - 1];
  }

  function ensureVoice(idx: number): ClusterVoice {
    if (!voices[idx]) {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      const osc2 = ctx.createOscillator();
      osc2.type = 'sine';
      const g = ctx.createGain();
      g.gain.value = 0;
      osc.connect(g);
      osc2.connect(g);
      g.connect(master);
      osc.start();
      osc2.start();
      voices[idx] = { clusterId: -1, osc, osc2, gain: g, active: false, freq: 261.63 };
    }
    return voices[idx];
  }

  // Pre-create 4 voice slots
  for (let i = 0; i < 4; i++) ensureVoice(i);

  // ── Tremolo for turbulence feel ────────────────────────────────
  const tremoloRate = ctx.createOscillator();
  tremoloRate.frequency.value = 5.0;
  const tremoloVoiceDepth = ctx.createGain();
  tremoloVoiceDepth.gain.value = 0;
  tremoloRate.connect(tremoloVoiceDepth);
  tremoloRate.start();

  for (let i = 0; i < 4; i++) {
    tremoloVoiceDepth.connect(voices[i].gain.gain);
  }

  // ── State update ───────────────────────────────────────────────

  function updateState(state: FlockState) {
    const now = ctx.currentTime;
    const TAU = 0.15; // smooth transition time

    const { orderParam, centroidY, speed, clusters } = state;

    // Sparkle: scattered flock = more sparkle
    const targetSparkle = Math.max(0, (1 - orderParam) * 0.028 * speed);
    sparkleGain.gain.setTargetAtTime(targetSparkle, now, TAU);

    // Tremolo depth from turbulence
    const turbulence = speed * (1 - orderParam);
    tremoloVoiceDepth.gain.setTargetAtTime(turbulence * 0.03, now, TAU);
    tremoloRate.frequency.setTargetAtTime(3 + turbulence * 8, now, TAU);

    // Cluster voices: each cluster gets one voice
    const activeClusters = clusters.slice(0, 4);
    const TOTAL_BIRDS = 2800;

    activeClusters.forEach((cluster: ClusterInfo, idx: number) => {
      const voice = voices[idx];
      const freq = makePentaFreq(centroidY, idx);
      const targetFreq = freq * (1 + (cluster.cy / 18) * 0.5); // height modifies pitch slightly
      const weight = cluster.count / TOTAL_BIRDS;

      // Harmonic richness: tight flock (high order) = softer; scattered = brighter
      const brightness = 0.5 + (1 - orderParam) * 0.5;
      // Voice gain based on cluster size + overall harmony richness
      const targetGain = weight * 0.22 * brightness;

      voice.osc.frequency.setTargetAtTime(targetFreq, now, TAU * 0.5);
      voice.osc2.frequency.setTargetAtTime(targetFreq * 2.005, now, TAU * 0.5); // slight octave shimmer
      voice.gain.gain.setTargetAtTime(targetGain, now, TAU);
      voice.active = true;
      voice.freq = targetFreq;
    });

    // Silence inactive voices
    for (let i = activeClusters.length; i < 4; i++) {
      voices[i].gain.gain.setTargetAtTime(0, now, TAU);
      voices[i].active = false;
    }

    // Master gain: fuller when more clusters active (harmony)
    const clusterRatio = activeClusters.length / 4;
    const targetMaster = 0.72 + clusterRatio * 0.12;
    master.gain.setTargetAtTime(targetMaster, now, TAU * 2);
  }

  function dispose() {
    try {
      ctx.close();
    } catch {
      // ignore
    }
  }

  return { ctx, updateState, dispose };
}
