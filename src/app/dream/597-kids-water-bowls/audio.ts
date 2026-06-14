// Singing Water — friction-excited resonator audio engine.
// One resonator per bowl, excited two ways:
//   TAP  = struck inharmonic bell (additive sines, partials 1, 2.01, 3.0, 4.2)
//   RUB  = sustained glass-armonica friction tone = noise -> high-Q bandpass
//          + quiet shimmer partials, all driven by drag SPEED in real time.
//
// SAFE master chain (hard requirement):
//   masterGain -> lowpass(<=8000) -> compressor -> destination
// Everything routes through this. Levels kept gentle for small ears.

// Just-intonation Lydian-ish over root F3 (~174.6 Hz).
// Bowls left->right: 1/1, 9/8, 5/4, 11/8, 3/2, 5/3 (the 11/8 #4 = watery float).
export const ROOT_HZ = 174.61;
export const RATIOS = [1 / 1, 9 / 8, 5 / 4, 11 / 8, 3 / 2, 5 / 3];
export const BOWL_FREQS = RATIOS.map((r) => ROOT_HZ * r);
export const NUM_BOWLS = BOWL_FREQS.length;

// Inharmonic bell partial ratios (glassy, never harsh).
const BELL_PARTIALS = [1, 2.01, 3.0, 4.2];
const BELL_GAINS = [1.0, 0.5, 0.32, 0.18];

export type Engine = {
  ctx: AudioContext;
  resume: () => Promise<void>;
  tap: (bowl: number) => void;
  // Per-frame: feed smoothed rub speed (px/ms) for each active bowl.
  setRubSpeed: (bowl: number, speed: number) => void;
  // Loudness readout for visuals (0..1) per bowl.
  getGlow: (bowl: number) => number;
  dispose: () => void;
};

type RubVoice = {
  noise: AudioBufferSourceNode;
  bandpass: BiquadFilterNode;
  shimmer: OscillatorNode[];
  shimmerGain: GainNode;
  gain: GainNode;
  target: number; // target loudness 0..1 from rub speed (re-asserted each contact frame)
  level: number; // smoothed loudness 0..1 (drives audio + visual glow)
};

function makeNoiseBuffer(ctx: AudioContext): AudioBuffer {
  const len = ctx.sampleRate * 2;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  // Lightly low-passed (pink-ish) noise so the friction tone is soft, not hissy.
  let lastSample = 0;
  for (let i = 0; i < len; i++) {
    const white = Math.random() * 2 - 1;
    lastSample = 0.96 * lastSample + 0.04 * white;
    data[i] = lastSample * 3.5;
  }
  return buf;
}

export function createEngine(): Engine | null {
  const AC: typeof AudioContext | undefined =
    typeof window !== "undefined"
      ? window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext
      : undefined;
  if (!AC) return null;

  const ctx = new AC();

  // ---- SAFE master chain ----
  const master = ctx.createGain();
  master.gain.value = 0.85;

  const lowpass = ctx.createBiquadFilter();
  lowpass.type = "lowpass";
  lowpass.frequency.value = 7200; // <= 8000
  lowpass.Q.value = 0.4;

  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -18;
  comp.ratio.value = 6;
  comp.knee.value = 12;
  comp.attack.value = 0.006;
  comp.release.value = 0.25;

  master.connect(lowpass).connect(comp).connect(ctx.destination);

  const noiseBuf = makeNoiseBuffer(ctx);

  // ---- Ambient water/pad drone (never total silence) ----
  const ambient = ctx.createGain();
  ambient.gain.value = 0.0;
  ambient.connect(master);
  const ambOscs: OscillatorNode[] = [];
  [ROOT_HZ / 2, (ROOT_HZ / 2) * (3 / 2), ROOT_HZ * (5 / 4)].forEach((f, i) => {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = f;
    const g = ctx.createGain();
    g.gain.value = i === 0 ? 0.5 : 0.22;
    // Slow detune shimmer.
    const lfo = ctx.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = 0.05 + i * 0.017;
    const lfoG = ctx.createGain();
    lfoG.gain.value = 0.6 + i;
    lfo.connect(lfoG).connect(osc.detune);
    osc.connect(g).connect(ambient);
    osc.start();
    lfo.start();
    ambOscs.push(osc, lfo);
  });

  // ---- One persistent rub voice per bowl (pre-created; zero spin-up latency) ----
  const rubs: RubVoice[] = BOWL_FREQS.map((freq) => {
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuf;
    noise.loop = true;

    const bandpass = ctx.createBiquadFilter();
    bandpass.type = "bandpass";
    bandpass.frequency.value = freq;
    bandpass.Q.value = 16;

    const gain = ctx.createGain();
    gain.gain.value = 0.0;

    noise.connect(bandpass).connect(gain).connect(master);
    noise.start();

    // 3 quiet shimmer partials at inharmonic ratios.
    const shimmerGain = ctx.createGain();
    shimmerGain.gain.value = 0.0;
    shimmerGain.connect(gain);
    const shimmer = [2.01, 3.0, 4.2].map((r) => {
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = freq * r;
      const g = ctx.createGain();
      g.gain.value = 0.05 / r;
      o.connect(g).connect(shimmerGain);
      o.start();
      return o;
    });

    return { noise, bandpass, shimmer, shimmerGain, gain, target: 0, level: 0 };
  });

  // Smoothing loop for rub voices (independent of visual rAF so audio stays smooth).
  let running = true;
  let lastT = performance.now();
  let raf = 0;
  function step(now: number) {
    if (!running) return;
    const dt = Math.min(0.05, (now - lastT) / 1000);
    lastT = now;
    const t = ctx.currentTime;
    for (let b = 0; b < rubs.length; b++) {
      const v = rubs[b];
      // Rise quickly when rubbing, decay smoothly (~0.6s) when you stop.
      const k =
        v.target > v.level
          ? 1 - Math.exp(-dt / 0.05)
          : 1 - Math.exp(-dt / 0.6);
      v.level += (v.target - v.level) * k;
      const lvl = v.level;
      const freq = BOWL_FREQS[b];
      // Loudness: gentle, capped low so it never gets loud.
      v.gain.gain.setTargetAtTime(0.16 * lvl, t, 0.03);
      // Brightness: rub faster -> open the bandpass upward.
      v.bandpass.frequency.setTargetAtTime(freq * (1 + 0.5 * lvl), t, 0.05);
      // Q rises with speed (~14 -> ~26): more focused, singing.
      v.bandpass.Q.setTargetAtTime(14 + 12 * lvl, t, 0.08);
      // Shimmer partials swell in only when rubbing hard.
      v.shimmerGain.gain.setTargetAtTime(0.5 * lvl * lvl, t, 0.05);
      // Bleed target off; setRubSpeed re-asserts each frame of contact.
      v.target *= 0.9;
    }
    // Ambient breathes gently underneath.
    ambient.gain.setTargetAtTime(0.04, t, 0.5);
    raf = requestAnimationFrame(step);
  }
  raf = requestAnimationFrame(step);

  function tap(bowl: number) {
    if (bowl < 0 || bowl >= BOWL_FREQS.length) return;
    const freq = BOWL_FREQS[bowl];
    const t = ctx.currentTime;
    const bell = ctx.createGain();
    bell.gain.value = 0;
    bell.connect(master);
    const peak = 0.28; // gentle
    bell.gain.setValueAtTime(0, t);
    bell.gain.linearRampToValueAtTime(peak, t + 0.004); // ~4ms attack
    BELL_PARTIALS.forEach((ratio, i) => {
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = freq * ratio;
      const g = ctx.createGain();
      const pg = BELL_GAINS[i];
      // Higher partials decay faster -> glassy, organic.
      const dec = 2.4 - i * 0.45;
      g.gain.setValueAtTime(pg, t + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0008, t + 0.005 + dec);
      o.connect(g).connect(bell);
      o.start(t);
      o.stop(t + 0.005 + dec + 0.1);
    });
    // Overall bell envelope down.
    bell.gain.setTargetAtTime(0.0001, t + 0.02, 0.7);
    // Tap also gives the bowl a quick visual+sonic glow kick.
    rubs[bowl].level = Math.max(rubs[bowl].level, 0.85);
  }

  function setRubSpeed(bowl: number, speed: number) {
    if (bowl < 0 || bowl >= rubs.length) return;
    // speed in px/ms; map ~0..2.2 -> 0..1 with a soft knee.
    const norm = Math.min(1, speed / 2.2);
    const shaped = Math.pow(norm, 0.8);
    // Re-assert target each contact frame (step() bleeds it off otherwise).
    rubs[bowl].target = Math.max(rubs[bowl].target, shaped);
  }

  function getGlow(bowl: number) {
    if (bowl < 0 || bowl >= rubs.length) return 0;
    return rubs[bowl].level;
  }

  async function resume() {
    if (ctx.state !== "running") {
      try {
        await ctx.resume();
      } catch {
        /* ignore */
      }
    }
  }

  function dispose() {
    running = false;
    cancelAnimationFrame(raf);
    try {
      rubs.forEach((v) => {
        v.noise.stop();
        v.shimmer.forEach((o) => o.stop());
      });
      ambOscs.forEach((o) => o.stop());
    } catch {
      /* nodes may already be stopped */
    }
    ctx.close().catch(() => {});
  }

  return { ctx, resume, tap, setRubSpeed, getGlow, dispose };
}
