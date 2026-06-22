/*
 * 847 · FEEDBACK ECOLOGY II — raw WebGL2 renderer
 *
 * The jury hard-banned Canvas2D this cycle, so the evolving network is drawn
 * with raw WebGL2 (no three.js). The renderer makes the TOPOLOGY CHANGE
 * legible:
 *   - ping-pong FBO feedback-trail accumulation: each frame the previous frame
 *     is faded and fed back, so node/edge energy leaves luminous decaying
 *     trails — the "David Tudor feedback ecosystem" look that Canvas2D can't do
 *     cheaply.
 *   - nodes: additive point-sprite blobs; size + brightness ∝ energy, hue per
 *     node (820 palette).
 *   - edges: GPU line geometry; brightness/thickness ∝ live Hebbian weight ×
 *     signal flow, so you SEE links strengthen and die.
 *   - a faint Lorenz attractor trace in the background so the autonomous
 *     "weather" is visible.
 *
 * All GL resources are created once and deleted on dispose(); the context is
 * released via WEBGL_lose_context.
 */

import type { Edge, ResonatorNode } from "./audio";
import type { LorenzState } from "./evolution";

// ── Shader helpers ───────────────────────────────────────────────────────────

function compileShader(
  gl: WebGL2RenderingContext,
  type: number,
  src: string
): WebGLShader {
  const sh = gl.createShader(type);
  if (!sh) throw new Error("createShader failed");
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh) ?? "unknown";
    gl.deleteShader(sh);
    throw new Error("Shader compile error: " + log);
  }
  return sh;
}

function linkProgram(
  gl: WebGL2RenderingContext,
  vsSrc: string,
  fsSrc: string
): WebGLProgram {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vsSrc);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fsSrc);
  const prog = gl.createProgram();
  if (!prog) throw new Error("createProgram failed");
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  // Shaders can be detached/deleted once linked.
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(prog) ?? "unknown";
    gl.deleteProgram(prog);
    throw new Error("Program link error: " + log);
  }
  return prog;
}

// ── Shaders ──────────────────────────────────────────────────────────────────

// Fullscreen triangle, used for trail-fade and final composite.
const QUAD_VS = `#version 300 es
precision highp float;
layout(location=0) in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

// Fade the accumulation texture toward black and add the new layer is done by
// drawing the new geometry ON TOP of a faded copy of the previous frame.
const TRAIL_FS = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_prev;
uniform float u_fade;     // how much of previous frame survives (0..1)
out vec4 o_color;
void main() {
  vec4 prev = texture(u_prev, v_uv);
  o_color = prev * u_fade;
}`;

// Composite accumulation buffer to screen with a slight tone curve + vignette.
const COMPOSITE_FS = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_tex;
uniform float u_weather; // background hue/intensity drive from Lorenz
out vec4 o_color;
void main() {
  vec3 c = texture(u_tex, v_uv).rgb;
  // subtle filmic-ish lift on the trails
  c = c / (c + vec3(0.85)) * 1.85;
  // faint cool background tint that breathes with the Lorenz weather
  float vig = smoothstep(1.25, 0.2, length(v_uv - 0.5) * 1.4);
  vec3 bg = mix(vec3(0.02, 0.03, 0.06), vec3(0.04, 0.03, 0.09), u_weather);
  c += bg * vig;
  o_color = vec4(c, 1.0);
}`;

// Node blobs: instanced point sprites via gl_PointSize.
const NODE_VS = `#version 300 es
precision highp float;
layout(location=0) in vec2 a_pos;     // [0,1] node position
layout(location=1) in float a_energy; // 0..1
layout(location=2) in float a_hue;    // degrees
out float v_energy;
out float v_hue;
uniform float u_pxScale;
void main() {
  vec2 clip = a_pos * 2.0 - 1.0;
  clip.y = -clip.y;
  gl_Position = vec4(clip, 0.0, 1.0);
  gl_PointSize = (26.0 + a_energy * 120.0) * u_pxScale;
  v_energy = a_energy;
  v_hue = a_hue;
}`;

const NODE_FS = `#version 300 es
precision highp float;
in float v_energy;
in float v_hue;
out vec4 o_color;
vec3 hsl2rgb(float h, float s, float l) {
  h = mod(h, 360.0) / 360.0;
  vec3 rgb = clamp(abs(mod(h*6.0 + vec3(0.0,4.0,2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
  float c = (1.0 - abs(2.0*l - 1.0)) * s;
  return l + c * (rgb - 0.5);
}
void main() {
  vec2 d = gl_PointCoord - 0.5;
  float r = length(d) * 2.0;
  // soft additive blob: bright core, falloff to edge
  float core = smoothstep(1.0, 0.0, r);
  float glow = pow(core, 2.2);
  float bright = 0.35 + v_energy * 0.65;
  vec3 col = hsl2rgb(v_hue, 0.8, 0.45 + v_energy * 0.25);
  float a = glow * bright;
  o_color = vec4(col * a, a);
}`;

// Edge lines: brightness/alpha ∝ live weight × flow; thickness faked via alpha.
const EDGE_VS = `#version 300 es
precision highp float;
layout(location=0) in vec2 a_pos;   // endpoint [0,1]
layout(location=1) in float a_intensity;
layout(location=2) in float a_hue;
out float v_intensity;
out float v_hue;
void main() {
  vec2 clip = a_pos * 2.0 - 1.0;
  clip.y = -clip.y;
  gl_Position = vec4(clip, 0.0, 1.0);
  v_intensity = a_intensity;
  v_hue = a_hue;
}`;

const EDGE_FS = `#version 300 es
precision highp float;
in float v_intensity;
in float v_hue;
out vec4 o_color;
vec3 hsl2rgb(float h, float s, float l) {
  h = mod(h, 360.0) / 360.0;
  vec3 rgb = clamp(abs(mod(h*6.0 + vec3(0.0,4.0,2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
  float c = (1.0 - abs(2.0*l - 1.0)) * s;
  return l + c * (rgb - 0.5);
}
void main() {
  vec3 col = hsl2rgb(v_hue, 0.7, 0.55);
  float a = v_intensity;
  o_color = vec4(col * a, a);
}`;

// Lorenz weather trace: a faint point cloud of recent attractor positions.
const LORENZ_VS = `#version 300 es
precision highp float;
layout(location=0) in vec2 a_pos;    // [0,1]
layout(location=1) in float a_age;   // 0 (oldest) .. 1 (newest)
out float v_age;
void main() {
  vec2 clip = a_pos * 2.0 - 1.0;
  clip.y = -clip.y;
  gl_Position = vec4(clip, 0.0, 1.0);
  gl_PointSize = 1.5 + a_age * 2.5;
  v_age = a_age;
}`;

const LORENZ_FS = `#version 300 es
precision highp float;
in float v_age;
out vec4 o_color;
void main() {
  vec2 d = gl_PointCoord - 0.5;
  float r = length(d) * 2.0;
  float core = smoothstep(1.0, 0.0, r);
  float a = core * (0.05 + v_age * 0.16);
  vec3 col = vec3(0.45, 0.6, 0.95);
  o_color = vec4(col * a, a);
}`;

// ── FBO ──────────────────────────────────────────────────────────────────────

interface Fbo {
  fb: WebGLFramebuffer;
  tex: WebGLTexture;
}

function createFbo(gl: WebGL2RenderingContext, w: number, h: number): Fbo {
  const tex = gl.createTexture();
  if (!tex) throw new Error("createTexture failed");
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  const fb = gl.createFramebuffer();
  if (!fb) throw new Error("createFramebuffer failed");
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return { fb, tex };
}

// ── Renderer ─────────────────────────────────────────────────────────────────

const LORENZ_TRAIL = 600; // recent attractor positions kept for the weather trace

export class NetworkRenderer {
  private gl: WebGL2RenderingContext;
  private w = 1;
  private h = 1;

  private quadProg: WebGLProgram;
  private compositeProg: WebGLProgram;
  private nodeProg: WebGLProgram;
  private edgeProg: WebGLProgram;
  private lorenzProg: WebGLProgram;

  private quadVao: WebGLVertexArrayObject;
  private quadBuf: WebGLBuffer;

  private nodeVao: WebGLVertexArrayObject;
  private nodeBuf: WebGLBuffer; // interleaved x,y,energy,hue
  private nodeData: Float32Array;

  private edgeVao: WebGLVertexArrayObject;
  private edgeBuf: WebGLBuffer; // interleaved per-vertex x,y,intensity,hue (2 verts/edge)
  private edgeData: Float32Array;

  private lorenzVao: WebGLVertexArrayObject;
  private lorenzBuf: WebGLBuffer; // x,y,age
  private lorenzData: Float32Array;
  private lorenzHead = 0;
  private lorenzCount = 0;

  private fboA: Fbo;
  private fboB: Fbo;
  private readFromA = true;

  private nodeCount: number;
  private edgeCount: number;

  constructor(
    gl: WebGL2RenderingContext,
    nodeCount: number,
    edgeCount: number
  ) {
    this.gl = gl;
    this.nodeCount = nodeCount;
    this.edgeCount = edgeCount;

    this.quadProg = linkProgram(gl, QUAD_VS, TRAIL_FS);
    this.compositeProg = linkProgram(gl, QUAD_VS, COMPOSITE_FS);
    this.nodeProg = linkProgram(gl, NODE_VS, NODE_FS);
    this.edgeProg = linkProgram(gl, EDGE_VS, EDGE_FS);
    this.lorenzProg = linkProgram(gl, LORENZ_VS, LORENZ_FS);

    // Fullscreen triangle.
    const quadBuf = gl.createBuffer();
    const quadVao = gl.createVertexArray();
    if (!quadBuf || !quadVao) throw new Error("quad alloc failed");
    this.quadBuf = quadBuf;
    this.quadVao = quadVao;
    gl.bindVertexArray(quadVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 3, -1, -1, 3]),
      gl.STATIC_DRAW
    );
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    // Node buffer: 4 floats per node (x,y,energy,hue).
    this.nodeData = new Float32Array(nodeCount * 4);
    const nodeBuf = gl.createBuffer();
    const nodeVao = gl.createVertexArray();
    if (!nodeBuf || !nodeVao) throw new Error("node alloc failed");
    this.nodeBuf = nodeBuf;
    this.nodeVao = nodeVao;
    gl.bindVertexArray(nodeVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, nodeBuf);
    gl.bufferData(gl.ARRAY_BUFFER, this.nodeData.byteLength, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 16, 8);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 16, 12);

    // Edge buffer: 2 verts per edge, 4 floats per vert (x,y,intensity,hue).
    this.edgeData = new Float32Array(edgeCount * 2 * 4);
    const edgeBuf = gl.createBuffer();
    const edgeVao = gl.createVertexArray();
    if (!edgeBuf || !edgeVao) throw new Error("edge alloc failed");
    this.edgeBuf = edgeBuf;
    this.edgeVao = edgeVao;
    gl.bindVertexArray(edgeVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, edgeBuf);
    gl.bufferData(gl.ARRAY_BUFFER, this.edgeData.byteLength, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 16, 8);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 16, 12);

    // Lorenz trail buffer: 3 floats per point (x,y,age).
    this.lorenzData = new Float32Array(LORENZ_TRAIL * 3);
    const lorenzBuf = gl.createBuffer();
    const lorenzVao = gl.createVertexArray();
    if (!lorenzBuf || !lorenzVao) throw new Error("lorenz alloc failed");
    this.lorenzBuf = lorenzBuf;
    this.lorenzVao = lorenzVao;
    gl.bindVertexArray(lorenzVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, lorenzBuf);
    gl.bufferData(gl.ARRAY_BUFFER, this.lorenzData.byteLength, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 12, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 12, 8);

    gl.bindVertexArray(null);

    this.fboA = createFbo(gl, 1, 1);
    this.fboB = createFbo(gl, 1, 1);
  }

  resize(w: number, h: number): void {
    const gl = this.gl;
    this.w = Math.max(1, w);
    this.h = Math.max(1, h);
    for (const fbo of [this.fboA, this.fboB]) {
      gl.bindTexture(gl.TEXTURE_2D, fbo.tex);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        this.w,
        this.h,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        null
      );
    }
    gl.bindTexture(gl.TEXTURE_2D, null);
  }

  /** Push the latest Lorenz position into the ring buffer for the weather trace. */
  pushLorenz(L: LorenzState): void {
    // Project Lorenz x/z to screen space; keep it small and centred so it reads
    // as faint background weather, not a foreground object.
    const px = 0.5 + (L.x / 24) * 0.42;
    const py = 0.5 - ((L.z - 25) / 50) * 0.42;
    const base = this.lorenzHead * 3;
    this.lorenzData[base] = px;
    this.lorenzData[base + 1] = py;
    this.lorenzData[base + 2] = 1; // newest; age rewritten on draw
    this.lorenzHead = (this.lorenzHead + 1) % LORENZ_TRAIL;
    if (this.lorenzCount < LORENZ_TRAIL) this.lorenzCount++;
  }

  /**
   * Render one frame. `edgeIntensity[i]` is the live draw intensity for
   * edges[i] (Hebbian weight × signal flow × global coupling), already in
   * [0,1]. `weather` (Lorenz nz) drives the background tint.
   */
  render(
    nodes: ResonatorNode[],
    edges: Edge[],
    edgeIntensity: Float32Array,
    weather: number
  ): void {
    const gl = this.gl;
    const fade = 0.9; // trail persistence — high = long luminous decay

    // Pack node data.
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      const o = i * 4;
      this.nodeData[o] = n.x;
      this.nodeData[o + 1] = n.y;
      this.nodeData[o + 2] = Math.min(n.energy, 1);
      this.nodeData[o + 3] = n.hue;
    }

    // Pack edge data (2 verts/edge).
    for (let e = 0; e < edges.length; e++) {
      const a = nodes[edges[e].from];
      const b = nodes[edges[e].to];
      const inten = edgeIntensity[e];
      const o = e * 8;
      this.edgeData[o] = a.x;
      this.edgeData[o + 1] = a.y;
      this.edgeData[o + 2] = inten;
      this.edgeData[o + 3] = a.hue;
      this.edgeData[o + 4] = b.x;
      this.edgeData[o + 5] = b.y;
      this.edgeData[o + 6] = inten;
      this.edgeData[o + 7] = b.hue;
    }

    // Pack Lorenz trail with ages (oldest→0, newest→1).
    for (let k = 0; k < this.lorenzCount; k++) {
      // index in chronological order; newest is (lorenzHead-1)
      const idx = (this.lorenzHead - 1 - k + LORENZ_TRAIL * 2) % LORENZ_TRAIL;
      this.lorenzData[idx * 3 + 2] = 1 - k / this.lorenzCount;
    }

    const src = this.readFromA ? this.fboA : this.fboB;
    const dst = this.readFromA ? this.fboB : this.fboA;

    // PASS 1 — fade previous frame into the destination FBO.
    gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fb);
    gl.viewport(0, 0, this.w, this.h);
    gl.disable(gl.BLEND);
    gl.useProgram(this.quadProg);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, src.tex);
    gl.uniform1i(gl.getUniformLocation(this.quadProg, "u_prev"), 0);
    gl.uniform1f(gl.getUniformLocation(this.quadProg, "u_fade"), fade);
    gl.bindVertexArray(this.quadVao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // PASS 2 — additive draw of new geometry on top of the faded trails.
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);

    // Lorenz weather trace (drawn first, faintest).
    gl.bindVertexArray(this.lorenzVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.lorenzBuf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.lorenzData);
    gl.useProgram(this.lorenzProg);
    gl.drawArrays(gl.POINTS, 0, this.lorenzCount);

    // Edges.
    gl.bindVertexArray(this.edgeVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.edgeBuf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.edgeData);
    gl.useProgram(this.edgeProg);
    gl.lineWidth(1); // most platforms clamp to 1; thickness conveyed via alpha
    gl.drawArrays(gl.LINES, 0, edges.length * 2);

    // Nodes (point sprites).
    gl.bindVertexArray(this.nodeVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.nodeBuf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.nodeData);
    gl.useProgram(this.nodeProg);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    gl.uniform1f(gl.getUniformLocation(this.nodeProg, "u_pxScale"), dpr);
    gl.drawArrays(gl.POINTS, 0, nodes.length);

    // PASS 3 — composite the accumulation buffer to the screen.
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.w, this.h);
    gl.disable(gl.BLEND);
    gl.useProgram(this.compositeProg);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, dst.tex);
    gl.uniform1i(gl.getUniformLocation(this.compositeProg, "u_tex"), 0);
    gl.uniform1f(gl.getUniformLocation(this.compositeProg, "u_weather"), weather);
    gl.bindVertexArray(this.quadVao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    gl.bindVertexArray(null);
    this.readFromA = !this.readFromA;
  }

  dispose(): void {
    const gl = this.gl;
    gl.deleteProgram(this.quadProg);
    gl.deleteProgram(this.compositeProg);
    gl.deleteProgram(this.nodeProg);
    gl.deleteProgram(this.edgeProg);
    gl.deleteProgram(this.lorenzProg);
    gl.deleteBuffer(this.quadBuf);
    gl.deleteBuffer(this.nodeBuf);
    gl.deleteBuffer(this.edgeBuf);
    gl.deleteBuffer(this.lorenzBuf);
    gl.deleteVertexArray(this.quadVao);
    gl.deleteVertexArray(this.nodeVao);
    gl.deleteVertexArray(this.edgeVao);
    gl.deleteVertexArray(this.lorenzVao);
    gl.deleteTexture(this.fboA.tex);
    gl.deleteTexture(this.fboB.tex);
    gl.deleteFramebuffer(this.fboA.fb);
    gl.deleteFramebuffer(this.fboB.fb);
    gl.getExtension("WEBGL_lose_context")?.loseContext();
  }
}
