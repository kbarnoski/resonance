// shadows.ts — sundial geometry + scene model for "Move the Sun"
// The shadow of each object is the musical playhead. Its tip sweeps the ground;
// when that tip crosses a chime stone, the stone rings.

export interface SceneObject {
  // ground anchor in normalized coords (0..1 across width, fixed-ish on ground band)
  x: number; // 0..1
  groundY: number; // 0..1 (where its base sits on the ground)
  height: number; // visual + casting height in normalized units (0..1 of canvas height)
  kind: "tree" | "rock" | "crystal";
  hue: number; // base hue for the object body
}

export interface ChimeStone {
  x: number; // 0..1
  y: number; // 0..1 (on the ground band)
  note: number; // index into the tuned scale
  // transient visual energy when struck (decays toward 0)
  flash: number;
}

export interface SunState {
  // Sun travels along an arc parameterised by t in 0..1 (east horizon -> zenith -> west horizon)
  t: number;
}

// Sun position on a half-circle arc above the ground.
// t = 0 -> low east (left), t = 0.5 -> high noon (center), t = 1 -> low west (right).
export function sunPosition(t: number, w: number, h: number): { x: number; y: number; height01: number } {
  const cx = w * 0.5;
  const radius = Math.min(w * 0.46, h * 0.72);
  const angle = Math.PI * (1 - t); // PI (left) -> 0 (right)
  const x = cx + Math.cos(angle) * radius;
  // horizon baseline near the ground band
  const horizonY = h * 0.7;
  const y = horizonY - Math.sin(angle) * radius;
  // height01: 0 at horizon, 1 at zenith — drives shadow length + sky color
  const height01 = Math.max(0, Math.sin(angle));
  return { x, y, height01 };
}

// Cast the shadow of an object given the sun's screen position.
// Returns the base point and the tip point in *pixel* coordinates.
// Low sun -> long shadow (1/height); high sun -> short shadow. Direction = away from sun.
export function castShadow(
  obj: SceneObject,
  sun: { x: number; y: number; height01: number },
  w: number,
  h: number,
): { baseX: number; baseY: number; tipX: number; tipY: number; length: number } {
  const baseX = obj.x * w;
  const baseY = obj.groundY * h;

  // Direction on the ground pointing away from the sun (horizontal projection).
  const dx = baseX - sun.x;
  const dirSign = dx >= 0 ? 1 : -1;
  const horiz = Math.abs(dx);
  const dirX = horiz < 1 ? dirSign : dx / Math.hypot(dx, 1);

  // Shadow length grows as the sun gets lower. Clamp to keep it on-canvas-ish.
  const objPx = obj.height * h;
  const elevation = Math.max(0.06, sun.height01); // avoid divide-by-zero at horizon
  const rawLen = objPx / Math.tan(Math.asin(elevation)); // gnomon: L = H / tan(altitude)
  const length = Math.min(rawLen, w * 1.4);

  const tipX = baseX + dirX * length;
  // shadows lie along the ground, drifting slightly down the ground band for depth
  const tipY = baseY + length * 0.06;

  return { baseX, baseY, tipX, tipY, length };
}

// Distance from a point to the shadow segment (base..tip), in pixels.
export function distToShadow(
  px: number,
  py: number,
  s: { baseX: number; baseY: number; tipX: number; tipY: number },
): number {
  const vx = s.tipX - s.baseX;
  const vy = s.tipY - s.baseY;
  const wx = px - s.baseX;
  const wy = py - s.baseY;
  const len2 = vx * vx + vy * vy || 1;
  let tproj = (wx * vx + wy * vy) / len2;
  tproj = Math.max(0, Math.min(1, tproj));
  const cx = s.baseX + tproj * vx;
  const cy = s.baseY + tproj * vy;
  return Math.hypot(px - cx, py - cy);
}

// Sky gradient stops as a function of sun height (dawn -> noon -> dusk).
// We bias by both height (high = noon) and which side of the arc (t) for warmth at the edges.
export function skyColors(t: number, height01: number): { top: string; mid: string; bottom: string } {
  // dawn/dusk warmth factor: 1 at horizons, 0 at noon
  const lowness = 1 - height01;
  // noon palette (pale gold) vs golden-hour palette (rose/amber/violet)
  // blend in HSL-ish hand-tuned stops
  const top = mix("#1a1230", "#2b3b6b", height01 * 0.7); // deep violet night -> daytime blue-violet
  const mid = mix(lerpHex("#e8a06a", "#f6d9a0", height01), "#7a3b8a", lowness * 0.35);
  const bottom = mix(lerpHex("#c66a3a", "#f3c98b", height01), "#3a1d4a", lowness * 0.5);
  return { top, mid, bottom };
}

function clamp255(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)));
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

function rgbToHex(r: number, g: number, b: number): string {
  const to2 = (n: number) => clamp255(n).toString(16).padStart(2, "0");
  return `#${to2(r)}${to2(g)}${to2(b)}`;
}

export function lerpHex(a: string, b: string, t: number): string {
  const tc = Math.max(0, Math.min(1, t));
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  return rgbToHex(r1 + (r2 - r1) * tc, g1 + (g2 - g1) * tc, b1 + (b2 - b1) * tc);
}

// alias for readability at call sites
export function mix(a: string, b: string, t: number): string {
  return lerpHex(a, b, t);
}
