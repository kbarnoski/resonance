// Curwen / Kodály 7-sign classifier.
// From 21 MediaPipe hand landmarks we derive per-finger extended/curled booleans
// and a coarse hand orientation, then map to one of the 7 scale degrees.
//
// Canonical Curwen signs we approximate (a 4-year-old needs reliably-distinct
// shapes, not clinical accuracy):
//   do  = closed fist (all fingers curled)
//   re  = flat hand slanting diagonally UP (fingers together, pointing up-ish)
//   mi  = flat hand held horizontal, fingers pointing sideways (palm down)
//   fa  = fist with the THUMB pointing down
//   sol = open flat hand, fingers up vertical, palm forward
//   la  = relaxed hand drooping, fingers pointing DOWN
//   ti  = index finger pointing UP (other fingers curled)
//
// Landmark indices (MediaPipe Hand):
//   0 wrist
//   thumb:  1 cmc, 2 mcp, 3 ip, 4 tip
//   index:  5 mcp, 6 pip, 7 dip, 8 tip
//   middle: 9 mcp, 10 pip, 11 dip, 12 tip
//   ring:  13 mcp, 14 pip, 15 dip, 16 tip
//   pinky: 17 mcp, 18 pip, 19 dip, 20 tip

export type Degree = "do" | "re" | "mi" | "fa" | "sol" | "la" | "ti";

export const DEGREES: Degree[] = ["do", "re", "mi", "fa", "sol", "la", "ti"];

// Semitone offsets from C in a C-major scale.
export const DEGREE_SEMITONE: Record<Degree, number> = {
  do: 0,
  re: 2,
  mi: 4,
  fa: 5,
  sol: 7,
  la: 9,
  ti: 11,
};

// Consistent pitch -> hue palette (warm, kid-bright). Hue in degrees.
export const DEGREE_HUE: Record<Degree, number> = {
  do: 8, // warm red
  re: 32, // orange
  mi: 52, // gold
  fa: 130, // green
  sol: 190, // cyan
  la: 230, // blue
  ti: 285, // violet
};

export const DEGREE_LABEL: Record<Degree, string> = {
  do: "do",
  re: "re",
  mi: "mi",
  fa: "fa",
  sol: "so",
  la: "la",
  ti: "ti",
};

// Friendly emoji per sign, so a non-reader can find the buttons.
export const DEGREE_EMOJI: Record<Degree, string> = {
  do: "✊", // fist
  re: "↗️", // slanting up
  mi: "✋", // flat hand
  fa: "👎", // thumb down
  sol: "🖐️", // open palm
  la: "↘️", // drooping down
  ti: "☝️", // pointing up
};

interface Vec2 {
  x: number;
  y: number;
}

interface LM {
  x: number;
  y: number;
  z: number;
}

export interface ClassifyResult {
  degree: Degree | null;
  // 0..1 vertical position of the hand in frame (1 = top). Drives octave/brightness.
  height: number;
  confidence: number;
}

function sub(a: LM | Vec2, b: LM | Vec2): Vec2 {
  return { x: a.x - b.x, y: a.y - b.y };
}
function len(v: Vec2): number {
  return Math.hypot(v.x, v.y);
}

// Is a finger extended? Compare tip-to-wrist distance vs pip-to-wrist distance
// in the hand's own scale. Extended fingers reach noticeably farther.
function fingerExtended(
  lm: LM[],
  tip: number,
  pip: number,
  mcp: number,
  scale: number,
): boolean {
  const wrist = lm[0];
  const dTip = len(sub(lm[tip], wrist));
  const dMcp = len(sub(lm[mcp], wrist));
  // Extended when the tip is meaningfully beyond its knuckle.
  return dTip - dMcp > 0.55 * scale && len(sub(lm[tip], lm[pip])) > 0.25 * scale;
}

// Classify a single hand's 21 landmarks (normalized 0..1, y-down, already
// expected to be in the mirrored selfie space the caller maps).
export function classifyHand(lm: LM[]): ClassifyResult {
  if (!lm || lm.length < 21) {
    return { degree: null, height: 0.5, confidence: 0 };
  }
  const wrist = lm[0];
  const midMcp = lm[9];
  // Hand scale: wrist -> middle knuckle is a stable size reference.
  const scale = Math.max(0.001, len(sub(midMcp, wrist)));

  // Per-finger extended booleans.
  const idx = fingerExtended(lm, 8, 6, 5, scale);
  const mid = fingerExtended(lm, 12, 10, 9, scale);
  const rng = fingerExtended(lm, 16, 14, 13, scale);
  const pky = fingerExtended(lm, 20, 18, 17, scale);
  const extendedCount = [idx, mid, rng, pky].filter(Boolean).length;

  // Thumb direction (tip relative to its mcp). y-down: negative = up.
  const thumbVec = sub(lm[4], lm[2]);
  const thumbUp = thumbVec.y < -0.25 * scale;
  const thumbDown = thumbVec.y > 0.25 * scale;

  // Overall finger-pointing direction: average of the four fingertips minus
  // the four knuckles, giving the splay direction of the hand.
  const tipsAvg: Vec2 = {
    x: (lm[8].x + lm[12].x + lm[16].x + lm[20].x) / 4,
    y: (lm[8].y + lm[12].y + lm[16].y + lm[20].y) / 4,
  };
  const knuckAvg: Vec2 = {
    x: (lm[5].x + lm[9].x + lm[13].x + lm[17].x) / 4,
    y: (lm[5].y + lm[9].y + lm[13].y + lm[17].y) / 4,
  };
  const pointDir = sub(tipsAvg, knuckAvg);
  const pointLen = Math.max(0.0001, len(pointDir));
  const norm: Vec2 = { x: pointDir.x / pointLen, y: pointDir.y / pointLen };

  // Angle classification of the splay direction.
  const up = norm.y < -0.55; // fingers point up
  const down = norm.y > 0.55; // fingers point down (drooping)
  const sideways = Math.abs(norm.y) <= 0.55; // roughly horizontal

  // Diagonal-up: up-ish but with notable sideways lean.
  const diagonalUp = norm.y < -0.3 && norm.y > -0.78 && Math.abs(norm.x) > 0.35;

  // height in frame (1 = top). y is 0 at top in image space.
  const height = clamp01(1 - wrist.y);

  let degree: Degree | null = null;
  let confidence = 0.6;

  // ── Decision tree (ordered, most-specific first) ──
  if (extendedCount <= 1 && !idx && !mid && !rng && !pky) {
    // Closed fist. Thumb direction disambiguates do vs fa.
    if (thumbDown) {
      degree = "fa";
      confidence = 0.85;
    } else {
      degree = "do"; // fist, thumb on top / neutral
      confidence = 0.8;
    }
  } else if (idx && !mid && !rng && !pky) {
    // Only the index finger out.
    if (up || norm.y < -0.2) {
      degree = "ti"; // pointing up
      confidence = 0.85;
    } else {
      degree = "ti";
      confidence = 0.6;
    }
  } else if (extendedCount >= 3) {
    // Open / flat hand. Orientation chooses re / mi / sol / la.
    if (down) {
      degree = "la"; // drooping fingers down
      confidence = 0.8;
    } else if (diagonalUp) {
      degree = "re"; // slanting diagonally up
      confidence = 0.75;
    } else if (up) {
      degree = "sol"; // fingers up, open palm forward
      confidence = 0.8;
    } else if (sideways) {
      degree = "mi"; // flat, horizontal, palm down
      confidence = 0.78;
    } else {
      degree = "sol";
      confidence = 0.5;
    }
  } else if (extendedCount === 2) {
    // Ambiguous in-between shape — lean on orientation but lower confidence.
    if (down) degree = "la";
    else if (diagonalUp) degree = "re";
    else if (up) degree = "sol";
    else degree = "mi";
    confidence = 0.45;
  }

  // Thumb-up reinforces re when flat-hand slanting (Curwen 're' often has the
  // thumb leading the slant) — nudge confidence, never override.
  if (degree === "re" && thumbUp) confidence = Math.min(0.85, confidence + 0.1);

  return { degree, height, confidence };
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
