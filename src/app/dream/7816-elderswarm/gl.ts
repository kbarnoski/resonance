// ─────────────────────────────────────────────────────────────────────────────
// gl.ts — WebGL2 instanced renderer for the vision-cone swarm.
//
//   • ~2000 agents drawn as instanced additive point-sprites (drawArraysInstanced)
//     — one dynamic instance buffer of [x, y, att] per agent uploaded each frame.
//   • A ping-pong FBO feedback trail: the previous frame is sampled + faded, the
//     agents are drawn on top, buffers swap — the visionary smear.
//   • A composite pass: tonemap + multi-tap bloom + a KALEIDOSCOPIC MANDALA FOLD
//     around the focus whose strength tracks coherence, so the transient
//     gaze-figure literally reads as an iris/mandala with a bright pupil.
//   • A luminance multiplier (from SafeFlicker) is applied in the composite only.
//
//   returns null if WebGL2 is unavailable → caller falls back to Canvas2D.
// ─────────────────────────────────────────────────────────────────────────────

import type { SwarmState } from "./swarm";

export interface SwarmRenderer {
  render(s: SwarmState, brightness: number): void;
  resize(): void;
  dispose(): void;
  readonly kind: "webgl2" | "canvas2d";
}

const VS_SPRITE = `#version 300 es
precision highp float;
layout(location=0) in vec2 a_corner;   // unit quad corner (-1..1)
layout(location=1) in vec2 a_pos;      // agent position (0..1 world)
layout(location=2) in float a_att;     // attention (0..1)
uniform vec2 u_res;
uniform float u_scale;                 // base sprite radius (px)
out vec2 v_corner;
out float v_att;
void main(){
  float size = u_scale * (0.55 + 1.15 * a_att);
  vec2 px = a_pos * u_res + a_corner * size;
  vec2 clip = (px / u_res) * 2.0 - 1.0;
  clip.y = -clip.y;
  gl_Position = vec4(clip, 0.0, 1.0);
  v_corner = a_corner;
  v_att = a_att;
}`;

const FS_SPRITE = `#version 300 es
precision highp float;
in vec2 v_corner;
in float v_att;
out vec4 frag;
void main(){
  float r = length(v_corner);
  float a = smoothstep(1.0, 0.0, r);
  a *= a;
  // dim violet shimmer -> warm/white pupil as attention rises
  vec3 dim = vec3(0.42, 0.30, 0.92);
  vec3 hot = vec3(1.0, 0.86, 0.62);
  vec3 c = mix(dim, hot, v_att);
  float alpha = a * (0.30 + 0.6 * v_att);
  // premultiplied additive (blend = ONE, ONE)
  frag = vec4(c * alpha, alpha);
}`;

const VS_QUAD = `#version 300 es
precision highp float;
layout(location=0) in vec2 a_pos; // -1..1 fullscreen tri/quad
out vec2 v_uv;
void main(){
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

// fade pass: sample previous trail, multiply down
const FS_FADE = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_tex;
uniform float u_fade;
out vec4 frag;
void main(){
  vec3 c = texture(u_tex, v_uv).rgb * u_fade;
  frag = vec4(c, 1.0);
}`;

// composite: bloom + mandala fold + pupil glow + tonemap + flicker
const FS_COMPOSITE = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_trail;
uniform vec2 u_texel;
uniform vec2 u_focus;
uniform float u_coherence;
uniform float u_flicker;
uniform float u_aspect;
out vec4 frag;

vec3 sampleTrail(vec2 uv){
  return texture(u_trail, clamp(uv, 0.0, 1.0)).rgb;
}

void main(){
  vec3 base = sampleTrail(v_uv);

  // cheap multi-tap bloom (8 taps on a ring + wider ring)
  vec3 bloom = vec3(0.0);
  float o1 = 2.5;
  float o2 = 6.0;
  for(int k=0;k<8;k++){
    float a = float(k) * 0.7853981;
    vec2 d = vec2(cos(a), sin(a));
    bloom += sampleTrail(v_uv + d * u_texel * o1);
    bloom += sampleTrail(v_uv + d * u_texel * o2) * 0.6;
  }
  bloom /= 12.8;

  vec3 col = base + bloom * 0.7;

  // KALEIDOSCOPIC MANDALA FOLD around the focus — grows with coherence.
  if(u_coherence > 0.02){
    vec2 rel = v_uv - u_focus;
    rel.x *= u_aspect;                 // circular symmetry regardless of aspect
    float ang = atan(rel.y, rel.x);
    float rad = length(rel);
    float sectors = 8.0;
    float seg = 6.2831853 / sectors;
    ang = abs(mod(ang, seg) - seg * 0.5);   // mirror into one wedge
    vec2 fold = vec2(cos(ang), sin(ang)) * rad;
    fold.x /= u_aspect;
    vec3 m = sampleTrail(u_focus + fold);
    col += m * u_coherence * 0.85;
  }

  // bright pupil glow centred on the focus
  vec2 pr = v_uv - u_focus;
  pr.x *= u_aspect;
  float pd = length(pr);
  float pupil = exp(-pd * pd * 220.0) * u_coherence;
  col += vec3(1.0, 0.9, 0.72) * pupil * 1.4;

  // filmic-ish tonemap, then luminance-safe flicker, then gamma
  col = col / (col + vec3(0.75));
  col *= u_flicker;
  col = pow(col, vec3(0.85));
  frag = vec4(col, 1.0);
}`;

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error("shader compile failed: " + log);
  }
  return sh;
}

function link(gl: WebGL2RenderingContext, vs: string, fs: string): WebGLProgram {
  const p = gl.createProgram()!;
  const v = compile(gl, gl.VERTEX_SHADER, vs);
  const f = compile(gl, gl.FRAGMENT_SHADER, fs);
  gl.attachShader(p, v);
  gl.attachShader(p, f);
  gl.linkProgram(p);
  gl.deleteShader(v);
  gl.deleteShader(f);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(p);
    gl.deleteProgram(p);
    throw new Error("program link failed: " + log);
  }
  return p;
}

interface Target {
  fbo: WebGLFramebuffer;
  tex: WebGLTexture;
}

export function createGLRenderer(canvas: HTMLCanvasElement): SwarmRenderer | null {
  const gl = canvas.getContext("webgl2", {
    antialias: false,
    alpha: false,
    premultipliedAlpha: false,
    preserveDrawingBuffer: false,
  });
  if (!gl) return null;

  // float/half-float render targets make the feedback trail smooth; fall back
  // to 8-bit if the extension is missing.
  const hf = gl.getExtension("EXT_color_buffer_float");
  const texType = hf ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE;
  const internalFmt = hf ? gl.RGBA16F : gl.RGBA8;

  const progSprite = link(gl, VS_SPRITE, FS_SPRITE);
  const progFade = link(gl, VS_QUAD, FS_FADE);
  const progComposite = link(gl, VS_QUAD, FS_COMPOSITE);

  // unit quad for sprites (two triangles as a strip)
  const quadCorners = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);
  const cornerBuf = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, cornerBuf);
  gl.bufferData(gl.ARRAY_BUFFER, quadCorners, gl.STATIC_DRAW);

  // fullscreen quad
  const fsQuad = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);
  const fsBuf = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, fsBuf);
  gl.bufferData(gl.ARRAY_BUFFER, fsQuad, gl.STATIC_DRAW);

  // dynamic per-instance buffer [x, y, att] * N (allocated on first render)
  const instBuf = gl.createBuffer()!;
  let instData = new Float32Array(0);

  // VAO for sprites
  const spriteVAO = gl.createVertexArray()!;
  gl.bindVertexArray(spriteVAO);
  gl.bindBuffer(gl.ARRAY_BUFFER, cornerBuf);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, instBuf);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 12, 0);
  gl.vertexAttribDivisor(1, 1);
  gl.enableVertexAttribArray(2);
  gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 12, 8);
  gl.vertexAttribDivisor(2, 1);
  gl.bindVertexArray(null);

  // VAO for fullscreen passes
  const quadVAO = gl.createVertexArray()!;
  gl.bindVertexArray(quadVAO);
  gl.bindBuffer(gl.ARRAY_BUFFER, fsBuf);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);

  let W = 1;
  let H = 1;
  let ping: Target | null = null;
  let pong: Target | null = null;

  function makeTarget(): Target {
    const tex = gl!.createTexture()!;
    gl!.bindTexture(gl!.TEXTURE_2D, tex);
    gl!.texImage2D(gl!.TEXTURE_2D, 0, internalFmt, W, H, 0, gl!.RGBA, texType, null);
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MIN_FILTER, gl!.LINEAR);
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MAG_FILTER, gl!.LINEAR);
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_S, gl!.CLAMP_TO_EDGE);
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_T, gl!.CLAMP_TO_EDGE);
    const fbo = gl!.createFramebuffer()!;
    gl!.bindFramebuffer(gl!.FRAMEBUFFER, fbo);
    gl!.framebufferTexture2D(gl!.FRAMEBUFFER, gl!.COLOR_ATTACHMENT0, gl!.TEXTURE_2D, tex, 0);
    gl!.bindFramebuffer(gl!.FRAMEBUFFER, null);
    return { fbo, tex };
  }

  function freeTarget(t: Target | null) {
    if (!t) return;
    gl!.deleteTexture(t.tex);
    gl!.deleteFramebuffer(t.fbo);
  }

  function resize(): void {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(1, Math.floor(canvas.clientWidth * dpr));
    const h = Math.max(1, Math.floor(canvas.clientHeight * dpr));
    if (w === W && h === H && ping && pong) return;
    canvas.width = w;
    canvas.height = h;
    W = w;
    H = h;
    freeTarget(ping);
    freeTarget(pong);
    ping = makeTarget();
    pong = makeTarget();
  }
  resize();

  // uniform locations
  const uSpriteRes = gl.getUniformLocation(progSprite, "u_res");
  const uSpriteScale = gl.getUniformLocation(progSprite, "u_scale");
  const uFadeTex = gl.getUniformLocation(progFade, "u_tex");
  const uFadeAmt = gl.getUniformLocation(progFade, "u_fade");
  const uCTrail = gl.getUniformLocation(progComposite, "u_trail");
  const uCTexel = gl.getUniformLocation(progComposite, "u_texel");
  const uCFocus = gl.getUniformLocation(progComposite, "u_focus");
  const uCCoh = gl.getUniformLocation(progComposite, "u_coherence");
  const uCFlicker = gl.getUniformLocation(progComposite, "u_flicker");
  const uCAspect = gl.getUniformLocation(progComposite, "u_aspect");

  function render(s: SwarmState, brightness: number): void {
    if (!ping || !pong) return;
    const n = s.n;
    if (instData.length !== n * 3) instData = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const o = i * 3;
      instData[o] = s.x[i];
      instData[o + 1] = s.y[i];
      instData[o + 2] = s.att[i];
    }
    gl!.bindBuffer(gl!.ARRAY_BUFFER, instBuf);
    gl!.bufferData(gl!.ARRAY_BUFFER, instData, gl!.DYNAMIC_DRAW);

    // ── pass 1: fade the previous trail into `pong`
    gl!.bindFramebuffer(gl!.FRAMEBUFFER, pong.fbo);
    gl!.viewport(0, 0, W, H);
    gl!.disable(gl!.BLEND);
    gl!.useProgram(progFade);
    gl!.activeTexture(gl!.TEXTURE0);
    gl!.bindTexture(gl!.TEXTURE_2D, ping.tex);
    gl!.uniform1i(uFadeTex, 0);
    gl!.uniform1f(uFadeAmt, 0.9);
    gl!.bindVertexArray(quadVAO);
    gl!.drawArrays(gl!.TRIANGLE_STRIP, 0, 4);

    // ── pass 2: draw agents additively on top of the faded trail
    gl!.enable(gl!.BLEND);
    gl!.blendFunc(gl!.ONE, gl!.ONE);
    gl!.useProgram(progSprite);
    gl!.uniform2f(uSpriteRes, W, H);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    gl!.uniform1f(uSpriteScale, 2.6 * dpr);
    gl!.bindVertexArray(spriteVAO);
    gl!.drawArraysInstanced(gl!.TRIANGLE_STRIP, 0, 4, n);

    // swap: pong is now the current trail
    const t = ping;
    ping = pong;
    pong = t;

    // ── pass 3: composite the trail to the screen
    gl!.bindFramebuffer(gl!.FRAMEBUFFER, null);
    gl!.viewport(0, 0, W, H);
    gl!.disable(gl!.BLEND);
    gl!.useProgram(progComposite);
    gl!.activeTexture(gl!.TEXTURE0);
    gl!.bindTexture(gl!.TEXTURE_2D, ping.tex);
    gl!.uniform1i(uCTrail, 0);
    gl!.uniform2f(uCTexel, 1 / W, 1 / H);
    gl!.uniform2f(uCFocus, s.focusX, s.focusY);
    gl!.uniform1f(uCCoh, s.coherence);
    gl!.uniform1f(uCFlicker, brightness);
    gl!.uniform1f(uCAspect, W / H);
    gl!.bindVertexArray(quadVAO);
    gl!.drawArrays(gl!.TRIANGLE_STRIP, 0, 4);
    gl!.bindVertexArray(null);
  }

  function dispose(): void {
    freeTarget(ping);
    freeTarget(pong);
    ping = null;
    pong = null;
    gl!.deleteBuffer(cornerBuf);
    gl!.deleteBuffer(fsBuf);
    gl!.deleteBuffer(instBuf);
    gl!.deleteVertexArray(spriteVAO);
    gl!.deleteVertexArray(quadVAO);
    gl!.deleteProgram(progSprite);
    gl!.deleteProgram(progFade);
    gl!.deleteProgram(progComposite);
    const lose = gl!.getExtension("WEBGL_lose_context");
    if (lose) lose.loseContext();
  }

  return { render, resize, dispose, kind: "webgl2" };
}
