// ─────────────────────────────────────────────────────────────────────────────
// render.ts — Canvas2D log-polar form-constant kaleidoscope.
//
//   NOT a WebGL fragment shader (banned this cycle): we lay petals/cells out in
//   CORTICAL (u = log r, v = θ) space and place them on screen via the inverse
//   exp() warp, exactly the Bressloff–Cowan retina→V1 map. The petals are
//   modulated by formConstant() / honeycomb() from the shared engine, so the
//   field is genuinely one stripe/hex pattern seen through the log-polar warp —
//   tunnels, spokes, spirals, honeycombs — folded N-fold into a kaleidoscope.
//
//   The face drives it through DriveState (see mapping.ts). Warm psilocybin
//   palette only: deep ember → rust → amber → gold; never cold.
// ─────────────────────────────────────────────────────────────────────────────

import {
  cortexToScreen,
  formConstant,
  honeycomb,
  FORM_PHI,
  type FormConstant,
} from "../_shared/psych/logpolar";
import { formBlend, type DriveState } from "./mapping";

/** Warm psilocybin ramp: t in [0,1] → [r,g,b]. ember→rust→amber→gold.
 *  warmth shifts the ramp hotter; never produces a cold hue. */
function emberColor(t: number, warmth: number, light: number): string {
  // anchor stops (deep ember, rust, amber, gold) in RGB
  const stops: [number, number, number][] = [
    [28, 6, 4], // near-black ember
    [120, 28, 10], // ember red
    [196, 70, 18], // rust
    [240, 140, 36], // amber
    [255, 206, 110], // gold
  ];
  const x = Math.max(0, Math.min(0.999, t * (0.55 + warmth * 0.6)));
  const seg = x * (stops.length - 1);
  const i = Math.floor(seg);
  const f = seg - i;
  const a = stops[i];
  const b = stops[Math.min(stops.length - 1, i + 1)];
  const r = (a[0] + (b[0] - a[0]) * f) * light;
  const g = (a[1] + (b[1] - a[1]) * f) * light;
  const bl = (a[2] + (b[2] - a[2]) * f) * light;
  return `rgb(${r | 0}, ${g | 0}, ${bl | 0})`;
}

/** phi (plane-wave direction) for a form constant; honeycomb handled separately. */
function phiFor(name: FormConstant): number {
  if (name === "honeycomb") return FORM_PHI.tunnel;
  return FORM_PHI[name];
}

/** Evaluate the (blended) form-constant field at cortical (u,v). [0,1]. */
function fieldAt(
  u: number,
  v: number,
  drive: DriveState,
  phase: number,
): number {
  const { a, b, t } = formBlend(drive.formPos);
  const evalOne = (name: FormConstant): number => {
    if (name === "honeycomb") return honeycomb(u, v, drive.freq, phase);
    return formConstant(u, v, phiFor(name), drive.freq, phase);
  };
  const va = evalOne(a);
  const vb = evalOne(b);
  return va * (1 - t) + vb * t;
}

export interface RenderState {
  /** smoothed phase (inward come-up drift). */
  phase: number;
  /** smoothed spin angle from handedness. */
  spin: number;
}

export function makeRenderState(): RenderState {
  return { phase: 0, spin: 0 };
}

/** One frame of the kaleidoscope. `flickerMul` is the safeFlicker luminance
 *  multiplier (1 when off). dt in seconds. */
export function drawFrame(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  drive: DriveState,
  rs: RenderState,
  dt: number,
  flickerMul: number,
): void {
  const W = canvas.width;
  const H = canvas.height;
  const cx = W / 2;
  const cy = H / 2;
  const R = Math.min(W, H) * 0.46;

  // advance animation
  rs.phase += drive.phaseVel * dt;
  rs.spin += drive.handedness * dt * 0.8;

  // trailing fade (warm-black, never blue) for bloom persistence
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = `rgba(8, 3, 2, ${0.16 + (1 - drive.bloom) * 0.14})`;
  ctx.fillRect(0, 0, W, H);

  const fold = Math.max(2, Math.round(drive.fold));
  const light = (0.45 + drive.bloom * 0.75) * flickerMul;

  ctx.globalCompositeOperation = "lighter";

  // Sample the field on a polar grid in CORTICAL space, mirror it N-fold into a
  // kaleidoscope wedge, and draw each cell as a glowing petal placed on screen
  // via the inverse exp() warp.
  const radialSteps = 26; // along u (log r)
  const angSteps = 14; // across one wedge in v (θ)
  const wedge = (Math.PI * 2) / fold;

  // u range: from a small inner radius out to R, in log space.
  const rInner = R * 0.045;
  const uMin = Math.log(rInner);
  const uMax = Math.log(R);

  // detail term thins/thickens petals
  const detail = 0.35 + drive.entropy * 0.9;

  for (let f = 0; f < fold; f++) {
    const base = rs.spin + f * wedge;
    // alternate mirror so adjacent wedges reflect (true kaleidoscope)
    const mirror = f % 2 === 0 ? 1 : -1;

    for (let ri = 0; ri < radialSteps; ri++) {
      const u = uMin + ((ri + 0.5) / radialSteps) * (uMax - uMin);
      const ringR = Math.exp(u);
      for (let ai = 0; ai < angSteps; ai++) {
        const vWedge = ((ai + 0.5) / angSteps) * wedge - wedge / 2;
        const v = base + mirror * vWedge;
        // field uses cortical coords (u, raw angle) so it warps correctly
        const fv = fieldAt(u, v, drive, rs.phase);
        // gate petals so we see structure, not a solid disc
        const thresh = 0.5 - detail * 0.28;
        if (fv < thresh) continue;
        const m = (fv - thresh) / (1 - thresh); // [0,1] intensity within petal

        const [sx, sy] = cortexToScreen(u, v); // unit-ish; scale by 1 (exp already gives r)
        const px = cx + sx;
        const py = cy + sy;
        if (px < -50 || px > W + 50 || py < -50 || py > H + 50) continue;

        // petal size grows outward (cells get bigger far from fovea) and with bloom
        const cell = (ringR * wedge) / angSteps;
        const rad = Math.max(1, cell * (0.35 + m * 0.6) * (0.7 + drive.bloom * 0.7));

        // color: warmth + radial position + field intensity
        const tCol = Math.min(1, 0.2 + (u - uMin) / (uMax - uMin) * 0.6 + m * 0.4);
        const a = (0.05 + m * 0.5) * light;
        ctx.fillStyle = emberColor(tCol, drive.warmth, Math.min(1, light * (0.6 + m)));
        ctx.globalAlpha = Math.min(0.9, a);
        ctx.beginPath();
        ctx.arc(px, py, rad, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  ctx.globalAlpha = 1;

  // warm central glow (the fovea / come-up point)
  const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * (0.5 + drive.bloom * 0.5));
  glow.addColorStop(0, `rgba(255, 200, 110, ${0.1 * light})`);
  glow.addColorStop(0.4, `rgba(200, 80, 24, ${0.06 * light})`);
  glow.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(cx, cy, R * (0.5 + drive.bloom * 0.5), 0, Math.PI * 2);
  ctx.fill();

  ctx.globalCompositeOperation = "source-over";
}
