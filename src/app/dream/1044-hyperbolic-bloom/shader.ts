/* ── 1044-hyperbolic-bloom · WebGL2 fragment shader ──────────────────────
 *
 *  Renders a Poincaré-disk hyperbolic tiling per pixel. For each fragment we
 *  map the screen to a complex point z in the unit disk, drag z backward
 *  along a hyperbolic geodesic with an inverse Möbius transform (the endless
 *  "fall toward the rim"), then fold z into one fundamental cell of a {7,3}
 *  tiling by alternating 7-fold dihedral mirror reflections with circle
 *  inversions in a circle orthogonal to the unit disk. The fold count and the
 *  cell coordinate drive a jeweled cosine palette with thin-film iridescence,
 *  chromatic aberration and dark "grout" between tiles.
 *
 *  The {7,3} fold is an honest approximation: the inverting circle is placed
 *  with the orthogonality relation |c|² − r² = 1 (so it is orthogonal to the
 *  disk boundary, the defining property of a hyperbolic geodesic), but we use
 *  a fixed inverting circle per 7-fold sector rather than solving the exact
 *  edge-reflection group. It reads convincingly as {7,3}; it is not the proven
 *  exact triangle group. See README.
 */

export const VERT_SRC = `#version 300 es
in vec2 a_pos;
void main() {
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

export const FRAG_SRC = `#version 300 es
precision highp float;
out vec4 outColor;

uniform vec2  u_res;
uniform float u_time;
uniform float u_fall;    // geodesic translation distance accumulator (radians along arc)
uniform float u_depth;   // 0..1 recursion depth scaler
uniform float u_warp;    // breathing fBm warp amplitude
uniform float u_sat;     // saturation / jewel intensity
uniform float u_chroma;  // chromatic aberration + iridescence amount
uniform float u_glow;    // emissive gain
uniform float u_peak;    // breakthrough proximity 0..1

const float PI  = 3.14159265359;
const float TAU = 6.28318530718;
const int   N   = 7;            // {7,3} : seven-fold symmetry
const float SECTOR = TAU / 7.0;

// ── complex helpers ──────────────────────────────────────────────────────
vec2 cmul(vec2 a, vec2 b) { return vec2(a.x*b.x - a.y*b.y, a.x*b.y + a.y*b.x); }
vec2 cdiv(vec2 a, vec2 b) { float d = dot(b,b); return vec2(a.x*b.x + a.y*b.y, a.y*b.x - a.x*b.y) / d; }
vec2 conj(vec2 a) { return vec2(a.x, -a.y); }

// Möbius hyperbolic translation by complex b (|b|<1):  z' = (z - b)/(1 - conj(b) z)
vec2 mobius(vec2 z, vec2 b) {
  return cdiv(z - b, vec2(1.0,0.0) - cmul(conj(b), z));
}

// 2D rotation
vec2 rot(vec2 p, float a) {
  float c = cos(a), s = sin(a);
  return mat2(c,-s,s,c) * p;
}

// cheap value-noise fBm for the breathing warp
float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f*f*(3.0-2.0*f);
  float a = hash(i), b = hash(i+vec2(1,0)), c = hash(i+vec2(0,1)), d = hash(i+vec2(1,1));
  return mix(mix(a,b,u.x), mix(c,d,u.x), u.y);
}
float fbm(vec2 p) {
  float s = 0.0, amp = 0.5;
  for (int i = 0; i < 4; i++) { s += amp * vnoise(p); p *= 2.02; amp *= 0.5; }
  return s;
}

// iridescent jeweled cosine palette
vec3 palette(float t) {
  vec3 a = vec3(0.52, 0.42, 0.55);
  vec3 b = vec3(0.48, 0.46, 0.50);
  vec3 c = vec3(1.0, 1.0, 1.0);
  vec3 d = vec3(0.00, 0.18, 0.42); // jewel phase offsets → violet/teal/gold sweep
  return a + b * cos(TAU * (c * t + d));
}

void main() {
  // screen → centred, aspect-correct coords; the disk has radius ~1
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_res) / (0.5 * min(u_res.x, u_res.y));

  // gentle breathing fBm warp on the input coords (slow LFO) → surfaces melt
  float lfo = 0.5 + 0.5 * sin(u_time * 0.18);
  vec2 wq = uv * 1.6 + vec2(0.0, u_time * 0.05);
  vec2 warp = vec2(fbm(wq), fbm(wq + 7.1)) - 0.5;
  vec2 z = uv + warp * (u_warp * (0.06 + 0.05 * lfo));

  // map the square plane into the open unit disk (keeps geometry well-behaved)
  float rr = length(z);
  z *= 1.0 / (1.0 + rr * rr * 0.42);

  // rim: points at the boundary fade to dark grout / black
  float disk = length(z);
  float rim = smoothstep(1.02, 0.985, disk); // 1 inside, 0 at/beyond the boundary

  // ── inverse Möbius for the moving viewer: a continuous hyperbolic
  //    translation along a geodesic, so tiles stream out toward the rim.
  float arc = u_fall;
  vec2 bdir = vec2(cos(arc * 0.11), sin(arc * 0.11));
  float bmag = 0.62 * (0.5 + 0.5 * sin(arc * 0.27)); // drift along the geodesic
  z = mobius(z, bdir * bmag);
  z = rot(z, u_time * 0.04);              // slow whole-field rotation

  // ── fold into the {7,3} fundamental domain ──────────────────────────────
  // inverting circle orthogonal to the unit disk: choose centre distance dC
  // and radius rC with dC*dC - rC*rC = 1 (orthogonality relation).
  float dC = 1.32;
  float rC = sqrt(dC * dC - 1.0);
  vec2  cC = vec2(dC, 0.0);

  int maxFold = int(6.0 + u_depth * 16.0); // ~6..22 iterations with depth
  float folds = 0.0;
  float edge  = 1.0;   // tracks proximity to a domain edge → grout

  for (int i = 0; i < 24; i++) {
    if (i >= maxFold) break;

    // 7-fold dihedral wedge: rotate into one sector then mirror across its bisector
    float ang = atan(z.y, z.x);
    float k = floor((ang + 0.5 * SECTOR) / SECTOR);
    z = rot(z, -k * SECTOR);
    folds += abs(k);
    // mirror about the x-axis (the wedge bisector) — the straight dihedral mirror
    if (z.y < 0.0) { z.y = -z.y; folds += 1.0; }

    // distance to the inverting circle: if inside it, invert (a geodesic reflection)
    vec2 dvec = z - cC;
    float d2 = dot(dvec, dvec);
    float r2 = rC * rC;
    // grout: darken where we sit right on the reflecting circle boundary
    edge = min(edge, abs(sqrt(d2) - rC) * 6.0);
    if (d2 < r2) {
      z = cC + dvec * (r2 / d2);   // z → c + (z-c) r²/|z-c|²
      folds += 1.0;
    } else {
      // converged into the fundamental cell — stop folding
      if (i > 1) break;
    }
  }

  // cell coordinate after folding → drives hue
  float cellPos = atan(z.y, z.x) / TAU + 0.5;
  float cellRad = length(z - cC);

  // traveling-wave phase across the field + palette cycling
  float wave = 0.12 * sin(uv.x * 3.0 + uv.y * 2.0 - u_time * 0.5);
  float hue = fract(folds * 0.07 + cellPos * 0.6 + cellRad * 0.25
                    + u_time * 0.02 + wave + arc * 0.01);

  // thin-film iridescence: a second, faster palette band mixed in
  float film = 0.5 + 0.5 * sin(cellRad * 22.0 + folds * 0.9 + u_time * 0.3);
  vec3 base = palette(hue);
  vec3 irid = palette(hue + 0.18 + 0.12 * film);
  vec3 col = mix(base, irid, u_chroma * (0.35 + 0.4 * film));

  // chromatic aberration: shift the hue per channel by a tiny amount
  float caOff = u_chroma * 0.035;
  col.r = mix(col.r, palette(hue + caOff).r, 0.6);
  col.b = mix(col.b, palette(hue - caOff).b, 0.6);

  // saturation lift toward the peak
  float lum = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(lum), col, 0.55 + 0.55 * u_sat);

  // dark grout lines along the domain edges
  float grout = smoothstep(0.0, 0.55, edge);
  col *= 0.18 + 0.82 * grout;

  // emissive bloom toward the peak + soft radial vignette opening at peak
  col *= (0.55 + 0.95 * u_glow);
  float vig = mix(0.55, 1.0, smoothstep(1.05, 0.2, disk) * (0.6 + 0.4 * u_peak));
  col *= vig;

  // fade to black grout at the rim of the disk
  col *= rim;

  // subtle filmic tone curve to keep highlights jeweled, not blown out
  col = col / (col + 0.85);
  col = pow(max(col, 0.0), vec3(0.92));

  outColor = vec4(col, 1.0);
}`;
