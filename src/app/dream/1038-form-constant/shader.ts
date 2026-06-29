// ════════════════════════════════════════════════════════════════════════════
// Log-polar / form-constant fragment shader (WebGL2 GLSL ES 3.00)
//
// The retina -> V1 cortical map is (approximately) a complex logarithm
// (Bressloff & Cowan). So every Kluver form constant -- lattices/honeycombs,
// cobwebs, tunnels/funnels, spirals -- is ONE periodic pattern viewed through a
// log-polar warp. We take screen UV, compute cortical coords (lr = log r,
// theta = atan), and synthesize plane waves + a hex lattice there. The
// ORIENTATION of those waves in (lr, theta) space chooses the form constant;
// `formMix` sweeps continuously between them. Kaleidoscope folding on theta
// blooms a chrysanthemum. Color is a neon-iridescent IQ cosine palette with
// chromatic aberration + blue-noise visual snow.
// ════════════════════════════════════════════════════════════════════════════

export const VERT_SRC = `#version 300 es
precision highp float;
in vec2 aPos;
void main() {
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`;

export const FRAG_SRC = `#version 300 es
precision highp float;
out vec4 fragColor;

uniform vec2  uRes;
uniform float uTime;
uniform float uFlow;      // bass -> global flow / warp amplitude
uniform float uFormMix;   // mids -> form-constant morph (0..1 sweeps the four)
uniform float uFold;      // mids -> kaleidoscope fold count (continuous)
uniform float uDetail;    // highs -> fine spatial detail
uniform float uGrain;     // highs -> visual-snow alpha
uniform float uSat;       // loudness -> saturation / neural gain
uniform float uEntropy;   // journey arc 0..1 -> octaves / looseness / warmth
uniform float uLevel;     // smoothed overall loudness (breathing)

const float TAU = 6.28318530718;

// IQ cosine palette: a + b*cos(2pi*(c*t + d))
vec3 palette(float t, vec3 d) {
  vec3 a = vec3(0.52, 0.42, 0.58);
  vec3 b = vec3(0.48, 0.50, 0.46);
  vec3 c = vec3(1.0, 1.05, 1.15);
  return a + b * cos(TAU * (c * t + d));
}

// cheap hash for blue-ish noise grain
float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 345.45));
  p += dot(p, p + 34.345);
  return fract(p.x * p.y);
}

// Sample the form-constant scalar field at a given radial offset (for chromatic
// aberration we call this 3x at slightly different radii).
float patternField(vec2 uv, float radialOffset) {
  float r = length(uv) * (1.0 + radialOffset);
  r = max(r, 1e-4);

  float theta = atan(uv.y, uv.x);

  // ---- N-fold kaleidoscope folding on theta (blooms the chrysanthemum) ----
  float fold = max(uFold, 1.0);
  float seg = TAU / fold;
  float a = mod(theta, seg);
  a = abs(a - 0.5 * seg);          // mirror within each wedge
  // symmetry "looseness" rises with entropy: let the fold drift a little
  a += (uEntropy * 0.18) * sin(theta * 3.0 + uTime * 0.21);

  // ---- forward log-polar (cortical) coordinates ----
  float lr = log(r);
  float thetaC = a;

  // cortical-space frequency scales with detail (highs)
  float freqL = 7.0 + uDetail * 9.0 + uEntropy * 3.0;
  float freqT = (fold * 0.5) + uDetail * 4.0;

  // traveling-wave phase (bass-driven flow = the sense of motion / tunnel pull)
  float phase = uTime * (0.6 + uFlow * 2.4);

  // ---- choose form constant by wave orientation in (lr, theta) space ----
  // formMix 0.00 : stripes along theta  -> concentric rings / TUNNEL
  // formMix 0.33 : diagonal            -> SPIRAL
  // formMix 0.66 : stripes along lr     -> radial spokes / FUNNEL
  // formMix 1.00 : hex lattice          -> HONEYCOMB
  float m = clamp(uFormMix, 0.0, 1.0);

  // tunnel: rings move inward with phase
  float wTunnel = sin(lr * freqL - phase);

  // spiral: couple lr and theta
  float spiralK = 2.0 + uEntropy * 2.0;
  float wSpiral = sin(lr * freqL + thetaC * (freqT + spiralK) - phase);

  // funnel: spokes along radius
  float wFunnel = sin(thetaC * (freqT + 6.0) + phase * 0.5)
                * 0.7 + sin(lr * (freqL * 0.4) - phase) * 0.3;

  // honeycomb: hex lattice = sum of 3 plane waves at 60 deg in cortical space
  vec2 cc = vec2(lr * freqL * 0.5, thetaC * (freqT + 4.0));
  float h1 = sin(dot(cc, vec2(1.0, 0.0)) - phase);
  float h2 = sin(dot(cc, vec2(-0.5, 0.8660254)) - phase);
  float h3 = sin(dot(cc, vec2(-0.5, -0.8660254)) - phase);
  float wHex = (h1 + h2 + h3) / 3.0;

  // blend through the four form constants across formMix (smooth, never abrupt)
  float seg4 = 1.0 / 3.0;
  float v;
  if (m < seg4) {
    v = mix(wTunnel, wSpiral, smoothstep(0.0, seg4, m));
  } else if (m < 2.0 * seg4) {
    v = mix(wSpiral, wFunnel, smoothstep(seg4, 2.0 * seg4, m));
  } else {
    v = mix(wFunnel, wHex, smoothstep(2.0 * seg4, 1.0, m));
  }

  // entropy adds a slow second octave (drift / breathing detail)
  float oct = sin(lr * (freqL * 2.03) + thetaC * 1.7 - phase * 1.3);
  v = mix(v, mix(v, oct, 0.5), uEntropy * 0.6);

  // breathing from loudness
  v += uLevel * 0.25 * sin(lr * 3.0 - uTime * 0.8);

  return v;
}

void main() {
  // centered, aspect-corrected UV
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / min(uRes.x, uRes.y);

  // gentle radial warp pulled by flow (bass) for the "being drawn in" feel
  float r0 = length(uv);
  uv *= 1.0 + uFlow * 0.12 * sin(r0 * 8.0 - uTime * 1.5);

  // ---- chromatic aberration: sample field at 3 offset radii for R/G/B ----
  float ca = 0.006 + uFlow * 0.02 + uEntropy * 0.01;
  float fr = patternField(uv, -ca);
  float fg = patternField(uv,  0.0);
  float fb = patternField(uv,  ca);

  // map field -> palette parameter (slow hue cycle + entropy warmth)
  float hueShift = uTime * 0.03 + uEntropy * 0.25;
  vec3 dR = vec3(0.00, 0.10, 0.20) + hueShift;
  float tR = fr * 0.5 + 0.5;
  float tG = fg * 0.5 + 0.5;
  float tB = fb * 0.5 + 0.5;

  vec3 col;
  col.r = palette(tR + 0.00, dR).r;
  col.g = palette(tG + 0.02, dR).g;
  col.b = palette(tB + 0.04, dR).b;

  // contrast / jeweled punch
  col = pow(max(col, 0.0), vec3(1.0 + 0.6 * uSat));

  // saturation push (neural gain) around luma
  float luma = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(luma), col, 0.85 + uSat * 0.9);

  // radial vignette toward deep violet-black at the rim (frames the tunnel)
  float vig = smoothstep(1.15, 0.15, r0);
  col *= mix(0.25, 1.0, vig);
  col += vec3(0.04, 0.0, 0.07) * (1.0 - vig);

  // ---- blue-noise visual-snow grain at low alpha ----
  float g = hash21(gl_FragCoord.xy + fract(uTime) * 91.7);
  col += (g - 0.5) * uGrain;

  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;
