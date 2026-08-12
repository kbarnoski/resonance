// ─────────────────────────────────────────────────────────────────────────────
// WebGL2 fragment-shader ping-pong backend — the solid fallback.
//
// A true 2D Boussinesq Rayleigh–Bénard layer run entirely on the GPU as a stack
// of full-screen fragment passes over R32F float textures:
//   1. advect + diffuse temperature (semi-Lagrangian), reset hot/cold boundary
//   2. advect + diffuse vorticity, add buoyancy source from ∇T
//   3. N Jacobi iterations solving ∇²ψ = −ω
//   4. render the molten field to the canvas
//   5. (every other frame) a tiny coarse probe pass read back for audio
//
// Velocity is never stored: it is reconstructed on the fly from ψ (u=∂ψ/∂y,
// v=−∂ψ/∂x) so the flow is divergence-free. Horizontal edges wrap (cells drift
// laterally under tilt); top/bottom are free-slip walls (ψ=0, ω=0). Manual
// bilinear sampling via texelFetch avoids depending on float linear-filtering.
// ─────────────────────────────────────────────────────────────────────────────

import {
  SIM_W,
  SIM_H,
  POISSON_ITERS,
  PROBE_COLS,
  PROBE_ROWS,
  type Backend,
  type ProbeGrid,
  type SimStep,
} from "./sim";

const VS = `#version 300 es
in vec2 a_pos;
void main(){ gl_Position = vec4(a_pos, 0.0, 1.0); }`;

// Shared GLSL prelude: wrapped/clamped texel fetch, manual bilinear, velocity
// reconstruction from the streamfunction.
const PRELUDE = `#version 300 es
precision highp float;
uniform ivec2 uDim;
float texR(sampler2D s, int x, int y){
  x = (x % uDim.x + uDim.x) % uDim.x;          // horizontal wrap
  y = clamp(y, 0, uDim.y - 1);                  // vertical clamp
  return texelFetch(s, ivec2(x, y), 0).r;
}
float samp(sampler2D s, vec2 p){
  vec2 fp = floor(p); ivec2 i = ivec2(fp); vec2 f = p - fp;
  float a = texR(s, i.x,   i.y);
  float b = texR(s, i.x+1, i.y);
  float c = texR(s, i.x,   i.y+1);
  float d = texR(s, i.x+1, i.y+1);
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
vec2 velAt(sampler2D psi, int x, int y){
  float u =  (texR(psi, x,   y+1) - texR(psi, x,   y-1)) * 0.5;
  float v = -(texR(psi, x+1, y  ) - texR(psi, x-1, y  )) * 0.5;
  return vec2(u, v);
}`;

const ADVECT_T_FS =
  PRELUDE +
  `
out float o;
uniform sampler2D uT, uPsi;
uniform float uDt, uKappa;
void main(){
  ivec2 c = ivec2(gl_FragCoord.xy);
  int x = c.x, y = c.y;
  vec2 vel = velAt(uPsi, x, y);
  float sp = length(vel); if (sp > 4.0) vel *= 4.0 / sp;      // CFL guard
  vec2 bp = vec2(float(x), float(y)) - uDt * vel;
  float t = samp(uT, bp);
  float lap = texR(uT,x+1,y)+texR(uT,x-1,y)+texR(uT,x,y+1)+texR(uT,x,y-1) - 4.0*texR(uT,x,y);
  t += uKappa * lap;
  if (y == 0)          t = 1.0;                                // hot plate
  if (y == uDim.y - 1) t = 0.0;                                // cold lid
  o = clamp(t, 0.0, 1.0);
}`;

const ADVECT_W_FS =
  PRELUDE +
  `
out float o;
uniform sampler2D uW, uPsi, uT;
uniform float uDt, uNu, uBuoy, uDamp;
uniform vec2 uGrav;
void main(){
  ivec2 c = ivec2(gl_FragCoord.xy);
  int x = c.x, y = c.y;
  vec2 vel = velAt(uPsi, x, y);
  float sp = length(vel); if (sp > 4.0) vel *= 4.0 / sp;
  vec2 bp = vec2(float(x), float(y)) - uDt * vel;
  float w = samp(uW, bp);
  float lap = texR(uW,x+1,y)+texR(uW,x-1,y)+texR(uW,x,y+1)+texR(uW,x,y-1) - 4.0*texR(uW,x,y);
  w += uNu * lap;
  // Baroclinic buoyancy source: β (g × ∇T)_z = β (gx·∂T/∂y − gy·∂T/∂x).
  float dTdx = (texR(uT,x+1,y) - texR(uT,x-1,y)) * 0.5;
  float dTdy = (texR(uT,x,y+1) - texR(uT,x,y-1)) * 0.5;
  w += uDt * uBuoy * (uGrav.x * dTdy - uGrav.y * dTdx);
  w *= uDamp;
  if (y == 0 || y == uDim.y - 1) w = 0.0;                      // free-slip walls
  o = clamp(w, -6.0, 6.0);
}`;

const POISSON_FS =
  PRELUDE +
  `
out float o;
uniform sampler2D uPsi, uW;
void main(){
  ivec2 c = ivec2(gl_FragCoord.xy);
  int x = c.x, y = c.y;
  float p = 0.25 * (texR(uPsi,x+1,y)+texR(uPsi,x-1,y)+texR(uPsi,x,y+1)+texR(uPsi,x,y-1) + texR(uW,x,y));
  if (y == 0 || y == uDim.y - 1) p = 0.0;                      // no-penetration
  o = p;
}`;

const RENDER_FS =
  PRELUDE +
  `
out vec4 o;
uniform sampler2D uT, uPsi;
uniform vec2 uRes;
// Warm molten ramp: basalt → oxblood → copper → amber → gold → white-hot.
vec3 molten(float t){
  vec3 basalt = vec3(0.030, 0.016, 0.020);
  vec3 oxblood= vec3(0.230, 0.045, 0.035);
  vec3 copper = vec3(0.560, 0.170, 0.055);
  vec3 amber  = vec3(0.870, 0.410, 0.080);
  vec3 gold   = vec3(0.980, 0.760, 0.260);
  vec3 white  = vec3(1.000, 0.960, 0.860);
  t = clamp(t, 0.0, 1.0);
  if (t < 0.20) return mix(basalt,  oxblood, t / 0.20);
  if (t < 0.42) return mix(oxblood, copper,  (t - 0.20) / 0.22);
  if (t < 0.64) return mix(copper,  amber,   (t - 0.42) / 0.22);
  if (t < 0.84) return mix(amber,   gold,    (t - 0.64) / 0.20);
  return              mix(gold,    white,   (t - 0.84) / 0.16);
}
void main(){
  vec2 uv = gl_FragCoord.xy / uRes;
  vec2 p  = vec2(uv.x * float(uDim.x), uv.y * float(uDim.y));
  float t = samp(uT, p);
  int x = int(p.x), y = int(p.y);
  vec2 vel = velAt(uPsi, x, y);
  float dTdx = (texR(uT,x+1,y) - texR(uT,x-1,y)) * 0.5;
  float dTdy = (texR(uT,x,y+1) - texR(uT,x,y-1)) * 0.5;
  vec3 col = molten(t);
  // Reconstruct a little shading from the temperature gradient — reads as a
  // real 3D-ish molten surface rather than a flat heatmap.
  vec3 n = normalize(vec3(-dTdx * 3.5, -dTdy * 3.5, 1.0));
  float lamb = clamp(dot(n, normalize(vec3(-0.35, 0.45, 0.82))), 0.0, 1.0);
  col *= 0.70 + 0.55 * lamb;
  // Legible cell structure: bright rising plumes, dark sinking lanes.
  col *= 1.0 + 0.60 * clamp(vel.y, 0.0, 1.2) * (0.3 + 0.7 * t);
  col *= 1.0 - 0.40 * clamp(-vel.y, 0.0, 1.2);
  // Thin cool rim where up- and down-welling converge (cell boundaries).
  float shear = clamp((abs(dTdx) + abs(dTdy)) * 2.4, 0.0, 1.0);
  col = mix(col, vec3(0.10, 0.02, 0.02), 0.30 * shear * (1.0 - t));
  vec2 d = uv - 0.5; col *= 1.0 - 0.45 * dot(d, d);
  o = vec4(col, 1.0);
}`;

const PROBE_FS =
  PRELUDE +
  `
out vec4 o;
uniform sampler2D uT, uPsi;
uniform ivec2 uProbe;
void main(){
  ivec2 pc = ivec2(gl_FragCoord.xy);
  int fx = (pc.x * uDim.x) / uProbe.x + uDim.x / (2 * uProbe.x);
  int fy = (pc.y * uDim.y) / uProbe.y + uDim.y / (2 * uProbe.y);
  float t = texR(uT, fx, fy);
  vec2 vel = velAt(uPsi, fx, fy);
  float speed = length(vel);
  // Pack: r=T, g=vertical vel (biased), b=speed. RGBA8 → readPixels-safe.
  o = vec4(t, 0.5 + 0.45 * clamp(vel.y * 1.5, -1.0, 1.0), clamp(speed * 0.5, 0.0, 1.0), 1.0);
}`;

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error("shader compile: " + log);
  }
  return sh;
}

function link(gl: WebGL2RenderingContext, fsSrc: string): WebGLProgram {
  const vs = compile(gl, gl.VERTEX_SHADER, VS);
  const fs = compile(gl, gl.FRAGMENT_SHADER, fsSrc);
  const p = gl.createProgram()!;
  gl.attachShader(p, vs);
  gl.attachShader(p, fs);
  gl.bindAttribLocation(p, 0, "a_pos"); // pin to slot 0 for the shared VAO
  gl.linkProgram(p);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(p);
    gl.deleteProgram(p);
    throw new Error("program link: " + log);
  }
  return p;
}

interface FieldTex {
  tex: WebGLTexture;
  fbo: WebGLFramebuffer;
}

export function makeWebglBackend(
  canvas: HTMLCanvasElement,
  rng: () => number,
): Backend {
  const glMaybe = canvas.getContext("webgl2", {
    alpha: false,
    antialias: false,
    depth: false,
    premultipliedAlpha: false,
    preserveDrawingBuffer: false,
  });
  if (!glMaybe) throw new Error("no WebGL2 context");
  const gl: WebGL2RenderingContext = glMaybe;

  if (!gl.getExtension("EXT_color_buffer_float")) {
    throw new Error("EXT_color_buffer_float unavailable");
  }

  const W = SIM_W;
  const H = SIM_H;

  function makeFloatTex(seed?: Float32Array): FieldTex {
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.R32F,
      W,
      H,
      0,
      gl.RED,
      gl.FLOAT,
      seed ?? null,
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fbo = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    return { tex, fbo };
  }

  // Seed temperature: linear hot→cold gradient plus a small seeded perturbation
  // so the layer is unstable and cells break symmetry within ~1s.
  const tSeed = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    const base = 1.0 - y / (H - 1);
    for (let x = 0; x < W; x++) {
      const noise = (rng() - 0.5) * 0.28 * Math.sin((x / W) * Math.PI);
      tSeed[y * W + x] = Math.min(1, Math.max(0, base + noise));
    }
  }

  const T: [FieldTex, FieldTex] = [makeFloatTex(tSeed), makeFloatTex()];
  const Wv: [FieldTex, FieldTex] = [makeFloatTex(), makeFloatTex()];
  const P: [FieldTex, FieldTex] = [makeFloatTex(), makeFloatTex()];
  let ti = 0, wi = 0, pi = 0;

  // Probe target (RGBA8 — readPixels UNSIGNED_BYTE is universally supported).
  const probeTex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, probeTex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, PROBE_COLS, PROBE_ROWS, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const probeFbo = gl.createFramebuffer()!;
  gl.bindFramebuffer(gl.FRAMEBUFFER, probeFbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, probeTex, 0);

  // Full-screen triangle.
  const vao = gl.createVertexArray()!;
  gl.bindVertexArray(vao);
  const quad = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);

  const progAdvT = link(gl, ADVECT_T_FS);
  const progAdvW = link(gl, ADVECT_W_FS);
  const progPois = link(gl, POISSON_FS);
  const progRend = link(gl, RENDER_FS);
  const progProbe = link(gl, PROBE_FS);

  // a_pos is pinned to slot 0 in every program; wire it once on the shared VAO.
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  const u = (p: WebGLProgram, n: string) => gl.getUniformLocation(p, n);

  gl.disable(gl.DEPTH_TEST);
  gl.disable(gl.BLEND);

  const probePixels = new Uint8Array(PROBE_COLS * PROBE_ROWS * 4);
  const probeData = new Float32Array(PROBE_COLS * PROBE_ROWS * 3);
  let haveProbe = false;
  let frame = 0;

  function drawInto(fbo: WebGLFramebuffer | null, w: number, h: number) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.viewport(0, 0, w, h);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  function step(s: SimStep) {
    frame += 1;
    gl.bindVertexArray(vao);

    // 1. Temperature: advect + diffuse + boundary.
    gl.useProgram(progAdvT);
    gl.uniform2i(u(progAdvT, "uDim"), W, H);
    gl.uniform1f(u(progAdvT, "uDt"), s.dt);
    gl.uniform1f(u(progAdvT, "uKappa"), 0.11);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, T[ti].tex);
    gl.uniform1i(u(progAdvT, "uT"), 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, P[pi].tex);
    gl.uniform1i(u(progAdvT, "uPsi"), 1);
    drawInto(T[ti ^ 1].fbo, W, H);
    ti ^= 1;

    // 2. Vorticity: advect + diffuse + buoyancy.
    gl.useProgram(progAdvW);
    gl.uniform2i(u(progAdvW, "uDim"), W, H);
    gl.uniform1f(u(progAdvW, "uDt"), s.dt);
    gl.uniform1f(u(progAdvW, "uNu"), 0.13);
    gl.uniform1f(u(progAdvW, "uBuoy"), s.buoy);
    gl.uniform1f(u(progAdvW, "uDamp"), 0.9985);
    gl.uniform2f(u(progAdvW, "uGrav"), s.gx, s.gy);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, Wv[wi].tex);
    gl.uniform1i(u(progAdvW, "uW"), 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, P[pi].tex);
    gl.uniform1i(u(progAdvW, "uPsi"), 1);
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, T[ti].tex);
    gl.uniform1i(u(progAdvW, "uT"), 2);
    drawInto(Wv[wi ^ 1].fbo, W, H);
    wi ^= 1;

    // 3. Poisson solve ∇²ψ = −ω (Jacobi ping-pong).
    gl.useProgram(progPois);
    gl.uniform2i(u(progPois, "uDim"), W, H);
    gl.uniform1i(u(progPois, "uW"), 1);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, Wv[wi].tex);
    for (let k = 0; k < POISSON_ITERS; k++) {
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, P[pi].tex);
      gl.uniform1i(u(progPois, "uPsi"), 0);
      drawInto(P[pi ^ 1].fbo, W, H);
      pi ^= 1;
    }

    // 4. Render molten field to the canvas.
    gl.useProgram(progRend);
    gl.uniform2i(u(progRend, "uDim"), W, H);
    gl.uniform2f(u(progRend, "uRes"), canvas.width, canvas.height);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, T[ti].tex);
    gl.uniform1i(u(progRend, "uT"), 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, P[pi].tex);
    gl.uniform1i(u(progRend, "uPsi"), 1);
    drawInto(null, canvas.width, canvas.height);

    // 5. Coarse probe for audio, every other frame (limits GPU sync stalls).
    if (frame % 2 === 0) {
      gl.useProgram(progProbe);
      gl.uniform2i(u(progProbe, "uDim"), W, H);
      gl.uniform2i(u(progProbe, "uProbe"), PROBE_COLS, PROBE_ROWS);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, T[ti].tex);
      gl.uniform1i(u(progProbe, "uT"), 0);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, P[pi].tex);
      gl.uniform1i(u(progProbe, "uPsi"), 1);
      drawInto(probeFbo, PROBE_COLS, PROBE_ROWS);
      gl.readPixels(0, 0, PROBE_COLS, PROBE_ROWS, gl.RGBA, gl.UNSIGNED_BYTE, probePixels);
      for (let i = 0; i < PROBE_COLS * PROBE_ROWS; i++) {
        const r = probePixels[i * 4] / 255;
        const g = probePixels[i * 4 + 1] / 255;
        const b = probePixels[i * 4 + 2] / 255;
        probeData[i * 3] = r;
        probeData[i * 3 + 1] = (g - 0.5) / 0.45 / 1.5;
        probeData[i * 3 + 2] = b / 0.5;
      }
      haveProbe = true;
    }
  }

  function probe(): ProbeGrid | null {
    if (!haveProbe) return null;
    return { cols: PROBE_COLS, rows: PROBE_ROWS, data: probeData };
  }

  function destroy() {
    for (const f of [...T, ...Wv, ...P]) {
      gl.deleteTexture(f.tex);
      gl.deleteFramebuffer(f.fbo);
    }
    gl.deleteTexture(probeTex);
    gl.deleteFramebuffer(probeFbo);
    gl.deleteBuffer(quad);
    gl.deleteVertexArray(vao);
    gl.deleteProgram(progAdvT);
    gl.deleteProgram(progAdvW);
    gl.deleteProgram(progPois);
    gl.deleteProgram(progRend);
    gl.deleteProgram(progProbe);
    const ext = gl.getExtension("WEBGL_lose_context");
    if (ext) ext.loseContext();
  }

  return { kind: "webgl", step, probe, destroy };
}
