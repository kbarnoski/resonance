// audio.ts — HRTF spatial engine for 346-kids-sound-hunt
// ─────────────────────────────────────────────────────────────────────────────
// Synthesises each animal's voice using Web Audio oscillator nodes
// (no audio files, no external deps). All voices pass through a master
// DynamicsCompressor (brick-wall limiter) — mandatory for a kids piece.
//
// Spatial model:
//   Listener at origin. Each PannerNode{panningModel:"HRTF"} holds a fixed
//   world-space position. Heading is applied by rotating the AudioListener's
//   forward vector each frame — so "turning" the phone sweeps the spatial field.
// ─────────────────────────────────────────────────────────────────────────────

import type { Animal } from "./hunt";
import { animalToXYZ } from "./hunt";

// ── legacy type shims ────────────────────────────────────────────────────────
interface LegacyListener {
  setPosition(x: number, y: number, z: number): void;
  setOrientation(
    fx: number, fy: number, fz: number,
    ux: number, uy: number, uz: number,
  ): void;
}

interface AudioParamPanner extends PannerNode {
  positionX: AudioParam;
  positionY: AudioParam;
  positionZ: AudioParam;
}

interface AudioParamListener extends AudioListener {
  forwardX: AudioParam;
  forwardY: AudioParam;
  forwardZ: AudioParam;
  upX: AudioParam;
  upY: AudioParam;
  upZ: AudioParam;
  positionX: AudioParam;
  positionY: AudioParam;
  positionZ: AudioParam;
}

// ── constants ────────────────────────────────────────────────────────────────
const PANNER_DIST = 3.5;   // how far animals sit from the listener (metres)
const COLLECT_DIST = 0.8;  // how close they swoop on collect (metres)

// D-Dorian drone: D2 + A2 (fifth) — quiet, warm, always on
const DRONE_HZ_PAIRS: [number, number][] = [
  [73.42, 110.0], // D2 + A2
];

// ── types ────────────────────────────────────────────────────────────────────
export interface AnimalAudio {
  id: number;
  panner: PannerNode;
  gain: GainNode;
  filter: BiquadFilterNode;
  // nodes that need .stop() on teardown
  stoppers: Array<OscillatorNode | AudioBufferSourceNode>;
  // current spatial distance (animated on collect)
  dist: number;
  // gain target for swell
  swellGain: number;
}

export interface HuntAudio {
  ctx: AudioContext;
  animals: AnimalAudio[];
  masterGain: GainNode;
  // call each frame with listener heading (radians, 0=north, CW+)
  applyHeading: (headingRad: number) => void;
  // smoothly fly the animal in when collected
  flyIn: (id: number) => void;
  // play the celebration melody using animal timbres
  playCelebration: (animals: Animal[]) => void;
  // play a single-note chime for "caught!"
  playCatchChime: () => void;
  // update per-animal gain/filter based on swell
  applySwells: (swells: Record<number, number>) => void;
  teardown: () => void;
}

// ── helpers ──────────────────────────────────────────────────────────────────

function setPannerPos(
  panner: PannerNode,
  x: number, y: number, z: number,
  when: number,
  tc = 0.04,
): void {
  const p = panner as AudioParamPanner;
  if (p.positionX) {
    p.positionX.setTargetAtTime(x, when, tc);
    p.positionY.setTargetAtTime(y, when, tc);
    p.positionZ.setTargetAtTime(z, when, tc);
  } else {
    (panner as unknown as { setPosition: (x: number, y: number, z: number) => void }).setPosition(x, y, z);
  }
}

function setListenerForward(
  listener: AudioListener,
  yaw: number,
  when: number,
): void {
  const fx = Math.sin(yaw);
  const fz = -Math.cos(yaw);
  const l = listener as AudioParamListener;
  if (l.forwardX) {
    l.forwardX.setTargetAtTime(fx, when, 0.05);
    l.forwardY.setTargetAtTime(0,  when, 0.05);
    l.forwardZ.setTargetAtTime(fz, when, 0.05);
    l.upX.setValueAtTime(0, when);
    l.upY.setValueAtTime(1, when);
    l.upZ.setValueAtTime(0, when);
  } else {
    (listener as unknown as LegacyListener).setOrientation(fx, 0, fz, 0, 1, 0);
  }
}

function initListenerPos(listener: AudioListener): void {
  const l = listener as AudioParamListener;
  if (l.positionX) {
    l.positionX.value = 0;
    l.positionY.value = 0;
    l.positionZ.value = 0;
  } else {
    (listener as unknown as LegacyListener).setPosition(0, 0, 0);
  }
}

// ── per-animal synthesis ──────────────────────────────────────────────────────
// Each animal gets its own character via oscillator type + filter shaping.
// Returns { osc nodes to stop, starting level }.

function buildAnimalVoice(
  ctx: AudioContext,
  animal: Animal,
  dest: AudioNode,
): AnimalAudio {
  const panner = ctx.createPanner();
  panner.panningModel = "HRTF";
  panner.distanceModel = "inverse";
  panner.refDistance = 1;
  panner.rolloffFactor = 0.9;
  panner.coneOuterAngle = 360;
  panner.coneInnerAngle = 360;

  const filter = ctx.createBiquadFilter();
  const gain   = ctx.createGain();

  // signal chain: oscillators → filter → gain → panner → dest
  filter.connect(gain);
  gain.connect(panner);
  panner.connect(dest);

  const stoppers: OscillatorNode[] = [];

  switch (animal.timbre) {
    case "owl": {
      // Soft sine + quiet sub-octave — warm hoot
      filter.type = "lowpass";
      filter.frequency.value = 900;
      filter.Q.value = 0.5;
      gain.gain.value = 0.28;

      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = animal.baseHz;
      // gentle tremolo via LFO
      const lfo = ctx.createOscillator();
      lfo.type = "sine";
      lfo.frequency.value = 3.8;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = animal.baseHz * 0.015;
      lfo.connect(lfoGain);
      lfoGain.connect(osc.frequency);
      lfo.start();
      osc.connect(filter);
      osc.start();
      stoppers.push(osc, lfo);
      break;
    }
    case "frog": {
      // Triangle + rhythmic AM (pluck-like)
      filter.type = "bandpass";
      filter.frequency.value = animal.baseHz * 2.5;
      filter.Q.value = 2.0;
      gain.gain.value = 0.22;

      const osc = ctx.createOscillator();
      osc.type = "triangle";
      osc.frequency.value = animal.baseHz;

      // rhythmic AM at ~2 Hz
      const am = ctx.createOscillator();
      am.type = "sine";
      am.frequency.value = 2.1;
      const amGain = ctx.createGain();
      amGain.gain.value = 0.5;
      const amBase = ctx.createGain();
      amBase.gain.value = 0.5;
      am.connect(amGain);
      amGain.connect(amBase.gain);
      osc.connect(amBase);
      amBase.connect(filter);
      am.start();
      osc.start();
      stoppers.push(osc, am);
      break;
    }
    case "bird": {
      // Bright sine, highish, lowpass smoothed — tweet-like
      filter.type = "lowpass";
      filter.frequency.value = 2800;
      filter.Q.value = 0.7;
      gain.gain.value = 0.20;

      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = animal.baseHz;
      // warble
      const wlfo = ctx.createOscillator();
      wlfo.type = "sine";
      wlfo.frequency.value = 6.5;
      const wGain = ctx.createGain();
      wGain.gain.value = animal.baseHz * 0.04;
      wlfo.connect(wGain);
      wGain.connect(osc.frequency);
      wlfo.start();
      osc.connect(filter);
      osc.start();
      stoppers.push(osc, wlfo);
      break;
    }
    case "whale": {
      // Deep sine + slow FM "moan"
      filter.type = "lowpass";
      filter.frequency.value = 400;
      filter.Q.value = 0.4;
      gain.gain.value = 0.30;

      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = animal.baseHz;

      const fmOsc = ctx.createOscillator();
      fmOsc.type = "sine";
      fmOsc.frequency.value = 0.18;
      const fmGain = ctx.createGain();
      fmGain.gain.value = animal.baseHz * 0.12;
      fmOsc.connect(fmGain);
      fmGain.connect(osc.frequency);
      fmOsc.start();
      osc.connect(filter);
      osc.start();
      stoppers.push(osc, fmOsc);
      break;
    }
    case "cricket": {
      // Triangle + fast tremolo (chirp feel)
      filter.type = "bandpass";
      filter.frequency.value = animal.baseHz * 3;
      filter.Q.value = 3.0;
      gain.gain.value = 0.18;

      const osc = ctx.createOscillator();
      osc.type = "triangle";
      osc.frequency.value = animal.baseHz;

      // fast tremolo ~14 Hz
      const trem = ctx.createOscillator();
      trem.type = "square";
      trem.frequency.value = 14;
      const tremGain = ctx.createGain();
      tremGain.gain.value = 0.4;
      const tremBase = ctx.createGain();
      tremBase.gain.value = 0.6;
      trem.connect(tremGain);
      tremGain.connect(tremBase.gain);
      osc.connect(tremBase);
      tremBase.connect(filter);
      trem.start();
      osc.start();
      stoppers.push(osc, trem);
      break;
    }
    case "firefly": {
      // Sine + gentle shimmer (like a music box)
      filter.type = "lowpass";
      filter.frequency.value = 1800;
      filter.Q.value = 0.6;
      gain.gain.value = 0.22;

      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = animal.baseHz;

      const osc2 = ctx.createOscillator();
      osc2.type = "sine";
      osc2.frequency.value = animal.baseHz * 2;
      const g2 = ctx.createGain();
      g2.gain.value = 0.18;
      osc2.connect(g2);
      g2.connect(filter);

      // slow pulse
      const pulse = ctx.createOscillator();
      pulse.type = "sine";
      pulse.frequency.value = 0.7;
      const pGain = ctx.createGain();
      pGain.gain.value = 0.3;
      const pBase = ctx.createGain();
      pBase.gain.value = 0.7;
      pulse.connect(pGain);
      pGain.connect(pBase.gain);
      osc.connect(pBase);
      pBase.connect(filter);
      pulse.start();
      osc.start();
      osc2.start();
      stoppers.push(osc, osc2, pulse);
      break;
    }
  }

  // Initial panner position
  const [x, y, z] = animalToXYZ(animal.azimuthRad, animal.elevationRad, PANNER_DIST);
  setPannerPos(panner, x, y, z, 0, 0);

  return {
    id: animal.id,
    panner,
    gain,
    filter,
    stoppers,
    dist: PANNER_DIST,
    swellGain: 0,
  };
}

// ── drone (always-on background) ──────────────────────────────────────────────
function buildDrone(ctx: AudioContext, dest: AudioNode): OscillatorNode[] {
  const oscs: OscillatorNode[] = [];
  for (const [hz1, hz2] of DRONE_HZ_PAIRS) {
    for (const hz of [hz1, hz2]) {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = hz;
      const g = ctx.createGain();
      g.gain.value = 0.055;
      osc.connect(g);
      g.connect(dest);
      osc.start();
      oscs.push(osc);
    }
  }
  return oscs;
}

// ── catch chime ───────────────────────────────────────────────────────────────
function buildCatchChime(ctx: AudioContext, dest: AudioNode): void {
  // Short bright D-Dorian 3-note chime: D5 A4 D5
  const notes = [587.33, 440.0, 587.33];
  notes.forEach((hz, i) => {
    const t = ctx.currentTime + i * 0.14;
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = hz;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.38, t + 0.04);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    osc.connect(g);
    g.connect(dest);
    osc.start(t);
    osc.stop(t + 0.55);
  });
}

// ── public factory ────────────────────────────────────────────────────────────
export function createHuntAudio(
  ctx: AudioContext,
  animals: Animal[],
): HuntAudio {
  // Master chain: masterGain → compressor (limiter) → destination
  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = -6;
  compressor.knee.value      = 2;
  compressor.ratio.value     = 20;
  compressor.attack.value    = 0.001;
  compressor.release.value   = 0.12;
  compressor.connect(ctx.destination);

  const masterGain = ctx.createGain();
  masterGain.gain.value = 0;
  masterGain.connect(compressor);

  // Listener origin
  initListenerPos(ctx.listener);
  // Default forward = north
  setListenerForward(ctx.listener, 0, 0);

  // Drone
  const droneOscs = buildDrone(ctx, masterGain);

  // Animal voices
  const animalAudios: AnimalAudio[] = animals.map((a) =>
    buildAnimalVoice(ctx, a, masterGain),
  );

  // Fade master in
  masterGain.gain.setValueAtTime(0, ctx.currentTime);
  masterGain.gain.linearRampToValueAtTime(0.78, ctx.currentTime + 2.5);

  function applyHeading(headingRad: number): void {
    const now = ctx.currentTime;
    setListenerForward(ctx.listener, headingRad, now);
  }

  function applySwells(swells: Record<number, number>): void {
    const now = ctx.currentTime;
    for (const aa of animalAudios) {
      const swell = swells[aa.id] ?? 0;
      aa.swellGain = swell;
      // Swell raises gain by up to +6 dB and opens the filter
      const baseGain  = 1.0 + swell * 0.85;
      aa.gain.gain.setTargetAtTime(baseGain, now, 0.08);
    }
  }

  function flyIn(id: number): void {
    const aa = animalAudios.find((a) => a.id === id);
    const animal = animals.find((a) => a.id === id);
    if (!aa || !animal) return;
    const now = ctx.currentTime;

    // Swoop from current dist down to COLLECT_DIST over 0.6 s
    const steps = 20;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const dist = PANNER_DIST + (COLLECT_DIST - PANNER_DIST) * (t * t);
      const [x, y, z] = animalToXYZ(animal.azimuthRad, animal.elevationRad, dist);
      const when = now + t * 0.6;
      setPannerPos(aa.panner, x, y, z, when, 0.02);
    }

    // After collect: settle to reduced gain near center — "in the song"
    setTimeout(() => {
      try {
        aa.gain.gain.setTargetAtTime(0.35, ctx.currentTime, 0.4);
        setPannerPos(aa.panner, 0, 0, -0.3, ctx.currentTime, 0.3);
      } catch { /* context may have closed */ }
    }, 700);
  }

  function playCatchChime(): void {
    buildCatchChime(ctx, masterGain);
  }

  function playCelebration(celebAnimals: Animal[]): void {
    // Each animal plays its note in sequence, forming a D-Dorian melody
    // Then they all play together as a chord
    const melody = [0, 3, 4, 6, 7, 9]; // scale degrees in D-Dorian
    const D_DORIAN_HZ = [
      146.83, 164.81, 174.61, 196.00, 220.00, 246.94,
      261.63, 293.66, 329.63, 349.23, 392.00, 440.00, 493.88,
    ];

    melody.forEach((deg, i) => {
      const t = ctx.currentTime + i * 0.35;
      const hz = D_DORIAN_HZ[deg];
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = hz;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.32, t + 0.06);
      g.gain.exponentialRampToValueAtTime(0.001, t + 1.1);
      osc.connect(g);
      g.connect(masterGain);
      osc.start(t);
      osc.stop(t + 1.2);
    });

    // Then the collected chord bloom — all animals' timbres together
    const chordStart = ctx.currentTime + melody.length * 0.35 + 0.4;
    celebAnimals.forEach((animal, i) => {
      const t = chordStart + i * 0.1;
      const osc = ctx.createOscillator();
      osc.type = animal.waveType;
      osc.frequency.value = animal.baseHz;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.22, t + 0.25);
      g.gain.setTargetAtTime(0.14, t + 1.5, 0.8);
      g.gain.setTargetAtTime(0.001, t + 4.0, 0.5);
      osc.connect(g);
      g.connect(masterGain);
      osc.start(t);
      osc.stop(t + 7.0);
    });
  }

  function teardown(): void {
    // Stop all drone oscillators
    for (const osc of droneOscs) {
      try { osc.stop(); } catch { /* already stopped */ }
    }
    // Stop all animal voice oscillators
    for (const aa of animalAudios) {
      for (const stopper of aa.stoppers) {
        try { stopper.stop(); } catch { /* already stopped */ }
      }
      try { aa.panner.disconnect(); } catch { /* noop */ }
      try { aa.gain.disconnect(); } catch { /* noop */ }
      try { aa.filter.disconnect(); } catch { /* noop */ }
    }
    try { masterGain.disconnect(); } catch { /* noop */ }
    try { compressor.disconnect(); } catch { /* noop */ }
    ctx.close().catch(() => undefined);
  }

  return {
    ctx,
    animals: animalAudios,
    masterGain,
    applyHeading,
    flyIn,
    playCelebration,
    playCatchChime,
    applySwells,
    teardown,
  };
}
