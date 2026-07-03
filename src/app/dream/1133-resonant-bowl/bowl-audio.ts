// ════════════════════════════════════════════════════════════════════════════
// bowl-audio.ts — additive inharmonic overtone synthesis for a Tibetan singing
// bowl, plus a driven "sung" rim-rub mode and a synthetic convolution reverb.
//
// The bowl's timbre is a cluster of INHARMONIC partials (not integer multiples).
// We drive ~7 sine partials at measured-ish bowl ratios, each with its own slow
// exponential decay (low partials ring for many seconds, high partials die
// quickly). The fundamental is split into two slightly-detuned oscillators so it
// slowly BEATS — the characteristic "wobble" of a real bowl. Striking excites the
// whole cluster; rubbing the rim swells a sustained sung level and opens a tone
// filter so the bowl brightens as it "sings".
//
// The per-partial amplitude envelope is computed in plain JS (mirrored onto the
// WebAudio gains every frame) so the exact same numbers drive the 3D shell field
// in bowl-scene.ts — the sound and the light are one signal.
// ════════════════════════════════════════════════════════════════════════════

// Inharmonic partial ratios of a struck singing bowl (dominant modes first).
// These follow the measured pattern where higher shell modes climb faster than
// the harmonic series — that inharmonicity is what makes a bowl sound "metal".
const RATIOS = [1, 2.76, 5.4, 8.93, 13.34, 18.64, 24.7];
const BASE_GAINS = [0.13, 0.1, 0.075, 0.055, 0.04, 0.028, 0.02];
const DECAYS = [9, 7, 5.5, 4.2, 3.2, 2.4, 1.8]; // seconds, per partial
const RUB_WEIGHTS = [0.6, 0.5, 0.55, 0.35, 0.2, 0.12, 0.08];

const F0 = 196; // Hz — a low, cool fundamental (~G3)

export interface BowlAudioState {
  amps: Float32Array; // per-partial linear amplitude (drives the shells)
  energy: number; // summed amplitude (drives global glow / camera)
  rub: number; // smoothed sung level 0..1 (drives shimmer)
}

export interface BowlAudio {
  resume(): Promise<void>;
  strike(intensity: number): void;
  setRub(level: number, speed: number): void;
  update(): BowlAudioState;
  dispose(): void;
  readonly ratios: readonly number[];
}

// One-pole low-passed white noise, exponentially decaying — a cheap but roomy
// impulse response for a vast, dark space.
function makeReverbBuffer(ctx: AudioContext, seconds: number): AudioBuffer {
  const rate = ctx.sampleRate;
  const len = Math.floor(rate * seconds);
  const buf = ctx.createBuffer(2, len, rate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    let lp = 0;
    const coeff = 0.28; // darker tail
    for (let i = 0; i < len; i++) {
      const t = i / len;
      const white = Math.random() * 2 - 1;
      lp += coeff * (white - lp);
      const env = Math.pow(1 - t, 2.6) * Math.exp(-2.4 * t);
      data[i] = lp * env;
    }
  }
  return buf;
}

export function makeBowlAudio(): BowlAudio | null {
  const Ctor =
    typeof window !== "undefined"
      ? window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext
      : undefined;
  if (!Ctor) return null;

  let ctx: AudioContext;
  try {
    ctx = new Ctor();
  } catch {
    return null;
  }

  const n = RATIOS.length;

  // ── Master chain: mix → tone filter → (dry + reverb) → limiter → out ──
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -6;
  limiter.knee.value = 6;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.25;
  limiter.connect(ctx.destination);

  const master = ctx.createGain();
  master.gain.value = 0.9;
  master.connect(limiter);

  const dry = ctx.createGain();
  dry.gain.value = 0.55;
  dry.connect(master);

  const convolver = ctx.createConvolver();
  convolver.buffer = makeReverbBuffer(ctx, 4.5);
  const wet = ctx.createGain();
  wet.gain.value = 0.9;
  convolver.connect(wet);
  wet.connect(master);

  const toneFilter = ctx.createBiquadFilter();
  toneFilter.type = "lowpass";
  toneFilter.frequency.value = 1400;
  toneFilter.Q.value = 0.4;
  toneFilter.connect(dry);
  toneFilter.connect(convolver);

  const mix = ctx.createGain();
  mix.gain.value = 1;
  mix.connect(toneFilter);

  // ── Per-partial oscillators + gains (partial 0 beats via two detuned osc) ──
  const partialGains: GainNode[] = [];
  const oscillators: OscillatorNode[] = [];
  for (let i = 0; i < n; i++) {
    const g = ctx.createGain();
    g.gain.value = 0.0001;
    g.connect(mix);
    partialGains.push(g);

    const freq = F0 * RATIOS[i];
    const oscA = ctx.createOscillator();
    oscA.type = "sine";
    oscA.frequency.value = freq;
    oscA.connect(g);
    oscillators.push(oscA);

    if (i === 0) {
      // second, slightly detuned fundamental → ~1.1 Hz beating wobble
      const oscB = ctx.createOscillator();
      oscB.type = "sine";
      oscB.frequency.value = freq + 1.1;
      oscB.connect(g);
      oscillators.push(oscB);
    }
  }

  const now0 = ctx.currentTime;
  for (const o of oscillators) o.start(now0);

  // ── JS envelope model (source of truth for both audio gains and viz) ──
  const struckPeak = new Float32Array(n);
  let strikeTime = -1000;
  let rubTarget = 0;
  let rubSpeed = 0;
  let rubLevel = 0;
  const amps = new Float32Array(n);

  let disposed = false;

  function strike(intensity: number) {
    const now = ctx.currentTime;
    const k = Math.max(0.15, Math.min(1.4, intensity));
    for (let i = 0; i < n; i++) {
      const cur = struckPeak[i] * Math.exp(-(now - strikeTime) / DECAYS[i]);
      struckPeak[i] = Math.min(BASE_GAINS[i] * 1.6, cur + BASE_GAINS[i] * k);
    }
    strikeTime = now;
    // slight per-strike detune of the fundamental beat for liveliness
    const beat = 0.8 + Math.random() * 0.9;
    if (oscillators[1]) oscillators[1].frequency.value = F0 + beat;
  }

  function setRub(level: number, speed: number) {
    rubTarget = Math.max(0, Math.min(1, level));
    rubSpeed = Math.max(0, Math.min(1, speed));
  }

  function update(): BowlAudioState {
    const now = ctx.currentTime;
    // swell/relax the sung level slowly (the bowl takes time to "sing")
    rubLevel += (rubTarget - rubLevel) * 0.045;
    if (rubLevel < 0.0005) rubLevel = 0;

    let energy = 0;
    for (let i = 0; i < n; i++) {
      const struck = struckPeak[i] * Math.exp(-(now - strikeTime) / DECAYS[i]);
      const sung = rubLevel * RUB_WEIGHTS[i] * 0.16;
      const a = struck + sung;
      amps[i] = a;
      energy += a;
      partialGains[i].gain.setTargetAtTime(Math.max(0.0001, a), now, 0.03);
    }

    // strike brightness that mellows + rim-rub opening the tone filter
    const strikeBright = 6000 * Math.exp(-(now - strikeTime) / 1.1);
    const cutoff = 1300 + strikeBright + rubLevel * 3200 + rubSpeed * 1800;
    toneFilter.frequency.setTargetAtTime(
      Math.min(9000, cutoff),
      now,
      0.05,
    );

    return { amps, energy, rub: rubLevel };
  }

  async function resume() {
    if (ctx.state === "suspended") {
      try {
        await ctx.resume();
      } catch {
        /* ignore — gesture-gated elsewhere */
      }
    }
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    try {
      for (const o of oscillators) {
        try {
          o.stop();
        } catch {
          /* already stopped */
        }
        o.disconnect();
      }
      for (const g of partialGains) g.disconnect();
      mix.disconnect();
      toneFilter.disconnect();
      dry.disconnect();
      wet.disconnect();
      convolver.disconnect();
      master.disconnect();
      limiter.disconnect();
    } catch {
      /* ignore */
    }
    ctx.close().catch(() => {
      /* ignore */
    });
  }

  return { resume, strike, setRub, update, dispose, ratios: RATIOS };
}
