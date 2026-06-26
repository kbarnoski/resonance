// Hand-rolled WebGL2 perspective heightfield renderer.
// No three.js. Renders a grid mesh whose vertex heights come from the
// terrain function (computed on CPU each morph step), with elevation
// shading and contour lines, plus the luminous orbit path on the surface.

import { Orbit, TerrainId, terrainHeight, orbitPoint } from "./terrain";

const GRID = 96; // mesh resolution per side

// ── tiny mat4 helpers ───────────────────────────────────────────────────────
type M4 = Float32Array;

function identity(): M4 {
  const m = new Float32Array(16);
  m[0] = m[5] = m[10] = m[15] = 1;
  return m;
}
function multiply(a: M4, b: M4): M4 {
  const o = new Float32Array(16);
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      o[c * 4 + r] =
        a[0 * 4 + r] * b[c * 4 + 0] +
        a[1 * 4 + r] * b[c * 4 + 1] +
        a[2 * 4 + r] * b[c * 4 + 2] +
        a[3 * 4 + r] * b[c * 4 + 3];
    }
  }
  return o;
}
function perspective(fovy: number, aspect: number, near: number, far: number): M4 {
  const f = 1 / Math.tan(fovy / 2);
  const m = new Float32Array(16);
  m[0] = f / aspect;
  m[5] = f;
  m[10] = (far + near) / (near - far);
  m[11] = -1;
  m[14] = (2 * far * near) / (near - far);
  return m;
}
function lookAt(eye: number[], center: number[], up: number[]): M4 {
  const z = norm(sub(eye, center));
  const x = norm(cross(up, z));
  const y = cross(z, x);
  const m = identity();
  m[0] = x[0]; m[4] = x[1]; m[8] = x[2];
  m[1] = y[0]; m[5] = y[1]; m[9] = y[2];
  m[2] = z[0]; m[6] = z[1]; m[10] = z[2];
  m[12] = -dot(x, eye);
  m[13] = -dot(y, eye);
  m[14] = -dot(z, eye);
  return m;
}
const sub = (a: number[], b: number[]) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: number[], b: number[]) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
function norm(a: number[]) {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
}

// ── shaders ─────────────────────────────────────────────────────────────────
const MESH_VS = `#version 300 es
precision highp float;
layout(location=0) in vec2 aXZ;   // grid position in [-1,1]
uniform mat4 uMVP;
uniform sampler2D uHeight;        // R32F height texture
uniform float uHScale;
out float vH;
out vec2 vUV;
void main() {
  vec2 uv = aXZ * 0.5 + 0.5;
  float h = texture(uHeight, uv).r;
  vH = h;
  vUV = uv;
  vec3 pos = vec3(aXZ.x, h * uHScale, aXZ.y);
  gl_Position = uMVP * vec4(pos, 1.0);
}`;

const MESH_FS = `#version 300 es
precision highp float;
in float vH;
in vec2 vUV;
out vec4 frag;
uniform sampler2D uHeight;
uniform float uTime;

// warm topographic palette: deep earth -> ochre -> bright ridge
vec3 palette(float t) {
  t = clamp(t, 0.0, 1.0);
  vec3 low  = vec3(0.16, 0.10, 0.07);  // dark umber
  vec3 mid1 = vec3(0.46, 0.24, 0.10);  // bronze
  vec3 mid2 = vec3(0.78, 0.47, 0.16);  // amber
  vec3 high = vec3(0.98, 0.86, 0.58);  // pale gold ridge
  vec3 c = mix(low, mid1, smoothstep(0.0, 0.4, t));
  c = mix(c, mid2, smoothstep(0.35, 0.75, t));
  c = mix(c, high, smoothstep(0.7, 1.0, t));
  return c;
}

void main() {
  float t = vH * 0.5 + 0.5;
  vec3 col = palette(t);

  // cheap normal from height texture for relief shading
  float e = 1.0 / 96.0;
  float hl = texture(uHeight, vUV - vec2(e, 0.0)).r;
  float hr = texture(uHeight, vUV + vec2(e, 0.0)).r;
  float hd = texture(uHeight, vUV - vec2(0.0, e)).r;
  float hu = texture(uHeight, vUV + vec2(0.0, e)).r;
  vec3 n = normalize(vec3(hl - hr, 0.12, hd - hu));
  vec3 L = normalize(vec3(0.5, 0.8, 0.35));
  float diff = clamp(dot(n, L), 0.0, 1.0);
  col *= 0.45 + 0.75 * diff;

  // contour lines (elevation bands)
  float bands = 14.0;
  float c = abs(fract(t * bands - 0.5) - 0.5) / fwidth(t * bands);
  float line = 1.0 - clamp(c, 0.0, 1.0);
  col = mix(col, vec3(0.05, 0.03, 0.02), line * 0.45);

  // soft height fog at the base
  col = mix(vec3(0.09,0.06,0.05), col, smoothstep(-0.1, 0.3, vH + 0.5));
  frag = vec4(col, 1.0);
}`;

const ORBIT_VS = `#version 300 es
precision highp float;
layout(location=0) in vec2 aXZ;
layout(location=1) in float aH;
uniform mat4 uMVP;
uniform float uHScale;
out float vEdge;
void main() {
  vEdge = aH;
  vec3 pos = vec3(aXZ.x, aH * uHScale + 0.02, aXZ.y);
  gl_Position = uMVP * vec4(pos, 1.0);
}`;

const ORBIT_FS = `#version 300 es
precision highp float;
out vec4 frag;
uniform vec3 uColor;
void main() { frag = vec4(uColor, 1.0); }`;

const POINT_VS = `#version 300 es
precision highp float;
layout(location=0) in vec2 aXZ;
layout(location=1) in float aH;
uniform mat4 uMVP;
uniform float uHScale;
void main() {
  vec3 pos = vec3(aXZ.x, aH * uHScale + 0.04, aXZ.y);
  gl_Position = uMVP * vec4(pos, 1.0);
  gl_PointSize = 16.0;
}`;

const POINT_FS = `#version 300 es
precision highp float;
out vec4 frag;
uniform vec3 uColor;
void main() {
  vec2 d = gl_PointCoord - 0.5;
  float r = length(d);
  if (r > 0.5) discard;
  float a = smoothstep(0.5, 0.05, r);
  frag = vec4(uColor, a);
}`;

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type);
  if (!sh) throw new Error("shader alloc failed");
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error("shader compile: " + log);
  }
  return sh;
}
function program(gl: WebGL2RenderingContext, vs: string, fs: string): WebGLProgram {
  const p = gl.createProgram();
  if (!p) throw new Error("program alloc failed");
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    throw new Error("link: " + gl.getProgramInfoLog(p));
  }
  return p;
}

const ORBIT_N = 256;

export class TerrainGL {
  private gl: WebGL2RenderingContext;
  private meshProg: WebGLProgram;
  private orbitProg: WebGLProgram;
  private pointProg: WebGLProgram;
  private meshVAO: WebGLVertexArrayObject;
  private indexCount: number;
  private heightTex: WebGLTexture;
  private heightData: Float32Array;
  private orbitVAO: WebGLVertexArrayObject;
  private orbitBuf: WebGLBuffer;
  private orbitData: Float32Array;
  private pointVAO: WebGLVertexArrayObject;
  private pointBuf: WebGLBuffer;
  private hScale = 0.45;

  static create(canvas: HTMLCanvasElement): TerrainGL | null {
    const gl = canvas.getContext("webgl2", { antialias: true, alpha: false });
    if (!gl) return null;
    if (!gl.getExtension("EXT_color_buffer_float") && !gl.getExtension("OES_texture_float_linear")) {
      // R32F sampling still works for texelFetch-style; we use linear filter,
      // fall back to nearest if linear float unsupported.
    }
    try {
      return new TerrainGL(gl);
    } catch {
      return null;
    }
  }

  private constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    this.meshProg = program(gl, MESH_VS, MESH_FS);
    this.orbitProg = program(gl, ORBIT_VS, ORBIT_FS);
    this.pointProg = program(gl, POINT_VS, POINT_FS);

    // build grid vertices + indices
    const verts: number[] = [];
    for (let j = 0; j <= GRID; j++) {
      for (let i = 0; i <= GRID; i++) {
        verts.push((i / GRID) * 2 - 1, (j / GRID) * 2 - 1);
      }
    }
    const idx: number[] = [];
    const w = GRID + 1;
    for (let j = 0; j < GRID; j++) {
      for (let i = 0; i < GRID; i++) {
        const a = j * w + i;
        const b = a + 1;
        const c = a + w;
        const d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
    }
    this.indexCount = idx.length;

    const vao = gl.createVertexArray();
    if (!vao) throw new Error("vao");
    this.meshVAO = vao;
    gl.bindVertexArray(vao);
    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    const ibo = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(idx), gl.STATIC_DRAW);
    gl.bindVertexArray(null);

    // height texture (R32F)
    const tex = gl.createTexture();
    if (!tex) throw new Error("tex");
    this.heightTex = tex;
    this.heightData = new Float32Array((GRID + 1) * (GRID + 1));
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, GRID + 1, GRID + 1, 0, gl.RED, gl.FLOAT, this.heightData);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    // orbit line buffer
    const ovao = gl.createVertexArray();
    if (!ovao) throw new Error("ovao");
    this.orbitVAO = ovao;
    gl.bindVertexArray(ovao);
    const obuf = gl.createBuffer();
    if (!obuf) throw new Error("obuf");
    this.orbitBuf = obuf;
    this.orbitData = new Float32Array(ORBIT_N * 3);
    gl.bindBuffer(gl.ARRAY_BUFFER, obuf);
    gl.bufferData(gl.ARRAY_BUFFER, this.orbitData, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 12, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 12, 8);
    gl.bindVertexArray(null);

    // moving read-point
    const pvao = gl.createVertexArray();
    if (!pvao) throw new Error("pvao");
    this.pointVAO = pvao;
    gl.bindVertexArray(pvao);
    const pbuf = gl.createBuffer();
    if (!pbuf) throw new Error("pbuf");
    this.pointBuf = pbuf;
    gl.bindBuffer(gl.ARRAY_BUFFER, pbuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(3), gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 12, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 12, 8);
    gl.bindVertexArray(null);

    gl.enable(gl.DEPTH_TEST);
  }

  // Recompute the height texture from the terrain function.
  updateTerrain(id: TerrainId, m: number) {
    const gl = this.gl;
    const w = GRID + 1;
    for (let j = 0; j < w; j++) {
      const y = (j / GRID) * 2 - 1;
      for (let i = 0; i < w; i++) {
        const x = (i / GRID) * 2 - 1;
        this.heightData[j * w + i] = terrainHeight(id, x, y, m);
      }
    }
    gl.bindTexture(gl.TEXTURE_2D, this.heightTex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, w, w, gl.RED, gl.FLOAT, this.heightData);
  }

  updateOrbit(id: TerrainId, orb: Orbit, m: number) {
    const gl = this.gl;
    for (let i = 0; i < ORBIT_N; i++) {
      const t = i / ORBIT_N;
      const [x, y] = orbitPoint(orb, t);
      this.orbitData[i * 3] = x;
      this.orbitData[i * 3 + 1] = y;
      this.orbitData[i * 3 + 2] = terrainHeight(id, x, y, m);
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, this.orbitBuf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.orbitData);
  }

  render(
    width: number,
    height: number,
    camAngle: number,
    readT: number,
    id: TerrainId,
    orb: Orbit,
    m: number,
    active: boolean,
  ) {
    const gl = this.gl;
    gl.viewport(0, 0, width, height);
    gl.clearColor(0.07, 0.05, 0.045, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    const aspect = width / Math.max(1, height);
    const proj = perspective((50 * Math.PI) / 180, aspect, 0.1, 20);
    const r = 2.7;
    const eye = [Math.cos(camAngle) * r, 1.7, Math.sin(camAngle) * r];
    const view = lookAt(eye, [0, -0.1, 0], [0, 1, 0]);
    const mvp = multiply(proj, view);

    // mesh
    gl.useProgram(this.meshProg);
    gl.uniformMatrix4fv(gl.getUniformLocation(this.meshProg, "uMVP"), false, mvp);
    gl.uniform1f(gl.getUniformLocation(this.meshProg, "uHScale"), this.hScale);
    gl.uniform1f(gl.getUniformLocation(this.meshProg, "uTime"), m);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.heightTex);
    gl.uniform1i(gl.getUniformLocation(this.meshProg, "uHeight"), 0);
    gl.bindVertexArray(this.meshVAO);
    gl.drawElements(gl.TRIANGLES, this.indexCount, gl.UNSIGNED_INT, 0);

    // orbit ring
    gl.disable(gl.DEPTH_TEST);
    gl.useProgram(this.orbitProg);
    gl.uniformMatrix4fv(gl.getUniformLocation(this.orbitProg, "uMVP"), false, mvp);
    gl.uniform1f(gl.getUniformLocation(this.orbitProg, "uHScale"), this.hScale);
    gl.uniform3f(
      gl.getUniformLocation(this.orbitProg, "uColor"),
      active ? 0.6 : 0.45,
      active ? 1.0 : 0.85,
      active ? 0.85 : 0.7,
    );
    gl.bindVertexArray(this.orbitVAO);
    gl.lineWidth(2);
    gl.drawArrays(gl.LINE_LOOP, 0, ORBIT_N);

    // moving read point
    const [px, py] = orbitPoint(orb, readT);
    const ph = terrainHeight(id, px, py, m);
    const pt = new Float32Array([px, py, ph]);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.pointBuf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, pt);
    gl.useProgram(this.pointProg);
    gl.uniformMatrix4fv(gl.getUniformLocation(this.pointProg, "uMVP"), false, mvp);
    gl.uniform1f(gl.getUniformLocation(this.pointProg, "uHScale"), this.hScale);
    gl.uniform3f(gl.getUniformLocation(this.pointProg, "uColor"), 1.0, 0.95, 0.7);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.bindVertexArray(this.pointVAO);
    gl.drawArrays(gl.POINTS, 0, 1);
    gl.disable(gl.BLEND);
    gl.enable(gl.DEPTH_TEST);

    gl.bindVertexArray(null);
  }

  dispose() {
    const gl = this.gl;
    try {
      gl.deleteProgram(this.meshProg);
      gl.deleteProgram(this.orbitProg);
      gl.deleteProgram(this.pointProg);
      gl.deleteVertexArray(this.meshVAO);
      gl.deleteVertexArray(this.orbitVAO);
      gl.deleteVertexArray(this.pointVAO);
      gl.deleteTexture(this.heightTex);
      gl.deleteBuffer(this.orbitBuf);
      gl.deleteBuffer(this.pointBuf);
      const ext = gl.getExtension("WEBGL_lose_context");
      ext?.loseContext();
    } catch {
      /* noop */
    }
  }
}
