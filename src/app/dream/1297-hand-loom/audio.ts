// audio.ts — a small RHYTHM ENGINE for 1297-hand-loom. Pure Web Audio: a transport
// with a 16-step clock scheduling four drum/bass lanes. There is a PULSE — a played
// groove, not a drone. No just-intonation bell spine, no shared droneBank.
//
// Signal path:  kick/clap/hat/bass  →  drumBus / bassBus  →  compressor (limiter)
//               →  master gain (≤0.30, faded in)  →  destination.
//
// Scheduling uses the classic look-ahead pattern ("A Tale of Two Clocks"): a 25 ms
// setInterval walks the transport and books each step into Web Audio's sample clock
// a little in the future, so timing is rock-steady regardless of frame rate.
//
// The engine OWNS the transport. The view reads loopPosition() (a smooth 0..16
// float from the audio clock) to draw the sweep, reads the patterns to draw the
// grid, and calls armStep()/setCutoff()/setSwing()/setDensity() from hand gestures.

export const LANES = ["kick", "clap", "hat", "bass"] as const;
export type Lane = (typeof LANES)[number];
export const STEPS = 16;

const MASTER_PEAK = 0.3;
const BPM = 110;
const LOOKAHEAD_MS = 25;
const SCHEDULE_AHEAD = 0.12; // seconds

// A5-minor-ish rolling bass, one entry per step (only played where the pattern is on).
const BASS_HZ: number[] = [
  55.0, 55.0, 55.0, 55.0, 55.0, 55.0, 55.0, 65.41, 55.0, 55.0, 73.42, 55.0,
  55.0, 55.0, 65.41, 55.0,
];

function defaultPatterns(): Record<Lane, boolean[]> {
  const on = (idx: number[]) => {
    const a = new Array<boolean>(STEPS).fill(false);
    for (const i of idx) a[i] = true;
    return a;
  };
  return {
    kick: on([0, 4, 8, 12]), // four on the floor
    clap: on([4, 12]), // backbeat
    hat: on([2, 6, 10, 14]), // offbeat eighths
    bass: on([2, 6, 10, 14]), // offbeat rolling bass, interlocked with the kick
  };
}

export interface RhythmEngine {
  patterns: Record<Lane, boolean[]>;
  /** Smooth playhead 0..16 (float) derived from the audio clock — for the sweep. */
  loopPosition(): number;
  /** Nearest step to the current playhead — where a quantised gesture lands. */
  nearestStep(): number;
  /** Latch a step on/off in a lane (pinch gesture arms a hit ON the beat). */
  armStep(lane: Lane, step: number, on: boolean): void;
  /** Whether a lane fired within the last few ms (for the view's flash). */
  laneFlash(lane: Lane): number;
  /** Brightness / filter cutoff, 0..1 (raise a hand → brighter). */
  setCutoff(v01: number): void;
  /** Swing amount 0..1 (delays the offbeat 16ths). */
  setSwing(v01: number): void;
  /** Density 0..1 — sprinkles ghost hats between the written hits. */
  setDensity(v01: number): void;
  setActive(v: boolean): void;
  stop(): void;
}

export async function startRhythm(): Promise<RhythmEngine> {
  const AC: typeof AudioContext =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new AC();
  await ctx.resume();

  const t0 = ctx.currentTime;

  // ── master chain ─────────────────────────────────────────────────────────
  const master = ctx.createGain();
  master.gain.setValueAtTime(0, t0);
  master.gain.linearRampToValueAtTime(MASTER_PEAK, t0 + 1.2); // gentle fade-in

  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.setValueAtTime(-8, t0);
  limiter.knee.setValueAtTime(6, t0);
  limiter.ratio.setValueAtTime(12, t0);
  limiter.attack.setValueAtTime(0.003, t0);
  limiter.release.setValueAtTime(0.2, t0);
  limiter.connect(master);
  master.connect(ctx.destination);

  const drumBus = ctx.createGain();
  drumBus.gain.value = 1;
  drumBus.connect(limiter);

  const bassBus = ctx.createGain();
  bassBus.gain.value = 0.9;
  bassBus.connect(limiter);

  // Shared white-noise buffer for clap + hat.
  const noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
  const nd = noiseBuf.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;

  // ── mutable control state ────────────────────────────────────────────────
  const patterns = defaultPatterns();
  let cutoff01 = 0.55;
  let swing01 = 0.12;
  let density01 = 0;
  let active = true;
  const flash: Record<Lane, number> = { kick: 0, clap: 0, hat: 0, bass: 0 };

  const sec16 = 60 / BPM / 4; // one sixteenth note
  const loopStart = ctx.currentTime;

  // ── voices ─────────────────────────────────────────────────────────────
  function playKick(at: number) {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(150, at);
    osc.frequency.exponentialRampToValueAtTime(45, at + 0.11);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(0.95, at + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0008, at + 0.34);
    osc.connect(g);
    g.connect(drumBus);
    osc.start(at);
    osc.stop(at + 0.4);
  }

  function playClap(at: number) {
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 1400;
    bp.Q.value = 1.1;
    const g = ctx.createGain();
    bp.connect(g);
    g.connect(drumBus);
    // three quick bursts for the "clap" smear
    const bursts = [0, 0.012, 0.024];
    for (const b of bursts) {
      const src = ctx.createBufferSource();
      src.buffer = noiseBuf;
      const bg = ctx.createGain();
      bg.gain.setValueAtTime(0.0001, at + b);
      bg.gain.exponentialRampToValueAtTime(0.5, at + b + 0.002);
      bg.gain.exponentialRampToValueAtTime(0.001, at + b + 0.05);
      src.connect(bg);
      bg.connect(bp);
      src.start(at + b);
      src.stop(at + b + 0.08);
    }
    // body tail
    g.gain.setValueAtTime(1, at);
    g.gain.exponentialRampToValueAtTime(0.3, at + 0.14);
  }

  function playHat(at: number, gain: number) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    // brighter hand → brighter hats
    hp.frequency.value = 5500 + cutoff01 * 5000;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(gain, at + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0006, at + 0.05);
    src.connect(hp);
    hp.connect(g);
    g.connect(drumBus);
    src.start(at);
    src.stop(at + 0.08);
  }

  function playBass(at: number, hz: number) {
    const osc = ctx.createOscillator();
    const sub = ctx.createOscillator();
    osc.type = "sawtooth";
    sub.type = "sine";
    osc.frequency.setValueAtTime(hz, at);
    sub.frequency.setValueAtTime(hz, at);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.Q.value = 7;
    const base = 260 + cutoff01 * 2600; // hand height opens the filter
    lp.frequency.setValueAtTime(base * 1.7, at);
    lp.frequency.exponentialRampToValueAtTime(Math.max(120, base), at + 0.18);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(0.55, at + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0008, at + 0.26);
    osc.connect(lp);
    sub.connect(lp);
    lp.connect(g);
    g.connect(bassBus);
    osc.start(at);
    sub.start(at);
    osc.stop(at + 0.3);
    sub.stop(at + 0.3);
  }

  // ── scheduler ────────────────────────────────────────────────────────────
  let step = 0;
  let nextTime = ctx.currentTime + 0.06;

  function stepTime(base: number, s: number): number {
    // swing: push the offbeat 16ths (odd steps) later
    return s % 2 === 1 ? base + swing01 * 0.5 * sec16 : base;
  }

  function scheduleStep(s: number, base: number) {
    if (!active) return;
    const at = stepTime(base, s);
    if (patterns.kick[s]) {
      playKick(at);
      flash.kick = at;
    }
    if (patterns.clap[s]) {
      playClap(at);
      flash.clap = at;
    }
    if (patterns.hat[s]) {
      playHat(at, 0.32);
      flash.hat = at;
    } else if (density01 > 0.35 && s % 2 === 1 && Math.random() < density01 - 0.3) {
      playHat(at, 0.16); // ghost hat between the written hits
      flash.hat = at;
    }
    if (patterns.bass[s]) {
      playBass(at, BASS_HZ[s]);
      flash.bass = at;
    }
  }

  const timer = window.setInterval(() => {
    if (ctx.state === "closed") return;
    while (nextTime < ctx.currentTime + SCHEDULE_AHEAD) {
      scheduleStep(step, nextTime);
      nextTime += sec16;
      step = (step + 1) % STEPS;
    }
  }, LOOKAHEAD_MS);

  return {
    patterns,
    loopPosition() {
      const p = ((ctx.currentTime - loopStart) / sec16) % STEPS;
      return p < 0 ? p + STEPS : p;
    },
    nearestStep() {
      const p = ((ctx.currentTime - loopStart) / sec16) % STEPS;
      return (Math.round(p) % STEPS + STEPS) % STEPS;
    },
    armStep(lane, s, on) {
      if (s >= 0 && s < STEPS) patterns[lane][s] = on;
    },
    laneFlash(lane) {
      const dt = ctx.currentTime - flash[lane];
      return dt >= 0 && dt < 0.12 ? 1 - dt / 0.12 : 0;
    },
    setCutoff(v) {
      cutoff01 = Math.max(0, Math.min(1, v));
    },
    setSwing(v) {
      swing01 = Math.max(0, Math.min(0.6, v));
    },
    setDensity(v) {
      density01 = Math.max(0, Math.min(1, v));
    },
    setActive(v) {
      active = v;
    },
    stop() {
      window.clearInterval(timer);
      try {
        master.gain.cancelScheduledValues(ctx.currentTime);
        master.gain.setValueAtTime(master.gain.value, ctx.currentTime);
        master.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.08);
      } catch {
        /* ignore */
      }
      setTimeout(() => {
        void ctx.close().catch(() => {});
      }, 120);
    },
  };
}
