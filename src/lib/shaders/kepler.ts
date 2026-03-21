import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  `
// Kepler — orbital mechanics, elliptical paths and focal points.
// Planets trace Keplerian ellipses around focal points,
// with gravitational field lines and swept-area visualizations.

float ellipse(vec2 uv, vec2 center, float a, float b, float angle, float width) {
  vec2 p = (uv - center) * rot2(angle);
  float d = length(p / vec2(a, b));
  return smoothstep(width, 0.0, abs(d - 1.0));
}

float planet(vec2 uv, vec2 pos, float radius) {
  return smoothstep(radius, radius - 0.005, length(uv - pos));
}

float gravField(vec2 uv, vec2 center, float t) {
  vec2 d = uv - center;
  float r = length(d);
  float angle = atan(d.y, d.x);
  float field = sin(r * 20.0 - t * 2.0) * 0.5 + 0.5;
  field *= exp(-r * 3.0);
  return field;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.2;

  // Central star at focal point
  vec2 focus = vec2(0.0, 0.0);
  float starR = length(uv - focus);
  float star = exp(-starR * 12.0) * (1.2 + u_bass * 0.5);
  float starDisk = smoothstep(0.04, 0.03, starR);

  // Gravitational field visualization
  float field = gravField(uv, focus, t);

  // Multiple orbiting bodies on elliptical paths
  float orbits = 0.0;
  float planets = 0.0;
  vec3 orbitColors = vec3(0.0);
  float paletteShift = u_amplitude * 0.25;

  for (int i = 0; i < 5; i++) {
    float fi = float(i);
    float semiMajor = 0.15 + fi * 0.1;
    float eccentricity = 0.3 + fi * 0.08;
    float semiMinor = semiMajor * sqrt(1.0 - eccentricity * eccentricity);
    float tilt = fi * 0.5 + 0.2;
    float orbSpeed = 1.0 / (semiMajor * semiMajor) * 0.3;

    // Draw orbit path
    orbits += ellipse(uv, vec2(semiMajor * eccentricity * cos(tilt), semiMajor * eccentricity * sin(tilt)) * 0.3, semiMajor, semiMinor, tilt, 0.004) * (0.3 + fi * 0.05);

    // Planet position (Kepler approximation — true anomaly simplified)
    float meanAnomaly = t * orbSpeed + fi * 1.25;
    float trueAnomaly = meanAnomaly + eccentricity * sin(meanAnomaly);
    float radius = semiMajor * (1.0 - eccentricity * eccentricity) / (1.0 + eccentricity * cos(trueAnomaly));
    vec2 planetPos = vec2(cos(trueAnomaly + tilt), sin(trueAnomaly + tilt)) * radius;

    float planetSize = 0.012 + fi * 0.003;
    float p = planet(uv, planetPos, planetSize);
    planets += p;

    // Trail behind planet
    for (int j = 1; j < 6; j++) {
      float fj = float(j);
      float pastAnomaly = trueAnomaly - fj * 0.15;
      float pastR = semiMajor * (1.0 - eccentricity * eccentricity) / (1.0 + eccentricity * cos(pastAnomaly));
      vec2 pastPos = vec2(cos(pastAnomaly + tilt), sin(pastAnomaly + tilt)) * pastR;
      float trail = exp(-length(uv - pastPos) * 60.0) * (1.0 - fj * 0.18);
      vec3 tCol = palette(
        fi * 0.2 + paletteShift + 0.1,
        vec3(0.5, 0.5, 0.7),
        vec3(0.3, 0.2, 0.3),
        vec3(0.7, 0.5, 0.8),
        vec3(0.1, 0.1, 0.3)
      );
      orbitColors += tCol * trail * 0.3;
    }
  }

  // Swept area visualization — faint wedge
  float centralAngle = atan(uv.y, uv.x);
  float sweepAngle = fract(t * 0.15) * 6.28;
  float wedge = smoothstep(0.02, 0.0, abs(mod(centralAngle - sweepAngle + 3.14, 6.28) - 3.14));
  wedge *= smoothstep(0.5, 0.1, length(uv)) * 0.1;

  // Star color — warm golden
  vec3 starCol = palette(
    t * 0.03 + paletteShift,
    vec3(0.95, 0.85, 0.5),
    vec3(0.1, 0.1, 0.05),
    vec3(0.3, 0.2, 0.1),
    vec3(0.0, 0.05, 0.05)
  );

  // Orbit path color — cool blue-silver
  vec3 orbitCol = palette(
    orbits + t * 0.02 + paletteShift + 0.4,
    vec3(0.35, 0.4, 0.6),
    vec3(0.15, 0.15, 0.25),
    vec3(0.5, 0.4, 0.7),
    vec3(0.1, 0.1, 0.3)
  );

  vec3 color = vec3(0.0);

  // Gravity field
  color += vec3(0.05, 0.04, 0.1) * field * (0.4 + u_bass * 0.4);

  // Orbit paths
  color += orbitCol * orbits * (0.5 + u_mid * 0.5);
  color += orbitColors;

  // Swept area
  color += vec3(0.2, 0.15, 0.3) * wedge;

  // Planets
  color += vec3(0.9, 0.85, 0.95) * planets;

  // Central star
  color += starCol * star;
  color += vec3(1.0, 0.95, 0.8) * starDisk;

  color *= smoothstep(1.5, 0.5, length(uv));
  gl_FragColor = vec4(color, 1.0);
}
`;
