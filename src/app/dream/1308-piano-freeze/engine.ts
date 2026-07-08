// engine.ts — a Paulstretch-style granular resynthesis engine for 1308.
//
// The READ position (where in the recording we sample grains from) moves
// INDEPENDENTLY of grain playback, so scrub and freeze fall straight out of the
// design:
//   • Scrub  → the read position chases the hand's target.
//   • Freeze → the chase weight is scaled by (1 − freeze); at freeze=1 the read
//     position stops and every overlapping Hann grain re-reads the same slice
//     endlessly = an infinite shimmering drone. Tiny per-grain read-jitter and
//     detune keep it glistening instead of buzzing.
//
// A parallel DRY grain path (clean, no jitter/detune) fades in with freeze, so
// the frozen moment stays legible while it holds — the Sampleson "Aeronaut"
// spectral-freeze-with-parallel-looper idea, done granularly so it never clicks.
//
// Chain: [shimmer + dry grains] → tilt low/high shelves → analyser → master →
// DynamicsCompressor limiter → destination. Master gain is ramped from 0 with
// setTargetAtTime (never a click); Stop ramps to 0 in ~60 ms then closes.

const GRAIN_DUR = 0.135; // seconds — ~135 ms Hann grains
const OVERLAP = 0.6; // 60% overlap
const GRAIN_INTERVAL = GRAIN_DUR * (1 - OVERLAP); // ~54 ms between grain onsets
const LOOKAHEAD = 0.09; // schedule this far ahead (s)
const TIMER_MS = 20; // scheduler tick
const MAX_GRAINS = 48; // concurrent grain cap
const GRAIN_PEAK = 0.55; // per-grain window peak gain
const CHASE = 9; // read-position chase rate (1/s) when unfrozen

export interface GranularEngine {
  start(): Promise<void>;
  stop(): void;
  setTarget(pos: number): void; // 0..1 desired playhead
  setFreeze(f: number): void; // 0..1
  setTilt(t: number): void; // -1 (dark) .. +1 (bright)
  getReadPos(): number; // 0..1 actual read position
  getTarget(): number; // 0..1
  getFreeze(): number; // 0..1
  getSpectrum(): Uint8Array; // FFT magnitudes (engine-owned buffer)
  readonly spectrumSize: number;
}

/** Build a Hann window scaled to `peak`. */
function makeHann(len: number, peak: number): Float32Array {
  const c = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    c[i] = peak * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (len - 1)));
  }
  return c;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export function makeEngine(ctx: AudioContext, buffer: AudioBuffer): GranularEngine {
  const dur = buffer.duration;
  const maxOff = Math.max(0, dur - GRAIN_DUR - 0.002);

  // Buses.
  const shimmerBus = ctx.createGain();
  shimmerBus.gain.value = 1;
  const dryBus = ctx.createGain();
  dryBus.gain.value = 0.0001; // ramps up with freeze

  // Spectral tilt: a low-shelf / high-shelf pair.
  const lowShelf = ctx.createBiquadFilter();
  lowShelf.type = "lowshelf";
  lowShelf.frequency.value = 320;
  lowShelf.gain.value = 0;
  const highShelf = ctx.createBiquadFilter();
  highShelf.type = "highshelf";
  highShelf.frequency.value = 2600;
  highShelf.gain.value = 0;

  const analyser = ctx.createAnalyser();
  analyser.fftSize = 512;
  analyser.smoothingTimeConstant = 0.82;
  const specBuf = new Uint8Array(analyser.frequencyBinCount);

  const master = ctx.createGain();
  master.gain.value = 0.0001;

  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -8;
  limiter.knee.value = 6;
  limiter.ratio.value = 14;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.18;

  shimmerBus.connect(lowShelf);
  dryBus.connect(lowShelf);
  lowShelf.connect(highShelf);
  highShelf.connect(analyser);
  analyser.connect(master);
  master.connect(limiter);
  limiter.connect(ctx.destination);

  const hann = makeHann(1024, GRAIN_PEAK);

  let readPos = 0.5;
  let target = 0.5;
  let freeze = 0;
  let tilt = 0;
  let active = 0;
  let nextGrainTime = 0;
  let lastTick = 0;
  let timer: ReturnType<typeof setInterval> | null = null;
  let running = false;

  const scheduleGrain = (when: number, dry: boolean) => {
    if (active >= MAX_GRAINS) return;
    // Shimmer grains jitter their read point (scaled by freeze); dry grains
    // read exactly at readPos so the frozen moment stays legible.
    const jitter = dry
      ? 0
      : (Math.random() * 2 - 1) * (0.002 + freeze * 0.018);
    let off = readPos * dur + jitter;
    if (off < 0) off = 0;
    else if (off > maxOff) off = maxOff;

    const src = ctx.createBufferSource();
    src.buffer = buffer;
    // Slight detune spread — a touch always, more when frozen, to glisten.
    src.detune.value = dry ? 0 : (Math.random() * 2 - 1) * (2 + freeze * 11);

    const g = ctx.createGain();
    g.gain.setValueAtTime(0, when);
    g.gain.setValueCurveAtTime(hann, when, GRAIN_DUR);
    src.connect(g);
    g.connect(dry ? dryBus : shimmerBus);

    src.start(when, off, GRAIN_DUR * 1.05);
    active++;
    src.onended = () => {
      active--;
    };
  };

  const tick = () => {
    const now = ctx.currentTime;
    const dt = lastTick ? Math.min(0.1, now - lastTick) : TIMER_MS / 1000;
    lastTick = now;

    // Read-position chase, scaled by (1 − freeze). At freeze=1 it stops.
    readPos += (target - readPos) * (1 - freeze) * CHASE * dt;
    readPos = clamp01(readPos);

    // Dry (legibility) bus follows freeze.
    dryBus.gain.setTargetAtTime(0.0001 + freeze * 0.6, now, 0.06);

    if (nextGrainTime < now) nextGrainTime = now;
    while (nextGrainTime < now + LOOKAHEAD) {
      scheduleGrain(nextGrainTime, false);
      if (freeze > 0.05) scheduleGrain(nextGrainTime, true);
      nextGrainTime += GRAIN_INTERVAL;
    }
  };

  return {
    spectrumSize: analyser.frequencyBinCount,

    async start() {
      if (running) return;
      running = true;
      try {
        await ctx.resume();
      } catch {
        /* ignore — already running */
      }
      const now = ctx.currentTime;
      nextGrainTime = now + 0.05;
      lastTick = now;
      master.gain.cancelScheduledValues(now);
      master.gain.setValueAtTime(0.0001, now);
      master.gain.setTargetAtTime(0.8, now, 0.55);
      timer = setInterval(tick, TIMER_MS);
    },

    stop() {
      if (!running) return;
      running = false;
      if (timer !== null) {
        clearInterval(timer);
        timer = null;
      }
      const now = ctx.currentTime;
      master.gain.cancelScheduledValues(now);
      master.gain.setTargetAtTime(0.0001, now, 0.02);
      setTimeout(() => {
        void ctx.close().catch(() => {});
      }, 80);
    },

    setTarget(pos: number) {
      target = clamp01(pos);
    },
    setFreeze(f: number) {
      freeze = clamp01(f);
    },
    setTilt(t: number) {
      tilt = Math.max(-1, Math.min(1, t));
      const now = ctx.currentTime;
      // spread (bright) → cut lows, boost highs; pinch (dark) → the reverse.
      lowShelf.gain.setTargetAtTime(-tilt * 9, now, 0.08);
      highShelf.gain.setTargetAtTime(tilt * 11, now, 0.08);
    },

    getReadPos() {
      return readPos;
    },
    getTarget() {
      return target;
    },
    getFreeze() {
      return freeze;
    },
    getSpectrum() {
      analyser.getByteFrequencyData(specBuf);
      return specBuf;
    },
  };
}
