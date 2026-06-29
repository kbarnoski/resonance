// ════════════════════════════════════════════════════════════════════════════
// Ping-pong feedback buffer for 1047-tracer-drift.
//
// THE DEFINING TECHNIQUE. We keep two RGBA textures (A and B), each attached to
// its own framebuffer. Each frame:
//   1. FEEDBACK pass: bind FBO[dst], read texture[src] (the previous frame) in
//      the shader, warp+decay it and composite fresh content over it -> dst.
//   2. swap src/dst (ping-pong).
//   3. PRESENT pass: bind the default framebuffer (the canvas), sample the
//      just-written texture and tone-map it to the screen.
//
// Half-float (RGBA16F) targets when available give smooth low-alpha trails;
// we fall back to 8-bit. Linear filtering makes the warped feedback fetch melt.
//
// runFrame() does both passes; dispose() deletes every GL object (textures,
// FBOs, programs, buffers, VAO) and loses the context.
// ════════════════════════════════════════════════════════════════════════════

import { VERT_SRC, FEEDBACK_FRAG, PRESENT_FRAG } from "./shaders";

export type FrameInputs = {
  time: number; // seconds
  intensity: number; // 0..1 arc
  lowEnergy: number; // 0..1
  level: number; // 0..1
};

function compile(
  gl: WebGL2RenderingContext,
  type: number,
  src: string
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

function makeProgram(
  gl: WebGL2RenderingContext,
  fragSrc: string
): WebGLProgram | null {
  const vs = compile(gl, gl.VERTEX_SHADER, VERT_SRC);
  const fs = compile(gl, gl.FRAGMENT_SHADER, fragSrc);
  if (!vs || !fs) return null;
  const prog = gl.createProgram();
  if (!prog) return null;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.error("program link error:", gl.getProgramInfoLog(prog));
    return null;
  }
  return prog;
}

type Target = {
  tex: WebGLTexture;
  fbo: WebGLFramebuffer;
};

export class FeedbackRenderer {
  private gl: WebGL2RenderingContext;
  private feedbackProg: WebGLProgram;
  private presentProg: WebGLProgram;
  private vao: WebGLVertexArrayObject;
  private vbo: WebGLBuffer;

  private a: Target;
  private b: Target;
  private srcIsA = true;

  private width = 0;
  private height = 0;
  private texInternal: number;
  private texType: number;

  // cached uniform locations
  private uF: Record<string, WebGLUniformLocation | null> = {};
  private uP: Record<string, WebGLUniformLocation | null> = {};

  private constructor(
    gl: WebGL2RenderingContext,
    feedbackProg: WebGLProgram,
    presentProg: WebGLProgram,
    vao: WebGLVertexArrayObject,
    vbo: WebGLBuffer,
    texInternal: number,
    texType: number
  ) {
    this.gl = gl;
    this.feedbackProg = feedbackProg;
    this.presentProg = presentProg;
    this.vao = vao;
    this.vbo = vbo;
    this.texInternal = texInternal;
    this.texType = texType;
    this.a = this.makeTarget(2, 2);
    this.b = this.makeTarget(2, 2);
    this.cacheUniforms();
  }

  /** Build the renderer, or return null if WebGL2 / programs are unavailable. */
  static create(canvas: HTMLCanvasElement): FeedbackRenderer | null {
    let gl: WebGL2RenderingContext | null = null;
    try {
      gl = canvas.getContext("webgl2", {
        antialias: false,
        premultipliedAlpha: false,
        powerPreference: "high-performance",
      });
    } catch {
      gl = null;
    }
    if (!gl) return null;

    const feedbackProg = makeProgram(gl, FEEDBACK_FRAG);
    const presentProg = makeProgram(gl, PRESENT_FRAG);
    if (!feedbackProg || !presentProg) return null;

    // prefer half-float targets for smooth trails
    let texInternal: number = gl.RGBA8;
    let texType: number = gl.UNSIGNED_BYTE;
    const cbf = gl.getExtension("EXT_color_buffer_float");
    const lin = gl.getExtension("OES_texture_float_linear");
    if (cbf && lin) {
      texInternal = gl.RGBA16F;
      texType = gl.HALF_FLOAT;
    }

    const vao = gl.createVertexArray();
    const vbo = gl.createBuffer();
    if (!vao || !vbo) return null;
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 3, -1, -1, 3]),
      gl.STATIC_DRAW
    );
    const loc = gl.getAttribLocation(feedbackProg, "aPos");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    return new FeedbackRenderer(
      gl,
      feedbackProg,
      presentProg,
      vao,
      vbo,
      texInternal,
      texType
    );
  }

  private makeTarget(w: number, h: number): Target {
    const gl = this.gl;
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      this.texInternal,
      w,
      h,
      0,
      gl.RGBA,
      this.texType,
      null
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    const fbo = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      tex,
      0
    );
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { tex, fbo };
  }

  private resizeTarget(t: Target, w: number, h: number) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, t.tex);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      this.texInternal,
      w,
      h,
      0,
      gl.RGBA,
      this.texType,
      null
    );
  }

  private cacheUniforms() {
    const gl = this.gl;
    const fNames = [
      "uPrev",
      "uRes",
      "uTime",
      "uIntensity",
      "uLowEnergy",
      "uLevel",
      "uAspect",
    ];
    for (const n of fNames)
      this.uF[n] = gl.getUniformLocation(this.feedbackProg, n);
    const pNames = ["uTex", "uRes", "uLevel"];
    for (const n of pNames)
      this.uP[n] = gl.getUniformLocation(this.presentProg, n);
  }

  /** Resize the ping-pong targets to match the drawing buffer. */
  resize(w: number, h: number) {
    if (w === this.width && h === this.height) return;
    this.width = w;
    this.height = h;
    this.resizeTarget(this.a, w, h);
    this.resizeTarget(this.b, w, h);
    // clear both so trails start from a clean pale field
    const gl = this.gl;
    for (const t of [this.a, this.b]) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo);
      gl.viewport(0, 0, w, h);
      gl.clearColor(0.05, 0.045, 0.07, 1.0);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  /** Do the feedback pass then present to the canvas. */
  runFrame(inp: FrameInputs) {
    const gl = this.gl;
    const w = this.width;
    const h = this.height;
    if (w === 0 || h === 0) return;

    const src = this.srcIsA ? this.a : this.b;
    const dst = this.srcIsA ? this.b : this.a;

    gl.bindVertexArray(this.vao);

    // ── 1) FEEDBACK pass -> dst ───────────────────────────────────────────
    gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fbo);
    gl.viewport(0, 0, w, h);
    gl.useProgram(this.feedbackProg);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, src.tex);
    gl.uniform1i(this.uF.uPrev, 0);
    gl.uniform2f(this.uF.uRes, w, h);
    gl.uniform1f(this.uF.uTime, inp.time);
    gl.uniform1f(this.uF.uIntensity, inp.intensity);
    gl.uniform1f(this.uF.uLowEnergy, inp.lowEnergy);
    gl.uniform1f(this.uF.uLevel, inp.level);
    gl.uniform1f(this.uF.uAspect, w / Math.max(1, h));
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // ── 2) PRESENT pass -> canvas ─────────────────────────────────────────
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, w, h);
    gl.useProgram(this.presentProg);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, dst.tex);
    gl.uniform1i(this.uP.uTex, 0);
    gl.uniform2f(this.uP.uRes, w, h);
    gl.uniform1f(this.uP.uLevel, inp.level);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    gl.bindVertexArray(null);

    // ── 3) swap ───────────────────────────────────────────────────────────
    this.srcIsA = !this.srcIsA;
  }

  dispose() {
    const gl = this.gl;
    try {
      gl.deleteTexture(this.a.tex);
      gl.deleteTexture(this.b.tex);
      gl.deleteFramebuffer(this.a.fbo);
      gl.deleteFramebuffer(this.b.fbo);
      gl.deleteBuffer(this.vbo);
      gl.deleteVertexArray(this.vao);
      gl.deleteProgram(this.feedbackProg);
      gl.deleteProgram(this.presentProg);
      const lose = gl.getExtension("WEBGL_lose_context");
      if (lose) lose.loseContext();
    } catch {
      /* best-effort teardown */
    }
  }
}
