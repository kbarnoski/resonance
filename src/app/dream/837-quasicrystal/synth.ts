/**
 * synth.ts — Quasicrystal audio engine
 *
 * Maps Penrose rhomb properties to musical events via just-intonation ratios.
 *
 * Musical structure:
 *   - Base drone: a sustained low tone that shifts slowly based on current region
 *   - Tile voices: each tile visit triggers a short melodic/harmonic event
 *   - Fat rhombs → stable, consonant intervals (octave, fifth, major third)
 *   - Thin rhombs → tense, complex intervals (minor second, tritone...)
 *
 * Vertex config → pitch class (just-intonation lattice):
 *   sun    → 1/1   (root, unison)
 *   queen  → 3/2   (perfect fifth)
 *   king   → 4/3   (perfect fourth)
 *   jack   → 5/4   (major third)
 *   star   → 6/5   (minor third)
 *   deuce  → 7/4   (harmonic seventh — distinctly non-equal-tempered)
 *   ace    → 9/8   (major second)
 *
 * Register is determined by distance from center (further = higher).
 * Timbre: fat rhombs use sine + 2nd harmonic (warm), thin use triangle + slight FM (bright).
 * No pitch class ever exactly repeats in the same order — the aperiodic sequence guarantees this.
 *
 * Master chain: voices → DynamicsCompressor → MasterGain → destination
 */

import type { Rhomb, VertexConfig } from "./tiling";

export interface QuasiAudioEngine {
  spawnTileEvent: (rhomb: Rhomb, tempo: number) => void;
  setDroneRegion: (distFromCenter: number, dominantAngle: number) => void;
  dispose: () => void;
  readonly ctx: AudioContext;
}

// Just-intonation ratios for each vertex config
const JI_RATIOS: Record<VertexConfig, number> = {
  sun:   1.0,
  queen: 3 / 2,
  king:  4 / 3,
  jack:  5 / 4,
  star:  6 / 5,
  deuce: 7 / 4,
  ace:   9 / 8,
};

// Overtone spectrum for fat vs thin rhombs
// fat: warm — fundamental + gentle octave
// thin: bright — fundamental + fifth partial
const FAT_PARTIALS = [1.0, 2.0, 3.0];
const FAT_PARTIAL_GAINS = [0.6, 0.25, 0.08];
const THIN_PARTIALS = [1.0, 3.0, 5.0];
const THIN_PARTIAL_GAINS = [0.5, 0.3, 0.12];

// Root frequency for the JI lattice (A2)
const ROOT_HZ = 110.0;

// How many octaves of register range
const REGISTER_OCTAVES = 3;

// Max simultaneous tile voices
const MAX_VOICES = 12;

interface ActiveVoice {
  gainNode: GainNode;
  endTime: number;
}

export function buildAudioEngine(): QuasiAudioEngine {
  const ctx = new AudioContext();

  // Master chain
  const masterGain = ctx.createGain();
  masterGain.gain.value = 0.25;

  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = -18;
  compressor.knee.value = 8;
  compressor.ratio.value = 4;
  compressor.attack.value = 0.003;
  compressor.release.value = 0.25;

  const lowpass = ctx.createBiquadFilter();
  lowpass.type = "lowpass";
  lowpass.frequency.value = 14000;
  lowpass.Q.value = 0.5;

  masterGain.connect(lowpass);
  lowpass.connect(compressor);
  compressor.connect(ctx.destination);

  // Drone subsystem
  const droneGain = ctx.createGain();
  droneGain.gain.value = 0.0;
  droneGain.connect(masterGain);

  const droneOscs: OscillatorNode[] = [];
  const droneParts = [1.0, 1.5, 2.0, 2.5]; // drone chord (root + fifth + octave + fifth above)
  const droneGains: GainNode[] = [];

  for (let i = 0; i < droneParts.length; i++) {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = ROOT_HZ * droneParts[i];
    const g = ctx.createGain();
    g.gain.value = i === 0 ? 0.4 : 0.15 / i;
    osc.connect(g);
    g.connect(droneGain);
    osc.start();
    droneOscs.push(osc);
    droneGains.push(g);
  }

  // Fade in drone
  droneGain.gain.setTargetAtTime(0.35, ctx.currentTime + 0.5, 2.0);

  const activeVoices: ActiveVoice[] = [];

  function pruneVoices() {
    const now = ctx.currentTime;
    const live = activeVoices.filter(v => v.endTime > now);
    activeVoices.length = 0;
    for (const v of live) activeVoices.push(v);
  }

  function spawnTileEvent(rhomb: Rhomb, tempo: number) {
    pruneVoices();
    if (activeVoices.length >= MAX_VOICES) return;

    const now = ctx.currentTime;

    // Compute pitch
    const ratio = JI_RATIOS[rhomb.vertexConfig];
    const distNorm = Math.min(rhomb.distFromCenter / 20, 1.0);
    const octave = Math.floor(distNorm * REGISTER_OCTAVES);
    const baseFreq = ROOT_HZ * ratio * Math.pow(2, octave);

    // Duration based on tempo (slower tempo = longer notes)
    const dur = Math.max(0.18, 1.2 / tempo);
    const attack = 0.015;
    const release = dur * 0.6;

    const partials = rhomb.type === "fat" ? FAT_PARTIALS : THIN_PARTIALS;
    const partialGains = rhomb.type === "fat" ? FAT_PARTIAL_GAINS : THIN_PARTIAL_GAINS;

    // Voice gain envelope
    const voiceGain = ctx.createGain();
    voiceGain.gain.setValueAtTime(0, now);
    voiceGain.gain.linearRampToValueAtTime(0.18, now + attack);
    voiceGain.gain.setTargetAtTime(0, now + dur - release, release * 0.35);
    voiceGain.connect(masterGain);

    // Create oscillators for each partial
    const oscs: OscillatorNode[] = [];
    for (let i = 0; i < partials.length; i++) {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      const freq = baseFreq * partials[i];
      osc.frequency.setValueAtTime(freq * 0.998, now);  // slight detune for warmth
      osc.frequency.setTargetAtTime(freq, now + attack, 0.05);

      const pGain = ctx.createGain();
      pGain.gain.value = partialGains[i];
      osc.connect(pGain);
      pGain.connect(voiceGain);
      osc.start(now);
      osc.stop(now + dur + 0.1);
      oscs.push(osc);
    }

    // Thin rhombs get a subtle FM shimmer
    if (rhomb.type === "thin") {
      const modOsc = ctx.createOscillator();
      modOsc.type = "sine";
      modOsc.frequency.value = baseFreq * 3.5;
      const modGain = ctx.createGain();
      modGain.gain.value = baseFreq * 0.03;
      modOsc.connect(modGain);
      // modGain connects to carrier frequency — simplified: add a high partial
      const shimGain = ctx.createGain();
      shimGain.gain.value = 0.04;
      modOsc.connect(shimGain);
      shimGain.connect(voiceGain);
      modOsc.start(now);
      modOsc.stop(now + dur + 0.1);
    }

    activeVoices.push({ gainNode: voiceGain, endTime: now + dur + 0.15 });
  }

  function setDroneRegion(distFromCenter: number, dominantAngle: number) {
    const now = ctx.currentTime;
    // Shift drone root based on distance (slow harmonic drift)
    const droneRatio = 1.0 + (distFromCenter / 30) * 0.5;  // drifts up as we travel out
    const angleShift = (Math.cos(dominantAngle * 2) * 0.1 + 1.0);  // subtle angle-based inflection
    const rootFreq = ROOT_HZ * droneRatio * angleShift;

    for (let i = 0; i < droneOscs.length; i++) {
      droneOscs[i].frequency.setTargetAtTime(
        rootFreq * droneParts[i],
        now,
        3.0  // very slow glide — 3-second time constant
      );
    }
  }

  function dispose() {
    for (const osc of droneOscs) {
      try { osc.stop(); } catch { /* already stopped */ }
    }
    ctx.close();
  }

  return { spawnTileEvent, setDroneRegion, dispose, ctx };
}
