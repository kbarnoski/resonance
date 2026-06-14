// gl.ts — raw WebGL2 renderer for the yell-blob.
//
// We draw a single soft-body blob as a triangle fan: a center vertex plus a
// ring of perimeter points (computed on the CPU by blob.ts). The fragment
// shader gooes it up with a soft gradient body + a wobbly rim glow, and we
// draw two big googly eyes as separate fans on top. No three.js, no CDN — all
// hand-written GLSL below.

export type GL = {
  gl: WebGL2RenderingContext;
  program: WebGLProgram;
  vao: WebGLVertexArrayObject;
  posBuf: WebGLBuffer;
  colBuf: WebGLBuffer;
  uRes: WebGLUniformLocation | null;
  uMode: WebGLUniformLocation | null;
};

const VERT = `#version 300 es
precision highp float;
layout(location=0) in vec2 a_pos;   // clip space already
layout(location=1) in vec3 a_col;   // rgb tint, plus packed alpha-ish in length
out vec3 v_col;
out vec2 v_local;                   // -1..1 local for the center vertex trick
uniform vec2 u_res;
void main() {
  v_col = a_col;
  v_local = a_pos;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;
in vec3 v_col;
in vec2 v_local;
out vec4 outColor;
uniform int u_mode;   // 0 = body, 1 = eye-white, 2 = pupil, 3 = shine
void main() {
  if (u_mode == 0) {
    // Body: gooey gradient, slightly translucent rim so overlap reads soft.
    outColor = vec4(v_col, 0.97);
  } else if (u_mode == 1) {
    outColor = vec4(0.98, 0.98, 1.0, 1.0);     // eye white
  } else if (u_mode == 2) {
    outColor = vec4(0.04, 0.03, 0.08, 1.0);    // pupil
  } else {
    outColor = vec4(1.0, 1.0, 1.0, 0.85);      // shine highlight
  }
}`;

function makeShader(gl: WebGL2RenderingContext, type: number, src: string) {
  const s = gl.createShader(type)!;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(s);
    gl.deleteShader(s);
    throw new Error("shader compile failed: " + log);
  }
  return s;
}

export function makeGL(canvas: HTMLCanvasElement): GL | null {
  const gl = canvas.getContext("webgl2", {
    alpha: false,
    antialias: true,
    premultipliedAlpha: false,
  });
  if (!gl) return null;

  // Any compile/link failure -> return null so the page shows its WebGL notice
  // instead of throwing out of the render effect.
  let vs: WebGLShader;
  let fs: WebGLShader;
  try {
    vs = makeShader(gl, gl.VERTEX_SHADER, VERT);
    fs = makeShader(gl, gl.FRAGMENT_SHADER, FRAG);
  } catch {
    return null;
  }
  const program = gl.createProgram()!;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    gl.deleteProgram(program);
    return null;
  }
  gl.deleteShader(vs);
  gl.deleteShader(fs);

  const vao = gl.createVertexArray()!;
  gl.bindVertexArray(vao);

  const posBuf = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  const colBuf = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, colBuf);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);

  gl.bindVertexArray(null);

  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

  return {
    gl,
    program,
    vao,
    posBuf,
    colBuf,
    uRes: gl.getUniformLocation(program, "u_res"),
    uMode: gl.getUniformLocation(program, "u_mode"),
  };
}

export function drawClear(g: GL, w: number, h: number) {
  const { gl } = g;
  gl.viewport(0, 0, w, h);
  gl.clearColor(0.05, 0.04, 0.09, 1.0);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.useProgram(g.program);
  if (g.uRes) gl.uniform2f(g.uRes, w, h);
}

// Draw a triangle-fan given a flat positions array (clip space, x,y pairs)
// and a single rgb color reused for every vertex. mode selects the shader path.
export function drawFan(
  g: GL,
  positions: Float32Array,
  r: number,
  gr: number,
  b: number,
  mode: number,
) {
  const { gl } = g;
  const n = positions.length / 2;
  const cols = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    cols[i * 3] = r;
    cols[i * 3 + 1] = gr;
    cols[i * 3 + 2] = b;
  }
  gl.bindVertexArray(g.vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, g.posBuf);
  gl.bufferData(gl.ARRAY_BUFFER, positions, gl.DYNAMIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, g.colBuf);
  gl.bufferData(gl.ARRAY_BUFFER, cols, gl.DYNAMIC_DRAW);
  if (g.uMode) gl.uniform1i(g.uMode, mode);
  gl.drawArrays(gl.TRIANGLE_FAN, 0, n);
  gl.bindVertexArray(null);
}
