// ─────────────────────────────────────────────────────────────────────────────
// 2114 · Hyperbolic Curvature — WebGL2 raymarch shader source.
//
// The whole piece hangs on ONE dial: κ (curvature). At κ=0 the raymarched
// field is a calm, open, near-Euclidean lattice (a positive-scale Mandelbox
// tiling reads as regular boxy cells). As κ rises the box/sphere fold flips
// toward a negative scale with tighter inversion radius — space CROWDS and
// FOLDS inward toward a Poincaré-disk-like boundary, proliferating jeweled
// cells with "more axes than reality allows." Structure BUILDS UP; it never
// dissolves. Shading is thin-film IRIDESCENCE + an N-fold kaleidoscope glow.
//
// NOTE: this deliberately does NOT use an inverse log-polar / exp() form-
// constant warp (banned this cycle). The curvature engine is a folded
// distance-estimator (Mandelbox-family KIFS) whose parameters interpolate
// Euclidean → hyperbolic, which is the sanctioned "saddle / Poincaré" target.
// ─────────────────────────────────────────────────────────────────────────────

export const VERT_GLSL = `#version 300 es
in vec2 p;
void main(){ gl_Position = vec4(p, 0.0, 1.0); }`;

export const FRAG_GLSL = `#version 300 es
precision highp float;
out vec4 frag;

uniform vec2  uRes;
uniform float uTime;   // seconds (render animation only — not autopilot state)
uniform float uKappa;  // 0 = Euclidean tiling .. 1 = hyperbolic proliferation
uniform float uEnergy; // recent strike energy 0..~1 (blooms brightness + bend)
uniform float uRot;    // accumulated rotation nudged by keys
uniform float uPitch;  // last struck pitch, normalized 0..1 (palette shift)
uniform float uLum;    // safe-flicker luminance multiplier (<=3Hz drift, [floor,1])

const float PI = 3.14159265359;

mat2 rot(float a){ float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }

// N-fold kaleidoscope fold in a plane — the "more axes than reality allows"
// symmetry. Fold count grows with curvature so new axes bloom as κ rises.
void kfold(inout vec2 v, float n){
  float a = atan(v.y, v.x);
  float r = length(v);
  float seg = 2.0 * PI / n;
  a = mod(a + 0.5 * seg, seg) - 0.5 * seg;
  a = abs(a);
  v = vec2(cos(a), sin(a)) * r;
}

// Curvature-warped folded distance estimator.
//  k -> 0 : SCALE positive & open  -> regular, calm, Euclidean-ish cells.
//  k -> 1 : SCALE negative & tight -> crowded inward-folding hyperbolic tiling.
// Returns (distance, iteration-glow) packed in vec2.
vec2 field(vec3 p, float k){
  vec3 seed = p;
  float dr = 1.0;
  float SCALE  = mix(2.05, -1.85, smoothstep(0.0, 1.0, k)); // Euclidean -> hyperbolic fold
  float minR2  = mix(0.55, 0.16, k);                        // inversion crowds toward a boundary
  float krot   = k * 0.55;                                   // extra kaleidoscopic axes with κ
  float nfold  = 5.0 + floor(k * 4.0);                       // {5..9}-fold symmetry blooms
  float glow   = 0.0;
  float d = 1e9;

  for (int i = 0; i < 8; i++){
    // box fold (fold limit 1)
    p = clamp(p, -1.0, 1.0) * 2.0 - p;
    // sphere fold — the conformal inversion that produces hyperbolic crowding
    float r2 = dot(p, p);
    if (r2 < minR2){ float t = 1.0 / minR2; p *= t; dr *= t; }
    else if (r2 < 1.0){ float t = 1.0 / r2; p *= t; dr *= t; }
    // kaleidoscope axes between iterations (0 axes added at κ=0)
    p.xy *= rot(krot);
    p.yz *= rot(krot * 0.6);
    vec2 pxz = p.xz;      // inout cannot take a swizzle → use a temp
    kfold(pxz, nfold);
    p.x = pxz.x; p.z = pxz.y;
    // affine step
    p = SCALE * p + seed;
    dr = dr * abs(SCALE) + 1.0;
    // jewel shell at this scale level
    float shell = (length(p) - mix(1.15, 0.62, k)) / dr;
    d = min(d, shell);
    glow += 1.0 / (1.0 + shell * shell * 42.0);
  }
  return vec2(d, glow);
}

float mapD(vec3 p, float k){ return field(p, k).x; }

vec3 calcNormal(vec3 p, float k){
  vec2 e = vec2(0.0009, 0.0);
  return normalize(vec3(
    mapD(p + e.xyy, k) - mapD(p - e.xyy, k),
    mapD(p + e.yxy, k) - mapD(p - e.yxy, k),
    mapD(p + e.yyx, k) - mapD(p - e.yyx, k)
  ));
}

// Thin-film iridescence — spectral interference biased toward a neon-jeweled
// blue / green / magenta gamut. thickness & view angle set the shimmer phase.
vec3 thinFilm(float ct, float thickness, float hue){
  float phase = thickness * (1.0 - ct) * 9.0 + hue * 6.28318 + uTime * 0.15;
  vec3 c;
  c.r = 0.5 + 0.5 * sin(phase + 4.9);  // magenta lobe
  c.g = 0.5 + 0.5 * sin(phase + 2.3);  // electric green lobe
  c.b = 0.5 + 0.5 * sin(phase + 0.4);  // electric blue lobe
  // lift blues/greens so it reads jeweled rather than muddy
  c = pow(c, vec3(1.35, 1.1, 0.85));
  return c;
}

void main(){
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;

  // effective curvature: slider κ plus a gentle bloom from recent strikes.
  float k = clamp(uKappa + uEnergy * 0.13, 0.0, 1.0);

  // camera — slow drift + key-nudged rotation. Motion is deliberately slow
  // (no fast luminance flips → photosensitive-safe).
  float t = uTime * 0.06 + uRot;
  vec3 ro = vec3(0.0, 0.0, 3.4);
  vec3 rd = normalize(vec3(uv, -1.35));
  rd.xz *= rot(t * 0.5);
  rd.xy *= rot(sin(t * 0.37) * 0.25 + uRot * 0.5);
  ro.xz *= rot(t * 0.5);

  // raymarch
  float dist = 0.0;
  float glowAcc = 0.0;
  bool hit = false;
  vec3 pos = ro;
  for (int i = 0; i < 96; i++){
    pos = ro + rd * dist;
    vec2 fd = field(pos, k);
    float d = fd.x;
    glowAcc += fd.y / (1.0 + dist * dist * 1.6);
    if (d < 0.0012){ hit = true; break; }
    dist += d * 0.72;             // slightly under-relaxed for the folded DE
    if (dist > 9.0) break;
  }

  vec3 col = vec3(0.0);
  float hue = uPitch + 0.55 + k * 0.2;

  if (hit){
    vec3 n = calcNormal(pos, k);
    vec3 v = -rd;
    float ct = clamp(dot(n, v), 0.0, 1.0);
    float fres = pow(1.0 - ct, 3.0);

    float thickness = 0.6 + 0.4 * sin(pos.x * 2.0 + pos.y * 1.7 + pos.z * 2.3);
    vec3 film = thinFilm(ct, thickness, hue);

    // key light + ambient wrap
    vec3 lig = normalize(vec3(0.6, 0.8, 0.4));
    float dif = clamp(0.5 + 0.5 * dot(n, lig), 0.0, 1.0);
    float spec = pow(clamp(dot(reflect(-lig, n), v), 0.0, 1.0), 24.0);

    col = film * (0.35 + 0.65 * dif);
    col += film * fres * 1.4;               // iridescent rim
    col += vec3(0.7, 0.85, 1.0) * spec * 0.6;
    // ambient occlusion from march depth — deep crowded folds read darker/richer
    col *= mix(1.0, 0.55, clamp(dist / 9.0, 0.0, 1.0));
  } else {
    // background: deep violet void, so the jewels float in space
    col = mix(vec3(0.02, 0.01, 0.05), vec3(0.05, 0.03, 0.12), uv.y * 0.5 + 0.5);
  }

  // volumetric proliferation glow — the bloom that BUILDS as κ / energy rise
  vec3 glowCol = thinFilm(0.5, 0.7, hue + 0.15);
  col += glowCol * glowAcc * (0.006 + 0.010 * k) * (0.7 + uEnergy * 0.9);

  // strike bloom lift
  col += glowCol * uEnergy * 0.12;

  // tone + safe luminance drift (uLum is a <=3Hz gentle multiplier)
  col = col / (1.0 + col * 0.75);           // reinhard-ish
  col = pow(col, vec3(0.82));
  col *= uLum;

  frag = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

export const UNIFORM_NAMES = [
  "uRes",
  "uTime",
  "uKappa",
  "uEnergy",
  "uRot",
  "uPitch",
  "uLum",
] as const;
