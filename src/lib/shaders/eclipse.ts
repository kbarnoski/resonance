import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  `
// Eclipse — Total solar eclipse: dark disc with brilliant corona
// and diamond ring effect, Baily's beads along the limb.

float fbm4(vec2 p) {
  float v = 0.0, a = 0.5;
  mat2 rot = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 4; i++) { v += a * snoise(p); p = rot * p * 2.0; a *= 0.5; }
  return v;
}

// Corona streamer — radial feature of the solar corona
float coronaStreamer(vec2 uv, float angle, float length, float width, float t) {
  vec2 dir = vec2(cos(angle), sin(angle));
  float proj = dot(uv, dir);
  float perp = abs(dot(uv, vec2(-dir.y, dir.x)));

  if (proj < 0.0) return 0.0;

  // Tapers outward
  float taper = width * (1.0 - proj / length);
  float shape = smoothstep(max(taper, 0.001), 0.0, perp);

  // Radial fade
  float fade = exp(-proj * 3.0 / length);

  // Internal structure
  float structure = 0.6 + 0.4 * sin(proj * 30.0 + t * 0.5);

  return shape * fade * structure;
}

// Baily's beads — bright points along the lunar limb
float bailysBeads(vec2 uv, float moonR, float t) {
  float r = length(uv);
  float a = atan(uv.y, uv.x);

  // Only near the limb
  float limbDist = abs(r - moonR);
  if (limbDist > 0.02) return 0.0;

  // Beads at specific angles (lunar valleys)
  float beads = 0.0;
  for (int i = 0; i < 8; i++) {
    float fi = float(i);
    float beadAngle = fi * 0.785 + sin(fi * 2.7 + t * 0.02) * 0.1;
    float angleDist = abs(mod(a - beadAngle + 3.14159, 6.28318) - 3.14159);
    float bead = smoothstep(0.08, 0.0, angleDist) * smoothstep(0.015, 0.002, limbDist);
    float brightness = 0.5 + 0.5 * sin(fi * 3.0 + t * 0.1);
    beads += bead * brightness;
  }

  return beads;
}

// Diamond ring — single brilliant point at the limb
float diamondRing(vec2 uv, float moonR, float t) {
  // Diamond position slowly moves around the limb
  float diamondAngle = sin(t * 0.05) * 0.5 + 0.8;
  vec2 diamondPos = vec2(cos(diamondAngle), sin(diamondAngle)) * moonR;

  float d = length(uv - diamondPos);

  // Brilliant point
  float point = exp(-d * d * 1500.0);

  // Long diffraction spike
  vec2 delta = uv - diamondPos;
  float spikeAngle = atan(delta.y, delta.x);
  float spikes = pow(abs(cos(spikeAngle * 2.0)), 20.0);
  float spikeGlow = exp(-d * 6.0) * spikes;

  // Ring of light
  float ringDist = abs(length(uv) - moonR);
  float ring = exp(-ringDist * ringDist * 5000.0) * smoothstep(0.3, 0.0, abs(atan(uv.y, uv.x) - diamondAngle));

  return (point + spikeGlow * 0.5 + ring * 0.3) * 2.0;
}

// Background stars
float stars(vec2 uv) {
  vec2 id = floor(uv * 70.0);
  vec2 f = fract(uv * 70.0) - 0.5;
  float h = fract(sin(dot(id, vec2(127.1, 311.7))) * 43758.5453);
  float star = step(0.94, h);
  float twinkle = 0.6 + 0.4 * sin(u_time * (2.0 + h * 6.0) + h * 80.0);
  return star * smoothstep(0.025, 0.0, length(f)) * twinkle;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.12;

  float paletteShift = u_amplitude * 0.2;
  float r = length(uv);
  float a = atan(uv.y, uv.x);

  float moonR = 0.16;

  // ── Deep background ──
  vec3 color = vec3(0.005, 0.005, 0.015);

  // Stars visible during totality
  float s = stars(uv);
  color += vec3(0.7, 0.75, 1.0) * s * 0.5;

  // ── Solar corona — the main spectacle ──
  float coronaBase = exp(-(r - moonR) * 4.0) * step(moonR, r);

  // Corona noise texture — asymmetric, streaky
  float coronaNoise = fbm4(vec2(a * 2.5 + t * 0.15, r * 8.0 - t * 0.2));
  coronaNoise = coronaNoise * 0.5 + 0.5;

  // Corona is brighter at equator (solar minimum shape)
  float equatorBias = 0.6 + 0.4 * pow(abs(cos(a)), 1.5);

  float corona = coronaBase * coronaNoise * equatorBias;
  corona *= (0.7 + u_bass * 0.6);

  // ── Radial streamers ──
  float streamers = 0.0;
  for (int i = 0; i < 12; i++) {
    float fi = float(i);
    float sAngle = fi * 0.5236 + sin(fi * 1.3 + t * 0.05) * 0.15;
    float sLen = 0.5 + 0.3 * sin(fi * 2.1);
    float sWidth = 0.02 + 0.015 * sin(fi * 3.0);
    streamers += coronaStreamer(uv, sAngle, sLen, sWidth, t) * 0.15;
  }
  streamers *= (0.5 + u_mid * 0.8);

  // ── Baily's beads ──
  float beads = bailysBeads(uv, moonR, t);
  beads *= (0.5 + u_treble * 1.5);

  // ── Diamond ring ──
  float diamond = diamondRing(uv, moonR, t);
  diamond *= (0.3 + u_bass * 0.7);

  // ── Colors ──
  // Inner corona — pearlescent white
  vec3 innerCoronaCol = palette(
    corona * 0.3 + t * 0.02 + paletteShift,
    vec3(0.9, 0.88, 0.85),
    vec3(0.12, 0.1, 0.08),
    vec3(0.2, 0.15, 0.1),
    vec3(0.0, 0.02, 0.05)
  );

  // Outer corona — shifts to warmer tones
  vec3 outerCoronaCol = palette(
    corona * 0.5 + r * 0.5 + t * 0.015 + paletteShift + 0.3,
    vec3(0.6, 0.55, 0.5),
    vec3(0.2, 0.18, 0.15),
    vec3(0.4, 0.3, 0.2),
    vec3(0.05, 0.05, 0.1)
  );

  // Streamer color — faint blue-white
  vec3 streamerCol = palette(
    streamers + a * 0.05 + t * 0.01 + paletteShift + 0.15,
    vec3(0.7, 0.72, 0.8),
    vec3(0.15, 0.13, 0.1),
    vec3(0.25, 0.2, 0.3),
    vec3(0.05, 0.08, 0.15)
  );

  // ── Compose ──
  // Corona with depth
  float coronaDepth = smoothstep(moonR, moonR + 0.3, r);
  vec3 coronaCol = mix(innerCoronaCol, outerCoronaCol, coronaDepth);
  color += coronaCol * corona;

  // Streamers
  color += streamerCol * streamers;

  // Baily's beads — brilliant white
  color += vec3(1.2, 1.15, 1.0) * beads;

  // Diamond ring — dazzling white-blue
  color += vec3(1.3, 1.2, 1.1) * diamond;

  // ── Prominences — red flares visible at the limb ──
  float limbAngle = a + t * 0.05;
  float prominences = 0.0;
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    float pAngle = fi * 1.57 + sin(fi * 2.0 + t * 0.1) * 0.4;
    float angleDist = abs(mod(a - pAngle + 3.14159, 6.28318) - 3.14159);
    float prom = smoothstep(0.15, 0.0, angleDist);
    prom *= smoothstep(moonR + 0.06, moonR, r) * smoothstep(moonR - 0.01, moonR + 0.01, r);
    prominences += prom * (0.3 + 0.3 * sin(fi * 3.0 + t * 0.3));
  }
  color += vec3(0.8, 0.2, 0.15) * prominences * (0.5 + u_bass * 0.5);

  // ── Moon disc — pure black ──
  float moonMask = smoothstep(moonR + 0.002, moonR - 0.002, r);
  color *= (1.0 - moonMask);

  // ── Earthshine — very faint illumination on moon's face ──
  float earthshine = moonMask * 0.005;
  color += vec3(0.3, 0.35, 0.4) * earthshine;

  // Vignette
  float vignette = 1.0 - smoothstep(0.5, 1.3, r);
  color *= (0.8 + 0.2 * vignette);

  // Tonemap for the bright diamond ring
  color = color / (color + 0.6);

  gl_FragColor = vec4(color, 1.0);
}
`;
