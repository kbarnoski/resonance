// WebGL2 render — additive soft points, faint long-exposure trails.
//
// Each frame: a full-screen fade quad darkens the previous frame slightly
// (normal blend), then the flock is drawn as additive round points coloured by
// cluster along a violet ramp and brightened by speed. The lingering fade makes
// the murmuration read as flowing ribbons. With reduced motion the fade is a
// full clear (no trails) but the flock still flies.

export interface GLRenderer {
  resize(w: number, h: number, dpr: number): void;
  draw(
    data: Float32Array,
    n: number,
    opts: { fade: number; energy: number },
  ): void;
  dispose(): void;
}

const POINT_VS = `#version 300 es
precision highp float;
layout(location=0) in vec2 a_pos;      // normalised 0..1
layout(location=1) in float a_cluster; // 0..1 (cluster index / count)
layout(location=2) in float a_speed;   // 0..~0.6
uniform float u_energy;
out float v_cluster;
out float v_speed;
void main() {
  // Map the 0..1 flock domain across clip space (full-screen murmuration).
  vec2 p = a_pos * 2.0 - 1.0;
  v_cluster = a_cluster;
  v_speed = a_speed;
  gl_Position = vec4(p.x, -p.y, 0.0, 1.0);
  gl_PointSize = (2.5 + a_speed * 22.0) * (1.0 + u_energy * 0.6);
}`;

const POINT_FS = `#version 300 es
precision highp float;
in float v_cluster;
in float v_speed;
out vec4 outColor;
// Violet ramp: deep indigo -> bright lilac.
vec3 ramp(float t) {
  vec3 a = vec3(0.28, 0.12, 0.55);
  vec3 b = vec3(0.55, 0.35, 0.95);
  vec3 c = vec3(0.82, 0.70, 1.0);
  vec3 lo = mix(a, b, clamp(t * 2.0, 0.0, 1.0));
  return mix(lo, c, clamp(t * 2.0 - 1.0, 0.0, 1.0));
}
void main() {
  vec2 d = gl_PointCoord - vec2(0.5);
  float r = length(d);
  if (r > 0.5) discard;
  float glow = smoothstep(0.5, 0.0, r);
  vec3 col = ramp(v_cluster);
  col += vec3(0.25, 0.2, 0.35) * v_speed * 3.0; // faster birds flare
  float a = glow * (0.35 + v_speed * 1.2);
  outColor = vec4(col * a, a);
}`;

const FADE_VS = `#version 300 es
precision highp float;
const vec2 verts[3] = vec2[3](vec2(-1.0,-1.0), vec2(3.0,-1.0), vec2(-1.0,3.0));
void main() { gl_Position = vec4(verts[gl_VertexID], 0.0, 1.0); }`;

const FADE_FS = `#version 300 es
precision highp float;
uniform float u_fade;
out vec4 outColor;
void main() { outColor = vec4(0.02, 0.01, 0.05, u_fade); }`;

function compile(
  glc: WebGL2RenderingContext,
  type: number,
  src: string,
): WebGLShader | null {
  const sh = glc.createShader(type);
  if (!sh) return null;
  glc.shaderSource(sh, src);
  glc.compileShader(sh);
  if (!glc.getShaderParameter(sh, glc.COMPILE_STATUS)) {
    glc.deleteShader(sh);
    return null;
  }
  return sh;
}

function link(
  glc: WebGL2RenderingContext,
  vs: string,
  fs: string,
): WebGLProgram | null {
  const v = compile(glc, glc.VERTEX_SHADER, vs);
  const f = compile(glc, glc.FRAGMENT_SHADER, fs);
  if (!v || !f) return null;
  const p = glc.createProgram();
  if (!p) return null;
  glc.attachShader(p, v);
  glc.attachShader(p, f);
  glc.linkProgram(p);
  glc.deleteShader(v);
  glc.deleteShader(f);
  if (!glc.getProgramParameter(p, glc.LINK_STATUS)) {
    glc.deleteProgram(p);
    return null;
  }
  return p;
}

/** Returns null when WebGL2 is unavailable so the caller can keep the audio. */
export function initGL(canvas: HTMLCanvasElement): GLRenderer | null {
  const gl = canvas.getContext("webgl2", {
    premultipliedAlpha: true,
    preserveDrawingBuffer: true,
    antialias: false,
  });
  if (!gl) return null;
  // Re-bind so nested closures keep the non-null narrowing (TS gotcha).
  const glc: WebGL2RenderingContext = gl;

  const pointProg = link(glc, POINT_VS, POINT_FS);
  const fadeProg = link(glc, FADE_VS, FADE_FS);
  if (!pointProg || !fadeProg) return null;

  const u_energy = glc.getUniformLocation(pointProg, "u_energy");
  const u_fade = glc.getUniformLocation(fadeProg, "u_fade");

  const vao = glc.createVertexArray();
  const buf = glc.createBuffer();
  glc.bindVertexArray(vao);
  glc.bindBuffer(glc.ARRAY_BUFFER, buf);
  const stride = 4 * 4; // x, y, cluster, speed
  glc.enableVertexAttribArray(0);
  glc.vertexAttribPointer(0, 2, glc.FLOAT, false, stride, 0);
  glc.enableVertexAttribArray(1);
  glc.vertexAttribPointer(1, 1, glc.FLOAT, false, stride, 8);
  glc.enableVertexAttribArray(2);
  glc.vertexAttribPointer(2, 1, glc.FLOAT, false, stride, 12);
  glc.bindVertexArray(null);

  const fadeVao = glc.createVertexArray();

  glc.clearColor(0.02, 0.01, 0.05, 1);
  glc.clear(glc.COLOR_BUFFER_BIT);

  return {
    resize(w: number, h: number, dpr: number) {
      canvas.width = Math.max(1, Math.floor(w * dpr));
      canvas.height = Math.max(1, Math.floor(h * dpr));
      glc.viewport(0, 0, canvas.width, canvas.height);
      glc.clearColor(0.02, 0.01, 0.05, 1);
      glc.clear(glc.COLOR_BUFFER_BIT);
    },
    draw(data: Float32Array, n: number, opts) {
      // 1. Fade previous frame (normal alpha blend).
      glc.enable(glc.BLEND);
      glc.blendFunc(glc.SRC_ALPHA, glc.ONE_MINUS_SRC_ALPHA);
      glc.useProgram(fadeProg);
      glc.uniform1f(u_fade, opts.fade);
      glc.bindVertexArray(fadeVao);
      glc.drawArrays(glc.TRIANGLES, 0, 3);

      // 2. Additive points.
      glc.blendFunc(glc.SRC_ALPHA, glc.ONE);
      glc.useProgram(pointProg);
      glc.uniform1f(u_energy, opts.energy);
      glc.bindVertexArray(vao);
      glc.bindBuffer(glc.ARRAY_BUFFER, buf);
      glc.bufferData(glc.ARRAY_BUFFER, data, glc.DYNAMIC_DRAW);
      glc.drawArrays(glc.POINTS, 0, n);
      glc.bindVertexArray(null);
    },
    dispose() {
      glc.deleteBuffer(buf);
      glc.deleteVertexArray(vao);
      glc.deleteVertexArray(fadeVao);
      glc.deleteProgram(pointProg);
      glc.deleteProgram(fadeProg);
    },
  };
}
