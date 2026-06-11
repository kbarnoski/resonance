// Aurora domain-warp fragment shader (WebGL2 GLSL ES 3.00)
// Technique: Iñigo Quilez "Domain Warping" — fbm(p + fbm(p + fbm(p)))
// Level/flat = soft, wide, slow, warm-green/teal; steep tilt = tight folds, violet/magenta, fast shimmer

export const VERT_SRC = /* glsl */ `#version 300 es
precision highp float;
in vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

export const FRAG_SRC = /* glsl */ `#version 300 es
precision highp float;

uniform vec2  uRes;       // viewport resolution (pixels)
uniform float uTime;      // elapsed time (seconds)
uniform float uTension;   // 0 = calm/home, 1 = full tilt/tension
uniform float uBeta;      // smoothed beta tilt (front-back), -1..1
uniform float uGamma;     // smoothed gamma tilt (left-right), -1..1

out vec4 fragColor;

// ── Hash & noise helpers ───────────────────────────────────────────────────────

float hash21(vec2 p) {
  p = fract(p * vec2(127.1, 311.7));
  p += dot(p, p + 17.5);
  return fract(p.x * p.y);
}

// Smooth value noise 2D
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

// ── fBm (fractal Brownian motion) ─────────────────────────────────────────────
// tension controls fold sharpness: low = few wide octaves, high = many tight octaves

float fbm(vec2 p, float tension) {
  float octaves = mix(3.0, 6.0, tension);
  float value  = 0.0;
  float amp    = 0.52;
  float freq   = 1.0;
  float norm   = 0.0;
  // Slightly different rotation per octave for visual variety
  mat2 rot = mat2(cos(0.7), -sin(0.7), sin(0.7), cos(0.7));
  for (int i = 0; i < 6; i++) {
    if (float(i) >= octaves) break;
    value += amp * vnoise(p * freq);
    norm  += amp;
    amp   *= 0.5;
    freq  *= mix(1.85, 2.3, tension); // tighter lacunarity when tense
    p = rot * p;
  }
  return value / max(norm, 0.001);
}

// ── Domain-warp aurora (IQ technique: fbm(p + fbm(p + fbm(p)))) ───────────────

float aurora(vec2 p, float tension) {
  vec2 q = vec2(fbm(p + vec2(0.0, 0.0), tension),
                fbm(p + vec2(5.2, 1.3), tension));

  vec2 r = vec2(fbm(p + 4.0 * q + vec2(1.7, 9.2), tension),
                fbm(p + 4.0 * q + vec2(8.3, 2.8), tension));

  return fbm(p + 4.0 * r, tension);
}

// ── Curtain height mask (band around mid-screen) ───────────────────────────────

float curtainMask(float y, float tension) {
  // At rest: wide, soft band; tense: narrower but brighter within band
  float bandCenter = 0.52;
  float halfWidth  = mix(0.36, 0.22, tension);
  float dy         = (y - bandCenter) / halfWidth;
  float falloff    = exp(-dy * dy * mix(1.2, 3.5, tension));
  return falloff;
}

// ── Color palette ─────────────────────────────────────────────────────────────
// Home (calm): warm-green/teal/soft cyan
// Tense: electric violet / magenta / blue-white

vec3 auroraColor(float t, float tension, float shimmer) {
  // t in [0,1] is the noise value

  // Calm palette: green-teal
  vec3 calmA = vec3(0.05, 0.65, 0.45);  // warm green
  vec3 calmB = vec3(0.10, 0.80, 0.70);  // teal
  vec3 calmC = vec3(0.15, 0.55, 0.80);  // soft blue

  // Tense palette: violet-magenta
  vec3 tenseA = vec3(0.55, 0.05, 0.90); // electric violet
  vec3 tenseB = vec3(0.90, 0.10, 0.75); // magenta
  vec3 tenseC = vec3(0.20, 0.30, 1.00); // blue-white

  vec3 colA = mix(calmA, tenseA, tension);
  vec3 colB = mix(calmB, tenseB, tension);
  vec3 colC = mix(calmC, tenseC, tension);

  // Triple-band blend by noise value
  vec3 col;
  if (t < 0.4) {
    col = mix(colA, colB, t / 0.4);
  } else if (t < 0.7) {
    col = mix(colB, colC, (t - 0.4) / 0.3);
  } else {
    col = mix(colC, colA, (t - 0.7) / 0.3);
  }

  // Shimmer: brightens high-frequency crests when tense
  float shimmerBoost = shimmer * tension * 0.55;
  col = col + shimmerBoost * vec3(0.7, 0.5, 1.0);

  return col;
}

void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  float aspect = uRes.x / uRes.y;

  // Correct for aspect ratio, center [0,0] mid-screen
  vec2 p = vec2((uv.x - 0.5) * aspect, uv.y - 0.5);

  // Flow speed: faster when tense
  float flowSpeed = mix(0.08, 0.32, uTension);
  // Scroll direction influenced by tilt direction
  vec2 drift = vec2(uGamma * 0.04, uBeta * 0.02);
  float t = uTime * flowSpeed;

  // Domain-warp coordinates
  vec2 wp = p * mix(1.6, 3.4, uTension) + vec2(t * 0.45, t * 0.2) + drift * t;

  // Three-layer aurora for depth
  float n1 = aurora(wp,                                     uTension);
  float n2 = aurora(wp * 1.3 + vec2(3.1, 7.4),             uTension);
  float n3 = aurora(wp * 0.7 + vec2(-2.2, 1.1) + drift * 2.0, uTension);

  float noiseVal = n1 * 0.55 + n2 * 0.30 + n3 * 0.15;

  // Curtain vertical mask
  float mask = curtainMask(uv.y, uTension);

  // Shimmer: high-freq oscillation when tense
  float shimmerFreq = mix(0.5, 8.0, uTension);
  float shimmer = 0.5 + 0.5 * sin(uTime * shimmerFreq * 6.28 + noiseVal * 12.0);

  // Brightness envelope
  float brightness = mix(0.55, 0.90, uTension);
  float col_t = clamp(noiseVal, 0.0, 1.0);

  vec3 auroraCol = auroraColor(col_t, uTension, shimmer) * brightness;

  // Vertical ribbon shaping — aurora lives above center
  auroraCol *= mask;

  // Lower brightness beyond the curtain band (thin wisps)
  float wisp = aurora(wp * 0.5 + vec2(11.1, -3.3), uTension) * 0.18;
  vec3 wispCol = mix(vec3(0.05, 0.25, 0.20), vec3(0.20, 0.05, 0.35), uTension);
  auroraCol += wispCol * wisp * (1.0 - mask);

  // Deep indigo sky background
  vec3 skyTop    = vec3(0.012, 0.005, 0.055); // near-black indigo at top
  vec3 skyBottom = vec3(0.005, 0.008, 0.025); // very dark at horizon
  vec3 skyCol    = mix(skyBottom, skyTop, uv.y);

  // Stars — deterministic tiny flecks
  float starHash = hash21(floor(p * 180.0));
  float starGlow = 0.0;
  if (starHash > 0.986) {
    float twinkle = 0.6 + 0.4 * sin(uTime * (3.0 + starHash * 5.0) + starHash * 40.0);
    starGlow = twinkle * mix(1.0, 0.4, uTension) * (1.0 - mask * 2.0);
    starGlow = max(starGlow, 0.0);
  }
  vec3 stars = vec3(starGlow * 0.9);

  // Compose: sky + aurora + stars
  vec3 final = skyCol + auroraCol + stars;

  // Slight vignette
  float vign = 1.0 - 0.25 * length(uv - 0.5) * 2.0;
  final *= max(vign, 0.0);

  // Tone-map with soft knee
  final = final / (1.0 + final * 0.4);

  fragColor = vec4(final, 1.0);
}
`;

// Compile a shader and return it, or throw on error
export function compileShader(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const s = gl.createShader(type)!;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(s) ?? "unknown";
    gl.deleteShader(s);
    throw new Error(`Shader compile error:\n${log}`);
  }
  return s;
}

// Link a program from compiled shaders
export function linkProgram(
  gl: WebGL2RenderingContext,
  vert: WebGLShader,
  frag: WebGLShader
): WebGLProgram {
  const prog = gl.createProgram()!;
  gl.attachShader(prog, vert);
  gl.attachShader(prog, frag);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(prog) ?? "unknown";
    gl.deleteProgram(prog);
    throw new Error(`Program link error:\n${log}`);
  }
  return prog;
}

// Build the full-screen quad VAO (two triangles covering NDC -1..1)
export function buildQuad(gl: WebGL2RenderingContext, prog: WebGLProgram): WebGLVertexArrayObject {
  const vao = gl.createVertexArray()!;
  gl.bindVertexArray(vao);
  const buf = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  // prettier-ignore
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
    -1, -1,   1, -1,  -1,  1,
     1, -1,   1,  1,  -1,  1,
  ]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, "aPos");
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);
  return vao;
}
