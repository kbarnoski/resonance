import { U, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG =
  U +
  VISIONARY_PALETTE +
  ROT2 +
  `
// Mobius transformation for hyperbolic geometry
vec2 mobiusTransform(vec2 z, vec2 w) {
  // (z - w) / (1 - conj(w) * z)
  // Complex division: (a+bi)/(c+di)
  vec2 num = vec2(z.x - w.x, z.y - w.y);
  vec2 wConj = vec2(w.x, -w.y);
  vec2 den = vec2(1.0 - (wConj.x * z.x - wConj.y * z.y),
                  -(wConj.x * z.y + wConj.y * z.x));
  float denLenSq = dot(den, den);
  return vec2(
    (num.x * den.x + num.y * den.y) / denLenSq,
    (num.y * den.x - num.x * den.y) / denLenSq
  );
}

// Complex multiplication
vec2 cmul(vec2 a, vec2 b) {
  return vec2(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x);
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.1;
  float paletteShift = u_amplitude * 0.3;

  vec3 color = vec3(0.0);

  // Map UV to the Poincare disk
  vec2 p = uv * 1.8;
  float r = length(p);

  // Disk boundary
  float diskEdge = smoothstep(1.02, 0.98, r);
  float diskRim = smoothstep(1.0, 0.96, r) * smoothstep(0.94, 0.98, r);

  if (r < 0.99) {
    // Apply a Mobius transformation for camera movement in hyperbolic space
    float moveR = 0.2 + u_bass * 0.1;
    vec2 moveDir = vec2(cos(t * 0.4), sin(t * 0.4)) * moveR;
    p = mobiusTransform(p, moveDir);

    // Hyperbolic distance from origin
    float pLen = length(p);
    float clamped = min(pLen, 0.999);
    float hypDist = 2.0 * (0.5 * log((1.0 + clamped) / (1.0 - clamped)));

    // Hyperbolic angle
    float hypAngle = atan(p.y, p.x);

    // Tiling: {p,q} tessellation in hyperbolic space
    // Use {7,3} — heptagonal tiling (7 sides, 3 meeting at vertex)
    // Approximate with polar-hyperbolic coordinates

    // Hyperbolic "rings" — concentric circles in hyperbolic space
    float ringScale = 1.2;
    float ring = fract(hypDist * ringScale - t * 0.2);
    float ringLine = smoothstep(0.04, 0.0, abs(ring - 0.5) - 0.46);

    // Angular divisions that increase with hyperbolic distance
    // This creates the shrinking-toward-boundary effect
    float angularN = 7.0; // heptagonal
    float angDiv = fract(hypAngle / 6.28318 * angularN + t * 0.05);
    float angLine = smoothstep(0.03, 0.0, abs(angDiv - 0.5) - 0.46);

    // Secondary angular divisions (subdivisions create Escher-like tiling)
    float subAngN = angularN * 2.0;
    float subAngDiv = fract(hypAngle / 6.28318 * subAngN + t * 0.08);
    float subAngLine = smoothstep(0.02, 0.0, abs(subAngDiv - 0.5) - 0.47);

    // Radial arcs (geodesics in hyperbolic space are circular arcs)
    // Multiple arc families at different orientations
    float arcAccum = 0.0;
    for (int i = 0; i < 7; i++) {
      float fi = float(i);
      float arcAngle = fi * 6.28318 / 7.0 + t * 0.06;

      // Geodesic arc center and radius in Poincare disk
      vec2 arcDir = vec2(cos(arcAngle), sin(arcAngle));

      // Transform point relative to this arc
      vec2 rp = rot2(-arcAngle) * p;

      // Hyperbolic geodesic: x^2 + (y-c)^2 = c^2 + 1 (orthogonal to boundary)
      float cVal = 1.5 + sin(t * 0.3 + fi * 0.9) * 0.3;
      float arcR = sqrt(cVal * cVal + 1.0);
      float arcDist = abs(length(rp - vec2(0.0, cVal)) - arcR);

      // Thickness decreases toward boundary (visual shrinking)
      float thickness = 0.02 * (1.0 - pLen * pLen);
      arcAccum += smoothstep(thickness * 3.0, 0.0, arcDist);
    }

    // Combine tiling lines
    float tileLines = max(max(ringLine, angLine), subAngLine);
    tileLines = max(tileLines, min(arcAccum, 1.0) * 0.7);

    // Tile fill color: based on which cell we're in
    float cellId = floor(hypDist * ringScale) * angularN + floor(hypAngle / 6.28318 * angularN);
    vec3 tileCol = palette(
      cellId * 0.07 + t * 0.15 + paletteShift,
      vec3(0.5, 0.5, 0.5),
      vec3(0.5, 0.4, 0.6),
      vec3(1.0, 0.8, 0.5),
      vec3(0.0, 0.1, 0.3)
    );

    // Fill tiles with subtle color, brighter near center
    float fillBright = 0.15 * (1.0 - pLen * 0.8);
    fillBright *= (0.7 + 0.3 * sin(cellId * 3.7 + t * 2.0 + u_mid * 2.0));
    color += tileCol * fillBright;

    // Edge color
    vec3 edgeCol = palette(
      hypDist * 0.5 + t * 0.3 + paletteShift + 0.3,
      vec3(0.7, 0.7, 0.8),
      vec3(0.5, 0.4, 0.6),
      vec3(0.7, 0.9, 1.0),
      vec3(0.05, 0.1, 0.35)
    );

    // Lines fade toward boundary (infinitely thin at edge)
    float edgeFade = (1.0 - pLen * pLen);
    color += edgeCol * tileLines * 0.8 * edgeFade;

    // Central glow
    float centerGlow = smoothstep(0.5, 0.0, hypDist) * 0.15;
    vec3 centerCol = palette(
      t * 0.4 + paletteShift + 0.5,
      vec3(0.6, 0.6, 0.7),
      vec3(0.4, 0.3, 0.5),
      vec3(0.8, 0.6, 1.0),
      vec3(0.0, 0.05, 0.2)
    );
    color += centerCol * centerGlow;

    // Treble: sparkle at tile vertices
    float vertexDist = min(abs(ring - 0.5) - 0.46, abs(angDiv - 0.5) - 0.46);
    float vertexSpark = smoothstep(0.02, 0.0, -vertexDist) * u_treble * edgeFade;
    color += vec3(1.0, 0.95, 0.88) * vertexSpark * 0.6;

    // Infinity shimmer near boundary
    float boundaryShimmer = smoothstep(0.7, 0.99, pLen);
    float shimmer = sin(hypAngle * 20.0 + t * 5.0) * 0.5 + 0.5;
    vec3 shimmerCol = palette(
      hypAngle * 0.5 + t * 0.2 + paletteShift + 0.7,
      vec3(0.3, 0.3, 0.4),
      vec3(0.2, 0.2, 0.4),
      vec3(0.5, 0.7, 1.0),
      vec3(0.1, 0.1, 0.3)
    );
    color += shimmerCol * boundaryShimmer * shimmer * 0.2;
  }

  // Disk boundary ring
  vec3 rimCol = palette(
    atan(uv.y, uv.x) * 0.5 + t * 0.2 + paletteShift + 0.1,
    vec3(0.6, 0.6, 0.7),
    vec3(0.4, 0.3, 0.5),
    vec3(0.8, 0.7, 1.0),
    vec3(0.0, 0.1, 0.3)
  );
  color += rimCol * diskRim * 1.5;

  // Vignette
  float vign = 1.0 - smoothstep(0.5, 1.5, length(uv));
  color *= vign;

  gl_FragColor = vec4(color, 1.0);
}
`;
