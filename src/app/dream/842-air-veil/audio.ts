// Inharmonic / roughness synthesis engine.
// One "voice" per city. Clean air -> pure just-intonation harmonic partials.
// Dirty air -> add inharmonic partials, amplitude beating, detune. The chord "fouls".

// Just-intonation ratios over a fixed center, one per city (a sustained 6-note chord).
// Center C2 = 65.41 Hz. Ratios: 1, 5/4, 3/2, 9/8 (oct up), 5/3, 2 -> a stacked just chord.
const CENTER_HZ = 65.41;
export const CITY_RATIOS = [1, 5 / 4, 3 / 2, 9 / 4, 5 / 3 * 2, 3] as const;

// Partials used per voice. The "clean" set is harmonic (consonant).
// The "foul" set is inharmonic (stretched / irrational-ish ratios) -> beating & roughness.
const CLEAN_PARTIALS = [1, 2, 3];
const FOUL_PARTIALS = [2.1, 3.34, 4.7];

export interface Voice {
  // clean harmonic oscillators
  cleanOscs: OscillatorNode[];
  cleanGains: GainNode[];
  // foul inharmonic oscillators (each is a detuned pair for beating)
  foulOscsA: OscillatorNode[];
  foulOscsB: OscillatorNode[];
  foulGains: GainNode[];
  voiceGain: GainNode;
  baseHz: number;
}

export interface AirAudioEngine {
  ctx: AudioContext;
  master: GainNode;
  lowpass: BiquadFilterNode;
  comp: DynamicsCompressorNode;
  drone: OscillatorNode;
  droneGain: GainNode;
  voices: Voice[];
}

const RAMP = 0.8; // setTargetAtTime time-constant (sec) for click-free morphs

export function makeEngine(ctx: AudioContext, cityCount: number): AirAudioEngine {
  const master = ctx.createGain();
  master.gain.value = 0.28;

  const lowpass = ctx.createBiquadFilter();
  lowpass.type = "lowpass";
  lowpass.frequency.value = 2000; // opens up as tension rises
  lowpass.Q.value = 0.7;

  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -18;
  comp.knee.value = 24;
  comp.ratio.value = 4;
  comp.attack.value = 0.01;
  comp.release.value = 0.25;

  master.connect(lowpass);
  lowpass.connect(comp);
  comp.connect(ctx.destination);

  // Low sub drone that thickens with aggregate tension.
  const drone = ctx.createOscillator();
  drone.type = "sine";
  drone.frequency.value = CENTER_HZ / 2; // sub-octave
  const droneGain = ctx.createGain();
  droneGain.gain.value = 0.0;
  drone.connect(droneGain);
  droneGain.connect(master);
  drone.start();

  const voices: Voice[] = [];
  for (let i = 0; i < cityCount; i++) {
    const ratio = CITY_RATIOS[i % CITY_RATIOS.length];
    const baseHz = CENTER_HZ * ratio;

    const voiceGain = ctx.createGain();
    voiceGain.gain.value = 0.0;
    voiceGain.connect(master);

    const cleanOscs: OscillatorNode[] = [];
    const cleanGains: GainNode[] = [];
    for (const p of CLEAN_PARTIALS) {
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = baseHz * p;
      const g = ctx.createGain();
      g.gain.value = 1 / (p * 1.5); // higher partials quieter
      o.connect(g);
      g.connect(voiceGain);
      o.start();
      cleanOscs.push(o);
      cleanGains.push(g);
    }

    const foulOscsA: OscillatorNode[] = [];
    const foulOscsB: OscillatorNode[] = [];
    const foulGains: GainNode[] = [];
    for (const p of FOUL_PARTIALS) {
      const g = ctx.createGain();
      g.gain.value = 0.0; // silent until fouling rises
      g.connect(voiceGain);
      // detuned pair -> amplitude beating (a few Hz apart)
      const a = ctx.createOscillator();
      a.type = "sine";
      a.frequency.value = baseHz * p;
      const b = ctx.createOscillator();
      b.type = "sine";
      b.frequency.value = baseHz * p + 2.5; // beat partner
      a.connect(g);
      b.connect(g);
      a.start();
      b.start();
      foulOscsA.push(a);
      foulOscsB.push(b);
      foulGains.push(g);
    }

    voices.push({
      cleanOscs,
      cleanGains,
      foulOscsA,
      foulOscsB,
      foulGains,
      voiceGain,
      baseHz,
    });
  }

  return { ctx, master, lowpass, comp, drone, droneGain, voices };
}

// foul: 0 (clean) .. 1 (hazardous). present: voice audible at all.
export function applyVoice(
  eng: AirAudioEngine,
  i: number,
  foul: number,
  present: number,
) {
  const v = eng.voices[i];
  if (!v) return;
  const t = eng.ctx.currentTime;
  const f = Math.max(0, Math.min(1, foul));

  // Overall voice level — fades a touch as it fouls so it does not dominate.
  const lvl = (0.16 * present) * (1 - 0.25 * f);
  v.voiceGain.gain.setTargetAtTime(lvl, t, RAMP);

  // Clean partials recede as fouling rises.
  for (let k = 0; k < v.cleanGains.length; k++) {
    const p = CLEAN_PARTIALS[k];
    const base = 1 / (p * 1.5);
    v.cleanGains[k].gain.setTargetAtTime(base * (1 - 0.7 * f), t, RAMP);
    // detune the harmonic partials slightly as it fouls -> loss of purity
    v.cleanOscs[k].detune.setTargetAtTime(f * 18 * (k % 2 === 0 ? 1 : -1), t, RAMP);
  }

  // Inharmonic partials swell in with fouling (squared for a late, ugly onset).
  for (let k = 0; k < v.foulGains.length; k++) {
    const target = 0.5 * f * f * (1 / (k + 1.4));
    v.foulGains[k].gain.setTargetAtTime(target, t, RAMP);
    // widen the beating interval as it gets dirtier -> faster, rougher beating
    const beat = 2.5 + f * 9;
    v.foulOscsB[k].frequency.setTargetAtTime(
      v.foulOscsA[k].frequency.value + beat,
      t,
      RAMP,
    );
  }
}

// tension: 0..1 aggregate. Opens master lowpass + thickens drone.
export function applyTension(eng: AirAudioEngine, tension: number) {
  const t = eng.ctx.currentTime;
  const tn = Math.max(0, Math.min(1, tension));
  const cutoff = 1400 + tn * 5600; // up to ~7kHz
  eng.lowpass.frequency.setTargetAtTime(cutoff, t, 1.2);
  eng.droneGain.gain.setTargetAtTime(0.05 + tn * 0.22, t, 1.2);
}

export function teardownEngine(eng: AirAudioEngine) {
  try {
    eng.drone.stop();
    for (const v of eng.voices) {
      v.cleanOscs.forEach((o) => o.stop());
      v.foulOscsA.forEach((o) => o.stop());
      v.foulOscsB.forEach((o) => o.stop());
    }
  } catch {
    // oscillators may already be stopped
  }
}
