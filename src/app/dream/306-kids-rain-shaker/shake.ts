// Accelerometer shake-energy detector.
// ────────────────────────────────────────────────────────────────────────────
// Pipeline (per devicemotion event, ~60 Hz):
//   1. read accelerationIncludingGravity (x,y,z) in m/s²
//   2. HIGH-PASS: keep a slow running-average per axis (the gravity component)
//      and subtract it, leaving only the dynamic acceleration from shaking
//   3. take the magnitude of the high-passed vector
//   4. feed a smoothed running "shake-energy" envelope (attack fast, release slow)
//   5. threshold-crossings of the envelope (with a refractory window) emit
//      discrete "hit" events — each strikes a bell. The continuous envelope
//      itself drives rainstick-bead density.
//
// The same maths is reused by the pointer-shake and auto-demo fallbacks: those
// just feed a synthetic acceleration vector into pushSample(), so every input
// path drives the IDENTICAL energy → rain → bell machine.

export interface ShakeHit {
  /** envelope energy at the moment of the hit, 0..~1+ */
  strength: number;
}

export interface ShakeDetector {
  /** Feed a raw acceleration sample (includes gravity). Returns a hit if the
   *  energy crossed the threshold and we're past the refractory window. */
  pushSample: (ax: number, ay: number, az: number, nowMs: number) => ShakeHit | null;
  /** Current smoothed shake-energy envelope, normalised ~0..1 (can exceed 1). */
  energy: () => number;
  reset: () => void;
}

export interface ShakeConfig {
  /** running-average factor for the gravity estimate (per sample). Small = slow
   *  follow = good high-pass. */
  gravityFollow: number;
  /** envelope attack coefficient (toward instantaneous magnitude when rising). */
  attack: number;
  /** envelope release coefficient (toward 0 when falling). */
  release: number;
  /** energy above which a threshold-crossing fires a hit. */
  hitThreshold: number;
  /** minimum ms between hits. */
  refractoryMs: number;
  /** divides raw magnitude into the normalised envelope. ~m/s² for a "big" shake. */
  scale: number;
}

export const DEFAULT_SHAKE: ShakeConfig = {
  gravityFollow: 0.06,
  attack: 0.55,
  release: 0.12,
  hitThreshold: 0.32,
  refractoryMs: 130,
  scale: 14,
};

export function createShakeDetector(cfg: ShakeConfig = DEFAULT_SHAKE): ShakeDetector {
  // slow per-axis running average ≈ gravity vector
  let gx = 0;
  let gy = 0;
  let gz = 0;
  let primed = false;

  let env = 0; // smoothed energy envelope, normalised
  let above = false; // is the envelope currently above threshold?
  let lastHitMs = -1e9;

  function pushSample(
    ax: number,
    ay: number,
    az: number,
    nowMs: number,
  ): ShakeHit | null {
    if (!primed) {
      gx = ax;
      gy = ay;
      gz = az;
      primed = true;
      return null;
    }
    // 1. update the slow gravity estimate
    gx += (ax - gx) * cfg.gravityFollow;
    gy += (ay - gy) * cfg.gravityFollow;
    gz += (az - gz) * cfg.gravityFollow;

    // 2. high-pass: dynamic acceleration only
    const hx = ax - gx;
    const hy = ay - gy;
    const hz = az - gz;

    // 3. magnitude → normalised instantaneous energy
    const mag = Math.sqrt(hx * hx + hy * hy + hz * hz);
    const inst = mag / cfg.scale;

    // 4. envelope: fast attack, slow release
    if (inst > env) env += (inst - env) * cfg.attack;
    else env += (inst - env) * cfg.release;

    // 5. threshold crossing → hit (with refractory)
    let hit: ShakeHit | null = null;
    if (env >= cfg.hitThreshold) {
      if (!above && nowMs - lastHitMs >= cfg.refractoryMs) {
        lastHitMs = nowMs;
        hit = { strength: Math.min(1.6, env) };
      }
      above = true;
    } else if (env < cfg.hitThreshold * 0.7) {
      // hysteresis: must dip clearly below before re-arming
      above = false;
    }

    return hit;
  }

  return {
    pushSample,
    energy: () => env,
    reset: () => {
      gx = gy = gz = 0;
      primed = false;
      env = 0;
      above = false;
      lastHitMs = -1e9;
    },
  };
}
