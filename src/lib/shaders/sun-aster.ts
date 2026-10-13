import { U, SMOOTH_NOISE, ROT2 } from "./shared";
import { SUN_COMMON } from "./sun-shared";

// SUN · Aster — a starburst whose rays breathe in a slow wave travelling
// round the circle: each sector's rays lengthen and withdraw in turn, so
// the star is never the same shape twice. Two ray combs (hair-fine and
// coarser) and a whisper of prismatic dispersion: red reaches a little
// further than blue, so the tips fade through rose while the heart stays
// white-gold.
export const FRAG =
  U +
  SMOOTH_NOISE +
  ROT2 +
  SUN_COMMON +
  `
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.05;
  float r = length(uv);
  vec2 dir = uv / max(r, 1e-4);

  // ray length field: smooth around the circle, drifting in time
  float lw = rayNoise(rot2(t * 0.1) * dir, 3.0, vec2(t * 0.9, 0.7 - t * 0.3));
  float L = (0.22 + 0.62 * smoothstep(-0.4, 0.5, lw)) * (0.94 + 0.06 * u_mid);

  float fineR = rayMask(rayNoise(rot2(t * 0.035) * dir, 44.0, vec2(2.0, t * 0.5)), 0.1, 0.55);
  float coarseR = rayMask(rayNoise(rot2(-t * 0.02) * dir, 16.0, vec2(8.0, t * 0.4)), 0.15, 0.55);

  // dispersion: per-channel reach (red longest)
  vec3 Lc = L * vec3(1.07, 1.0, 0.92);
  vec3 prof = exp(-vec3(r) / (Lc * 0.42)) * (1.0 - smoothstep(Lc * 0.45, Lc * 1.2, vec3(r)));
  float lift = smoothstep(0.03, 0.08, r);
  vec3 col = prof * vec3(0.95, 0.9, 0.86) * (fineR * 1.6 + coarseR * 1.0) * lift;

  // heart
  col += vec3(1.0, 0.92, 0.78) * (exp(-r * r / 0.0022) * (0.9 + 0.1 * u_bass) + exp(-r * 12.0) * 0.16);

  col *= 1.0 - smoothstep(0.35, 1.0, r);
  gl_FragColor = vec4(sunTone(col), 1.0);
}
`;
