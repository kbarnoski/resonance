import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  `
// Protostar — star birth. Swirling accretion disk with infalling matter,
// central brightening, jets shooting from poles, disk rotates with bass.

// Accretion disk — viewed at an angle with perspective tilt
float accretionDisk(vec2 uv, float t, float bass) {
  // Tilt the disk — squash y to simulate 3/4 view
  vec2 diskUV = vec2(uv.x, uv.y * 2.8);
  float r = length(diskUV);
  float angle = atan(diskUV.y, diskUV.x);

  // Disk exists between inner and outer radius
  float innerR = 0.08;
  float outerR = 0.65 + bass * 0.08;
  float diskMask = smoothstep(innerR - 0.02, innerR + 0.02, r) *
                   smoothstep(outerR + 0.05, outerR - 0.05, r);

  // Spiral arms in the disk — logarithmic spiral
  float rotSpeed = t * (0.8 + bass * 0.6);
  float spiralAngle = angle - log(r * 10.0 + 1.0) * 2.0 + rotSpeed;
  float spiral = sin(spiralAngle * 3.0) * 0.5 + 0.5;
  spiral = pow(spiral, 1.5);

  // Density variations — fbm turbulence
  float density = fbm(vec2(angle * 2.0 + rotSpeed * 0.3, r * 4.0 - t * 0.1)) * 0.5 + 0.5;

  // Inner disk brighter (hotter, more compressed)
  float radialBrightness = 1.0 / (r * 3.0 + 0.3);

  return diskMask * (0.3 + spiral * 0.5 + density * 0.3) * radialBrightness;
}

// Infalling matter streaks
float infallingMatter(vec2 uv, float t, float mid) {
  float total = 0.0;

  for (int i = 0; i < 6; i++) {
    float fi = float(i);
    float angle = fi * 1.047 + t * 0.1 + sin(fi * 3.7) * 0.5;
    float startR = 0.8 + fract(sin(fi * 17.3) * 43.7) * 0.4;
    float endR = 0.1;

    // Parametric infall path — spiraling inward
    float progress = fract(t * 0.08 + fi * 0.167);
    float currentR = mix(startR, endR, progress * progress); // accelerating
    float currentAngle = angle + progress * 4.0; // spiraling

    vec2 matterPos = vec2(cos(currentAngle), sin(currentAngle) * 0.35) * currentR;
    float dist = length(uv - matterPos);

    float size = 0.015 + (1.0 - progress) * 0.02;
    float brightness = 0.3 + progress * 0.7; // brighter as it falls in
    total += smoothstep(size, 0.0, dist) * brightness * (0.5 + mid * 0.5);

    // Trail behind the infalling clump
    for (int j = 1; j <= 5; j++) {
      float trailProg = progress - float(j) * 0.015;
      if (trailProg < 0.0) continue;
      float trailR = mix(startR, endR, trailProg * trailProg);
      float trailAngle = angle + trailProg * 4.0;
      vec2 trailPos = vec2(cos(trailAngle), sin(trailAngle) * 0.35) * trailR;
      float trailDist = length(uv - trailPos);
      total += smoothstep(size * 0.6, 0.0, trailDist) * brightness * 0.1;
    }
  }
  return total;
}

// Bipolar jets from protostar poles
float protoJet(vec2 uv, float t, float bass) {
  // Jets shoot along y-axis (perpendicular to disk plane)
  float xWidth = 0.04 + 0.02 * sin(t * 1.5);
  float xDist = abs(uv.x);

  // Upper jet
  float upperJet = smoothstep(xWidth, 0.0, xDist) * smoothstep(0.0, 0.06, uv.y);
  float upperFade = exp(-uv.y * 2.0);
  // Jet broadens with distance
  float upperBroad = smoothstep(xWidth + uv.y * 0.15, 0.0, xDist) * step(0.0, uv.y);
  upperJet = max(upperJet * upperFade, upperBroad * exp(-uv.y * 1.5) * 0.3);

  // Lower jet
  float lowerJet = smoothstep(xWidth, 0.0, xDist) * smoothstep(0.0, 0.06, -uv.y);
  float lowerFade = exp(uv.y * 2.0);
  float lowerBroad = smoothstep(xWidth - uv.y * 0.15, 0.0, xDist) * step(uv.y, 0.0);
  lowerJet = max(lowerJet * lowerFade, lowerBroad * exp(uv.y * 1.5) * 0.3);

  // Jet turbulence
  float noise = snoise(uv * 6.0 + vec2(0.0, t * 0.8)) * 0.5 + 0.5;

  return (upperJet + lowerJet) * (0.5 + noise * 0.5) * (0.8 + bass * 0.8);
}

// Herbig-Haro knots — bright shock regions in jets
float hhKnots(vec2 uv, float t) {
  float total = 0.0;
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    float knotY = 0.2 + fi * 0.15 + fract(t * 0.05 + fi * 0.25) * 0.3;
    float knotX = sin(t * 0.3 + fi * 2.1) * 0.02;

    // Upper knot
    float d1 = length(uv - vec2(knotX, knotY));
    total += exp(-d1 * d1 * 400.0) * 0.5;

    // Lower knot (mirror)
    float d2 = length(uv - vec2(knotX, -knotY));
    total += exp(-d2 * d2 * 400.0) * 0.5;
  }
  return total;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);

  float t = u_time * 0.2;
  float paletteShift = u_amplitude * 0.3;

  float r = length(uv);

  // ── Central protostellar core — growing brighter ──
  float corePulse = 1.0 + u_bass * 0.6 + sin(t * 1.5) * 0.15;
  float coreGlow = 0.003 / (r * r + 0.0005) * corePulse;
  float coreSoft = exp(-r * 8.0) * 2.0 * corePulse;

  // ── Accretion disk ──
  float disk = accretionDisk(uv, t, u_bass);

  // ── Infalling matter ──
  float infall = infallingMatter(uv, t, u_mid);

  // ── Bipolar jets ──
  float jets = protoJet(uv, t, u_bass);

  // ── HH knots in jets ──
  float knots = hhKnots(uv, t) * (0.5 + u_treble * 1.0);

  // ── Surrounding molecular cloud — dark, with backlit edges ──
  float cloud = fbm(uv * 1.5 + t * 0.02) * 0.5 + 0.5;
  float cloudMask = smoothstep(0.5, 0.8, r) * cloud * 0.3;

  // ── Colors ──
  // Core — yellow-white newborn star
  vec3 coreCol = palette(
    t * 0.05 + paletteShift,
    vec3(0.9, 0.85, 0.7),
    vec3(0.1, 0.1, 0.2),
    vec3(0.3, 0.2, 0.1),
    vec3(0.0, 0.02, 0.05)
  );

  // Disk inner — hot white-yellow
  vec3 diskHotCol = palette(
    disk * 0.5 + r * 0.5 + t * 0.03 + paletteShift,
    vec3(0.6, 0.55, 0.4),
    vec3(0.4, 0.35, 0.25),
    vec3(0.4, 0.25, 0.1),
    vec3(0.05, 0.02, 0.0)
  );

  // Disk outer — cooler red-orange
  vec3 diskCoolCol = palette(
    disk * 0.3 + r * 0.8 + t * 0.02 + paletteShift + 0.3,
    vec3(0.5, 0.35, 0.3),
    vec3(0.4, 0.25, 0.2),
    vec3(0.5, 0.2, 0.1),
    vec3(0.1, 0.0, 0.0)
  );

  // Jets — blue-violet shocked gas
  vec3 jetCol = palette(
    jets + r * 0.3 + t * 0.04 + paletteShift + 0.6,
    vec3(0.4, 0.4, 0.6),
    vec3(0.3, 0.3, 0.5),
    vec3(0.3, 0.5, 0.9),
    vec3(0.1, 0.1, 0.4)
  );

  // HH knots — brilliant white-pink
  vec3 knotCol = palette(
    t * 0.1 + paletteShift + 0.8,
    vec3(0.8, 0.7, 0.8),
    vec3(0.2, 0.2, 0.2),
    vec3(0.4, 0.2, 0.5),
    vec3(0.05, 0.0, 0.1)
  );

  // Cloud — dark reddish-brown molecular cloud
  vec3 cloudCol = palette(
    cloud + paletteShift + 0.4,
    vec3(0.1, 0.06, 0.04),
    vec3(0.08, 0.04, 0.03),
    vec3(0.5, 0.2, 0.1),
    vec3(0.1, 0.05, 0.0)
  );

  // Deep space
  vec3 color = vec3(0.005, 0.003, 0.008);

  // Molecular cloud backdrop
  color += cloudCol * cloudMask;

  // Accretion disk — blend hot inner to cool outer
  float diskR = length(vec2(uv.x, uv.y * 2.8));
  vec3 diskColor = mix(diskHotCol, diskCoolCol, smoothstep(0.1, 0.5, diskR));
  color += diskColor * disk * (0.8 + u_mid * 0.5);

  // Infalling matter
  color += diskHotCol * infall;

  // Jets
  color += jetCol * jets;

  // HH knots
  color += knotCol * knots * 2.0;

  // Core
  color += coreCol * (coreGlow + coreSoft);
  color += vec3(1.5, 1.3, 1.0) * exp(-r * 30.0) * corePulse;

  // Treble — spicule-like fine structure at disk edges
  float fineStruct = snoise(vec2(atan(uv.y, uv.x) * 10.0, r * 15.0) + t * 0.3) * 0.5 + 0.5;
  float edgeMask = smoothstep(0.55, 0.65, length(vec2(uv.x, uv.y * 2.8)));
  color += diskCoolCol * fineStruct * edgeMask * u_treble * 0.3;

  // Vignette
  float vignette = 1.0 - smoothstep(0.4, 1.3, r);
  color *= vignette;

  // Tonemap
  color = color / (color + 0.6);
  color = pow(color, vec3(0.9));

  gl_FragColor = vec4(color, 1.0);
}
`;
