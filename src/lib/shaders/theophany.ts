import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

// Divine manifestation: brilliant light breaking through dark clouds in God-rays,
// a moment of revelation where the heavens part.
export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  `
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.08;
  float paletteShift = u_amplitude * 0.3;

  float r = length(uv);
  float a = atan(uv.y, uv.x);
  vec3 color = vec3(0.0);

  // Source of theophany — above and slightly off-center
  vec2 source = vec2(0.05 * sin(t * 0.3), 0.35 + 0.05 * sin(t * 0.5));
  float distFromSource = length(uv - source);
  float sourceAngle = atan(uv.y - source.y, uv.x - source.x);

  // Dark cloud layer — FBM with gaps where light breaks through
  float cloud = 0.0;
  float cAmp = 0.5;
  vec2 cp = uv * 3.0 + vec2(t * 0.08, -t * 0.05);
  mat2 m = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 3; i++) {
    cloud += cAmp * snoise(cp);
    cp = m * cp * 2.0;
    cAmp *= 0.5;
  }

  // Cloud mass — darker where thick, gaps where thin
  float cloudMass = smoothstep(-0.1, 0.4, cloud);
  float cloudGap = 1.0 - cloudMass; // openings in the clouds

  // God-rays — radial from the source, modulated by cloud gaps
  float rayIntensity = 0.0;
  for (int ray = 0; ray < 12; ray++) {
    float fr = float(ray);
    float rayA = -3.14159 + fr * 0.524 + sin(t * 0.2 + fr * 0.7) * 0.08;
    float angleDiff = abs(sourceAngle - rayA);
    angleDiff = min(angleDiff, 6.28318 - angleDiff);

    float rayWidth = 0.06 + 0.03 * sin(t * 0.5 + fr);
    float shaft = exp(-angleDiff * angleDiff / (rayWidth * rayWidth));

    // Ray attenuated by distance and cloud gaps
    float rayCloud = snoise(vec2(rayA * 3.0, distFromSource * 4.0 + t * 0.3));
    float rayGap = smoothstep(-0.1, 0.3, rayCloud);

    shaft *= exp(-distFromSource * 1.5) * rayGap;
    rayIntensity += shaft;
  }

  // Source breakthrough glow — the opening in heaven
  float breakthrough = exp(-distFromSource * distFromSource * 8.0) * (1.2 + u_bass * 0.8);
  float breakthroughRing = smoothstep(0.01, 0.0, abs(distFromSource - 0.15 - 0.02 * sin(t * 2.0)));

  // Scattered light in clouds — subsurface scattering effect
  float scatter = cloudMass * exp(-distFromSource * 2.0) * 0.3;

  // Cloud edges lit by the divine light
  float cloudEdgeLight = smoothstep(0.2, 0.4, cloud) - smoothstep(0.4, 0.6, cloud);
  cloudEdgeLight *= exp(-distFromSource * 1.5) * 0.6;

  // Palette
  vec3 rayCol = palette(
    sourceAngle * 0.08 + distFromSource * 0.3 + paletteShift,
    vec3(0.8, 0.7, 0.5),
    vec3(0.25, 0.25, 0.2),
    vec3(1.0, 0.9, 0.65),
    vec3(0.0, 0.08, 0.15)
  );

  vec3 sourceCol = palette(
    t * 0.08 + paletteShift,
    vec3(0.95, 0.9, 0.75),
    vec3(0.1, 0.1, 0.08),
    vec3(1.0, 0.95, 0.85),
    vec3(0.0, 0.03, 0.05)
  );

  vec3 cloudCol = palette(
    cloud * 0.3 + paletteShift + 0.6,
    vec3(0.15, 0.12, 0.2),
    vec3(0.15, 0.12, 0.15),
    vec3(0.5, 0.4, 0.7),
    vec3(0.3, 0.2, 0.4)
  );

  // Compose
  color += cloudCol * cloudMass * 0.15; // dark cloud base
  color += rayCol * rayIntensity * (0.6 + 0.4 * u_mid);
  color += sourceCol * breakthrough;
  color += sourceCol * breakthroughRing * 0.6;
  color += rayCol * scatter * u_mid;
  color += rayCol * cloudEdgeLight * (0.5 + 0.5 * u_treble);

  // Atmospheric haze
  float haze = exp(-distFromSource * 1.0) * 0.08 * (0.7 + 0.3 * u_bass);
  color += sourceCol * haze;

  // Treble-driven light motes
  float motes = snoise(uv * 15.0 + t * 1.5);
  motes = pow(max(motes, 0.0), 6.0) * u_treble * 0.25;
  motes *= cloudGap;
  color += vec3(1.0, 0.95, 0.85) * motes;

  // Vignette
  color *= smoothstep(1.5, 0.4, r);

  gl_FragColor = vec4(color, 1.0);
}
`;
