// fluid.ts — GPU 2D stable-fluids solver (Jos Stam, "Real-Time Fluid Dynamics
// for Games", GDC 2003) implemented with WebGL2 ping-pong float render targets.
//
// Pipeline per frame:
//   1. advect velocity (semi-Lagrangian)
//   2. inject breath force (Gaussian upward gust at bottom-center) + reed deflection
//   3. vorticity confinement (re-inject swirl lost to dissipation)
//   4. Jacobi pressure projection (divergence-free) — a few iterations
//   5. advect dye, dissipate
//   6. compute curl for the visual
//
// Everything runs on the GPU. The only CPU readback is a tiny probe region near
// each reed (see probeReeds) — never the full grid.

export type Reed = {
  x: number; // 0..1 grid space
  y: number; // 0..1 grid space
  d: number; // diameter in grid-fraction (sets aeolian pitch via St·U/d)
};

export type FluidProbe = {
  speed: number; // |velocity| sampled near the reed (m/s-ish, sim units)
  vort: number; // |curl| sampled near the reed
};

type GLAny = WebGL2RenderingContext;

// ── shader sources ────────────────────────────────────────────────────────────

const VERT = `#version 300 es
precision highp float;
in vec2 aPos;
out vec2 vUv;
void main(){
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

// advection (semi-Lagrangian) — works for both velocity and dye
const FRAG_ADVECT = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uSource;   // quantity to advect
uniform sampler2D uVelocity; // velocity field
uniform vec2 uTexel;
uniform float uDt;
uniform float uDissipation;
void main(){
  vec2 vel = texture(uVelocity, vUv).xy;
  vec2 coord = vUv - uDt * vel * uTexel;
  vec4 result = texture(uSource, coord);
  outColor = result * uDissipation;
}`;

// curl (z-component of vorticity)
const FRAG_CURL = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uVelocity;
uniform vec2 uTexel;
void main(){
  float l = texture(uVelocity, vUv - vec2(uTexel.x, 0.0)).y;
  float r = texture(uVelocity, vUv + vec2(uTexel.x, 0.0)).y;
  float b = texture(uVelocity, vUv - vec2(0.0, uTexel.y)).x;
  float t = texture(uVelocity, vUv + vec2(0.0, uTexel.y)).x;
  float curl = (r - l) - (t - b);
  outColor = vec4(0.5 * curl, 0.0, 0.0, 1.0);
}`;

// vorticity confinement — push velocity toward swirl centers
const FRAG_VORTICITY = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uVelocity;
uniform sampler2D uCurl;
uniform vec2 uTexel;
uniform float uDt;
uniform float uCurlStrength;
void main(){
  float l = texture(uCurl, vUv - vec2(uTexel.x, 0.0)).x;
  float r = texture(uCurl, vUv + vec2(uTexel.x, 0.0)).x;
  float b = texture(uCurl, vUv - vec2(0.0, uTexel.y)).x;
  float t = texture(uCurl, vUv + vec2(0.0, uTexel.y)).x;
  float c = texture(uCurl, vUv).x;
  vec2 grad = vec2(abs(t) - abs(b), abs(r) - abs(l)) * 0.5;
  float len = max(length(grad), 1e-5);
  vec2 N = grad / len;
  vec2 force = uCurlStrength * c * vec2(N.y, -N.x);
  vec2 vel = texture(uVelocity, vUv).xy;
  vel += force * uDt;
  outColor = vec4(vel, 0.0, 1.0);
}`;

// divergence of velocity
const FRAG_DIVERGENCE = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uVelocity;
uniform vec2 uTexel;
void main(){
  float l = texture(uVelocity, vUv - vec2(uTexel.x, 0.0)).x;
  float r = texture(uVelocity, vUv + vec2(uTexel.x, 0.0)).x;
  float b = texture(uVelocity, vUv - vec2(0.0, uTexel.y)).y;
  float t = texture(uVelocity, vUv + vec2(0.0, uTexel.y)).y;
  float div = 0.5 * ((r - l) + (t - b));
  outColor = vec4(div, 0.0, 0.0, 1.0);
}`;

// Jacobi pressure iteration
const FRAG_PRESSURE = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uPressure;
uniform sampler2D uDivergence;
uniform vec2 uTexel;
void main(){
  float l = texture(uPressure, vUv - vec2(uTexel.x, 0.0)).x;
  float r = texture(uPressure, vUv + vec2(uTexel.x, 0.0)).x;
  float b = texture(uPressure, vUv - vec2(0.0, uTexel.y)).x;
  float t = texture(uPressure, vUv + vec2(0.0, uTexel.y)).x;
  float div = texture(uDivergence, vUv).x;
  float p = (l + r + b + t - div) * 0.25;
  outColor = vec4(p, 0.0, 0.0, 1.0);
}`;

// subtract pressure gradient — projection
const FRAG_GRADIENT = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uPressure;
uniform sampler2D uVelocity;
uniform vec2 uTexel;
void main(){
  float l = texture(uPressure, vUv - vec2(uTexel.x, 0.0)).x;
  float r = texture(uPressure, vUv + vec2(uTexel.x, 0.0)).x;
  float b = texture(uPressure, vUv - vec2(0.0, uTexel.y)).x;
  float t = texture(uPressure, vUv + vec2(0.0, uTexel.y)).x;
  vec2 vel = texture(uVelocity, vUv).xy;
  vel -= 0.5 * vec2(r - l, t - b);
  outColor = vec4(vel, 0.0, 1.0);
}`;

// inject breath gust + reed deflection into velocity field
const FRAG_FORCE = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uVelocity;
uniform vec2 uTexel;
uniform float uDt;
uniform float uBreath;   // 0..1 breath energy
uniform float uTime;
uniform float uJitter;   // turbulent jitter phase
#define NREED 7
uniform vec3 uReeds[NREED]; // xy position, z diameter
uniform int uNumReeds;
void main(){
  vec2 vel = texture(uVelocity, vUv).xy;

  // breath gust: Gaussian column at bottom-center, blowing up
  vec2 src = vec2(0.5, 0.06);
  float dx = (vUv.x - src.x);
  float dy = (vUv.y - src.y);
  float gx = exp(-dx*dx / 0.004);
  float gy = exp(-dy*dy / 0.01);
  float gust = uBreath * gx * gy;
  // turbulent curl so the column doesn't rise straight
  float swirl = sin(vUv.y * 30.0 + uTime * 2.0 + uJitter) * 0.6
              + sin(vUv.x * 18.0 - uTime * 1.3) * 0.4;
  vel.y += gust * (3.2 + 0.4 * uBreath) * uDt * 60.0;
  vel.x += gust * swirl * (0.9 + uBreath) * uDt * 60.0;

  // reeds deflect local flow (thin obstacles): damp velocity near each reed
  // and bend it around, which seeds vortex shedding downstream.
  for (int i = 0; i < NREED; i++){
    if (i >= uNumReeds) break;
    vec2 rp = uReeds[i].xy;
    float rd = uReeds[i].z;
    vec2 rel = vUv - rp;
    float dist = length(rel / vec2(rd, rd * 2.5));
    if (dist < 1.0){
      float k = 1.0 - dist;
      // damp normal flow, add transverse bend → shedding
      vec2 bend = vec2(sign(rel.x + 1e-4), 0.0)
                * (0.6 + 0.4 * sin(uTime * 6.0 + float(i)));
      vel = mix(vel, bend * length(vel) * 0.8, k * 0.7);
    }
  }
  outColor = vec4(vel, 0.0, 1.0);
}`;

// inject dye (warm vapor) at the breath source
const FRAG_DYE = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uDye;
uniform float uBreath;
uniform float uTime;
void main(){
  vec3 dye = texture(uDye, vUv).rgb;
  vec2 src = vec2(0.5, 0.05);
  float dx = (vUv.x - src.x);
  float dy = (vUv.y - src.y);
  float g = exp(-dx*dx/0.003) * exp(-dy*dy/0.006);
  // warm amber injected at the core
  vec3 warm = vec3(1.0, 0.62, 0.28);
  dye += warm * g * uBreath * 0.9;
  outColor = vec4(dye, 1.0);
}`;

// final display: dye colored by height (amber core → violet edge) + curl glow
const FRAG_DISPLAY = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uDye;
uniform sampler2D uCurl;
void main(){
  vec3 dye = texture(uDye, vUv).rgb;
  float density = max(max(dye.r, dye.g), dye.b);
  float curl = abs(texture(uCurl, vUv).x);

  // palette: warm amber at low/dense → cool violet at edges
  vec3 amber  = vec3(1.0, 0.66, 0.30);
  vec3 violet = vec3(0.55, 0.40, 0.85);
  vec3 col = mix(violet, amber, clamp(density * 1.6, 0.0, 1.0));
  col *= density;
  // curl adds luminous filaments
  col += violet * curl * 1.4;

  // soft vignette toward charcoal
  vec2 c = vUv - 0.5;
  float vig = 1.0 - dot(c, c) * 0.8;
  col *= vig;

  outColor = vec4(col, 1.0);
}`;

// ── small GL helpers ───────────────────────────────────────────────────────────

function compile(gl: GLAny, type: number, src: string): WebGLShader {
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

function makeProgram(gl: GLAny, frag: string): WebGLProgram {
  const p = gl.createProgram()!;
  const vs = compile(gl, gl.VERTEX_SHADER, VERT);
  const fs = compile(gl, gl.FRAGMENT_SHADER, frag);
  gl.attachShader(p, vs);
  gl.attachShader(p, fs);
  gl.bindAttribLocation(p, 0, "aPos");
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    throw new Error("link failed: " + gl.getProgramInfoLog(p));
  }
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  return p;
}

type FBO = { tex: WebGLTexture; fbo: WebGLFramebuffer };

function makeFBO(gl: GLAny, w: number, h: number, internal: number, format: number, type: number): FBO {
  const tex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, format, type, null);
  const fbo = gl.createFramebuffer()!;
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  return { tex, fbo };
}

type DoubleFBO = { read: FBO; write: FBO; swap: () => void };

function makeDoubleFBO(gl: GLAny, w: number, h: number, internal: number, format: number, type: number): DoubleFBO {
  const obj: DoubleFBO = {
    read: makeFBO(gl, w, h, internal, format, type),
    write: makeFBO(gl, w, h, internal, format, type),
    swap() {
      const t = this.read;
      this.read = this.write;
      this.write = t;
    },
  };
  return obj;
}

// ── the solver ─────────────────────────────────────────────────────────────────

export type FluidSim = {
  step: (dt: number, breath: number, reeds: Reed[]) => void;
  render: () => void;
  probeReeds: (reeds: Reed[]) => FluidProbe[];
  kineticEnergy: () => number;
  dispose: () => void;
  resolution: number;
  halfFloat: boolean;
};

/**
 * Create the fluid simulation bound to an existing WebGL2 context + canvas.
 * Returns null only if context creation upstream failed (caller checks gl first).
 */
export function makeFluidSim(gl: GLAny): FluidSim {
  // feature-detect float-color renderability
  const extLin = gl.getExtension("OES_texture_float_linear");
  const extCBF = gl.getExtension("EXT_color_buffer_float");
  const canFullFloat = !!extCBF;
  // half-float color buffer is core in WebGL2 (RGBA16F is color-renderable)
  const halfFloat = !canFullFloat;
  const internal = canFullFloat ? gl.RGBA32F : gl.RGBA16F;
  const type = canFullFloat ? gl.FLOAT : gl.HALF_FLOAT;
  // if linear filter on float isn't supported, textures still work (LINEAR may
  // silently fall back to NEAREST on some drivers — acceptable for the demo).
  void extLin;

  const SIM = canFullFloat ? 256 : 128;
  const w = SIM;
  const h = SIM;
  const texel: [number, number] = [1 / w, 1 / h];

  // geometry: fullscreen triangle pair
  const vao = gl.createVertexArray()!;
  gl.bindVertexArray(vao);
  const buf = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 3, -1, -1, 3]),
    gl.STATIC_DRAW
  );
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  // programs
  const pAdvect = makeProgram(gl, FRAG_ADVECT);
  const pCurl = makeProgram(gl, FRAG_CURL);
  const pVort = makeProgram(gl, FRAG_VORTICITY);
  const pDiv = makeProgram(gl, FRAG_DIVERGENCE);
  const pPress = makeProgram(gl, FRAG_PRESSURE);
  const pGrad = makeProgram(gl, FRAG_GRADIENT);
  const pForce = makeProgram(gl, FRAG_FORCE);
  const pDye = makeProgram(gl, FRAG_DYE);
  const pDisplay = makeProgram(gl, FRAG_DISPLAY);

  // buffers
  const velocity = makeDoubleFBO(gl, w, h, internal, gl.RGBA, type);
  const dye = makeDoubleFBO(gl, w, h, internal, gl.RGBA, type);
  const pressure = makeDoubleFBO(gl, w, h, internal, gl.RGBA, type);
  const divergence = makeFBO(gl, w, h, internal, gl.RGBA, type);
  const curl = makeFBO(gl, w, h, internal, gl.RGBA, type);

  let time = 0;

  function blit(target: WebGLFramebuffer | null) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, target);
    gl.viewport(0, 0, w, h);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  function bindTex(prog: WebGLProgram, name: string, tex: WebGLTexture, unit: number) {
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.uniform1i(gl.getUniformLocation(prog, name), unit);
  }

  function step(dt: number, breath: number, reeds: Reed[]) {
    time += dt;
    gl.bindVertexArray(vao);
    gl.disable(gl.BLEND);

    // 1. advect velocity
    gl.useProgram(pAdvect);
    gl.uniform2f(gl.getUniformLocation(pAdvect, "uTexel"), texel[0], texel[1]);
    gl.uniform1f(gl.getUniformLocation(pAdvect, "uDt"), dt);
    gl.uniform1f(gl.getUniformLocation(pAdvect, "uDissipation"), 0.992);
    bindTex(pAdvect, "uVelocity", velocity.read.tex, 0);
    bindTex(pAdvect, "uSource", velocity.read.tex, 1);
    blit(velocity.write.fbo);
    velocity.swap();

    // 2. inject breath force + reed deflection
    gl.useProgram(pForce);
    gl.uniform2f(gl.getUniformLocation(pForce, "uTexel"), texel[0], texel[1]);
    gl.uniform1f(gl.getUniformLocation(pForce, "uDt"), dt);
    gl.uniform1f(gl.getUniformLocation(pForce, "uBreath"), breath);
    gl.uniform1f(gl.getUniformLocation(pForce, "uTime"), time);
    gl.uniform1f(gl.getUniformLocation(pForce, "uJitter"), Math.sin(time * 0.7) * 3.0);
    const flat = new Float32Array(7 * 3);
    for (let i = 0; i < Math.min(reeds.length, 7); i++) {
      flat[i * 3] = reeds[i].x;
      flat[i * 3 + 1] = reeds[i].y;
      flat[i * 3 + 2] = reeds[i].d;
    }
    gl.uniform3fv(gl.getUniformLocation(pForce, "uReeds"), flat);
    gl.uniform1i(gl.getUniformLocation(pForce, "uNumReeds"), Math.min(reeds.length, 7));
    bindTex(pForce, "uVelocity", velocity.read.tex, 0);
    blit(velocity.write.fbo);
    velocity.swap();

    // 3. curl + vorticity confinement
    gl.useProgram(pCurl);
    gl.uniform2f(gl.getUniformLocation(pCurl, "uTexel"), texel[0], texel[1]);
    bindTex(pCurl, "uVelocity", velocity.read.tex, 0);
    blit(curl.fbo);

    gl.useProgram(pVort);
    gl.uniform2f(gl.getUniformLocation(pVort, "uTexel"), texel[0], texel[1]);
    gl.uniform1f(gl.getUniformLocation(pVort, "uDt"), dt);
    gl.uniform1f(gl.getUniformLocation(pVort, "uCurlStrength"), 14.0);
    bindTex(pVort, "uVelocity", velocity.read.tex, 0);
    bindTex(pVort, "uCurl", curl.tex, 1);
    blit(velocity.write.fbo);
    velocity.swap();

    // 4. divergence + Jacobi pressure projection
    gl.useProgram(pDiv);
    gl.uniform2f(gl.getUniformLocation(pDiv, "uTexel"), texel[0], texel[1]);
    bindTex(pDiv, "uVelocity", velocity.read.tex, 0);
    blit(divergence.fbo);

    // clear pressure
    gl.bindFramebuffer(gl.FRAMEBUFFER, pressure.read.fbo);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.useProgram(pPress);
    gl.uniform2f(gl.getUniformLocation(pPress, "uTexel"), texel[0], texel[1]);
    bindTex(pPress, "uDivergence", divergence.tex, 1);
    for (let i = 0; i < 24; i++) {
      bindTex(pPress, "uPressure", pressure.read.tex, 0);
      blit(pressure.write.fbo);
      pressure.swap();
    }

    gl.useProgram(pGrad);
    gl.uniform2f(gl.getUniformLocation(pGrad, "uTexel"), texel[0], texel[1]);
    bindTex(pGrad, "uPressure", pressure.read.tex, 0);
    bindTex(pGrad, "uVelocity", velocity.read.tex, 1);
    blit(velocity.write.fbo);
    velocity.swap();

    // 5. advect dye + inject + dissipate
    gl.useProgram(pAdvect);
    gl.uniform1f(gl.getUniformLocation(pAdvect, "uDissipation"), 0.990);
    bindTex(pAdvect, "uVelocity", velocity.read.tex, 0);
    bindTex(pAdvect, "uSource", dye.read.tex, 1);
    blit(dye.write.fbo);
    dye.swap();

    gl.useProgram(pDye);
    gl.uniform1f(gl.getUniformLocation(pDye, "uBreath"), breath);
    gl.uniform1f(gl.getUniformLocation(pDye, "uTime"), time);
    bindTex(pDye, "uDye", dye.read.tex, 0);
    blit(dye.write.fbo);
    dye.swap();

    // recompute curl for the visual (post-projection)
    gl.useProgram(pCurl);
    bindTex(pCurl, "uVelocity", velocity.read.tex, 0);
    blit(curl.fbo);
  }

  function render() {
    gl.bindVertexArray(vao);
    gl.useProgram(pDisplay);
    bindTex(pDisplay, "uDye", dye.read.tex, 0);
    bindTex(pDisplay, "uCurl", curl.tex, 1);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.disable(gl.BLEND);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  // tiny CPU readback: a small probe block per reed (NOT the full grid).
  const PROBE = 5; // px square
  const probeBuf = new Float32Array(PROBE * PROBE * 4);
  const halfBuf = new Uint16Array(PROBE * PROBE * 4);

  // half-float (IEEE 754 binary16) → JS number, for the 16F fallback readback.
  function halfToFloat(h: number): number {
    const s = (h & 0x8000) >> 15;
    const e = (h & 0x7c00) >> 10;
    const f = h & 0x03ff;
    let val: number;
    if (e === 0) val = (f / 1024) * Math.pow(2, -14);
    else if (e === 0x1f) val = f ? NaN : Infinity;
    else val = (1 + f / 1024) * Math.pow(2, e - 15);
    return s ? -val : val;
  }

  // Determine the implementation's preferred read type for our float FBOs once.
  // RGBA32F → FLOAT; RGBA16F → typically HALF_FLOAT (read as Uint16, convert).
  gl.bindFramebuffer(gl.FRAMEBUFFER, curl.fbo);
  const readType = gl.getParameter(gl.IMPLEMENTATION_COLOR_READ_TYPE) as number;
  const useHalf = readType === gl.HALF_FLOAT;

  function readBlock(fbo: WebGLFramebuffer, px: number, py: number): Float32Array {
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    const x = Math.max(0, Math.min(w - PROBE, Math.round(px * w) - 2));
    const y = Math.max(0, Math.min(h - PROBE, Math.round(py * h) - 2));
    if (useHalf) {
      gl.readPixels(x, y, PROBE, PROBE, gl.RGBA, gl.HALF_FLOAT, halfBuf);
      for (let i = 0; i < probeBuf.length; i++) probeBuf[i] = halfToFloat(halfBuf[i]);
    } else {
      gl.readPixels(x, y, PROBE, PROBE, gl.RGBA, gl.FLOAT, probeBuf);
    }
    return probeBuf;
  }

  function probeReeds(reeds: Reed[]): FluidProbe[] {
    const out: FluidProbe[] = [];
    for (const reed of reeds) {
      // sample just downstream of the reed (where shedding lives)
      const vy = Math.min(0.98, reed.y + reed.d * 1.5);
      const v = readBlock(velocity.read.fbo, reed.x, vy);
      let sx = 0, sy = 0;
      for (let i = 0; i < PROBE * PROBE; i++) {
        sx += v[i * 4];
        sy += v[i * 4 + 1];
      }
      const n = PROBE * PROBE;
      const speed = Math.hypot(sx / n, sy / n);
      const c = readBlock(curl.fbo, reed.x, vy);
      let sc = 0;
      for (let i = 0; i < PROBE * PROBE; i++) sc += Math.abs(c[i * 4]);
      out.push({ speed, vort: sc / n });
    }
    return out;
  }

  // total field kinetic energy from a single coarse central probe (cheap proxy)
  function kineticEnergy(): number {
    const v = readBlock(velocity.read.fbo, 0.5, 0.5);
    let e = 0;
    for (let i = 0; i < PROBE * PROBE; i++) {
      e += v[i * 4] * v[i * 4] + v[i * 4 + 1] * v[i * 4 + 1];
    }
    return e / (PROBE * PROBE);
  }

  function dispose() {
    const progs = [pAdvect, pCurl, pVort, pDiv, pPress, pGrad, pForce, pDye, pDisplay];
    for (const p of progs) gl.deleteProgram(p);
    const fbos = [velocity.read, velocity.write, dye.read, dye.write, pressure.read, pressure.write, divergence, curl];
    for (const f of fbos) {
      gl.deleteTexture(f.tex);
      gl.deleteFramebuffer(f.fbo);
    }
    gl.deleteBuffer(buf);
    gl.deleteVertexArray(vao);
  }

  return { step, render, probeReeds, kineticEnergy, dispose, resolution: SIM, halfFloat };
}
