// ink.ts — WebGL2 ping-pong ink-diffusion field (sumi-e bleed on bone paper).
//
// Two RGBA16F textures hold the wet-paper state and are ping-ponged each frame:
//   R = dye         (accumulated prussian/indigo ink, ~permanent once settled)
//   G = wetness     (freshness of the ink, decays as the paper "dries")
// A splat pass deposits a soft brush footprint along the stroke path. A diffuse
// pass feathers the dye ONLY where the paper is still wet (dry ink locks — the
// core physical intuition of ink-wash painting), and decays wetness so strokes
// settle instead of resetting. A display pass maps the field onto a warm
// bone-white ground: indigo body, a whisper of deep-cyan in the wettest cores.
//
// Float render targets require EXT_color_buffer_float; if unavailable, makeInk
// returns null and the caller falls back to the Canvas2D ink-dab renderer.
//
// GLSL ES 3.00, hand-written. Palette is a deliberate THIRD register:
// prussian-blue / deep-indigo on warm bone — not ember/gold, not pure grayscale.

const QUAD_VERT = `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main(){
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

// Deposit a soft round brush footprint: add dye, set wetness fresh.
const SPLAT_FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 outColor;
uniform sampler2D u_state;
uniform vec2  u_point;    // 0..1 splat centre
uniform float u_radius;   // 0..1
uniform float u_strength; // dye added at centre
uniform float u_aspect;   // w/h to keep the footprint round

void main(){
  vec4 s = texture(u_state, v_uv);
  vec2 d = v_uv - u_point;
  d.x *= u_aspect;
  float dist = length(d);
  // soft brush with a slightly firmer core (calligraphic nib bite)
  float brush = 1.0 - smoothstep(0.0, u_radius, dist);
  brush = pow(brush, 1.35);
  float dye = s.r + brush * u_strength;
  float wet = max(s.g, brush);
  outColor = vec4(dye, wet, 0.0, 1.0);
}`;

// Feather (diffuse) the dye where wet, dry the paper, settle the ink.
const DIFFUSE_FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 outColor;
uniform sampler2D u_state;
uniform vec2  u_texel;
uniform float u_diffuse;  // base bleed rate
uniform float u_dryRate;  // wetness multiplier / frame (<1)
uniform float u_dyeKeep;  // dye multiplier / frame (~1, very slow dry-out)
uniform float u_audio;    // 0..1 audio energy — breathes the bleed radius

float lapR(vec2 uv){
  float c = texture(u_state, uv).r * -1.0;
  c += texture(u_state, uv + vec2( u_texel.x, 0.0)).r * 0.2;
  c += texture(u_state, uv + vec2(-u_texel.x, 0.0)).r * 0.2;
  c += texture(u_state, uv + vec2(0.0,  u_texel.y)).r * 0.2;
  c += texture(u_state, uv + vec2(0.0, -u_texel.y)).r * 0.2;
  c += texture(u_state, uv + vec2( u_texel.x,  u_texel.y)).r * 0.05;
  c += texture(u_state, uv + vec2(-u_texel.x,  u_texel.y)).r * 0.05;
  c += texture(u_state, uv + vec2( u_texel.x, -u_texel.y)).r * 0.05;
  c += texture(u_state, uv + vec2(-u_texel.x, -u_texel.y)).r * 0.05;
  return c;
}

void main(){
  vec4 s = texture(u_state, v_uv);
  float dye = s.r;
  float wet = s.g;
  // wet ink feathers; dry ink barely moves — the sumi-e bleed.
  float bleed = u_diffuse * (0.10 + 0.90 * wet) * (1.0 + 0.45 * u_audio);
  float nd = dye + bleed * lapR(v_uv);
  nd *= u_dyeKeep;
  float nw = wet * u_dryRate;
  outColor = vec4(max(nd, 0.0), clamp(nw, 0.0, 1.0), 0.0, 1.0);
}`;

// Paint the field onto warm bone paper: indigo body, deep-cyan wet cores.
const DISPLAY_FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 outColor;
uniform sampler2D u_state;
uniform float u_audio;

// hash for a faint warm paper fibre
float hash(vec2 p){
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

void main(){
  vec4 s = texture(u_state, v_uv);
  float dye = s.r;
  float wet = clamp(s.g, 0.0, 1.0);

  vec3 paper  = vec3(0.937, 0.898, 0.812); // warm bone-white ground
  vec3 indigo = vec3(0.047, 0.078, 0.196); // prussian-blue / deep indigo
  vec3 cyan   = vec3(0.000, 0.520, 0.615); // deep cyan — freshest wet cores only

  // faint paper fibre so the bone ground reads as paper, not flat fill
  float grain = (hash(floor(v_uv * 900.0)) - 0.5) * 0.02;
  paper += grain;

  float ink = 1.0 - exp(-dye * 3.2);            // soft saturating coverage
  vec3 col = mix(paper, indigo, ink);

  // whisper of deep cyan only where the ink is both dense AND freshly wet,
  // gently breathed by the audio energy of his re-voiced take.
  float core = wet * wet * ink * (0.45 + 0.75 * u_audio);
  col += cyan * core * 0.55;

  // soft paper vignette
  vec2 q = v_uv - 0.5;
  col *= 1.0 - dot(q, q) * 0.35;

  outColor = vec4(col, 1.0);
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
    console.error("ink shader compile:", gl.getShaderInfoLog(sh));
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
    console.error("ink program link:", gl.getProgramInfoLog(prog));
    gl.deleteProgram(prog);
    return null;
  }
  return prog;
}

interface Target {
  tex: WebGLTexture;
  fbo: WebGLFramebuffer;
}

export interface InkField {
  readonly size: number;
  /** Deposit a soft brush footprint at normalized (x, y), y-up. */
  splat(x: number, y: number, radius: number, strength: number): void;
  /** Advance the bleed/dry simulation `steps` times, breathed by audio 0..1. */
  step(steps: number, audio: number): void;
  /** Draw the field to the canvas' default framebuffer. */
  draw(viewW: number, viewH: number, audio: number): void;
  dispose(): void;
}

/**
 * Build the GPU ink-diffusion field. Returns null when float render targets are
 * unavailable so the caller can fall back to the Canvas2D dab renderer.
 */
export function makeInk(
  gl: WebGL2RenderingContext,
  size = 512,
): InkField | null {
  if (!gl.getExtension("EXT_color_buffer_float")) return null;

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

  const splatProg = link(gl, QUAD_VERT, SPLAT_FRAG);
  const diffuseProg = link(gl, QUAD_VERT, DIFFUSE_FRAG);
  const displayProg = link(gl, QUAD_VERT, DISPLAY_FRAG);
  if (!splatProg || !diffuseProg || !displayProg) return null;

  const internalFmt = gl.RGBA16F;

  function makeTarget(): Target | null {
    const tex = gl.createTexture();
    if (!tex) return null;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      internalFmt,
      size,
      size,
      0,
      gl.RGBA,
      gl.FLOAT,
      null,
    );
    // RGBA16F is texture-filterable in core WebGL2 — LINEAR keeps the bleed smooth.
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fbo = gl.createFramebuffer();
    if (!fbo) return null;
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
    return { tex, fbo };
  }

  const t0 = makeTarget();
  const t1 = makeTarget();
  if (!t0 || !t1) return null;
  let read = t0;
  let write = t1;

  // clear both to dry blank paper (dye 0, wet 0)
  for (const t of [t0, t1]) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  const splatLoc = {
    state: gl.getUniformLocation(splatProg, "u_state"),
    point: gl.getUniformLocation(splatProg, "u_point"),
    radius: gl.getUniformLocation(splatProg, "u_radius"),
    strength: gl.getUniformLocation(splatProg, "u_strength"),
    aspect: gl.getUniformLocation(splatProg, "u_aspect"),
  };
  const diffLoc = {
    state: gl.getUniformLocation(diffuseProg, "u_state"),
    texel: gl.getUniformLocation(diffuseProg, "u_texel"),
    diffuse: gl.getUniformLocation(diffuseProg, "u_diffuse"),
    dryRate: gl.getUniformLocation(diffuseProg, "u_dryRate"),
    dyeKeep: gl.getUniformLocation(diffuseProg, "u_dyeKeep"),
    audio: gl.getUniformLocation(diffuseProg, "u_audio"),
  };
  const dispLoc = {
    state: gl.getUniformLocation(displayProg, "u_state"),
    audio: gl.getUniformLocation(displayProg, "u_audio"),
  };

  function swap() {
    const tmp = read;
    read = write;
    write = tmp;
  }

  function splat(x: number, y: number, radius: number, strength: number) {
    gl.useProgram(splatProg);
    gl.bindVertexArray(vao);
    gl.viewport(0, 0, size, size);
    gl.uniform2f(splatLoc.point, x, y);
    gl.uniform1f(splatLoc.radius, radius);
    gl.uniform1f(splatLoc.strength, strength);
    gl.uniform1f(splatLoc.aspect, 1);
    gl.uniform1i(splatLoc.state, 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, write.fbo);
    gl.bindTexture(gl.TEXTURE_2D, read.tex);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    swap();
  }

  function step(steps: number, audio: number) {
    gl.useProgram(diffuseProg);
    gl.bindVertexArray(vao);
    gl.viewport(0, 0, size, size);
    gl.uniform2f(diffLoc.texel, 1 / size, 1 / size);
    gl.uniform1f(diffLoc.diffuse, 0.24);
    gl.uniform1f(diffLoc.dryRate, 0.982); // paper dries steadily
    gl.uniform1f(diffLoc.dyeKeep, 0.9994); // settled ink stays, dries very slowly
    gl.uniform1f(diffLoc.audio, audio);
    gl.uniform1i(diffLoc.state, 0);
    gl.activeTexture(gl.TEXTURE0);
    for (let i = 0; i < steps; i++) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, write.fbo);
      gl.bindTexture(gl.TEXTURE_2D, read.tex);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      swap();
    }
  }

  function draw(viewW: number, viewH: number, audio: number) {
    gl.useProgram(displayProg);
    gl.bindVertexArray(vao);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, viewW, viewH);
    gl.uniform1f(dispLoc.audio, audio);
    gl.uniform1i(dispLoc.state, 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, read.tex);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  return {
    size,
    splat,
    step,
    draw,
    dispose() {
      gl.deleteProgram(splatProg);
      gl.deleteProgram(diffuseProg);
      gl.deleteProgram(displayProg);
      gl.deleteBuffer(quad);
      gl.deleteVertexArray(vao);
      for (const t of [t0, t1]) {
        gl.deleteTexture(t.tex);
        gl.deleteFramebuffer(t.fbo);
      }
    },
  };
}

// ── Canvas2D fallback ────────────────────────────────────────────────────────
// A simpler ink-bleed: radial indigo dabs on bone paper that soften and dry.
// Same palette, no float compute. Keeps the piece demoable without WebGL2.

interface Dab {
  x: number; // px
  y: number;
  r: number;
  wet: number; // 1 → 0
  dye: number;
}

export interface CpuInk {
  readonly isCpu: true;
  splat(nx: number, ny: number, radius: number, strength: number): void;
  step(steps: number, audio: number): void;
  draw(ctx: CanvasRenderingContext2D, w: number, h: number, audio: number): void;
  dispose(): void;
}

export function makeCpuInk(): CpuInk {
  const dabs: Dab[] = [];
  let vw = 1;
  let vh = 1;

  return {
    isCpu: true,
    splat(nx, ny, radius, strength) {
      dabs.push({
        x: nx * vw,
        y: ny * vh,
        r: radius * Math.max(vw, vh) * 1.4,
        wet: 1,
        dye: Math.min(1, strength * 2.2),
      });
      if (dabs.length > 900) dabs.splice(0, dabs.length - 900);
    },
    step(steps, audio) {
      const dry = Math.pow(0.985, steps);
      const grow = 1 + 0.01 * steps * (1 + audio);
      for (const d of dabs) {
        d.wet *= dry;
        d.r *= grow; // wet dabs feather outward
        d.dye *= 0.9995;
      }
    },
    draw(ctx, w, h, audio) {
      vw = w;
      vh = h;
      ctx.fillStyle = "#efe5cf"; // warm bone paper
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = "multiply";
      for (const d of dabs) {
        const g = ctx.createRadialGradient(d.x, d.y, 0, d.x, d.y, d.r);
        const a = Math.min(0.9, d.dye);
        // deep-cyan whisper in the wettest cores, feathering to indigo
        const coreCyan = 0.25 * d.wet * (0.5 + audio);
        g.addColorStop(0, `rgba(0,110,130,${(a * coreCyan).toFixed(3)})`);
        g.addColorStop(0.18, `rgba(18,26,64,${a.toFixed(3)})`);
        g.addColorStop(1, "rgba(18,26,64,0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalCompositeOperation = "source-over";
    },
    dispose() {
      dabs.length = 0;
    },
  };
}
