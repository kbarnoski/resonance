// ─────────────────────────────────────────────────────────────────────────────
// tapPace.ts — the tap-tempo → depth state machine.
//
//   The user taps a pulse (spacebar / screen / button). We measure the interval
//   between taps. FAST taps (short interval) mean the user is agitated, near the
//   surface — shallow. As the intervals LENGTHEN, and especially once the user
//   goes STILL (stops tapping entirely), `depth` glides toward 1.0 = the deepest
//   descent. Resuming fast taps pulls depth back down.
//
//   This is the whole interaction: descent by slowing, deepest by stillness.
//   No pointer-drag, no mic. Depth is smoothed so audio never clicks.
// ─────────────────────────────────────────────────────────────────────────────

export interface TapPaceOptions {
  /** Inter-tap interval (s) that maps to shallowest (depth≈0). Default 0.28. */
  fastInterval?: number;
  /** Inter-tap interval (s) that maps to deep (depth≈1). Default 2.6. */
  slowInterval?: number;
  /** Seconds of no tapping after which stillness fully takes over. Default 4. */
  stillnessAfter?: number;
  /** Smoothing time constant (s) for depth glide. Default 1.1. */
  tau?: number;
}

export interface TapPace {
  /** Register a tap now (call on spacebar / tap / button). */
  tap(): void;
  /** Advance the state machine by dt seconds; returns smoothed depth 0..1. */
  step(dt: number): number;
  /** Current smoothed depth 0..1. */
  readonly depth: number;
  /** Seconds since the last tap (grows unbounded while still). */
  readonly sinceTap: number;
  /** A short-lived 0..1 pulse that spikes to 1 on each tap and decays. */
  readonly pulse: number;
  /** Drive an automatic scripted descent (used when the user never taps). */
  autoStep(dt: number): number;
}

const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));

export function createTapPace(opts: TapPaceOptions = {}): TapPace {
  const fastInterval = opts.fastInterval ?? 0.28;
  const slowInterval = opts.slowInterval ?? 2.6;
  const stillnessAfter = opts.stillnessAfter ?? 4.0;
  const tau = opts.tau ?? 1.1;

  let depth = 0;
  let target = 0;
  let sinceTap = 1e6; // start "still" so a headless glance still descends
  let lastInterval = slowInterval;
  let pulse = 0;
  let autoT = 0;

  // Map an inter-tap interval to a target depth (short = shallow, long = deep).
  const intervalToDepth = (interval: number): number => {
    const f = (interval - fastInterval) / (slowInterval - fastInterval);
    return clamp01(f);
  };

  const tap = () => {
    if (sinceTap < 8) {
      // A real gap between two taps → use it as the tempo reading.
      lastInterval = sinceTap;
    }
    sinceTap = 0;
    pulse = 1;
  };

  const step = (dt: number): number => {
    sinceTap += dt;
    pulse *= Math.exp(-dt / 0.25);

    // Base target from the last measured tempo.
    let tempoDepth = intervalToDepth(lastInterval);

    // Stillness override: the longer since the last tap, the more we pull the
    // target toward 1.0 (the deepest = letting go entirely).
    const still = clamp01(sinceTap / stillnessAfter);
    // Ease-in so stillness feels like a settling, not a snap.
    const stillEase = still * still * (3 - 2 * still);
    tempoDepth = tempoDepth + (1 - tempoDepth) * stillEase;

    target = tempoDepth;

    // Exponential glide toward target — this is what kills clicks in the audio.
    const a = 1 - Math.exp(-dt / tau);
    depth += (target - depth) * a;
    return depth;
  };

  // Scripted auto-descent for the demo / headless case: a slow settle from the
  // surface down to stillness over ~14 s, then hold at the light.
  const autoStep = (dt: number): number => {
    autoT += dt;
    // 0 → 1 over 14 s with an ease, then hold.
    const t = clamp01(autoT / 14);
    const eased = t * t * (3 - 2 * t);
    target = eased;
    const a = 1 - Math.exp(-dt / tau);
    depth += (target - depth) * a;
    pulse *= Math.exp(-dt / 0.25);
    sinceTap += dt;
    return depth;
  };

  return {
    tap,
    step,
    autoStep,
    get depth() {
      return depth;
    },
    get sinceTap() {
      return sinceTap;
    },
    get pulse() {
      return pulse;
    },
  };
}
