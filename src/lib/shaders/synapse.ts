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
  float t = u_time * 0.1;
  float paletteShift = u_amplitude * 0.3;

  vec3 color = vec3(0.0);

  // ── Background: neural tissue ──
  float bgN = fbm(uv * 2.0 + vec2(t * 0.05, -t * 0.03));
  vec3 bgColor = palette(
    bgN * 0.3 + paletteShift + 0.4,
    vec3(0.015, 0.02, 0.035),
    vec3(0.025, 0.03, 0.05),
    vec3(0.4, 0.45, 0.7),
    vec3(0.0, 0.12, 0.35)
  );
  color = bgColor * (bgN * 0.1 + 0.04);

  // ── Two neural surfaces — pre-synaptic (top) and post-synaptic (bottom) ──
  float gapWidth = 0.08 + sin(t * 0.4) * 0.01 + u_bass * 0.02;

  // Undulating membrane surfaces
  float preWave = snoise(vec2(uv.x * 5.0, t * 0.5)) * 0.03;
  float postWave = snoise(vec2(uv.x * 5.0 + 3.0, t * 0.5 + 2.0)) * 0.03;

  float preSurface = uv.y - gapWidth * 0.5 - preWave;
  float postSurface = -uv.y - gapWidth * 0.5 - postWave;

  // Membrane edges
  float preEdge = smoothstep(0.02, 0.0, abs(preSurface));
  float preGlow = smoothstep(0.08, 0.0, abs(preSurface));
  float preBody = smoothstep(0.0, -0.02, preSurface);

  float postEdge = smoothstep(0.02, 0.0, abs(postSurface));
  float postGlow = smoothstep(0.08, 0.0, abs(postSurface));
  float postBody = smoothstep(0.0, -0.02, postSurface);

  // Synaptic cleft — the gap between
  float inGap = (1.0 - preBody) * (1.0 - postBody);

  // Membrane colors
  vec3 preColor = palette(
    uv.x * 0.3 + t * 0.03 + paletteShift,
    vec3(0.35, 0.3, 0.45),
    vec3(0.3, 0.25, 0.4),
    vec3(0.7, 0.6, 0.9),
    vec3(0.0, 0.15, 0.35)
  );

  vec3 postColor = palette(
    uv.x * 0.3 + t * 0.03 + paletteShift + 0.5,
    vec3(0.3, 0.4, 0.35),
    vec3(0.25, 0.35, 0.3),
    vec3(0.6, 0.9, 0.7),
    vec3(0.0, 0.2, 0.3)
  );

  color += preColor * (preEdge * 1.0 + preGlow * 0.2);
  color += postColor * (postEdge * 1.0 + postGlow * 0.2);

  // ── Pre-synaptic interior: vesicle clusters ──
  float vesAccum = 0.0;
  for (int i = 0; i < 15; i++) {
    float fi = float(i);
    float seed = hash1(fi * 7.3);
    float seed2 = hash1(fi * 11.1 + 2.0);

    // Vesicles cluster near the membrane edge
    vec2 vesPos = vec2(
      (seed - 0.5) * 0.6,
      gapWidth * 0.5 + 0.05 + seed2 * 0.15 + preWave
    );
    vesPos += vec2(sin(t * 0.5 + fi), cos(t * 0.4 + fi * 1.3)) * 0.01;

    float vesDist = length(uv - vesPos) - 0.015;
    float vesGlow = smoothstep(0.01, 0.0, vesDist) * preBody;

    vesAccum += vesGlow;
  }

  vec3 vesColor = palette(
    vesAccum * 0.3 + t * 0.05 + paletteShift + 0.25,
    vec3(0.5, 0.4, 0.55),
    vec3(0.4, 0.35, 0.5),
    vec3(0.9, 0.7, 1.0),
    vec3(0.0, 0.1, 0.3)
  );
  color += vesColor * vesAccum * 0.6;

  // ── Neurotransmitter particles crossing the gap ──
  float ntAccum = 0.0;
  float ntTrailAccum = 0.0;

  // Release bursts triggered by audio
  float burstPhase = fract(t * 0.3);
  float burstIntensity = smoothstep(0.0, 0.1, burstPhase) * smoothstep(0.6, 0.3, burstPhase);
  burstIntensity = max(burstIntensity, u_bass * 0.5);

  for (int i = 0; i < 30; i++) {
    float fi = float(i);
    float seed = hash1(fi * 9.17);
    float seed2 = hash1(fi * 5.31 + 4.0);

    // Particle trajectory: top membrane to bottom
    float particleTime = fract(t * (0.4 + seed * 0.3) + seed * 10.0);

    // Y: crosses from pre to post
    float yStart = gapWidth * 0.5 + preWave;
    float yEnd = -gapWidth * 0.5 + postWave;
    float yPos = mix(yStart, yEnd, particleTime);

    // X: slight lateral drift with brownian motion feel
    float xBase = (seed - 0.5) * 0.5;
    float xDrift = sin(particleTime * 6.28 + fi * 1.7) * 0.03;
    float xPos = xBase + xDrift;

    vec2 ntPos = vec2(xPos, yPos);
    float ntDist = length(uv - ntPos);
    float ntGlow = exp(-ntDist * ntDist / 0.0004);

    // Fade based on whether particle is in the gap
    float gapFade = smoothstep(gapWidth * 0.5 + 0.02, gapWidth * 0.5 - 0.01, abs(yPos));
    ntGlow *= gapFade * burstIntensity;

    ntAccum += ntGlow;

    // Trail behind particle
    float trailY = yPos + 0.02;
    vec2 trailPos = vec2(xPos, trailY);
    float trailDist = length(uv - trailPos);
    float trail = exp(-trailDist * trailDist / 0.001) * gapFade * burstIntensity * 0.3;
    ntTrailAccum += trail;
  }

  vec3 ntColor = palette(
    t * 0.08 + paletteShift + 0.6,
    vec3(0.5, 0.55, 0.4),
    vec3(0.45, 0.5, 0.35),
    vec3(1.0, 1.0, 0.6),
    vec3(0.0, 0.15, 0.25)
  );
  color += ntColor * ntAccum * 1.2;
  color += ntColor * ntTrailAccum * 0.5;

  // ── Post-synaptic receptors — bright spots on lower membrane ──
  for (int r = 0; r < 8; r++) {
    float rf = float(r);
    float rxPos = (rf / 7.0 - 0.5) * 0.5;
    vec2 recPos = vec2(rxPos, -gapWidth * 0.5 + postWave);

    float recDist = length(uv - recPos);
    float recGlow = exp(-recDist * recDist / 0.0006);

    // Receptor activates when neurotransmitters arrive
    float activation = burstIntensity * smoothstep(0.3, 0.5, fract(t * 0.3));
    recGlow *= (0.3 + activation * 0.7);

    color += postColor * recGlow * (0.5 + u_mid * 0.5);
  }

  // ── Electrical potential wave across post-synaptic surface ──
  float epspWave = sin(uv.x * 20.0 - t * 6.0) * 0.5 + 0.5;
  epspWave = pow(epspWave, 4.0) * postBody * burstIntensity;
  color += postColor * epspWave * u_mid * 0.3;

  // ── Treble: ion channel sparkle ──
  float ions = snoise(uv * 30.0 + t * 3.0);
  ions = smoothstep(0.8, 1.0, ions) * u_treble;
  float nearMembrane = max(preGlow, postGlow);
  color += vec3(0.7, 0.8, 1.0) * ions * nearMembrane * 0.4;

  // ── Vignette ──
  float vignette = 1.0 - smoothstep(0.5, 1.4, length(uv));
  color *= vignette;

  gl_FragColor = vec4(color, 1.0);
}
`;
