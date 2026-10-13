// ─── Shared GLSL for the SUN lab shaders (sun-*, 2026-10-12) ───
// Karel: "one day you'll want to explore with me some new sun themed
// shaders" — in the spirit of seraph (fine radiant light rays).
//
// Ray fields are built WITHOUT atan(): the angular pattern is gradient
// noise sampled on a circle (the pixel's unit direction × k), which is
// seamless all the way round — no branch-cut seam (see ./angle-seam) and
// no fract/mod/floor of time (see ./time-wrap.test.ts). k sets the ray
// count (≈ 2πk / noise-cell), so k = 40 gives a dense halo of fine rays.
// Every term is deep-black-floored: sunTone() rolls highlights off softly
// (no clipped plateaus) and subtracts a hair so empty space reads 0.
export const SUN_COMMON = `
float rayNoise(vec2 dir, float k, vec2 off) { return snoise(dir * k + off); }
float rayMask(float n, float lo, float hi) { float m = smoothstep(lo, hi, n); return m * m; }
float sunFbm3(vec2 p) {
  float v = 0.0, a = 0.5;
  mat2 rot = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 3; i++) { v += a * snoise(p); p = rot * p * 2.0; a *= 0.5; }
  return v;
}
vec3 sunTone(vec3 c) { return max(1.0 - exp(-c * 1.15) - 0.004, 0.0); }
`;
