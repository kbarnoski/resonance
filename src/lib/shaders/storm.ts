import { U, SMOOTH_NOISE, VISIONARY_PALETTE } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  `
// Infinite dark storm sky — lightning branches downward into infinite depth,
// layered rolling thunderheads receding forever above.

float hash(float n) { return fract(sin(n) * 43758.5453); }
float hash2d(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

// Lightning bolt segment — SDF-style bright ridge
float boltSeg(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h);
}

// Recursive branching bolt — returns brightness at p
// seed: random seed for this bolt family
float bolt(vec2 p, float seed, float flash) {
  float bright = 0.0;
  vec2 cur = vec2(hash(seed) * 1.6 - 0.8, 0.55); // start near top
  float dir = (hash(seed + 7.3) - 0.5) * 0.6;    // lateral drift
  for (int i = 0; i < 10; i++) {
    float fi = float(i);
    vec2 next = cur + vec2(dir + (hash(seed + fi * 3.1) - 0.5) * 0.18,
                           -(0.08 + hash(seed + fi * 7.7) * 0.07));
    float d = boltSeg(p, cur, next);
    bright += flash * (0.0015 / (d * d + 0.0003));
    // Branch
    if (hash(seed + fi * 11.0) > 0.6) {
      vec2 bdir = vec2((hash(seed + fi * 5.3) - 0.5) * 0.3, -0.05);
      float bd = boltSeg(p, cur, cur + bdir * 3.0);
      bright += flash * (0.0008 / (bd * bd + 0.0005)) * 0.5;
    }
    dir += (hash(seed + fi * 4.9) - 0.5) * 0.25;
    cur = next;
  }
  return bright;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.07;
  float paletteShift = u_amplitude * 0.30;

  // ── Infinite cloud layers — perspective-projected receding stacks ──
  // Seven cloud depth levels, each further away and finer-scaled
  float cloud = 0.0;
  for (int lyr = 0; lyr < 7; lyr++) {
    float fl = float(lyr);
    float depthScale = 1.0 + fl * 0.6;            // each layer is further
    float speed = 0.15 / depthScale;               // closer layers move faster
    float amp   = 1.0 / (1.0 + fl * 0.4);         // distant layers are fainter
    vec2 cloudUV = uv * depthScale + vec2(t * speed, fl * 2.3);
    float c = fbm(cloudUV * 1.5 + vec2(fl * 17.0)) * 0.5 + 0.5;
    cloud += c * amp;
  }
  cloud /= 3.5; // normalize
  cloud = pow(cloud, 1.3);

  // ── Lightning ──
  // Three independent bolts, each with random flash timing
  float flash1 = step(0.92, hash(floor(t * 0.6 + 0.0))) * (0.8 + u_bass * 0.2);
  float flash2 = step(0.94, hash(floor(t * 0.8 + 37.0))) * (0.7 + u_bass * 0.3);
  float flash3 = step(0.96, hash(floor(t * 0.5 + 71.0))) * (0.5 + u_amplitude * 0.5);

  // Smooth the flash (brief bright burst then fade)
  float flashFade1 = flash1 * exp(-fract(t * 0.6 + 0.0) * 8.0);
  float flashFade2 = flash2 * exp(-fract(t * 0.8 + 37.0) * 10.0);
  float flashFade3 = flash3 * exp(-fract(t * 0.5 + 71.0) * 6.0);

  float lightning = bolt(uv, 1.0,  flashFade1)
                  + bolt(uv, 42.7, flashFade2)
                  + bolt(uv, 89.3, flashFade3);
  lightning = min(lightning, 2.0);

  // Scene-wide flash illumination — the clouds light up
  float sceneFlash = (flashFade1 + flashFade2 * 0.7 + flashFade3 * 0.5) * 0.3;

  // ── Deep sky gradient — bottom of screen = infinite depth below clouds ──
  float skyDepth = smoothstep(0.5, -0.8, uv.y);      // darkens at bottom
  float cloudHeight = smoothstep(-0.3, 0.6, uv.y);   // clouds live in upper portion

  // Bass pushes the cloud ceiling higher
  float cloudMask = cloudHeight * (0.6 + u_bass * 0.4);

  // ── Color ──
  // Deep storm sky base
  vec3 skyBase = palette(
    cloud * 0.5 + t * 0.05 + paletteShift,
    vec3(0.05, 0.06, 0.10),
    vec3(0.08, 0.08, 0.12),
    vec3(0.4, 0.3, 0.5),
    vec3(0.05, 0.0, 0.15)
  );

  // Rolling cloud color — slightly lighter, cooler at edges
  vec3 cloudCol = palette(
    cloud * 0.8 + paletteShift + 0.3,
    vec3(0.18, 0.16, 0.22),
    vec3(0.15, 0.12, 0.18),
    vec3(0.5, 0.4, 0.6),
    vec3(0.1, 0.05, 0.2)
  );

  // Lightning channel color — electric blue-white
  vec3 boltCol = palette(
    lightning * 0.3 + paletteShift + 0.6,
    vec3(0.85, 0.88, 0.98),
    vec3(0.1, 0.1, 0.05),
    vec3(0.5, 0.3, 0.8),
    vec3(0.0, 0.1, 0.3)
  );

  // Build scene
  vec3 color = skyBase;
  color = mix(color, cloudCol, cloud * cloudMask * 0.85);
  // Scene flash — brightens the whole cloud mass
  color += cloudCol * sceneFlash * cloud * 1.5;
  // Lightning channel itself
  color += boltCol * lightning;

  // Depth fog — absolute bottom goes to near black
  color = mix(color, vec3(0.01, 0.01, 0.02), skyDepth * 0.7);

  // Mid audio shifts the cloud color temperature
  color = mix(color, color * vec3(0.9, 0.95, 1.1), u_mid * 0.3);

  // Treble: fine rain-static texture
  float rain = snoise(uv * vec2(20.0, 60.0) + vec2(0.0, t * 30.0)) * 0.5 + 0.5;
  rain = pow(rain, 6.0) * u_treble * 0.3;
  color += vec3(0.6, 0.7, 0.9) * rain;

  // Vignette — hard corners add drama
  float vignette = 1.0 - smoothstep(0.45, 1.35, length(uv));
  color *= vignette;

  gl_FragColor = vec4(color, 1.0);
}
`;
