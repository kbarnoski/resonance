// ─────────────────────────────────────────────────────────────────────────────
// mandala.ts — WebGL2 additive-bloom mandala for 1152-anechoic-veil.
//
//   A single full-screen fragment pass renders a kaleidoscopic, radially
//   symmetric veil by ADDITIVELY accumulating concentric petal-rings, radial
//   rays, a luminous core and a faint ever-present nebula. The whole field is
//   gated by `stillness`: outer rings crystallize only as stillness deepens, and
//   overall brightness scales with it — so the mandala fully blooms only in
//   silence. `scatter` (momentary loudness) jitters the radius via animated
//   noise, eroding the veil the instant sound is made.
//
//   Palette: deep violet / indigo → pale bloom on near-black #05040c.
//   Motion is slow rotation + a gentle luminance breath supplied by the caller
//   (see uLum) — never a strobe. No Canvas2D anywhere.
// ─────────────────────────────────────────────────────────────────────────────

export interface MandalaState {
  /** Absolute time in seconds (performance.now()/1000). */
  time: number;
  /** Stillness 0..1 (the reveal). */
  stillness: number;
  /** Momentary loudness / erosion 0..1. */
  scatter: number;
  /** Safe luminance multiplier 0..1 (slow breath; 1 = steady). */
  lum: number;
  /** Motion scale 0..1 (reduced-motion users get a small value). */
  motion: number;
}

export interface MandalaRenderer {
  render(s: MandalaState): void;
  resize(): void;
  dispose(): void;
}

const VERT = `#version 300 es
in vec2 aPos;
void main(){ gl_Position = vec4(aPos, 0.0, 1.0); }`;

const FRAG = `#version 300 es
precision highp float;
uniform vec2  uRes;
uniform float uTime;
uniform float uStill;
uniform float uScatter;
uniform float uLum;
uniform float uMotion;
uniform float uSeed[6];
out vec4 fragColor;
#define TAU 6.28318530718

float hash21(vec2 p){
  p = fract(p * vec2(123.34, 345.45));
  p += dot(p, p + 34.345);
  return fract(p.x * p.y);
}

void main(){
  vec2 res = uRes;
  vec2 uv = (gl_FragCoord.xy - 0.5 * res) / min(res.x, res.y);
  float r = length(uv);
  float baseA = atan(uv.y, uv.x);
  float t = uTime;

  float spin = t * 0.04 * uMotion;

  // Erosion: loose when not still, violently scattered on a loud transient.
  float ero = (1.0 - uStill) * 0.4 + uScatter * 0.9;
  vec2 gp = uv * 22.0 + vec2(t * 0.6, -t * 0.4) * uMotion;
  float jit = hash21(floor(gp)) - 0.5;
  float rj = r + jit * ero * 0.28;

  vec3 col = vec3(0.0);

  const int RINGS = 6;
  for(int i = 0; i < RINGS; i++){
    float fi = float(i);
    // Outer rings crystallize only as stillness deepens.
    float need = fi / float(RINGS);
    float gate = smoothstep(need, need + 0.22, uStill);
    if(gate <= 0.001) continue;

    float ringR  = 0.08 + fi * 0.10;
    float petals = 3.0 + fi * 2.0 + floor(uStill * 3.0);
    float dir    = mod(fi, 2.0) * 2.0 - 1.0;
    float a      = baseA + spin * dir * (1.0 + fi * 0.15) + uSeed[i] * TAU;

    float petal = pow(max(cos(a * petals), 0.0), 4.0);
    float band  = exp(-pow((rj - ringR) / 0.028, 2.0));
    float fil   = exp(-pow((rj - ringR) / 0.006, 2.0)) * 0.35;

    vec3 warm = vec3(0.52, 0.26, 0.85);   // inner violet
    vec3 cool = vec3(0.60, 0.80, 1.00);   // outer pale indigo
    vec3 c = mix(warm, cool, clamp(fi / 5.0, 0.0, 1.0));
    col += c * (band * petal + fil * 0.6) * gate;
  }

  // Radial rays emerge only in deep stillness.
  float rays = pow(max(cos((baseA + spin) * 24.0), 0.0), 8.0);
  rays *= smoothstep(0.6, 0.95, uStill) * exp(-pow(rj / 0.55, 2.0));
  col += vec3(0.75, 0.68, 1.0) * rays * 0.5;

  // Luminous core.
  float core = exp(-pow(rj / 0.05, 2.0)) * (0.25 + 0.75 * uStill);
  col += vec3(0.80, 0.66, 1.0) * core;

  // Ever-present faint nebula — the screen is never dead.
  float neb = exp(-pow(r / 0.6, 2.0));
  col += vec3(0.16, 0.10, 0.30) * neb * (0.10 + 0.05 * uStill);

  // Reveal through restraint: the whole field brightens with stillness.
  col *= (0.30 + 1.05 * uStill);

  // Gentle, safe luminance breath (supplied by caller; 1.0 = steady).
  col *= uLum;

  // Near-black base #05040c.
  col += vec3(0.020, 0.016, 0.047);

  // Soft rolloff so additive glow never clips harshly.
  col = col / (col + vec3(0.55));
  col = pow(col, vec3(0.85));

  fragColor = vec4(col, 1.0);
}`;

function makeShader(
  gl: WebGL2RenderingContext,
  type: number,
  src: string,
): WebGLShader | null {
  const sh = gl.createShader(type);
  if (!sh) return null;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    gl.deleteShader(sh);
    return null;
  }
  return sh;
}

/** Build the WebGL2 mandala renderer, or null if WebGL2 is unavailable. */
export function makeMandalaRenderer(
  canvas: HTMLCanvasElement,
  seeds: Float32Array,
): MandalaRenderer | null {
  const gl = canvas.getContext("webgl2", {
    antialias: true,
    alpha: false,
    premultipliedAlpha: false,
  });
  if (!gl) return null;

  const vs = makeShader(gl, gl.VERTEX_SHADER, VERT);
  const fs = makeShader(gl, gl.FRAGMENT_SHADER, FRAG);
  if (!vs || !fs) return null;

  const prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.bindAttribLocation(prog, 0, "aPos");
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    gl.deleteProgram(prog);
    return null;
  }
  gl.deleteShader(vs);
  gl.deleteShader(fs);

  // Full-screen triangle.
  const vbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 3, -1, -1, 3]),
    gl.STATIC_DRAW,
  );
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  gl.useProgram(prog);
  const uRes = gl.getUniformLocation(prog, "uRes");
  const uTime = gl.getUniformLocation(prog, "uTime");
  const uStill = gl.getUniformLocation(prog, "uStill");
  const uScatter = gl.getUniformLocation(prog, "uScatter");
  const uLum = gl.getUniformLocation(prog, "uLum");
  const uMotion = gl.getUniformLocation(prog, "uMotion");
  const uSeed = gl.getUniformLocation(prog, "uSeed[0]");
  gl.uniform1fv(uSeed, seeds);

  function resize(): void {
    if (!gl) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(1, Math.floor(canvas.clientWidth * dpr));
    const h = Math.max(1, Math.floor(canvas.clientHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    gl.viewport(0, 0, canvas.width, canvas.height);
  }
  resize();

  return {
    render(s: MandalaState) {
      gl.useProgram(prog);
      gl.bindVertexArray(vao);
      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.uniform1f(uTime, s.time);
      gl.uniform1f(uStill, s.stillness);
      gl.uniform1f(uScatter, s.scatter);
      gl.uniform1f(uLum, s.lum);
      gl.uniform1f(uMotion, s.motion);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
    resize,
    dispose() {
      gl.deleteBuffer(vbo);
      gl.deleteVertexArray(vao);
      gl.deleteProgram(prog);
      const ext = gl.getExtension("WEBGL_lose_context");
      if (ext) ext.loseContext();
    },
  };
}
