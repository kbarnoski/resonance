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
uniform int uTexW;
uniform float uCount;
uniform float uSmokeW;    // weight of the smoke soul (respawn gate)
uniform vec3 uWrap;       // wrap weights: x-flow, rising, falling
uniform float uInkW;      // ink respawn weight
uniform float uFountainW; // fountain respawn weight
uniform vec4 uForm;       // xy = cymatic plate mode (n, m) · zw = lissajous ratios
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
    float wedge = 3.14159265 / 8.0;
    float tb = s.b * wedge + 0.25 * sin(uClock.y * 0.4 + r * 3.0) * wedge + 0.1 * up * midW;
    float k = floor(s.a * 8.0);
    float mirror = mod(floor(s.a * 16.0), 2.0);
    float th = k * 2.0 * wedge + (mirror > 0.5 ? -tb : tb) + uClock.x * 0.05;
    r *= 1.0 + 0.08 * sin(tb * 16.0 + uClock.y) + 0.12 * up * bassW;
    vec3 home = vec3(cos(th) * r, 0.2 * sin(r * 4.0 - uClock.y * 1.2) * (0.3 + uBandLv.y), sin(th) * r);
    return vec4((home - p) * 8.0, 4.0);
  }
  if (soul == 22) {
    // ── HELIX: a double spiral column ──
    float strand = step(0.5, s.b);
    float y = (s.g - 0.5) * 4.0;
    float rung = step(s.a, 0.15);
    float yq = rung > 0.5 ? floor(y * 3.0) / 3.0 : y;
    float ang = yq * 2.2 * (1.0 + 0.3 * max(uBands.x, 0.0)) + uClock.y * 0.6;
    float r = 0.55 + 0.08 * sin(yq * 3.0 + uClock.x);
    vec3 s0 = vec3(cos(ang) * r, yq, sin(ang) * r);
    vec3 s1 = vec3(cos(ang + 3.14159) * r, yq, sin(ang + 3.14159) * r);
    vec3 home = rung > 0.5 ? mix(s0, s1, fract(s.b * 7.0)) : (strand > 0.5 ? s1 : s0);
    home += (hash31(s.a * 61.0) - 0.5) * 0.04 * (1.0 + 5.0 * up * trebW);
    return vec4((home - p) * 9.0, 4.2);
  }
  if (soul == 23) {
    // ── TORUS KNOT: one thread of light tied into a turning knot ──
    float ph = s.g * 6.2831853;
    float P = 2.0, Q = 3.0;
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
      + 0.22 * cos(2.0 * th) * cos(2.0 * az + uClock.x * 0.5) * (0.3 + uBandLv.x + max(uBands.x, 0.0))
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

  vec4 f = soulForce(uSoulA, p, v, s, fid, lvl, drv);
  if (uMix > 0.001) f = mix(f, soulForce(uSoulB, p, v, s, fid, lvl, drv), uMix);

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
  if (sp2 > 3.5) v *= 3.5 / sp2;
  p += v * dt;

  if (uSnap > 0.5) { p = imgT; v = vec3(0.0); }

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
uniform float uSat;        // saturation multiplier
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
  float sparse = 1.0 - clamp(uDensity * 8.0, 0.0, 1.0); // sparse fields: fewer, bigger, brighter motes
  float boost = mix(1.0, 3.2, sparse) * (uDensity < 0.0005 ? 1.9 : 1.0);
  boost = mix(boost, 1.0, uImgShow);
  // bass = heavier motes, treble = the finest dust
  float size = mix(1.55, 0.5, band) * (0.65 + 0.7 * s.b * s.b) * uPointPx * (uFocal / clip.w) * boost * mix(uSize, 1.0, uImgShow);
  float a = uAlpha;
  if (size < 1.0) { a *= size * size; size = 1.0; }
  gl_PointSize = min(size, 32.0);

  vec3 col = band < 0.5 ? mix(uPalLow, uPalMid, band * 2.0) : mix(uPalMid, uPalHigh, band * 2.0 - 1.0);
  col = mix(col, uPalHigh, clamp(length(v.xyz) * 0.12, 0.0, 0.25));
  col = hueSat(col, uHue + (band - 0.5) * 0.15 * uSat, uSat);

  float life = lifeOf(s);
  float fade = smoothstep(0.0, 1.0, p.w) * smoothstep(life, life - 1.5, p.w);
  a *= mix(1.0, fade, smoothstep(0.0, 0.5, uSmokeW + uInkW));
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
  float g = exp(-r2 * 3.6);
  o = vec4(vCol * g, 1.0);
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
uniform float uLod;
uniform float uExposure;
out vec4 o;
void main(){
  vec2 uv = gl_FragCoord.xy / 16.0;
  vec3 h = textureLod(uHdr, uv, uLod).rgb;
  vec3 t = 1.0 - exp(-h * uExposure);
  float L = dot(t, vec3(0.2126, 0.7152, 0.0722));
  o = vec4(L, 0.0, 0.0, 1.0);
}
`;

export const COMP_FS = /* glsl */ `#version 300 es
precision highp float;
uniform sampler2D uHdr;
uniform float uExposure;
uniform float uTransparent; // 1 = premultiplied alpha = brightest channel
out vec4 o;
// interleaved-gradient dither (Jimenez) — kills 8-bit banding in the glow
// falloff; gated off on pure black so the floor stays RGB 0,0,0.
float ign(vec2 p){ return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
void main(){
  ivec2 c = ivec2(gl_FragCoord.xy);
  vec3 h = texelFetch(uHdr, c, 0).rgb;
  vec3 t = 1.0 - exp(-h * uExposure);
  vec3 srgb = pow(t, vec3(1.0 / 2.2));
  srgb += (ign(gl_FragCoord.xy) - 0.5) / 255.0 * step(0.002, max(t.r, max(t.g, t.b)));
  srgb = max(srgb, 0.0);
  // transparent: black is fully see-through and light composites additively
  // (premultiplied, alpha = brightest channel) over whatever lies beneath
  o = uTransparent > 0.5 ? vec4(srgb, max(srgb.r, max(srgb.g, srgb.b))) : vec4(srgb, 1.0);
}
`;
