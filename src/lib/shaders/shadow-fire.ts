import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG = U + SMOOTH_NOISE + VISIONARY_PALETTE + ROT2 + `
// Shadow fire — a campfire seen from far away in total darkness.
// Warm radial glow with flickering noise in the bright zone.

// 3-octave fbm
float fbm3(vec2 p) {
  float v = 0.0, a = 0.5;
  mat2 r = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 3; i++) { v += a * snoise(p); p = r * p * 2.0; a *= 0.5; }
  return v;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.15;
  float paletteShift = u_amplitude * 0.2;

  // ── Fire center — slightly below screen center ──
  vec2 fireCenter = vec2(0.0, -0.15);
  vec2 fromFire = uv - fireCenter;
  float dist = length(fromFire);
  float angle = atan(fromFire.y, fromFire.x);

  // ── Flickering distortion — the fire is never perfectly still ──
  float flicker1 = fbm3(vec2(angle * 2.0 + t * 2.0, dist * 3.0 - t * 1.5));
  float flicker2 = snoise(vec2(angle * 3.0 - t * 1.8, dist * 5.0 + t));
  float flicker = flicker1 * 0.6 + flicker2 * 0.4;

  // Bass makes the fire surge larger
  float fireSize = 0.25 + u_bass * 0.08;

  // ── Fire shape — upward-biased radial with noise ──
  // Fire reaches higher than it reaches sideways
  float upwardBias = smoothstep(0.0, -0.5, fromFire.y) * 0.15; // taller upward
  float effectiveDist = dist - upwardBias;

  // Add flickering to the edge
  float flickerEdge = flicker * 0.06 * (0.7 + u_mid * 0.4);
  effectiveDist -= flickerEdge;

  // ── Radial zones — core, mid-flame, outer glow, darkness ──

  // Core — white-hot center
  float coreMask = smoothstep(fireSize * 0.35, 0.0, effectiveDist);
  // Inner turbulence
  float coreNoise = snoise(vec2(angle * 4.0 + t * 3.0, effectiveDist * 8.0 - t * 4.0));
  coreMask *= (0.8 + coreNoise * 0.2);

  vec3 coreColor = palette(
    0.1 + paletteShift * 0.3,
    vec3(0.4, 0.32, 0.18),
    vec3(0.15, 0.12, 0.05),
    vec3(1.0, 0.9, 0.5),
    vec3(0.0, 0.04, 0.08)
  );

  // Mid flame — orange/red
  float midMask = smoothstep(fireSize * 0.7, fireSize * 0.1, effectiveDist);
  midMask *= (1.0 - coreMask * 0.5); // reduce where core is bright
  // Fire turbulence — upward flowing noise
  float fireTurb = fbm3(vec2(angle * 3.0 + t * 1.5, effectiveDist * 5.0 - t * 3.0));
  midMask *= (0.6 + fireTurb * 0.4);

  vec3 midColor = palette(
    fireTurb * 0.3 + 0.05 + paletteShift,
    vec3(0.25, 0.08, 0.02),
    vec3(0.25, 0.1, 0.02),
    vec3(1.0, 0.6, 0.2),
    vec3(0.0, 0.06, 0.12)
  );

  // Outer glow — dim warm light bleeding into darkness
  float outerMask = smoothstep(fireSize * 2.5, fireSize * 0.3, effectiveDist);
  outerMask = pow(outerMask, 2.5); // steep falloff

  vec3 outerColor = palette(
    0.03 + paletteShift,
    vec3(0.08, 0.025, 0.008),
    vec3(0.06, 0.02, 0.005),
    vec3(1.0, 0.5, 0.15),
    vec3(0.0, 0.08, 0.15)
  );

  // ── Compositing — build up from darkness ──
  vec3 color = vec3(0.008, 0.004, 0.002); // near-total darkness

  // Outer glow first
  color += outerColor * outerMask * 0.6;

  // Mid flame
  color += midColor * midMask * 0.35;

  // Hot core
  color += coreColor * coreMask * 0.35;

  // ── Sparks rising from the fire ──
  float sparks = 0.0;
  for (int i = 0; i < 15; i++) {
    float fi = float(i);
    float seed = fi * 7.31;

    // Sparks originate near the fire center
    float sx = fireCenter.x + (fract(sin(seed) * 43758.5) * 0.3 - 0.15);
    float syBase = fireCenter.y + 0.05;

    // Rise upward with slight drift
    float riseSpeed = 0.15 + fract(sin(seed + 3.7) * 27183.8) * 0.2;
    float lifetime = 2.0 + fract(sin(seed + 7.1) * 15731.3) * 2.5;
    float age = mod(t * riseSpeed + fract(seed * 0.37) * lifetime, lifetime);
    float sy = syBase + age * 0.4;
    sx += sin(age * 3.0 + fi * 2.1) * 0.05;

    float sd = length(uv - vec2(sx, sy));
    float sparkSize = 0.003;
    float spark = sparkSize / (sd * sd + sparkSize * 0.3);

    // Fade out as spark rises and cools
    float sparkFade = (1.0 - age / lifetime);
    sparkFade *= sparkFade;
    spark *= sparkFade;

    // Treble drives spark visibility
    spark *= (0.3 + u_treble * 0.7);

    sparks += spark;
  }
  vec3 sparkColor = palette(
    0.08 + paletteShift,
    vec3(0.4, 0.2, 0.05),
    vec3(0.3, 0.15, 0.03),
    vec3(1.0, 0.7, 0.3),
    vec3(0.0, 0.05, 0.1)
  );
  color += sparkColor * sparks * 0.005;

  // ── Ground illumination — faint warm light on the ground below the fire ──
  float groundY = fireCenter.y - 0.15;
  float groundLight = smoothstep(groundY - 0.3, groundY, uv.y);
  groundLight *= smoothstep(groundY + 0.15, groundY, uv.y);
  float groundDist = abs(uv.x - fireCenter.x);
  groundLight *= smoothstep(0.5, 0.0, groundDist);
  groundLight *= 0.06;

  // Ground flicker
  float groundFlicker = 0.7 + 0.3 * sin(u_time * 3.0 + uv.x * 5.0);
  groundLight *= groundFlicker;

  vec3 groundColor = palette(
    0.04 + paletteShift,
    vec3(0.1, 0.04, 0.01),
    vec3(0.08, 0.03, 0.01),
    vec3(1.0, 0.6, 0.2),
    vec3(0.0, 0.06, 0.12)
  );
  color += groundColor * groundLight * (0.5 + u_bass * 0.5);

  // ── Smoke above the fire — dark wisps barely visible ──
  float smokeRegion = smoothstep(fireCenter.y + 0.1, fireCenter.y + 0.6, uv.y);
  float smokeDx = abs(uv.x - fireCenter.x);
  smokeRegion *= smoothstep(0.4, 0.05, smokeDx);
  float smokeN = fbm3(vec2(uv.x * 3.0 + t * 0.5, uv.y * 2.0 - t * 1.2));
  float smoke = smokeN * 0.5 + 0.5;
  smoke = smoothstep(0.3, 0.7, smoke) * smokeRegion * 0.02;
  color += vec3(0.03, 0.015, 0.008) * smoke * u_mid;

  // Vignette — very strong, emphasizes the isolation of the fire
  float vd = length(uv);
  float vignette = 1.0 - smoothstep(0.3, 1.2, vd);
  vignette = max(vignette, 0.0);
  color *= vignette;

  gl_FragColor = vec4(color, 1.0);
}`;
