import { U, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG =
  U +
  VISIONARY_PALETTE +
  ROT2 +
  `
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.1;
  float paletteShift = u_amplitude * 0.3;

  // Slow rotation of entire pattern
  vec2 uvR = rot2(t * 0.08 + u_mid * 0.05) * uv;

  // Infinite depth zoom: scale cycles so it looks like we're falling in
  // A looping zoom is achieved by cycling the log of scale
  float goldenAngle = 2.39996323; // radians: 2*pi*(1 - 1/phi)
  float logZoomCycle = mod(t * 0.3, log(1.61803)); // one phi zoom period
  float zoomScale    = exp(logZoomCycle);            // 1..phi, then repeats

  vec2 uvZ = uvR * zoomScale; // apply zoom

  vec3 color = vec3(0.0);
  float minDotDist = 999.0;

  // Draw phyllotaxis points: n-th point at (sqrt(n)*C, n*goldenAngle)
  // We draw many dots; they naturally recede in visual density toward center
  // 200 points
  float spacing = 0.095 + u_bass * 0.01; // base scale of pattern

  for (int i = 1; i <= 200; i++) {
    float fi = float(i);

    // Polar coordinates in phyllotaxis
    float dotR     = sqrt(fi) * spacing;
    float dotTheta = fi * goldenAngle - t * 0.2; // slow spin

    vec2 dotPos = vec2(dotR * cos(dotTheta), dotR * sin(dotTheta));

    // Compare to zoomed UV space
    float d = length(uvZ - dotPos);
    minDotDist = min(minDotDist, d);

    // Dot size scales with radius (perspective-like: inner dots are smaller)
    float dotSize = spacing * 0.18 + dotR * 0.04 + u_treble * 0.01;

    float dotGlow = smoothstep(dotSize * 3.0, 0.0, d);
    float dotCore = smoothstep(dotSize, 0.0, d);

    if (dotGlow < 0.001) continue; // skip if not visible

    // Color changes with index and time — two palette lookups
    float colorT = fi * 0.018 + t * 0.4 + paletteShift;
    vec3 dotCol1 = palette(
      colorT,
      vec3(0.5, 0.5, 0.5),
      vec3(0.5, 0.4, 0.6),
      vec3(0.8, 1.0, 0.4),
      vec3(0.0, 0.15, 0.4)
    );
    vec3 dotCol2 = palette(
      colorT + 0.5,
      vec3(0.5, 0.4, 0.3),
      vec3(0.5, 0.4, 0.2),
      vec3(1.0, 0.7, 0.3),
      vec3(0.05, 0.1, 0.0)
    );

    // Inner dots (smaller r) are more saturated — depth emphasis
    float depthMix = clamp(1.0 - dotR / (200.0 * spacing * 0.5), 0.0, 1.0);
    vec3 dotCol = mix(dotCol2, dotCol1, depthMix);

    color += dotCol * dotGlow * 0.5;
    color += dotCol * dotCore * 1.3;

    // Treble: bright center core flash
    color += vec3(1.2, 1.15, 1.0) * dotCore * u_treble * 0.8;
  }

  // Spiral arm ghost lines: trace the 13 and 21 Fibonacci spirals
  // For each pixel, find the nearest Fibonacci arm
  float r     = length(uvZ);
  float theta = atan(uvZ.y, uvZ.x);

  // 13 arms
  float armPhase13 = fract((theta / goldenAngle - log(r / spacing) / goldenAngle * 13.0) / 13.0);
  float arm13Dist  = abs(armPhase13 - floor(armPhase13 + 0.5));
  float arm13Glow  = smoothstep(0.06, 0.0, arm13Dist) * smoothstep(1.4, 0.1, r);

  // 21 arms
  float armPhase21 = fract((theta / goldenAngle - log(r / spacing) / goldenAngle * 21.0) / 21.0);
  float arm21Dist  = abs(armPhase21 - floor(armPhase21 + 0.5));
  float arm21Glow  = smoothstep(0.045, 0.0, arm21Dist) * smoothstep(1.4, 0.1, r);

  vec3 armCol = palette(
    theta / 6.28318 + t * 0.2 + paletteShift + 0.3,
    vec3(0.3, 0.3, 0.35),
    vec3(0.2, 0.2, 0.3),
    vec3(0.6, 0.8, 1.0),
    vec3(0.1, 0.1, 0.3)
  );
  color += armCol * arm13Glow * 0.2;
  color += armCol * arm21Glow * 0.15;

  // Center convergence singularity
  float center = smoothstep(0.12, 0.0, length(uvZ));
  vec3 centerCol = palette(
    t * 0.4 + paletteShift,
    vec3(0.6, 0.55, 0.4),
    vec3(0.5, 0.4, 0.3),
    vec3(1.0, 0.8, 0.3),
    vec3(0.0, 0.05, 0.1)
  );
  color += centerCol * center * 0.6;

  // Background
  float bgDist = length(uv);
  vec3 bgCol = palette(
    bgDist * 0.2 + t * 0.05 + paletteShift + 0.7,
    vec3(0.03, 0.03, 0.05),
    vec3(0.03, 0.03, 0.07),
    vec3(0.4, 0.5, 1.0),
    vec3(0.2, 0.1, 0.3)
  );
  color += bgCol * smoothstep(1.4, 0.0, bgDist) * 0.04;

  // Vignette
  float vign = 1.0 - smoothstep(0.5, 1.5, bgDist);
  color *= vign;

  gl_FragColor = vec4(color, 1.0);
}
`;
