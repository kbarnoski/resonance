// ─────────────────────────────────────────────────────────────────────────────
// shaders.ts — GLSL ES 3.00 for the GPU particle engine.
//
// SIM   : one full-screen pass over an N×N float texture pair (position+age,
//         velocity) written via MRT into the ping-pong partner. Each texel IS a
//         particle; it reads its OWN frequency band from the spectrum texture.
// DRAW  : gl.POINTS, one vertex per particle, no attribute buffers — the
//         vertex shader pulls its particle with texelFetch(gl_VertexID).
//         Soft gaussian sprites, additive into an RGBA16F HDR target.
// FADE  : trail persistence (prev HDR × decay) before the points land.
// LUM   : 16×16 downsample of the tonemapped frame for the WCAG governor.
// COMP  : tonemap (1 - e^-x·exposure) + sRGB + 1/255 ordered dither → canvas.
// ─────────────────────────────────────────────────────────────────────────────

export const QUAD_VS = /* glsl */ `#version 300 es
const vec2 P[3] = vec2[3](vec2(-1.0,-1.0), vec2(3.0,-1.0), vec2(-1.0,3.0));
void main(){ gl_Position = vec4(P[gl_VertexID], 0.0, 1.0); }
`;

const NOISE = /* glsl */ `
vec3 mod289(vec3 x){ return x - floor(x*(1.0/289.0))*289.0; }
vec4 mod289(vec4 x){ return x - floor(x*(1.0/289.0))*289.0; }
vec4 permute(vec4 x){ return mod289(((x*34.0)+10.0)*x); }
vec4 taylorInvSqrt(vec4 r){ return 1.79284291400159 - 0.85373472095314*r; }
// Ashima/Gustavson simplex noise with analytic gradient.
float snoise(vec3 v, out vec3 gradient){
  const vec2 C = vec2(1.0/6.0, 1.0/3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(
            i.z + vec4(0.0, i1.z, i2.z, 1.0))
          + i.y + vec4(0.0, i1.y, i2.y, 1.0))
          + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0*floor(p*ns.z*ns.z);
  vec4 x_ = floor(j*ns.z);
  vec4 y_ = floor(j - 7.0*x_);
  vec4 x = x_*ns.x + ns.yyyy;
  vec4 y = y_*ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0)*2.0 + 1.0;
  vec4 s1 = floor(b1)*2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.5 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  vec4 m2 = m*m;
  vec4 m4 = m2*m2;
  vec4 pdotx = vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3));
  vec4 temp = m2*m*pdotx;
  gradient = -8.0*(temp.x*x0 + temp.y*x1 + temp.z*x2 + temp.w*x3);
  gradient += m4.x*p0 + m4.y*p1 + m4.z*p2 + m4.w*p3;
  gradient *= 105.0;
  return 105.0*dot(m4, pdotx);
}
// Divergence-free curl of three decorrelated noise potentials.
vec3 curlNoise(vec3 p){
  vec3 g1, g2, g3;
  snoise(p, g1);
  snoise(p + vec3(31.416, -47.853, 12.793), g2);
  snoise(p + vec3(-233.145, -113.408, -185.31), g3);
  return vec3(g3.y - g2.z, g1.z - g3.x, g2.x - g1.y);
}
float hash11(float p){ p = fract(p*0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
vec3 hash31(float p){
  vec3 p3 = fract(vec3(p) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xxy + p3.yzz) * p3.zyx);
}
`;

// Each particle's home on the image plane: its own texel uv (jittered),
// cover-fit to the screen like the journey stills (1.06 overscan).
const IMG_UV = /* glsl */ `
vec2 imgUv(ivec2 c, vec4 s, int texW){
  return (vec2(c) + 0.5 + (s.gb - 0.5) * 0.9) / float(texW);
}
vec2 coverNdc(vec2 uv, float imgAspect, float scrAspect){
  vec2 d = (uv - 0.5) * 2.0 * 1.06;
  if (imgAspect > scrAspect) d.x *= imgAspect / scrAspect; else d.y *= scrAspect / imgAspect;
  return d;
}
`;

export const SIM_FS = /* glsl */ `#version 300 es
precision highp float;
precision highp int;
uniform sampler2D uPos;   // xyz, w = age
uniform sampler2D uVel;   // xyz
uniform sampler2D uSeed;  // r = band 0..1, g/b/a = uniform randoms
uniform sampler2D uSpec;  // bins×1 RG16F: r = level, g = drive
uniform float uDt;
uniform float uTime;
uniform vec3 uClock;      // bass / mid / treble dilated clocks
uniform vec3 uBands;      // bass / mid / treble drive (-1..1)
uniform vec3 uBandLv;     // bass / mid / treble level (0..1)
uniform float uSwell;     // onset swell 0..1
uniform int uSoulA;
uniform int uSoulB;
uniform float uMix;
uniform int uPasses;      // 1, or 2 while blending A → B
uniform int uTexW;
uniform float uCount;
uniform float uSmokeW;    // weight of the smoke soul (respawn gate)
uniform vec3 uWrap;       // wrap weights: x-flow, rising, falling
uniform float uInkW;      // ink respawn weight
uniform float uFountainW; // fountain respawn weight
uniform float uRiseW;     // rise souls (flame / wisp / petal fall) weight
uniform float uRiseTop;   // rise souls: where a climber returns (negative = fallers)
uniform float uInst;      // field mode: number of copies (1 = one form)
uniform float uInstSeed;  // field layout seed
uniform vec4 uForm;       // xy = cymatic plate mode (n, m) · zw = lissajous ratios
uniform float uCamAz;     // camera azimuth — figures that must FACE the viewer build in camera space
uniform vec4 uShape;      // per-appearance shape seed 0..1 (v4 variety: petals, gears, symmetry, solid)
uniform float uMaxSpeed;  // speed cap (entry ramps it up — no sudden bursts)
uniform float uDisperse;  // 1 for one frame: scatter wide so the form GATHERS
// playful impulses (particle-lead conductor)
uniform float uScatter;   // scatter-and-regroup envelope 0..1
uniform float uBounce;    // bounce envelope (signed)
uniform vec3 uMelody;     // melodic attractor
uniform float uMelodyW;   // follower weight
// image dissolve / reform (particle-engine dissolveTo)
uniform float uImgForm;   // spring toward the image plane 0..1
uniform float uImgShow;   // image presence (dissolve swirl gate)
uniform float uSnap;      // 1 for one frame: teleport onto the image plane
uniform vec3 uPlaneC;     // image plane centre (world)
uniform vec3 uPlaneR;     // plane right × half-width
uniform vec3 uPlaneU;     // plane up × half-height
uniform float uImgAspect;
uniform float uScrAspect;
layout(location = 0) out vec4 oPos;
layout(location = 1) out vec4 oVel;
${NOISE}
${IMG_UV}

float lifeOf(vec4 s){ return 6.0 + 9.0 * s.g; }
mat3 rotY(float a){ float c = cos(a), sn = sin(a); return mat3(c, 0.0, -sn, 0.0, 1.0, 0.0, sn, 0.0, c); }
mat3 rotX(float a){ float c = cos(a), sn = sin(a); return mat3(1.0, 0.0, 0.0, 0.0, c, sn, 0.0, -sn, c); }

// ── v4 geometric helpers ──
float superF(float th, float m, float n1, float n2, float n3){
  float a = pow(abs(cos(m * th * 0.25)), n2) + pow(abs(sin(m * th * 0.25)), n3);
  return pow(max(a, 1e-4), -1.0 / n1);
}
vec3 polyVert(int kind, int i){
  const float PHI = 1.6180339887;
  if (kind == 0) { // icosahedron
    int g = i / 4; float a = (i % 2 == 0) ? 1.0 : -1.0; float b = ((i / 2) % 2 == 0) ? PHI : -PHI;
    if (g == 0) return vec3(0.0, a, b);
    if (g == 1) return vec3(a, b, 0.0);
    return vec3(b, 0.0, a);
  }
  if (kind == 1) { // dodecahedron
    if (i < 8) return vec3((i & 1) == 0 ? 1.0 : -1.0, (i & 2) == 0 ? 1.0 : -1.0, (i & 4) == 0 ? 1.0 : -1.0);
    int j = i - 8; int g = j / 4; float a = (j % 2 == 0) ? 1.0 / PHI : -1.0 / PHI; float b = ((j / 2) % 2 == 0) ? PHI : -PHI;
    if (g == 0) return vec3(0.0, a, b);
    if (g == 1) return vec3(a, b, 0.0);
    return vec3(b, 0.0, a);
  }
  int ax = i / 2; float sg = (i % 2 == 0) ? 1.0 : -1.0; // octahedron
  return ax == 0 ? vec3(sg, 0.0, 0.0) : ax == 1 ? vec3(0.0, sg, 0.0) : vec3(0.0, 0.0, sg);
}
vec3 polyEdgePoint(int kind, float h1, float h2, float t){
  int nV = kind == 0 ? 12 : kind == 1 ? 20 : 6;
  float e2 = kind == 0 ? 4.0 : kind == 1 ? 1.527864 : 2.0;
  int deg = kind == 0 ? 5 : kind == 1 ? 3 : 4;
  int i = min(nV - 1, int(floor(h1 * float(nV))));
  vec3 A = polyVert(kind, i);
  int want = min(deg - 1, int(floor(h2 * float(deg))));
  int c = 0; vec3 B = A;
  for (int j = 0; j < 20; j++) {
    if (j >= nV) break;
    vec3 V = polyVert(kind, j);
    vec3 dv = V - A;
    if (abs(dot(dv, dv) - e2) < 0.05) { if (c == want) { B = V; break; } c++; }
  }
  return mix(A, B, t);
}

float causticF(vec2 q, float t1, float t2){
  return sin(q.x * 5.0 + t1) * sin(q.y * 4.1 - t2) + 0.5 * sin((q.x * 0.8 + q.y) * 3.3 + t1 * 0.7) + 0.3 * sin(q.x * 7.3 - q.y * 2.1 + t2 * 1.3);
}

// FIELD mode (Karel 2026-10-06: "can form many blossoms not just one … you
// seem to only make singular forms"): the field splits into uInst copies of
// the form, each with its own centre, depth and scale. The instance comes from
// a hash of the seeds (independent of how souls use them).
vec4 instOf(vec4 s, float n, float seed){
  if (n < 1.5) return vec4(0.0, 0.0, 0.0, 1.0);
  float h = fract(sin(dot(s.rgb, vec3(917.13, 31.71, 7.13)) + seed * 13.7) * 43758.5453);
  float k = floor(h * n);
  float hk = fract(sin(k * 12.9898 + seed * 78.233) * 43758.5453);
  float ang = k * 2.39996323 + seed * 6.2831853;
  float rad = 1.25 * sqrt((k + 0.5) / n);
  vec3 c = vec3(cos(ang) * rad * 1.35, sin(ang) * rad * 0.8, (hk - 0.5) * 1.8);
  float sc = mix(0.3, 0.5, hk) * (n <= 3.5 ? 1.35 : 1.0);
  return vec4(c, sc);
}

// Returns xyz = acceleration, w = linear drag.
vec4 soulForce(int soul, vec3 p, vec3 v, vec4 s, float fid, float lvl, float drv){
  float band = s.r;
  float bassW = 1.0 - smoothstep(0.18, 0.42, band);
  float trebW = smoothstep(0.6, 0.85, band);
  float midW = clamp(1.0 - bassW - trebW, 0.0, 1.0);
  float up = max(drv, 0.0);

  if (soul == 0) {
    // ── VORTEX: a 3-arm log-spiral galaxy; bass surges its orbit radius ──
    // bands segregate by radius: warm bass core → violet mids → blue treble rim
    float r0 = 0.08 + 1.55 * pow(mix(s.g, band, 0.55), 0.9);
    float arm = floor(s.b * 3.0);
    // ~28% of the bodies are the diffuse disk between the arms (s.b high)
    float halo = step(0.85, fract(s.b * 7.31));
    float scatter = (hash11(s.a * 917.0) - 0.5) * mix(0.42 + 0.35 * s.g, 6.2831853, halo) * mix(1.0, 2.0, step(0.5, hash11(s.a * 11.0)) * (1.0 - halo));
    float ang = arm * 2.0943951 + log(r0) * 2.3 + scatter + uClock.x * 0.22
              + uClock.y * 0.05 / (0.3 + r0);
    float rj = 1.0 + (hash11(s.a * 53.0) - 0.5) * 0.18;
    float R = r0 * rj * (1.0 + 0.10 * uBands.x + 0.42 * up * bassW + 0.12 * lvl * bassW);
    float y = (hash11(s.a * 331.0) - 0.5) * 0.16 * exp(-r0 * 0.7)
            + (hash11(s.a * 77.0) - 0.5) * 0.45 * exp(-r0 * 4.0);
    vec3 home = vec3(cos(ang) * R, y, sin(ang) * R);
    // treble: the finest dust sprays off the arms along its own fixed
    // direction while its band is up, and settles back as it falls
    home += normalize(hash31(s.a * 613.0) - 0.5) * 0.32 * up * trebW;
    vec3 a = (home - p) * 7.0;
    // mid: the arms' own current — a tangential swirl surge + curl eddies
    vec3 tang = normalize(vec3(-p.z, 0.0, p.x) + 1e-4);
    a += tang * 2.4 * up * midW;
    a += curlNoise(p * 1.7 + vec3(0.0, uClock.y * 0.12, 0.0)) * (0.2 + 2.6 * up * midW) * 0.3;
    a += (hash31(s.a * 1e3 + floor(uTime * 24.0)) - 0.5) * 10.0 * up * trebW;
    return vec4(a, 3.2);
  }
  if (soul == 1) {
    // ── SMOKE OF LIGHT: a curl-noise current rising like breath ──
    vec3 q = p * 0.85 + vec3(0.0, -uClock.y * 0.16, uClock.x * 0.06);
    vec3 c = curlNoise(q) * 0.22 * (0.55 + 3.0 * up * midW + 0.7 * uSwell);
    vec3 tv = c + vec3(0.0, 0.2 + 0.5 * max(uBands.x, 0.0) * (0.5 + bassW), 0.0);
    tv += curlNoise(p * 3.1 + uClock.z * 0.2) * 0.7 * up * trebW;
    vec3 a = (tv - v) * 2.2;
    float d = length(p.xz);
    a.xz -= p.xz * smoothstep(0.55, 1.2, d) * 2.0;
    return vec4(a, 0.0);
  }
  if (soul == 2) {
    // ── FIBONACCI BLOOM: golden-angle florets that open on swells ──
    float sites = 4096.0;
    float site = floor(clamp(mix(fid, band, 0.65), 0.0, 0.9999) * sites);
    float sf = (site + 0.5) / sites;
    float open = 0.42 + 0.5 * smoothstep(0.0, 1.0, uSwell) + 0.08 * uBandLv.y;
    float th = site * 2.39996323 + uClock.y * 0.12 * (1.2 - sf) + 0.45 * up * midW
             + (1.0 - open) * 3.2 * (1.0 - sf);
    float r = sqrt(sf) * 1.55 * open * (1.0 + 0.08 * uBands.x + 0.3 * up * bassW);
    float cup = (1.0 - open) * 1.1;
    float y = cup * r * r - 0.25 * cup
            + 0.07 * sin(r * 8.0 - uClock.x * 1.6) * (0.4 + 0.6 * uBandLv.x);
    vec3 jit = (hash31(s.a * 4093.0) - 0.5) * (0.012 + 0.03 * r);
    vec3 home = vec3(cos(th) * r, y, sin(th) * r) + jit;
    home += normalize(hash31(s.a * 613.0) - 0.5) * 0.28 * up * trebW;
    vec3 a = (home - p) * 6.0;
    return vec4(a, 3.4);
  }
  if (soul == 4) {
    // ── MOTES: glowing seed-lantern embers rising through the dark ──
    // bass lifts them, mids sway them on a slow curl, treble shimmers.
    vec3 tv = vec3(0.0, 0.05 + 0.1 * s.b + 0.3 * max(uBands.x, 0.0) * (0.4 + bassW) + 0.25 * up * bassW, 0.0);
    tv += curlNoise(p * 0.65 + vec3(0.0, -uClock.y * 0.05, uClock.x * 0.02)) * 0.13 * (0.6 + 2.4 * up * midW);
    tv += (hash31(s.a * 1e3 + floor(uTime * 16.0)) - 0.5) * 0.6 * up * trebW;
    vec3 a = (tv - v) * 1.6;
    a.xz -= p.xz * smoothstep(2.2, 3.0, length(p.xz)) * 1.5;
    return vec4(a, 0.0);
  }
  if (soul == 3) {
    // ── MURMURATION: a lagged ribbon chasing a wandering leader ──
    float t = uClock.x * 0.55 - s.g * 4.5;
    vec3 lead = vec3(sin(t * 0.61) * 1.25 + sin(t * 0.23) * 0.3,
                     sin(t * 0.47 + 1.0) * 0.45,
                     sin(t * 0.39 + 2.0) * 0.95);
    vec3 h = hash31(s.a * 2971.0) - 0.5;
    float spread = 0.55 + 0.25 * uSwell;
    vec3 off = vec3(h.x * 1.6, h.y * 0.25, h.z * 1.6) * spread;
    vec3 target = lead + off + normalize(h + 1e-4) * 0.45 * up * trebW;
    vec3 desired = (target - p) * (2.0 + 1.2 * max(uBands.x, 0.0));
    vec3 a = (desired - v) * (1.4 + 1.6 * s.b);
    a += curlNoise(p * 1.1 + uClock.y * 0.08) * (0.3 + 3.2 * up * midW) * 0.5;
    return vec4(a, 0.0);
  }
  if (soul == 5) {
    // ── PETALS: tumbling fall with a sideways flutter; bass gusts lift ──
    vec3 tv = vec3(sin(uClock.y * 0.7 + s.a * 40.0) * 0.22,
                   -0.1 - 0.08 * s.b + 0.45 * max(uBands.x, 0.0) * (0.3 + bassW),
                   cos(uClock.y * 0.5 + s.g * 30.0) * 0.18);
    tv += curlNoise(p * 0.5 + uClock.y * 0.04) * 0.15 * (0.6 + 2.0 * up * midW);
    tv.xz += (hash31(s.a * 1e3 + floor(uTime * 10.0)).xz - 0.5) * 0.8 * up * trebW;
    vec3 a = (tv - v) * 1.4;
    a.xz -= p.xz * smoothstep(2.2, 3.0, length(p.xz)) * 1.5;
    return vec4(a, 0.0);
  }
  if (soul == 6) {
    // ── EMBERS: sparks spiralling upward on turbulent breath ──
    vec3 tv = vec3(0.0, 0.35 + 0.45 * s.b + 0.8 * max(uBands.x, 0.0), 0.0);
    tv += curlNoise(p * 1.4 + vec3(0.0, -uClock.y * 0.4, 0.0)) * 0.55 * (0.5 + 2.0 * up * midW);
    tv += (hash31(s.a * 1e3 + floor(uTime * 20.0)) - 0.5) * 1.2 * up * trebW;
    vec3 a = (tv - v) * 2.2;
    a.xz -= p.xz * smoothstep(1.4, 2.4, length(p.xz)) * 2.0;
    return vec4(a, 0.0);
  }
  if (soul == 7) {
    // ── DUST STORM: a river of dust streaming sideways ──
    vec3 tv = vec3(0.5 + 1.1 * max(uBands.y, 0.0) + 0.7 * up * midW + 0.3 * uBandLv.x, 0.0, 0.0);
    tv += curlNoise(p * 0.8 + vec3(-uClock.y * 0.3, 0.0, 0.0)) * 0.5 * (0.7 + 1.5 * up);
    vec3 a = (tv - v) * 1.6;
    a.y -= (p.y - sin(p.x * 0.8 + uClock.x * 0.3) * 0.4) * 1.2;
    a.z -= p.z * smoothstep(1.2, 2.2, abs(p.z)) * 1.5;
    return vec4(a, 0.0);
  }
  if (soul == 8) {
    // ── POLLEN: a hush of fine motes hanging in a slow beam ──
    vec3 tv = curlNoise(p * 0.9 + uClock.y * 0.03) * 0.08 * (1.0 + 3.0 * up * midW) + vec3(0.0, -0.015, 0.0);
    tv += (hash31(s.a * 1e3 + floor(uTime * 8.0)) - 0.5) * 0.25 * up * trebW;
    vec3 a = (tv - v) * 1.0;
    a -= p * smoothstep(1.8, 2.6, length(p)) * 1.2;
    return vec4(a, 0.4);
  }
  if (soul == 9) {
    // ── TENDRILS: luminous growth reaching upward, swaying with the melody ──
    float k = floor(s.b * 7.0);
    float reach = 0.55 + 0.45 * smoothstep(0.0, 1.0, uSwell + uBandLv.y * 0.5);
    float u = min(s.g, reach);
    vec3 root = vec3((k - 3.0) * 0.55, -1.9, sin(k * 2.3) * 0.5);
    vec3 home = root + vec3(sin(u * 3.0 + k + uClock.y * 0.3) * 0.45 * u,
                            u * 3.6,
                            cos(u * 2.5 + k * 1.7 + uClock.y * 0.25) * 0.45 * u);
    home += curlNoise(vec3(k * 3.1, u * 2.0, uClock.y * 0.12)) * 0.12 * u * (1.0 + 2.0 * up * midW);
    home += (hash31(s.a * 77.0) - 0.5) * 0.05 * (1.0 + 4.0 * up * trebW);
    return vec4((home - p) * 8.0, 4.0);
  }
  if (soul == 10) {
    // ── THREADS: strings of light vibrating in standing-wave modes ──
    float k = floor(s.b * 9.0);
    float x = (s.g - 0.5) * 5.6;
    float xn = s.g;
    float bandAmp = k < 3.0 ? uBandLv.x + max(uBands.x, 0.0) : k < 6.0 ? uBandLv.y + max(uBands.y, 0.0) : uBandLv.z + max(uBands.z, 0.0);
    float n = 1.0 + mod(k, 3.0) + (k >= 6.0 ? 2.0 : 0.0);
    float disp = sin(3.14159265 * xn * n) * sin(uClock.y * (1.4 + n * 0.6) + k) * 0.22 * (0.25 + bandAmp);
    vec3 home = vec3(x, (k - 4.0) * 0.36 + disp, sin(k * 1.7) * 0.2);
    home.y += (hash11(s.a * 41.0) - 0.5) * 0.012;
    return vec4((home - p) * 12.0, 5.0);
  }
  if (soul == 11) {
    // ── RIBBONS: three twisting bands looping through space ──
    float r = floor(s.b * 3.0);
    float t = s.g * 6.2831853 + uClock.y * 0.18 + r * 2.1;
    vec3 c0 = vec3(sin(t) * 1.4, sin(t * 2.0 + r) * 0.5, cos(t) * 1.1 * cos(t * 0.5 + r));
    vec3 c1 = vec3(sin(t + 0.01) * 1.4, sin((t + 0.01) * 2.0 + r) * 0.5, cos(t + 0.01) * 1.1 * cos((t + 0.01) * 0.5 + r));
    vec3 T = normalize(c1 - c0 + 1e-5);
    vec3 N = normalize(cross(T, vec3(0.0, 1.0, 0.0)) + 1e-4);
    vec3 B = cross(T, N);
    float tw = s.g * 8.0 + uClock.x * 0.6;
    float w = (s.a - 0.5) * 0.32 * (1.0 + 0.8 * up * midW);
    vec3 home = c0 + (N * cos(tw) + B * sin(tw)) * w;
    home += normalize(hash31(s.a * 613.0) - 0.5) * 0.15 * up * trebW;
    return vec4((home - p) * 8.0, 4.0);
  }
  if (soul == 12) {
    // ── FIREFLIES: slow wanderers that dart when the treble sparkles ──
    vec3 base = (hash31(s.a * 91.0) - 0.5) * vec3(4.4, 2.8, 3.0);
    vec3 wander = vec3(sin(uClock.y * 0.3 * (0.5 + s.g) + s.a * 30.0),
                       sin(uClock.y * 0.23 * (0.5 + s.b) + s.g * 40.0) * 0.6,
                       cos(uClock.y * 0.27 + s.b * 20.0)) * 0.5;
    vec3 a = (base + wander - p) * 1.6;
    a += (hash31(s.a * 1e3 + floor(uTime * 3.0)) - 0.5) * 9.0 * up * trebW;
    return vec4(a, 1.4);
  }
  if (soul == 13) {
    // ── INK IN WATER: clouds of light unfurling from drops ──
    vec3 tv = curlNoise(p * 1.1 + vec3(0.0, uClock.y * 0.1, 0.0)) * 0.35 * (0.6 + 2.2 * up * midW + 0.4 * uBandLv.x);
    tv.y -= 0.05;
    vec3 a = (tv - v) * 1.2;
    a -= p * smoothstep(2.0, 2.8, length(p)) * 1.2;
    return vec4(a, 0.0);
  }
  if (soul == 14) {
    // ── BRANCHING: a fractal tree whose angles breathe ──
    float idx = floor(fid * 128.0);
    float L = 7.0;
    float lev = floor(s.g * L);
    float frac = fract(s.g * L);
    vec3 pos = vec3(0.0, -1.9, 0.0);
    vec3 dir = vec3(0.0, 1.0, 0.0);
    float len = 0.85;
    float spreadA = 0.42 + 0.12 * sin(uClock.y * 0.2) + 0.18 * max(uBands.x, 0.0);
    for (int i = 0; i < 7; i++) {
      if (float(i) > lev) break;
      float seg = float(i) == lev ? frac : 1.0;
      pos += dir * len * seg;
      float bit = mod(floor(idx / exp2(float(i))), 2.0) * 2.0 - 1.0;
      float ang = bit * spreadA * (1.0 + 0.15 * sin(uClock.y * 0.5 + float(i)));
      float yaw = float(i) * 1.3 + uClock.x * 0.05;
      vec3 axis = normalize(vec3(cos(yaw), 0.0, sin(yaw)));
      dir = normalize(dir * cos(ang) + cross(axis, dir) * sin(ang));
      len *= 0.74;
    }
    pos += (hash31(s.a * 19.0) - 0.5) * 0.03 * (1.0 + 5.0 * up * trebW);
    return vec4((pos - p) * 8.0, 4.0);
  }
  if (soul == 15) {
    // ── SACRED GEOMETRY: nested wireframes turning on their own bands ──
    float shell = floor(s.b * 3.0);
    float e = floor(fract(s.b * 3.0) * 12.0);
    float t = s.g * 2.0 - 1.0;
    vec3 q;
    if (shell == 1.0) {
      float pair = floor(e / 4.0);
      vec2 sg = vec2(mod(e, 2.0) * 2.0 - 1.0, mod(floor(e / 2.0), 2.0) * 2.0 - 1.0);
      vec3 ai = pair == 0.0 ? vec3(1, 0, 0) : pair == 1.0 ? vec3(0, 1, 0) : vec3(0, 0, 1);
      vec3 aj = pair == 0.0 ? vec3(0, 1, 0) : pair == 1.0 ? vec3(0, 0, 1) : vec3(1, 0, 0);
      q = mix(ai * sg.x, aj * sg.y, s.g) * 1.35;
    } else {
      float axis = floor(e / 4.0);
      vec2 sg = vec2(mod(e, 2.0) * 2.0 - 1.0, mod(floor(e / 2.0), 2.0) * 2.0 - 1.0);
      q = axis == 0.0 ? vec3(t, sg.x, sg.y) : axis == 1.0 ? vec3(sg.x, t, sg.y) : vec3(sg.x, sg.y, t);
      q *= shell == 0.0 ? 0.95 : 0.45;
    }
    float clk = shell == 0.0 ? uClock.x : shell == 1.0 ? uClock.y : uClock.z;
    q = rotY(clk * 0.25 * (shell == 1.0 ? -1.0 : 1.0)) * rotX(clk * 0.17) * q;
    q *= 1.0 + 0.06 * max(uBands.x, 0.0);
    q += (hash31(s.a * 29.0) - 0.5) * 0.02 * (1.0 + 6.0 * up * trebW);
    return vec4((q - p) * 10.0, 4.5);
  }
  if (soul == 16) {
    // ── ORBITALS: tilted rings, each orbit its own register ──
    float k = floor(s.b * 24.0);
    float kn = k / 24.0;
    float r = 0.35 + kn * 1.6 + (hash11(s.a * 7.0) - 0.5) * 0.04;
    vec3 tilt = hash31(k * 13.7) * 6.2831853;
    float clk = kn < 0.33 ? uClock.x : kn < 0.66 ? uClock.y : uClock.z;
    float ang = s.g * 6.2831853 + clk * 0.9 / pow(0.4 + r, 1.5);
    vec3 q = vec3(cos(ang) * r, 0.0, sin(ang) * r);
    q.y += sin(ang * 3.0 + uClock.y) * 0.03 * (1.0 + 3.0 * up * midW);
    q = rotY(tilt.x) * rotX(tilt.y * 0.5) * q;
    q *= 1.0 + 0.08 * up * bassW;
    return vec4((q - p) * 10.0, 4.5);
  }
  if (soul == 17) {
    // ── WAVES: a field of motes rolling like a sea of sound ──
    float x = (s.g - 0.5) * 6.4;
    float z = (s.b - 0.5) * 4.4;
    float y = 0.26 * sin(x * 1.1 - uClock.x * 1.4) * (0.4 + uBandLv.x + max(uBands.x, 0.0))
            + 0.12 * sin(z * 2.3 + x * 0.7 - uClock.y * 2.0) * (0.4 + uBandLv.y)
            + 0.05 * sin(x * 7.0 + z * 5.0 - uClock.z * 4.0) * (0.3 + uBandLv.z + up * trebW) - 0.5;
    return vec4((vec3(x, y, z) - p) * 9.0, 4.2);
  }
  if (soul == 18) {
    // ── CYMATICS: sand of light seeking a resonating plate's nodal lines ──
    vec2 nm = uForm.xy;
    vec2 q = p.xz / 1.7;
    float PI = 3.14159265;
    float f = cos(nm.x * PI * q.x) * cos(nm.y * PI * q.y) - cos(nm.y * PI * q.x) * cos(nm.x * PI * q.y);
    vec2 g = vec2(
      -nm.x * PI * sin(nm.x * PI * q.x) * cos(nm.y * PI * q.y) + nm.y * PI * sin(nm.y * PI * q.x) * cos(nm.x * PI * q.y),
      -nm.y * PI * cos(nm.x * PI * q.x) * sin(nm.y * PI * q.y) + nm.x * PI * cos(nm.y * PI * q.x) * sin(nm.x * PI * q.y));
    vec3 a = vec3(-f * g.x, 0.0, -f * g.y) * 0.9;
    a.xz += (hash31(s.a * 1e3 + floor(uTime * 14.0)).xz - 0.5) * abs(f) * (2.0 + 6.0 * uBandLv.x + 6.0 * up);
    a.y = (0.04 * abs(f) * (1.0 + 3.0 * up) - p.y) * 8.0;
    a.xz -= p.xz * smoothstep(1.6, 1.9, max(abs(p.x), abs(p.z))) * 6.0;
    return vec4(a, 3.0);
  }
  if (soul == 19) {
    // ── BREATHING NEBULA: a soft cloud that inhales on the bass ──
    vec3 h = hash31(s.a * 211.0);
    vec3 h2 = hash31(s.a * 977.0);
    vec3 gauss = vec3(sqrt(-2.0 * log(max(h.x, 1e-4))) * cos(6.2831853 * h.y),
                      sqrt(-2.0 * log(max(h.z, 1e-4))) * sin(6.2831853 * h2.x),
                      sqrt(-2.0 * log(max(h2.y, 1e-4))) * cos(6.2831853 * h2.z));
    float breath = 1.0 + 0.18 * sin(uClock.x * 0.4) + 0.22 * max(uBands.x, 0.0);
    vec3 home = gauss * vec3(0.9, 0.5, 0.8) * breath;
    home += curlNoise(home * 0.6 + uClock.y * 0.05) * 0.35 * (1.0 + 1.5 * up * midW);
    home += normalize(hash31(s.a * 613.0) - 0.5) * 0.2 * up * trebW;
    return vec4((home - p) * 3.0, 2.2);
  }
  if (soul == 20) {
    // ── ARCS: smooth bridges of light between poles ──
    float k = floor(s.b * 9.0);
    float th = k * 0.698 + uClock.x * 0.03;
    vec3 A = vec3(cos(th) * 1.6, -1.3, sin(th) * 1.6);
    vec3 Bp = vec3(cos(th + 2.6) * 1.6, -1.3, sin(th + 2.6) * 1.6);
    float t = clamp(s.g + (hash11(s.a * 3.0) - 0.5) * 0.04 * up * trebW, 0.0, 1.0);
    float h = 1.3 + 0.35 * sin(uClock.y * 0.3 + k) + 0.35 * up * bassW;
    vec3 side = normalize(cross(Bp - A, vec3(0.0, 1.0, 0.0)) + 1e-4);
    vec3 home = mix(A, Bp, t) + vec3(0.0, sin(3.14159265 * t) * h, 0.0)
              + side * sin(3.14159265 * t) * 0.25 * sin(uClock.y * 0.7 + k);
    home += (hash31(s.a * 47.0) - 0.5) * 0.035;
    return vec4((home - p) * 9.0, 4.2);
  }
  if (soul == 21) {
    // ── KALEIDOSCOPE: mirrored flow folded into eight sectors ──
    float r = 0.15 + 1.6 * s.g;
    float nSec = 5.0 + floor(uShape.x * 7.999);
    float wedge = 3.14159265 / nSec;
    float tb = s.b * wedge + 0.25 * sin(uClock.y * 0.4 + r * 3.0) * wedge + 0.1 * up * midW;
    float k = floor(s.a * nSec);
    float mirror = mod(floor(s.a * nSec * 2.0), 2.0);
    float th = k * 2.0 * wedge + (mirror > 0.5 ? -tb : tb) + uClock.x * 0.05;
    r *= 1.0 + 0.08 * sin(tb * nSec * 2.0 + uClock.y) + 0.12 * up * bassW;
    vec3 home = vec3(cos(th) * r, 0.2 * sin(r * 4.0 - uClock.y * 1.2) * (0.3 + uBandLv.y), sin(th) * r);
    return vec4((home - p) * 8.0, 4.0);
  }
  if (soul == 22) {
    // ── HELIX: three abstract strands twisting round a breathing column ──
    float nStr = 2.0 + floor(uShape.y * 4.999);
    float strand = floor(s.b * nStr);
    float y = (s.g - 0.5) * 3.6;
    float ang = y * (1.4 + 1.4 * uShape.z) * (1.0 + 0.3 * max(uBands.x, 0.0)) + uClock.y * 0.5 + strand * 6.2831853 / nStr;
    float r = 0.42 + 0.22 * sin(y * 1.3 + uClock.x * 0.4 + strand) + 0.1 * up * bassW;
    vec3 home = vec3(cos(ang) * r, y, sin(ang) * r);
    home += (hash31(s.a * 61.0) - 0.5) * 0.035 * (1.0 + 5.0 * up * trebW);
    return vec4((home - p) * 9.0, 4.2);
  }
  if (soul == 23) {
    // ── TORUS KNOT: one thread of light tied into a turning knot ──
    float ph = s.g * 6.2831853;
    // coprime (P, Q) only — a shared factor collapses the knot into a loop
    float P = 2.0 + floor(uShape.x * 2.999);
    float Q = P == 3.0 ? (uShape.y < 0.34 ? 4.0 : uShape.y < 0.67 ? 5.0 : 7.0) : P + 1.0 + 2.0 * floor(uShape.y * 2.999);
    float rr = cos(Q * ph) + 2.0;
    vec3 c = vec3(rr * cos(P * ph), -sin(Q * ph), rr * sin(P * ph)) * 0.55;
    vec3 tube = normalize(hash31(s.a * 37.0) - 0.5) * 0.1 * (1.0 + 1.2 * up * midW);
    vec3 home = rotY(uClock.y * 0.15) * rotX(uClock.x * 0.08) * (c + tube);
    home *= 1.0 + 0.06 * max(uBands.x, 0.0);
    return vec4((home - p) * 9.0, 4.2);
  }
  if (soul == 24) {
    // ── FOUNTAIN: light thrown upward, falling in slow arcs ──
    vec3 a = vec3(0.0, -1.6, 0.0);
    a += curlNoise(p * 0.9 + uClock.y * 0.1) * 0.25 * (1.0 + 2.0 * up * midW);
    a.xz += (hash31(s.a * 1e3 + floor(uTime * 12.0)).xz - 0.5) * 1.5 * up * trebW;
    return vec4(a, 0.15);
  }
  if (soul == 25) {
    // ── HARMONIC SPHERE: ripples in spherical-harmonic orders, one per band ──
    float i = fid * uCount;
    float yy = 1.0 - 2.0 * fid;
    float rad = sqrt(max(0.0, 1.0 - yy * yy));
    float phi = i * 2.39996323;
    vec3 d = vec3(cos(phi) * rad, yy, sin(phi) * rad);
    float th = acos(clamp(d.y, -1.0, 1.0));
    float az = atan(d.z, d.x) + uClock.y * 0.1;
    float R = 1.15
      + 0.22 * cos((2.0 + floor(uShape.x * 2.999)) * th) * cos((2.0 + floor(uShape.y * 3.999)) * az + uClock.x * 0.5) * (0.3 + uBandLv.x + max(uBands.x, 0.0))
      + 0.1 * cos(4.0 * th) * cos(4.0 * az - uClock.y * 0.6) * (0.3 + uBandLv.y + max(uBands.y, 0.0))
      + 0.05 * cos(8.0 * th) * cos(8.0 * az + uClock.z) * (0.3 + uBandLv.z + up * trebW);
    return vec4((d * R - p) * 10.0, 4.5);
  }
  if (soul == 26) {
    // ── LISSAJOUS: a figure traced by the music's own intervals ──
    float t = s.g * 6.2831853 * 2.0;
    vec3 rat = vec3(1.0, uForm.z, uForm.w);
    vec3 q = vec3(sin(rat.x * t + uClock.y * 0.2),
                  sin(rat.y * t),
                  sin(rat.z * t + 1.3 + uClock.x * 0.1)) * vec3(1.6, 1.1, 1.2);
    q += normalize(hash31(s.a * 53.0) - 0.5) * (0.025 + 0.12 * up * trebW + 0.04 * up * midW);
    return vec4((q - p) * 10.0, 4.5);
  }
  if (soul == 27) {
    // ── RINGS: concentric rings breathing outward on the bass ──
    float nR = 7.0 + floor(uShape.x * 7.999);
    float k = floor(s.b * nR);
    float r = 0.22 + k * 1.32 / nR;
    r *= 1.0 + 0.09 * sin(uClock.x * 0.8 - k * 0.55) + 0.12 * up * bassW;
    float dir = mod(k, 2.0) < 0.5 ? 1.0 : -1.0;
    float ang = s.g * 6.2831853 + uClock.y * 0.12 * dir;
    vec3 q = vec3(cos(ang) * r, 0.07 * sin(ang * 3.0 + uClock.y) * (0.3 + uBandLv.y + up * midW), sin(ang) * r);
    q += normalize(hash31(s.a * 71.0) - 0.5) * (0.012 + 0.05 * up * trebW);
    q = rotX(0.55 + 0.7 * uShape.z + 0.1 * sin(uClock.y * 0.07)) * q;
    return vec4((q - p) * 10.0, 4.5);
  }
  if (soul == 28) {
    // ── ROSE CURVES: nested rhodonea petals turning against each other ──
    float layer = floor(s.b * 3.0);
    float n = 2.0 + floor(uShape.x * 5.999) + layer;
    float d = 1.0 + floor(uShape.y * 2.999);
    float th = s.g * 6.2831853 * d;
    float r = cos(n / d * th) * (1.5 - layer * 0.4) * (1.0 + 0.08 * max(uBands.x, 0.0));
    float rot = uClock.y * 0.08 * (mod(layer, 2.0) < 0.5 ? 1.0 : -1.0) + layer * 0.4;
    vec3 q = vec3(cos(th + rot) * r, 0.06 * sin(n * th + uClock.y) * (0.3 + uBandLv.y), sin(th + rot) * r);
    q += normalize(hash31(s.a * 83.0) - 0.5) * (0.012 + 0.05 * up * trebW);
    return vec4((q - p) * 10.0, 4.5);
  }
  if (soul == 29) {
    // ── SPIROGRAPH: a hypotrochoid drawn by the music's own gears ──
    float ga = 1.0 + floor(uShape.x * 4.999);
    float gb = ga + 1.0 + floor(uShape.y * 5.999);
    float rr = ga / gb;
    float dd = 0.35 + 0.6 * uShape.z;
    float t = s.g * 6.2831853 * gb;
    float kk = (1.0 - rr) / rr;
    vec2 c2 = vec2((1.0 - rr) * cos(t) + dd * rr * cos(kk * t), (1.0 - rr) * sin(t) - dd * rr * sin(kk * t));
    float inner = step(s.b, 0.3);
    float rot = uClock.y * 0.06 * (inner > 0.5 ? -1.0 : 1.0);
    c2 = mat2(cos(rot), -sin(rot), sin(rot), cos(rot)) * c2 * mix(1.5, 0.62, inner) * (1.0 + 0.07 * max(uBands.x, 0.0));
    vec3 q = vec3(c2.x, 0.05 * sin(t * 3.0 + uClock.y) * (0.3 + uBandLv.y), c2.y);
    q += normalize(hash31(s.a * 89.0) - 0.5) * (0.012 + 0.05 * up * trebW);
    return vec4((q - p) * 10.0, 4.5);
  }
  if (soul == 30) {
    // ── SUPERFORMULA: a wireframe shell whose symmetry the harmony rewrites ──
    float th = s.g * 6.2831853 - 3.14159265;
    float ph = asin(clamp(2.0 * s.b - 1.0, -1.0, 1.0));
    // particles ride latitude OR longitude lines: a legible mesh, not a cloud
    if (s.a < 0.5) ph = (floor((ph / 3.14159265 + 0.5) * 11.0) + 0.5) / 11.0 * 3.14159265 - 1.5707963;
    else th = (floor((th / 6.2831853 + 0.5) * 16.0) + 0.5) / 16.0 * 6.2831853 - 3.14159265;
    float m1 = 2.0 + floor(uShape.x * 7.999), m2 = 2.0 + floor(uShape.y * 5.999);
    float n1 = 0.5 + uShape.z * 2.0, n2 = 0.7 + uShape.w * 1.6;
    float r1 = superF(th, m1, n1, n2, n2), r2 = superF(ph, m2, n1, n2, n2);
    vec3 q = vec3(r1 * cos(th) * r2 * cos(ph), r2 * sin(ph), r1 * sin(th) * r2 * cos(ph));
    q *= min(1.0, 1.6 / max(length(q), 1e-3));
    q *= 1.05 * (1.0 + 0.08 * max(uBands.x, 0.0) + 0.04 * sin(uClock.x * 0.5));
    q = rotY(uClock.y * 0.12) * rotX(uClock.x * 0.07 + 0.4) * q;
    q += normalize(hash31(s.a * 101.0) - 0.5) * (0.012 + 0.05 * up * trebW);
    return vec4((q - p) * 10.0, 4.5);
  }
  if (soul == 31) {
    // ── PLATONIC LIGHT: edges of a turning solid, its dual nested inside ──
    float sel = floor(uShape.x * 2.999);
    float inner = step(s.b, 0.35);
    int kind = int(inner > 0.5 ? mod(sel + 1.0, 3.0) : sel);
    vec3 q = polyEdgePoint(kind, s.a, fract(s.a * 7.31 + s.b), s.g);
    float rad = kind == 0 ? 1.902 : kind == 1 ? 1.732 : 1.0;
    q = q / rad * (inner > 0.5 ? 0.55 : 1.35);
    q = rotY(uClock.y * 0.14 * (inner > 0.5 ? -1.0 : 1.0)) * rotX(uClock.x * 0.09 + 0.3) * q;
    q *= 1.0 + 0.06 * max(uBands.x, 0.0);
    q += normalize(hash31(s.a * 107.0) - 0.5) * (0.01 + 0.045 * up * trebW);
    return vec4((q - p) * 10.0, 4.5);
  }
  if (soul == 32) {
    // ── MANDALA: rings of n-fold petals, alternate rings counter-turning ──
    float k = floor(s.b * 7.0);
    float n = 4.0 + floor(uShape.x * 8.999) + k * floor(uShape.y * 2.999);
    float th = s.g * 6.2831853;
    float dir = mod(k, 2.0) < 0.5 ? 1.0 : -1.0;
    float r = 0.2 + k * 0.2 + (0.06 + 0.02 * k) * pow(abs(cos(n * th * 0.5)), 0.5 + uShape.w * 2.5);
    r *= 1.0 + 0.05 * sin(uClock.x * 0.6 - k * 0.7) + 0.08 * up * bassW;
    float a = th + uClock.y * 0.05 * dir;
    vec3 q = vec3(cos(a) * r, 0.04 * sin(n * th + uClock.y) * (0.3 + uBandLv.y), sin(a) * r);
    q += normalize(hash31(s.a * 109.0) - 0.5) * (0.01 + 0.045 * up * trebW);
    return vec4((q - p) * 10.0, 4.5);
  }
  if (soul == 33) {
    // ── SPIRIT: a veiled presence drifting through — crown, flowing sleeves,
    // a billowing hem that trails wisps. Abstract: no face, no features. ──
    float drift = uTime * 0.03 + uShape.x * 6.2831853;
    float cx = 1.0 * sin(drift);
    float vx = cos(drift);
    float top = 1.2 + 0.1 * sin(uTime * 0.33);
    float wave = uClock.y * 0.7;
    vec3 q;
    if (s.a < 0.58) {
      // the veil: a surface of revolution, rounded crown → narrow → wide hem
      float u = pow(s.g, 0.65); // more motes toward the wide hem, not piled on the crown
      float va = s.b * 6.2831853;
      float rad;
      if (u < 0.14) rad = 0.26 * sqrt(max(0.0, 1.0 - pow((0.14 - u) / 0.14, 2.0)));
      else if (u < 0.26) rad = mix(0.26, 0.22, (u - 0.14) / 0.12);
      else rad = mix(0.22, 1.0, smoothstep(0.26, 1.0, u));
      float billow = 1.0 + (0.14 * sin(va * 3.0 + wave - u * 6.0) + 0.08 * sin(va * 5.0 - wave * 1.3 + u * 9.0)) * smoothstep(0.2, 1.0, u)
                   + 0.1 * up * bassW;
      rad *= billow * (0.97 + 0.05 * hash11(s.a * 131.0));
      q = vec3(cos(va) * rad, top - u * 2.3, sin(va) * rad * 0.5);
      q.x += -vx * 0.4 * u * u;
      q += curlNoise(q * 0.9 + vec3(0.0, uClock.y * 0.04, 0.0)) * 0.05 * u;
    } else if (s.a < 0.84) {
      // two flowing sleeves from the shoulders, rippling toward their tips
      float side = s.a < 0.71 ? -1.0 : 1.0;
      float t = s.g;
      vec3 A = vec3(side * 0.3, top - 0.6, 0.0);
      vec3 C = vec3(side * (1.45 + 0.12 * sin(wave * 0.6 + side)), top - 0.75 + 0.25 * sin(uClock.y * 0.35 + side * 1.7), 0.15);
      vec3 M = vec3(side * 0.85, top - 0.4 + 0.12 * sin(uClock.y * 0.3 + side), 0.05);
      vec3 c = mix(mix(A, M, t), mix(M, C, t), t);
      c.y += 0.08 * sin(t * 9.0 - wave * 1.6) * t;
      // a veil hanging from the arm: the sleeve drapes downward, widening
      float tube = (0.1 * (1.0 - t) + 0.03) * (1.0 + 0.4 * up * midW);
      c.y -= hash11(s.b * 29.0) * (0.04 + 0.22 * t) * (0.7 + 0.3 * sin(t * 6.0 - wave));
      q = c + normalize(hash31(s.a * 151.0) - 0.5) * tube * hash11(s.b * 17.0);
      q.x += -vx * 0.25;
    } else {
      // wisps: streams peeling off the hem, trailing behind the drift
      float w = s.g;
      float va = s.b * 6.2831853;
      vec3 h = vec3(cos(va) * 0.95, top - 2.3, sin(va) * 0.45);
      h.x += -vx * 0.4;
      w *= 0.75;
      q = h + vec3(-vx * 1.0 * w, -0.12 * w + 0.3 * w * w, 0.0);
      q += curlNoise(vec3(h.xz * 1.7, s.b * 7.0) + uClock.y * 0.03) * 0.18 * w;
    }
    q.x += -vx * 0.12 * (q.y - top);
    q.y -= 0.1;
    q *= 0.74; // the whole presence fits the frame, crown to trailing wisps
    q.x += cx;
    // local (right, up, depth) → world, facing the camera whatever its orbit
    vec3 camR = vec3(sin(uCamAz), 0.0, -cos(uCamAz));
    vec3 camD = vec3(cos(uCamAz), 0.0, sin(uCamAz));
    q = camR * q.x + vec3(0.0, q.y, 0.0) + camD * q.z;
    q += normalize(hash31(s.a * 97.0) - 0.5) * (0.01 + 0.03 * up * trebW);
    return vec4((q - p) * 6.5, 3.4);
  }
  if (soul == 34) {
    // ── TORUS LATTICE: a woven torus rolling through itself ──
    float nl = 8.0 + floor(uShape.y * 15.999);
    float L = floor(s.b * nl);
    float tw = (1.0 + floor(uShape.z * 3.999)) * (s.a < 0.5 ? 1.0 : -1.0);
    float uu = s.g * 6.2831853;
    float vv = tw * uu + L * 6.2831853 / nl + uClock.y * 0.2;
    float R = 1.0, r = 0.38 + uShape.x * 0.3;
    vec3 q = vec3((R + r * cos(vv)) * cos(uu), r * sin(vv), (R + r * cos(vv)) * sin(uu)) * 1.15;
    q = rotY(uClock.y * 0.1) * rotX(0.9 + 0.15 * sin(uClock.x * 0.1)) * q;
    q *= 1.0 + 0.06 * max(uBands.x, 0.0);
    q += normalize(hash31(s.a * 113.0) - 0.5) * (0.01 + 0.045 * up * trebW);
    return vec4((q - p) * 10.0, 4.5);
  }
  if (soul == 35) {
    // ── FLAME: tongues rising from a hearth, swaying, flickering; gusts on
    // the bass, crackle on the treble (respawn: "rise") ──
    float h = clamp((p.y + 0.9) / 1.9, 0.0, 1.0);
    float k = floor(s.b * 5.0);
    float ang = k * 1.2566 + 0.6 * sin(uClock.y * 0.3 + k);
    vec2 tongue = vec2(cos(ang), sin(ang) * 0.5) * 0.3 * (1.0 - h);
    vec2 axis = tongue + vec2(0.13 * sin(uTime * 1.7 + h * 6.0 + k), 0.0) * h;
    float pull = 3.0 + 4.0 * h;
    vec3 a = vec3((axis.x - p.x) * pull, 1.5 + 1.4 * max(uBands.x, 0.0) + 0.8 * hash11(s.a * 13.0 + floor(uTime * 3.0)), (axis.y * 0.6 - p.z) * pull);
    a += curlNoise(p * 2.2 + vec3(0.0, -uTime * 1.2, 0.0)) * (0.9 + 1.5 * up * midW) * (0.3 + h);
    a.xz += (hash31(s.a * 1e3 + floor(uTime * 20.0)).xz - 0.5) * 2.0 * up * trebW;
    return vec4(a, 1.6);
  }
  if (soul == 36) {
    // ── WISPS: slow curls rising and unravelling (respawn: "rise") ──
    float h = clamp((p.y + 0.95) / 2.3, 0.0, 1.0);
    float k = floor(s.b * 3.0);
    vec2 axis = vec2(0.25 * sin(uTime * 0.25 + k * 2.1 + h * 3.0) * h, 0.15 * cos(uTime * 0.2 + k) * h);
    float pull = 1.2 + 1.5 * (1.0 - h);
    vec3 a = vec3((axis.x - p.x) * pull, 0.55 + 0.4 * max(uBands.x, 0.0), (axis.y - p.z) * pull);
    a += curlNoise(p * 1.4 + vec3(0.0, -uTime * 0.25, k)) * (0.55 + 0.9 * up * midW) * (0.2 + h);
    return vec4(a, 1.4);
  }
  if (soul == 37) {
    // ── BLOSSOM: layered petals unfurling and closing, layers counter-turning ──
    float L = floor(s.b * 3.0);
    float n = 5.0 + floor(uShape.x * 4.999) + L;
    float pi_ = floor(s.a * n);
    float u = s.g;
    float vv = fract(s.a * n) * 2.0 - 1.0;
    float open = 0.55 + 0.45 * sin(uClock.x * 0.08 + L * 0.9 + uShape.y * 6.28);
    float R = (0.55 + 0.45 * (1.0 - L * 0.28)) * 1.45;
    float wid = pow(sin(3.14159265 * u), 0.8) * (0.42 - 0.08 * L) * (1.0 + 0.15 * max(uBands.y, 0.0));
    float ang = (pi_ + 0.5 * L) * 6.2831853 / n + uClock.y * 0.03 * (mod(L, 2.0) < 0.5 ? 1.0 : -1.0);
    vec2 dir = vec2(cos(ang), sin(ang));
    vec2 side = vec2(-dir.y, dir.x);
    float r = u * R * (0.35 + 0.65 * open);
    vec2 xz = dir * r + side * vv * wid * r * 0.9;
    float lift = (1.0 - open) * u * u * 0.9 + 0.15 * L;
    vec3 q = vec3(xz.x, lift - 0.2, xz.y) * (1.0 + 0.06 * max(uBands.x, 0.0));
    q += normalize(hash31(s.a * 127.0) - 0.5) * (0.008 + 0.04 * up * trebW);
    return vec4((q - p) * 8.0, 4.0);
  }
  if (soul == 38) {
    // ── WATER LIGHT: a pool of light gathering onto a shifting caustic web ──
    float ang = s.g * 6.2831853;
    float rr = 1.15 * sqrt(s.b);
    vec2 hp = vec2(cos(ang), sin(ang)) * rr;
    float t1 = uClock.y * 0.18, t2 = uClock.x * 0.11;
    // three gradient steps toward the zero-lines of a detuned interference field
    for (int it = 0; it < 3; it++) {
      float f = causticF(hp, t1, t2);
      vec2 g = vec2(causticF(hp + vec2(0.01, 0.0), t1, t2) - f, causticF(hp + vec2(0.0, 0.01), t1, t2) - f) / 0.01;
      hp -= f * g / (dot(g, g) + 4.0) * 0.9;
    }
    hp += (hash31(s.a * 37.0).xy - 0.5) * (0.012 + 0.04 * up * trebW);
    vec3 q = vec3(hp.x, 0.04 * sin(rr * 5.0 - uClock.x * 0.6) * (0.3 + uBandLv.x), hp.y);
    return vec4((q - p) * 7.0, 3.8);
  }
  if (soul == 39) {
    // ── PETAL FALL: sparse petals spiralling down a narrowing funnel, fluttering ──
    float hN = clamp((p.y + 1.2) / 2.4, 0.0, 1.0);
    float rr = (0.22 + 0.4 * hash11(s.a * 31.0)) * (0.45 + 0.55 * hN);
    float ang = atan(p.z, p.x);
    vec3 want = vec3(cos(ang + 0.7) * rr, p.y, sin(ang + 0.7) * rr * 0.7);
    vec3 a = (want - p) * vec3(2.4, 0.0, 2.4);
    a.y = -0.3 - 0.2 * max(uBands.x, 0.0);
    a.x += sin(uTime * 2.3 + s.a * 40.0) * 0.6;
    a.z += cos(uTime * 1.9 + s.a * 31.0) * 0.4;
    a += curlNoise(p * 1.1 + uTime * 0.05) * 0.25 * (1.0 + up * midW);
    return vec4(a, 1.3);
  }
  return vec4(-v, 1.0);
}

void main(){
  ivec2 c = ivec2(gl_FragCoord.xy);
  vec4 P4 = texelFetch(uPos, c, 0);
  vec4 V4 = texelFetch(uVel, c, 0);
  vec4 s = texelFetch(uSeed, c, 0);
  float id = float(c.y * uTexW + c.x);
  float fid = (id + 0.5) / uCount;

  vec2 sp = texture(uSpec, vec2(s.r, 0.5)).rg;
  float lvl = sp.r;
  float drv = sp.g;

  vec3 p = P4.xyz;
  vec3 v = V4.xyz;

  // kinetic time dilation, per particle, from its own band
  float rate = 1.0 + clamp(drv, -0.7, 1.0) * mix(1.25, 1.0, s.r);
  float dt = uDt * rate;

  // ONE inlined soulForce: a runtime-bounded loop (uPasses = 1, or 2 while
  // blending) the compiler cannot unroll — halves the program the GPU must
  // build, so a journey's union program warms in one short step
  vec4 I = instOf(s, uInst, uInstSeed);
  vec3 pl = (p - I.xyz) / I.w;
  vec3 vl = v / I.w;
  vec4 f = vec4(0.0);
  for (int k = 0; k < uPasses; k++) {
    float wgt = k == 0 ? (uPasses > 1 ? 1.0 - uMix : 1.0) : uMix;
    f += wgt * soulForce(k == 0 ? uSoulA : uSoulB, pl, vl, s, fid, lvl, drv);
  }
  f.xyz *= I.w; // local → world

  // image dissolve / reform: spring onto the image plane; while released,
  // the particles swirl with their own band (mids curl, bass surges)
  vec3 imgT = vec3(0.0);
  if (uImgForm > 0.001 || uImgShow > 0.001 || uSnap > 0.5) {
    vec2 ndc = coverNdc(imgUv(c, s, uTexW), uImgAspect, uScrAspect);
    imgT = uPlaneC + uPlaneR * ndc.x + uPlaneU * ndc.y;
    f = mix(f, vec4((imgT - p) * 9.0, 4.6), uImgForm);
    float rel = uImgShow * (1.0 - uImgForm);
    f.xyz += curlNoise(p * 1.2 + vec3(0.0, uClock.y * 0.18, uClock.x * 0.05)) * (0.5 + 2.2 * max(drv, 0.0)) * rel * 0.9;
  }

  // playful impulses — motion only (scatter outward, bounce, follow the melody)
  if (uScatter > 0.001) f.xyz += normalize(p + (hash31(s.a * 5.0) - 0.5) * 0.3) * uScatter * 7.0 * (0.4 + s.g);
  if (abs(uBounce) > 0.001) f.y += uBounce * 9.0 * (0.4 + s.b);
  if (uMelodyW > 0.001) f.xyz += (uMelody - p) * 3.0 * uMelodyW * step(0.86, s.b);

  v += f.xyz * dt;
  v *= exp(-f.w * dt);
  float sp2 = length(v);
  if (sp2 > uMaxSpeed) v *= uMaxSpeed / sp2;
  p += v * dt;

  if (uSnap > 0.5) { p = imgT; v = vec3(0.0); }
  if (uDisperse > 0.5) {
    vec3 r = hash31(s.a * 811.0 + 3.7);
    p = normalize(r - 0.5 + 1e-4) * (2.4 + 1.4 * hash11(s.a * 97.0));
    v = vec3(0.0);
  }

  // rise souls: climbers return to the hearth (fallers to the top) — the draw
  // fades both ends, so the return is never seen
  if (uRiseW > 0.5 && uImgShow < 0.01) {
    vec3 r = hash31(s.a * 917.0 + floor(uTime * 0.7));
    float top = uRiseTop + 0.25 * (hash11(s.a * 7.0) - 0.5);
    float ly = (p.y - I.y) / I.w;
    if (uRiseTop > 0.0 && ly > top) { float th = r.x * 6.2831853; float rr = 0.45 * sqrt(r.y); p = I.xyz + I.w * vec3(cos(th) * rr, -0.95, sin(th) * rr * 0.5); v = vec3(0.0, 0.3, 0.0) * I.w; }
    if (uRiseTop < 0.0 && ly < top) { float th = r.x * 6.2831853; float rr = 0.55 * sqrt(r.y); p = I.xyz + I.w * vec3(cos(th) * rr, 1.15, sin(th) * rr * 0.5); v = vec3(0.0); }
  }

  // wrapping souls re-enter off-edge (out of view — the draw fades the edges)
  if (uImgShow < 0.01) {
    vec3 r = hash31(s.a * 4271.0 + floor(uTime));
    if (uWrap.y > 0.5 && p.y > 2.0) { p = vec3((r.x - 0.5) * 4.4, -2.0, (r.z - 0.5) * 3.2); v = vec3(0.0); }
    if (uWrap.z > 0.5 && p.y < -2.0) {
      if (uFountainW > 0.5) {
        vec2 d = normalize(r.xz - 0.5 + 1e-4);
        p = vec3(d.x * 0.08, -1.95, d.y * 0.08);
        v = vec3(d.x * (0.3 + 0.6 * r.y), 2.4 + 0.6 * r.z + 0.9 * max(uBands.x, 0.0), d.y * (0.3 + 0.6 * r.y));
      } else {
        p = vec3((r.x - 0.5) * 4.4, 2.0, (r.z - 0.5) * 3.2); v = vec3(0.0);
      }
    }
    if (uWrap.x > 0.5 && p.x > 3.0) { p.x = -3.0; p.y = (r.y - 0.5) * 1.6; }
  }

  float age = P4.w + uDt;
  float life = lifeOf(s);
  if (age > life) {
    age -= life;
    if (uSmokeW > 0.5) {
      vec3 r = hash31(s.a * 7919.0 + floor(uTime * 3.0));
      float rr = pow(r.x, 0.5) * 0.3;
      float th = r.y * 6.2831853;
      p = vec3(cos(th) * rr, -1.5 + r.z * 0.25, sin(th) * rr);
      v = vec3(0.0);
    } else if (uInkW > 0.5) {
      // a new drop every ~5 s; each particle re-blooms from the current drop
      float epoch = floor(uTime / 5.0);
      vec3 drop = (hash31(epoch * 17.3) - 0.5) * vec3(2.6, 1.4, 1.6);
      vec3 r = hash31(s.a * 7919.0 + epoch);
      p = drop + (r - 0.5) * 0.2;
      v = normalize(r - 0.5 + 1e-4) * (0.4 + 0.5 * max(uBands.x, 0.0));
    }
  }
  if (any(isnan(p)) || any(isinf(p)) || length(p) > 30.0) {
    p = (hash31(s.a * 13.0) - 0.5) * 2.0;
    v = vec3(0.0);
  }
  oPos = vec4(p, age);
  oVel = vec4(v, 0.0);
}
`;

export const DRAW_VS = /* glsl */ `#version 300 es
precision highp float;
precision highp int;
uniform sampler2D uPos;
uniform sampler2D uVel;
uniform sampler2D uSeed;
uniform mat4 uVP;
uniform int uTexW;
uniform float uPointPx;   // base sprite diameter in device px
uniform float uFocal;     // camera distance (perspective normalizer)
uniform float uAlpha;     // per-particle energy
uniform vec3 uPalLow;
uniform vec3 uPalMid;
uniform vec3 uPalHigh;
uniform float uSmokeW;
uniform float uInkW;
uniform vec3 uWrap;        // x-flow, rising, falling — edge fades where they wrap
uniform float uSize;       // soul sprite size
uniform float uHue;        // hue rotation (radians, luma-preserving YIQ)
uniform float uRiseW;      // rise souls weight (edge fades at hearth / top)
uniform float uRiseTop;
uniform float uHeightCol;  // colour along height (flame: blue hearth → hot → ember tips)
uniform float uInst;
uniform float uInstSeed;
// FIELD mode (Karel 2026-10-06: "can form many blossoms not just one … you
// seem to only make singular forms"): the field splits into uInst copies of
// the form, each with its own centre, depth and scale. The instance comes from
// a hash of the seeds (independent of how souls use them).
vec4 instOf(vec4 s, float n, float seed){
  if (n < 1.5) return vec4(0.0, 0.0, 0.0, 1.0);
  float h = fract(sin(dot(s.rgb, vec3(917.13, 31.71, 7.13)) + seed * 13.7) * 43758.5453);
  float k = floor(h * n);
  float hk = fract(sin(k * 12.9898 + seed * 78.233) * 43758.5453);
  float ang = k * 2.39996323 + seed * 6.2831853;
  float rad = 1.25 * sqrt((k + 0.5) / n);
  vec3 c = vec3(cos(ang) * rad * 1.35, sin(ang) * rad * 0.8, (hk - 0.5) * 1.8);
  float sc = mix(0.3, 0.5, hk) * (n <= 3.5 ? 1.35 : 1.0);
  return vec4(c, sc);
}
uniform float uSat;        // saturation multiplier
uniform float uHueSpread;  // hue gradient across the form (rad)
uniform float uHueWave;    // slow hue wave on swells (rad)
uniform float uTimeD;      // draw-side time
uniform float uDensity;    // world visibility fraction (1 = all)
uniform float uWorldFade;  // world element fade (dissolve hides it)
uniform sampler2D uImgA;   // outgoing still
uniform sampler2D uImgB;   // incoming still
uniform float uColorMix;   // A → B
uniform float uImgShow;    // image presence 0..1
uniform float uImgGain;
uniform float uImgAspect;
uniform float uScrAspect;
out vec3 vCol;
float lifeOf(vec4 s){ return 6.0 + 9.0 * s.g; }
${IMG_UV}
// Rotate hue / scale saturation in YIQ: luma (Y) is untouched, so colour can
// follow the harmony without ever changing brightness (WCAG 2.3.1).
vec3 hueSat(vec3 c, float h, float sat){
  float Y = dot(c, vec3(0.299, 0.587, 0.114));
  float I = dot(c, vec3(0.596, -0.274, -0.322));
  float Q = dot(c, vec3(0.211, -0.523, 0.312));
  float ch = cos(h), sh = sin(h);
  float I2 = (I * ch - Q * sh) * sat;
  float Q2 = (I * sh + Q * ch) * sat;
  return max(vec3(Y + 0.956 * I2 + 0.621 * Q2, Y - 0.272 * I2 - 0.647 * Q2, Y - 1.106 * I2 + 1.703 * Q2), 0.0);
}
void main(){
  int id = gl_VertexID;
  ivec2 c = ivec2(id % uTexW, id / uTexW);
  vec4 p = texelFetch(uPos, c, 0);
  vec4 v = texelFetch(uVel, c, 0);
  vec4 s = texelFetch(uSeed, c, 0);
  vec4 clip = uVP * vec4(p.xyz, 1.0);
  if (clip.w <= 0.05) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; vCol = vec3(0.0); return; }
  gl_Position = clip;

  float band = s.r;
  // world visibility: a stable rank per particle; particle 0 is the last
  // ember (rank 0) so the field can settle to exactly one light
  float rank = id == 0 ? 0.0 : fract(s.g * 7.31 + s.b * 3.17);
  float visW = uDensity >= 0.999 ? 1.0 : 1.0 - smoothstep(uDensity * 0.6, uDensity + 1e-6, rank);
  // hidden motes cost NOTHING (2026-10-06): culled before rasterisation —
  // sparse fields used to rasterise every invisible mote at up to 32 px
  if (visW < 0.003 && uImgShow < 0.001) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; vCol = vec3(0.0); return; }
  float sparse = 1.0 - clamp(uDensity * 8.0, 0.0, 1.0); // sparse fields: fewer, bigger, brighter motes
  float boost = mix(1.0, 3.2, sparse) * (uDensity < 0.0005 ? 1.9 : 1.0);
  boost = mix(boost, 1.0, uImgShow);
  // bass = heavier motes, treble = the finest dust
  float size = mix(1.55, 0.5, band) * (0.45 + 1.6 * s.b * s.b * s.b) * uPointPx * (uFocal / clip.w) * boost * mix(uSize, 1.0, uImgShow);
  float a = uAlpha;
  if (size < 1.0) { a *= size * size; size = 1.0; }
  gl_PointSize = min(size, 24.0);

  vec3 col = band < 0.5 ? mix(uPalLow, uPalMid, band * 2.0) : mix(uPalMid, uPalHigh, band * 2.0 - 1.0);
  vec4 Id = instOf(s, uInst, uInstSeed);
  float lyD = (p.y - Id.y) / Id.w; // height inside its own copy (field mode)
  if (uHeightCol > 0.001) {
    float hh = clamp((lyD + 0.95) / 1.9 + (s.g - 0.5) * 0.12, 0.0, 1.0);
    vec3 hc = hh < 0.25 ? mix(uPalLow, uPalMid, hh * 4.0) : mix(uPalMid, uPalHigh, (hh - 0.25) / 0.75);
    col = mix(col, hc, uHeightCol);
  }
  col = mix(col, uPalHigh, clamp(length(v.xyz) * 0.12, 0.0, 0.25));
  // colour lives ACROSS the form: a gradient over height + azimuth, and a
  // slow hue wave rolling outward on swells — luma-preserving (YIQ)
  float grad = 0.55 * clamp(p.y / 1.6, -1.0, 1.0) + 0.45 * sin(atan(p.z, p.x));
  float wave = sin(length(p.xyz) * 2.2 - uTimeD * 0.8);
  col = hueSat(col, uHue + (band - 0.5) * 0.15 * uSat + uHueSpread * grad + uHueWave * wave, uSat);

  float life = lifeOf(s);
  float fade = smoothstep(0.0, 1.0, p.w) * smoothstep(life, life - 1.5, p.w);
  a *= mix(1.0, fade, smoothstep(0.0, 0.5, uSmokeW + uInkW));
  // rise souls fade at the hearth and toward the top (fallers: top and bottom)
  if (uRiseW > 0.001) {
    float rf = uRiseTop > 0.0
      ? smoothstep(uRiseTop + 0.1, uRiseTop - 0.55, lyD) * smoothstep(-1.0, -0.78, lyD)
      : smoothstep(1.2, 0.9, lyD) * smoothstep(uRiseTop - 0.05, uRiseTop + 0.4, lyD);
    a *= mix(1.0, rf, uRiseW * (1.0 - uImgShow));
  }
  // wrapping souls fade at the edges where they re-enter
  float edgeY = smoothstep(2.0, 1.4, p.y) * smoothstep(-2.0, -1.4, p.y);
  a *= mix(1.0, edgeY, smoothstep(0.0, 0.5, max(uWrap.y, uWrap.z)) * (1.0 - uImgShow));
  a *= mix(1.0, smoothstep(3.0, 2.3, abs(p.x)), smoothstep(0.0, 0.5, uWrap.x) * (1.0 - uImgShow));
  vec3 world = col * a * visW * mix(1.0, 4.0, sparse) * uWorldFade;

  // image mode: the particle wears its pixel of the still (sRGB → linear)
  vec3 img = vec3(0.0);
  if (uImgShow > 0.001) {
    vec2 uv = imgUv(c, s, uTexW);
    vec3 ia = texture(uImgA, uv).rgb;
    vec3 ib = texture(uImgB, uv).rgb;
    img = pow(mix(ia, ib, uColorMix), vec3(2.2));
    if (size <= 1.0) img *= a / max(uAlpha, 1e-6); // sub-pixel energy rule
  }
  vCol = mix(world, img * uImgGain, uImgShow);
}
`;

export const DRAW_FS = /* glsl */ `#version 300 es
precision mediump float;
in vec3 vCol;
out vec4 o;
void main(){
  vec2 d = gl_PointCoord * 2.0 - 1.0;
  float r2 = dot(d, d);
  if (r2 > 1.0) discard;
  // bright core + soft glow — reads over imagery without growing the footprint
  float g = exp(-r2 * 7.0) + 0.3 * exp(-r2 * 1.8);
  o = vec4(vCol * g * 1.15, 1.0);
}
`;

export const FADE_FS = /* glsl */ `#version 300 es
precision highp float;
uniform sampler2D uPrev;
uniform float uDecay;
out vec4 o;
void main(){ o = texelFetch(uPrev, ivec2(gl_FragCoord.xy), 0) * uDecay; }
`;

export const LUM_FS = /* glsl */ `#version 300 es
precision highp float;
uniform sampler2D uHdr;
uniform sampler2D uExp;   // 1×1: r = exposure (GPU governor)
uniform float uLod;
out vec4 o;
void main(){
  vec2 uv = gl_FragCoord.xy / 16.0;
  vec3 h = textureLod(uHdr, uv, uLod).rgb;
  float ex = texelFetch(uExp, ivec2(0), 0).r;
  vec3 t = 1.0 - exp(-h * ex);
  float L = dot(t, vec3(0.2126, 0.7152, 0.0722));
  o = vec4(L, 0.0, 0.0, 1.0);
}
`;

// The WCAG 2.3.1 governor, entirely on the GPU (kiosk hang 2026-10-05: the
// CPU read-back of the luminance — getBufferSubData — blocked Chrome's main
// thread 20–236 ms at a time). Averages the 16×16 tonemapped luminance and
// slews the 1×1 exposure by at most uMaxStep per update (governExposure).
export const EXPO_FS = /* glsl */ `#version 300 es
precision highp float;
uniform sampler2D uLum;   // 16×16, r = displayed luminance
uniform sampler2D uPrev;  // 1×1: r = exposure, g = mean luminance
uniform float uCap;
uniform float uMaxStep;
uniform float uInit;
out vec4 o;
void main(){
  float s = 0.0;
  for (int y = 0; y < 16; y++) for (int x = 0; x < 16; x++) s += texelFetch(uLum, ivec2(x, y), 0).r;
  float m = s / 256.0;
  float e = uInit > 0.5 ? 1.0 : texelFetch(uPrev, ivec2(0), 0).r;
  float want = m > uCap ? min(1.0, e * uCap / max(m, 1e-6)) : 1.0;
  float ratio = clamp(want / max(e, 1e-6), 1.0 - uMaxStep, 1.0 + uMaxStep);
  o = vec4(clamp(e * ratio, 0.15, 1.0), m, 0.0, 1.0);
}
`;

export const COMP_FS = /* glsl */ `#version 300 es
precision highp float;
uniform sampler2D uHdr;
uniform sampler2D uExp;     // 1×1: r = exposure (GPU governor)
uniform float uTransparent; // 1 = premultiplied alpha = brightest channel
out vec4 o;
// interleaved-gradient dither (Jimenez) — kills 8-bit banding in the glow
// falloff; gated off on pure black so the floor stays RGB 0,0,0.
float ign(vec2 p){ return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
void main(){
  ivec2 c = ivec2(gl_FragCoord.xy);
  vec3 h = texelFetch(uHdr, c, 0).rgb;
  // HUE-PRESERVING tone map (Karel 2026-10-06: "they should almost always
  // have color"): compress the brightest channel and scale the others with
  // it — per-channel 1-exp() bleached every dense overlap to white
  vec3 he = h * texelFetch(uExp, ivec2(0), 0).r;
  float hm = max(he.r, max(he.g, he.b));
  vec3 t = hm > 1e-6 ? he * ((1.0 - exp(-hm)) / hm) : he;
  vec3 srgb = pow(t, vec3(1.0 / 2.2));
  srgb += (ign(gl_FragCoord.xy) - 0.5) / 255.0 * step(0.002, max(t.r, max(t.g, t.b)));
  srgb = max(srgb, 0.0);
  // transparent: black is fully see-through and light composites additively
  // (premultiplied, alpha = brightest channel) over whatever lies beneath
  o = uTransparent > 0.5 ? vec4(srgb, max(srgb.r, max(srgb.g, srgb.b))) : vec4(srgb, 1.0);
}
`;

// ── per-variant simulation programs (kiosk hang fix, 2026-10-05) ─────────────
// The full SIM_FS inlines all 28 soul force laws and calls them twice (A and
// B): on ANGLE/Metal its pipeline is built at the FIRST DRAW, in the GPU
// process, which stalled every WebGL context + video on the kiosk for seconds
// (Snowflake froze at its first emergence). Each variant carries only the
// souls it blends between — a fraction of the code — and is compiled ahead
// of time with KHR_parallel_shader_compile (particle-engine.ts).
const SOUL_BLOCK_RE = /\n {2}if \(soul == (\d+)\) \{/g;

function splitSim(): { head: string; blocks: Map<number, string>; tail: string } {
  const src = SIM_FS;
  const fnStart = src.indexOf("vec4 soulForce(");
  const bodyStart = src.indexOf("{", fnStart) + 1;
  const firstBlock = src.slice(bodyStart).search(SOUL_BLOCK_RE) + bodyStart;
  const tailStart = src.indexOf("\n  return vec4(-v, 1.0);", firstBlock);
  const blocks = new Map<number, string>();
  const region = src.slice(firstBlock, tailStart);
  const marks = [...region.matchAll(SOUL_BLOCK_RE)];
  marks.forEach((m, i) => {
    const end = i + 1 < marks.length ? marks[i + 1].index! : region.length;
    blocks.set(Number(m[1]), region.slice(m.index!, end));
  });
  return { head: src.slice(0, firstBlock), blocks, tail: src.slice(tailStart) };
}
let split: ReturnType<typeof splitSim> | null = null;

/** SIM_FS with only the given souls' force laws (others fall to a gentle stop). */
export function buildSimFS(souls: readonly number[]): string {
  split ??= splitSim();
  const uniq = [...new Set(souls)].sort((a, b) => a - b);
  return split.head + uniq.map((i) => split!.blocks.get(i) ?? "").join("") + split.tail;
}

/** How many soul blocks the full simulation carries (test hook). */
export function simSoulCount(): number {
  split ??= splitSim();
  return split.blocks.size;
}

// ── one-off GPU initialisation (kiosk hang follow-up): seeds + starting
// positions are written by these passes instead of a 262k-iteration JS loop
// and ~12 MB of texture uploads on the main thread at journey start.
export const SEED_INIT_FS = /* glsl */ `#version 300 es
precision highp float;
out vec4 o;
float h(vec2 p, float k){ vec3 q = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973) + k); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
void main(){
  vec2 c = gl_FragCoord.xy;
  // band skewed toward the lower half (piano lives low-mid), a dusting of treble
  o = vec4(pow(h(c, 0.17), 1.25), h(c, 0.41), h(c, 0.73), h(c, 0.29));
}
`;
export const POS_INIT_FS = /* glsl */ `#version 300 es
precision highp float;
layout(location = 0) out vec4 oPos;
layout(location = 1) out vec4 oVel;
float h(vec2 p, float k){ vec3 q = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973) + k); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
void main(){
  vec2 c = gl_FragCoord.xy;
  float u = h(c, 0.53), v = h(c, 0.61), w = pow(h(c, 0.67), 1.0 / 3.0) * 1.6;
  float th = u * 6.2831853, ph = acos(2.0 * v - 1.0);
  oPos = vec4(sin(ph) * cos(th) * w, cos(ph) * w * 0.4, sin(ph) * sin(th) * w, h(c, 0.79) * 15.0);
  oVel = vec4(0.0);
}
`;
