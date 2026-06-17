// weather-engine.ts
//
// The harmonic heart of "Weather in Your Hands".
//
// A continuous MODE-MORPH driven by one scalar `energy` in [0,1]:
//   energy = 0  -> bright SUNNY world  (major / Lydian: natural 3rd, raised 6th)
//   energy = 1  -> dark STORMY world   (Aeolian / Dorian minor: flat 3rd, flat 6th)
//
// This is a REAL harmonic event, not a pentatonic scale-snap. The chord's
// THIRD and SIXTH physically slide / crossfade between two voicings that share
// the same root drone, so the listener hears the chord change *quality*
// (major <-> minor) rather than just picking "safe" notes from a pentatonic
// scale. We literally cross-fade two stacks of partial-tones tuned to a major
// set and a minor set, plus we bend the third's pitch so the morph is audible
// as a moving interval, not just a level dip.
//
// Self-contained. No npm audio deps. Web Audio only.

type AC = AudioContext;

// ---- tuning ---------------------------------------------------------------
// Root drone = A2. Equal-tempered ratios from the root.
const ROOT_HZ = 110; // A2

// Interval ratios (12-TET) relative to root.
const R = (semis: number) => Math.pow(2, semis / 12);

// SUNNY voicing (Lydian-ish bright major):
//   root, M3 (+4), P5 (+7), M6 (+9), M7 (+11 -> octave shimmer), +#11 sparkle.
// STORMY voicing (Aeolian/Dorian minor):
//   root, m3 (+3), P5 (+7), m6 (+8), b7 (+10).
//
// The two crucial movers are the THIRD (4 <-> 3 semis) and the SIXTH
// (9 <-> 8 semis). We model the third as a single oscillator that BENDS in
// pitch (audible mode flip), and the sixth as a crossfaded pair.

export interface WeatherEngine {
  start(): void;
  // energy in [0,1]: 0 sunny, 1 stormy. Smoothed internally.
  setEnergy(e: number): void;
  // 0..1 normalized current (smoothed) energy, for visuals.
  getEnergy(): number;
  dispose(): void;
}

export function makeWeatherEngine(ac: AC, master: AudioNode): WeatherEngine {
  const now0 = ac.currentTime;

  // --- shared bus with gentle low-pass that opens slightly with energy ----
  const bus = ac.createGain();
  bus.gain.value = 1;

  const tone = ac.createBiquadFilter();
  tone.type = "lowpass";
  tone.frequency.value = 1400;
  tone.Q.value = 0.4;

  bus.connect(tone);
  tone.connect(master);

  // --- root drone (two detuned saws softened, octave pad) -----------------
  const droneGain = ac.createGain();
  droneGain.gain.value = 0;
  droneGain.connect(bus);

  const drone: OscillatorNode[] = [];
  const makeDrone = (hz: number, type: OscillatorType, detune: number, lvl: number) => {
    const o = ac.createOscillator();
    o.type = type;
    o.frequency.value = hz;
    o.detune.value = detune;
    const g = ac.createGain();
    g.gain.value = lvl;
    o.connect(g);
    g.connect(droneGain);
    drone.push(o);
  };
  makeDrone(ROOT_HZ, "sine", 0, 0.5);
  makeDrone(ROOT_HZ, "triangle", -6, 0.22);
  makeDrone(ROOT_HZ * 2, "sine", +4, 0.18);
  makeDrone(ROOT_HZ * R(7), "sine", 0, 0.16); // P5: stable in both modes

  // --- the THIRD: one oscillator that BENDS between m3 and M3 --------------
  // This is the single most audible "mode flip" — the third slides.
  const thirdOsc = ac.createOscillator();
  thirdOsc.type = "sine";
  thirdOsc.frequency.value = ROOT_HZ * R(4); // start major-ish
  const thirdGain = ac.createGain();
  thirdGain.gain.value = 0;
  thirdOsc.connect(thirdGain);
  thirdGain.connect(bus);
  // octave doubling of the third for body
  const thirdOsc2 = ac.createOscillator();
  thirdOsc2.type = "triangle";
  thirdOsc2.frequency.value = ROOT_HZ * 2 * R(4);
  const thirdGain2 = ac.createGain();
  thirdGain2.gain.value = 0;
  thirdOsc2.connect(thirdGain2);
  thirdGain2.connect(bus);

  // --- the SIXTH: crossfaded pair M6 (sunny) <-> m6 (stormy) --------------
  const sixSun = ac.createOscillator();
  sixSun.type = "sine";
  sixSun.frequency.value = ROOT_HZ * 2 * R(9); // M6 up an octave
  const sixSunG = ac.createGain();
  sixSunG.gain.value = 0;
  sixSun.connect(sixSunG);
  sixSunG.connect(bus);

  const sixStorm = ac.createOscillator();
  sixStorm.type = "sine";
  sixStorm.frequency.value = ROOT_HZ * 2 * R(8); // m6 up an octave
  const sixStormG = ac.createGain();
  sixStormG.gain.value = 0;
  sixStorm.connect(sixStormG);
  sixStormG.connect(bus);

  // --- SUN sparkle (Lydian #11 + M7 shimmer), fades out as it storms ------
  const sparkle = ac.createOscillator();
  sparkle.type = "sine";
  sparkle.frequency.value = ROOT_HZ * 4 * R(6); // #11 high sparkle
  const sparkleG = ac.createGain();
  sparkleG.gain.value = 0;
  sparkle.connect(sparkleG);
  sparkleG.connect(bus);

  // --- STORM color (b7 tension), fades in as it storms --------------------
  const seven = ac.createOscillator();
  seven.type = "triangle";
  seven.frequency.value = ROOT_HZ * R(10); // b7
  const sevenG = ac.createGain();
  sevenG.gain.value = 0;
  seven.connect(sevenG);
  sevenG.connect(bus);

  // --- slow LFO that quickens with energy (sky "breathing"/wind) ----------
  const lfo = ac.createOscillator();
  lfo.type = "sine";
  lfo.frequency.value = 0.08;
  const lfoDepth = ac.createGain();
  lfoDepth.gain.value = 2.5;
  lfo.connect(lfoDepth);
  lfoDepth.connect(droneGain.gain);

  // --- rain/wind noise that grows with storm ------------------------------
  const noiseBuf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
  const nd = noiseBuf.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
  const noise = ac.createBufferSource();
  noise.buffer = noiseBuf;
  noise.loop = true;
  const noiseBP = ac.createBiquadFilter();
  noiseBP.type = "bandpass";
  noiseBP.frequency.value = 600;
  noiseBP.Q.value = 0.7;
  const noiseG = ac.createGain();
  noiseG.gain.value = 0;
  noise.connect(noiseBP);
  noiseBP.connect(noiseG);
  noiseG.connect(bus);

  const oscs: (OscillatorNode | AudioBufferSourceNode)[] = [
    ...drone,
    thirdOsc,
    thirdOsc2,
    sixSun,
    sixStorm,
    sparkle,
    seven,
    lfo,
    noise,
  ];

  let started = false;
  let smooth = 0; // smoothed energy
  let target = 0;

  function start() {
    if (started) return;
    started = true;
    // soft attack on the drone
    droneGain.gain.cancelScheduledValues(ac.currentTime);
    droneGain.gain.setValueAtTime(0, ac.currentTime);
    droneGain.gain.linearRampToValueAtTime(0.22, ac.currentTime + 2.0);
    oscs.forEach((o) => o.start());
    apply(0); // settle to sunny
  }

  // Map smoothed energy -> all the per-voice params with soft ramps.
  function apply(e: number) {
    const t = ac.currentTime;
    const tc = 0.18; // smoothing time constant for setTargetAtTime
    const lvl = 0.14; // per-voice base level (kept low; master also caps)

    // THIRD bends from M3 (4 semis) at e=0 to m3 (3 semis) at e=1.
    const thirdSemis = 4 - 1 * e;
    thirdOsc.frequency.setTargetAtTime(ROOT_HZ * R(thirdSemis), t, tc);
    thirdOsc2.frequency.setTargetAtTime(ROOT_HZ * 2 * R(thirdSemis), t, tc);
    // third stays present throughout (it's the carrier of the mode flip)
    thirdGain.gain.setTargetAtTime(lvl * 0.9, t, tc);
    thirdGain2.gain.setTargetAtTime(lvl * 0.4, t, tc);

    // SIXTH crossfade: M6 (sunny) -> m6 (stormy)
    sixSunG.gain.setTargetAtTime(lvl * 0.6 * (1 - e), t, tc);
    sixStormG.gain.setTargetAtTime(lvl * 0.6 * e, t, tc);

    // SUN sparkle fades out; STORM b7 + noise fade in.
    sparkleG.gain.setTargetAtTime(lvl * 0.18 * (1 - e) * (1 - e), t, tc);
    sevenG.gain.setTargetAtTime(lvl * 0.5 * e, t, tc);
    noiseG.gain.setTargetAtTime(0.05 * e * e, t, tc);

    // Storm: open the lowpass a touch (more air/edge), quicken the breathing.
    tone.frequency.setTargetAtTime(1400 + 1600 * e, t, tc);
    lfo.frequency.setTargetAtTime(0.08 + 0.5 * e, t, tc);
    lfoDepth.gain.setTargetAtTime(2.5 + 6 * e, t, tc);
    // noise band rises with storm (rain hiss -> wind)
    noiseBP.frequency.setTargetAtTime(500 + 1800 * e, t, tc);

    // Slight overall lift when stormy so it feels weightier (still capped).
    droneGain.gain.setTargetAtTime(0.22 + 0.06 * e, t, tc);
  }

  // smoothing loop driven by setEnergy callers (we step on each set call,
  // but also expose getEnergy that interpolates). To keep it gentle and
  // independent of caller cadence, we run our own light interpolation here.
  let lastT = now0;
  function setEnergy(e: number) {
    target = Math.max(0, Math.min(1, e));
    const t = ac.currentTime;
    const dt = Math.max(0, Math.min(0.1, t - lastT));
    lastT = t;
    // critically-damped-ish approach
    const k = 1 - Math.exp(-dt / 0.45);
    smooth += (target - smooth) * k;
    if (started) apply(smooth);
  }

  function getEnergy() {
    return smooth;
  }

  function dispose() {
    const t = ac.currentTime;
    droneGain.gain.cancelScheduledValues(t);
    droneGain.gain.setTargetAtTime(0, t, 0.3);
    bus.gain.setTargetAtTime(0, t, 0.3);
    const stopAt = t + 0.8;
    oscs.forEach((o) => {
      try {
        o.stop(stopAt);
      } catch {
        // already stopped
      }
    });
    // disconnect a moment later
    setTimeout(() => {
      try {
        tone.disconnect();
        bus.disconnect();
        droneGain.disconnect();
      } catch {
        // ignore
      }
    }, 1000);
  }

  return { start, setEnergy, getEnergy, dispose };
}
