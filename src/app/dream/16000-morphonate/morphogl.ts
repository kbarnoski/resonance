// ─────────────────────────────────────────────────────────────────────────────
// 16000-morphonate — morphogl.ts
//
// A GPU Gray-Scott reaction–diffusion engine: two chemicals (U substrate, V
// activator) held in a pair of RGBA16F float textures that are ping-ponged
// through a fragment shader. The membrane is never reset — it carries its whole
// history, so a long take paints an ever-different organism.
//
// The React page owns the audio + timeline; this module owns the GPU:
//   • seed()          — ignite a fresh membrane with a few activator blobs
//   • splat()         — inject a soft gaussian of activator (a chord/onset)
//   • step()          — advance the RD simulation N sub-steps at (feed, kill)
//   • render()        — colour the current V field into the achromatic ink look
//
// Reference: Alan Turing, "The Chemical Basis of Morphogenesis" (1952); the
// Gray-Scott model; Karl Sims' GPU reaction–diffusion tutorial.
// ─────────────────────────────────────────────────────────────────────────────

/** Simulation grid resolution (square). Fine enough for coral, cheap enough for 60fps. */
export const SIM_SIZE = 512;

// Diffusion rates for the two chemicals.
const DU = 0.21;
const DV = 0.105;

const QUAD_VS = `#version 300 es
layout(location = 0) in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

// Seed the field: substrate everywhere, a handful of activator gaussians.
const SEED_FS = `#version 300 es
precision highp float;
uniform vec2 u_seeds[10];
uniform int u_nseed;
in vec2 v_uv;
out vec4 o;
void main() {
  float v = 0.0;
  for (int i = 0; i < 10; i++) {
    if (i >= u_nseed) break;
    vec2 d = v_uv - u_seeds[i];
    v += exp(-dot(d, d) / 0.0008);
  }
  o = vec4(1.0, clamp(v, 0.0, 1.0), 0.0, 1.0);
}`;

// Gray-Scott update with a 9-point Laplacian (ping-pong).
const RD_FS = `#version 300 es
precision highp float;
uniform sampler2D u_tex;
uniform float u_f;
uniform float u_k;
in vec2 v_uv;
out vec4 o;
void main() {
  vec2 px = vec2(${(1 / SIM_SIZE).toFixed(8)}, ${(1 / SIM_SIZE).toFixed(8)});
  vec4 c = texture(u_tex, v_uv);
  float u = c.r, v = c.g;

  float lu = -u, lv = -v;
  lu += 0.2 * (texture(u_tex, v_uv + vec2(-px.x, 0.0)).r
             + texture(u_tex, v_uv + vec2( px.x, 0.0)).r
             + texture(u_tex, v_uv + vec2( 0.0, -px.y)).r
             + texture(u_tex, v_uv + vec2( 0.0,  px.y)).r);
  lv += 0.2 * (texture(u_tex, v_uv + vec2(-px.x, 0.0)).g
             + texture(u_tex, v_uv + vec2( px.x, 0.0)).g
             + texture(u_tex, v_uv + vec2( 0.0, -px.y)).g
             + texture(u_tex, v_uv + vec2( 0.0,  px.y)).g);
  lu += 0.05 * (texture(u_tex, v_uv + vec2(-px.x, -px.y)).r
              + texture(u_tex, v_uv + vec2( px.x, -px.y)).r
              + texture(u_tex, v_uv + vec2(-px.x,  px.y)).r
              + texture(u_tex, v_uv + vec2( px.x,  px.y)).r);
  lv += 0.05 * (texture(u_tex, v_uv + vec2(-px.x, -px.y)).g
              + texture(u_tex, v_uv + vec2( px.x, -px.y)).g
              + texture(u_tex, v_uv + vec2(-px.x,  px.y)).g
              + texture(u_tex, v_uv + vec2( px.x,  px.y)).g);

  float uvv = u * v * v;
  float nu = clamp(u + ${DU.toFixed(4)} * lu - uvv + u_f * (1.0 - u), 0.0, 1.0);
  float nv = clamp(v + ${DV.toFixed(4)} * lv + uvv - (u_f + u_k) * v, 0.0, 1.0);
  o = vec4(nu, nv, 0.0, 1.0);
}`;

// Inject a soft gaussian of activator (V) at a point; consumes a little substrate.
const SPLAT_FS = `#version 300 es
precision highp float;
uniform sampler2D u_tex;
uniform vec2 u_center;
uniform float u_radius;
uniform float u_amount;
in vec2 v_uv;
out vec4 o;
void main() {
  vec4 c = texture(u_tex, v_uv);
  vec2 d = v_uv - u_center;
  float g = exp(-dot(d, d) / (u_radius * u_radius));
  float add = u_amount * g;
  float u = clamp(c.r - add * 0.5, 0.0, 1.0);
  float v = clamp(c.g + add, 0.0, 1.0);
  o = vec4(u, v, 0.0, 1.0);
}`;

// Achromatic ink display: near-black substrate, bone-white membrane, a whisper
// of cold cyan on the active reaction fronts (scaled by spectral energy).
const DISP_FS = `#version 300 es
precision highp float;
uniform sampler2D u_tex;
uniform float u_energy;
uniform vec2 u_px;
in vec2 v_uv;
out vec4 o;
void main() {
  float v  = texture(u_tex, v_uv).g;
  float vl = texture(u_tex, v_uv - vec2(u_px.x, 0.0)).g;
  float vr = texture(u_tex, v_uv + vec2(u_px.x, 0.0)).g;
  float vd = texture(u_tex, v_uv - vec2(0.0, u_px.y)).g;
  float vu = texture(u_tex, v_uv + vec2(0.0, u_px.y)).g;
  float edge = abs(vl + vr + vd + vu - 4.0 * v);

  vec3 ink  = vec3(0.020, 0.024, 0.030);
  vec3 bone = vec3(0.930, 0.945, 0.955);
  float m = smoothstep(0.10, 0.55, v);
  vec3 col = mix(ink, bone, m);
  col += bone * smoothstep(0.36, 0.62, v) * 0.22;          // luminous body
  vec3 cyan = vec3(0.55, 0.86, 1.0);
  col += cyan * clamp(edge * 7.0, 0.0, 1.0) * (0.12 + 0.88 * u_energy); // cold fronts

  vec2 q = v_uv * 2.0 - 1.0;
  col *= 1.0 - 0.26 * dot(q, q);                            // vignette
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

function makeTex(gl: WebGL2RenderingContext): WebGLTexture | null {
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

export interface MorphoEngine {
  /** Re-ignite the membrane with `seeds` activator blobs (each in 0..1 uv space). */
  seed(seeds: Array<[number, number]>): void;
  /** Inject one soft activator splat. center in 0..1 uv, radius in uv units. */
  splat(cx: number, cy: number, radius: number, amount: number): void;
  /** Advance the simulation `n` sub-steps at the given feed / kill rates. */
  step(feed: number, kill: number, n: number): void;
  /** Colour the current field to the visible canvas. energy 0..1 lifts the cold fronts. */
  render(width: number, height: number, energy: number): void;
  /** Release every GL resource. */
  dispose(): void;
}

/**
 * Build the RD engine on a WebGL2 canvas, or return null if WebGL2 / float
 * render targets are unavailable (the page then shows an on-brand notice).
 */
export function createMorphoEngine(
  canvas: HTMLCanvasElement,
): MorphoEngine | null {
  const gl = canvas.getContext("webgl2", { alpha: false, antialias: false });
  if (!gl) return null;
  // Float render targets are required for a stable RD field.
  if (!gl.getExtension("EXT_color_buffer_float")) return null;

  const seedProg = link(gl, QUAD_VS, SEED_FS);
  const rdProg = link(gl, QUAD_VS, RD_FS);
  const splatProg = link(gl, QUAD_VS, SPLAT_FS);
  const dispProg = link(gl, QUAD_VS, DISP_FS);
  if (!seedProg || !rdProg || !splatProg || !dispProg) return null;

  // Full-screen quad shared by every program (all use layout(location=0)).
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

  const texA = makeTex(gl);
  const texB = makeTex(gl);
  const fboA = gl.createFramebuffer();
  const fboB = gl.createFramebuffer();
  if (!texA || !texB || !fboA || !fboB) return null;
  gl.bindFramebuffer(gl.FRAMEBUFFER, fboA);
  gl.framebufferTexture2D(
    gl.FRAMEBUFFER,
    gl.COLOR_ATTACHMENT0,
    gl.TEXTURE_2D,
    texA,
    0,
  );
  gl.bindFramebuffer(gl.FRAMEBUFFER, fboB);
  gl.framebufferTexture2D(
    gl.FRAMEBUFFER,
    gl.COLOR_ATTACHMENT0,
    gl.TEXTURE_2D,
    texB,
    0,
  );
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);

  const textures: [WebGLTexture, WebGLTexture] = [texA, texB];
  const fbos: [WebGLFramebuffer, WebGLFramebuffer] = [fboA, fboB];
  let ping: 0 | 1 = 0;

  // Uniform locations (null is a harmless no-op for gl.uniform*, but cache anyway).
  const uSeeds = gl.getUniformLocation(seedProg, "u_seeds");
  const uNseed = gl.getUniformLocation(seedProg, "u_nseed");
  const uRdTex = gl.getUniformLocation(rdProg, "u_tex");
  const uRdF = gl.getUniformLocation(rdProg, "u_f");
  const uRdK = gl.getUniformLocation(rdProg, "u_k");
  const uSpTex = gl.getUniformLocation(splatProg, "u_tex");
  const uSpCenter = gl.getUniformLocation(splatProg, "u_center");
  const uSpRadius = gl.getUniformLocation(splatProg, "u_radius");
  const uSpAmount = gl.getUniformLocation(splatProg, "u_amount");
  const uDpTex = gl.getUniformLocation(dispProg, "u_tex");
  const uDpEnergy = gl.getUniformLocation(dispProg, "u_energy");
  const uDpPx = gl.getUniformLocation(dispProg, "u_px");

  // Render a full-screen pass of `prog` into the "other" texture, then swap.
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
    seed(seeds) {
      const flat = new Float32Array(20);
      const n = Math.min(seeds.length, 10);
      for (let i = 0; i < n; i++) {
        flat[i * 2] = seeds[i][0];
        flat[i * 2 + 1] = seeds[i][1];
      }
      // Seed writes into the "other" buffer then swaps, same as any pass.
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbos[ping ^ 1]);
      gl.viewport(0, 0, SIM_SIZE, SIM_SIZE);
      gl.useProgram(seedProg);
      gl.bindVertexArray(vao);
      gl.uniform2fv(uSeeds, flat);
      gl.uniform1i(uNseed, n);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      ping = (ping ^ 1) as 0 | 1;
    },
    splat(cx, cy, radius, amount) {
      gl.useProgram(splatProg);
      gl.uniform1i(uSpTex, 0);
      gl.uniform2f(uSpCenter, cx, cy);
      gl.uniform1f(uSpRadius, Math.max(0.01, radius));
      gl.uniform1f(uSpAmount, amount);
      pingPong(splatProg);
    },
    step(feed, kill, n) {
      gl.useProgram(rdProg);
      gl.uniform1i(uRdTex, 0);
      gl.uniform1f(uRdF, feed);
      gl.uniform1f(uRdK, kill);
      for (let s = 0; s < n; s++) pingPong(rdProg);
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
    dispose() {
      gl.deleteProgram(seedProg);
      gl.deleteProgram(rdProg);
      gl.deleteProgram(splatProg);
      gl.deleteProgram(dispProg);
      gl.deleteBuffer(quad);
      gl.deleteVertexArray(vao);
      gl.deleteTexture(texA);
      gl.deleteTexture(texB);
      gl.deleteFramebuffer(fboA);
      gl.deleteFramebuffer(fboB);
    },
  };
}
