// Web Audio engine for the rain-shaker.
// ────────────────────────────────────────────────────────────────────────────
// Three layers, all summed through a final DynamicsCompressor used as a hard
// limiter so the output can NEVER blast — important because kids shake HARD.
//
//   1. PAD     — always-on soft D-Dorian drone (a couple of detuned triangle
//                oscillators through a slow lowpass). Keeps it from ever being
//                silent.
//   2. RAINSTICK — a continuous trickle of short filtered-noise "beads" whose
//                spawn rate and brightness track the live shake-energy envelope.
//                Gentle shakes = sparse soft trickle; big shakes = a tumble.
//   3. BELLS    — struck on discrete shake-HIT events. Warm FM-ish chime voices
//                tuned to a D-Dorian set, panned, velocity from hit strength.
//
// Scale: D-Dorian = D E F G A B C (explicitly NOT C-major-pentatonic).

export const SCALE_NAMES = ["D", "E", "F", "G", "A", "B", "C", "D"];

// D-Dorian across ~1.5 octaves, warm mid register (Hz).
const BELL_HZ = [
  146.83, // D3
  164.81, // E3
  174.61, // F3
  196.0, // G3
  220.0, // A3
  246.94, // B3
  261.63, // C4
  293.66, // D4
];

// pad held tones (low D, A, and a soft C for the dorian colour)
const PAD_HZ = [73.42, 110.0, 130.81];

export interface RainAudio {
  /** spawn rainstick beads to match the current normalised shake energy 0..1 */
  setEnergy: (energy: number) => void;
  /** strike a bell — strength 0..~1.6 from a shake hit */
  strike: (strength: number) => void;
  /** advance bead spawning; call each animation frame with dt seconds */
  tick: (dt: number) => void;
  dispose: () => void;
}

export function createRainAudio(ctx: AudioContext): RainAudio {
  // ── master limiter chain ──────────────────────────────────────────────────
  const master = ctx.createGain();
  master.gain.value = 0.9;

  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -10;
  limiter.knee.value = 6;
  limiter.ratio.value = 20; // brick-wall-ish
  limiter.attack.value = 0.003;
  limiter.release.value = 0.18;

  master.connect(limiter);
  limiter.connect(ctx.destination);

  // ── 1. PAD bed ──────────────────────────────────────────────────────────────
  const padGain = ctx.createGain();
  padGain.gain.value = 0.0;
  const padFilter = ctx.createBiquadFilter();
  padFilter.type = "lowpass";
  padFilter.frequency.value = 520;
  padFilter.Q.value = 0.4;
  padGain.connect(padFilter);
  padFilter.connect(master);

  const padOscs: OscillatorNode[] = [];
  for (const hz of PAD_HZ) {
    const a = ctx.createOscillator();
    a.type = "triangle";
    a.frequency.value = hz;
    const b = ctx.createOscillator();
    b.type = "triangle";
    b.frequency.value = hz * 1.004; // slight detune for warmth
    a.connect(padGain);
    b.connect(padGain);
    a.start();
    b.start();
    padOscs.push(a, b);
  }
  // slow swell up so it doesn't pop in
  padGain.gain.setValueAtTime(0.0, ctx.currentTime);
  padGain.gain.linearRampToValueAtTime(0.16, ctx.currentTime + 2.0);

  // gentle breathing LFO on the pad filter
  const padLfo = ctx.createOscillator();
  padLfo.frequency.value = 0.07;
  const padLfoGain = ctx.createGain();
  padLfoGain.gain.value = 160;
  padLfo.connect(padLfoGain);
  padLfoGain.connect(padFilter.frequency);
  padLfo.start();

  // ── 2. RAINSTICK beads ──────────────────────────────────────────────────────
  // We pre-render a short noise buffer and play tiny windowed grains of it
  // through a bandpass to make a soft "bead" tick. Spawn rate scales with energy.
  const NOISE_LEN = ctx.sampleRate * 0.5;
  const noiseBuf = ctx.createBuffer(1, NOISE_LEN, ctx.sampleRate);
  const nd = noiseBuf.getChannelData(0);
  for (let i = 0; i < NOISE_LEN; i++) nd[i] = Math.random() * 2 - 1;

  const rainBus = ctx.createGain();
  rainBus.gain.value = 0.0;
  rainBus.connect(master);
  // gentle always-present trickle floor
  rainBus.gain.setValueAtTime(0.0, ctx.currentTime);
  rainBus.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 1.5);

  let energy = 0; // smoothed 0..1+
  let spawnAcc = 0;

  function spawnBead() {
    const now = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const off = Math.random() * (0.5 - 0.06);
    src.playbackRate.value = 0.8 + Math.random() * 0.6;

    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    // brighter beads as energy rises
    const f = 1400 + Math.random() * 2600 + energy * 2400;
    bp.frequency.value = f;
    bp.Q.value = 6 + Math.random() * 8;

    const g = ctx.createGain();
    const dur = 0.03 + Math.random() * 0.04;
    const peak = 0.05 + Math.min(0.18, energy * 0.22);
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(peak, now + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0008, now + dur);

    const pan = ctx.createStereoPanner();
    pan.pan.value = (Math.random() * 2 - 1) * 0.8;

    src.connect(bp);
    bp.connect(g);
    g.connect(pan);
    pan.connect(rainBus);
    src.start(now, off, dur + 0.02);
    src.stop(now + dur + 0.05);
    src.onended = () => {
      src.disconnect();
      bp.disconnect();
      g.disconnect();
      pan.disconnect();
    };
  }

  // ── 3. BELLS ────────────────────────────────────────────────────────────────
  const bellBus = ctx.createGain();
  bellBus.gain.value = 0.5;
  // soft lowpass so high strikes never get piercing (kid-safe)
  const bellTone = ctx.createBiquadFilter();
  bellTone.type = "lowpass";
  bellTone.frequency.value = 3200;
  bellTone.Q.value = 0.5;
  bellBus.connect(bellTone);
  bellTone.connect(master);

  function strike(strength: number) {
    const now = ctx.currentTime;
    const s = Math.max(0.05, Math.min(1.4, strength));
    // bigger shakes climb higher up the scale (warmer→brighter shower)
    const lo = Math.floor((1 - Math.min(1, s)) * 3); // softer hits stay low
    const idx = Math.min(
      BELL_HZ.length - 1,
      lo + Math.floor(Math.random() * 3),
    );
    const hz = BELL_HZ[idx];

    // simple 2-op FM bell: carrier + modulator
    const car = ctx.createOscillator();
    car.type = "sine";
    car.frequency.value = hz;
    const mod = ctx.createOscillator();
    mod.type = "sine";
    mod.frequency.value = hz * 1.41; // inharmonic-ish ratio for a chime shimmer
    const modGain = ctx.createGain();
    modGain.gain.setValueAtTime(hz * (0.9 + s * 1.2), now);
    modGain.gain.exponentialRampToValueAtTime(hz * 0.05, now + 0.5);
    mod.connect(modGain);
    modGain.connect(car.frequency);

    const g = ctx.createGain();
    const peak = 0.12 + s * 0.22;
    const dur = 0.9 + s * 1.4;
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(peak, now + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0006, now + dur);

    const pan = ctx.createStereoPanner();
    pan.pan.value = (Math.random() * 2 - 1) * 0.6;

    car.connect(g);
    g.connect(pan);
    pan.connect(bellBus);

    car.start(now);
    mod.start(now);
    car.stop(now + dur + 0.1);
    mod.stop(now + dur + 0.1);
    const cleanup = () => {
      car.disconnect();
      mod.disconnect();
      modGain.disconnect();
      g.disconnect();
      pan.disconnect();
    };
    car.onended = cleanup;
  }

  function setEnergy(e: number) {
    energy = Math.max(0, e);
  }

  function tick(dt: number) {
    // spawn rate: a soft floor trickle even at rest, surging with energy.
    // beads/sec from ~5 (rest) up to ~140 (vigorous shake).
    const rate = 5 + energy * 135;
    spawnAcc += rate * dt;
    let budget = 12; // cap spawns per frame so a long stall can't dump a wall
    while (spawnAcc >= 1 && budget > 0) {
      spawnBead();
      spawnAcc -= 1;
      budget--;
    }
    if (spawnAcc > 4) spawnAcc = 4;
  }

  function dispose() {
    const now = ctx.currentTime;
    try {
      padGain.gain.cancelScheduledValues(now);
      padGain.gain.linearRampToValueAtTime(0, now + 0.15);
    } catch {
      /* ignore */
    }
    window.setTimeout(() => {
      for (const o of padOscs) {
        try {
          o.stop();
          o.disconnect();
        } catch {
          /* ignore */
        }
      }
      try {
        padLfo.stop();
        padLfo.disconnect();
        padLfoGain.disconnect();
      } catch {
        /* ignore */
      }
      try {
        padGain.disconnect();
        padFilter.disconnect();
        rainBus.disconnect();
        bellBus.disconnect();
        bellTone.disconnect();
        master.disconnect();
        limiter.disconnect();
      } catch {
        /* ignore */
      }
    }, 200);
  }

  return { setEnergy, strike, tick, dispose };
}
