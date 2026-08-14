// ─────────────────────────────────────────────────────────────────────────────
// 11712-attractorveil · gl.ts — WebGL2 GPU particle nebula via TRANSFORM FEEDBACK.
//
//   Tens of thousands of light-points stream along a strange-attractor FLOW
//   FIELD, their positions advanced entirely on the GPU. Two vertex buffers
//   ping-pong: an UPDATE program reads buffer A, advances every point one step of
//   the flow, and writes buffer B via transform feedback (rasterizer discarded);
//   a RENDER program then draws buffer B as small additive glowing sprites; then
//   the buffers swap. Positions accumulate on the GPU — the CPU never touches a
//   particle after upload.
//
//   THE FLOW FIELD. Each point p is pushed toward the image of the PETER DE JONG
//   attractor map at p:
//       deJong(p) = ( sin(a·p.y) − cos(b·p.x),  sin(c·p.x) − cos(d·p.y) )
//   Taking v = deJong(p) − p as a velocity field and integrating p += v·flow·dt
//   traces the attractor's filigree as streaming light — the "strange-attractor
//   flow field" technique (tracing particles through an attractor's vector field,
//   after BIT-101 / Keith Peters; attractors after Peter de Jong & Clifford
//   Pickover). Points fade in on spawn and are recycled on a per-point life so
//   the veil keeps flowing instead of collapsing onto the fixed manifold.
//
//   TRAILS. The default framebuffer is preserved; each frame a translucent
//   deep-indigo quad is drawn over it (soft fade toward the void), then the points
//   are added on top — so fast-moving points leave glowing streaks.
//
//   PALETTE lives ONLY here: cool pale-aurora — jade + rose-quartz over deep
//   indigo. No violet, no cyan/teal, no warm-gold, no magenta.
// ─────────────────────────────────────────────────────────────────────────────

export interface VeilParams {
  /** de Jong parameters a,b,c,d (the evolving nebula shape). */
  a: number;
  b: number;
  c: number;
  d: number;
  /** Seconds since mount — the age clock (respawn salt + nothing else). */
  age: number;
  /** Frame delta in seconds (clamped upstream). */
  dt: number;
  /** Flow speed already folded with audio + reduced-motion (world units/s-ish). */
  flow: number;
  /** 0..1 amplitude → point brightness. */
  amp: number;
  /** 0..1 jade↔rose palette balance. */
  hue: number;
  /** 0..1 density/exposure → overall veil glow + point size. */
  density: number;
}

export interface VeilRenderer {
  /** True only if transform feedback + the whole pipeline came up. */
  readonly ok: boolean;
  resize(w: number, h: number, dpr: number): void;
  render(p: VeilParams): void;
  dispose(): void;
}

const PARTICLES = 80000;
const FLOATS_PER = 4; // x, y, age, seed
const STRIDE = FLOATS_PER * 4; // bytes

// ── update program: advance the flow field, write via transform feedback ──────
const UPDATE_VERT = `#version 300 es
precision highp float;
layout(location=0) in vec2 aPos;
layout(location=1) in float aAge;
layout(location=2) in float aSeed;

uniform vec4  uParams; // a,b,c,d
uniform float uFlow;
uniform float uDt;
uniform float uAge;

out vec2  vPos;
out float vAge;
out float vSeed;

float hash11(float p){
  p = fract(p * 0.1031);
  p *= p + 33.33;
  p *= p + p;
  return fract(p);
}

// Peter de Jong attractor map — the strange attractor whose vector field the
// points stream along.
vec2 deJong(vec2 p, vec4 c){
  return vec2(sin(c.x * p.y) - cos(c.y * p.x),
              sin(c.z * p.x) - cos(c.w * p.y));
}

void main(){
  float life = 2.0 + aSeed * 4.5;       // 2..6.5 s, spread by seed
  float age  = aAge + uDt;
  vec2  pos  = aPos;

  if(age > life){
    // recycle: reseed somewhere in the field. The salt (floored age) makes each
    // respawn cycle land in a fresh place, so the veil never stalls or repeats.
    float k  = floor(uAge * 1.7);
    float h1 = hash11(aSeed * 127.1 + k * 3.7);
    float h2 = hash11(aSeed * 311.7 + k * 5.3 + 19.0);
    pos = (vec2(h1, h2) * 2.0 - 1.0) * 1.9;
    age = 0.0;
  } else {
    // integrate one step of the attractor flow field
    vec2 target = deJong(pos, uParams);
    pos += (target - pos) * uFlow * uDt;
  }

  vPos  = pos;
  vAge  = age;
  vSeed = aSeed;
  gl_Position = vec4(0.0); // rasterizer is discarded during update
}`;

const UPDATE_FRAG = `#version 300 es
precision highp float;
out vec4 c;
void main(){ c = vec4(0.0); }`;

// ── render program: draw points as additive glowing aurora sprites ────────────
const RENDER_VERT = `#version 300 es
precision highp float;
layout(location=0) in vec2 aPos;
layout(location=1) in float aAge;
layout(location=2) in float aSeed;

uniform vec4  uParams;
uniform vec2  uScale;
uniform float uHue;
uniform float uAmp;
uniform float uDensity;
uniform float uPointSize;

out vec3  vColor;
out float vGlow;

vec2 deJong(vec2 p, vec4 c){
  return vec2(sin(c.x * p.y) - cos(c.y * p.x),
              sin(c.z * p.x) - cos(c.w * p.y));
}

void main(){
  float life = 2.0 + aSeed * 4.5;
  float lf   = aAge / life;
  // fade in on spawn, fade out before recycle → no pops
  float env  = smoothstep(0.0, 0.10, lf) * smoothstep(1.0, 0.70, lf);

  // local flow speed + direction (recomputed, not stored)
  vec2  vel   = deJong(aPos, uParams) - aPos;
  float speed = length(vel);
  float ang   = atan(vel.y, vel.x);

  // brightness rides local speed × amplitude — streaks glow where flow is fast
  float glow = (0.10 + 0.55 * smoothstep(0.03, 1.1, speed))
             * (0.45 + 0.95 * uAmp)
             * (0.55 + 0.9 * uDensity)
             * env;

  // COOL PALE-AURORA palette (jade + rose-quartz over deep indigo)
  vec3 jade = vec3(0.38, 0.86, 0.66);
  vec3 rose = vec3(0.96, 0.66, 0.77);
  float hm = fract(aSeed * 0.71 + uHue * 0.5 + ang * 0.15915);
  vec3 col = mix(jade, rose, smoothstep(0.18, 0.82, hm));

  vColor = col;
  vGlow  = glow;
  gl_Position  = vec4(aPos * uScale, 0.0, 1.0);
  gl_PointSize = uPointSize;
}`;

const RENDER_FRAG = `#version 300 es
precision highp float;
in vec3  vColor;
in float vGlow;
out vec4 fragColor;
void main(){
  vec2 d = gl_PointCoord - 0.5;
  float r = length(d);
  float a = smoothstep(0.5, 0.0, r); // soft round sprite
  a *= a;
  fragColor = vec4(vColor * vGlow, a);
}`;

// ── fade quad: dim the previous frame toward deep indigo (the trail) ──────────
const FADE_VERT = `#version 300 es
precision highp float;
layout(location=0) in vec2 aP;
void main(){ gl_Position = vec4(aP, 0.0, 1.0); }`;

const FADE_FRAG = `#version 300 es
precision highp float;
uniform float uFade;
out vec4 c;
void main(){ c = vec4(0.035, 0.045, 0.11, uFade); }`;

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader | null {
  const sh = gl.createShader(type);
  if (!sh) return null;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    console.error("attractorveil shader compile error:", gl.getShaderInfoLog(sh));
    gl.deleteShader(sh);
    return null;
  }
  return sh;
}

function link(
  gl: WebGL2RenderingContext,
  vsrc: string,
  fsrc: string,
  feedback?: string[],
): WebGLProgram | null {
  const vs = compile(gl, gl.VERTEX_SHADER, vsrc);
  const fs = compile(gl, gl.FRAGMENT_SHADER, fsrc);
  if (!vs || !fs) return null;
  const prog = gl.createProgram();
  if (!prog) return null;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  if (feedback) gl.transformFeedbackVaryings(prog, feedback, gl.INTERLEAVED_ATTRIBS);
  gl.linkProgram(prog);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.error("attractorveil link error:", gl.getProgramInfoLog(prog));
    gl.deleteProgram(prog);
    return null;
  }
  return prog;
}

export function makeVeilRenderer(canvas: HTMLCanvasElement, seedRandom: () => number): VeilRenderer | null {
  const gl = canvas.getContext("webgl2", {
    antialias: false,
    alpha: false,
    depth: false,
    preserveDrawingBuffer: true, // keep the accumulation between frames (trails)
  });
  if (!gl) return null;
  if (typeof gl.createTransformFeedback !== "function") return null;

  const updateProg = link(gl, UPDATE_VERT, UPDATE_FRAG, ["vPos", "vAge", "vSeed"]);
  const renderProg = link(gl, RENDER_VERT, RENDER_FRAG);
  const fadeProg = link(gl, FADE_VERT, FADE_FRAG);
  if (!updateProg || !renderProg || !fadeProg) return null;

  // ── seed the two ping-pong particle buffers ────────────────────────────────
  const init = new Float32Array(PARTICLES * FLOATS_PER);
  for (let i = 0; i < PARTICLES; i++) {
    const o = i * FLOATS_PER;
    const seed = seedRandom();
    const life = 2 + seed * 4.5;
    init[o + 0] = (seedRandom() * 2 - 1) * 1.9; // x
    init[o + 1] = (seedRandom() * 2 - 1) * 1.9; // y
    init[o + 2] = seedRandom() * life; // age, staggered so recycling is spread
    init[o + 3] = seed; // seed (constant, passed through feedback)
  }

  const buffers: (WebGLBuffer | null)[] = [gl.createBuffer(), gl.createBuffer()];
  for (const b of buffers) {
    gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, init, gl.DYNAMIC_COPY);
  }

  // A VAO per (program, source-buffer) pairing wires up the interleaved attribs.
  const makeVAO = (buf: WebGLBuffer | null): WebGLVertexArrayObject | null => {
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, STRIDE, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 1, gl.FLOAT, false, STRIDE, 8);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 1, gl.FLOAT, false, STRIDE, 12);
    gl.bindVertexArray(null);
    return vao;
  };
  const updateVAO = [makeVAO(buffers[0]), makeVAO(buffers[1])];
  const renderVAO = [makeVAO(buffers[0]), makeVAO(buffers[1])];

  const tf = gl.createTransformFeedback();

  // fullscreen fade quad
  const fadeVAO = gl.createVertexArray();
  gl.bindVertexArray(fadeVAO);
  const fadeBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, fadeBuf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);

  const loc = (p: WebGLProgram, n: string) => gl.getUniformLocation(p, n);
  const uU = {
    params: loc(updateProg, "uParams"),
    flow: loc(updateProg, "uFlow"),
    dt: loc(updateProg, "uDt"),
    age: loc(updateProg, "uAge"),
  };
  const uR = {
    params: loc(renderProg, "uParams"),
    scale: loc(renderProg, "uScale"),
    hue: loc(renderProg, "uHue"),
    amp: loc(renderProg, "uAmp"),
    density: loc(renderProg, "uDensity"),
    pointSize: loc(renderProg, "uPointSize"),
  };
  const uFadeLoc = loc(fadeProg, "uFade");

  let src = 0;
  let scaleX = 0.34;
  let scaleY = 0.34;
  let pixelRatio = 1;
  let disposed = false;

  const clearIndigo = () => {
    gl.clearColor(0.035, 0.045, 0.11, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);
  };
  clearIndigo();

  return {
    ok: true,
    resize(w: number, h: number, dpr: number) {
      canvas.width = w;
      canvas.height = h;
      pixelRatio = dpr;
      gl.viewport(0, 0, w, h);
      const base = 0.34;
      // keep the attractor circular regardless of aspect
      scaleX = base * Math.min(1, h / w);
      scaleY = base * Math.min(1, w / h);
      clearIndigo(); // the preserved buffer was reset by the resize
    },
    render(p: VeilParams) {
      if (disposed) return;
      const dst = 1 - src;

      // ── 1. UPDATE PASS — advance every point on the GPU via transform feedback
      gl.enable(gl.RASTERIZER_DISCARD);
      gl.useProgram(updateProg);
      gl.uniform4f(uU.params, p.a, p.b, p.c, p.d);
      gl.uniform1f(uU.flow, p.flow);
      gl.uniform1f(uU.dt, p.dt);
      gl.uniform1f(uU.age, p.age);
      gl.bindVertexArray(updateVAO[src]);
      gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, tf);
      gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, buffers[dst]);
      gl.beginTransformFeedback(gl.POINTS);
      gl.drawArrays(gl.POINTS, 0, PARTICLES);
      gl.endTransformFeedback();
      gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, null);
      gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, null);
      gl.bindVertexArray(null);
      gl.disable(gl.RASTERIZER_DISCARD);

      // ── 2. FADE PASS — dim the previous frame toward deep indigo (the trail)
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.useProgram(fadeProg);
      gl.uniform1f(uFadeLoc, 0.085);
      gl.bindVertexArray(fadeVAO);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.bindVertexArray(null);

      // ── 3. RENDER PASS — additive glowing aurora sprites from the NEW buffer
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
      gl.useProgram(renderProg);
      gl.uniform4f(uR.params, p.a, p.b, p.c, p.d);
      gl.uniform2f(uR.scale, scaleX, scaleY);
      gl.uniform1f(uR.hue, p.hue);
      gl.uniform1f(uR.amp, p.amp);
      gl.uniform1f(uR.density, p.density);
      gl.uniform1f(uR.pointSize, (1.6 + 1.4 * p.density) * pixelRatio);
      gl.bindVertexArray(renderVAO[dst]);
      gl.drawArrays(gl.POINTS, 0, PARTICLES);
      gl.bindVertexArray(null);
      gl.disable(gl.BLEND);

      src = dst; // ping-pong
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      try {
        for (const b of buffers) gl.deleteBuffer(b);
        gl.deleteBuffer(fadeBuf);
        for (const v of updateVAO) gl.deleteVertexArray(v);
        for (const v of renderVAO) gl.deleteVertexArray(v);
        gl.deleteVertexArray(fadeVAO);
        gl.deleteTransformFeedback(tf);
        gl.deleteProgram(updateProg);
        gl.deleteProgram(renderProg);
        gl.deleteProgram(fadeProg);
        gl.getExtension("WEBGL_lose_context")?.loseContext();
      } catch {
        /* context already gone */
      }
    },
  };
}
