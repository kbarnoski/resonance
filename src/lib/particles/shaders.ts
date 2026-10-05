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
layout(location = 0) out vec4 oPos;
layout(location = 1) out vec4 oVel;
${NOISE}

float lifeOf(vec4 s){ return 6.0 + 9.0 * s.g; }

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
    vec3 a = (home - p) * 7.0;
    a += curlNoise(p * 1.7 + vec3(0.0, uClock.y * 0.12, 0.0)) * (0.2 + 1.3 * up * midW) * 0.25;
    a += (hash31(s.a * 1e3 + floor(uTime * 24.0)) - 0.5) * 22.0 * up * trebW;
    return vec4(a, 3.2);
  }
  if (soul == 1) {
    // ── SMOKE OF LIGHT: a curl-noise current rising like breath ──
    vec3 q = p * 0.85 + vec3(0.0, -uClock.y * 0.16, uClock.x * 0.06);
    vec3 c = curlNoise(q) * 0.22 * (0.55 + 1.7 * up * midW + 0.7 * uSwell);
    vec3 tv = c + vec3(0.0, 0.2 + 0.5 * max(uBands.x, 0.0) * (0.5 + bassW), 0.0);
    tv += curlNoise(p * 3.1 + uClock.z * 0.2) * 0.25 * up * trebW;
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
    float th = site * 2.39996323 + uClock.y * 0.12 * (1.2 - sf)
             + (1.0 - open) * 3.2 * (1.0 - sf);
    float r = sqrt(sf) * 1.55 * open * (1.0 + 0.08 * uBands.x + 0.3 * up * bassW);
    float cup = (1.0 - open) * 1.1;
    float y = cup * r * r - 0.25 * cup
            + 0.07 * sin(r * 8.0 - uClock.x * 1.6) * (0.4 + 0.6 * uBandLv.x);
    vec3 jit = (hash31(s.a * 4093.0) - 0.5) * (0.012 + 0.03 * r);
    vec3 home = vec3(cos(th) * r, y, sin(th) * r) + jit;
    home.y += (hash31(s.a * 1e3 + floor(uTime * 20.0)).x - 0.5) * 0.24 * up * trebW;
    vec3 a = (home - p) * 6.0;
    return vec4(a, 3.4);
  }
  // ── MURMURATION: a lagged ribbon chasing a wandering leader ──
  float t = uClock.x * 0.55 - s.g * 4.5;
  vec3 lead = vec3(sin(t * 0.61) * 1.25 + sin(t * 0.23) * 0.3,
                   sin(t * 0.47 + 1.0) * 0.45,
                   sin(t * 0.39 + 2.0) * 0.95);
  vec3 h = hash31(s.a * 2971.0) - 0.5;
  float spread = 0.55 + 0.25 * uSwell;
  vec3 off = vec3(h.x * 1.6, h.y * 0.25, h.z * 1.6) * spread;
  vec3 target = lead + off;
  vec3 desired = (target - p) * (2.0 + 1.2 * max(uBands.x, 0.0));
  vec3 a = (desired - v) * (1.4 + 1.6 * s.b);
  a += curlNoise(p * 1.1 + uClock.y * 0.08) * (0.3 + 1.8 * up * midW) * 0.5;
  a += (hash31(s.a * 1e3 + floor(uTime * 22.0)) - 0.5) * 16.0 * up * trebW * step(0.8, s.b);
  return vec4(a, 0.0);
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
  float rate = 1.0 + clamp(drv, -0.7, 1.0) * mix(1.25, 0.75, s.r);
  float dt = uDt * rate;

  vec4 f = soulForce(uSoulA, p, v, s, fid, lvl, drv);
  if (uMix > 0.001) f = mix(f, soulForce(uSoulB, p, v, s, fid, lvl, drv), uMix);

  v += f.xyz * dt;
  v *= exp(-f.w * dt);
  float sp2 = length(v);
  if (sp2 > 3.5) v *= 3.5 / sp2;
  p += v * dt;

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
out vec3 vCol;
float lifeOf(vec4 s){ return 6.0 + 9.0 * s.g; }
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
  // bass = heavier motes, treble = the finest dust
  float size = mix(1.55, 0.5, band) * (0.65 + 0.7 * s.b * s.b) * uPointPx * (uFocal / clip.w);
  float a = uAlpha;
  if (size < 1.0) { a *= size * size; size = 1.0; }
  gl_PointSize = min(size, 24.0);

  vec3 col = band < 0.5 ? mix(uPalLow, uPalMid, band * 2.0) : mix(uPalMid, uPalHigh, band * 2.0 - 1.0);
  col = mix(col, uPalHigh, clamp(length(v.xyz) * 0.12, 0.0, 0.25));

  float life = lifeOf(s);
  float fade = smoothstep(0.0, 1.0, p.w) * smoothstep(life, life - 1.5, p.w);
  a *= mix(1.0, fade, smoothstep(0.0, 0.5, uSmokeW));
  vCol = col * a;
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
  o = vec4(max(srgb, 0.0), 1.0);
}
`;
