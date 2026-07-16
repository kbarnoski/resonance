// 1770-dmt-hyperbolic — GLSL for the Poincaré-disk hyperbolic tiling.
//
// A full-viewport fragment shader that folds every pixel of the unit disk into
// the fundamental triangle of a (2,7,q) reflection group — a {7,q} hyperbolic
// tiling (heptagons, q per vertex). q drifts between 3 and 4 (mids), a Möbius
// automorphism of the disk drifts the whole tiling toward the boundary (bass),
// saddle-curvature folds ripple it like a bedsheet, and an iridescent thin-film
// palette with edge chromatic aberration (highs) paints it.
//
// The fold is exact: two mirror lines (angles 0 and π/7) plus one mirror circle
// orthogonal to the unit circle. Circle-inversion count → tile ring index.

export const VERT = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  void main() {
    vUv = position.xy;              // fullscreen quad in clip space [-1,1]
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

export const FRAG = /* glsl */ `
  precision highp float;

  varying vec2 vUv;

  uniform vec2  uRes;
  uniform float uTime;     // deterministic seconds = frame / 60
  uniform float uBass;     // 0..1  → Möbius drift speed + fold depth
  uniform float uMid;      // 0..1  → curvature / apparent {7,q} density
  uniform float uHigh;     // 0..1  → chromatic aberration + fine iridescence
  uniform float uLoud;     // 0..1  → saturation + neural gain
  uniform float uArc;      // 0..1  → journey (onset→come-up→breakthrough→return)
  uniform float uReduced;  // 1.0 if prefers-reduced-motion

  const float PI = 3.14159265359;
  const float P  = 7.0;            // heptagons
  const float ANG = PI / 7.0;      // π/p — fundamental wedge half-angle

  // ── complex helpers ────────────────────────────────────────────────────────
  vec2 cmul(vec2 a, vec2 b){ return vec2(a.x*b.x - a.y*b.y, a.x*b.y + a.y*b.x); }
  vec2 cdiv(vec2 a, vec2 b){ float d = dot(b,b); return vec2(a.x*b.x + a.y*b.y, a.y*b.x - a.x*b.y) / d; }

  // Disk automorphism (Möbius): rotate by θ, then translate by a (|a|<1).
  //   m(z) = e^{iθ} · (z - a) / (1 - conj(a)·z)
  vec2 mobius(vec2 z, vec2 a, float th){
    vec2 num = z - a;
    vec2 den = vec2(1.0, 0.0) - cmul(vec2(a.x, -a.y), z);
    vec2 w = cdiv(num, den);
    float c = cos(th), s = sin(th);
    return vec2(c*w.x - s*w.y, s*w.x + c*w.y);
  }

  // IQ cosine palette — neon iridescent.
  vec3 pal(float t, vec3 ph){
    return 0.5 + 0.5 * cos(6.28318 * (t + ph));
  }

  void main(){
    // pixel → centered, aspect-correct disk coordinate
    vec2 frag = (vUv * 0.5 + 0.5) * uRes;
    vec2 uv = (2.0 * frag - uRes) / min(uRes.x, uRes.y);
    float R0 = length(uv);

    // Outside the Poincaré disk → the boundary circle "at infinity".
    if (R0 >= 0.999){
      // faint iridescent rim, no hard edge (safety: gentle, low luminance)
      float rim = smoothstep(1.06, 0.999, R0);
      vec3 rimC = pal(0.6 + 0.1*uHigh, vec3(0.0,0.33,0.67)) * rim * 0.12;
      gl_FragColor = vec4(rimC, 1.0);
      return;
    }

    // motion amplitude damped under reduced-motion
    float amp = mix(1.0, 0.4, uReduced);

    // ── Möbius drift toward the boundary (exponential area growth) ────────────
    // bass pushes the translation magnitude; a slow seeded orbit sets direction.
    float drift = (0.16 + 0.55 * uBass) * (0.3 + 0.7 * uArc) * amp;
    float t = uTime * (0.05 + 0.05 * uBass);
    vec2 a = drift * 0.62 * vec2(cos(t*0.7), sin(t*0.53));
    float th = uTime * 0.03 * amp + 1.2 * uMid;
    vec2 z = mobius(uv, a, th);

    // ── saddle-curvature fold: hyperbolic "bedsheet in the wind" ──────────────
    // a smooth saddle (x²−y²) warp whose phase blows across the sheet over time.
    float sAmp = (0.05 + 0.22 * uArc + 0.10 * uBass) * amp;
    float saddle = (z.x*z.x - z.y*z.y);
    float wind = sin(3.0*z.x + uTime*0.6) * cos(3.0*z.y - uTime*0.4);
    z += sAmp * vec2(saddle * wind, 2.0*z.x*z.y * wind) * (0.5);
    // keep inside the disk after warping
    float rz = length(z);
    if (rz > 0.995) z *= 0.995 / rz;

    // ── mirror-circle geometry for {7,q} with q drifting 3↔4 (mids) ───────────
    float q = mix(3.0, 4.0, clamp(0.15 + 0.8*uMid, 0.0, 1.0));
    float k = cos(PI/q) / sin(ANG);
    float denom = sqrt(max(k*k - 1.0, 1e-4));
    float rC = 1.0 / denom;           // mirror-circle radius
    float dC = k / denom;             // mirror-circle center on +x axis
    vec2  Pc = vec2(dC, 0.0);
    float rC2 = rC * rC;

    // ── fold z into the fundamental triangle ─────────────────────────────────
    float inv = 0.0;   // inversion count → tile ring
    float folds = 0.0;
    for (int i = 0; i < 26; i++){
      // fold angle into the wedge [0, π/7] (dihedral of the p-fold vertex)
      float ang = atan(z.y, z.x);
      float rad = length(z);
      float per = 2.0 * ANG;
      ang = mod(ang, per);
      if (ang < 0.0) ang += per;
      if (ang > ANG) ang = per - ang;   // reflect across the π/7 line
      z = rad * vec2(cos(ang), sin(ang));
      // reflect (invert) across the mirror circle if inside it
      vec2 zp = z - Pc;
      float d2 = dot(zp, zp);
      if (d2 < rC2){
        z = Pc + zp * (rC2 / d2);
        inv += 1.0;
      } else {
        folds += 1.0;
        if (folds > 2.0) break;         // settled in the fundamental domain
      }
    }

    // ── shape fields inside the fundamental triangle ─────────────────────────
    vec2 zp = z - Pc;
    float dOmega = length(zp) - rC;              // >0, distance past the edge geodesic
    float wedge  = atan(z.y, z.x) / ANG;          // 0..1 across the wedge
    float ring   = inv;                            // discrete tile depth
    float hypR   = length(z);                      // 0..1 hyperbolic radius of folded pt

    // heptagon cell walls (neon filaments where the geodesic mirrors meet)
    float wall = smoothstep(0.11, 0.0, dOmega)
               + smoothstep(0.06, 0.0, abs(fract(wedge) - 0.0))
               + smoothstep(0.06, 0.0, abs(fract(wedge) - 1.0));
    wall = clamp(wall, 0.0, 1.0);

    // ── iridescent thin-film color ───────────────────────────────────────────
    // palette phase from tile ring + hyperbolic radius + a slow global cycle.
    // global cycle held ≤ ~0.15 Hz so luminance never modulates fast (safety).
    float cyc = uTime * 0.09;
    float base = ring * 0.14 + hypR * 0.6 + wedge * 0.12 + cyc;
    float film = 0.5 + 0.5 * sin(base * 6.28318 + saddle * 3.0);

    // chromatic aberration near the boundary, scaled by highs
    float edge = smoothstep(0.35, 1.0, R0);
    float ab = (0.015 + 0.06 * uHigh) * edge * amp;
    vec3 phase = vec3(0.0, 0.33, 0.67);
    vec3 col;
    col.r = pal(base - ab, phase).r;
    col.g = pal(base,      phase).g;
    col.b = pal(base + ab, phase).b;
    col = mix(col, col.gbr, 0.35 * film);   // thin-film hue rotation

    // neural gain: saturation + brightness rise with loudness / breakthrough
    float gain = 0.55 + 0.7 * uLoud + 0.5 * uArc;
    col *= gain;

    // neon filaments picked out in a shifted iridescent hue
    vec3 neon = pal(base + 0.5 + 0.2*uHigh, phase);
    col = mix(col, neon * (1.2 + uLoud), wall * (0.5 + 0.4*uArc));

    // infinite-regress darkening toward the boundary + fine iridescent detail
    float fine = 0.5 + 0.5 * sin(ring * 2.0 + hypR * 40.0 * uHigh + cyc*4.0);
    col += 0.06 * uHigh * fine * edge;
    col *= mix(1.0, 0.35, edge * (0.6 - 0.4*uArc));   // regress fade, less at peak

    // saturation lift from loudness (push toward ultra-saturated)
    float lum = dot(col, vec3(0.299, 0.587, 0.114));
    col = mix(vec3(lum), col, 1.0 + 0.6 * uLoud);

    // gentle onset veil: at the very start (low arc) stay faint / low entropy
    col *= mix(0.35, 1.0, smoothstep(0.0, 0.25, uArc));

    // tone map + clamp (keep peak luminance civilised, no strobe headroom abuse)
    col = col / (1.0 + col);
    col = pow(clamp(col, 0.0, 1.0), vec3(0.85));

    gl_FragColor = vec4(col, 1.0);
  }
`;
