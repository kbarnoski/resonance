/**
 * THE LIVING SCORE — the field quietly plays along with the piano
 * (Karel 2026-10-13: "insane epic innovation" in the particle engine).
 *
 * Every note onset the analyser hears breathes life into a small, local group
 * of motes: a soft swirl that opens and spreads at a place mapped from the
 * note's register (low notes low and wide, high notes high and fine), carried
 * by the field's own flow and gone in 1-3 s — the score being written into the
 * particles, not a VU meter.
 *
 * Pure + deterministic (living-score.test.ts). Two parts:
 *
 *  - OnsetDetector: per-bin spectral flux on the journeys' shared 256-pt
 *    analyser BYTE spectrum (the same numbers the kinetic EQ hears; bytes are
 *    dB-scaled, so a note's rise reads alike in every register), with an
 *    adaptive threshold (running mean + k·mean-abs-deviation), peak picking,
 *    a refractory gap, a silence gate and a warm-up — and a pitch-band
 *    estimate: the flux²-weighted log-frequency centroid of the rising bins
 *    (the fundamental rises most), mapped over the piano's range (≈ 90 Hz …
 *    4.5 kHz → 0 … 1). Per-bin, not per-band: a high note lights one bin of a
 *    wide band and a band average hid it. Stale analyser frames (the
 *    native/Tauri feed updates slower than rAF) are skipped, not read as
 *    silence.
 *  - LivingScore: the ripple scheduler. At most MAX_RIPPLES live at once in a
 *    fixed slot array (packed straight into one small uniform array — no
 *    per-frame allocation); each ripple's envelope rises smoothly (never a
 *    jolt), decays and reaches exactly zero at the end of its life.
 *
 * Karel's laws, enforced here and in the shader (shaders.ts SCORE_FORCE):
 *  - MOTION, NOT BRIGHTNESS: a ripple is a FORCE only (a swirl + a small
 *    per-mote scatter) — no size, alpha, hue or luminance channel exists.
 *  - NEVER A JOLT: ATTACK_SEC smoothstep rise, the gate slews (GATE_TAU), the
 *    engine's acceleration cap still applies, and a stale feed fades out.
 *  - ABSTRACT: no ring is drawn — the swirl is gaussian, spreads as it lives,
 *    and each mote's own random heading breaks any circle.
 *  - FORMS + EMBLEMS UNTOUCHED: scoreGain() keeps only HELD_FLOOR while any
 *    image form is worn, BUSY_K inside the one-big-change busy zone, and 0
 *    when the field is invisible; the engine also scales by (1 − image form).
 *  - MASTERED (Snowflake "first-snow", Ghost "ghost"): never played — the layer
 *    builds no score for them (SCORE_LOCKED_JOURNEYS / cast.mastered).
 *  - KIOSK PERF: ~100 float ops per frame on the CPU, no readbacks; the GLSL
 *    is only compiled in when the flag is on (off = the show build's exact
 *    simulation source).
 *
 * Off by default (LIVING_SCORE_DEFAULT): `?score=1` turns it on for the tab
 * (remembered in sessionStorage across the kiosk loop), `?score=0` off.
 */

export const LIVING_SCORE_DEFAULT = true; // Karel kept it (2026-10-13)
export const SCORE_SESSION_KEY = "resonance-score";
/** Mastered journeys — never played by the score. */
export const SCORE_LOCKED_JOURNEYS: ReadonlySet<string> = new Set(["first-snow", "ghost"]);

export const SCORE_TUNING = {
  /** concurrent ripples (= the uniform array length in the shader) */
  MAX_RIPPLES: 8,
  // ── detector ──
  /** one past the last FFT bin used (64 of the 128 ≈ 0 … 12 kHz; bin 0 holds
   *  the deep bass under ~90 Hz, so it is kept) */
  END_BIN: 64,
  /** pitch map: log2(bin + 1) from PITCH_LO_BIN (→ 0) to PITCH_HI_BIN (→ 1) —
   *  bin ≈ 187 Hz at 48 kHz: 0.5 ≈ 90 Hz, 23 ≈ 4.3 kHz (a piano's top) */
  PITCH_LO_BIN: 0.5,
  PITCH_HI_BIN: 23,
  /** magnitude compression log(1 + γ·a): dB-like for the sounding partials,
   *  linear near the floor (so a quiet bin's many-dB wobble is not a note) */
  GAMMA: 100,
  /** the analyser's byte range (dB): -100 … -30 → 70 dB */
  BYTE_DB_RANGE: 70,
  /** each bin's recent baseline (s) — a note is a rise above it */
  REF_TAU: 0.12,
  /** novelty = mean of this many largest bin rises */
  TOP_BINS: 3,
  /** adaptive-threshold memory (s) */
  STAT_TAU: 1.2,
  /** threshold = mean + K_DEV · mean-abs-deviation + FLOOR */
  K_DEV: 2.0,
  FLOOR: 0.03,
  /** how much an above-threshold frame teaches the threshold (0..1) */
  ONSET_LEARN: 0.02,
  /** no two onsets closer than this (s) */
  REFRACTORY_SEC: 0.14,
  /** loudest bin (compressed 0..1; 0.15 ≈ -70 dBFS) below which nothing fires */
  SILENCE_LEVEL: 0.15,
  /** stats settle this long before the first onset may fire (s) */
  WARMUP_SEC: 0.6,
  // ── scheduler ──
  /** a new ripple at most this often (s); onsets in between are dropped */
  MIN_SPAWN_GAP_SEC: 0.16,
  /** envelope rise (smoothstep) — slow enough to never read as a beat jolt */
  ATTACK_SEC: 0.35,
  /** life of a low note (pitch 0) and a high note (pitch 1), s */
  LIFE_LOW_SEC: 3.0,
  LIFE_HIGH_SEC: 1.2,
  /** ripple radius as a fraction of the half screen height */
  RADIUS_LOW: 0.34,
  RADIUS_HIGH: 0.12,
  /** register → height on screen (fractions of the half height) */
  Y_LOW: -0.62,
  Y_HIGH: 0.6,
  /** the "pen" wanders across the stave: span (fraction of half width) + period */
  PEN_SPAN: 0.5,
  PEN_PERIOD_SEC: 46,
  /** horizontal scatter around the pen: low notes wide, high notes fine */
  JITTER_LOW: 0.22,
  JITTER_HIGH: 0.07,
  /** written notes rise gently as they fade (fraction of half height / s) */
  DRIFT_UP: 0.035,
  /** gate slew time constant (s) */
  GATE_TAU: 0.6,
  // ── gain ladder ──
  /** response ladder: kinetic.ts journeyResponse SOLO 1.3 … BIG 2.5 */
  RESP_LO: 1.3,
  RESP_HI: 2.5,
  /** amplitude at the bottom (solo piano: subtle) and top (intense: fuller) */
  AMP_SOLO: 0.4,
  AMP_FULL: 1.0,
  /** what is left while a form / emblem / image is held */
  HELD_FLOOR: 0.15,
  /** inside the one-big-change busy zone (travel morph ±4 s, shader change) */
  BUSY_K: 0.5,
  /** field presence below which the score is silent, and where it is full */
  SHOWN_LO: 0.08,
  SHOWN_HI: 0.5,
  // ── shader ──
  /** peak swirl acceleration (world units/s²) at amplitude 1 */
  FORCE: 1.5,
} as const;

const T = SCORE_TUNING;

/** Floats per ripple in the packed uniform data (two vec4s). */
export const SCORE_STRIDE = 8;

export interface Onset {
  /** 0..1 */
  strength: number;
  /** 0 = low register … 1 = high register (log-frequency band centroid) */
  pitch: number;
}

export function smoothstep(a: number, b: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** A rising bin's place on the stave: 0 = low … 1 = high (log frequency). */
export function binPitch(bin: number): number {
  const lo = Math.log2(T.PITCH_LO_BIN + 1), hi = Math.log2(T.PITCH_HI_BIN + 1);
  return Math.max(0, Math.min(1, (Math.log2(bin + 1) - lo) / (hi - lo)));
}

export class OnsetDetector {
  /** per-bin recent baseline (compressed) and its linear-amplitude twin */
  private readonly ref: Float32Array;
  private readonly refAmp: Float32Array;
  /** per-bin linear-amplitude rise of the PREVIOUS fresh frame (pitch weights) */
  private readonly flux1: Float32Array;
  private readonly flux0: Float32Array;
  private readonly top = new Float32Array(T.TOP_BINS);
  private readonly pitchOf: Float32Array;
  private n1 = 0;
  private n2 = 0;
  private thresh1 = Infinity;
  private level1 = 0;
  private mean = 0;
  private dev = 0;
  private refractory = 0;
  private warm = 0;
  private pendingDt = 0;
  private lastHash = -1;
  private primed = false;
  /** onsets fired since creation (probes) */
  count = 0;

  constructor() {
    this.ref = new Float32Array(T.END_BIN);
    this.refAmp = new Float32Array(T.END_BIN);
    this.flux1 = new Float32Array(T.END_BIN);
    this.flux0 = new Float32Array(T.END_BIN);
    this.pitchOf = new Float32Array(T.END_BIN);
    for (let k = 0; k < T.END_BIN; k++) this.pitchOf[k] = binPitch(k);
  }

  /** byte → linear amplitude 0..1 (shared table) */
  private static ampTable: Float32Array | null = null;
  static amps(): Float32Array {
    if (!OnsetDetector.ampTable) {
      const t = new Float32Array(256);
      for (let b = 1; b < 256; b++) t[b] = Math.pow(10, ((b / 255 - 1) * T.BYTE_DB_RANGE) / 20);
      OnsetDetector.ampTable = t;
    }
    return OnsetDetector.ampTable;
  }
  /** byte → compressed magnitude 0..1 (shared table) */
  private static table: Float32Array | null = null;
  static compress(): Float32Array {
    if (!OnsetDetector.table) {
      const t = new Float32Array(256);
      const norm = Math.log1p(T.GAMMA);
      for (let b = 0; b < 256; b++) {
        const amp = Math.pow(10, ((b / 255 - 1) * T.BYTE_DB_RANGE) / 20);
        t[b] = b === 0 ? 0 : Math.log1p(T.GAMMA * amp) / norm;
      }
      OnsetDetector.table = t;
    }
    return OnsetDetector.table;
  }

  /** Feed one analyser frame (byte spectrum, or null for silence). Returns the
   *  onset that peaked on the PREVIOUS fresh frame (one frame of latency). */
  push(bytes: ArrayLike<number> | null, dt: number): Onset | null {
    dt = Math.max(0, Math.min(0.25, dt));
    this.pendingDt += dt;
    this.refractory = Math.max(0, this.refractory - dt);
    // stale frame: the feed has not updated since the last call — wait for it
    if (bytes) {
      let h = 0;
      for (let i = 0; i < T.END_BIN && i < bytes.length; i++) h = (h * 31 + bytes[i] * (i + 7)) % 2147483647;
      if (h === this.lastHash) return null;
      this.lastHash = h;
    } else {
      this.lastHash = -1;
    }
    const fdt = Math.max(1 / 240, this.pendingDt);
    this.pendingDt = 0;

    // RISE ABOVE THE RECENT BASELINE (not frame-to-frame flux): the shared
    // analyser is smoothed at 0.8, so a note's rise is spread over several
    // frames — each bin is compared with its own ~REF_TAU baseline instead,
    // which peaks once per note whatever the frame rate, and a ringing or
    // decaying note sits at or under its baseline (no re-trigger)
    const C = OnsetDetector.compress();
    const A = OnsetDetector.amps();
    const kr = 1 - Math.exp(-fdt / T.REF_TAU);
    // novelty = the mean of the TOP_BINS largest rises: a high note has only a
    // few partials under 12 kHz, a low one many — a sum over all bins heard
    // the bass and missed the treble
    const top = this.top;
    top.fill(0);
    let level = 0;
    for (let k = 0; k < T.END_BIN; k++) {
      const b = bytes && k < bytes.length ? Math.max(0, Math.min(255, bytes[k] | 0)) : 0;
      const x = C[b], a = A[b];
      if (!this.primed) { this.ref[k] = x; this.refAmp[k] = a; }
      let r = Math.max(0, x - this.ref[k]);
      for (let j = 0; j < top.length && r > 0; j++) if (r > top[j]) { const tmp = top[j]; top[j] = r; r = tmp; }
      this.flux0[k] = Math.max(0, a - this.refAmp[k]);
      if (x > level) level = x;
      this.ref[k] += (x - this.ref[k]) * kr;
      this.refAmp[k] += (a - this.refAmp[k]) * kr;
    }
    let N = 0;
    for (let j = 0; j < top.length; j++) N += top[j];
    N /= top.length;
    this.primed = true;

    // peak picking: the previous frame was a local maximum above its threshold
    let out: Onset | null = null;
    if (this.warm >= T.WARMUP_SEC && this.refractory === 0 && this.n1 > this.thresh1 && this.n1 >= N && this.n1 > this.n2 && this.level1 > T.SILENCE_LEVEL) {
      let wsum = 0, psum = 0;
      for (let k = 0; k < T.END_BIN; k++) {
        const w = this.flux1[k] * this.flux1[k];
        wsum += w;
        psum += w * this.pitchOf[k];
      }
      const ratio = (this.n1 - this.thresh1) / Math.max(1e-4, this.thresh1);
      out = {
        strength: Math.min(1, 0.3 + 0.7 * (1 - Math.exp(-0.8 * ratio))),
        pitch: wsum > 0 ? psum / wsum : 0.5,
      };
      this.refractory = T.REFRACTORY_SEC;
      this.count++;
    }

    // adaptive threshold for THIS frame (decided on the next one), then learn it
    this.thresh1 = this.mean + T.K_DEV * this.dev + T.FLOOR;
    // a note's own frames barely teach the threshold, and its shoulders are
    // clipped (winsorised) — else every attack raised the bar for the next
    // note and a phrase went deaf after a few notes
    const k = (1 - Math.exp(-fdt / T.STAT_TAU)) * (N > this.thresh1 ? T.ONSET_LEARN : 1);
    const dv = Math.min(N, this.mean + 3 * this.dev + 1e-3) - this.mean;
    this.mean += dv * k;
    this.dev += (Math.abs(dv) - this.dev) * k;
    this.warm += fdt;
    this.n2 = this.n1;
    this.n1 = N;
    this.level1 = level;
    this.flux1.set(this.flux0);
    return out;
  }
}

/** Ripple envelope 0..1: smooth rise, exponential decay, exactly 0 at `life`. */
export function rippleEnvelope(age: number, life: number): number {
  if (age <= 0 || age >= life) return 0;
  return smoothstep(0, T.ATTACK_SEC, age) * Math.exp(-Math.max(0, age - T.ATTACK_SEC) / (life * 0.38)) * (1 - smoothstep(life * 0.7, life, age));
}

export interface ScoreGainInput {
  /** kinetic.ts journeyResponse (the vibe ladder) */
  respK: number;
  /** field presence 0..1 (the layer's `shown`) */
  shown: number;
  /** 0..1: an image form / emblem / moment / motif is worn */
  held: number;
  /** inside the one-big-change busy zone */
  busy: boolean;
}

/** The score's target gain: ladder × visibility × (held / busy reductions). */
export function scoreGain(g: ScoreGainInput): number {
  const ladder = Math.max(0, Math.min(1, (g.respK - T.RESP_LO) / (T.RESP_HI - T.RESP_LO)));
  const amp = T.AMP_SOLO + (T.AMP_FULL - T.AMP_SOLO) * ladder;
  const vis = smoothstep(T.SHOWN_LO, T.SHOWN_HI, g.shown);
  const held = 1 - (1 - T.HELD_FLOOR) * Math.max(0, Math.min(1, g.held));
  return amp * vis * held * (g.busy ? T.BUSY_K : 1);
}

interface Ripple {
  live: boolean;
  x: number;
  y: number;
  pitch: number;
  strength: number;
  age: number;
  life: number;
  radius: number;
  spin: number;
  seed: number;
}

/** Small deterministic PRNG (mulberry32). */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class LivingScore {
  readonly slots: Ripple[];
  /** packed live ripples: per ripple [x, y, amp(signed), radius, pitch, phase, seed, 0]
   *  — x/y in screen-plane fractions (−1..1 of half width / height), radius as
   *  a fraction of the half height; the engine maps them into the world */
  readonly packed: Float32Array;
  /** live (packed) count after the last step */
  count = 0;
  /** the slewed gate (0..1+) */
  gate = 0;
  spawned = 0;
  dropped = 0;
  private t = 0;
  private lastSpawn = -Infinity;
  private readonly rand: () => number;

  constructor(seed = 1) {
    this.slots = Array.from({ length: T.MAX_RIPPLES }, () => ({ live: false, x: 0, y: 0, pitch: 0, strength: 0, age: 0, life: 1, radius: 0, spin: 1, seed: 0 }));
    this.packed = new Float32Array(T.MAX_RIPPLES * SCORE_STRIDE);
    this.rand = rng(seed);
  }

  /** The pen's place on the stave (x) and its direction of travel (±1). */
  pen(t = this.t): { x: number; dir: number } {
    const ph = (2 * Math.PI * t) / T.PEN_PERIOD_SEC;
    return { x: T.PEN_SPAN * Math.sin(ph), dir: Math.cos(ph) >= 0 ? 1 : -1 };
  }

  /** Write a note into the field. False when dropped (too soon / all slots live). */
  spawn(o: Onset): boolean {
    if (this.t - this.lastSpawn < T.MIN_SPAWN_GAP_SEC) { this.dropped++; return false; }
    const r = this.slots.find((s) => !s.live);
    if (!r) { this.dropped++; return false; }
    const p = Math.max(0, Math.min(1, o.pitch));
    const pen = this.pen();
    const jit = T.JITTER_LOW + (T.JITTER_HIGH - T.JITTER_LOW) * p;
    r.live = true;
    r.pitch = p;
    r.strength = Math.max(0, Math.min(1, o.strength));
    r.age = 0;
    r.life = T.LIFE_LOW_SEC + (T.LIFE_HIGH_SEC - T.LIFE_LOW_SEC) * p;
    r.radius = T.RADIUS_LOW + (T.RADIUS_HIGH - T.RADIUS_LOW) * p;
    r.x = Math.max(-0.9, Math.min(0.9, pen.x + (this.rand() * 2 - 1) * jit));
    r.y = T.Y_LOW + (T.Y_HIGH - T.Y_LOW) * p + (this.rand() * 2 - 1) * 0.06;
    // the swirl rolls the way the pen is writing (neighbours never cancel)
    r.spin = pen.dir;
    r.seed = this.rand();
    this.lastSpawn = this.t;
    this.spawned++;
    return true;
  }

  /** Advance by dt: age + drift the ripples, take an onset, slew the gate
   *  toward `gainTarget` and pack the live ripples. Returns the live count. */
  step(dt: number, onset: Onset | null, gainTarget: number): number {
    dt = Math.max(0, Math.min(0.1, dt));
    this.t += dt;
    this.gate += (Math.max(0, gainTarget) - this.gate) * (1 - Math.exp(-dt / T.GATE_TAU));
    for (const r of this.slots) {
      if (!r.live) continue;
      r.age += dt;
      r.y += T.DRIFT_UP * dt;
      if (r.age >= r.life) r.live = false;
    }
    if (onset) this.spawn(onset);
    let n = 0;
    if (this.gate > 1e-3) {
      for (const r of this.slots) {
        if (!r.live) continue;
        const amp = r.spin * r.strength * rippleEnvelope(r.age, r.life) * this.gate;
        if (Math.abs(amp) < 1e-4) continue;
        const o = n * SCORE_STRIDE;
        const P = this.packed;
        P[o] = r.x; P[o + 1] = r.y; P[o + 2] = amp; P[o + 3] = r.radius;
        P[o + 4] = r.pitch; P[o + 5] = r.age / r.life; P[o + 6] = r.seed; P[o + 7] = 0;
        n++;
      }
    }
    this.count = n;
    return n;
  }

  /** Live ripples (scheduled, regardless of the gate). */
  live(): number {
    let n = 0;
    for (const r of this.slots) if (r.live) n++;
    return n;
  }
}

/** Is the living score on for this tab? `?score=1` / `?score=0` (kept in
 *  sessionStorage across the kiosk loop's navigations), else the default. */
export function livingScoreEnabled(search?: string, store?: Pick<Storage, "getItem" | "setItem"> | null): boolean {
  let q: string | null = null;
  try {
    const s = search ?? (typeof location !== "undefined" ? location.search : "");
    q = new URLSearchParams(s).get("score");
  } catch { q = null; }
  try {
    if (q === "1" || q === "0") store?.setItem(SCORE_SESSION_KEY, q);
  } catch { /* storage blocked */ }
  if (q === "1") return true;
  if (q === "0") return false;
  try {
    const kept = store?.getItem(SCORE_SESSION_KEY);
    if (kept === "1") return true;
    if (kept === "0") return false;
  } catch { /* storage blocked */ }
  return LIVING_SCORE_DEFAULT;
}

/** Session store for the flag (null where storage is blocked / no window). */
export function scoreSessionStore(): Pick<Storage, "getItem" | "setItem"> | null {
  try { return typeof window !== "undefined" ? window.sessionStorage : null; } catch { return null; }
}
