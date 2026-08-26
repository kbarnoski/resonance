// ─────────────────────────────────────────────────────────────────────────────
// 16144-spiralkeep — medium.ts
//
// A GPU EXCITABLE MEDIUM — the Barkley model — not a Gray-Scott reaction. Two
// fields live in a pair of RGBA16F textures ping-ponged through a fragment
// shader:  u = the fast "excitation" (voltage-like), v = the slow "recovery"
// (refractory). Only u diffuses. The kinetics are:
//
//   du/dt = (1/eps) * u * (1-u) * (u - (v+b)/a) + Du * laplacian(u)
//   dv/dt = u - v
//
// This is a genuinely different pattern-forming system from morphonate's
// Gray-Scott: instead of coral / spots it grows ROTATING SPIRAL WAVES, spreading
// target fronts, and defect turbulence — a Belousov-Zhabotinsky-style excitable
// medium. A broken wavefront curls into a spiral; excitation blobs launch new
// target waves and, when the front is broken asymmetrically, new spiral cores.
//
// The engine also SERIALIZES its field (downsampled, byte-packed) and RESTORES
// it, so the medium can resume scrolling across visits — see persist.ts.
//
// The WebGL2 ping-pong scaffolding (compile/link/makeTex/pingPong) follows the
// shape of 16000-morphonate's morphogl.ts, but the kinetics, the injection, the
// serialize/restore path, and the cyan-teal-on-bone display are all new here.
//
// Reference: D. Barkley, "A model for fast computer simulation of waves in
// excitable media", Physica D 49 (1991); the Belousov-Zhabotinsky reaction.
// ─────────────────────────────────────────────────────────────────────────────

/** Simulation grid (square). Fine enough for several spiral arms at 60fps. */
export const SIM_SIZE = 512;
/** Persisted downsample grid — 128×128 (u,v) bytes = 32 KB before base64. */
export const PERSIST_SIZE = 128;

// Fixed integrator constants (a/b/eps are steered per-frame by the harmony).
const DT = 0.02; // forward-Euler timestep
const DCOEF = 0.16; // Du * dt / dx² folded into one texel-space coefficient

const QUAD_VS = `#version 300 es
layout(location = 0) in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

// Seed a broken-wavefront field: tiled step discontinuities in u (along x) and v
// (along y). Where a u-step crosses a v-step a wave TIP is stranded, and it rolls
// up into a rotating spiral. u_tiles crossings ⇒ that many spiral cores.
const SEED_FS = `#version 300 es
precision highp float;
uniform float u_tiles;
uniform float u_seed;
in vec2 v_uv;
out vec4 o;
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(41.3, 289.1)) + u_seed) * 43758.5453);
}
void main() {
  vec2 p = v_uv * u_tiles;
  // small per-tile jitter so the spirals aren't a perfect lattice
  vec2 cell = floor(p);
  float jx = (hash(cell) - 0.5) * 0.5;
  float jy = (hash(cell + 7.0) - 0.5) * 0.5;
  float u = step(0.5 + jx, fract(p.x));
  float v = step(0.5 + jy, fract(p.y)) * 0.5;
  o = vec4(u, v, 0.0, 1.0);
}`;

// Inject a supra-threshold excitation blob (a note/chord onset). Raising u above
// threshold launches a spreading wave; u_break raises v on one side of the blob
// so the launched front is broken and can spin up a fresh spiral core.
const INJECT_FS = `#version 300 es
precision highp float;
uniform sampler2D u_tex;
uniform vec2 u_center;
uniform float u_radius;
uniform float u_amount;
uniform float u_break;
in vec2 v_uv;
out vec4 o;
void main() {
  vec4 c = texture(u_tex, v_uv);
  vec2 d = v_uv - u_center;
  float g = exp(-dot(d, d) / (u_radius * u_radius));
  float u = max(c.r, u_amount * g);
  float side = step(u_center.x, v_uv.x);
  float v = clamp(c.g + u_break * 0.45 * g * side, 0.0, 1.0);
  o = vec4(u, v, 0.0, 1.0);
}`;

// One Barkley forward-Euler substep with a 9-point Laplacian of u (v is local).
const STEP_FS = `#version 300 es
precision highp float;
uniform sampler2D u_tex;
uniform float u_a;
uniform float u_b;
uniform float u_eps;
in vec2 v_uv;
out vec4 o;
void main() {
  vec2 px = vec2(${(1 / SIM_SIZE).toFixed(8)}, ${(1 / SIM_SIZE).toFixed(8)});
  vec4 c = texture(u_tex, v_uv);
  float u = c.r, v = c.g;

  // 9-point Laplacian of u (weights 0.2 edge, 0.05 diagonal, -1 center).
  float lap = -u;
  lap += 0.2 * (texture(u_tex, v_uv + vec2(-px.x, 0.0)).r
              + texture(u_tex, v_uv + vec2( px.x, 0.0)).r
              + texture(u_tex, v_uv + vec2( 0.0, -px.y)).r
              + texture(u_tex, v_uv + vec2( 0.0,  px.y)).r);
  lap += 0.05 * (texture(u_tex, v_uv + vec2(-px.x, -px.y)).r
               + texture(u_tex, v_uv + vec2( px.x, -px.y)).r
               + texture(u_tex, v_uv + vec2(-px.x,  px.y)).r
               + texture(u_tex, v_uv + vec2( px.x,  px.y)).r);

  float thr = (v + u_b) / u_a;
  float react = (1.0 / u_eps) * u * (1.0 - u) * (u - thr);
  float nu = clamp(u + ${DT.toFixed(4)} * react + ${DCOEF.toFixed(4)} * lap, 0.0, 1.0);
  float nv = clamp(v + ${DT.toFixed(4)} * (u - v), 0.0, 1.0);
  o = vec4(nu, nv, 0.0, 1.0);
}`;

// Downsample the sim field into the small persist texture (u→R, v→G) so it can
// be read back with readPixels(UNSIGNED_BYTE) — always supported.
const DOWN_FS = `#version 300 es
precision highp float;
uniform sampler2D u_tex;
in vec2 v_uv;
out vec4 o;
void main() {
  vec2 c = texture(u_tex, v_uv).rg;
  o = vec4(clamp(c, 0.0, 1.0), 0.0, 1.0);
}`;

// Upsample a restored small field back into the full sim texture.
const UP_FS = `#version 300 es
precision highp float;
uniform sampler2D u_tex;
in vec2 v_uv;
out vec4 o;
void main() {
  vec2 c = texture(u_tex, v_uv).rg;
  o = vec4(c, 0.0, 1.0);
}`;

// THIRD-REGISTER PALETTE: saturated cyan-teal ink on a cool bone/porcelain
// ground. Excited wavefronts (u high) glow bright cyan; the refractory tail
// (v high, u spent) is deep teal on the pale cool paper.
const DISP_FS = `#version 300 es
precision highp float;
uniform sampler2D u_tex;
uniform float u_energy;
uniform vec2 u_px;
in vec2 v_uv;
out vec4 o;
void main() {
  vec4 c = texture(u_tex, v_uv);
  float u = c.r, v = c.g;

  // leading-edge sharpness of the excitation front
  float ul = texture(u_tex, v_uv - vec2(u_px.x, 0.0)).r;
  float ur = texture(u_tex, v_uv + vec2(u_px.x, 0.0)).r;
  float ud = texture(u_tex, v_uv - vec2(0.0, u_px.y)).r;
  float uu = texture(u_tex, v_uv + vec2(0.0, u_px.y)).r;
  float edge = length(vec2(ur - ul, uu - ud));

  vec3 bone = vec3(0.865, 0.912, 0.930);   // cool porcelain ground
  vec3 teal = vec3(0.035, 0.325, 0.385);   // deep refractory ink
  vec3 cyan = vec3(0.330, 0.930, 1.000);   // bright excited front

  float refr = smoothstep(0.04, 0.60, v);            // refractory tail
  vec3 col = mix(bone, teal, refr * 0.88);
  float exc = smoothstep(0.35, 0.85, u);             // excited body
  col = mix(col, cyan, exc * (0.55 + 0.45 * u_energy));
  col += cyan * clamp(edge * 3.2, 0.0, 1.0) * (0.30 + 0.70 * u_energy); // glow fronts

  vec2 q = v_uv * 2.0 - 1.0;
  col *= 1.0 - 0.22 * dot(q, q);                       // gentle cool vignette
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
  gl.linkProgram(p);
  gl.deleteShader(v);
  gl.deleteShader(f);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    gl.deleteProgram(p);
    return null;
  }
  return p;
}

function makeFloatTex(gl: WebGL2RenderingContext): WebGLTexture | null {
  const t = gl.createTexture();
  if (!t) return null;
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA16F,
    SIM_SIZE,
    SIM_SIZE,
    0,
    gl.RGBA,
    gl.HALF_FLOAT,
    null,
  );
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
  return t;
}

export interface SpiralMedium {
  /** Birth a fresh field of broken wavefronts (⇒ rotating spirals). */
  seed(cores: number): void;
  /** Inject one excitation blob. center in 0..1 uv, radius in uv units. */
  inject(cx: number, cy: number, radius: number, amount: number, brk: boolean): void;
  /** Advance the Barkley kinetics `n` substeps at excitability (a,b,eps). */
  step(a: number, b: number, eps: number, n: number): void;
  /** Colour the current field to the visible canvas (energy 0..1 lifts fronts). */
  render(width: number, height: number, energy: number): void;
  /** Read the field down to a packed (u,v) byte array for persistence. */
  serialize(): Uint8Array;
  /** Push a packed (u,v) byte array back into the sim. False if malformed. */
  restore(bytes: Uint8Array): boolean;
  /** Release every GL resource. */
  dispose(): void;
}

/**
 * Build the excitable-medium engine on a WebGL2 canvas, or return null if
 * WebGL2 / float render targets are unavailable (the page shows an on-brand
 * notice instead of crashing).
 */
export function createSpiralMedium(
  canvas: HTMLCanvasElement,
): SpiralMedium | null {
  const gl = canvas.getContext("webgl2", { alpha: false, antialias: false });
  if (!gl) return null;
  if (!gl.getExtension("EXT_color_buffer_float")) return null;

  const seedProg = link(gl, QUAD_VS, SEED_FS);
  const injProg = link(gl, QUAD_VS, INJECT_FS);
  const stepProg = link(gl, QUAD_VS, STEP_FS);
  const downProg = link(gl, QUAD_VS, DOWN_FS);
  const upProg = link(gl, QUAD_VS, UP_FS);
  const dispProg = link(gl, QUAD_VS, DISP_FS);
  if (!seedProg || !injProg || !stepProg || !downProg || !upProg || !dispProg)
    return null;

  const vao = gl.createVertexArray();
  const quad = gl.createBuffer();
  if (!vao || !quad) return null;
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
    gl.STATIC_DRAW,
  );
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);

  const texA = makeFloatTex(gl);
  const texB = makeFloatTex(gl);
  const fboA = gl.createFramebuffer();
  const fboB = gl.createFramebuffer();
  if (!texA || !texB || !fboA || !fboB) return null;
  gl.bindFramebuffer(gl.FRAMEBUFFER, fboA);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texA, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, fboB);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texB, 0);

  // Small RGBA8 persist texture + fbo (readback) and an upload texture (restore).
  const persistTex = gl.createTexture();
  const persistFbo = gl.createFramebuffer();
  const uploadTex = gl.createTexture();
  if (!persistTex || !persistFbo || !uploadTex) return null;
  const emptyRgba = new Uint8Array(PERSIST_SIZE * PERSIST_SIZE * 4);
  gl.bindTexture(gl.TEXTURE_2D, persistTex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, PERSIST_SIZE, PERSIST_SIZE, 0, gl.RGBA, gl.UNSIGNED_BYTE, emptyRgba);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.bindFramebuffer(gl.FRAMEBUFFER, persistFbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, persistTex, 0);
  gl.bindTexture(gl.TEXTURE_2D, uploadTex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, PERSIST_SIZE, PERSIST_SIZE, 0, gl.RGBA, gl.UNSIGNED_BYTE, emptyRgba);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);

  const textures: [WebGLTexture, WebGLTexture] = [texA, texB];
  const fbos: [WebGLFramebuffer, WebGLFramebuffer] = [fboA, fboB];
  let ping: 0 | 1 = 0;

  const uSeedTiles = gl.getUniformLocation(seedProg, "u_tiles");
  const uSeedSeed = gl.getUniformLocation(seedProg, "u_seed");
  const uInjTex = gl.getUniformLocation(injProg, "u_tex");
  const uInjCenter = gl.getUniformLocation(injProg, "u_center");
  const uInjRadius = gl.getUniformLocation(injProg, "u_radius");
  const uInjAmount = gl.getUniformLocation(injProg, "u_amount");
  const uInjBreak = gl.getUniformLocation(injProg, "u_break");
  const uStepTex = gl.getUniformLocation(stepProg, "u_tex");
  const uStepA = gl.getUniformLocation(stepProg, "u_a");
  const uStepB = gl.getUniformLocation(stepProg, "u_b");
  const uStepEps = gl.getUniformLocation(stepProg, "u_eps");
  const uDownTex = gl.getUniformLocation(downProg, "u_tex");
  const uUpTex = gl.getUniformLocation(upProg, "u_tex");
  const uDpTex = gl.getUniformLocation(dispProg, "u_tex");
  const uDpEnergy = gl.getUniformLocation(dispProg, "u_energy");
  const uDpPx = gl.getUniformLocation(dispProg, "u_px");

  // Render `prog` into the "other" texture (sampling the current), then swap.
  function pingPong(prog: WebGLProgram): void {
    gl!.bindFramebuffer(gl!.FRAMEBUFFER, fbos[ping ^ 1]);
    gl!.viewport(0, 0, SIM_SIZE, SIM_SIZE);
    gl!.useProgram(prog);
    gl!.bindVertexArray(vao);
    gl!.activeTexture(gl!.TEXTURE0);
    gl!.bindTexture(gl!.TEXTURE_2D, textures[ping]);
    gl!.drawArrays(gl!.TRIANGLE_STRIP, 0, 4);
    ping = (ping ^ 1) as 0 | 1;
  }

  return {
    seed(cores) {
      const tiles = Math.max(1, Math.round(Math.sqrt(Math.max(1, cores))));
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbos[ping ^ 1]);
      gl.viewport(0, 0, SIM_SIZE, SIM_SIZE);
      gl.useProgram(seedProg);
      gl.bindVertexArray(vao);
      gl.uniform1f(uSeedTiles, tiles);
      gl.uniform1f(uSeedSeed, Math.random() * 1000);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      ping = (ping ^ 1) as 0 | 1;
    },
    inject(cx, cy, radius, amount, brk) {
      gl.useProgram(injProg);
      gl.uniform1i(uInjTex, 0);
      gl.uniform2f(uInjCenter, cx, cy);
      gl.uniform1f(uInjRadius, Math.max(0.01, radius));
      gl.uniform1f(uInjAmount, amount);
      gl.uniform1f(uInjBreak, brk ? 1 : 0);
      pingPong(injProg);
    },
    step(a, b, eps, n) {
      gl.useProgram(stepProg);
      gl.uniform1i(uStepTex, 0);
      gl.uniform1f(uStepA, a);
      gl.uniform1f(uStepB, b);
      gl.uniform1f(uStepEps, eps);
      for (let s = 0; s < n; s++) pingPong(stepProg);
    },
    render(width, height, energy) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, width, height);
      gl.useProgram(dispProg);
      gl.bindVertexArray(vao);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, textures[ping]);
      gl.uniform1i(uDpTex, 0);
      gl.uniform1f(uDpEnergy, energy);
      gl.uniform2f(uDpPx, 1 / SIM_SIZE, 1 / SIM_SIZE);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    },
    serialize() {
      // Downsample current sim → persist texture, then read it back as bytes.
      gl.bindFramebuffer(gl.FRAMEBUFFER, persistFbo);
      gl.viewport(0, 0, PERSIST_SIZE, PERSIST_SIZE);
      gl.useProgram(downProg);
      gl.bindVertexArray(vao);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, textures[ping]);
      gl.uniform1i(uDownTex, 0);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      const rgba = new Uint8Array(PERSIST_SIZE * PERSIST_SIZE * 4);
      gl.readPixels(0, 0, PERSIST_SIZE, PERSIST_SIZE, gl.RGBA, gl.UNSIGNED_BYTE, rgba);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      const out = new Uint8Array(PERSIST_SIZE * PERSIST_SIZE * 2);
      for (let i = 0; i < PERSIST_SIZE * PERSIST_SIZE; i++) {
        out[i * 2] = rgba[i * 4];
        out[i * 2 + 1] = rgba[i * 4 + 1];
      }
      return out;
    },
    restore(bytes) {
      const cells = PERSIST_SIZE * PERSIST_SIZE;
      if (bytes.length < cells * 2) return false;
      const rgba = new Uint8Array(cells * 4);
      for (let i = 0; i < cells; i++) {
        rgba[i * 4] = bytes[i * 2];
        rgba[i * 4 + 1] = bytes[i * 2 + 1];
        rgba[i * 4 + 3] = 255;
      }
      gl.bindTexture(gl.TEXTURE_2D, uploadTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, PERSIST_SIZE, PERSIST_SIZE, 0, gl.RGBA, gl.UNSIGNED_BYTE, rgba);
      // Upsample the restored field into the sim (write "other" then swap).
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbos[ping ^ 1]);
      gl.viewport(0, 0, SIM_SIZE, SIM_SIZE);
      gl.useProgram(upProg);
      gl.bindVertexArray(vao);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, uploadTex);
      gl.uniform1i(uUpTex, 0);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      ping = (ping ^ 1) as 0 | 1;
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      return true;
    },
    dispose() {
      gl.deleteProgram(seedProg);
      gl.deleteProgram(injProg);
      gl.deleteProgram(stepProg);
      gl.deleteProgram(downProg);
      gl.deleteProgram(upProg);
      gl.deleteProgram(dispProg);
      gl.deleteBuffer(quad);
      gl.deleteVertexArray(vao);
      gl.deleteTexture(texA);
      gl.deleteTexture(texB);
      gl.deleteTexture(persistTex);
      gl.deleteTexture(uploadTex);
      gl.deleteFramebuffer(fboA);
      gl.deleteFramebuffer(fboB);
      gl.deleteFramebuffer(persistFbo);
    },
  };
}
