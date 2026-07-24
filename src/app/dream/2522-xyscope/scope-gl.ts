// ════════════════════════════════════════════════════════════════════════════
// XY-Scope (2522) — hand-rolled WebGL2 vector renderer.
//
// No three.js, no GL libs. Draws the audio buffer as an XY polyline (LINE_STRIP
// through (x[i], y[i])) with additive blending into a ping-pong persistence
// buffer, so each frame decays the last — the phosphor "trail" of a real CRT
// oscilloscope. A final bloom pass smears the 1px trace into glow. Aesthetic:
// Ikeda signal-green-violet, Jerobeam Fenderson vector figures.
// ════════════════════════════════════════════════════════════════════════════

const LINE_VERT = `#version 300 es
in vec2 a_pos;
uniform float u_scale;
void main() {
  gl_Position = vec4(a_pos * u_scale, 0.0, 1.0);
  gl_PointSize = 1.5;
}`;

const LINE_FRAG = `#version 300 es
precision highp float;
uniform vec3 u_color;
uniform float u_intensity;
out vec4 frag;
void main() {
  frag = vec4(u_color * u_intensity, 1.0);
}`;

const QUAD_VERT = `#version 300 es
in vec2 a_quad;
out vec2 v_uv;
void main() {
  v_uv = a_quad * 0.5 + 0.5;
  gl_Position = vec4(a_quad, 0.0, 1.0);
}`;

const FADE_FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_tex;
uniform float u_decay;
out vec4 frag;
void main() {
  vec3 c = texture(u_tex, v_uv).rgb;
  frag = vec4(c * u_decay, 1.0);
}`;

// Radial bloom / tonemap for the final screen pass.
const BLIT_FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_tex;
uniform vec2 u_texel;
out vec4 frag;
void main() {
  vec3 core = texture(u_tex, v_uv).rgb;
  vec3 bloom = vec3(0.0);
  for (int i = 1; i <= 3; i++) {
    float o = float(i);
    vec2 d = u_texel * o * 1.6;
    bloom += texture(u_tex, v_uv + vec2(d.x, 0.0)).rgb;
    bloom += texture(u_tex, v_uv - vec2(d.x, 0.0)).rgb;
    bloom += texture(u_tex, v_uv + vec2(0.0, d.y)).rgb;
    bloom += texture(u_tex, v_uv - vec2(0.0, d.y)).rgb;
    bloom += texture(u_tex, v_uv + d).rgb;
    bloom += texture(u_tex, v_uv - d).rgb;
    bloom += texture(u_tex, v_uv + vec2(d.x, -d.y)).rgb;
    bloom += texture(u_tex, v_uv + vec2(-d.x, d.y)).rgb;
  }
  bloom /= 24.0;
  vec3 col = core + bloom * 1.1;
  // subtle vignette for the CRT feel
  vec2 q = v_uv - 0.5;
  col *= 1.0 - dot(q, q) * 0.55;
  col = col / (col + vec3(0.85));
  frag = vec4(col, 1.0);
}`;

function compileShader(
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

function linkProgram(
  gl: WebGL2RenderingContext,
  vsSrc: string,
  fsSrc: string,
): WebGLProgram | null {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vsSrc);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fsSrc);
  if (!vs || !fs) return null;
  const prog = gl.createProgram();
  if (!prog) return null;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    gl.deleteProgram(prog);
    return null;
  }
  return prog;
}

export interface DrawOpts {
  /** 0..1 drive — shifts hue toward magenta and boosts intensity. */
  drive: number;
  /** persistence decay per frame, 0..1 (higher = longer trails). */
  decay: number;
}

export interface ScopeRenderer {
  draw(x: Float32Array, y: Float32Array, count: number, opts: DrawOpts): void;
  resize(): void;
  dispose(): void;
}

export function createScopeRenderer(
  canvas: HTMLCanvasElement,
): ScopeRenderer | null {
  const gl = canvas.getContext("webgl2", {
    antialias: false,
    premultipliedAlpha: false,
    preserveDrawingBuffer: false,
  });
  if (!gl) return null;

  const lineProg = linkProgram(gl, LINE_VERT, LINE_FRAG);
  const fadeProg = linkProgram(gl, QUAD_VERT, FADE_FRAG);
  const blitProg = linkProgram(gl, QUAD_VERT, BLIT_FRAG);
  if (!lineProg || !fadeProg || !blitProg) return null;

  // Uniform locations.
  const uScale = gl.getUniformLocation(lineProg, "u_scale");
  const uColor = gl.getUniformLocation(lineProg, "u_color");
  const uIntensity = gl.getUniformLocation(lineProg, "u_intensity");
  const uFadeTex = gl.getUniformLocation(fadeProg, "u_tex");
  const uDecay = gl.getUniformLocation(fadeProg, "u_decay");
  const uBlitTex = gl.getUniformLocation(blitProg, "u_tex");
  const uTexel = gl.getUniformLocation(blitProg, "u_texel");

  // Fullscreen quad.
  const quadBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 3, -1, -1, 3]),
    gl.STATIC_DRAW,
  );
  const quadVao = gl.createVertexArray();
  gl.bindVertexArray(quadVao);
  {
    const loc = gl.getAttribLocation(fadeProg, "a_quad");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  }

  // Line vertex buffer (interleaved x,y), sized to the sample count on first draw.
  const lineBuf = gl.createBuffer();
  const lineVao = gl.createVertexArray();
  let lineCapacity = 0;
  const posLoc = gl.getAttribLocation(lineProg, "a_pos");
  gl.bindVertexArray(lineVao);
  gl.bindBuffer(gl.ARRAY_BUFFER, lineBuf);
  gl.enableVertexAttribArray(posLoc);
  gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);

  let interleaved = new Float32Array(0);

  // Ping-pong FBOs for persistence.
  let texW = 0;
  let texH = 0;
  const tex: (WebGLTexture | null)[] = [null, null];
  const fbo: (WebGLFramebuffer | null)[] = [null, null];
  let src = 0;

  function allocTargets(): void {
    const dpr = Math.min(
      typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1,
      2,
    );
    const w = Math.max(2, Math.floor(canvas.clientWidth * dpr));
    const h = Math.max(2, Math.floor(canvas.clientHeight * dpr));
    if (w === texW && h === texH) return;
    texW = w;
    texH = h;
    canvas.width = w;
    canvas.height = h;
    for (let i = 0; i < 2; i++) {
      if (tex[i]) gl!.deleteTexture(tex[i]);
      if (fbo[i]) gl!.deleteFramebuffer(fbo[i]);
      const t = gl!.createTexture();
      gl!.bindTexture(gl!.TEXTURE_2D, t);
      gl!.texImage2D(
        gl!.TEXTURE_2D,
        0,
        gl!.RGBA,
        w,
        h,
        0,
        gl!.RGBA,
        gl!.UNSIGNED_BYTE,
        null,
      );
      gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MIN_FILTER, gl!.LINEAR);
      gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MAG_FILTER, gl!.LINEAR);
      gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_S, gl!.CLAMP_TO_EDGE);
      gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_T, gl!.CLAMP_TO_EDGE);
      const f = gl!.createFramebuffer();
      gl!.bindFramebuffer(gl!.FRAMEBUFFER, f);
      gl!.framebufferTexture2D(
        gl!.FRAMEBUFFER,
        gl!.COLOR_ATTACHMENT0,
        gl!.TEXTURE_2D,
        t,
        0,
      );
      // Clear to black.
      gl!.clearColor(0, 0, 0, 1);
      gl!.clear(gl!.COLOR_BUFFER_BIT);
      tex[i] = t;
      fbo[i] = f;
    }
    gl!.bindFramebuffer(gl!.FRAMEBUFFER, null);
  }

  allocTargets();

  // Violet phosphor core, magenta at high drive.
  const COL_LOW = [0.55, 0.42, 0.98]; // violet #8b5cf6-ish
  const COL_HIGH = [0.78, 0.28, 0.92]; // magenta

  function draw(
    x: Float32Array,
    y: Float32Array,
    count: number,
    opts: DrawOpts,
  ): void {
    const g = gl!;
    const dst = 1 - src;

    // Pass 1 — fade previous frame into dst.
    g.bindFramebuffer(g.FRAMEBUFFER, fbo[dst]);
    g.viewport(0, 0, texW, texH);
    g.disable(g.BLEND);
    g.useProgram(fadeProg!);
    g.activeTexture(g.TEXTURE0);
    g.bindTexture(g.TEXTURE_2D, tex[src]);
    g.uniform1i(uFadeTex, 0);
    g.uniform1f(uDecay, opts.decay);
    g.bindVertexArray(quadVao);
    g.drawArrays(g.TRIANGLES, 0, 3);

    // Pass 2 — additive trace on top.
    if (interleaved.length < count * 2) interleaved = new Float32Array(count * 2);
    for (let i = 0; i < count; i++) {
      interleaved[i * 2] = x[i];
      interleaved[i * 2 + 1] = y[i];
    }
    g.bindBuffer(g.ARRAY_BUFFER, lineBuf);
    if (count * 2 > lineCapacity) {
      g.bufferData(g.ARRAY_BUFFER, interleaved, g.DYNAMIC_DRAW);
      lineCapacity = count * 2;
    } else {
      g.bufferSubData(g.ARRAY_BUFFER, 0, interleaved.subarray(0, count * 2));
    }
    g.enable(g.BLEND);
    g.blendFunc(g.ONE, g.ONE);
    g.useProgram(lineProg!);
    g.uniform1f(uScale, 0.88);
    const d = Math.min(1, Math.max(0, opts.drive));
    const cr = COL_LOW[0] * (1 - d) + COL_HIGH[0] * d;
    const cg = COL_LOW[1] * (1 - d) + COL_HIGH[1] * d;
    const cb = COL_LOW[2] * (1 - d) + COL_HIGH[2] * d;
    g.uniform3f(uColor, cr, cg, cb);
    g.uniform1f(uIntensity, 0.5 + d * 0.5);
    g.bindVertexArray(lineVao);
    g.drawArrays(g.LINE_STRIP, 0, count);
    g.drawArrays(g.POINTS, 0, count);

    // Pass 3 — bloom + tonemap to screen.
    g.bindFramebuffer(g.FRAMEBUFFER, null);
    g.viewport(0, 0, texW, texH);
    g.disable(g.BLEND);
    g.useProgram(blitProg!);
    g.activeTexture(g.TEXTURE0);
    g.bindTexture(g.TEXTURE_2D, tex[dst]);
    g.uniform1i(uBlitTex, 0);
    g.uniform2f(uTexel, 1 / texW, 1 / texH);
    g.bindVertexArray(quadVao);
    g.drawArrays(g.TRIANGLES, 0, 3);

    src = dst;
  }

  function resize(): void {
    allocTargets();
  }

  function dispose(): void {
    const g = gl!;
    for (let i = 0; i < 2; i++) {
      if (tex[i]) g.deleteTexture(tex[i]);
      if (fbo[i]) g.deleteFramebuffer(fbo[i]);
    }
    g.deleteBuffer(quadBuf);
    g.deleteBuffer(lineBuf);
    g.deleteVertexArray(quadVao);
    g.deleteVertexArray(lineVao);
    g.deleteProgram(lineProg);
    g.deleteProgram(fadeProg);
    g.deleteProgram(blitProg);
    const lose = g.getExtension("WEBGL_lose_context");
    if (lose) lose.loseContext();
  }

  return { draw, resize, dispose };
}
