/* ── 5048-narthex · Canvas2D projected-3D void → tunnel → light ─────────────
 *
 *  A starfield in a cylinder ahead of the camera. Head-look yaw/pitch rotate
 *  the whole field around the head (turn left → field swings right). As
 *  distance-to-light rises the points rush forward and streak into a radial
 *  tunnel converging on the vanishing point, where a warm violet-white light
 *  BLOOMS and grows. The arc must read from the visuals ALONE — for a phone
 *  review with no headphones. Motion only; slow luminance drift; NO strobe.
 */

export interface Star {
  a: number; // angle around the tube
  r: number; // radius 0..1 in the tube
  z: number; // depth ahead of camera
}

export interface VoidField {
  stars: Star[];
  rng: () => number;
}

const Z_NEAR = 0.25;
const Z_FAR = 6.0;
const TUBE = 3.2;

export function makeStarField(rng: () => number, count: number): VoidField {
  const stars: Star[] = [];
  for (let i = 0; i < count; i++) {
    stars.push({
      a: rng() * Math.PI * 2,
      r: Math.sqrt(rng()), // even areal density
      z: Z_NEAR + rng() * (Z_FAR - Z_NEAR),
    });
  }
  return { stars, rng };
}

function mixHex(
  a: [number, number, number],
  b: [number, number, number],
  t: number,
): [number, number, number] {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
}

// cold scattered violet (void) → warm violet-white (light)
const COLD: [number, number, number] = [120, 96, 210];
const WARM: [number, number, number] = [255, 236, 250];

export interface DrawParams {
  dtl: number; // distance-to-light 0..1
  yaw: number; // head-look azimuth (rad), + = looking right
  pitch: number; // head-look elevation (rad), + = looking up
  time: number; // seconds, for slow luminance drift
}

/** Advance and render one frame. Mutates star depths in place. */
export function drawVoid(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  field: VoidField,
  dt: number,
  p: DrawParams,
): void {
  const { stars, rng } = field;
  const cx = w / 2;
  const cy = h / 2;
  const minDim = Math.min(w, h);
  const focal = minDim * 0.82;

  const s = p.dtl * p.dtl * (3 - 2 * p.dtl); // smoothstep
  const speed = 0.55 + s * 6.2; // z-units per second

  // camera-inverse rotation angles
  const th = -p.yaw;
  const ph = -p.pitch;
  const cth = Math.cos(th);
  const sth = Math.sin(th);
  const cph = Math.cos(ph);
  const sph = Math.sin(ph);

  // ── background: dark, warming faintly at the centre as we near the light ─
  const bg = ctx.createRadialGradient(cx, cy, 0, cx, cy, minDim * 0.85);
  const warmBg = Math.floor(6 + s * 26);
  bg.addColorStop(0, `rgb(${warmBg + 8}, ${warmBg}, ${warmBg + 18})`);
  bg.addColorStop(1, "rgb(3, 2, 7)");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  // vanishing point (where the tunnel converges / the light sits)
  const vpx = cx - focal * (Math.tan(p.yaw) / Math.max(0.2, Math.cos(p.pitch)));
  const vpy = cy - focal * Math.tan(p.pitch);

  // ── the streaking starfield ──
  ctx.globalCompositeOperation = "lighter";
  const trail = 0.04 + s * 0.55; // streak length in z, grows with speed
  const drift = 1 + 0.05 * Math.sin(p.time * 0.15);

  for (let i = 0; i < stars.length; i++) {
    const st = stars[i];
    st.z -= speed * dt;
    if (st.z <= Z_NEAR) {
      st.z += Z_FAR - Z_NEAR;
      st.a = rng() * Math.PI * 2;
      st.r = Math.sqrt(rng());
    }

    const x0 = Math.cos(st.a) * st.r * TUBE;
    const y0 = Math.sin(st.a) * st.r * TUBE;

    const near = project(x0, y0, st.z, cth, sth, cph, sph, focal, cx, cy);
    if (!near) continue;
    const far = project(
      x0,
      y0,
      st.z + trail,
      cth,
      sth,
      cph,
      sph,
      focal,
      cx,
      cy,
    );
    if (!far) continue;

    // depth fade: closest points brightest
    const depth = 1 - (st.z - Z_NEAR) / (Z_FAR - Z_NEAR);
    // proximity to the vanishing point warms + brightens the point
    const dxc = near.x - vpx;
    const dyc = near.y - vpy;
    const distC = Math.hypot(dxc, dyc) / minDim;
    const centreWarm = Math.max(0, 1 - distC * 2.2);
    const warmT = Math.min(1, s * 0.7 + centreWarm * 0.6);
    const col = mixHex(COLD, WARM, warmT);

    const alpha =
      Math.min(0.9, 0.12 + depth * 0.7) * (0.55 + 0.45 * drift) * (0.5 + s * 0.6);
    const size = (0.6 + depth * 1.8) * (1 + s * 0.6);

    ctx.strokeStyle = `rgba(${col[0] | 0}, ${col[1] | 0}, ${col[2] | 0}, ${alpha.toFixed(3)})`;
    ctx.lineWidth = size;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(far.x, far.y);
    ctx.lineTo(near.x, near.y);
    ctx.stroke();
  }

  // ── the light: warm violet-white bloom at the vanishing point ──
  drawBloom(ctx, vpx, vpy, minDim, s, drift);

  ctx.globalCompositeOperation = "source-over";

  // gentle vignette to hold the eye toward the crossing
  const vg = ctx.createRadialGradient(
    cx,
    cy,
    minDim * 0.35,
    cx,
    cy,
    minDim * 0.85,
  );
  vg.addColorStop(0, "rgba(0,0,0,0)");
  vg.addColorStop(1, `rgba(0,0,0,${(0.55 - s * 0.3).toFixed(3)})`);
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, w, h);
}

function drawBloom(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  minDim: number,
  s: number,
  drift: number,
): void {
  const core = (0.02 + s * 0.5) * minDim * (0.96 + 0.04 * drift);
  const halo = core * 2.4;
  const aCore = Math.min(1, 0.15 + s * 0.85);
  const aHalo = 0.1 + s * 0.4;

  const g1 = ctx.createRadialGradient(x, y, 0, x, y, halo);
  g1.addColorStop(0, `rgba(255, 244, 252, ${aHalo.toFixed(3)})`);
  g1.addColorStop(0.4, `rgba(178, 138, 255, ${(aHalo * 0.5).toFixed(3)})`);
  g1.addColorStop(1, "rgba(60, 30, 120, 0)");
  ctx.fillStyle = g1;
  ctx.beginPath();
  ctx.arc(x, y, halo, 0, Math.PI * 2);
  ctx.fill();

  const g2 = ctx.createRadialGradient(x, y, 0, x, y, core);
  g2.addColorStop(0, `rgba(255, 250, 255, ${aCore.toFixed(3)})`);
  g2.addColorStop(0.6, `rgba(226, 206, 255, ${(aCore * 0.6).toFixed(3)})`);
  g2.addColorStop(1, "rgba(150, 110, 240, 0)");
  ctx.fillStyle = g2;
  ctx.beginPath();
  ctx.arc(x, y, core, 0, Math.PI * 2);
  ctx.fill();
}

interface P2 {
  x: number;
  y: number;
}

/** Rotate a world point by the camera-inverse and perspective-project it. */
function project(
  x: number,
  y: number,
  z: number,
  cth: number,
  sth: number,
  cph: number,
  sph: number,
  focal: number,
  cx: number,
  cy: number,
): P2 | null {
  // yaw about Y
  const xr = x * cth + z * sth;
  const z1 = -x * sth + z * cth;
  // pitch about X
  const yr = y * cph - z1 * sph;
  const zr = y * sph + z1 * cph;
  if (zr <= 0.05) return null;
  return { x: cx + (xr / zr) * focal, y: cy - (yr / zr) * focal };
}
