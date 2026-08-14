// shader.ts — WebGL2 form-constant mandala with motion-driven bloom.
//
// One full-screen quad, raw #version 300 es. The visionary geometry is the
// shared log-polar engine: plane-wave stripes + a hex lattice are generated in
// *cortical* space (log r, theta) and inverse-warped (exp) back to the screen,
// so a single field yields tunnels, spirals, spokes and honeycombs — Klüver's
// four form constants under Bressloff–Cowan's retina→V1 complex-log map.
//
// A ping-pong feedback texture holds colour trails: each frame the previous
// frame is drifted outward (the tunnel "blooming"), decayed, and the fresh
// mandala is composited over it. A DISPLAY pass reads that buffer with mild
// radial chromatic aberration and paints it through an ultra-saturated
// thin-film jewel palette (magenta / gold / violet-green oil-slick).
//
// Motion energy raises: flow speed, noise amplitude, kaleidoscope fold count,
// aberration and bloom — so waving a hand makes the tunnel of light bloom and
// refold. The motion centroid bends the field's vanishing point.
//
// Feedback prefers RGBA16F (EXT_color_buffer_float); falls back to RGBA8.
// No WebGL2 → mode "none" and the page shows an on-brand notice (never throws).

import { LOGPOLAR_GLSL } from "../_shared/visionary/logpolar";

export interface MotionDrive {
  time: number; // seconds, monotonic
  dt: number; // seconds since last frame (clamped)
  energy: number; // 0..1 total motion energy (smoothed)
  bloom: number; // 0..1 slow bloom accumulator (eases up with energy)
  cx: number; // -1..1 motion centroid x (mirrored, screen space)
  cy: number; // -1..1 motion centroid y
  reduced: boolean; // prefers-reduced-motion
}

export interface MandalaRenderer {
  draw(s: MotionDrive): void;
  resize(w: number, h: number, dpr: number): void;
  dispose(): void;
  readonly mode: "webgl2-float" | "webgl2-rgba8" | "none";
}

const QUAD_VS = `#version 300 es
in vec2 a_pos;
void main(){ gl_Position = vec4(a_pos, 0.0, 1.0); }`;

const NOISE = `
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453123); }
float vnoise(vec2 p){
  vec2 i=floor(p), f=fract(p);
  vec2 u=f*f*(3.0-2.0*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),u.x),
             mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),u.x),u.y);
}
float fbm(vec2 p){
  float v=0.0, a=0.5;
  for(int i=0;i<4;i++){ v+=a*vnoise(p); p=p*2.02+vec2(3.1,1.7); a*=0.5; }
  return v;
}`;

// SIM pass: build the form-constant mandala this frame and composite it over
// the outward-drifted, decayed previous frame (colour trails).
const SIM_FS = `#version 300 es
precision highp float;
out vec4 o;
uniform sampler2D u_prev;
uniform vec2 u_res;
uniform float u_time;
uniform float u_dt;
uniform float u_energy;
uniform float u_bloom;
uniform vec2 u_centroid;
uniform float u_reduced;
uniform float u_seed;
${NOISE}
${LOGPOLAR_GLSL}

// Iridescent thin-film jewel palette — cosine palette in oil-slick coords.
vec3 jewel(float t){
  const vec3 A = vec3(0.55, 0.42, 0.55);
  const vec3 B = vec3(0.45, 0.42, 0.45);
  const vec3 C = vec3(1.00, 1.00, 1.00);
  const vec3 D = vec3(0.00, 0.33, 0.67); // magenta→gold→violet-green cycle
  return A + B * cos(6.28318530718 * (C * t + D));
}

void main(){
  vec2 uv = gl_FragCoord.xy / u_res;
  float aspect = u_res.x / u_res.y;
  vec2 p = (uv - 0.5) * vec2(aspect, 1.0) * 2.2;

  float rm = (u_reduced > 0.5) ? 0.4 : 1.0;

  // The motion centroid bends the field's vanishing point toward your hand.
  p -= u_centroid * (0.35 + 0.25 * u_bloom);

  // Kaleidoscope fold: petal count blooms with energy (3 → ~12). This is the
  // "reorganize" — more motion refolds the mandala into more symmetry.
  vec2 c0 = screenToCortex(p);          // (log r, theta)
  float petals = floor(3.0 + 9.0 * u_bloom);
  float sector = 6.28318530718 / petals;
  float th = c0.y;
  th = abs(mod(th + sector * 0.5, sector) - sector * 0.5);
  vec2 c = vec2(c0.x, th);

  // Inward tunnel drift + a slow phi sweep (tunnel → spiral → spoke), both
  // sped up by motion. All spatial motion, no luminance strobe.
  float speed = (0.16 + 0.9 * u_energy) * rm;
  float phase = -u_time * speed * 3.2;
  float phi = 0.5 + 0.9 * sin(u_time * 0.05 + 1.7 * u_bloom);
  float freq = 5.0 + 3.0 * u_bloom;

  // Cortical-space noise warp — amplitude grows with energy so the field
  // ripples and folds when you move.
  float warp = (0.15 + 0.9 * u_energy) *
               fbm(c * (1.4 + 1.5 * u_bloom) + vec2(u_time * 0.12 * rm, u_seed));
  vec2 cw = c + vec2(warp * 0.5, warp * 0.35);

  float stripes = formConstant(cw, phi, freq, phase);
  float hexf = 3.5 + 2.5 * u_bloom;
  float hex = honeycomb(cw, hexf, phase * 0.5 + u_seed);

  // Blend stripe tunnels and the honeycomb lattice; more lattice as it blooms.
  float field = mix(stripes, hex, 0.35 + 0.35 * u_bloom);

  // Sharpen into glowing filaments (the "form constant" contours).
  float ridge = pow(smoothstep(0.35, 0.85, field), 1.6);
  // A central core of light so the tunnel always has a bright throat.
  float r = length(p);
  float core = exp(-r * (1.4 - 0.6 * u_bloom)) * (0.5 + 0.5 * u_bloom);
  float inten = clamp(ridge + core, 0.0, 1.4);

  // Traveling-wave phase for the thin-film cycle.
  float tphase = 0.5 * c0.x + 0.35 * th + u_time * 0.06
               + 1.5 * field + 0.8 * u_bloom;
  vec3 col = jewel(tphase) * inten;
  // Deepen saturation toward breakthrough.
  vec3 gray = vec3(dot(col, vec3(0.299, 0.587, 0.114)));
  col = mix(col, mix(gray, col, 1.9), 0.5 + 0.4 * u_bloom);

  // Feedback: drift the previous frame outward from the (bent) center so the
  // tunnel appears to bloom toward the viewer, then decay it.
  vec2 ctr = 0.5 + u_centroid * 0.12;
  float drift = (0.006 + 0.05 * u_energy) * rm;
  vec2 back = ctr + (uv - ctr) * (1.0 - drift);
  vec3 prev = texture(u_prev, back).rgb;
  float decay = mix(0.86, 0.955, u_bloom);
  if (u_reduced > 0.5) decay = min(decay, 0.9);

  vec3 outc = max(col, prev * decay);
  outc = clamp(outc, 0.0, 3.0);
  o = vec4(outc, inten);
}`;

// DISPLAY pass: read the trail buffer with radial chromatic aberration, add a
// subtle background wash, vignette, slow luminance breathing (sub-3Hz), grain.
const SHOW_FS = `#version 300 es
precision highp float;
out vec4 o;
uniform sampler2D u_field;
uniform vec2 u_res;
uniform float u_time;
uniform float u_energy;
uniform float u_bloom;
uniform float u_reduced;
${NOISE}

void main(){
  vec2 uv = gl_FragCoord.xy / u_res;
  vec2 q = uv - 0.5;

  // Radial chromatic aberration — jeweled oil-slick fringing, grows with motion.
  float ca = (0.0016 + 0.006 * u_energy) * (u_reduced > 0.5 ? 0.4 : 1.0);
  vec2 dir = q * ca;
  float rC = texture(u_field, uv + dir).r;
  float gC = texture(u_field, uv).g;
  float bC = texture(u_field, uv - dir).b;
  vec3 col = vec3(rC, gC, bC);

  // small bloom / glow from neighbours
  vec2 texel = 1.0 / u_res;
  vec3 glow = texture(u_field, uv + texel * 2.0).rgb
            + texture(u_field, uv - texel * 2.0).rgb
            + texture(u_field, uv + vec2(texel.x, -texel.y) * 3.0).rgb
            + texture(u_field, uv + vec2(-texel.x, texel.y) * 3.0).rgb;
  col += glow * (0.10 + 0.14 * u_bloom);

  // deep jewel-black background wash so rest isn't dead black
  vec3 bg = mix(vec3(0.02, 0.01, 0.04), vec3(0.05, 0.02, 0.07),
                fbm(uv * 3.0 + u_time * 0.01));
  col += bg;

  // vignette focuses the tunnel throat
  float vig = smoothstep(1.2, 0.3, length(q) * 1.35);
  col *= vig;

  // Slow luminance breathing — a deliberately sub-3Hz drift (~0.13 Hz), NOT a
  // strobe. Damped further under reduced motion.
  float breath = 1.0 + (u_reduced > 0.5 ? 0.02 : 0.06)
               * sin(u_time * 0.8) * (0.3 + 0.7 * u_bloom);
  col *= breath;

  // grain to kill banding
  float g = (hash(uv * u_res + fract(u_time)) - 0.5)
          * (u_reduced > 0.5 ? 0.015 : 0.03);
  col += g;

  // filmic-ish tone map keeps the ultra-saturated jewels from clipping harshly
  col = col / (col + vec3(0.85));
  col = pow(col, vec3(0.82));
  o = vec4(col, 1.0);
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
    gl.deleteShader(sh);
    return null;
  }
  return sh;
}

function link(
  gl: WebGL2RenderingContext,
  vs: string,
  fs: string,
): WebGLProgram | null {
  const v = compile(gl, gl.VERTEX_SHADER, vs);
  const f = compile(gl, gl.FRAGMENT_SHADER, fs);
  if (!v || !f) return null;
  const p = gl.createProgram();
  if (!p) return null;
  gl.attachShader(p, v);
  gl.attachShader(p, f);
  gl.bindAttribLocation(p, 0, "a_pos");
  gl.linkProgram(p);
  gl.deleteShader(v);
  gl.deleteShader(f);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    gl.deleteProgram(p);
    return null;
  }
  return p;
}

const noneRenderer: MandalaRenderer = {
  draw() {},
  resize() {},
  dispose() {},
  mode: "none",
};

export function makeMandalaRenderer(
  canvas: HTMLCanvasElement,
  seed: number,
): MandalaRenderer {
  const gl = canvas.getContext("webgl2", {
    antialias: false,
    alpha: false,
    preserveDrawingBuffer: false,
  });
  if (!gl) return noneRenderer;

  const floatOk = gl.getExtension("EXT_color_buffer_float") !== null;
  gl.getExtension("OES_texture_float_linear");

  const simProg = link(gl, QUAD_VS, SIM_FS);
  const showProg = link(gl, QUAD_VS, SHOW_FS);
  if (!simProg || !showProg) {
    if (simProg) gl.deleteProgram(simProg);
    if (showProg) gl.deleteProgram(showProg);
    return noneRenderer;
  }

  const vao = gl.createVertexArray();
  const vbo = gl.createBuffer();
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 3, -1, -1, 3]),
    gl.STATIC_DRAW,
  );
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);

  const internalFormat = floatOk ? gl.RGBA16F : gl.RGBA8;
  const texType = floatOk ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE;

  let simW = 2;
  let simH = 2;

  interface Target {
    tex: WebGLTexture;
    fbo: WebGLFramebuffer;
  }
  function makeTarget(): Target {
    const g = gl as WebGL2RenderingContext;
    const tex = g.createTexture()!;
    g.bindTexture(g.TEXTURE_2D, tex);
    g.texImage2D(
      g.TEXTURE_2D,
      0,
      internalFormat,
      simW,
      simH,
      0,
      g.RGBA,
      texType,
      null,
    );
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MIN_FILTER, g.LINEAR);
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MAG_FILTER, g.LINEAR);
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_S, g.CLAMP_TO_EDGE);
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_T, g.CLAMP_TO_EDGE);
    const fbo = g.createFramebuffer()!;
    g.bindFramebuffer(g.FRAMEBUFFER, fbo);
    g.framebufferTexture2D(
      g.FRAMEBUFFER,
      g.COLOR_ATTACHMENT0,
      g.TEXTURE_2D,
      tex,
      0,
    );
    return { tex, fbo };
  }

  let a = makeTarget();
  let b = makeTarget();

  const uni = (p: WebGLProgram, n: string) => gl.getUniformLocation(p, n);
  const sU = {
    prev: uni(simProg, "u_prev"),
    res: uni(simProg, "u_res"),
    time: uni(simProg, "u_time"),
    dt: uni(simProg, "u_dt"),
    energy: uni(simProg, "u_energy"),
    bloom: uni(simProg, "u_bloom"),
    centroid: uni(simProg, "u_centroid"),
    reduced: uni(simProg, "u_reduced"),
    seed: uni(simProg, "u_seed"),
  };
  const dU = {
    field: uni(showProg, "u_field"),
    res: uni(showProg, "u_res"),
    time: uni(showProg, "u_time"),
    energy: uni(showProg, "u_energy"),
    bloom: uni(showProg, "u_bloom"),
    reduced: uni(showProg, "u_reduced"),
  };

  const seedF = (seed % 997) / 13.0;

  function resize(w: number, h: number, dpr: number): void {
    const g = gl as WebGL2RenderingContext;
    canvas.width = Math.max(1, Math.floor(w * dpr));
    canvas.height = Math.max(1, Math.floor(h * dpr));
    const scale = Math.min(1, 900 / Math.max(canvas.width, canvas.height));
    simW = Math.max(2, Math.floor(canvas.width * scale));
    simH = Math.max(2, Math.floor(canvas.height * scale));
    g.deleteTexture(a.tex);
    g.deleteFramebuffer(a.fbo);
    g.deleteTexture(b.tex);
    g.deleteFramebuffer(b.fbo);
    a = makeTarget();
    b = makeTarget();
  }

  function draw(s: MotionDrive): void {
    const g = gl as WebGL2RenderingContext;
    // SIM: read a, write b
    g.useProgram(simProg);
    g.bindVertexArray(vao);
    g.bindFramebuffer(g.FRAMEBUFFER, b.fbo);
    g.viewport(0, 0, simW, simH);
    g.activeTexture(g.TEXTURE0);
    g.bindTexture(g.TEXTURE_2D, a.tex);
    g.uniform1i(sU.prev, 0);
    g.uniform2f(sU.res, simW, simH);
    g.uniform1f(sU.time, s.time);
    g.uniform1f(sU.dt, Math.min(0.05, s.dt));
    g.uniform1f(sU.energy, s.energy);
    g.uniform1f(sU.bloom, s.bloom);
    g.uniform2f(sU.centroid, s.cx, s.cy);
    g.uniform1f(sU.reduced, s.reduced ? 1 : 0);
    g.uniform1f(sU.seed, seedF);
    g.drawArrays(g.TRIANGLES, 0, 3);

    // DISPLAY: read b → screen
    g.useProgram(showProg);
    g.bindFramebuffer(g.FRAMEBUFFER, null);
    g.viewport(0, 0, canvas.width, canvas.height);
    g.activeTexture(g.TEXTURE0);
    g.bindTexture(g.TEXTURE_2D, b.tex);
    g.uniform1i(dU.field, 0);
    g.uniform2f(dU.res, canvas.width, canvas.height);
    g.uniform1f(dU.time, s.time);
    g.uniform1f(dU.energy, s.energy);
    g.uniform1f(dU.bloom, s.bloom);
    g.uniform1f(dU.reduced, s.reduced ? 1 : 0);
    g.drawArrays(g.TRIANGLES, 0, 3);

    // swap
    const t = a;
    a = b;
    b = t;
  }

  function dispose(): void {
    const g = gl as WebGL2RenderingContext;
    g.deleteProgram(simProg);
    g.deleteProgram(showProg);
    g.deleteBuffer(vbo);
    g.deleteVertexArray(vao);
    g.deleteTexture(a.tex);
    g.deleteFramebuffer(a.fbo);
    g.deleteTexture(b.tex);
    g.deleteFramebuffer(b.fbo);
    const lose = g.getExtension("WEBGL_lose_context");
    if (lose) lose.loseContext();
  }

  return {
    draw,
    resize,
    dispose,
    mode: floatOk ? "webgl2-float" : "webgl2-rgba8",
  };
}
