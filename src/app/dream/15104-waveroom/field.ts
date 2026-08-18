// field.ts — the raw WebGL2 ping-pong FDTD acoustic field.
//
// A pair of RGBA32F textures hold the pressure field (u in .r, u_prev in .g,
// peak-hold energy in .b). Each substep runs one leapfrog wave-equation update
// by ping-ponging between them through framebuffers. A small gl.readPixels
// around the listener texel hands the CPU the LOCAL field energy that
// spatialises the audio. No Canvas2D, no three.js — this is the raw-WebGL2
// OUTPUT substrate the brief asks for.
//
// Reference: Savioja, "Real-Time 3D Finite-Difference Time-Domain Simulation of
// Low- and Mid-Frequency Room Acoustics" (DAFx 2010) — the 2D reduction here
// follows the same explicit leapfrog / CFL discipline.

import { VS, buildSimFs, DISPLAY_FS } from "./glsl";

export const SIM = 320; // simulation grid resolution (SIM×SIM)
export const READ = 8; // listener readback region (READ×READ texels)

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const s = gl.createShader(type)!;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
    throw new Error(gl.getShaderInfoLog(s) ?? "shader compile failed");
  return s;
}

function link(gl: WebGL2RenderingContext, vs: string, fs: string): WebGLProgram {
  const p = gl.createProgram()!;
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS))
    throw new Error(gl.getProgramInfoLog(p) ?? "program link failed");
  return p;
}

function floatTex(gl: WebGL2RenderingContext, w: number, h: number): WebGLTexture {
  const t = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, w, h, 0, gl.RGBA, gl.FLOAT, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  // CLAMP_TO_EDGE → zero-gradient (reflecting) walls; the key to standing waves.
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return t;
}

function fbo(gl: WebGL2RenderingContext, tex: WebGLTexture): WebGLFramebuffer {
  const f = gl.createFramebuffer()!;
  gl.bindFramebuffer(gl.FRAMEBUFFER, f);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return f;
}

export class Field {
  private gl: WebGL2RenderingContext;
  private canvas: HTMLCanvasElement;
  private simProg: WebGLProgram;
  private dispProg: WebGLProgram;
  private vao: WebGLVertexArrayObject;
  private quadBuf: WebGLBuffer;
  private tex: [WebGLTexture, WebGLTexture];
  private fbos: [WebGLFramebuffer, WebGLFramebuffer];
  private ping: 0 | 1 = 0;

  // sim-program uniforms
  private uSrc: WebGLUniformLocation | null;
  private uSrcAmp: WebGLUniformLocation | null;
  // display-program uniforms
  private uDSrc: WebGLUniformLocation | null;
  private uDListener: WebGLUniformLocation | null;
  private uDAspect: WebGLUniformLocation | null;

  private readBuf = new Float32Array(READ * READ * 4);

  constructor(canvas: HTMLCanvasElement) {
    const gl = canvas.getContext("webgl2", { antialias: false, alpha: false }) as
      | WebGL2RenderingContext
      | null;
    if (!gl) throw new Error("WebGL2 is not available in this browser.");
    if (!gl.getExtension("EXT_color_buffer_float"))
      throw new Error(
        "Float framebuffers (EXT_color_buffer_float) are not supported here.",
      );

    this.gl = gl;
    this.canvas = canvas;
    this.simProg = link(gl, VS, buildSimFs(SIM));
    this.dispProg = link(gl, VS, DISPLAY_FS);
    this.uSrc = gl.getUniformLocation(this.simProg, "u_src");
    this.uSrcAmp = gl.getUniformLocation(this.simProg, "u_srcAmp");
    this.uDSrc = gl.getUniformLocation(this.dispProg, "u_src");
    this.uDListener = gl.getUniformLocation(this.dispProg, "u_listener");
    this.uDAspect = gl.getUniformLocation(this.dispProg, "u_aspect");

    // Shared full-screen quad (both programs use layout(location=0) a_pos).
    this.vao = gl.createVertexArray()!;
    gl.bindVertexArray(this.vao);
    this.quadBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuf);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      gl.STATIC_DRAW,
    );
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    const t0 = floatTex(gl, SIM, SIM);
    const t1 = floatTex(gl, SIM, SIM);
    this.tex = [t0, t1];
    this.fbos = [fbo(gl, t0), fbo(gl, t1)];

    // Clear both textures to a silent room (u = u_prev = E = 0).
    for (const f of this.fbos) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, f);
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  /**
   * Advance the wave field by `substeps` leapfrog iterations. `src` is the
   * point-source position in uv space; `amp` is the signed drive (the live
   * audio waveform) injected each substep.
   */
  step(substeps: number, src: { x: number; y: number }, amp: number): void {
    const gl = this.gl;
    gl.useProgram(this.simProg);
    gl.bindVertexArray(this.vao);
    gl.viewport(0, 0, SIM, SIM);
    if (this.uSrc) gl.uniform2f(this.uSrc, src.x, src.y);
    for (let s = 0; s < substeps; s++) {
      if (this.uSrcAmp) gl.uniform1f(this.uSrcAmp, amp);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbos[this.ping ^ 1]);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.tex[this.ping]);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      this.ping = (this.ping ^ 1) as 0 | 1;
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  /**
   * Read the LOCAL field energy in a small region around the listener.
   * Uses the peak-hold energy channel (.b) so the value is the stable
   * standing-wave energy at that spot: high at antinodes, near-zero at nodes.
   * `listener` is uv (0..1). Returns mean energy over the READ×READ region.
   */
  readListenerEnergy(listener: { x: number; y: number }): number {
    const gl = this.gl;
    const half = READ >> 1;
    let px = Math.round(listener.x * SIM) - half;
    let py = Math.round(listener.y * SIM) - half;
    px = Math.max(0, Math.min(SIM - READ, px));
    py = Math.max(0, Math.min(SIM - READ, py));

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbos[this.ping]);
    gl.readPixels(px, py, READ, READ, gl.RGBA, gl.FLOAT, this.readBuf);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    let sum = 0;
    for (let i = 0; i < READ * READ; i++) sum += this.readBuf[i * 4 + 2]; // .b
    return sum / (READ * READ);
  }

  /** Draw the pressure field + source/listener markers to the canvas. */
  draw(src: { x: number; y: number }, listener: { x: number; y: number }): void {
    const gl = this.gl;
    gl.useProgram(this.dispProg);
    gl.bindVertexArray(this.vao);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    if (this.uDSrc) gl.uniform2f(this.uDSrc, src.x, src.y);
    if (this.uDListener) gl.uniform2f(this.uDListener, listener.x, listener.y);
    if (this.uDAspect)
      gl.uniform1f(
        this.uDAspect,
        Math.max(0.01, this.canvas.width / Math.max(1, this.canvas.height)),
      );
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.tex[this.ping]);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  /** Full teardown of every GL resource. */
  dispose(): void {
    const gl = this.gl;
    try {
      gl.deleteProgram(this.simProg);
      gl.deleteProgram(this.dispProg);
      gl.deleteVertexArray(this.vao);
      gl.deleteBuffer(this.quadBuf);
      gl.deleteTexture(this.tex[0]);
      gl.deleteTexture(this.tex[1]);
      gl.deleteFramebuffer(this.fbos[0]);
      gl.deleteFramebuffer(this.fbos[1]);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    } catch {
      /* context already gone */
    }
  }
}
