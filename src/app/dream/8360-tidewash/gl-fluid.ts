// Tier 2 — WebGL2 fragment-shader fluid (ping-pong float FBOs). Same
// Stam-style scheme as the WebGPU tier, so machines without navigator.gpu
// still get a genuine advected fluid rather than a cheaper look.

import type { Splat, VisualFluid } from "./shared";

const SIM = 256;
const JACOBI = 18;

const VERT = `#version 300 es
out vec2 uv;
void main(){
  vec2 pos = vec2(float((gl_VertexID & 1) << 2) - 1.0,
                  float((gl_VertexID & 2) << 1) - 1.0);
  uv = pos * 0.5 + 0.5;
  gl_Position = vec4(pos, 0.0, 1.0);
}`;

const HEAD = `#version 300 es
precision highp float;
in vec2 uv;
out vec4 frag;`;

const ADVECT_FS = `${HEAD}
uniform sampler2D vel; uniform sampler2D src; uniform float dt; uniform float diss;
void main(){
  vec2 v = texture(vel, uv).xy;
  vec2 b = clamp(uv - dt * v, 0.0, 1.0);
  frag = diss * texture(src, b);
}`;

const DIV_FS = `${HEAD}
uniform sampler2D vel;
void main(){
  vec2 ts = 1.0 / vec2(textureSize(vel, 0));
  float L = texture(vel, uv - vec2(ts.x,0.0)).x;
  float R = texture(vel, uv + vec2(ts.x,0.0)).x;
  float B = texture(vel, uv - vec2(0.0,ts.y)).y;
  float T = texture(vel, uv + vec2(0.0,ts.y)).y;
  frag = vec4((R-L+T-B)*0.5, 0.0, 0.0, 1.0);
}`;

const CURL_FS = `${HEAD}
uniform sampler2D vel;
void main(){
  vec2 ts = 1.0 / vec2(textureSize(vel, 0));
  float L = texture(vel, uv - vec2(ts.x,0.0)).y;
  float R = texture(vel, uv + vec2(ts.x,0.0)).y;
  float B = texture(vel, uv - vec2(0.0,ts.y)).x;
  float T = texture(vel, uv + vec2(0.0,ts.y)).x;
  frag = vec4((R-L)-(T-B), 0.0, 0.0, 1.0);
}`;

const VORT_FS = `${HEAD}
uniform sampler2D vel; uniform sampler2D curl; uniform float strength;
void main(){
  vec2 ts = 1.0 / vec2(textureSize(vel, 0));
  float L = abs(texture(curl, uv - vec2(ts.x,0.0)).x);
  float R = abs(texture(curl, uv + vec2(ts.x,0.0)).x);
  float B = abs(texture(curl, uv - vec2(0.0,ts.y)).x);
  float T = abs(texture(curl, uv + vec2(0.0,ts.y)).x);
  float c = texture(curl, uv).x;
  vec2 n = vec2(R-L, T-B);
  n = n / (length(n) + 1e-5);
  vec2 force = vec2(n.y, -n.x) * c;
  vec2 v = texture(vel, uv).xy + force * strength;
  frag = vec4(v, 0.0, 1.0);
}`;

const PRES_FS = `${HEAD}
uniform sampler2D pres; uniform sampler2D divTex;
void main(){
  vec2 ts = 1.0 / vec2(textureSize(pres, 0));
  float L = texture(pres, uv - vec2(ts.x,0.0)).x;
  float R = texture(pres, uv + vec2(ts.x,0.0)).x;
  float B = texture(pres, uv - vec2(0.0,ts.y)).x;
  float T = texture(pres, uv + vec2(0.0,ts.y)).x;
  float d = texture(divTex, uv).x;
  frag = vec4((L+R+B+T-d)*0.25, 0.0, 0.0, 1.0);
}`;

const GRAD_FS = `${HEAD}
uniform sampler2D pres; uniform sampler2D vel;
void main(){
  vec2 ts = 1.0 / vec2(textureSize(pres, 0));
  float L = texture(pres, uv - vec2(ts.x,0.0)).x;
  float R = texture(pres, uv + vec2(ts.x,0.0)).x;
  float B = texture(pres, uv - vec2(0.0,ts.y)).x;
  float T = texture(pres, uv + vec2(0.0,ts.y)).x;
  vec2 v = texture(vel, uv).xy;
  frag = vec4(v - 0.5*vec2(R-L,T-B), 0.0, 1.0);
}`;

const SPLAT_FS = `${HEAD}
uniform sampler2D src; uniform vec2 pos; uniform float rad; uniform float aspect; uniform vec3 col;
void main(){
  vec2 d = uv - pos;
  d.x *= aspect;
  float g = exp(-dot(d,d) / rad);
  frag = texture(src, uv) + vec4(g * col, 0.0);
}`;

const DISPLAY_FS = `${HEAD}
uniform sampler2D dye;
void main(){
  vec3 c = texture(dye, uv).rgb + vec3(0.02, 0.015, 0.06);
  c = c / (1.0 + dot(c, vec3(0.299,0.587,0.114)));
  frag = vec4(pow(max(c, vec3(0.0)), vec3(0.45)), 1.0);
}`;

interface Fbo {
  tex: WebGLTexture;
  fbo: WebGLFramebuffer;
}

export function makeGlFluid(canvas: HTMLCanvasElement): VisualFluid {
  const gl = canvas.getContext("webgl2", {
    antialias: false,
    depth: false,
    alpha: false,
  });
  if (!gl) throw new Error("WebGL2 unavailable");
  if (!gl.getExtension("EXT_color_buffer_float")) {
    throw new Error("float render targets unavailable");
  }
  gl.getExtension("OES_texture_float_linear");

  function compile(src: string, type: number): WebGLShader {
    const sh = gl!.createShader(type)!;
    gl!.shaderSource(sh, src);
    gl!.compileShader(sh);
    if (!gl!.getShaderParameter(sh, gl!.COMPILE_STATUS)) {
      const log = gl!.getShaderInfoLog(sh);
      gl!.deleteShader(sh);
      throw new Error("shader compile failed: " + log);
    }
    return sh;
  }

  function program(fsSrc: string): WebGLProgram {
    const p = gl!.createProgram()!;
    const vs = compile(VERT, gl!.VERTEX_SHADER);
    const fs = compile(fsSrc, gl!.FRAGMENT_SHADER);
    gl!.attachShader(p, vs);
    gl!.attachShader(p, fs);
    gl!.linkProgram(p);
    gl!.deleteShader(vs);
    gl!.deleteShader(fs);
    if (!gl!.getProgramParameter(p, gl!.LINK_STATUS)) {
      throw new Error("link failed: " + gl!.getProgramInfoLog(p));
    }
    return p;
  }

  const vao = gl.createVertexArray();

  function mkTex(): WebGLTexture {
    const t = gl!.createTexture()!;
    gl!.bindTexture(gl!.TEXTURE_2D, t);
    gl!.texImage2D(
      gl!.TEXTURE_2D, 0, gl!.RGBA16F, SIM, SIM, 0, gl!.RGBA, gl!.HALF_FLOAT, null,
    );
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MIN_FILTER, gl!.LINEAR);
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MAG_FILTER, gl!.LINEAR);
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_S, gl!.CLAMP_TO_EDGE);
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_T, gl!.CLAMP_TO_EDGE);
    return t;
  }

  function mkFbo(): Fbo {
    const tex = mkTex();
    const fbo = gl!.createFramebuffer()!;
    gl!.bindFramebuffer(gl!.FRAMEBUFFER, fbo);
    gl!.framebufferTexture2D(
      gl!.FRAMEBUFFER, gl!.COLOR_ATTACHMENT0, gl!.TEXTURE_2D, tex, 0,
    );
    return { tex, fbo };
  }

  const vel: [Fbo, Fbo] = [mkFbo(), mkFbo()];
  const pres: [Fbo, Fbo] = [mkFbo(), mkFbo()];
  const dye: [Fbo, Fbo] = [mkFbo(), mkFbo()];
  const divFbo = mkFbo();
  const curlFbo = mkFbo();

  const pAdvect = program(ADVECT_FS);
  const pDiv = program(DIV_FS);
  const pCurl = program(CURL_FS);
  const pVort = program(VORT_FS);
  const pPres = program(PRES_FS);
  const pGrad = program(GRAD_FS);
  const pSplat = program(SPLAT_FS);
  const pDisplay = program(DISPLAY_FS);
  const programs = [pAdvect, pDiv, pCurl, pVort, pPres, pGrad, pSplat, pDisplay];

  let vR = 0;
  let pR = 0;
  let dR = 0;
  let dead = false;

  const aspect = canvas.width / Math.max(1, canvas.height);

  function bindTex(prog: WebGLProgram, name: string, unit: number, tex: WebGLTexture): void {
    gl!.activeTexture(gl!.TEXTURE0 + unit);
    gl!.bindTexture(gl!.TEXTURE_2D, tex);
    gl!.uniform1i(gl!.getUniformLocation(prog, name), unit);
  }

  function draw(target: Fbo | null, w: number, h: number): void {
    gl!.bindFramebuffer(gl!.FRAMEBUFFER, target ? target.fbo : null);
    gl!.viewport(0, 0, w, h);
    gl!.bindVertexArray(vao);
    gl!.drawArrays(gl!.TRIANGLES, 0, 3);
  }

  function doSplat(s: Splat): void {
    if (dead) return;
    const x = s.x;
    const y = 1 - s.y;
    // velocity
    gl!.useProgram(pSplat);
    bindTex(pSplat, "src", 0, vel[vR].tex);
    gl!.uniform2f(gl!.getUniformLocation(pSplat, "pos"), x, y);
    gl!.uniform1f(gl!.getUniformLocation(pSplat, "rad"), s.radius * s.radius * 6);
    gl!.uniform1f(gl!.getUniformLocation(pSplat, "aspect"), aspect);
    gl!.uniform3f(gl!.getUniformLocation(pSplat, "col"), s.vx, -s.vy, 0);
    draw(vel[1 - vR], SIM, SIM);
    vR = 1 - vR;
    // dye
    bindTex(pSplat, "src", 0, dye[dR].tex);
    gl!.uniform1f(gl!.getUniformLocation(pSplat, "rad"), s.radius * s.radius * 4);
    gl!.uniform3f(gl!.getUniformLocation(pSplat, "col"), s.r, s.g, s.b);
    draw(dye[1 - dR], SIM, SIM);
    dR = 1 - dR;
  }

  function frame(dt: number): void {
    if (dead) return;
    const h = Math.min(dt, 1 / 30);

    // advect velocity
    gl!.useProgram(pAdvect);
    bindTex(pAdvect, "vel", 0, vel[vR].tex);
    bindTex(pAdvect, "src", 1, vel[vR].tex);
    gl!.uniform1f(gl!.getUniformLocation(pAdvect, "dt"), h);
    gl!.uniform1f(gl!.getUniformLocation(pAdvect, "diss"), 0.994);
    draw(vel[1 - vR], SIM, SIM);
    vR = 1 - vR;

    // curl
    gl!.useProgram(pCurl);
    bindTex(pCurl, "vel", 0, vel[vR].tex);
    draw(curlFbo, SIM, SIM);

    // vorticity confinement
    gl!.useProgram(pVort);
    bindTex(pVort, "vel", 0, vel[vR].tex);
    bindTex(pVort, "curl", 1, curlFbo.tex);
    gl!.uniform1f(gl!.getUniformLocation(pVort, "strength"), h * 22);
    draw(vel[1 - vR], SIM, SIM);
    vR = 1 - vR;

    // divergence
    gl!.useProgram(pDiv);
    bindTex(pDiv, "vel", 0, vel[vR].tex);
    draw(divFbo, SIM, SIM);

    // clear pressure
    gl!.bindFramebuffer(gl!.FRAMEBUFFER, pres[pR].fbo);
    gl!.viewport(0, 0, SIM, SIM);
    gl!.clearColor(0, 0, 0, 1);
    gl!.clear(gl!.COLOR_BUFFER_BIT);

    // jacobi
    gl!.useProgram(pPres);
    for (let i = 0; i < JACOBI; i++) {
      bindTex(pPres, "pres", 0, pres[pR].tex);
      bindTex(pPres, "divTex", 1, divFbo.tex);
      draw(pres[1 - pR], SIM, SIM);
      pR = 1 - pR;
    }

    // gradient subtract
    gl!.useProgram(pGrad);
    bindTex(pGrad, "pres", 0, pres[pR].tex);
    bindTex(pGrad, "vel", 1, vel[vR].tex);
    draw(vel[1 - vR], SIM, SIM);
    vR = 1 - vR;

    // advect dye
    gl!.useProgram(pAdvect);
    bindTex(pAdvect, "vel", 0, vel[vR].tex);
    bindTex(pAdvect, "src", 1, dye[dR].tex);
    gl!.uniform1f(gl!.getUniformLocation(pAdvect, "dt"), h);
    gl!.uniform1f(gl!.getUniformLocation(pAdvect, "diss"), 0.985);
    draw(dye[1 - dR], SIM, SIM);
    dR = 1 - dR;

    // display
    gl!.useProgram(pDisplay);
    bindTex(pDisplay, "dye", 0, dye[dR].tex);
    draw(null, canvas.width, canvas.height);
  }

  return {
    kind: "webgl2",
    splat: doSplat,
    frame,
    destroy(): void {
      if (dead) return;
      dead = true;
      for (const f of [...vel, ...pres, ...dye, divFbo, curlFbo]) {
        gl!.deleteTexture(f.tex);
        gl!.deleteFramebuffer(f.fbo);
      }
      for (const pr of programs) gl!.deleteProgram(pr);
      gl!.deleteVertexArray(vao);
      const lose = gl!.getExtension("WEBGL_lose_context");
      if (lose) lose.loseContext();
    },
  };
}
