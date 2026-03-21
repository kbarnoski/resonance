import { U, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG =
  U +
  VISIONARY_PALETTE +
  ROT2 +
  `
// ---- Epicycle / Fourier Visualization ----
// Circles on circles: the visual principle behind Fourier series.
// Each successive circle adds a harmonic to trace complex shapes.

vec2 epicyclePos(float s, float t, int harmonics) {
  vec2 p = vec2(0.0);
  for (int n = 1; n <= 8; n++) {
    if (n > harmonics) break;
    float fn = float(n);
    float radius = 0.2 / fn; // amplitude decreases with harmonic
    float speed = fn * s;
    float phase = fn * t * 0.3;
    p += radius * vec2(cos(speed + phase), sin(speed + phase));
  }
  return p;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.15;

  vec3 color = vec3(0.0);

  // Number of harmonics responds to amplitude
  int numHarmonics = 4 + int(u_amplitude * 4.0);

  // Draw the resulting Fourier curve
  float minCurveDist = 999.0;
  for (int i = 0; i < 150; i++) {
    float s = float(i) * 6.28318 / 150.0;
    vec2 pt = epicyclePos(s, t, 8);
    minCurveDist = min(minCurveDist, length(uv - pt));
  }

  float curveGlow = exp(-minCurveDist * (35.0 + u_mid * 12.0));
  float curveCore = smoothstep(0.004, 0.0, minCurveDist);

  vec3 curveCol = palette(
    minCurveDist * 8.0 + t * 0.3 + u_amplitude * 0.2,
    vec3(0.5, 0.5, 0.55),
    vec3(0.45, 0.42, 0.5),
    vec3(0.8, 0.9, 1.0),
    vec3(0.0, 0.1, 0.25)
  );
  color += curveCol * curveGlow * 0.4;
  color += curveCol * curveCore * 0.6;

  // Draw the epicycle circles at the current time position
  float traceS = t * 2.0; // current parametric position
  vec2 centerP = vec2(0.0);

  for (int n = 1; n <= 8; n++) {
    float fn = float(n);
    float radius = 0.2 / fn;
    float speed = fn * traceS;
    float phase = fn * t * 0.3;

    // Circle outline
    float circDist = abs(length(uv - centerP) - radius);
    float circGlow = exp(-circDist * 60.0) * (0.15 / fn);

    vec3 circCol = palette(
      fn * 0.15 + t * 0.2,
      vec3(0.4, 0.42, 0.5),
      vec3(0.25, 0.28, 0.35),
      vec3(0.5, 0.7, 1.0),
      vec3(0.1, 0.1, 0.3)
    );
    color += circCol * circGlow * (0.5 + u_treble * 0.3);

    // Radius arm
    vec2 nextP = centerP + radius * vec2(cos(speed + phase), sin(speed + phase));
    vec2 pa = uv - centerP;
    vec2 ba = nextP - centerP;
    float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
    float armDist = length(pa - ba * h);
    float armGlow = exp(-armDist * 80.0) * (0.1 / fn);
    color += circCol * armGlow * (0.5 + u_bass * 0.5);

    // Pivot point
    float pivotDist = length(uv - nextP);
    float pivotGlow = exp(-pivotDist * pivotDist * 2000.0) * (0.3 / fn);
    color += vec3(0.6, 0.65, 0.8) * pivotGlow;

    centerP = nextP;
  }

  // Trail: draw the recent path of the tip
  for (int i = 0; i < 60; i++) {
    float fi = float(i);
    float trailS = traceS - fi * 0.05;
    vec2 trailP = epicyclePos(trailS, t, 8);
    float trailDist = length(uv - trailP);
    float trailFade = 1.0 - fi / 60.0;
    float trailGlow = exp(-trailDist * trailDist * 3000.0) * trailFade * 0.15;
    vec3 trailCol = palette(
      fi * 0.03 + t * 0.4,
      vec3(0.5, 0.52, 0.58),
      vec3(0.35, 0.38, 0.45),
      vec3(0.6, 0.8, 1.0),
      vec3(0.05, 0.1, 0.3)
    );
    color += trailCol * trailGlow;
  }

  // Vignette
  color *= smoothstep(1.5, 0.5, length(uv));

  gl_FragColor = vec4(color, 1.0);
}
`;
