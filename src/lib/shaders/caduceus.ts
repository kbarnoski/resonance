import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  `
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.15;
  float paletteShift = u_amplitude * 0.3;

  // Central vertical axis
  float axisWidth = 0.008;
  float axisDist = abs(uv.x) - axisWidth;
  float axisGlow = smoothstep(0.015, 0.0, abs(axisDist));

  // Two serpentine helices wrapping around the axis
  float helixFreq = 6.0 + u_bass * 2.0;
  float helixAmp = 0.15 + u_mid * 0.04;
  float helixPhase = t * 3.0;

  // Left helix (sine wave offset)
  float helix1X = sin(uv.y * helixFreq + helixPhase) * helixAmp;
  float helix1Dist = length(vec2(uv.x - helix1X, 0.0)) - 0.02;

  // Right helix (opposite phase)
  float helix2X = sin(uv.y * helixFreq + helixPhase + 3.14159) * helixAmp;
  float helix2Dist = length(vec2(uv.x - helix2X, 0.0)) - 0.02;

  // Scale patterns on the helices
  float scale1 = sin(uv.y * 30.0 - t * 5.0 + helix1X * 10.0);
  scale1 = smoothstep(0.3, 0.8, scale1);
  float scale2 = sin(uv.y * 30.0 - t * 5.0 + helix2X * 10.0 + 1.5);
  scale2 = smoothstep(0.3, 0.8, scale2);

  // Helix body glows
  float h1Glow = smoothstep(0.03, 0.0, abs(helix1Dist));
  float h1Fill = smoothstep(0.05, 0.01, abs(helix1Dist));
  float h2Glow = smoothstep(0.03, 0.0, abs(helix2Dist));
  float h2Fill = smoothstep(0.05, 0.01, abs(helix2Dist));

  // Crossing points — where helices intersect the axis
  float crossY = sin(uv.y * helixFreq + helixPhase);
  float crossPoints = smoothstep(0.05, 0.0, abs(crossY)) * smoothstep(0.15, 0.0, abs(uv.x));

  // Wings at the top (spread outward)
  float wingY = uv.y - 0.55;
  float wingSpread = max(0.0, -wingY * 3.0);
  float wingCurve = abs(uv.x) - wingSpread * (0.3 + 0.1 * sin(wingY * 8.0 + t));
  float wingShape = smoothstep(0.02, 0.0, abs(wingCurve))
                  * smoothstep(-0.05, 0.0, wingY)
                  * smoothstep(0.3, 0.0, -wingY);

  // Sphere at the top
  float sphere = length(uv - vec2(0.0, 0.6)) - 0.06;
  float sphereGlow = smoothstep(0.02, 0.0, abs(sphere));
  float sphereFill = smoothstep(0.06, 0.0, sphere);

  // Energy flowing upward along helices
  float upflow = sin(uv.y * 15.0 + t * 6.0) * 0.5 + 0.5;
  upflow *= smoothstep(-0.8, 0.5, uv.y);

  // Chakra nodes at crossing points
  float chakras = 0.0;
  for (int i = 0; i < 7; i++) {
    float cy = -0.5 + float(i) * 0.16;
    float cdist = length(uv - vec2(0.0, cy));
    chakras += smoothstep(0.04, 0.0, cdist) * (0.5 + 0.5 * sin(t * 2.0 + float(i)));
  }

  // FBM aura around the form
  float n = fbm(uv * 4.0 + t * 0.2);
  float auraMask = smoothstep(0.3, 0.0, abs(uv.x)) * smoothstep(0.9, 0.3, abs(uv.y));

  // Helix 1 palette — warm gold / crimson
  vec3 col1 = palette(
    uv.y * 2.0 + upflow + paletteShift,
    vec3(0.6, 0.4, 0.3),
    vec3(0.5, 0.4, 0.3),
    vec3(1.0, 0.6, 0.3),
    vec3(0.0, 0.1, 0.15)
  );

  // Helix 2 palette — cool silver / blue
  vec3 col2 = palette(
    uv.y * 2.0 + upflow + paletteShift + 0.5,
    vec3(0.5, 0.5, 0.6),
    vec3(0.4, 0.5, 0.5),
    vec3(0.5, 0.7, 1.0),
    vec3(0.2, 0.3, 0.5)
  );

  // Central axis / chakra palette — white / violet
  vec3 col3 = palette(
    uv.y + t * 0.3 + paletteShift + 0.25,
    vec3(0.7, 0.6, 0.8),
    vec3(0.4, 0.3, 0.4),
    vec3(0.9, 0.7, 1.0),
    vec3(0.5, 0.2, 0.6)
  );

  vec3 color = vec3(0.0);

  // Central axis
  color += col3 * axisGlow * 0.8;

  // Helix bodies with scales
  color += col1 * h1Fill * (0.5 + scale1 * 0.5) * (0.8 + u_bass * 0.4);
  color += col1 * h1Glow * 1.2;
  color += col2 * h2Fill * (0.5 + scale2 * 0.5) * (0.8 + u_bass * 0.4);
  color += col2 * h2Glow * 1.2;

  // Crossing point highlights
  color += vec3(1.3, 1.2, 1.0) * crossPoints * 1.5 * (0.6 + u_mid * 0.6);

  // Energy flow
  color += (col1 + col2) * 0.3 * upflow * h1Fill * u_treble;

  // Wings
  color += col3 * wingShape * 1.0 * (0.7 + u_treble * 0.5);

  // Top sphere
  color += col3 * sphereFill * 0.6;
  color += vec3(1.3, 1.2, 1.5) * sphereGlow * 1.5;

  // Chakra nodes
  color += col3 * chakras * 1.5 * (0.6 + u_amplitude * 0.5);

  // FBM aura
  color += col3 * auraMask * abs(n) * 0.15;

  // Vignette
  color *= smoothstep(1.5, 0.5, length(uv));

  gl_FragColor = vec4(color, 1.0);
}
`;
