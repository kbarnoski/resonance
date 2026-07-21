/**
 * The journey engine for 2094 · Unself.
 *
 * This is the research payload: a single autonomous dissociation parameter `D`
 * (0 → peak → 0) sweeping a ~6.5-minute STATEFUL arc — minute 6 must not look
 * or sound like minute 1. The clock runs in wall time so the piece actually
 * ENDS; user tilt only modulates D upward slightly (agency), it never resets
 * the clock.
 *
 * From D we derive every felt quantity, translating the cortical model of
 * ketamine-induced dissociation (Bera, Looger, Proekt & Cichon, The
 * Neuroscientist 2026) into code: dissociation = thalamocortical DISCONNECTION
 * + sensory-gating breakdown + subjective TIME DILATION.
 *
 *   • timeScale  — subjective time dilation. Shrinks as D rises (everything
 *                  slows, DSP glide times stretch), snaps back on RETURN.
 *   • desyncMs   — audio-visual DISCONNECTION. The audio envelope increasingly
 *                  LAGS the visual motion (up to ~600 ms at peak); the two
 *                  streams the brain normally binds come apart.
 *   • ghostNorm / ghostDelaySec — the delayed doppelgänger self peeling off.
 *   • drain      — palette draining toward grey (derealization).
 *   • flatten    — the figure going "cardboard cutout" behind glass.
 *   • dissolve   — the figure dispersing into drifting motes at the peak.
 *
 * No Math.random / Date.now anywhere: seeded PRNG + performance.now deltas only.
 */

export type Phase =
  | "embodied"
  | "depersonalization"
  | "derealization"
  | "dissolution"
  | "return";

export interface ArcState {
  /** Elapsed progress through the whole journey, 0..1. */
  progress: number;
  /** The global dissociation parameter, 0 (embodied) .. 1 (peak dissolution). */
  D: number;
  phase: Phase;
  /** Subjective time dilation multiplier, 1 (normal) .. ~0.38 (deep slow). */
  timeScale: number;
  /** Slowed internal animation clock (seconds) — advanced by dt * timeScale. */
  animTime: number;
  /** Audio-visual desync — how far the audio envelope lags the motion (ms). */
  desyncMs: number;
  /** Motion energy read from `desyncMs` in the PAST (the lagging audio channel). */
  delayedMotion: number;
  /** Doppelgänger presence, 0 (one self) .. 1 (a full second self). */
  ghostNorm: number;
  /** How far behind the ghost replays, seconds (~0.4 → ~3.0). */
  ghostDelaySec: number;
  /** Palette drain toward grey, 0 (full colour) .. 1 (drained). */
  drain: number;
  /** "Cardboard cutout behind glass" flatten amount, 0..1. */
  flatten: number;
  /** Dispersion of the figure into drifting motes, 0..1. */
  dissolve: number;
  /** Soft centre-out boundary-melt glow, 0..1. */
  centerGlow: number;
  /** Trail-persistence alpha for the canvas fade (lower = longer smear). */
  trailAlpha: number;
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}

/** Smooth 0→1 ramp between edges a and b. */
function smooth(a: number, b: number, x: number): number {
  const t = clamp((x - a) / (b - a || 1e-6), 0, 1);
  return t * t * (3 - 2 * t);
}

/** Total journey length, seconds. ~6.5 minutes. */
export const DURATION_SEC = 390;

/** Phase boundaries as a fraction of the timeline. */
const P_EMBODIED = 0.15;
const P_DEPERSON = 0.35;
const P_DEREAL = 0.55;
const P_DISSOLVE = 0.8;
const P_PEAK = 0.675; // where D crests, in the middle of dissolution

function phaseFor(p: number): Phase {
  if (p < P_EMBODIED) return "embodied";
  if (p < P_DEPERSON) return "depersonalization";
  if (p < P_DEREAL) return "derealization";
  if (p < P_DISSOLVE) return "dissolution";
  return "return";
}

const RING = 512;

export class Arc {
  private startMs = -1;
  private lastMs = -1;
  private animTime = 0;

  // Motion-energy ring buffer for the audio-visual desync channel.
  private mt = new Float64Array(RING);
  private mv = new Float32Array(RING);
  private head = 0;
  private filled = 0;

  /** Optional external speed-up so the whole arc can be previewed quickly. */
  constructor(private readonly rate = 1) {}

  /** How far along the journey we are, 0..1 (wall-clock based). */
  progress(tMs: number): number {
    if (this.startMs < 0) return 0;
    return clamp((((tMs - this.startMs) / 1000) * this.rate) / DURATION_SEC, 0, 1);
  }

  private pushMotion(tMs: number, m: number): void {
    this.mt[this.head] = tMs;
    this.mv[this.head] = m;
    this.head = (this.head + 1) % RING;
    if (this.filled < RING) this.filled++;
  }

  /** Read the motion energy as it was `lagMs` ago (linear-interpolated). */
  private sampleDelayed(nowMs: number, lagMs: number): number {
    if (this.filled === 0) return 0;
    const target = nowMs - lagMs;
    let best = 0;
    // Walk backward from newest until we straddle `target`.
    for (let i = 1; i <= this.filled; i++) {
      const idx = (this.head - i + RING) % RING;
      const t = this.mt[idx];
      if (t <= target) {
        const nextIdx = (idx + 1) % RING;
        const t1 = this.mt[nextIdx];
        const v0 = this.mv[idx];
        const v1 = this.mv[nextIdx];
        const span = t1 - t;
        const f = span > 1e-3 ? clamp((target - t) / span, 0, 1) : 0;
        return v0 + (v1 - v0) * f;
      }
      best = this.mv[idx];
    }
    return best; // target older than history — hold oldest
  }

  sample(tMs: number, tiltMotion: number): ArcState {
    if (this.startMs < 0) {
      this.startMs = tMs;
      this.lastMs = tMs;
    }
    let dt = (tMs - this.lastMs) / 1000;
    dt = clamp(dt, 0, 0.1);
    this.lastMs = tMs;

    this.pushMotion(tMs, tiltMotion);

    const p = this.progress(tMs);

    // ── D: a smooth 0 → 1 → 0 bump cresting inside DISSOLUTION.
    const rise = smooth(0, P_PEAK, p);
    const fall = 1 - smooth(P_PEAK, 1, p);
    let dBase = p < P_PEAK ? rise : fall;
    // User tilt nudges D UP a touch (felt agency) but cannot reset the arc.
    const mod = clamp(tiltMotion, 0, 1) * 0.12 * smooth(0.05, 0.2, p);
    const D = clamp(dBase + mod, 0, 1);
    dBase = clamp(dBase, 0, 1);

    // ── Subjective time dilation. Deepest near the peak.
    const timeScale = 1 - 0.62 * dBase;
    this.animTime += dt * timeScale;

    // ── Audio-visual desync (up to ~600 ms at peak), eased.
    const desyncMs = 600 * (dBase * dBase);
    const delayedMotion = this.sampleDelayed(tMs, desyncMs);

    // ── The doppelgänger: peels off in DEPERSONALIZATION, catches up in RETURN.
    const ghostNorm =
      smooth(P_EMBODIED, P_DEPERSON, p) * (1 - smooth(0.82, 0.98, p));
    const ghostDelaySec = 0.4 + ghostNorm * 2.6;

    // ── Palette drain toward grey — DEREALIZATION onward, colour returns last.
    const drain = smooth(0.32, 0.6, p) * (1 - smooth(0.86, 1.0, p));
    // ── Cardboard-cutout flatten + behind-glass — mostly DEREALIZATION.
    const flatten =
      smooth(0.34, 0.5, p) * (1 - smooth(0.72, 0.84, p));
    // ── Dispersion into motes — the DISSOLUTION peak.
    const dissolve = smooth(0.5, 0.68, p) * (1 - smooth(0.8, 0.97, p));
    const centerGlow = dissolve;

    // Trails lengthen (alpha drops) as time slows and the figure dissolves.
    const trailAlpha = 0.34 - 0.26 * dBase;

    return {
      progress: p,
      D,
      phase: phaseFor(p),
      timeScale,
      animTime: this.animTime,
      desyncMs,
      delayedMotion,
      ghostNorm,
      ghostDelaySec,
      drain,
      flatten,
      dissolve,
      centerGlow,
      trailAlpha,
    };
  }
}
