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

// Distance to line segment
float sdSeg(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h);
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.08;
  float paletteShift = u_amplitude * 0.3;

  vec3 color = vec3(0.0);

  // ── Background: dark intracellular space ──
  float bgN = fbm(uv * 2.0 + vec2(t * 0.04, -t * 0.03));
  vec3 bgColor = palette(
    bgN * 0.3 + paletteShift + 0.3,
    vec3(0.02, 0.015, 0.025),
    vec3(0.025, 0.02, 0.03),
    vec3(0.4, 0.35, 0.5),
    vec3(0.0, 0.1, 0.25)
  );
  color = bgColor * (bgN * 0.1 + 0.04);

  // ── Protein filament network — self-assembling actin-like structures ──
  // Multiple filaments growing, branching, and polymerizing
  float filamentAccum = 0.0;
  float junctionAccum = 0.0;
  float monomerAccum = 0.0;

  for (int f = 0; f < 12; f++) {
    float ff = float(f);
    float seed = hash1(ff * 7.13);
    float seed2 = hash1(ff * 13.37 + 3.0);

    // Filament origin — nucleation point
    vec2 origin = vec2(
      (seed - 0.5) * 0.8,
      (seed2 - 0.5) * 0.8
    );

    // Growth direction — changes slowly
    float growAngle = seed * 6.28 + sin(t * 0.3 + ff * 1.7) * 0.6;
    float growLen = 0.25 + seed2 * 0.2;

    // Polymerization progress — grows over time, loops
    float polyPhase = fract(t * 0.15 + ff * 0.11);
    float activeLen = growLen * smoothstep(0.0, 0.6, polyPhase);

    // Trace filament as chain of monomers
    vec2 prev = origin;
    float segCount = 12.0;

    for (int seg = 1; seg <= 12; seg++) {
      float sf = float(seg) / segCount;
      if (sf > polyPhase * 1.5) break;

      // Slight angle variation per monomer — semi-rigid polymer
      float segAngle = growAngle + sin(sf * 8.0 + t * 1.0 + ff * 2.0) * 0.12;
      float segLen = growLen / segCount;

      vec2 dir = vec2(cos(segAngle), sin(segAngle));
      vec2 curr = prev + dir * segLen;

      // Monomer bead at each node
      float monDist = length(uv - curr);
      float monGlow = exp(-monDist * monDist / 0.0006);
      monomerAccum += monGlow * 0.5;

      // Filament segment between monomers
      float segDist = sdSeg(uv, prev, curr);
      float segGlow = smoothstep(0.006, 0.0, segDist);
      filamentAccum += segGlow * 0.4;

      prev = curr;
    }

    // Growing tip — bright polymerization front
    float tipDist = length(uv - prev);
    float tipGlow = exp(-tipDist * tipDist / 0.001);
    float tipPulse = 0.5 + 0.5 * sin(t * 4.0 + ff * 2.3);
    junctionAccum += tipGlow * tipPulse;
  }

  // ── Cross-linking between nearby filaments ──
  // Use noise to create interconnections
  float crossLink = snoise(uv * 10.0 + t * 0.3);
  crossLink = smoothstep(0.5, 0.8, crossLink) * filamentAccum;

  // ── Filament color — structural protein tones: mauve, teal, silver ──
  vec3 filColor = palette(
    filamentAccum * 0.3 + t * 0.03 + paletteShift,
    vec3(0.35, 0.3, 0.4),
    vec3(0.3, 0.25, 0.35),
    vec3(0.7, 0.65, 0.85),
    vec3(0.0, 0.15, 0.3)
  );
  color += filColor * filamentAccum * 0.8;

  // Monomer beads — slightly different hue
  vec3 monColor = palette(
    monomerAccum * 0.2 + t * 0.04 + paletteShift + 0.2,
    vec3(0.4, 0.35, 0.45),
    vec3(0.35, 0.3, 0.4),
    vec3(0.8, 0.7, 0.9),
    vec3(0.0, 0.12, 0.3)
  );
  color += monColor * monomerAccum * 0.5;

  // Growing tips — bright energy
  vec3 tipColor = palette(
    t * 0.08 + paletteShift + 0.6,
    vec3(0.5, 0.45, 0.3),
    vec3(0.45, 0.4, 0.25),
    vec3(0.9, 0.85, 0.5),
    vec3(0.0, 0.1, 0.2)
  );
  color += tipColor * junctionAccum * (0.8 + u_treble * 1.0);

  // Cross-links
  vec3 linkColor = palette(
    crossLink * 0.5 + paletteShift + 0.5,
    vec3(0.3, 0.4, 0.35),
    vec3(0.25, 0.35, 0.3),
    vec3(0.6, 0.8, 0.7),
    vec3(0.0, 0.18, 0.25)
  );
  color += linkColor * crossLink * 0.3;

  // ── Free monomer pool — scattered particles not yet polymerized ──
  for (int m = 0; m < 15; m++) {
    float mf = float(m);
    float mseed = hash1(mf * 9.7 + 50.0);
    float mseed2 = hash1(mf * 5.3 + 53.0);

    vec2 freePos = vec2(
      sin(t * 0.8 + mf * 3.7) * 0.5,
      cos(t * 0.7 + mf * 5.1) * 0.4
    );
    freePos += vec2(mseed - 0.5, mseed2 - 0.5) * 0.3;

    float freeDist = length(uv - freePos);
    float freeGlow = exp(-freeDist * freeDist / 0.0004);
    float freePulse = 0.4 + 0.6 * sin(t * 2.0 + mf * 1.5);

    color += monColor * freeGlow * freePulse * 0.2;
  }

  // ── Bass: network tension / contraction ──
  float tension = sin(filamentAccum * 15.0 - t * 4.0) * 0.5 + 0.5;
  tension = pow(tension, 5.0) * filamentAccum;
  color += filColor * tension * u_bass * 0.5;

  // ── Mid: treadmilling visualization ──
  float treadmill = sin(filamentAccum * 20.0 + t * 3.0) * 0.5 + 0.5;
  treadmill = pow(treadmill, 6.0) * filamentAccum;
  color += tipColor * treadmill * u_mid * 0.3;

  // ── Treble: ATP sparkle ──
  float atp = snoise(uv * 25.0 + t * 3.0);
  atp = smoothstep(0.82, 1.0, atp) * u_treble;
  color += tipColor * atp * 0.25;

  // ── Vignette ──
  float vignette = 1.0 - smoothstep(0.5, 1.4, length(uv));
  color *= vignette;

  gl_FragColor = vec4(color, 1.0);
}
`;
