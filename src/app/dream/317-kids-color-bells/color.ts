// color.ts — Camera center-region sampling + HSV conversion for 317-kids-color-bells
// The novel technique: read pixel region from offscreen canvas drawn from live video → average RGB → HSV → hue bin

export interface RgbAvg {
  r: number;
  g: number;
  b: number;
}

export interface HsvResult {
  h: number; // 0–360
  s: number; // 0–1
  v: number; // 0–1
}

export interface ColorSample {
  hsv: HsvResult;
  rgb: RgbAvg;
  /** 0–5 hue bin index, or -1 if below saturation/value threshold */
  binIdx: number;
  confident: boolean;
}

// ── HSV conversion ─────────────────────────────────────────────────────────────
export function rgbToHsv(r: number, g: number, b: number): HsvResult {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;

  const v = max;
  const s = max === 0 ? 0 : delta / max;

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

  return { h, s, v };
}

// ── Hue → color bin (6 bins, warm→cool ascending rainbow) ─────────────────────
// Bins: 0=red, 1=orange, 2=yellow, 3=green, 4=blue, 5=violet
// Hue ranges:
//   Red:    340–360 and 0–15
//   Orange: 15–45
//   Yellow: 45–75
//   Green:  75–165
//   Blue:   165–265
//   Violet: 265–340
export function hueToBin(h: number): number {
  if (h >= 340 || h < 15)  return 0; // red
  if (h < 45)               return 1; // orange
  if (h < 75)               return 2; // yellow
  if (h < 165)              return 3; // green
  if (h < 265)              return 4; // blue
  return 5;                            // violet
}

// ── Thresholds — generous for kids / real-room objects ────────────────────────
const SAT_THRESHOLD = 0.25; // saturation must be > this (ignore grey/white/black)
const VAL_THRESHOLD = 0.18; // value (brightness) must be > this (ignore very dark)

// ── Sample the center region of an ImageData ──────────────────────────────────
export function sampleCenterRegion(
  imageData: ImageData,
  boxFrac: number // fraction of smaller dimension for the sampling box (e.g. 0.25)
): ColorSample {
  const { width, height, data } = imageData;
  const boxSize = Math.floor(Math.min(width, height) * boxFrac);
  const x0 = Math.floor((width - boxSize) / 2);
  const y0 = Math.floor((height - boxSize) / 2);
  const x1 = x0 + boxSize;
  const y1 = y0 + boxSize;

  let rSum = 0, gSum = 0, bSum = 0, count = 0;

  // Step by 4 pixels for speed
  const step = Math.max(1, Math.floor(boxSize / 32));
  for (let y = y0; y < y1; y += step) {
    for (let x = x0; x < x1; x += step) {
      const i = (y * width + x) * 4;
      rSum += data[i];
      gSum += data[i + 1];
      bSum += data[i + 2];
      count++;
    }
  }

  if (count === 0) {
    return { rgb: { r: 128, g: 128, b: 128 }, hsv: { h: 0, s: 0, v: 0.5 }, binIdx: -1, confident: false };
  }

  const r = rSum / count;
  const g = gSum / count;
  const b = bSum / count;
  const hsv = rgbToHsv(r, g, b);
  const confident = hsv.s > SAT_THRESHOLD && hsv.v > VAL_THRESHOLD;
  const binIdx = confident ? hueToBin(hsv.h) : -1;

  return { rgb: { r, g, b }, hsv, binIdx, confident };
}
