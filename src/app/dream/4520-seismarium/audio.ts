// audio.ts — the sonification layer for Seismarium.
//
// THE RESEARCH FINDING (arXiv:2605.21874, 2026): an indefinite live-data stream
// only stays engaging if you impose a MUSICAL GRAMMAR — don't emit arbitrary
// tones. So every quake is a *struck modal bell* whose fundamental is snapped to
// a slowly-rotating pentatonic mode floating over a sub-bass drone that swells
// with recent seismic energy. The Earth plays an instrument, not a siren.
//
// Mapping (see README table):
//   mag     → strike energy (loudness) + register (bigger = lower, longer)
//   depthKm → timbre/decay     (deep = darker + longer, shallow = bright + short)
//   lat     → stereo pan       (north = left … south = right)
//
// No Math.random / Date.now / new Date — the AudioContext's own clock drives
// scheduling; any jitter uses a seeded PRNG passed in by the caller.

import { magNorm, depthNorm, mulberry32, type Quake } from "./quakes";

// Inharmonic partial ratios of a real struck bell (hum, prime, tierce, quint,
// nominal, ...). This inharmonicity is what makes a bell sound like a bell.
const BELL_PARTIALS = [1.0, 2.0, 2.76, 5.4, 8.93];
const BELL_GAINS = [1.0, 0.55, 0.42, 0.22, 0.12];

// Minor & major pentatonic — always consonant, never a wrong note. The active
// mode and root rotate slowly so an hour of listening keeps evolving.
const MINOR_PENT = [0, 3, 5, 7, 10];
const MAJOR_PENT = [0, 2, 4, 7, 9];
const MODES = [MINOR_PENT, MAJOR_PENT, MINOR_PENT, MAJOR_PENT];
// Root walk (a lydian-tinted circle) in semitones above the base tonic.
const ROOT_WALK = [0, 7, 2, 9, 4, -1, 5, 0];
const BASE_TONIC_HZ = 55; // A1 — everything is a transposition of this

const ROOT_ROTATE_MS = 21_000; // move the root every ~21s
const MODE_ROTATE_MS = 63_000; // swap major/minor colour every ~63s

export interface SeismicAudio {
  ctx: AudioContext;
  resume(): Promise<void>;
  isRunning(): boolean;
  strike(q: Quake, nowAudioTime: number): void;
  /** feed total recent seismic energy [0..~1] to swell the drone */
  setEnergy(e: number): void;
  dispose(): void;
}

interface DroneNodes {
  gain: GainNode;
  oscs: OscillatorNode[];
}

function midiToHz(semitonesAboveTonic: number): number {
  return BASE_TONIC_HZ * Math.pow(2, semitonesAboveTonic / 12);
}

/** Snap an arbitrary target frequency to the active rotating pentatonic mode. */
function snapToMode(targetHz: number, rootSemi: number, mode: number[]): number {
  // semitones of the target above the base tonic
  const semis = 12 * Math.log2(targetHz / BASE_TONIC_HZ);
  const rel = semis - rootSemi;
  const octave = Math.floor(rel / 12);
  const within = rel - octave * 12;
  // nearest scale degree
  let best = mode[0];
  let bestD = Infinity;
  for (const deg of mode) {
    const d = Math.abs(deg - within);
    if (d < bestD) {
      bestD = d;
      best = deg;
    }
  }
  return midiToHz(rootSemi + octave * 12 + best);
}

export function makeAudio(): SeismicAudio {
  const AC: typeof AudioContext =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext: typeof AudioContext })
      .webkitAudioContext;
  const ctx = new AC();

  // ── master chain: bus → limiter (compressor) → destination ──────────────────
  const master = ctx.createGain();
  master.gain.value = 0.9;
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -8;
  limiter.knee.value = 6;
  limiter.ratio.value = 12;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.25;
  master.connect(limiter);
  limiter.connect(ctx.destination);

  // gentle global reverb-ish tail via a feedback delay (cheap, self-contained)
  const wet = ctx.createGain();
  wet.gain.value = 0.25;
  const delay = ctx.createDelay(1.5);
  delay.delayTime.value = 0.33;
  const fb = ctx.createGain();
  fb.gain.value = 0.4;
  const tone = ctx.createBiquadFilter();
  tone.type = "lowpass";
  tone.frequency.value = 2200;
  delay.connect(fb);
  fb.connect(tone);
  tone.connect(delay);
  delay.connect(master);
  wet.connect(delay);

  // ── sub-bass drone: two detuned oscillators an octave below the tonic ────────
  const drone = makeDrone(ctx, master);

  const jitter = mulberry32(0x4520 ^ 0x9e37);
  let energy = 0;
  let disposed = false;

  function currentRoot(now: number): number {
    const i = Math.floor(now / ROOT_ROTATE_MS) % ROOT_WALK.length;
    return ROOT_WALK[i];
  }
  function currentMode(now: number): number[] {
    const i = Math.floor(now / MODE_ROTATE_MS) % MODES.length;
    return MODES[i];
  }

  function strike(q: Quake, nowAudioTime: number): void {
    if (disposed) return;
    const t = nowAudioTime;
    const mN = magNorm(q.mag);
    const dN = depthNorm(q.depthKm);

    // register: big quakes ring LOW, tiny quakes sparkle HIGH (up to +3 oct)
    const targetHz = BASE_TONIC_HZ * Math.pow(2, 1.2 + (1 - mN) * 3.0);
    const rootSemi = currentRoot(t * 1000);
    const mode = currentMode(t * 1000);
    const fund = snapToMode(targetHz, rootSemi, mode);

    // loudness from magnitude (log-perceptual, kept under the limiter)
    const level = 0.06 + mN * 0.5;
    // decay: bigger + deeper ring longer; shallow shimmer decays fast
    const decay = 1.1 + mN * 3.8 + dN * 3.0;
    // brightness: shallow = bright (more high partials); deep = dark
    const brightness = 1 - dN * 0.85;
    // pan: north=left(-1) … south=right(+1)
    const pan = Math.max(-1, Math.min(1, -q.lat / 90));

    const panner = ctx.createStereoPanner();
    panner.pan.value = pan;
    const voice = ctx.createGain();
    voice.gain.value = 0;
    voice.connect(panner);
    panner.connect(master);
    // deep quakes feed the reverb more (cavernous), shallow ones stay dry
    const send = ctx.createGain();
    send.gain.value = 0.15 + dN * 0.45;
    panner.connect(send);
    send.connect(wet);

    // struck mallet click — a very short filtered noise burst for the attack
    addMalletClick(ctx, voice, t, level * (0.5 + brightness * 0.5));

    // the modal partials
    for (let p = 0; p < BELL_PARTIALS.length; p++) {
      const ratio = BELL_PARTIALS[p];
      const pGainBase = BELL_GAINS[p];
      // upper partials attenuated by depth (dark) and rolled off for deep quakes
      const pGain =
        pGainBase * (p === 0 ? 1 : brightness) * (0.85 + jitter() * 0.3);
      if (pGain < 0.01) continue;
      const osc = ctx.createOscillator();
      osc.type = "sine";
      const f = fund * ratio;
      osc.frequency.value = f;
      osc.detune.value = (jitter() - 0.5) * 6; // subtle shimmer
      const g = ctx.createGain();
      g.gain.value = 0;
      osc.connect(g);
      g.connect(voice);
      // exponential strike envelope: instant attack, long exponential tail
      const peak = level * pGain;
      const pDecay = decay * (1 - p * 0.12); // higher partials die sooner
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(peak, t + 0.006);
      g.gain.exponentialRampToValueAtTime(
        Math.max(1e-4, peak * 0.0008),
        t + Math.max(0.2, pDecay),
      );
      osc.start(t);
      osc.stop(t + pDecay + 0.2);
    }

    // voice envelope frees the graph
    voice.gain.setValueAtTime(1, t);
    const tail = t + decay + 0.4;
    setTimeout(
      () => {
        try {
          voice.disconnect();
          panner.disconnect();
          send.disconnect();
        } catch {
          /* already gone */
        }
      },
      Math.max(0, (tail - ctx.currentTime) * 1000) + 200,
    );
  }

  function setEnergy(e: number): void {
    energy = Math.max(0, Math.min(1, e));
    if (disposed) return;
    const now = ctx.currentTime;
    // drone swells from a whisper to a firm low pad as the planet grows louder
    drone.gain.gain.setTargetAtTime(0.05 + energy * 0.22, now, 2.5);
    // and re-tunes its root to the current tonal centre so it never clashes
    const root = currentRoot(now * 1000);
    const droneHz = midiToHz(root - 12);
    drone.oscs[0].frequency.setTargetAtTime(droneHz, now, 4);
    drone.oscs[1].frequency.setTargetAtTime(droneHz * 1.5, now, 4); // a fifth
  }

  async function resume(): Promise<void> {
    if (ctx.state !== "running") {
      try {
        await ctx.resume();
      } catch {
        /* gesture needed */
      }
    }
    drone.oscs.forEach((o) => {
      try {
        o.start();
      } catch {
        /* already started */
      }
    });
  }

  function dispose(): void {
    disposed = true;
    try {
      drone.oscs.forEach((o) => o.stop());
    } catch {
      /* noop */
    }
    ctx.close().catch(() => {});
  }

  return {
    ctx,
    resume,
    isRunning: () => ctx.state === "running",
    strike,
    setEnergy,
    dispose,
  };
}

function makeDrone(ctx: AudioContext, dest: AudioNode): DroneNodes {
  const gain = ctx.createGain();
  gain.gain.value = 0.05;
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 220;
  gain.connect(filter);
  filter.connect(dest);
  const oscs: OscillatorNode[] = [];
  const root = midiToHz(-12);
  for (const f of [root, root * 1.5]) {
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.value = f;
    o.detune.value = (f === root ? -4 : 4);
    o.connect(gain);
    oscs.push(o);
  }
  // a slow amplitude LFO so the drone breathes rather than sits still
  const lfo = ctx.createOscillator();
  lfo.type = "sine";
  lfo.frequency.value = 0.05;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 0.02;
  lfo.connect(lfoGain);
  lfoGain.connect(gain.gain);
  oscs.push(lfo);
  return { gain, oscs };
}

function addMalletClick(
  ctx: AudioContext,
  dest: AudioNode,
  t: number,
  level: number,
): void {
  // a 40ms noise burst through a bandpass = the "tock" of the strike
  const len = Math.floor(ctx.sampleRate * 0.04);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  const r = mulberry32(0x4520 ^ Math.floor(t * 1000));
  for (let i = 0; i < len; i++) {
    const env = 1 - i / len;
    data[i] = (r() * 2 - 1) * env * env;
  }
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = 1800;
  bp.Q.value = 0.7;
  const g = ctx.createGain();
  g.gain.value = level * 0.35;
  src.connect(bp);
  bp.connect(g);
  g.connect(dest);
  src.start(t);
  src.stop(t + 0.05);
}
