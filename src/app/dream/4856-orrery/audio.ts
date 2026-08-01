// audio.ts — ONE musical grammar over THREE indifferent cosmic streams.
//
// THE CRUX (Erie: A Declarative Grammar for Data Sonification, arXiv:2402.00156;
// Florian Dombois, *Auditory Seismology*, 2001): an indefinite stream of
// heterogeneous events only stays MUSIC — not monitoring-noise — if you impose a
// declarative grammar. So earthquakes, solar wind, and the geomagnetic field are
// three VOICES of one ensemble, all locked to the SAME slowly-rotating
// pentatonic key and summed under a single limiter:
//
//   • Earthquakes   → struck modal BELLS   (inharmonic partials + mallet click)
//                     mag → loudness+register, depth → timbre/decay, lat → pan
//   • Solar wind    → a bowed CARRIER drone (the sustained pad the bells sit on)
//                     speed → pitch+brightness, density → amplitude
//   • Geomagnetic Kp→ a swelling CHOIR pad  (higher, shimmering "sky" voice)
//                     Kp → bloom amplitude + shimmer
//
// No Math.random / Date.now / new Date — the AudioContext clock drives
// scheduling; any jitter is a seeded mulberry32.

import { magNorm, depthNorm, mulberry32, type Quake } from "./streams";

// Inharmonic partial ratios of a real struck bell (hum, prime, tierce, quint…).
const BELL_PARTIALS = [1.0, 2.0, 2.76, 5.4, 8.93];
const BELL_GAINS = [1.0, 0.55, 0.42, 0.22, 0.12];

// Minor & major pentatonic — always consonant, never a wrong note. The root and
// mode rotate slowly so an hour of listening keeps evolving. ALL three voices
// read the same currentRoot/currentMode, so they can never clash.
const MINOR_PENT = [0, 3, 5, 7, 10];
const MAJOR_PENT = [0, 2, 4, 7, 9];
const MODES = [MINOR_PENT, MAJOR_PENT, MINOR_PENT, MAJOR_PENT];
const ROOT_WALK = [0, 7, 2, 9, 4, -1, 5, 0];
const BASE_TONIC_HZ = 55; // A1 — everything is a transposition of this

const ROOT_ROTATE_MS = 21_000;
const MODE_ROTATE_MS = 63_000;

const CARRIER_OCT = 12; // solar-wind carrier sits ~1 octave above the tonic
const CHOIR_OCT = 36; // aurora choir shimmers ~3 octaves above the tonic

export interface CosmicAudio {
  ctx: AudioContext;
  resume(): Promise<void>;
  isRunning(): boolean;
  /** STREAM 1: strike an earthquake bell */
  strike(q: Quake, nowAudioTime: number): void;
  /** STREAM 2: drive the solar-wind carrier (normalised speed + density) */
  setWind(speedNorm: number, densityNorm: number): void;
  /** STREAM 3: drive the geomagnetic aurora choir (normalised Kp) */
  setAurora(kpNorm: number): void;
  dispose(): void;
}

function midiToHz(semitonesAboveTonic: number): number {
  return BASE_TONIC_HZ * Math.pow(2, semitonesAboveTonic / 12);
}

function snapToMode(targetHz: number, rootSemi: number, mode: number[]): number {
  const semis = 12 * Math.log2(targetHz / BASE_TONIC_HZ);
  const rel = semis - rootSemi;
  const octave = Math.floor(rel / 12);
  const within = rel - octave * 12;
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

function currentRoot(nowMs: number): number {
  const i = Math.floor(nowMs / ROOT_ROTATE_MS) % ROOT_WALK.length;
  return ROOT_WALK[i];
}
function currentMode(nowMs: number): number[] {
  const i = Math.floor(nowMs / MODE_ROTATE_MS) % MODES.length;
  return MODES[i];
}

export function makeAudio(): CosmicAudio {
  const AC: typeof AudioContext =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new AC();

  // ── master chain: bus → limiter (compressor) → destination ──────────────────
  const master = ctx.createGain();
  master.gain.value = 0.85;
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -8;
  limiter.knee.value = 6;
  limiter.ratio.value = 12;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.25;
  master.connect(limiter);
  limiter.connect(ctx.destination);

  // gentle global reverb tail via a filtered feedback delay (cheap, contained)
  const wet = ctx.createGain();
  wet.gain.value = 0.28;
  const delay = ctx.createDelay(1.5);
  delay.delayTime.value = 0.37;
  const fb = ctx.createGain();
  fb.gain.value = 0.42;
  const tone = ctx.createBiquadFilter();
  tone.type = "lowpass";
  tone.frequency.value = 2400;
  delay.connect(fb);
  fb.connect(tone);
  tone.connect(delay);
  delay.connect(master);
  wet.connect(delay);

  const jitter = mulberry32(0x4856 ^ 0x9e37);
  let disposed = false;
  let started = false;

  // ── VOICE 2: solar-wind carrier — a bowed pad the bells sit over ────────────
  const carrier = makeCarrier(ctx, master, wet);
  // ── VOICE 3: aurora choir — a shimmering high "sky" pad ─────────────────────
  const choir = makeChoir(ctx, master, wet);

  // ── VOICE 1: earthquake bells (struck per event) ────────────────────────────
  function strike(q: Quake, nowAudioTime: number): void {
    if (disposed) return;
    const t = nowAudioTime;
    const mN = magNorm(q.mag);
    const dN = depthNorm(q.depthKm);

    const targetHz = BASE_TONIC_HZ * Math.pow(2, 1.2 + (1 - mN) * 3.0);
    const rootSemi = currentRoot(t * 1000);
    const mode = currentMode(t * 1000);
    const fund = snapToMode(targetHz, rootSemi, mode);

    const level = 0.06 + mN * 0.5;
    const decay = 1.1 + mN * 3.8 + dN * 3.0;
    const brightness = 1 - dN * 0.85;
    const pan = Math.max(-1, Math.min(1, -q.lat / 90));

    const panner = ctx.createStereoPanner();
    panner.pan.value = pan;
    const voice = ctx.createGain();
    voice.gain.value = 0;
    voice.connect(panner);
    panner.connect(master);
    const send = ctx.createGain();
    send.gain.value = 0.15 + dN * 0.45;
    panner.connect(send);
    send.connect(wet);

    addMalletClick(ctx, voice, t, level * (0.5 + brightness * 0.5), jitter);

    for (let p = 0; p < BELL_PARTIALS.length; p++) {
      const ratio = BELL_PARTIALS[p];
      const pGain = BELL_GAINS[p] * (p === 0 ? 1 : brightness) * (0.85 + jitter() * 0.3);
      if (pGain < 0.01) continue;
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = fund * ratio;
      osc.detune.value = (jitter() - 0.5) * 6;
      const g = ctx.createGain();
      g.gain.value = 0;
      osc.connect(g);
      g.connect(voice);
      const peak = level * pGain;
      const pDecay = decay * (1 - p * 0.12);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(peak, t + 0.006);
      g.gain.exponentialRampToValueAtTime(Math.max(1e-4, peak * 0.0008), t + Math.max(0.2, pDecay));
      osc.start(t);
      osc.stop(t + pDecay + 0.2);
    }

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

  function setWind(sN: number, dN: number): void {
    if (disposed) return;
    const now = ctx.currentTime;
    const root = currentRoot(now * 1000);
    const mode = currentMode(now * 1000);
    // speed picks a consonant scale degree to glide the carrier onto
    const degree = mode[Math.max(0, Math.min(mode.length - 1, Math.floor(sN * mode.length)))];
    const fundHz = midiToHz(root + CARRIER_OCT + degree);
    carrier.setPitch(fundHz, now);
    // brightness (lowpass cutoff) tracks plasma speed
    carrier.filter.frequency.setTargetAtTime(260 + sN * 3200, now, 1.4);
    // amplitude tracks plasma density — the carrier's "pressure"
    carrier.gain.gain.setTargetAtTime(0.03 + dN * 0.24, now, 1.2);
  }

  function setAurora(kN: number): void {
    if (disposed) return;
    const now = ctx.currentTime;
    const root = currentRoot(now * 1000);
    const mode = currentMode(now * 1000);
    choir.retune(root + CHOIR_OCT, mode, now);
    // blooms with Kp (squared so quiet skies stay silent), swells slowly
    const bloom = kN * kN * 0.2;
    choir.gain.gain.setTargetAtTime(bloom, now, 2.2);
    // shimmer widens with activity
    choir.shimmer.gain.setTargetAtTime(2 + kN * 9, now, 2.0);
  }

  async function resume(): Promise<void> {
    if (ctx.state !== "running") {
      try {
        await ctx.resume();
      } catch {
        /* gesture needed */
      }
    }
    if (!started) {
      started = true;
      carrier.start();
      choir.start();
    }
  }

  function dispose(): void {
    disposed = true;
    try {
      carrier.stop();
      choir.stop();
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
    setWind,
    setAurora,
    dispose,
  };
}

// ── VOICE 2 factory: the bowed solar-wind carrier ─────────────────────────────
interface Carrier {
  gain: GainNode;
  filter: BiquadFilterNode;
  setPitch(fundHz: number, now: number): void;
  start(): void;
  stop(): void;
}

function makeCarrier(ctx: AudioContext, dest: AudioNode, wet: AudioNode): Carrier {
  const gain = ctx.createGain();
  gain.gain.value = 0.0001;
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 400;
  filter.Q.value = 0.6;
  gain.connect(filter);
  filter.connect(dest);
  const send = ctx.createGain();
  send.gain.value = 0.3;
  filter.connect(send);
  send.connect(wet);

  // sub + fundamental + fifth — a warm sawtooth bed, gently detuned = "bowed"
  const specs = [
    { mul: 0.5, detune: -3, g: 0.5, type: "sawtooth" as OscillatorType },
    { mul: 1.0, detune: 4, g: 0.7, type: "sawtooth" as OscillatorType },
    { mul: 1.5, detune: -6, g: 0.35, type: "sawtooth" as OscillatorType },
  ];
  const oscs: OscillatorNode[] = [];
  const gains: GainNode[] = [];
  for (const s of specs) {
    const o = ctx.createOscillator();
    o.type = s.type;
    o.frequency.value = 110 * s.mul;
    o.detune.value = s.detune;
    const g = ctx.createGain();
    g.gain.value = s.g;
    o.connect(g);
    g.connect(gain);
    oscs.push(o);
    gains.push(g);
  }
  // slow breathing tremolo so the bow never sits perfectly still
  const lfo = ctx.createOscillator();
  lfo.type = "sine";
  lfo.frequency.value = 0.06;
  const lfoG = ctx.createGain();
  lfoG.gain.value = 0.015;
  lfo.connect(lfoG);
  lfoG.connect(gain.gain);

  return {
    gain,
    filter,
    setPitch(fundHz, now) {
      oscs[0].frequency.setTargetAtTime(fundHz * 0.5, now, 1.5);
      oscs[1].frequency.setTargetAtTime(fundHz, now, 1.5);
      oscs[2].frequency.setTargetAtTime(fundHz * 1.5, now, 1.5);
    },
    start() {
      oscs.forEach((o) => {
        try {
          o.start();
        } catch {
          /* already */
        }
      });
      try {
        lfo.start();
      } catch {
        /* already */
      }
    },
    stop() {
      oscs.forEach((o) => {
        try {
          o.stop();
        } catch {
          /* noop */
        }
      });
      try {
        lfo.stop();
      } catch {
        /* noop */
      }
    },
  };
}

// ── VOICE 3 factory: the swelling aurora choir ────────────────────────────────
interface Choir {
  gain: GainNode;
  shimmer: GainNode; // vibrato depth (widens with Kp)
  retune(rootSemi: number, mode: number[], now: number): void;
  start(): void;
  stop(): void;
}

function makeChoir(ctx: AudioContext, dest: AudioNode, wet: AudioNode): Choir {
  const gain = ctx.createGain();
  gain.gain.value = 0.0001;
  const hp = ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 300;
  gain.connect(hp);
  hp.connect(dest);
  const send = ctx.createGain();
  send.gain.value = 0.5; // the sky voice lives mostly in the reverb
  hp.connect(send);
  send.connect(wet);

  // four triangle voices form a chord high above the carrier; each retunes to a
  // scale degree so the pad stays inside the rotating key.
  const CHORD_DEGREES = [0, 1, 2, 4]; // indices into the active pentatonic mode
  const oscs: OscillatorNode[] = [];
  const voiceGains: GainNode[] = [];
  for (let i = 0; i < CHORD_DEGREES.length; i++) {
    const o = ctx.createOscillator();
    o.type = "triangle";
    o.frequency.value = 440;
    o.detune.value = (i - 1.5) * 5; // slight spread = choir width
    const g = ctx.createGain();
    g.gain.value = 0.25;
    o.connect(g);
    g.connect(gain);
    oscs.push(o);
    voiceGains.push(g);
  }
  // vibrato LFO → all oscillator detunes, depth = shimmer (set by Kp)
  const vib = ctx.createOscillator();
  vib.type = "sine";
  vib.frequency.value = 5.2;
  const shimmer = ctx.createGain();
  shimmer.gain.value = 2;
  vib.connect(shimmer);
  for (const o of oscs) shimmer.connect(o.detune);

  return {
    gain,
    shimmer,
    retune(rootSemi, mode, now) {
      for (let i = 0; i < oscs.length; i++) {
        const deg = mode[CHORD_DEGREES[i] % mode.length];
        const oct = Math.floor(CHORD_DEGREES[i] / mode.length) * 12;
        const hz = BASE_TONIC_HZ * Math.pow(2, (rootSemi + deg + oct) / 12);
        oscs[i].frequency.setTargetAtTime(hz, now, 2.0);
      }
    },
    start() {
      oscs.forEach((o) => {
        try {
          o.start();
        } catch {
          /* already */
        }
      });
      try {
        vib.start();
      } catch {
        /* already */
      }
    },
    stop() {
      oscs.forEach((o) => {
        try {
          o.stop();
        } catch {
          /* noop */
        }
      });
      try {
        vib.stop();
      } catch {
        /* noop */
      }
    },
  };
}

function addMalletClick(
  ctx: AudioContext,
  dest: AudioNode,
  t: number,
  level: number,
  rng: () => number,
): void {
  const len = Math.floor(ctx.sampleRate * 0.04);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) {
    const env = 1 - i / len;
    data[i] = (rng() * 2 - 1) * env * env;
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
