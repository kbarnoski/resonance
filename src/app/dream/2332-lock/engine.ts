// ─────────────────────────────────────────────────────────────────────────────
// 2332-lock · engine.ts — the phase-locking instrument, no master knob.
//
//   A stimulus PULSE ticks at a tempo that slowly DRIFTS through
//   1.65 → 2.25 → 2.85 → back (a triangle sweep, ~40 s period). The user tries
//   to ENTRAIN by tapping. From the tap train we compute TWO genuinely
//   independent quantities that can conflict:
//
//     • tempoError  — does the inter-tap tempo match the stimulus tempo?
//     • phaseError  — do the taps land ON the pulse, or in anti-phase?
//
//   You can match tempo perfectly yet tap in anti-phase (tempoError low,
//   phaseError high); you can be momentarily in-phase at the wrong tempo
//   (phaseError instantaneously low, tempoError high, PLV low because it is
//   not *consistent*). The consistency itself is the PLV (Lachaux et al. 1999):
//   the magnitude of the mean unit phasor e^{i·2π·tapPhase} over a sliding
//   window of recent taps.
//
//   Nothing here is a single slew-limited scalar. `coherence` (PLV × tempo) and
//   `phaseAlign` (1 − phaseError) are two axes; the visuals and audio read them
//   separately, so the wrong-phase state is distinct from both unlocked and
//   fully entrained.
//
//   A seeded (mulberry32, 0x2332) deterministic AUTOPILOT drives a virtual
//   tapper through the full unlocked → wrong-phase → entrained → drift → relock
//   arc so the piece is alive with zero interaction.
// ─────────────────────────────────────────────────────────────────────────────

export const SWEEP_PERIOD = 40; // s — full drift up-and-back
export const F_LO = 1.65;
export const F_HI = 2.85;
export const AUTOPILOT_SEED = 0x2332;

const TAU = Math.PI * 2;
const TAP_WINDOW_S = 4.5; // taps older than this fall out of the measure
const TAP_MAX = 16; // hard cap on window size
const METRIC_TAU = 0.32; // s — smoothing time-constant for the readouts

/** Deterministic PRNG. Fixed seed → identical self-demo every load. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stimulus tempo (Hz) at engine-time t — triangle sweep LO→HI→LO. */
export function stimTempo(t: number): number {
  const frac = (t / SWEEP_PERIOD) % 1;
  const tri = 1 - Math.abs(2 * frac - 1); // 0 → 1 → 0
  return F_LO + (F_HI - F_LO) * tri;
}

function wrap01(x: number): number {
  return x - Math.floor(x);
}

/** Signed phase distance in turns, folded to [-0.5, 0.5]. */
function phaseDist(a: number): number {
  const w = wrap01(a);
  return w > 0.5 ? w - 1 : w;
}

interface Tap {
  t: number; // engine-time of the tap (s)
  phase: number; // stimulus phase (0..1) at the moment of the tap
  human: boolean;
}

export interface Snapshot {
  t: number;
  tempo: number; // stimulus tempo (Hz), drifting
  stimPhase: number; // 0..1 — the pulse phase (0 == the audible click)
  beat: boolean; // a stimulus pulse fired this step
  tap: boolean; // a tap (human or autopilot) landed this step
  tapHuman: boolean;
  // ── raw measures ──
  plv: number; // phase-locking value 0..1 (consistency of tap→pulse phase)
  tempoError: number; // 0 good … 1 bad
  phaseError: number; // 0 in-phase … 1 anti-phase
  meanTapPhase: number; // 0..1 — where in the pulse cycle taps consistently land
  tapRate: number; // estimated tap tempo (Hz), NaN if unknown
  // ── derived, still two independent axes ──
  coherence: number; // PLV × (1 − tempoError) → ring formation / brightness
  phaseAlign: number; // 1 − phaseError → does the ring pulse hit the beat?
}

export interface EngineState {
  t: number;
  stimPhase: number;
  taps: Tap[];
  autopilot: boolean;
  // smoothed measures (EMA)
  sPlv: number;
  sTempoErr: number;
  sPhaseErr: number;
  sMeanCos: number;
  sMeanSin: number;
  // autopilot internals
  apPhase: number;
  rng: () => number;
  apJitter: number; // carried per-tap jitter (turns)
}

export function makeEngine(): EngineState {
  return {
    t: 0,
    stimPhase: 0,
    taps: [],
    autopilot: true,
    sPlv: 0,
    sTempoErr: 1,
    sPhaseErr: 1,
    sMeanCos: 1,
    sMeanSin: 0,
    apPhase: 0.62, // start out of phase with the stimulus
    rng: mulberry32(AUTOPILOT_SEED),
    apJitter: 0,
  };
}

/** Register a tap at the current engine-time with an optional phase jitter
 *  (turns) — the autopilot uses jitter to model imperfect humans. */
function pushTap(s: EngineState, human: boolean, jitter: number): void {
  s.taps.push({
    t: s.t,
    phase: wrap01(s.stimPhase + jitter),
    human,
  });
  if (s.taps.length > TAP_MAX) s.taps.shift();
}

/** Public entry for a real human tap (spacebar / pointer / mic onset). */
export function humanTap(s: EngineState): void {
  s.autopilot = false;
  pushTap(s, true, 0);
}

// ── autopilot timeline ───────────────────────────────────────────────────────
// Each segment returns a target tempo RATIO (userTempo / stimTempo) and a
// target phase OFFSET (turns; 0 = tap on the beat, 0.5 = anti-phase) plus a
// "commitment" 0..1 that shrinks tap jitter. The loop deliberately visits every
// state: search → lock-tempo-wrong-phase → correct-to-entrained → drift → relock.
const AP_LOOP = 52; // s

function apTargets(tt: number): {
  ratio: number;
  offset: number;
  commit: number;
} {
  // helper: smoothstep ramp
  const ss = (a: number, b: number, x: number) => {
    const u = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return u * u * (3 - 2 * u);
  };
  if (tt < 7) {
    // searching: wrong, wandering tempo; phase meaningless
    return { ratio: 1.32 - 0.2 * ss(0, 7, tt), offset: 0.5, commit: 0.15 };
  }
  if (tt < 14) {
    // tempo snaps in, but locked in ANTI-PHASE (the conflict state)
    return { ratio: 1.0, offset: 0.5, commit: 0.35 + 0.4 * ss(7, 12, tt) };
  }
  if (tt < 28) {
    // phase corrects → fully entrained, held
    return { ratio: 1.0, offset: 0.5 * (1 - ss(14, 20, tt)), commit: 0.9 };
  }
  if (tt < 34) {
    // tempo drifts away → lock is lost
    return { ratio: 1.0 + 0.26 * ss(28, 34, tt), offset: 0.0, commit: 0.35 };
  }
  if (tt < 40) {
    // relock: tempo returns, phase already good
    return { ratio: 1.26 - 0.26 * ss(34, 39, tt), offset: 0.0, commit: 0.6 };
  }
  if (tt < 48) {
    // hold entrained
    return { ratio: 1.0, offset: 0.0, commit: 0.92 };
  }
  // loosen toward the next search
  return { ratio: 1.0 + 0.3 * ss(48, 52, tt), offset: 0.35 * ss(48, 52, tt), commit: 0.3 };
}

function stepAutopilot(s: EngineState, dt: number, stimTempoNow: number): boolean {
  const tt = s.t % AP_LOOP;
  const { ratio, offset, commit } = apTargets(tt);
  const apFreq = stimTempoNow * ratio;

  // A soft PLL nudges the tap phase toward (stimPhase − offset) — but only
  // gently, so a wrong RATIO still produces a genuinely wrong tap RATE (the
  // taps then sweep through the pulse and PLV honestly collapses).
  const desired = wrap01(s.stimPhase - offset);
  const err = phaseDist(desired - s.apPhase);
  const pllGain = 1.4 * commit;
  // s.apPhase is kept in [0,1); a tap fires when the advanced phase crosses 1.
  const advanced = s.apPhase + apFreq * dt + pllGain * err * dt;
  let fired = false;
  if (advanced >= 1) {
    // per-tap jitter shrinks with commitment → higher PLV when locked
    const jitterAmp = 0.16 * (1 - commit) + 0.015;
    s.apJitter = (s.rng() * 2 - 1) * jitterAmp;
    pushTap(s, false, s.apJitter);
    fired = true;
  }
  s.apPhase = wrap01(advanced);
  return fired;
}

// ── the measures ─────────────────────────────────────────────────────────────
function computeRaw(s: EngineState): {
  plv: number;
  tempoErr: number;
  phaseErr: number;
  meanCos: number;
  meanSin: number;
  tapRate: number;
} {
  // window = recent taps only, so if tapping stops the lock decays
  const win: Tap[] = [];
  for (let i = s.taps.length - 1; i >= 0; i--) {
    if (s.t - s.taps[i].t > TAP_WINDOW_S) break;
    win.unshift(s.taps[i]);
  }
  if (win.length < 3) {
    return { plv: 0, tempoErr: 1, phaseErr: 1, meanCos: 1, meanSin: 0, tapRate: NaN };
  }

  // PLV = |mean of e^{i·2π·phase}| over the window (Lachaux 1999)
  let cs = 0;
  let sn = 0;
  for (const tp of win) {
    cs += Math.cos(TAU * tp.phase);
    sn += Math.sin(TAU * tp.phase);
  }
  cs /= win.length;
  sn /= win.length;
  const plv = Math.min(1, Math.hypot(cs, sn));
  const meanPhase = wrap01(Math.atan2(sn, cs) / TAU);

  // phaseError: how far the consistent landing phase is from ON-the-beat (0)
  const d = Math.abs(phaseDist(meanPhase)); // 0..0.5
  const phaseErr = Math.min(1, d / 0.5);

  // tempoError: from the median inter-tap interval vs the current stimulus
  const iti: number[] = [];
  for (let i = 1; i < win.length; i++) iti.push(win[i].t - win[i - 1].t);
  iti.sort((a, b) => a - b);
  const medIti = iti[Math.floor(iti.length / 2)];
  const tapRate = medIti > 0 ? 1 / medIti : NaN;
  const stimNow = stimTempo(s.t);
  const ratioErr = Number.isFinite(tapRate) ? Math.abs(tapRate / stimNow - 1) : 1;
  const tempoErr = Math.min(1, ratioErr / 0.35); // 35% off tempo → fully wrong

  return { plv, tempoErr, phaseErr, meanCos: cs, meanSin: sn, tapRate };
}

/** Advance one frame. `dt` seconds. Returns the full snapshot the renderer and
 *  the audio engine both read. */
export function stepEngine(s: EngineState, dt: number): Snapshot {
  const clamped = Math.min(0.05, Math.max(0, dt));
  s.t += clamped;

  // stimulus pulse
  const tempo = stimTempo(s.t);
  const prevPhase = s.stimPhase;
  s.stimPhase += tempo * clamped;
  let beat = false;
  if (s.stimPhase >= 1) {
    s.stimPhase -= 1;
    beat = true;
  }

  // autopilot taps (until a human takes over)
  let tap = false;
  const tapHuman = false;
  if (s.autopilot) {
    tap = stepAutopilot(s, clamped, tempo);
  }
  // detect a fresh human tap this frame (pushed via humanTap outside the loop)
  // handled by the caller inspecting taps; here we just recompute measures.
  void prevPhase;

  // raw measures + EMA smoothing (smooth the phasor, not the wrapped angle)
  const raw = computeRaw(s);
  const a = 1 - Math.exp(-clamped / METRIC_TAU);
  s.sPlv += (raw.plv - s.sPlv) * a;
  s.sTempoErr += (raw.tempoErr - s.sTempoErr) * a;
  s.sPhaseErr += (raw.phaseErr - s.sPhaseErr) * a;
  s.sMeanCos += (raw.meanCos - s.sMeanCos) * a;
  s.sMeanSin += (raw.meanSin - s.sMeanSin) * a;

  const meanTapPhase = wrap01(Math.atan2(s.sMeanSin, s.sMeanCos) / TAU);
  const coherence = s.sPlv * (1 - s.sTempoErr);
  const phaseAlign = 1 - s.sPhaseErr;

  return {
    t: s.t,
    tempo,
    stimPhase: s.stimPhase,
    beat,
    tap,
    tapHuman,
    plv: s.sPlv,
    tempoError: s.sTempoErr,
    phaseError: s.sPhaseErr,
    meanTapPhase,
    tapRate: raw.tapRate,
    coherence,
    phaseAlign,
  };
}

/** Human-readable lock state for the readout label. Three clearly distinct
 *  regimes — the whole point of the piece. */
export function lockLabel(snap: Snapshot): "searching" | "off-phase" | "entrained" {
  if (snap.coherence < 0.34) return "searching";
  if (snap.phaseAlign < 0.58) return "off-phase";
  return "entrained";
}
