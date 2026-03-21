import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2, VORONOI } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  VORONOI +
  `
float hash1(float n) {
  return fract(sin(n) * 43758.5453);
}

// Spiky radial displacement — creates the pollen grain surface texture
float spikeProfile(float angle, float seed, float t) {
  float spikes = 0.0;
  spikes += sin(angle * 8.0 + seed * 6.28) * 0.3;
  spikes += sin(angle * 13.0 + seed * 3.14 + t * 0.5) * 0.2;
  spikes += sin(angle * 21.0 + seed * 1.57) * 0.15;
  spikes += sin(angle * 34.0 + seed * 4.71 + t * 0.3) * 0.1;
  return spikes;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.07;
  float paletteShift = u_amplitude * 0.3;

  vec3 color = vec3(0.0);

  // ── Background: microscope field — soft warm void ──
  float bgN = fbm(uv * 1.8 + vec2(t * 0.08, t * 0.05));
  vec3 bgColor = palette(
    bgN * 0.3 + paletteShift + 0.1,
    vec3(0.04, 0.03, 0.02),
    vec3(0.04, 0.04, 0.03),
    vec3(0.6, 0.5, 0.4),
    vec3(0.0, 0.1, 0.2)
  );
  color = bgColor * (bgN * 0.15 + 0.05);

  // ── Multiple pollen grains drifting through the field ──
  for (int grain = 0; grain < 5; grain++) {
    float fg = float(grain);
    float seed = hash1(fg * 19.7);
    float seed2 = hash1(fg * 31.3 + 7.0);
    float seed3 = hash1(fg * 43.1 + 13.0);

    // Gentle floating motion — Brownian drift
    vec2 grainCenter = vec2(
      sin(t * (0.3 + seed * 0.2) + seed * 6.28) * (0.3 + seed2 * 0.3),
      cos(t * (0.25 + seed2 * 0.15) + seed2 * 6.28) * (0.25 + seed * 0.25)
    );

    // Size varies per grain — depth illusion
    float grainRadius = 0.12 + seed3 * 0.08;
    float depthFade = 0.4 + seed3 * 0.6; // farther grains are dimmer

    // Slow tumbling rotation
    float tumble = t * (0.5 + seed * 0.3) + fg * 2.0;

    vec2 gp = uv - grainCenter;
    float gpLen = length(gp);
    float gpAngle = atan(gp.y, gp.x);

    // ── Spiky surface profile ──
    float spikes = spikeProfile(gpAngle + tumble, seed, t);
    float spikyRadius = grainRadius * (1.0 + spikes * 0.12 * (1.0 + u_treble * 0.5));

    // Distance to grain surface
    float grainDist = gpLen - spikyRadius;

    // ── Surface rendering ──
    float grainEdge = smoothstep(0.01, -0.005, grainDist);
    float grainGlow = smoothstep(0.04, 0.0, grainDist);
    float grainInterior = smoothstep(0.005, -0.02, grainDist);

    // Surface color — warm golden-amber
    vec3 surfaceColor = palette(
      gpAngle * 0.3 + spikes + t * 0.05 + paletteShift + fg * 0.15,
      vec3(0.5, 0.4, 0.25),
      vec3(0.4, 0.3, 0.2),
      vec3(1.0, 0.8, 0.5),
      vec3(0.0, 0.1, 0.2)
    );

    // ── Internal structure visible through translucent wall ──
    if (grainInterior > 0.01) {
      // Internal voronoi — organelle-like structure
      vec2 internalUV = (gp / grainRadius) * 4.0 + vec2(seed * 10.0, seed2 * 10.0);
      internalUV = rot2(tumble * 0.3) * internalUV;
      vec3 vInner = voronoi(internalUV);
      float innerRidge = vInner.y - vInner.x;
      float innerEdge = smoothstep(0.2, 0.0, innerRidge);
      float innerCell = vInner.x;

      vec3 innerColor = palette(
        innerCell * 0.5 + t * 0.03 + paletteShift + fg * 0.2 + 0.3,
        vec3(0.4, 0.35, 0.2),
        vec3(0.3, 0.25, 0.15),
        vec3(0.8, 0.7, 0.4),
        vec3(0.05, 0.12, 0.2)
      );

      // Depth-dependent visibility — center of grain shows more internal structure
      float depthVis = smoothstep(spikyRadius, spikyRadius * 0.3, gpLen);

      color += innerColor * innerEdge * depthVis * grainInterior * depthFade * 0.6;
      color += innerColor * smoothstep(0.4, 0.0, innerCell) * depthVis * grainInterior * depthFade * 0.2;
    }

    // ── Surface texture: fine bumps (SEM-like) ──
    float surfaceNoise = fbm((gp / grainRadius) * 8.0 + vec2(seed * 5.0, tumble * 0.2));
    float surfaceBump = surfaceNoise * 0.5 + 0.5;

    // Rim lighting — strong at edges like in microscopy
    float rimLight = smoothstep(spikyRadius * 0.7, spikyRadius, gpLen);
    rimLight = rimLight * grainEdge;

    vec3 rimColor = palette(
      gpAngle * 0.2 + t * 0.04 + paletteShift + 0.5,
      vec3(0.6, 0.55, 0.4),
      vec3(0.4, 0.35, 0.25),
      vec3(0.9, 0.8, 0.6),
      vec3(0.0, 0.08, 0.15)
    );

    // Compose grain
    color += surfaceColor * grainEdge * surfaceBump * depthFade * 0.7;
    color += rimColor * rimLight * depthFade * 1.2;
    color += surfaceColor * grainGlow * depthFade * 0.2;

    // ── Spike highlights — individual spine tips ──
    float spikeTips = pow(max(spikes, 0.0), 3.0);
    float tipHighlight = spikeTips * smoothstep(spikyRadius + 0.01, spikyRadius - 0.02, gpLen);
    color += rimColor * tipHighlight * depthFade * u_mid * 0.8;
  }

  // ── Floating debris / smaller particles in the field ──
  for (int i = 0; i < 15; i++) {
    float fi = float(i);
    float s1 = hash1(fi * 37.1 + 100.0);
    float s2 = hash1(fi * 53.7 + 200.0);

    vec2 debrisPos = vec2(
      sin(t * (0.4 + s1 * 0.3) + s1 * 20.0) * 0.7,
      cos(t * (0.35 + s2 * 0.25) + s2 * 20.0) * 0.5
    );

    float debrisDist = length(uv - debrisPos);
    float debrisGlow = exp(-debrisDist * debrisDist / (0.0005 + s1 * 0.0005));

    vec3 debrisColor = palette(
      s1 + t * 0.05 + paletteShift + 0.6,
      vec3(0.5, 0.45, 0.3),
      vec3(0.3, 0.25, 0.2),
      vec3(0.8, 0.7, 0.5),
      vec3(0.0, 0.1, 0.15)
    );
    color += debrisColor * debrisGlow * (0.2 + u_treble * 0.3);
  }

  // ── Bass response: warm pulse through everything ──
  float bassPulse = u_bass * 0.12;
  vec3 warmPulse = palette(
    t * 0.1 + paletteShift + 0.9,
    vec3(0.5, 0.4, 0.25),
    vec3(0.2, 0.15, 0.1),
    vec3(0.8, 0.6, 0.3),
    vec3(0.0, 0.1, 0.2)
  );
  color += warmPulse * bassPulse;

  // ── Vignette ──
  float vignette = 1.0 - smoothstep(0.5, 1.4, length(uv));
  color *= vignette;

  gl_FragColor = vec4(color, 1.0);
}
`;
