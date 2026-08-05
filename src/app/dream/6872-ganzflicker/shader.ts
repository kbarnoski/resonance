// ════════════════════════════════════════════════════════════════════════════
// 6872 · GANZFLICKER — the field renderer (WebGL2)
//
// A single full-screen fragment shader that renders a near-uniform luminous
// Ganzfeld with three stacked ingredients:
//
//   1. a dim, breathing base field whose luminance = room brightness × a slow
//      safe luminance drift (never a strobe), tinted by the room's dominant hue
//      blended toward Resonance violet;
//   2. an animated value-noise "visual snow" grain at low alpha — the raw
//      stochastic texture the visual system amplifies into imagery;
//   3. an emergent FORM-CONSTANT layer whose complexity is driven by a single
//      `uComplexity` uniform in [0,1]. All the geometry is stripes / hex under a
//      log-polar (exp) warp — the standard Bressloff–Cowan trick that maps
//      cortical stripes to retinal form constants — plus a bilaterally-symmetric
//      domain-warped noise layer for the face-like pole. Every stage fades in
//      and out on its own slow sine so structures never lock: hypnagogic drift.
//
// No React, no external libs. createFieldRenderer returns null when WebGL2 is
// unavailable so the page can degrade gracefully instead of white-screening.
// ════════════════════════════════════════════════════════════════════════════

const VERT = `#version 300 es
in vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
`;

const FRAG = `#version 300 es
precision highp float;
out vec4 fragColor;

uniform vec2  uRes;
uniform float uTime;        // seconds (performance.now based)
uniform float uComplexity;  // 0 = dots … 1 = organized forms
uniform float uBrightness;  // room brightness 0..1
uniform float uHue;         // room dominant hue 0..1
uniform float uBreath;      // safe luminance multiplier 0..1 (drift, not strobe)
uniform float uReduced;     // 1.0 when prefers-reduced-motion
uniform float uGrain;       // grain / visual-snow intensity

const float PI = 3.14159265359;

// ── hash / value noise ──────────────────────────────────────────────────────
float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 345.45));
  p += dot(p, p + 34.345);
  return fract(p.x * p.y);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float fbm(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { s += a * vnoise(p); p *= 2.02; a *= 0.5; }
  return s;
}
vec3 hsv2rgb(vec3 c) {
  vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

// ── form-constant primitives (all in log-polar / exp-warp space) ─────────────
// scattered twinkling dots — the aphantasic floor
float dotsLayer(vec2 uv, float t) {
  vec2 g = uv * 7.0;
  vec2 id = floor(g);
  vec2 f = fract(g) - 0.5;
  float rnd = hash21(id);
  float tw = 0.5 + 0.5 * sin(t * 1.2 + rnd * 30.0);
  vec2 drift = 0.3 * vec2(sin(rnd * 10.0 + t * 0.3), cos(rnd * 7.0 + t * 0.25));
  float d = length(f - drift);
  return smoothstep(0.26, 0.0, d) * tw * step(0.52, rnd);
}
// concentric rings / radial grating — funnel & tunnel form constants
float ringLayer(float lr, float t) {
  return 0.5 + 0.5 * sin(lr * 7.0 - t * 0.6);
}
// hexagonal lattice / honeycomb — three log-polar gratings 60° apart
float latticeLayer(float lr, float ang, float t) {
  vec2 lp = vec2(lr * 5.0, ang * 6.0);
  float h = 0.0;
  for (int k = 0; k < 3; k++) {
    float a = float(k) * PI / 3.0;
    vec2 dir = vec2(cos(a), sin(a));
    h += cos(dot(lp, dir) + t * 0.2);
  }
  h /= 3.0;
  return smoothstep(0.25, 0.9, h);
}
// cobwebs & spirals — logarithmic spiral + thin spokes + fine rings
float webLayer(float lr, float ang, float t) {
  float spiral = 0.5 + 0.5 * sin(lr * 4.0 + ang * 10.0 - t * 0.5);
  float spokes = 0.5 + 0.5 * sin(ang * 18.0 + t * 0.1);
  float rings = 0.5 + 0.5 * sin(lr * 15.0);
  return smoothstep(0.72, 1.0, spokes) * 0.6
       + smoothstep(0.86, 1.0, rings) * 0.5
       + spiral * 0.45;
}
// organized / face-like forms — bilateral symmetry + domain-warped noise
float formLayer(vec2 uv, float t) {
  vec2 suv = vec2(abs(uv.x), uv.y);          // mirror → bilateral symmetry
  float w1 = fbm(suv * 2.4 + vec2(0.0, t * 0.05));
  vec2 warp = vec2(fbm(suv * 2.0 + w1), fbm(suv * 2.0 - w1 + 3.1));
  float organic = fbm(suv * 3.0 + warp * 1.4 + t * 0.03);
  // pareidolic "eyes" + "mouth", hovering, never fully drawn
  vec2 ep = vec2(abs(uv.x) - 0.17, uv.y - 0.10);
  float eyes = exp(-dot(ep, ep) * 130.0);
  vec2 mp = vec2(uv.x, uv.y + 0.17) * vec2(1.0, 3.0);
  float mouth = exp(-dot(mp, mp) * 45.0);
  float face = (eyes + mouth * 0.6) * (0.4 + 0.6 * organic);
  return mix(organic, face, 0.55);
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
  float r = length(uv);
  float ang = atan(uv.y, uv.x);
  float lr = log(r + 0.04);

  float tf = (uReduced > 0.5) ? 0.5 : 1.0;   // reduced-motion → slower everything
  float t = uTime * tf;
  float c = clamp(uComplexity, 0.0, 1.0);

  // ── stage windows (overlapping smoothsteps → gradual escalation) ───────────
  float wDots = 1.0 - 0.6 * smoothstep(0.4, 0.85, c);
  float wGrat = smoothstep(0.12, 0.30, c);
  float wLat  = smoothstep(0.34, 0.54, c);
  float wWeb  = smoothstep(0.56, 0.76, c);
  float wForm = smoothstep(0.76, 0.96, c);

  // ── slow independent presence per stage → structures breathe, never lock ───
  float pDots = 0.55 + 0.45 * sin(t * 0.70 + 1.0);
  float pGrat = 0.55 + 0.45 * sin(t * 0.33 + 2.0);
  float pLat  = 0.55 + 0.45 * sin(t * 0.21 + 4.0);
  float pWeb  = 0.55 + 0.45 * sin(t * 0.27 + 0.5);
  float pForm = 0.50 + 0.50 * sin(t * 0.15 + 3.0);

  float S = 0.0;
  S += wDots * pDots * dotsLayer(uv, t) * 0.90;
  S += wGrat * pGrat * ringLayer(lr, t) * 0.55;
  S += wLat  * pLat  * latticeLayer(lr, ang, t) * 0.70;
  S += wWeb  * pWeb  * webLayer(lr, ang, t) * 0.50;
  S += wForm * pForm * formLayer(uv, t) * 0.75;

  // ── base Ganzfeld field: dim, breathing, room-tinted ───────────────────────
  float hueMod = fract(uHue + 0.04 * sin(t * 0.15));
  vec3 roomCol = hsv2rgb(vec3(hueMod, 0.45, 1.0));
  vec3 violet = vec3(0.55, 0.45, 0.95);
  vec3 tint = mix(violet, roomCol, 0.30 * uBrightness + 0.12);
  float baseL = mix(0.05, 0.17, uBrightness) * uBreath;
  vec3 col = baseL * tint;

  // ── structure colour: violet-forward, hue-shifting as complexity climbs ────
  vec3 sCol = hsv2rgb(vec3(fract(0.72 + uHue * 0.12 + c * 0.14), 0.55, 1.0));
  col += S * sCol * (0.11 + 0.17 * uBrightness) * uBreath;

  // ── animated value-noise grain (visual snow) ───────────────────────────────
  float g = hash21(gl_FragCoord.xy + vec2(floor(uTime * 24.0)));
  float grain = (g - 0.5) * uGrain * (uReduced > 0.5 ? 0.5 : 1.0);
  col += grain;

  // ── gentle vignette so the field reads as a boundless dome ─────────────────
  float vig = smoothstep(1.25, 0.15, r);
  col *= mix(0.82, 1.0, vig);

  fragColor = vec4(max(col, 0.0), 1.0);
}
`;

export interface FieldUniforms {
  time: number;
  complexity: number;
  brightness: number;
  hue: number;
  breath: number;
  reduced: boolean;
  grain: number;
}

export interface FieldRenderer {
  draw: (u: FieldUniforms) => void;
  resize: (w: number, h: number) => void;
  dispose: () => void;
}

function compile(
  gl: WebGL2RenderingContext,
  type: number,
  src: string,
): WebGLShader | null {
  const sh = gl.createShader(type);
  if (!sh) return null;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    console.error(gl.getShaderInfoLog(sh));
    gl.deleteShader(sh);
    return null;
  }
  return sh;
}

/** Build the field renderer, or return null when WebGL2 is unavailable. */
export function createFieldRenderer(
  canvas: HTMLCanvasElement,
): FieldRenderer | null {
  const gl = canvas.getContext("webgl2", {
    antialias: false,
    alpha: false,
    powerPreference: "high-performance",
  });
  if (!gl) return null;

  const vs = compile(gl, gl.VERTEX_SHADER, VERT);
  const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
  if (!vs || !fs) return null;
  const prog = gl.createProgram();
  if (!prog) return null;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.bindAttribLocation(prog, 0, "a_pos");
  gl.linkProgram(prog);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.error(gl.getProgramInfoLog(prog));
    gl.deleteProgram(prog);
    return null;
  }

  // full-screen triangle
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 3, -1, -1, 3]),
    gl.STATIC_DRAW,
  );
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  gl.useProgram(prog);
  const u = {
    res: gl.getUniformLocation(prog, "uRes"),
    time: gl.getUniformLocation(prog, "uTime"),
    complexity: gl.getUniformLocation(prog, "uComplexity"),
    brightness: gl.getUniformLocation(prog, "uBrightness"),
    hue: gl.getUniformLocation(prog, "uHue"),
    breath: gl.getUniformLocation(prog, "uBreath"),
    reduced: gl.getUniformLocation(prog, "uReduced"),
    grain: gl.getUniformLocation(prog, "uGrain"),
  };

  let w = canvas.width;
  let h = canvas.height;

  return {
    resize(nw, nh) {
      w = Math.max(1, nw);
      h = Math.max(1, nh);
      canvas.width = w;
      canvas.height = h;
      gl.viewport(0, 0, w, h);
    },
    draw(uni) {
      gl.useProgram(prog);
      gl.uniform2f(u.res, w, h);
      gl.uniform1f(u.time, uni.time);
      gl.uniform1f(u.complexity, uni.complexity);
      gl.uniform1f(u.brightness, uni.brightness);
      gl.uniform1f(u.hue, uni.hue);
      gl.uniform1f(u.breath, uni.breath);
      gl.uniform1f(u.reduced, uni.reduced ? 1 : 0);
      gl.uniform1f(u.grain, uni.grain);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
    dispose() {
      try {
        gl.deleteBuffer(buf);
        gl.deleteProgram(prog);
        const lose = gl.getExtension("WEBGL_lose_context");
        lose?.loseContext();
      } catch {
        /* best effort */
      }
    },
  };
}
