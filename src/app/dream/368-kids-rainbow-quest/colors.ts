// colors.ts — color detection + rainbow target definitions (368)
// ─────────────────────────────────────────────────────────────────────────────
// HSV math, target color definitions, and hue-comparison utilities.
// NO canvas/WebGL/SVG — only computation.  Canvas is used in page.tsx solely
// for the offscreen analysis frame (invisible, never displayed).
// ─────────────────────────────────────────────────────────────────────────────

// ── rainbow target definitions (7 hues, D-Dorian order) ──────────────────────
export interface RainbowColor {
  readonly name: string;        // child-legible label (emoji says it all really)
  readonly emoji: string;       // shown on the creature + arc
  readonly hue: number;         // target hue, degrees 0-360
  readonly hueTolerance: number;// ± degrees to count as "found"
  readonly satMin: number;      // min saturation to count (0-1); rejects grey/white
  readonly valMin: number;      // min brightness to count (0-1)
  readonly hex: string;         // display swatch color
  readonly glowHex: string;     // slightly brighter for glow effects
  readonly arcClass: string;    // Tailwind background class for the rainbow arc band
  readonly noteIdx: number;     // index into D_DORIAN (0=D, 1=E, ..., 6=C)
}

export const RAINBOW_COLORS: readonly RainbowColor[] = [
  {
    name: "Red",
    emoji: "🔴",
    hue: 0,
    hueTolerance: 22,
    satMin: 0.35,
    valMin: 0.22,
    hex: "#ef4444",
    glowHex: "#fca5a5",
    arcClass: "bg-red-500",
    noteIdx: 0, // D4
  },
  {
    name: "Orange",
    emoji: "🟠",
    hue: 30,
    hueTolerance: 18,
    satMin: 0.38,
    valMin: 0.25,
    hex: "#f97316",
    glowHex: "#fdba74",
    arcClass: "bg-orange-500",
    noteIdx: 1, // E4
  },
  {
    name: "Yellow",
    emoji: "🟡",
    hue: 58,
    hueTolerance: 18,
    satMin: 0.32,
    valMin: 0.35,
    hex: "#eab308",
    glowHex: "#fde047",
    arcClass: "bg-yellow-400",
    noteIdx: 2, // F4
  },
  {
    name: "Green",
    emoji: "🟢",
    hue: 130,
    hueTolerance: 28,
    satMin: 0.30,
    valMin: 0.18,
    hex: "#22c55e",
    glowHex: "#86efac",
    arcClass: "bg-green-500",
    noteIdx: 3, // G4
  },
  {
    name: "Blue",
    emoji: "🔵",
    hue: 215,
    hueTolerance: 28,
    satMin: 0.28,
    valMin: 0.18,
    hex: "#3b82f6",
    glowHex: "#93c5fd",
    arcClass: "bg-blue-500",
    noteIdx: 4, // A4
  },
  {
    name: "Indigo",
    emoji: "🟣",
    hue: 260,
    hueTolerance: 25,
    satMin: 0.25,
    valMin: 0.15,
    hex: "#6366f1",
    glowHex: "#a5b4fc",
    arcClass: "bg-indigo-500",
    noteIdx: 5, // B4
  },
  {
    name: "Violet",
    emoji: "💜",
    hue: 295,
    hueTolerance: 22,
    satMin: 0.25,
    valMin: 0.15,
    hex: "#a855f7",
    glowHex: "#d8b4fe",
    arcClass: "bg-purple-500",
    noteIdx: 6, // C5
  },
];

// ── RGB → HSV ─────────────────────────────────────────────────────────────────
export interface HSV {
  h: number; // 0-360
  s: number; // 0-1
  v: number; // 0-1
}

export function rgbToHsv(r: number, g: number, b: number): HSV {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;

  let h = 0;
  if (delta > 0) {
    if (max === rn) {
      h = 60 * (((gn - bn) / delta) % 6);
    } else if (max === gn) {
      h = 60 * ((bn - rn) / delta + 2);
    } else {
      h = 60 * ((rn - gn) / delta + 4);
    }
  }
  if (h < 0) h += 360;

  const s = max === 0 ? 0 : delta / max;
  const v = max;

  return { h, s, v };
}

// ── hue angular distance ──────────────────────────────────────────────────────
export function hueDist(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

// ── compute warmth 0..1 toward a target color ─────────────────────────────────
// Returns 0 (no match) to 1 (perfect match).
export function computeWarmth(hsv: HSV, target: RainbowColor): number {
  if (hsv.s < target.satMin * 0.5 || hsv.v < target.valMin * 0.5) return 0;
  const dist = hueDist(hsv.h, target.hue);
  const maxDist = target.hueTolerance * 2.5; // ramp starts wider than tolerance
  const hueScore = Math.max(0, 1 - dist / maxDist);
  const satScore = Math.min(1, hsv.s / Math.max(target.satMin, 0.01));
  return hueScore * Math.sqrt(satScore);
}

// ── check if current HSV matches the target ───────────────────────────────────
export function isColorMatch(hsv: HSV, target: RainbowColor): boolean {
  if (hsv.s < target.satMin) return false;
  if (hsv.v < target.valMin) return false;
  return hueDist(hsv.h, target.hue) <= target.hueTolerance;
}

// ── sample center pixels from ImageData ──────────────────────────────────────
// Takes the central W×H region and returns the average HSV.
export function sampleCenterHSV(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): HSV {
  // Sample a 40×40 central patch (or smaller if video is tiny)
  const patchW = Math.min(40, Math.floor(width * 0.25));
  const patchH = Math.min(40, Math.floor(height * 0.25));
  const x0 = Math.floor((width - patchW) / 2);
  const y0 = Math.floor((height - patchH) / 2);

  let rSum = 0, gSum = 0, bSum = 0, n = 0;

  for (let y = y0; y < y0 + patchH; y++) {
    for (let x = x0; x < x0 + patchW; x++) {
      const i = (y * width + x) * 4;
      rSum += data[i];
      gSum += data[i + 1];
      bSum += data[i + 2];
      n++;
    }
  }

  if (n === 0) return { h: 0, s: 0, v: 0 };

  return rgbToHsv(rSum / n, gSum / n, bSum / n);
}

// ── shuffle array (Fisher-Yates) ─────────────────────────────────────────────
export function shuffleColors(arr: readonly RainbowColor[]): RainbowColor[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
