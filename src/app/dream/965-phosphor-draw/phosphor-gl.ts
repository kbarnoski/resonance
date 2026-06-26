// WebGL2 phosphor oscilloscope renderer.
//
// Authentic CRT vectorscope persistence via a ping-pong feedback texture:
//   1. Fade the previous frame slightly (multiply by < 1) into texture B.
//   2. Additively draw the new beam (line strip of the X/Y signal) on top.
//   3. Blit B to screen with a bloom-ish glow, then swap A/B.
//
// Beam brightness is modulated by inverse segment speed: where the beam moves
// slowly, the electron dwell is longer, so it glows brighter — exactly like a
// real scope. We pass per-vertex intensity computed from neighbour spacing.
//
// Returns a controller with draw() and dispose(). If WebGL2 is unavailable the
// caller falls back to Canvas2D.

export type PhosphorController = {
  resize: (w: number, h: number) => void;
  draw: (xs: Float32Array, ys: Float32Array, n: number, opts: DrawOpts) => void;
  dispose: () => void;
};

export type DrawOpts = {
  persistence: number; // 0..1 — higher = longer afterglow
  brightness: number; // 0..1 beam intensity
  hue: [number, number, number]; // RGB beam colour (phosphor)
};

const VERT_BEAM = `#version 300 es
precision highp float;
layout(location=0) in vec2 a_pos;     // signal coords in [-1,1]
layout(location=1) in float a_inten;  // dwell-based intensity
out float v_inten;
void main() {
  v_inten = a_inten;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

const FRAG_BEAM = `#version 300 es
precision highp float;
in float v_inten;
out vec4 frag;
uniform vec3 u_color;
uniform float u_bright;
void main() {
  float i = v_inten * u_bright;
  frag = vec4(u_color * i, i);
}`;

// Fullscreen-triangle vertex shader for fade + blit passes.
const VERT_FS = `#version 300 es
precision highp float;
out vec2 v_uv;
void main() {
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  v_uv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

// Fade pass: copy previous accum scaled down (the afterglow decay).
const FRAG_FADE = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 frag;
uniform sampler2D u_tex;
uniform float u_fade;
void main() {
  vec4 c = texture(u_tex, v_uv);
  frag = c * u_fade;
}`;

// Blit pass with a cheap separable-ish bloom (sample a small ring) + tonemap.
const FRAG_BLIT = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 frag;
uniform sampler2D u_tex;
uniform vec2 u_texel;
void main() {
  vec3 c = texture(u_tex, v_uv).rgb;
  // Bloom: gather a few offset taps for a soft glow halo.
  vec3 bloom = vec3(0.0);
  float w = 0.0;
  for (int dx = -2; dx <= 2; dx++) {
    for (int dy = -2; dy <= 2; dy++) {
      float wd = 1.0 / (1.0 + float(dx*dx + dy*dy));
      bloom += texture(u_tex, v_uv + vec2(float(dx), float(dy)) * u_texel * 1.6).rgb * wd;
      w += wd;
    }
  }
  bloom /= w;
  vec3 col = c + bloom * 0.65;
  // Filmic-ish tonemap so hot beam clips to white-green nicely.
  col = col / (col + vec3(0.7));
  col = pow(col, vec3(0.85));
  frag = vec4(col, 1.0);
}`;

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type);
  if (!sh) throw new Error("shader create failed");
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error("shader compile: " + log);
  }
  return sh;
}

function link(gl: WebGL2RenderingContext, vs: string, fs: string): WebGLProgram {
  const p = gl.createProgram();
  if (!p) throw new Error("program create failed");
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    throw new Error("program link: " + gl.getProgramInfoLog(p));
  }
  return p;
}

function makeTarget(gl: WebGL2RenderingContext, w: number, h: number) {
  const tex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const fbo = gl.createFramebuffer()!;
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  return { tex, fbo };
}

/**
 * Create the phosphor controller. Throws if WebGL2 or float-render is missing,
 * so the caller can fall back to Canvas2D.
 */
export function createPhosphor(canvas: HTMLCanvasElement): PhosphorController {
  const gl = canvas.getContext("webgl2", {
    alpha: false,
    antialias: false,
    premultipliedAlpha: false,
    preserveDrawingBuffer: false,
  });
  if (!gl) throw new Error("no webgl2");
  if (!gl.getExtension("EXT_color_buffer_float")) {
    throw new Error("no float render targets");
  }

  const beamProg = link(gl, VERT_BEAM, FRAG_BEAM);
  const fadeProg = link(gl, VERT_FS, FRAG_FADE);
  const blitProg = link(gl, VERT_FS, FRAG_BLIT);

  // Beam vertex buffers (interleaved pos.xy + intensity).
  const vao = gl.createVertexArray()!;
  gl.bindVertexArray(vao);
  const vbo = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 12, 0);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 12, 8);
  gl.bindVertexArray(null);

  const emptyVao = gl.createVertexArray()!; // for fullscreen passes

  let W = canvas.width || 2;
  let H = canvas.height || 2;
  let a = makeTarget(gl, W, H);
  let b = makeTarget(gl, W, H);

  // Reusable CPU-side interleaved vertex array; grown as needed.
  let verts = new Float32Array(0);

  const u = {
    beamColor: gl.getUniformLocation(beamProg, "u_color"),
    beamBright: gl.getUniformLocation(beamProg, "u_bright"),
    fadeTex: gl.getUniformLocation(fadeProg, "u_tex"),
    fadeAmt: gl.getUniformLocation(fadeProg, "u_fade"),
    blitTex: gl.getUniformLocation(blitProg, "u_tex"),
    blitTexel: gl.getUniformLocation(blitProg, "u_texel"),
  };

  function resize(w: number, h: number) {
    w = Math.max(2, Math.floor(w));
    h = Math.max(2, Math.floor(h));
    if (w === W && h === H) return;
    W = w;
    H = h;
    canvas.width = w;
    canvas.height = h;
    gl!.deleteTexture(a.tex);
    gl!.deleteFramebuffer(a.fbo);
    gl!.deleteTexture(b.tex);
    gl!.deleteFramebuffer(b.fbo);
    a = makeTarget(gl!, w, h);
    b = makeTarget(gl!, w, h);
  }

  function draw(xs: Float32Array, ys: Float32Array, n: number, opts: DrawOpts) {
    if (n < 2) return;
    // Build interleaved beam vertices. Close the loop (+1) so it's seamless.
    const count = n + 1;
    if (verts.length < count * 3) verts = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      const idx = i % n;
      const prev = (idx - 1 + n) % n;
      const dx = xs[idx] - xs[prev];
      const dy = ys[idx] - ys[prev];
      const speed = Math.hypot(dx, dy);
      // Dwell-based intensity: slow beam → bright. Clamp to a usable range.
      const inten = Math.min(1.0, 0.04 / (speed + 0.0025));
      verts[i * 3] = xs[idx];
      verts[i * 3 + 1] = ys[idx];
      verts[i * 3 + 2] = 0.25 + inten * 0.85;
    }

    gl!.viewport(0, 0, W, H);

    // ── Pass 1: fade previous accum (a) into b ──
    gl!.bindFramebuffer(gl!.FRAMEBUFFER, b.fbo);
    gl!.disable(gl!.BLEND);
    gl!.useProgram(fadeProg);
    gl!.activeTexture(gl!.TEXTURE0);
    gl!.bindTexture(gl!.TEXTURE_2D, a.tex);
    gl!.uniform1i(u.fadeTex, 0);
    // persistence 0..1 → fade 0.80..0.985
    gl!.uniform1f(u.fadeAmt, 0.8 + opts.persistence * 0.185);
    gl!.bindVertexArray(emptyVao);
    gl!.drawArrays(gl!.TRIANGLES, 0, 3);

    // ── Pass 2: additively draw beam over b ──
    gl!.enable(gl!.BLEND);
    gl!.blendFunc(gl!.ONE, gl!.ONE);
    gl!.useProgram(beamProg);
    gl!.uniform3fv(u.beamColor, opts.hue);
    gl!.uniform1f(u.beamBright, 0.18 + opts.brightness * 0.5);
    gl!.bindVertexArray(vao);
    gl!.bindBuffer(gl!.ARRAY_BUFFER, vbo);
    gl!.bufferData(gl!.ARRAY_BUFFER, verts.subarray(0, count * 3), gl!.DYNAMIC_DRAW);
    gl!.drawArrays(gl!.LINE_STRIP, 0, count);
    // A second, dimmer pass with points adds a beam-head sparkle on slow areas.
    gl!.drawArrays(gl!.POINTS, 0, count);

    // ── Pass 3: blit b to screen with bloom ──
    gl!.disable(gl!.BLEND);
    gl!.bindFramebuffer(gl!.FRAMEBUFFER, null);
    gl!.useProgram(blitProg);
    gl!.activeTexture(gl!.TEXTURE0);
    gl!.bindTexture(gl!.TEXTURE_2D, b.tex);
    gl!.uniform1i(u.blitTex, 0);
    gl!.uniform2f(u.blitTexel, 1 / W, 1 / H);
    gl!.bindVertexArray(emptyVao);
    gl!.drawArrays(gl!.TRIANGLES, 0, 3);

    // Swap accum buffers.
    const tmp = a;
    a = b;
    b = tmp;
  }

  function dispose() {
    gl!.deleteProgram(beamProg);
    gl!.deleteProgram(fadeProg);
    gl!.deleteProgram(blitProg);
    gl!.deleteBuffer(vbo);
    gl!.deleteVertexArray(vao);
    gl!.deleteVertexArray(emptyVao);
    gl!.deleteTexture(a.tex);
    gl!.deleteFramebuffer(a.fbo);
    gl!.deleteTexture(b.tex);
    gl!.deleteFramebuffer(b.fbo);
  }

  return { resize, draw, dispose };
}
