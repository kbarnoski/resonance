// gl.ts — WebGL2 ping-pong Gray-Scott reaction-diffusion on the GPU.
//
// The simulation IS the resonating body. Two RG float textures hold (A, B);
// every frame we run the Gray-Scott update fragment shader N times, ping-
// ponging between two framebuffers. Seeds (finger taps/drags) paint B=1 into
// the current texture via a tiny additive "splat" pass. A separate display
// shader (see render.ts) turns the field into glowing bioluminescent ink.
//
// Float render targets require EXT_color_buffer_float; if unavailable the
// caller should fall back to the Canvas2D approximation in render.ts.
//
// GLSL ES 3.00, hand-written. Reference: Karl Sims reaction-diffusion tutorial.

import { INK_GARDEN_PARAMS, type GrayScottParams } from "./sim";

const QUAD_VERT = `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main(){
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

// Gray-Scott update. State texture: R = A, G = B, both in [0,1].
const SIM_FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 outColor;
uniform sampler2D u_state;
uniform vec2  u_texel;   // 1/width, 1/height
uniform float u_dA;
uniform float u_dB;
uniform float u_feed;
uniform float u_kill;
uniform float u_dt;

vec2 lap(vec2 uv){
  // 9-point Laplacian (Sims' standard weights): center -1, edges .2, corners .05
  vec2 sum = texture(u_state, uv).xy * -1.0;
  sum += texture(u_state, uv + vec2( u_texel.x, 0.0)).xy * 0.2;
  sum += texture(u_state, uv + vec2(-u_texel.x, 0.0)).xy * 0.2;
  sum += texture(u_state, uv + vec2(0.0,  u_texel.y)).xy * 0.2;
  sum += texture(u_state, uv + vec2(0.0, -u_texel.y)).xy * 0.2;
  sum += texture(u_state, uv + vec2( u_texel.x,  u_texel.y)).xy * 0.05;
  sum += texture(u_state, uv + vec2(-u_texel.x,  u_texel.y)).xy * 0.05;
  sum += texture(u_state, uv + vec2( u_texel.x, -u_texel.y)).xy * 0.05;
  sum += texture(u_state, uv + vec2(-u_texel.x, -u_texel.y)).xy * 0.05;
  return sum;
}

void main(){
  vec2 s = texture(u_state, v_uv).xy;
  float a = s.x;
  float b = s.y;
  vec2 l = lap(v_uv);
  float reaction = a * b * b;
  float na = a + (u_dA * l.x - reaction + u_feed * (1.0 - a)) * u_dt;
  float nb = b + (u_dB * l.y + reaction - (u_kill + u_feed) * b) * u_dt;
  outColor = vec4(clamp(na, 0.0, 1.0), clamp(nb, 0.0, 1.0), 0.0, 1.0);
}`;

// Seed splat: additively paint B inside a soft circular brush.
const SPLAT_FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 outColor;
uniform sampler2D u_state;
uniform vec2  u_point;   // 0..1 splat center
uniform float u_radius;  // 0..1 radius
uniform float u_aspect;  // width/height to keep the brush round

void main(){
  vec2 s = texture(u_state, v_uv).xy;
  vec2 d = v_uv - u_point;
  d.x *= u_aspect;
  float dist = length(d);
  float brush = 1.0 - smoothstep(0.0, u_radius, dist);
  // drop B (the activator) and deplete A a touch so growth kicks off
  float b = clamp(s.y + brush * 0.9, 0.0, 1.0);
  float a = clamp(s.x - brush * 0.2, 0.0, 1.0);
  outColor = vec4(a, b, 0.0, 1.0);
}`;

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
    console.error("shader compile error:", gl.getShaderInfoLog(sh));
    gl.deleteShader(sh);
    return null;
  }
  return sh;
}

function link(
  gl: WebGL2RenderingContext,
  vsSrc: string,
  fsSrc: string,
): WebGLProgram | null {
  const vs = compile(gl, gl.VERTEX_SHADER, vsSrc);
  const fs = compile(gl, gl.FRAGMENT_SHADER, fsSrc);
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
    console.error("program link error:", gl.getProgramInfoLog(prog));
    gl.deleteProgram(prog);
    return null;
  }
  return prog;
}

interface Target {
  tex: WebGLTexture;
  fbo: WebGLFramebuffer;
}

export interface RdSim {
  /** Width/height of the simulation grid (square-ish). */
  readonly width: number;
  readonly height: number;
  /** Run `iterations` Gray-Scott steps this frame. */
  step(iterations: number): void;
  /** Seed a soft circular splat of activator at normalized (x, y), y-up. */
  splat(x: number, y: number, radius: number): void;
  /** The texture holding the current field (R=A, G=B), for the display pass. */
  currentTexture(): WebGLTexture;
  /** Read the B channel into a small CPU grid for sonification. Returns the
   *  flat row-major B values in [0,1] of size readW*readH. Stalls the GPU, so
   *  call sparingly (~10Hz). */
  readBackB(readW: number, readH: number): Float32Array;
  dispose(): void;
}

/**
 * Build the GPU reaction-diffusion simulator. Returns null if WebGL2 float
 * render targets are unavailable (caller falls back to Canvas2D).
 */
export function makeRdSim(
  gl: WebGL2RenderingContext,
  size = 256,
  params: GrayScottParams = INK_GARDEN_PARAMS,
): RdSim | null {
  const extFloat = gl.getExtension("EXT_color_buffer_float");
  if (!extFloat) return null;
  // RG16F is enough precision for Gray-Scott and is widely renderable; fall
  // back to RGBA16F if RG color buffers are not renderable.
  gl.getExtension("OES_texture_float_linear");

  const width = size;
  const height = size;

  const quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 3, -1, -1, 3]),
    gl.STATIC_DRAW,
  );

  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  const simProg = link(gl, QUAD_VERT, SIM_FRAG);
  const splatProg = link(gl, QUAD_VERT, SPLAT_FRAG);
  if (!simProg || !splatProg) return null;

  const internalFmt = (gl as WebGL2RenderingContext).RGBA16F;

  function makeTarget(): Target | null {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      internalFmt,
      width,
      height,
      0,
      gl.RGBA,
      gl.FLOAT,
      null,
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      tex,
      0,
    );
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
      return null;
    }
    if (!tex || !fbo) return null;
    return { tex, fbo };
  }

  // Initialize both targets to A=1, B=0 (calm substrate everywhere). We do this
  // by clearing to (1,0,0,1).
  const a0 = makeTarget();
  const b0 = makeTarget();
  if (!a0 || !b0) return null;
  let read = a0;
  let write = b0;

  for (const t of [a0, b0]) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo);
    gl.clearColor(1, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  // Locations
  const simLoc = {
    state: gl.getUniformLocation(simProg, "u_state"),
    texel: gl.getUniformLocation(simProg, "u_texel"),
    dA: gl.getUniformLocation(simProg, "u_dA"),
    dB: gl.getUniformLocation(simProg, "u_dB"),
    feed: gl.getUniformLocation(simProg, "u_feed"),
    kill: gl.getUniformLocation(simProg, "u_kill"),
    dt: gl.getUniformLocation(simProg, "u_dt"),
  };
  const splatLoc = {
    state: gl.getUniformLocation(splatProg, "u_state"),
    point: gl.getUniformLocation(splatProg, "u_point"),
    radius: gl.getUniformLocation(splatProg, "u_radius"),
    aspect: gl.getUniformLocation(splatProg, "u_aspect"),
  };

  function swap() {
    const tmp = read;
    read = write;
    write = tmp;
  }

  function step(iterations: number) {
    gl.useProgram(simProg);
    gl.bindVertexArray(vao);
    gl.viewport(0, 0, width, height);
    gl.uniform2f(simLoc.texel, 1 / width, 1 / height);
    gl.uniform1f(simLoc.dA, params.dA);
    gl.uniform1f(simLoc.dB, params.dB);
    gl.uniform1f(simLoc.feed, params.feed);
    gl.uniform1f(simLoc.kill, params.kill);
    gl.uniform1f(simLoc.dt, params.dt);
    gl.uniform1i(simLoc.state, 0);
    gl.activeTexture(gl.TEXTURE0);
    for (let i = 0; i < iterations; i++) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, write.fbo);
      gl.bindTexture(gl.TEXTURE_2D, read.tex);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      swap();
    }
  }

  function splat(x: number, y: number, radius: number) {
    gl.useProgram(splatProg);
    gl.bindVertexArray(vao);
    gl.viewport(0, 0, width, height);
    gl.uniform2f(splatLoc.point, x, y);
    gl.uniform1f(splatLoc.radius, radius);
    gl.uniform1f(splatLoc.aspect, width / height);
    gl.uniform1i(splatLoc.state, 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, write.fbo);
    gl.bindTexture(gl.TEXTURE_2D, read.tex);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    swap();
  }

  // A small downsample framebuffer for readback. We render the current field
  // into a tiny RGBA16F target with linear-ish averaging via the sim's NEAREST
  // texture sampled at the small grid — good enough as a coarse summary.
  let readTarget: Target | null = null;
  let readTex = new Float32Array(0);
  function ensureReadTarget(rw: number, rh: number) {
    if (readTarget && readTex.length === rw * rh * 4) return;
    if (readTarget) {
      gl.deleteTexture(readTarget.tex);
      gl.deleteFramebuffer(readTarget.fbo);
    }
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      internalFmt,
      rw,
      rh,
      0,
      gl.RGBA,
      gl.FLOAT,
      null,
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fbo = gl.createFramebuffer();
    readTarget = tex && fbo ? { tex, fbo } : null;
    readTex = new Float32Array(rw * rh * 4);
  }

  // We need a blit shader to copy/downscale the big field into the small one.
  const BLIT_FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 outColor;
uniform sampler2D u_src;
void main(){ outColor = texture(u_src, v_uv); }`;
  const blitProg = link(gl, QUAD_VERT, BLIT_FRAG);
  const blitSrcLoc = blitProg
    ? gl.getUniformLocation(blitProg, "u_src")
    : null;

  function readBackB(readW: number, readH: number): Float32Array {
    ensureReadTarget(readW, readH);
    if (!readTarget || !blitProg) return new Float32Array(readW * readH);
    // downsample current field into small target
    gl.useProgram(blitProg);
    gl.bindVertexArray(vao);
    gl.bindFramebuffer(gl.FRAMEBUFFER, readTarget.fbo);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      readTarget.tex,
      0,
    );
    gl.viewport(0, 0, readW, readH);
    gl.uniform1i(blitSrcLoc, 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, read.tex);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    // read it back
    gl.readPixels(0, 0, readW, readH, gl.RGBA, gl.FLOAT, readTex);
    const b = new Float32Array(readW * readH);
    for (let i = 0; i < readW * readH; i++) b[i] = readTex[i * 4 + 1];
    return b;
  }

  return {
    width,
    height,
    step,
    splat,
    currentTexture: () => read.tex,
    readBackB,
    dispose() {
      gl.deleteProgram(simProg);
      gl.deleteProgram(splatProg);
      if (blitProg) gl.deleteProgram(blitProg);
      gl.deleteBuffer(quad);
      gl.deleteVertexArray(vao);
      for (const t of [a0, b0]) {
        gl.deleteTexture(t.tex);
        gl.deleteFramebuffer(t.fbo);
      }
      if (readTarget) {
        gl.deleteTexture(readTarget.tex);
        gl.deleteFramebuffer(readTarget.fbo);
      }
    },
  };
}
