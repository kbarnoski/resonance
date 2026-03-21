import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  `
// Accretion — black hole accretion disk. Matter spiraling inward,
// relativistic beaming, event horizon as absolute black center,
// gravitational lensing distortion.

// Event horizon — absolute black circle
float eventHorizon(vec2 uv, float schwarzschild) {
  float r = length(uv);
  // Hard cutoff at Schwarzschild radius — nothing escapes
  return smoothstep(schwarzschild + 0.005, schwarzschild - 0.005, r);
}

// Gravitational lensing — warp UV coordinates near the hole
vec2 lensWarp(vec2 uv, float mass) {
  float r = length(uv);
  if (r < 0.01) return uv;
  // Light bends proportional to mass/r
  float deflection = mass / (r * r + 0.1);
  // Radial distortion — things behind get pulled around
  vec2 dir = normalize(uv);
  float warpedR = r + deflection * 0.1;
  // Also tangential stretching — Einstein ring effect
  float angle = atan(uv.y, uv.x);
  angle += deflection * 0.05;
  return vec2(cos(angle), sin(angle)) * warpedR;
}

// Main accretion disk — thin disk viewed nearly edge-on
float accretionRing(vec2 uv, float t, float bass) {
  // Tilt to near edge-on view
  vec2 diskUV = vec2(uv.x, uv.y * 3.5);
  float r = length(diskUV);
  float angle = atan(diskUV.y, diskUV.x);

  float innerR = 0.12; // innermost stable circular orbit (ISCO)
  float outerR = 0.7 + bass * 0.1;

  float diskMask = smoothstep(innerR - 0.02, innerR + 0.03, r) *
                   smoothstep(outerR + 0.04, outerR - 0.04, r);

  // Orbital velocity increases inward — Keplerian
  float orbitalSpeed = 1.0 / (sqrt(r) + 0.1);
  float rotAngle = angle + t * orbitalSpeed * (0.5 + bass * 0.3);

  // Spiral density waves — matter concentrations
  float spiral = sin(rotAngle * 4.0 - log(r * 8.0 + 1.0) * 5.0) * 0.5 + 0.5;
  spiral = pow(spiral, 2.0);

  // Turbulent structure
  float turb = fbm(vec2(rotAngle * 1.5, r * 5.0) + t * 0.05) * 0.5 + 0.5;

  // Inner disk much brighter — gravitational energy release
  float radBrightness = 1.0 / (r * r * 3.0 + 0.1);

  return diskMask * (0.3 + spiral * 0.5 + turb * 0.3) * radBrightness;
}

// Relativistic beaming — approaching side brighter than receding
float relativisticBeaming(vec2 uv, float t, float bass) {
  float angle = atan(uv.y, uv.x);
  // Disk rotates — one side approaches, one recedes
  float rotPhase = t * 0.3 + bass * 0.2;
  float beamAngle = angle - rotPhase;

  // Approaching side is Doppler boosted
  float beaming = 0.5 + 0.5 * cos(beamAngle);
  // Relativistic boosting is stronger than linear
  return pow(beaming, 2.0);
}

// Photon ring — light orbiting the black hole
float photonRing(vec2 uv, float t) {
  float r = length(uv);
  // Photon sphere at 1.5 Schwarzschild radii
  float photonR = 0.09;
  float ringWidth = 0.008;
  float ring = smoothstep(ringWidth, 0.0, abs(r - photonR));

  // Ring shimmers — photons arriving from all angles
  float angle = atan(uv.y, uv.x);
  float shimmer = sin(angle * 20.0 + t * 5.0) * 0.5 + 0.5;
  ring *= (0.6 + shimmer * 0.4);

  return ring * 1.5;
}

// Lensed image of back side of disk (appears above and below)
float lensedDisk(vec2 uv, float t, float bass) {
  // The back side of the disk appears as an arc above and below the hole
  float r = length(uv);
  float horizonR = 0.06;

  // Secondary image appears just outside the event horizon
  float lensedR = horizonR + 0.04;
  float arcWidth = 0.02 + bass * 0.008;
  float arc = smoothstep(arcWidth, 0.0, abs(r - lensedR));

  // Only on the side facing away from the primary disk
  float angle = atan(uv.y, uv.x);
  float faceMask = abs(sin(angle)); // vertical sides
  arc *= faceMask;

  // Brightness from lensed light
  float brightness = 0.8 / (abs(r - horizonR) * 10.0 + 0.5);

  // Rotation
  float lensedSpiral = sin(angle * 3.0 + t * 0.8) * 0.5 + 0.5;

  return arc * brightness * (0.5 + lensedSpiral * 0.5);
}

// Infalling matter streams
float infallingStreams(vec2 uv, float t, float mid) {
  float total = 0.0;
  for (int i = 0; i < 5; i++) {
    float fi = float(i);
    float streamAngle = fi * 1.256 + t * 0.05;
    float progress = fract(t * 0.06 + fi * 0.2);

    // Spiraling inward — accelerating
    float streamR = mix(0.8, 0.07, progress * progress * progress);
    float currentAngle = streamAngle + progress * 8.0;

    vec2 streamPos = vec2(cos(currentAngle), sin(currentAngle) * 0.3) * streamR;
    float dist = length(uv - streamPos);

    float width = 0.006 + (1.0 - progress) * 0.015;
    float brightness = progress * 2.0; // brighter as it falls in
    total += smoothstep(width, 0.0, dist) * brightness * (0.3 + mid * 0.5);
  }
  return total;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);

  float t = u_time * 0.15;
  float paletteShift = u_amplitude * 0.3;

  float schwarzschild = 0.06;
  float r = length(uv);

  // ── Gravitational lensing — warp all UV near the hole ──
  vec2 lensedUV = lensWarp(uv, 0.15 + u_bass * 0.05);

  // ── Event horizon — absolute black ──
  float horizon = eventHorizon(uv, schwarzschild);

  // ── Primary accretion disk ──
  float disk = accretionRing(lensedUV, t, u_bass);

  // ── Relativistic beaming ──
  float beaming = relativisticBeaming(lensedUV, t, u_bass);

  // ── Photon ring ──
  float photon = photonRing(uv, t) * (0.5 + u_treble * 1.0);

  // ── Lensed secondary disk image ──
  float lensed = lensedDisk(uv, t, u_bass);

  // ── Infalling streams ──
  float streams = infallingStreams(lensedUV, t, u_mid);

  // ── Background star field — distorted by lensing ──
  vec2 starUV = lensedUV;
  vec2 starId = floor(starUV * 50.0);
  vec2 starF = fract(starUV * 50.0) - 0.5;
  float starH = fract(sin(dot(starId, vec2(127.1, 311.7))) * 43758.5453);
  float stars = 0.0;
  if (starH > 0.97) {
    stars = smoothstep(0.03, 0.0, length(starF)) * 0.5;
  }

  // ── Colors ──
  // Disk — extreme temperature gradient: blue-white inner to orange-red outer
  float diskR = length(vec2(lensedUV.x, lensedUV.y * 3.5));
  vec3 diskInnerCol = palette(
    disk * 0.3 + t * 0.03 + paletteShift,
    vec3(0.7, 0.7, 0.8),
    vec3(0.3, 0.3, 0.2),
    vec3(0.3, 0.3, 0.5),
    vec3(0.0, 0.05, 0.1)
  );

  vec3 diskOuterCol = palette(
    disk * 0.3 + t * 0.03 + paletteShift + 0.35,
    vec3(0.5, 0.35, 0.2),
    vec3(0.4, 0.25, 0.15),
    vec3(0.4, 0.2, 0.1),
    vec3(0.08, 0.02, 0.0)
  );

  vec3 diskCol = mix(diskInnerCol, diskOuterCol, smoothstep(0.1, 0.5, diskR));
  // Beaming brightens the approaching side
  diskCol *= (0.5 + beaming * 0.8);

  // Photon ring — brilliant blue-white
  vec3 photonCol = palette(
    photon + t * 0.08 + paletteShift + 0.6,
    vec3(0.8, 0.85, 0.95),
    vec3(0.2, 0.15, 0.1),
    vec3(0.2, 0.4, 0.7),
    vec3(0.0, 0.1, 0.2)
  );

  // Lensed image — same as disk but slightly dimmer
  vec3 lensedCol = palette(
    lensed + t * 0.04 + paletteShift + 0.2,
    vec3(0.5, 0.45, 0.4),
    vec3(0.4, 0.3, 0.2),
    vec3(0.3, 0.2, 0.1),
    vec3(0.05, 0.02, 0.0)
  );

  // Stream color
  vec3 streamCol = palette(
    streams + t * 0.05 + paletteShift + 0.3,
    vec3(0.6, 0.5, 0.35),
    vec3(0.4, 0.3, 0.2),
    vec3(0.3, 0.2, 0.1),
    vec3(0.05, 0.02, 0.0)
  );

  // Background
  vec3 color = vec3(0.003, 0.002, 0.005);

  // Stars (lensed)
  color += vec3(0.8, 0.85, 0.95) * stars * (1.0 - horizon);

  // Infalling streams
  color += streamCol * streams;

  // Main disk
  color += diskCol * disk * (0.8 + u_mid * 0.5);

  // Lensed image
  color += lensedCol * lensed * (0.6 + u_mid * 0.4);

  // Photon ring
  color += photonCol * photon;

  // Inner glow — extreme radiation just outside horizon
  float innerGlow = exp(-(r - schwarzschild) * 20.0) * step(schwarzschild, r);
  vec3 innerGlowCol = palette(
    t * 0.1 + paletteShift,
    vec3(0.9, 0.8, 0.6),
    vec3(0.1, 0.1, 0.2),
    vec3(0.3, 0.2, 0.1),
    vec3(0.0, 0.02, 0.05)
  );
  color += innerGlowCol * innerGlow * 0.8 * (0.7 + u_amplitude * 0.8);

  // Event horizon — pure black absorbs everything
  color *= (1.0 - horizon);

  // Vignette
  float vignette = 1.0 - smoothstep(0.5, 1.4, r);
  color *= vignette;

  // Tonemap
  color = color / (color + 0.5);
  color = pow(color, vec3(0.88));

  gl_FragColor = vec4(color, 1.0);
}
`;
