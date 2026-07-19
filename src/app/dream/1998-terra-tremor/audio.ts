// ─────────────────────────────────────────────────────────────────────────────
// audio.ts — the planet as an instrument.
//
// Two layers:
//   1. A continuous, deep TECTONIC DRONE whose fundamental slowly rises and
//      thickens as the running rate of seismic-energy release climbs (busier
//      Earth → the ground hums harder). Its pitch material is a modal scale that
//      DRIFTS every ~40s — the drone audibly changes key over minutes. It is NOT
//      a fixed just-intonation partial stack.
//   2. Each quake = a STRUCK low resonance (a tiny modal bell + noise transient):
//        magnitude → energy/loudness + register (bigger = lower, louder, longer)
//        depth (km) → timbre brightness (deep quake = darker low-pass)
//        longitude → stereo pan (−180..180 → −1..1)
//
// All pitches snap to the CURRENT drifting mode, so struck quakes and the drone
// stay in the same slowly-turning key. Everything runs off AudioContext.currentTime.
// ─────────────────────────────────────────────────────────────────────────────

import type { Quake } from "./feed";

// Modal palette — plain semitone sets over a low root. The set is swapped slowly
// over time; NOTHING here is a hardcoded JI partial stack.
const MODES: { name: string; degrees: number[] }[] = [
  { name: "Aeolian pentatone", degrees: [0, 3, 5, 7, 10] },
  { name: "Ionian pentatone", degrees: [0, 2, 4, 7, 9] },
  { name: "Dorian hexad", degrees: [0, 2, 3, 5, 7, 10] },
  { name: "Phrygian shade", degrees: [0, 1, 5, 7, 8] },
  { name: "Whole-tone drift", degrees: [0, 2, 4, 6, 8, 10] },
  { name: "Suspended fourths", degrees: [0, 3, 5, 7, 10] },
];
const MODE_SECONDS = 40; // a new mode roughly every 40s

const ROOT_MIDI = 22; // ≈ 29.1 Hz — a deep tectonic root
const MASTER = 0.5; // headroom; per-voice gains are small

function midiToFreq(m: number): number {
  return 440 * Math.pow(2, (m - 69) / 12);
}
function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export interface TremorEngine {
  now(): number;
  elapsed(): number;
  /** Struck resonance for one quake. */
  strike(q: Quake): void;
  /** Drive 0..1 for the drone (running normalized energy rate). */
  setEnergy(drive: number): void;
  setMuted(m: boolean): void;
  setMaster(v: number): void;
  modeName(): string;
  stop(): void;
}

export function createEngine(ctx: AudioContext): TremorEngine {
  const epoch = ctx.currentTime + 0.05;
  const elapsed = () => ctx.currentTime - epoch;

  function currentMode() {
    const idx = Math.floor(elapsed() / MODE_SECONDS) % MODES.length;
    return MODES[((idx % MODES.length) + MODES.length) % MODES.length];
  }

  // Snap an absolute midi value to the nearest degree of the current mode.
  function snap(midi: number): number {
    const mode = currentMode();
    const rel = midi - ROOT_MIDI;
    const octave = Math.floor(rel / 12);
    const pc = rel - octave * 12;
    let best = mode.degrees[0];
    let bestD = Infinity;
    for (const d of mode.degrees) {
      const dist = Math.abs(d - pc);
      if (dist < bestD) {
        bestD = dist;
        best = d;
      }
    }
    return ROOT_MIDI + octave * 12 + best;
  }

  // ── Master chain: everything → userGain → compressor → destination ─────────
  const userGain = ctx.createGain();
  userGain.gain.value = MASTER;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -16;
  comp.ratio.value = 3.5;
  comp.attack.value = 0.005;
  comp.release.value = 0.3;
  userGain.connect(comp).connect(ctx.destination);

  // ── Tectonic drone ─────────────────────────────────────────────────────────
  // Three voices: root, a color voice (a degree near a fifth), and a thickness
  // octave whose gain grows with energy. A slow filter sweep keeps it breathing.
  const droneGain = ctx.createGain();
  droneGain.gain.value = 0.0001;
  droneGain.gain.setTargetAtTime(0.34, epoch, 1.5); // slow fade-in, no click

  const droneLP = ctx.createBiquadFilter();
  droneLP.type = "lowpass";
  droneLP.frequency.value = 240;
  droneLP.Q.value = 0.7;
  droneLP.connect(droneGain).connect(userGain);

  const droneFilterLfo = ctx.createOscillator();
  droneFilterLfo.type = "sine";
  droneFilterLfo.frequency.value = 0.05;
  const droneFilterLfoGain = ctx.createGain();
  droneFilterLfoGain.gain.value = 40;
  droneFilterLfo.connect(droneFilterLfoGain).connect(droneLP.frequency);
  droneFilterLfo.start(epoch);

  function makeDroneVoice(kind: "saw" | "triangle", gain: number, detune: number) {
    const osc = ctx.createOscillator();
    osc.type = kind === "saw" ? "sawtooth" : "triangle";
    osc.detune.value = detune;
    const g = ctx.createGain();
    g.gain.value = gain;
    osc.connect(g).connect(droneLP);
    osc.start(epoch);
    return { osc, g };
  }
  const dRoot = makeDroneVoice("saw", 0.55, -4);
  const dColor = makeDroneVoice("triangle", 0.32, +5);
  const dThick = makeDroneVoice("triangle", 0.0001, +2); // thickness, energy-driven

  let energyDrive = 0;
  function setEnergy(drive: number) {
    energyDrive = clamp(drive, 0, 1);
    const mode = currentMode();
    // Busier Earth → root climbs up to ~+5 semitones, and the octave thickens.
    const rootMidi = ROOT_MIDI + energyDrive * 5;
    const fifthDeg =
      mode.degrees.reduce(
        (best, d) => (Math.abs(d - 7) < Math.abs(best - 7) ? d : best),
        mode.degrees[0],
      );
    const colorMidi = rootMidi + fifthDeg;
    const thickMidi = rootMidi + 12 + mode.degrees[Math.min(1, mode.degrees.length - 1)];
    const t = ctx.currentTime;
    dRoot.osc.frequency.setTargetAtTime(midiToFreq(rootMidi), t, 2.0);
    dColor.osc.frequency.setTargetAtTime(midiToFreq(colorMidi), t, 2.5);
    dThick.osc.frequency.setTargetAtTime(midiToFreq(thickMidi), t, 2.5);
    dThick.g.gain.setTargetAtTime(0.0001 + energyDrive * 0.3, t, 1.5);
    droneLP.frequency.setTargetAtTime(200 + energyDrive * 520, t, 2.0);
  }
  setEnergy(0);

  // ── Struck quake resonance ─────────────────────────────────────────────────
  const voices = new Set<OscillatorNode | AudioBufferSourceNode>();

  function strike(q: Quake): void {
    const t = ctx.currentTime + 0.01;
    const m = clamp(q.mag, 0, 8); // pitch/energy use the non-negative magnitude
    // Register: bigger quake → lower. mag 0 ≈ 185 Hz, mag 5 ≈ 46 Hz, mag 7 ≈ 27 Hz.
    const targetMidi = snap(46 - m * 3.1);
    const f = midiToFreq(targetMidi);
    const peak = clamp(0.05 + m * 0.055, 0.02, 0.55);
    const dur = 0.45 + m * 0.55; // bigger = longer decay

    // Depth → brightness: shallow bright, deep dark.
    const depth = clamp(q.depth, 0, 650);
    const cutoff = 220 + 3200 * Math.exp(-depth / 190);
    const pan = clamp(q.lon / 180, -1, 1);

    const panner = ctx.createStereoPanner();
    panner.pan.value = pan;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = cutoff;
    lp.Q.value = 1.1;
    lp.connect(panner).connect(userGain);

    // Modal bell: fundamental + two inharmonic-ish partials, struck envelope.
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.exponentialRampToValueAtTime(peak, t + 0.008);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    amp.connect(lp);

    const partials: [number, number][] = [
      [1, 1],
      [2.01, 0.4],
      [3.02, 0.18],
    ];
    for (const [ratio, g] of partials) {
      const osc = ctx.createOscillator();
      osc.type = "triangle";
      osc.frequency.value = f * ratio;
      const pg = ctx.createGain();
      pg.gain.value = g;
      osc.connect(pg).connect(amp);
      osc.start(t);
      osc.stop(t + dur + 0.05);
      voices.add(osc);
      osc.onended = () => voices.delete(osc);
    }

    // Struck transient: a short filtered noise burst gives the "impact".
    const noiseLen = 0.09;
    const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * noiseLen), ctx.sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < ch.length; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / ch.length);
    const noise = ctx.createBufferSource();
    noise.buffer = buf;
    const nGain = ctx.createGain();
    nGain.gain.setValueAtTime(peak * 0.5, t);
    nGain.gain.exponentialRampToValueAtTime(0.0001, t + noiseLen);
    noise.connect(nGain).connect(lp);
    noise.start(t);
    noise.stop(t + noiseLen + 0.02);
    voices.add(noise);
    noise.onended = () => voices.delete(noise);
  }

  let muted = false;
  let masterUser = 1;
  function apply() {
    userGain.gain.setTargetAtTime(muted ? 0 : MASTER * masterUser, ctx.currentTime, 0.05);
  }

  return {
    now: () => ctx.currentTime,
    elapsed,
    strike,
    setEnergy,
    setMuted: (mm: boolean) => {
      muted = mm;
      apply();
    },
    setMaster: (v: number) => {
      masterUser = clamp(v, 0, 1);
      apply();
    },
    modeName: () => currentMode().name,
    stop: () => {
      try {
        droneFilterLfo.stop();
      } catch {
        /* already stopped */
      }
      for (const v of [dRoot.osc, dColor.osc, dThick.osc]) {
        try {
          v.stop();
        } catch {
          /* already stopped */
        }
      }
      voices.forEach((v) => {
        try {
          v.stop();
        } catch {
          /* already stopped */
        }
      });
      voices.clear();
      try {
        userGain.disconnect();
        comp.disconnect();
        droneGain.disconnect();
        droneLP.disconnect();
      } catch {
        /* nodes already gone */
      }
    },
  };
}
