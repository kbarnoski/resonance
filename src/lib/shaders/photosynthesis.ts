import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  `
float hash1(float n) {
  return fract(sin(n) * 43758.5453);
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.08;
  float paletteShift = u_amplitude * 0.3;

  vec3 color = vec3(0.0);

  // ── Background: dark chloroplast interior ──
  float bgN = fbm(uv * 2.0 + vec2(t * 0.04, -t * 0.03));
  vec3 bgColor = palette(
    bgN * 0.3 + paletteShift + 0.1,
    vec3(0.01, 0.025, 0.01),
    vec3(0.015, 0.03, 0.015),
    vec3(0.3, 0.5, 0.3),
    vec3(0.0, 0.15, 0.1)
  );
  color = bgColor * (bgN * 0.12 + 0.04);

  // ── Thylakoid membrane stacks — layered disc structures ──
  // Horizontal stacked discs (grana)
  float granaAccum = 0.0;
  float stromaLamella = 0.0;

  for (int g = 0; g < 5; g++) {
    float gf = float(g);
    float seed = hash1(gf * 7.3);

    // Grana position
    vec2 granaPos = vec2(
      (gf - 2.0) * 0.22 + sin(t * 0.3 + gf * 1.7) * 0.03,
      sin(t * 0.2 + gf * 2.3) * 0.05
    );

    // Stack of discs
    for (int disc = 0; disc < 6; disc++) {
      float df = float(disc);
      float yOff = (df - 2.5) * 0.025;
      vec2 discCenter = granaPos + vec2(0.0, yOff);

      // Disc shape — horizontal ellipse
      vec2 discUV = uv - discCenter;
      float discDist = length(discUV * vec2(1.0, 5.0)) - 0.05;
      float discEdge = smoothstep(0.005, 0.0, abs(discDist));
      float discGlow = smoothstep(0.02, 0.0, abs(discDist));
      float discFill = smoothstep(0.003, -0.003, discDist);

      granaAccum += discEdge * 0.3 + discGlow * 0.1 + discFill * 0.05;
    }

    // Stroma lamellae — connections between grana stacks
    if (g < 4) {
      vec2 nextPos = vec2(
        (gf + 1.0 - 2.0) * 0.22 + sin(t * 0.3 + (gf + 1.0) * 1.7) * 0.03,
        sin(t * 0.2 + (gf + 1.0) * 2.3) * 0.05
      );
      vec2 pa = uv - granaPos;
      vec2 ba = nextPos - granaPos;
      float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
      float lamDist = length(pa - ba * h);
      float lamGlow = smoothstep(0.01, 0.0, lamDist);
      stromaLamella += lamGlow;
    }
  }

  // Thylakoid colors — rich greens
  vec3 thylColor = palette(
    granaAccum * 0.3 + t * 0.03 + paletteShift,
    vec3(0.15, 0.4, 0.2),
    vec3(0.12, 0.35, 0.15),
    vec3(0.4, 0.9, 0.5),
    vec3(0.0, 0.2, 0.12)
  );
  color += thylColor * granaAccum;

  vec3 lamColor = palette(
    stromaLamella * 0.4 + paletteShift + 0.3,
    vec3(0.12, 0.3, 0.18),
    vec3(0.1, 0.25, 0.15),
    vec3(0.35, 0.7, 0.45),
    vec3(0.0, 0.18, 0.15)
  );
  color += lamColor * stromaLamella * 0.3;

  // ── Incoming photons — light particles raining down ──
  for (int p = 0; p < 20; p++) {
    float pf = float(p);
    float seed = hash1(pf * 9.17);
    float seed2 = hash1(pf * 5.31 + 4.0);

    // Photons travel downward, scatter slightly
    float photonTime = fract(t * 0.5 + seed * 10.0);
    float yPos = mix(0.7, -0.5, photonTime);
    float xPos = (seed - 0.5) * 1.0 + sin(photonTime * 3.0 + pf) * 0.05;

    vec2 photonPos = vec2(xPos, yPos);
    float photonDist = length(uv - photonPos);

    // Photon glow — warm golden light
    float photonGlow = exp(-photonDist * photonDist / 0.0006);

    // Trail — light streak
    float trailDist = abs(uv.x - xPos);
    float trailAlong = uv.y - yPos;
    float trail = smoothstep(0.008, 0.0, trailDist) *
                  smoothstep(0.0, -0.06, trailAlong) *
                  smoothstep(-0.12, -0.06, trailAlong);

    // Photon color — spectrum of visible light
    float wavelength = seed; // 0=red, 0.5=green, 1=blue
    vec3 photonColor = palette(
      wavelength * 0.8 + 0.1,
      vec3(0.5, 0.5, 0.3),
      vec3(0.5, 0.5, 0.3),
      vec3(1.0, 1.0, 0.5),
      vec3(0.0, 0.33, 0.67)
    );

    float brightness = 0.5 + u_treble * 0.5;
    color += photonColor * (photonGlow * 0.6 + trail * 0.2) * brightness;

    // ── Absorption flash — photon hitting thylakoid ──
    float hitY = -0.05 + sin(pf * 1.3) * 0.1;
    float absorbed = smoothstep(0.05, 0.0, abs(yPos - hitY)) * (1.0 - photonTime);
    if (absorbed > 0.01) {
      float flashDist = length(uv - vec2(xPos, hitY));
      float flash = exp(-flashDist * flashDist / 0.003) * absorbed;
      color += vec3(0.6, 0.9, 0.4) * flash * 0.5;
    }
  }

  // ── Electron transport chain — energy flowing along thylakoid ──
  float etcPulse = sin(uv.x * 25.0 - t * 5.0 + uv.y * 10.0) * 0.5 + 0.5;
  etcPulse = pow(etcPulse, 6.0) * granaAccum;
  vec3 etcColor = palette(
    t * 0.08 + paletteShift + 0.5,
    vec3(0.3, 0.5, 0.2),
    vec3(0.25, 0.45, 0.18),
    vec3(0.6, 1.0, 0.4),
    vec3(0.0, 0.2, 0.1)
  );
  color += etcColor * etcPulse * (0.3 + u_bass * 0.5);

  // ── ATP/NADPH production — bright energy particles leaving grana ──
  for (int a = 0; a < 10; a++) {
    float af = float(a);
    float aseed = hash1(af * 11.7 + 30.0);
    float aseed2 = hash1(af * 7.3 + 33.0);

    float atpPhase = fract(t * 0.3 + aseed * 10.0);
    // Particles leave grana and drift into stroma
    float granaIdx = floor(aseed * 5.0);
    vec2 startPos = vec2((granaIdx - 2.0) * 0.22, 0.0);
    vec2 endPos = startPos + vec2(
      sin(af * 2.1) * 0.15,
      cos(af * 1.7) * 0.2
    );

    vec2 atpPos = mix(startPos, endPos, atpPhase);
    float atpDist = length(uv - atpPos);
    float atpGlow = exp(-atpDist * atpDist / 0.0004);
    float atpPulse = 0.5 + 0.5 * sin(t * 3.0 + af * 2.1);

    vec3 atpColor = palette(
      af * 0.12 + paletteShift + 0.7,
      vec3(0.5, 0.55, 0.3),
      vec3(0.45, 0.5, 0.25),
      vec3(0.9, 1.0, 0.5),
      vec3(0.0, 0.15, 0.2)
    );
    color += atpColor * atpGlow * atpPulse * 0.4 * (1.0 + u_mid * 0.5);
  }

  // ── Stroma glow — Calvin cycle ambient ──
  float stromaGlow = smoothstep(0.6, 0.0, length(uv)) * (1.0 - granaAccum * 2.0);
  stromaGlow = max(stromaGlow, 0.0);
  vec3 stromaColor = palette(
    t * 0.04 + paletteShift + 0.15,
    vec3(0.06, 0.1, 0.04),
    vec3(0.05, 0.08, 0.03),
    vec3(0.3, 0.5, 0.25),
    vec3(0.0, 0.15, 0.1)
  );
  color += stromaColor * stromaGlow * 0.15;

  // ── Vignette ──
  float vignette = 1.0 - smoothstep(0.5, 1.4, length(uv));
  color *= vignette;

  gl_FragColor = vec4(color, 1.0);
}
`;
