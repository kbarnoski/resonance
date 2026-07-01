// gl.ts — RAW WebGL2 fragment-shader Physarum (the point of this cycle-3
// variant: the living slime-mold field runs in hand-written GLSL, NOT WebGPU
// compute and NOT three.js). Technique lineage: Jeff Jones' Physarum transport
// model (2010), Sage Jenson's "physarum" model, and Maximilian Klein's "Fast
// Physarum in the Browser with WebGL2" — agent state lives in a float texture
// and is stepped by fragment shaders into ping-pong targets.
//
// State + passes per frame (two species, packed into trail .r / .g):
//   • AGENT texture (RGBA32F, AT×AT texels = AT² agents PER species):
//       texel = (x, y, heading, seed). Two pools A + B, each ping-ponged.
//   • AGENT-UPDATE pass (fullscreen quad -> agent FBO): read this agent's
//       state, sense the trail (sum of both channels) + nutrient wells at three
//       points ahead, steer toward the strongest, step, wrap, write new state.
//   • DEPOSIT pass (GL_POINTS, one vertex per agent via gl_VertexID -> trail
//       FBO, additive blend, colour-masked to the species' channel): the vertex
//       shader texelFetches the agent's NEW position and splats a deposit.
//   • DIFFUSE pass (fullscreen quad): 3×3 box blur × decay of both channels +
//       baked node glow -> the other trail target.
//   • RENDER pass: colourise the two channels + gold node cores to the screen.
//   • REDUCE + readback: downsample the summed field to a small NORMALISED grid
//       and readPixels it, so graph extraction runs the SAME code as the CPU
//       fallback on the SAME kind of 0..1 field.
//
// Requires EXT_color_buffer_float (float render targets). If absent the caller
// falls back to the CPU Physarum in physarum.ts.

import { PARAMS, FIELD_K, type Node } from "./physarum";

export const MAX_NODES = 24;

interface GLProgram {
  prog: WebGLProgram;
  attribs: Record<string, number>;
  uniforms: Record<string, WebGLUniformLocation | null>;
}

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

function link(
  gl: WebGL2RenderingContext,
  vs: string,
  fs: string,
  attribNames: string[],
  uniformNames: string[],
): GLProgram {
  const prog = gl.createProgram();
  if (!prog) throw new Error("program alloc failed");
  const v = compile(gl, gl.VERTEX_SHADER, vs);
  const f = compile(gl, gl.FRAGMENT_SHADER, fs);
  gl.attachShader(prog, v);
  gl.attachShader(prog, f);
  gl.linkProgram(prog);
  gl.deleteShader(v);
  gl.deleteShader(f);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(prog);
    gl.deleteProgram(prog);
    throw new Error("program link: " + log);
  }
  const attribs: Record<string, number> = {};
  for (const a of attribNames) attribs[a] = gl.getAttribLocation(prog, a);
  const uniforms: Record<string, WebGLUniformLocation | null> = {};
  for (const u of uniformNames) uniforms[u] = gl.getUniformLocation(prog, u);
  return { prog, attribs, uniforms };
}

// ── shaders ──────────────────────────────────────────────────────────────────
const QUAD_VS = `#version 300 es
precision highp float;
in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

const NODE_UNIFORMS = `
uniform int u_nodeCount;
uniform vec2 u_nodePos[${MAX_NODES}];
uniform float u_nodeStr[${MAX_NODES}];
uniform float u_nodeDeg[${MAX_NODES}];`;

// Agent update: sense-3-ahead / steer-to-strongest / step / wrap / deposit-later.
const AGENT_FS = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_agents;
uniform sampler2D u_trail;
uniform vec2 u_field;
uniform float u_senseAngle, u_senseDist, u_turn, u_move, u_nutrient;
uniform float u_seed;
${NODE_UNIFORMS}
out vec4 o;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float senseAt(vec2 p) {
  vec2 uv = fract(p / u_field);
  vec2 t = texture(u_trail, uv).rg;
  float v = t.r + t.g;
  for (int k = 0; k < ${MAX_NODES}; k++) {
    if (k >= u_nodeCount) break;
    vec2 d = p - u_nodePos[k] * u_field;
    float r = 40.0;
    v += u_nodeStr[k] * u_nutrient * exp(-dot(d, d) / (r * r));
  }
  return v;
}

void main() {
  vec4 a = texture(u_agents, v_uv);
  vec2 pos = a.xy;
  float hd = a.z;
  float sd = u_senseDist;
  float fC = senseAt(pos + vec2(cos(hd), sin(hd)) * sd);
  float fL = senseAt(pos + vec2(cos(hd - u_senseAngle), sin(hd - u_senseAngle)) * sd);
  float fR = senseAt(pos + vec2(cos(hd + u_senseAngle), sin(hd + u_senseAngle)) * sd);

  float nh = hd;
  float rnd = hash(v_uv * 512.0 + u_seed);
  if (fC > fL && fC > fR) {
    // straight on
  } else if (fC < fL && fC < fR) {
    nh += (rnd < 0.5 ? -1.0 : 1.0) * u_turn;
  } else if (fL > fR) {
    nh -= u_turn;
  } else if (fR > fL) {
    nh += u_turn;
  }

  vec2 np = pos + vec2(cos(nh), sin(nh)) * u_move;
  np = mod(np + u_field, u_field);
  o = vec4(np, nh, a.w);
}`;

// Deposit: one GL_POINTS vertex per agent; texelFetch its NEW position, splat.
const DEPOSIT_VS = `#version 300 es
precision highp float;
uniform sampler2D u_agents;
uniform ivec2 u_agentDims;
uniform vec2 u_field;
void main() {
  int id = gl_VertexID;
  int ax = id % u_agentDims.x;
  int ay = id / u_agentDims.x;
  vec2 pos = texelFetch(u_agents, ivec2(ax, ay), 0).xy;
  vec2 p = pos / u_field;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
  gl_PointSize = 1.0;
}`;

const DEPOSIT_FS = `#version 300 es
precision highp float;
uniform float u_deposit;
out vec4 o;
void main() { o = vec4(u_deposit); }`;

// Diffuse + decay both channels + bake node glow.
const DIFFUSE_FS = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_trail;
uniform vec2 u_field;
uniform float u_decay, u_diffuse;
uniform float u_nutrient;
${NODE_UNIFORMS}
out vec4 o;
void main() {
  vec2 texel = 1.0 / u_field;
  vec2 box = vec2(0.0);
  for (int dy = -1; dy <= 1; dy++) {
    for (int dx = -1; dx <= 1; dx++) {
      box += texture(u_trail, fract(v_uv + vec2(float(dx), float(dy)) * texel)).rg;
    }
  }
  box /= 9.0;
  vec2 cur = texture(u_trail, v_uv).rg;
  vec2 nv = (cur * (1.0 - u_diffuse) + box * u_diffuse) * u_decay;

  vec2 p = v_uv * u_field;
  for (int k = 0; k < ${MAX_NODES}; k++) {
    if (k >= u_nodeCount) break;
    vec2 d = p - u_nodePos[k] * u_field;
    float r = 9.0;
    float g = u_nodeStr[k] * 0.32 * exp(-dot(d, d) / (r * r));
    nv += vec2(g);
  }
  o = vec4(nv, 0.0, 1.0);
}`;

// Render both channels + gold node cores to the screen.
const RENDER_FS = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_trail;
${NODE_UNIFORMS}
out vec4 o;
void main() {
  // Flip Y for display so node.y=0 shows at the TOP, matching the CPU path's
  // ImageData rows and the shared 2D graph overlay (which draws y downward).
  vec2 uv = vec2(v_uv.x, 1.0 - v_uv.y);
  vec2 t = texture(u_trail, uv).rg;
  float a = 1.0 - exp(-t.r * 0.55); // species A -> cyan/teal
  float b = 1.0 - exp(-t.g * 0.55); // species B -> violet/magenta
  vec3 col = vec3(0.024, 0.016, 0.086)
           + vec3(0.27, 0.75, 0.80) * a
           + vec3(0.60, 0.24, 0.85) * b;
  for (int k = 0; k < ${MAX_NODES}; k++) {
    if (k >= u_nodeCount) break;
    vec2 d = uv - u_nodePos[k];
    float g = u_nodeStr[k] * 0.9 * exp(-dot(d, d) / 0.0006);
    float heat = clamp(u_nodeDeg[k] / 6.0, 0.0, 1.0);
    col += vec3(g, g * (0.82 + heat * 0.15), g * (0.5 + heat * 0.3));
  }
  o = vec4(col, 1.0);
}`;

// Reduce: average a block of the summed field into a small NORMALISED grid.
const REDUCE_FS = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_trail;
uniform vec2 u_field;
uniform float u_k;
out vec4 o;
void main() {
  vec2 texel = 1.0 / u_field;
  float s = 0.0;
  for (int dy = 0; dy < 4; dy++) {
    for (int dx = 0; dx < 4; dx++) {
      vec2 off = (vec2(float(dx), float(dy)) - 1.5) * texel;
      vec2 t = texture(u_trail, v_uv + off).rg;
      s += t.r + t.g;
    }
  }
  s /= 16.0;
  float n = 1.0 - exp(-s * u_k);
  o = vec4(n, n, n, 1.0);
}`;

export class WebGL2Physarum {
  private gl: WebGL2RenderingContext;
  readonly fieldSize: number;
  readonly agentDim: number;
  readonly agentsPerSpecies: number;

  private agentProg: GLProgram;
  private depositProg: GLProgram;
  private diffuseProg: GLProgram;
  private renderProg: GLProgram;
  private reduceProg: GLProgram;

  private agentA: [WebGLTexture, WebGLTexture];
  private agentB: [WebGLTexture, WebGLTexture];
  private agentFboA: [WebGLFramebuffer, WebGLFramebuffer];
  private agentFboB: [WebGLFramebuffer, WebGLFramebuffer];
  private trail: [WebGLTexture, WebGLTexture];
  private trailFbo: [WebGLFramebuffer, WebGLFramebuffer];
  private reduceTex: WebGLTexture;
  private reduceFbo: WebGLFramebuffer;

  private curAgentA = 0;
  private curAgentB = 0;
  private curTrail = 0;

  private quadVbo: WebGLBuffer;
  private emptyVao: WebGLVertexArrayObject;
  private quadVao: WebGLVertexArrayObject;

  readonly readSize: number;
  private readBuf: Float32Array;
  private readField: Float32Array;

  constructor(gl: WebGL2RenderingContext, fieldSize: number, agentDim: number, readSize: number) {
    this.gl = gl;
    if (!gl.getExtension("EXT_color_buffer_float")) {
      throw new Error("EXT_color_buffer_float unavailable (no float render targets)");
    }
    this.fieldSize = fieldSize;
    this.agentDim = agentDim;
    this.agentsPerSpecies = agentDim * agentDim;
    this.readSize = readSize;
    this.readBuf = new Float32Array(readSize * readSize * 4);
    this.readField = new Float32Array(readSize * readSize);

    this.agentProg = link(
      gl, QUAD_VS, AGENT_FS, ["a_pos"],
      ["u_agents", "u_trail", "u_field", "u_senseAngle", "u_senseDist", "u_turn", "u_move",
        "u_nutrient", "u_seed", "u_nodeCount", "u_nodePos", "u_nodeStr", "u_nodeDeg"],
    );
    this.depositProg = link(gl, DEPOSIT_VS, DEPOSIT_FS, [], ["u_agents", "u_agentDims", "u_field", "u_deposit"]);
    this.diffuseProg = link(
      gl, QUAD_VS, DIFFUSE_FS, ["a_pos"],
      ["u_trail", "u_field", "u_decay", "u_diffuse", "u_nutrient", "u_nodeCount", "u_nodePos", "u_nodeStr", "u_nodeDeg"],
    );
    this.renderProg = link(
      gl, QUAD_VS, RENDER_FS, ["a_pos"],
      ["u_trail", "u_nodeCount", "u_nodePos", "u_nodeStr", "u_nodeDeg"],
    );
    this.reduceProg = link(gl, QUAD_VS, REDUCE_FS, ["a_pos"], ["u_trail", "u_field", "u_k"]);

    // fullscreen triangle
    this.quadVbo = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadVbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    this.quadVao = gl.createVertexArray()!;
    gl.bindVertexArray(this.quadVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadVbo);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    // empty VAO for attribute-less GL_POINTS deposit (gl_VertexID only)
    this.emptyVao = gl.createVertexArray()!;

    // agent + trail targets
    this.agentA = [this.makeAgentTex(), this.makeAgentTex()];
    this.agentB = [this.makeAgentTex(), this.makeAgentTex()];
    this.seedAgentTex(this.agentA[0]);
    this.seedAgentTex(this.agentA[1]);
    this.seedAgentTex(this.agentB[0]);
    this.seedAgentTex(this.agentB[1]);
    this.agentFboA = [this.makeFbo(this.agentA[0]), this.makeFbo(this.agentA[1])];
    this.agentFboB = [this.makeFbo(this.agentB[0]), this.makeFbo(this.agentB[1])];

    this.trail = [this.makeTrailTex(), this.makeTrailTex()];
    this.trailFbo = [this.makeFbo(this.trail[0]), this.makeFbo(this.trail[1])];

    this.reduceTex = this.makeReduceTex();
    this.reduceFbo = this.makeFbo(this.reduceTex);

    // clear both trail targets
    for (let i = 0; i < 2; i++) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.trailFbo[i]);
      gl.viewport(0, 0, fieldSize, fieldSize);
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  private makeAgentTex(): WebGLTexture {
    const gl = this.gl;
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, this.agentDim, this.agentDim, 0, gl.RGBA, gl.FLOAT, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return tex;
  }

  private seedAgentTex(tex: WebGLTexture): void {
    const gl = this.gl;
    const n = this.agentsPerSpecies;
    const data = new Float32Array(n * 4);
    const c = this.fieldSize * 0.5;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * this.fieldSize * 0.34;
      data[i * 4] = c + Math.cos(a) * r;
      data[i * 4 + 1] = c + Math.sin(a) * r;
      data[i * 4 + 2] = Math.random() * Math.PI * 2;
      data[i * 4 + 3] = Math.random();
    }
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, this.agentDim, this.agentDim, 0, gl.RGBA, gl.FLOAT, data);
  }

  private makeTrailTex(): WebGLTexture {
    const gl = this.gl;
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, this.fieldSize, this.fieldSize, 0, gl.RGBA, gl.HALF_FLOAT, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    return tex;
  }

  private makeReduceTex(): WebGLTexture {
    const gl = this.gl;
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, this.readSize, this.readSize, 0, gl.RGBA, gl.FLOAT, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return tex;
  }

  private makeFbo(tex: WebGLTexture): WebGLFramebuffer {
    const gl = this.gl;
    const fbo = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
      throw new Error("WebGL2 framebuffer incomplete (float target unsupported)");
    }
    return fbo;
  }

  private drawQuad(): void {
    const gl = this.gl;
    gl.bindVertexArray(this.quadVao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
  }

  private setNodeUniforms(p: GLProgram, nodes: Node[]): number {
    const gl = this.gl;
    const alive = nodes.filter((n) => n.alive).slice(0, MAX_NODES);
    const pos = new Float32Array(MAX_NODES * 2);
    const str = new Float32Array(MAX_NODES);
    const deg = new Float32Array(MAX_NODES);
    for (let i = 0; i < alive.length; i++) {
      pos[i * 2] = alive[i].x;
      pos[i * 2 + 1] = alive[i].y;
      str[i] = alive[i].strength;
      deg[i] = alive[i].degree;
    }
    if (p.uniforms.u_nodeCount) gl.uniform1i(p.uniforms.u_nodeCount, alive.length);
    if (p.uniforms.u_nodePos) gl.uniform2fv(p.uniforms.u_nodePos, pos);
    if (p.uniforms.u_nodeStr) gl.uniform1fv(p.uniforms.u_nodeStr, str);
    if (p.uniforms.u_nodeDeg) gl.uniform1fv(p.uniforms.u_nodeDeg, deg);
    return alive.length;
  }

  private updateSpecies(
    prog: GLProgram,
    srcTex: WebGLTexture,
    dstFbo: WebGLFramebuffer,
    senseAngle: number,
    nodes: Node[],
    seed: number,
  ): void {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, dstFbo);
    gl.viewport(0, 0, this.agentDim, this.agentDim);
    gl.useProgram(prog.prog);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, srcTex);
    gl.uniform1i(prog.uniforms.u_agents, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.trail[this.curTrail]);
    gl.uniform1i(prog.uniforms.u_trail, 1);
    gl.uniform2f(prog.uniforms.u_field, this.fieldSize, this.fieldSize);
    gl.uniform1f(prog.uniforms.u_senseAngle, senseAngle);
    gl.uniform1f(prog.uniforms.u_senseDist, PARAMS.senseDist);
    gl.uniform1f(prog.uniforms.u_turn, PARAMS.turnSpeed);
    gl.uniform1f(prog.uniforms.u_move, PARAMS.moveSpeed);
    gl.uniform1f(prog.uniforms.u_nutrient, PARAMS.nutrientPull);
    gl.uniform1f(prog.uniforms.u_seed, seed);
    this.setNodeUniforms(prog, nodes);
    this.drawQuad();
  }

  private deposit(agentTex: WebGLTexture, channel: 0 | 1): void {
    const gl = this.gl;
    gl.useProgram(this.depositProg.prog);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, agentTex);
    gl.uniform1i(this.depositProg.uniforms.u_agents, 0);
    gl.uniform2i(this.depositProg.uniforms.u_agentDims, this.agentDim, this.agentDim);
    gl.uniform2f(this.depositProg.uniforms.u_field, this.fieldSize, this.fieldSize);
    gl.uniform1f(this.depositProg.uniforms.u_deposit, PARAMS.depositAmount);
    gl.colorMask(channel === 0, channel === 1, false, false);
    gl.bindVertexArray(this.emptyVao);
    gl.drawArrays(gl.POINTS, 0, this.agentsPerSpecies);
    gl.bindVertexArray(null);
    gl.colorMask(true, true, true, true);
  }

  // One simulation step: update both species, deposit, diffuse. Leaves the
  // freshly-diffused field in trail[curTrail].
  step(nodes: Node[], time: number): void {
    const gl = this.gl;
    gl.disable(gl.BLEND);

    // 1) update agents (both species sense the current trail)
    const srcA = this.curAgentA;
    const srcB = this.curAgentB;
    this.updateSpecies(this.agentProg, this.agentA[srcA], this.agentFboA[1 - srcA], PARAMS.senseAngleA, nodes, time);
    this.updateSpecies(this.agentProg, this.agentB[srcB], this.agentFboB[1 - srcB], PARAMS.senseAngleB, nodes, time + 0.5);
    this.curAgentA = 1 - srcA;
    this.curAgentB = 1 - srcB;

    // 2) deposit new positions additively into the current trail
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.trailFbo[this.curTrail]);
    gl.viewport(0, 0, this.fieldSize, this.fieldSize);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    this.deposit(this.agentA[this.curAgentA], 0);
    this.deposit(this.agentB[this.curAgentB], 1);
    gl.disable(gl.BLEND);

    // 3) diffuse + decay + node glow -> the other trail target
    const dst = 1 - this.curTrail;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.trailFbo[dst]);
    gl.viewport(0, 0, this.fieldSize, this.fieldSize);
    gl.useProgram(this.diffuseProg.prog);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.trail[this.curTrail]);
    gl.uniform1i(this.diffuseProg.uniforms.u_trail, 0);
    gl.uniform2f(this.diffuseProg.uniforms.u_field, this.fieldSize, this.fieldSize);
    gl.uniform1f(this.diffuseProg.uniforms.u_decay, PARAMS.decay);
    gl.uniform1f(this.diffuseProg.uniforms.u_diffuse, PARAMS.diffuse);
    gl.uniform1f(this.diffuseProg.uniforms.u_nutrient, PARAMS.nutrientPull);
    this.setNodeUniforms(this.diffuseProg, nodes);
    this.drawQuad();
    this.curTrail = dst;
  }

  // Colourise the field + node cores to the default framebuffer.
  render(nodes: Node[], viewW: number, viewH: number): void {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, viewW, viewH);
    gl.disable(gl.BLEND);
    gl.useProgram(this.renderProg.prog);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.trail[this.curTrail]);
    gl.uniform1i(this.renderProg.uniforms.u_trail, 0);
    this.setNodeUniforms(this.renderProg, nodes);
    this.drawQuad();
  }

  // Downsample the summed field to a small NORMALISED grid and read it back.
  // Returns a readSize×readSize Float32Array of 0..1 brightness (same shape the
  // CPU path builds), so graph.ts extraction is identical across both paths.
  readNormalisedField(): { field: Float32Array; w: number; h: number } {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.reduceFbo);
    gl.viewport(0, 0, this.readSize, this.readSize);
    gl.disable(gl.BLEND);
    gl.useProgram(this.reduceProg.prog);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.trail[this.curTrail]);
    gl.uniform1i(this.reduceProg.uniforms.u_trail, 0);
    gl.uniform2f(this.reduceProg.uniforms.u_field, this.fieldSize, this.fieldSize);
    gl.uniform1f(this.reduceProg.uniforms.u_k, FIELD_K);
    this.drawQuad();
    gl.readPixels(0, 0, this.readSize, this.readSize, gl.RGBA, gl.FLOAT, this.readBuf);
    const n = this.readSize * this.readSize;
    for (let i = 0; i < n; i++) this.readField[i] = this.readBuf[i * 4];
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { field: this.readField, w: this.readSize, h: this.readSize };
  }

  dispose(): void {
    const gl = this.gl;
    try {
      for (const p of [this.agentProg, this.depositProg, this.diffuseProg, this.renderProg, this.reduceProg]) {
        gl.deleteProgram(p.prog);
      }
      gl.deleteBuffer(this.quadVbo);
      gl.deleteVertexArray(this.quadVao);
      gl.deleteVertexArray(this.emptyVao);
      for (const t of [...this.agentA, ...this.agentB, ...this.trail, this.reduceTex]) gl.deleteTexture(t);
      for (const f of [...this.agentFboA, ...this.agentFboB, ...this.trailFbo, this.reduceFbo]) gl.deleteFramebuffer(f);
    } catch {
      /* context already lost */
    }
  }
}
