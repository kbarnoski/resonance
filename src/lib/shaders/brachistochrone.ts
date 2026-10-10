import { U, VISIONARY_PALETTE, ROT2 } from "./shared";
import { RS_WRAP_ENV } from "./time-wrap";

export const FRAG = U + VISIONARY_PALETTE + ROT2 + RS_WRAP_ENV + `
// Cycloid paths cascading down — brachistochrone curves
// x = r(theta - sin(theta)), y = r(1 - cos(theta))
// Multiple cycloid curves at different phases, falling motion, 80 points each

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.2;
  vec3 color = vec3(0.0);

  for (int j = 0; j < 5; j++) {
    float fj = float(j);
    float r = 0.08 + fj * 0.04 + u_bass * 0.01;
    float phaseShift = fj * 1.2 + t * 0.5;
    float yShift = mod(fj * 0.3 + t * 0.15, 1.6) - 0.8;
    // Wrap envelope (time-wrap audit 2026-10-10): the curve fades out
    // before yShift snaps it back up by 1.6.
    float curveEnv = rsWrapEnv((yShift + 0.8) / 1.6);

    for (int i = 0; i < 80; i++) {
      float fi = float(i) / 80.0;
      float theta = fi * 6.28318 * 2.0 + phaseShift;
      float x = r * (theta - sin(theta)) * 0.15 - 0.6;
      float y = -r * (1.0 - cos(theta)) * 0.8 + 0.4 - yShift;

      vec2 p = vec2(x, y);
      float d = length(uv - p);
      float glow = 0.003 / (d + 0.001);

      // Trailing brightness — brighter at the leading point
      float trail = smoothstep(0.0, 1.0, fi);
      float phase = fi + fj * 0.2 + t * 0.1;
      vec3 c = palette(phase, vec3(0.5, 0.5, 0.5), vec3(0.5, 0.5, 0.5),
                        vec3(1.0, 0.7, 0.4), vec3(0.0, 0.15, 0.2));
      color += c * glow * trail * 0.07 * curveEnv;
    }
  }

  // Bright falling "bead" on each cycloid
  for (int j = 0; j < 5; j++) {
    float fj = float(j);
    float r = 0.08 + fj * 0.04 + u_bass * 0.01;
    float beadTheta = mod(t * 2.0 + fj * 1.2, 6.28318 * 2.0);
    float yShift = mod(fj * 0.3 + t * 0.15, 1.6) - 0.8;
    float bx = r * (beadTheta - sin(beadTheta)) * 0.15 - 0.6;
    float by = -r * (1.0 - cos(beadTheta)) * 0.8 + 0.4 - yShift;
    float bd = length(uv - vec2(bx, by));
    float bglow = 0.006 / (bd + 0.003);
    // the bead fades at the end of its slide (and with its curve) instead of
    // teleporting back to the top
    float beadEnv = rsWrapEnvK(beadTheta / (6.28318 * 2.0), 0.06, 0.9) * rsWrapEnv((yShift + 0.8) / 1.6);
    color += vec3(1.0, 0.95, 0.8) * bglow * (0.5 + u_amplitude * 0.3) * beadEnv;
  }

  // Vignette
  float vig = 1.0 - smoothstep(0.4, 1.4, length(uv));
  color *= vig;

  gl_FragColor = vec4(color, 1.0);
}
`;
