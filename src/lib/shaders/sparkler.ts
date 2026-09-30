import { U } from "./shared";

export const FRAG =
  U +
  `
// Sparkler — a single incandescent emitter traveling an endless 3D
// path, spraying glitter that drifts and dies behind it (Karel
// 2026-09-30: "a sparkler traveling through endless space seemingly
// in 3d and responding to the music"). Music mapping: bass = travel
// speed + spray burst radius, mid = path sweep, treble = twinkle.
// All motion smooth — the emitter never teleports, sparks only drift.

float hash(float n) { return fract(sin(n) * 43758.5453); }
vec3 hash3(float n) {
  return fract(sin(vec3(n, n + 17.13, n + 31.7)) * vec3(43758.5453, 24634.6345, 12764.235));
}

// The emitter's 3D path — slow lissajous through deep space.
vec3 path(float t) {
  return vec3(
    sin(t * 0.31) * 1.1 + sin(t * 0.13) * 0.5,
    cos(t * 0.23) * 0.7 + sin(t * 0.41) * 0.3,
    2.6 + sin(t * 0.17) * 1.2
  );
}

void main() {
  vec2 uv = (gl_FragCoord.xy * 2.0 - u_resolution.xy) / min(u_resolution.x, u_resolution.y);
  // Bass advances the journey itself — the sparkler surges with the kick.
  float t = u_time * (0.55 + u_bass * 0.9);
  vec3 col = vec3(0.0);

  vec3 headP = path(t);
  vec2 headScreen = headP.xy / headP.z;
  float headD = length(uv - headScreen);
  // Incandescent head: hot white core, warm gold corona.
  col += vec3(1.0, 0.95, 0.82) * 0.012 / (headD * headD * headP.z * headP.z + 0.0012);

  // Spark trail: 56 embers sampled back along the path, each with its
  // own spray velocity, drifting outward and fading as it ages.
  for (int i = 1; i <= 56; i++) {
    float fi = float(i);
    float age = fi * 0.055; // seconds behind the head
    float birth = t - age;
    vec3 sp = path(birth);
    vec3 rnd = hash3(floor(birth * 18.0) + fi * 7.31) - 0.5;
    // Spray: velocity spread grows with age; bass bursts the radius.
    float spread = age * (0.32 + u_bass * 0.75);
    sp += rnd * spread;
    sp.y -= age * age * 0.10; // gentle gravity
    if (sp.z < 0.35) continue;
    vec2 ss = sp.xy / sp.z;
    float d = length(uv - ss);
    float life = 1.0 - age / 3.1;
    if (life <= 0.0) continue;
    // Treble twinkle — sparks shimmer, never strobe the frame.
    float tw = 0.55 + 0.45 * sin(u_time * (5.0 + hash(fi) * 9.0) * (0.6 + u_treble) + fi);
    float b = 0.0035 / (d * d + 0.00012) * life * life * tw;
    // Ember color: white-gold young, cooling to teal-cyan with age
    // (Chemiluminescence's palette).
    vec3 young = vec3(1.0, 0.9, 0.7);
    vec3 old = vec3(0.35, 0.85, 0.9);
    col += mix(young, old, age / 3.1) * b * 0.22;
  }

  // Whisper of depth: ultra-faint distant dust so space reads endless.
  for (int j = 0; j < 3; j++) {
    float fj = float(j);
    vec2 g = uv * (3.0 + fj * 3.0) + vec2(t * 0.02 * (fj + 1.0), fj * 7.7);
    vec2 id = floor(g);
    vec2 f = fract(g) - 0.5;
    float h = fract(sin(dot(id, vec2(127.1, 311.7))) * 43758.5453);
    if (h > 0.06) continue;
    float d2 = length(f - (vec2(hash(h * 91.7), hash(h * 57.3)) - 0.5) * 0.6);
    col += vec3(0.5, 0.8, 0.85) * smoothstep(0.03, 0.0, d2) * 0.05;
  }

  gl_FragColor = vec4(col, 1.0);
}
`;
