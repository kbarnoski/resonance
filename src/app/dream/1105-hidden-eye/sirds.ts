// ─────────────────────────────────────────────────────────────────────────────
// 1105-hidden-eye · sirds.ts
//
// Pure, side-effect-free helpers for the hidden-eye piece:
//   1. a procedural depth heightfield depth(x,y,t) that morphs through four
//      psychedelic "form" states (dome / tunnel / ripples / mandala), and
//   2. a Single Image Random-Dot Stereogram (SIRDS) encoder that turns that
//      heightfield into a field of dots whose only 3-D content lives in the
//      viewer's binocular fusion — no monocular depth cue exists in the pixels.
//
// Technique after Julesz (Foundations of Cyclopean Perception, 1971) and
// Tyler & Clarke ("The autostereogram", SPIE Proc. 1256, 1990): for each
// scanline, walk left→right; the horizontal separation between two dots that
// must share a colour shrinks where the hidden surface rises toward the eye.
// Linking pixel x to pixel (x - sep) and copying colour left→right solves the
// per-scanline equality constraints in a single pass.
//
// Colours come from a POSITIONAL hash of the *root* pixel (the leftmost member
// of an equality chain), not a running PRNG. That makes the dot field stable
// frame-to-frame: only the links move as depth changes, so unchanged regions
// keep their dots and the image does not strobe.
// ─────────────────────────────────────────────────────────────────────────────

/** Deterministic 8-bit hash of an integer lattice point — the "random" dot. */
export function hashByte(x: number, y: number, seed: number): number {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 2246822519)) >>> 0;
  h = (h ^ (h >>> 13)) >>> 0;
  h = Math.imul(h, 1274126177) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return h & 255;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

// ── the four psychedelic form states, each returning a height in ~0..1 ───────
function formVal(f: number, r: number, ang: number, t: number): number {
  if (f === 0) {
    // breathing dome — a hemisphere that slowly inflates and deflates
    const rr = r / 1.25;
    if (rr >= 1) return 0;
    const h = Math.sqrt(1 - rr * rr);
    return h * (0.82 + 0.18 * Math.sin(t * 0.5));
  }
  if (f === 1) {
    // receding funnel/tunnel — centre far, rim near, rings crawling inward
    const rr = Math.min(1, r / 1.7);
    const ring = 0.5 + 0.5 * Math.sin(r * 7 - t * 1.3);
    return rr * 0.75 + 0.25 * ring * rr;
  }
  if (f === 2) {
    // radial ripples — damped concentric waves spreading from the centre
    const w = Math.sin(r * 9 - t * 1.8) / (1 + r * 0.7);
    return 0.5 + 0.42 * w;
  }
  // mandala of bumps — angular petals riding a radial shell over a soft dome
  const petal = 0.5 + 0.5 * Math.sin(ang * 6 + t * 0.3);
  const shell = Math.exp(-Math.pow((r - 0.55) * 3.2, 2));
  const dome = 0.3 * Math.max(0, 1 - r * 0.7);
  return dome + petal * shell * 0.9;
}

export interface DepthResult {
  meanDepth: number;
  /** mean horizontal gradient magnitude — how much "relief" the surface has. */
  relief: number;
}

/**
 * Fill `out` (length W*H, row-major) with the evolving heightfield at time `t`.
 * `formPos` is a continuous position in form-space (wraps every 4 units); the
 * two nearest forms are cross-faded so states hold, then morph, then hold.
 * `cx,cy` steer the surface centre (keyboard + device tilt). Returns statistics
 * used to drive the audio.
 */
export function computeDepth(
  out: Float32Array,
  W: number,
  H: number,
  t: number,
  cx: number,
  cy: number,
  formPos: number,
): DepthResult {
  const aspect = W / H;
  const fl = ((formPos % 4) + 4) % 4;
  const loI = Math.floor(fl) % 4;
  const hiI = (loI + 1) % 4;
  const frac = fl - Math.floor(fl);
  // hold near a form, then smoothstep across to the next
  let blend: number;
  if (frac <= 0.35) blend = 0;
  else if (frac >= 0.65) blend = 1;
  else {
    const u = (frac - 0.35) / 0.3;
    blend = u * u * (3 - 2 * u);
  }

  let sumD = 0;
  let sumGrad = 0;
  let gradN = 0;

  for (let y = 0; y < H; y++) {
    const ny = (y / H) * 2 - 1 - cy;
    const row = y * W;
    for (let x = 0; x < W; x++) {
      const ax = ((x / W) * 2 - 1) * aspect - cx * aspect;
      const r = Math.sqrt(ax * ax + ny * ny);
      const ang = Math.atan2(ny, ax);
      let d: number;
      if (blend <= 0.001) d = formVal(loI, r, ang, t);
      else if (blend >= 0.999) d = formVal(hiI, r, ang, t);
      else d = formVal(loI, r, ang, t) * (1 - blend) + formVal(hiI, r, ang, t) * blend;
      d = clamp01(d);
      out[row + x] = d;
      sumD += d;
      if (x > 0 && (x & 3) === 0) {
        sumGrad += Math.abs(d - out[row + x - 1]);
        gradN++;
      }
    }
  }

  return {
    meanDepth: sumD / (W * H),
    relief: gradN > 0 ? sumGrad / gradN : 0,
  };
}

/**
 * Encode the depth buffer into an RGBA random-dot stereogram.
 *   sep = round(E * (1 - mu * depth))  — nearer surface ⇒ smaller separation.
 * Pixel x copies the colour of pixel (x - sep); pixels with no left partner are
 * seeded from the positional hash. A flat depth=0 field yields a purely
 * periodic pattern of period E; a raised region locally shrinks that period.
 */
export function encodeSirds(
  out: Uint8ClampedArray,
  depth: Float32Array,
  W: number,
  H: number,
  E: number,
  mu: number,
  seed: number,
): void {
  for (let y = 0; y < H; y++) {
    const row = y * W;
    for (let x = 0; x < W; x++) {
      const sep = Math.round(E * (1 - mu * depth[row + x]));
      const link = x - Math.max(1, sep);
      const oi = (row + x) * 4;
      if (link >= 0) {
        const li = (row + link) * 4;
        out[oi] = out[li];
        out[oi + 1] = out[li + 1];
        out[oi + 2] = out[li + 2];
        out[oi + 3] = 255;
      } else {
        const v = hashByte(x, y, seed);
        out[oi] = v;
        out[oi + 1] = v;
        out[oi + 2] = v;
        out[oi + 3] = 255;
      }
    }
  }
}

/** Pack the float depth buffer into an 8-bit single-channel texture buffer. */
export function packDepth(out: Uint8Array, depth: Float32Array, W: number, H: number): void {
  const n = W * H;
  for (let i = 0; i < n; i++) {
    const v = depth[i] * 255;
    out[i] = v < 0 ? 0 : v > 255 ? 255 : v | 0;
  }
}
