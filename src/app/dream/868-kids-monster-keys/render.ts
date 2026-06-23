/**
 * render.ts — raw WebGL2 (hand-written GLSL ES 3.00) additive-blended creature
 * renderer. No three.js. The visible surface is WebGL2.
 *
 * Creatures are drawn as gl.POINTS, one per sounding note. The fragment shader
 * shapes each point from a baked radial-glow sprite:
 *   - consonant creature: round, steady soft blob.
 *   - wobble-monster: shivering soft spikes (angular ripple driven by wobble)
 *     plus a beating shimmer in brightness.
 * A full-screen warm gradient + slow vignette gives the friendly backdrop.
 *
 * The only offscreen 2D canvas use is to bake the radial-glow sprite texture.
 */

export type CreatureGPU = {
  x: number; // 0..1 screen
  y: number; // 0..1 screen
  hue: number; // degrees
  size: number; // base radius px
  wobble: number; // 0..1 monster-ness
  glow: number; // 0..1 brightness
};

const MAX_CREATURES = 32;

// ── Background full-screen pass ──────────────────────────────────────────────
const BG_VERT = `#version 300 es
precision highp float;
out vec2 vUv;
void main(){
  vec2 p = vec2(
    (gl_VertexID==1) ? 3.0 : -1.0,
    (gl_VertexID==2) ? 3.0 : -1.0
  );
  vUv = p * 0.5 + 0.5;
  gl_Position = vec4(p, 0.0, 1.0);
}`;

const BG_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 frag;
uniform float u_time;
uniform float u_energy;
void main(){
  vec2 uv = vUv;
  // Warm playful vertical gradient (deep plum -> warm ember).
  vec3 top = vec3(0.10, 0.05, 0.14);
  vec3 bot = vec3(0.20, 0.09, 0.08);
  vec3 col = mix(bot, top, uv.y);
  // Gentle breathing warm glow following audio energy.
  float d = distance(uv, vec2(0.5, 0.42));
  float breathe = 0.5 + 0.5 * sin(u_time * 0.6);
  col += vec3(0.16, 0.07, 0.03) * (0.4 + 0.6 * u_energy) *
         smoothstep(0.85, 0.0, d) * (0.6 + 0.4 * breathe);
  // Soft vignette.
  col *= smoothstep(1.25, 0.25, distance(uv, vec2(0.5)));
  frag = vec4(col, 1.0);
}`;

// ── Creature point pass (additive) ───────────────────────────────────────────
const PT_VERT = `#version 300 es
precision highp float;
layout(location=0) in vec2 a_pos;     // clip space
layout(location=1) in float a_size;   // point size px
layout(location=2) in vec3 a_color;   // rgb
layout(location=3) in float a_wobble; // 0..1
layout(location=4) in float a_glow;   // 0..1
out vec3 v_color;
out float v_wobble;
out float v_glow;
void main(){
  v_color = a_color;
  v_wobble = a_wobble;
  v_glow = a_glow;
  gl_Position = vec4(a_pos, 0.0, 1.0);
  gl_PointSize = a_size;
}`;

const PT_FRAG = `#version 300 es
precision highp float;
in vec3 v_color;
in float v_wobble;
in float v_glow;
out vec4 frag;
uniform sampler2D u_glow;
uniform float u_time;
void main(){
  vec2 pc = gl_PointCoord * 2.0 - 1.0; // -1..1
  float r = length(pc);
  float ang = atan(pc.y, pc.x);
  // Shivering soft spikes for the monster — angular ripple, fast shiver.
  float spikes = sin(ang * 7.0 + u_time * 9.0) * 0.12
               + sin(ang * 11.0 - u_time * 6.0) * 0.07;
  float edge = 0.92 - v_wobble * spikes; // wobble pushes the rim in/out
  if (r > edge) discard;
  // Sample baked radial glow, remapped to the wobbled radius.
  float gr = clamp(r / max(edge, 0.001), 0.0, 1.0);
  float a = texture(u_glow, vec2(gr * 0.5 + 0.5, 0.5)).r;
  // Beating shimmer in brightness for the monster (never affects audio gain).
  float beat = 1.0 + v_wobble * 0.35 * sin(u_time * 6.4);
  vec3 col = v_color * (0.55 + 0.9 * v_glow) * beat;
  frag = vec4(col * a, a); // additive (blendFunc ONE,ONE)
}`;

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type);
  if (!sh) throw new Error("shader alloc failed");
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh) ?? "unknown";
    gl.deleteShader(sh);
    throw new Error("shader compile: " + log);
  }
  return sh;
}

function link(gl: WebGL2RenderingContext, vs: string, fs: string): WebGLProgram {
  const p = gl.createProgram();
  if (!p) throw new Error("program alloc failed");
  const v = compile(gl, gl.VERTEX_SHADER, vs);
  const f = compile(gl, gl.FRAGMENT_SHADER, fs);
  gl.attachShader(p, v);
  gl.attachShader(p, f);
  gl.linkProgram(p);
  gl.deleteShader(v);
  gl.deleteShader(f);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(p) ?? "unknown";
    gl.deleteProgram(p);
    throw new Error("program link: " + log);
  }
  return p;
}

// Bake a 1-D radial glow gradient into a tiny texture (only offscreen 2D use).
function bakeGlowTexture(gl: WebGL2RenderingContext): WebGLTexture {
  const N = 128;
  const cv = document.createElement("canvas");
  cv.width = N;
  cv.height = 1;
  const c2d = cv.getContext("2d");
  if (!c2d) throw new Error("2d ctx for glow bake failed");
  const data = c2d.createImageData(N, 1);
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1); // 0 center .. 1 edge
    // Soft falloff: bright core, gentle halo.
    const a = Math.pow(1 - t, 2.2);
    const v = Math.round(255 * a);
    data.data[i * 4] = v;
    data.data[i * 4 + 1] = v;
    data.data[i * 4 + 2] = v;
    data.data[i * 4 + 3] = 255;
  }
  c2d.putImageData(data, 0, 0);
  const tex = gl.createTexture();
  if (!tex) throw new Error("glow texture alloc failed");
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, cv);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return tex;
}

function hueToRgb(h: number): [number, number, number] {
  const s = 0.85;
  const l = 0.6;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r = 0,
    g = 0,
    b = 0;
  if (hp < 1) [r, g, b] = [c, x, 0];
  else if (hp < 2) [r, g, b] = [x, c, 0];
  else if (hp < 3) [r, g, b] = [0, c, x];
  else if (hp < 4) [r, g, b] = [0, x, c];
  else if (hp < 5) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const m = l - c / 2;
  return [r + m, g + m, b + m];
}

export class Renderer {
  private gl: WebGL2RenderingContext;
  private bgProg: WebGLProgram;
  private ptProg: WebGLProgram;
  private glowTex: WebGLTexture;
  private vao: WebGLVertexArrayObject;
  private buffers: WebGLBuffer[] = [];
  private posBuf: WebGLBuffer;
  private sizeBuf: WebGLBuffer;
  private colBuf: WebGLBuffer;
  private wobBuf: WebGLBuffer;
  private glowBuf: WebGLBuffer;
  private loseExt: WEBGL_lose_context | null;
  private maxPointSize = 256;

  // CPU-side typed arrays reused each frame.
  private pos = new Float32Array(MAX_CREATURES * 2);
  private size = new Float32Array(MAX_CREATURES);
  private col = new Float32Array(MAX_CREATURES * 3);
  private wob = new Float32Array(MAX_CREATURES);
  private glow = new Float32Array(MAX_CREATURES);

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    this.bgProg = link(gl, BG_VERT, BG_FRAG);
    this.ptProg = link(gl, PT_VERT, PT_FRAG);
    this.glowTex = bakeGlowTexture(gl);
    this.loseExt = gl.getExtension("WEBGL_lose_context");
    // Some GPUs cap gl_PointSize; clamp to the reported aliased range.
    const range = gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE) as Float32Array | null;
    if (range && range.length >= 2 && range[1] > 0) {
      this.maxPointSize = range[1];
    }

    const vao = gl.createVertexArray();
    if (!vao) throw new Error("vao alloc failed");
    this.vao = vao;
    gl.bindVertexArray(vao);

    const mk = (loc: number, comps: number): WebGLBuffer => {
      const b = gl.createBuffer();
      if (!b) throw new Error("buffer alloc failed");
      gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, comps, gl.FLOAT, false, 0, 0);
      this.buffers.push(b);
      return b;
    };
    this.posBuf = mk(0, 2);
    this.sizeBuf = mk(1, 1);
    this.colBuf = mk(2, 3);
    this.wobBuf = mk(3, 1);
    this.glowBuf = mk(4, 1);
    gl.bindVertexArray(null);
  }

  draw(creatures: CreatureGPU[], time: number, energy: number, dpr: number): void {
    const gl = this.gl;
    const w = gl.drawingBufferWidth;
    const h = gl.drawingBufferHeight;
    gl.viewport(0, 0, w, h);
    gl.disable(gl.DEPTH_TEST);

    // Background pass (opaque).
    gl.disable(gl.BLEND);
    gl.useProgram(this.bgProg);
    gl.uniform1f(gl.getUniformLocation(this.bgProg, "u_time"), time);
    gl.uniform1f(gl.getUniformLocation(this.bgProg, "u_energy"), energy);
    gl.bindVertexArray(null);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // Creature pass (additive).
    const n = Math.min(creatures.length, MAX_CREATURES);
    for (let i = 0; i < n; i++) {
      const c = creatures[i];
      this.pos[i * 2] = c.x * 2 - 1;
      this.pos[i * 2 + 1] = (1 - c.y) * 2 - 1;
      this.size[i] = Math.min(c.size * dpr, this.maxPointSize);
      const [r, g, b] = hueToRgb(c.hue);
      this.col[i * 3] = r;
      this.col[i * 3 + 1] = g;
      this.col[i * 3 + 2] = b;
      this.wob[i] = c.wobble;
      this.glow[i] = c.glow;
    }
    if (n > 0) {
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE);
      gl.useProgram(this.ptProg);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.glowTex);
      gl.uniform1i(gl.getUniformLocation(this.ptProg, "u_glow"), 0);
      gl.uniform1f(gl.getUniformLocation(this.ptProg, "u_time"), time);

      gl.bindVertexArray(this.vao);
      const sub = (buf: WebGLBuffer, arr: Float32Array, count: number) => {
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, arr.subarray(0, count), gl.DYNAMIC_DRAW);
      };
      sub(this.posBuf, this.pos, n * 2);
      sub(this.sizeBuf, this.size, n);
      sub(this.colBuf, this.col, n * 3);
      sub(this.wobBuf, this.wob, n);
      sub(this.glowBuf, this.glow, n);
      gl.drawArrays(gl.POINTS, 0, n);
      gl.bindVertexArray(null);
    }
  }

  dispose(): void {
    const gl = this.gl;
    gl.deleteProgram(this.bgProg);
    gl.deleteProgram(this.ptProg);
    gl.deleteTexture(this.glowTex);
    for (const b of this.buffers) gl.deleteBuffer(b);
    gl.deleteVertexArray(this.vao);
    this.loseExt?.loseContext();
  }
}
