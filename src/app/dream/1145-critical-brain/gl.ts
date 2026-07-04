// ─────────────────────────────────────────────────────────────────────────────
// gl.ts — a genuine 2D Ising model run as a Metropolis Monte-Carlo simulation
// on the GPU (WebGL2), plus the iridescent renderer that maps spins to color.
//
// PHYSICS (real, not decorative):
//   • State: a lattice of spins s ∈ {-1,+1}, stored in the red channel of an
//     RGBA8 texture (0 → -1, 1 → +1).
//   • Update: Metropolis single-spin flip. For a candidate cell the energy
//     change of a flip is  dE = 2·s·(sum of the 4 nearest neighbours). The flip
//     is accepted with probability  min(1, exp(-dE/T)).  T is the temperature in
//     units of J/k_B; the 2D square-lattice critical point (Onsager 1944) is
//     Tc = 2 / ln(1+√2) ≈ 2.269.
//   • Boundary: a torus — neighbour lookups wrap (GL_REPEAT).
//   • Parallelisation: a CHECKERBOARD update. A cell's 4 neighbours always have
//     the opposite colour of the (x+y) parity chessboard, so updating only the
//     "black" cells in one pass and the "white" cells in the next means no two
//     interacting spins ever change simultaneously — the correct race-free way
//     to run Metropolis in parallel. One "sweep" = two passes.
//   • Randomness: a per-cell integer hash of (x, y, frame) — a GLSL PRNG, so the
//     dynamics are deterministic per frame and never touch Math.random()/Date.
//
// This is a real statistical-mechanics engine used as a metaphor-made-literal
// for near-critical brain dynamics. It is NOT a claim that the brain is an
// Ising model.
// ─────────────────────────────────────────────────────────────────────────────

/** Onsager's exact 2D square-lattice critical temperature, 2/ln(1+√2). */
export const TC = 2.269185314213022;

// Fullscreen-triangle vertex shader (no vertex attributes; uses gl_VertexID).
const QUAD_VS = `#version 300 es
precision highp float;
void main() {
  vec2 p = vec2((gl_VertexID == 1) ? 3.0 : -1.0, (gl_VertexID == 2) ? 3.0 : -1.0);
  gl_Position = vec4(p, 0.0, 1.0);
}`;

// ── Metropolis checkerboard update pass ──────────────────────────────────────
const UPDATE_FS = `#version 300 es
precision highp float;
precision highp int;
uniform sampler2D uState;
uniform vec2 uSize;      // lattice dimensions in cells
uniform float uTemp;     // temperature T (units of J/kB)
uniform uint uFrame;     // pass counter, seeds the per-cell hash
uniform uint uParity;    // 0 = update black cells, 1 = update white cells
out vec4 frag;

// integer hash → uniform float in [0,1)
uint hashu(uint x) {
  x ^= x >> 16; x *= 0x7feb352du;
  x ^= x >> 15; x *= 0x846ca68bu;
  x ^= x >> 16; return x;
}
float rnd(uint x, uint y, uint f) {
  uint h = hashu(x * 1973u + y * 9277u + f * 26699u + 1u);
  return float(h) * (1.0 / 4294967296.0);
}

float spinAt(vec2 uv) {
  return texture(uState, uv).r > 0.5 ? 1.0 : -1.0;
}

void main() {
  ivec2 cell = ivec2(gl_FragCoord.xy);
  vec2 texel = 1.0 / uSize;
  vec2 uv = gl_FragCoord.xy / uSize;      // texel-centred (frag centre is +0.5)

  float s = spinAt(uv);
  uint parity = uint((cell.x + cell.y) & 1);

  if (parity == uParity) {
    float sum =
        spinAt(uv + vec2(texel.x, 0.0)) +
        spinAt(uv - vec2(texel.x, 0.0)) +
        spinAt(uv + vec2(0.0, texel.y)) +
        spinAt(uv - vec2(0.0, texel.y));
    float dE = 2.0 * s * sum;
    float r = rnd(uint(cell.x), uint(cell.y), uFrame);
    // accept if energy drops, else with Boltzmann probability exp(-dE/T)
    if (dE <= 0.0 || r < exp(-dE / max(uTemp, 1e-3))) {
      s = -s;
    }
  }
  frag = vec4(s > 0.0 ? 1.0 : 0.0, 0.0, 0.0, 1.0);
}`;

// ── iridescent renderer: spins → magenta↔teal, domain walls glow white ───────
const RENDER_FS = `#version 300 es
precision highp float;
uniform sampler2D uState;
uniform vec2 uSize;        // lattice size
uniform vec2 uOut;         // output (canvas) size in px
uniform float uCrit;       // 0..1 nearness to Tc (drives wall glow / iridescence)
uniform float uHeat;       // 0..1 how far above Tc (drives static shimmer)
uniform float uTime;
out vec4 frag;

float spinAt(vec2 uv) {
  return texture(uState, uv).r > 0.5 ? 1.0 : -1.0;
}

void main() {
  vec2 uv = gl_FragCoord.xy / uOut;
  vec2 texel = 1.0 / uSize;

  // 3x3 neighbourhood: smoothed signed field + domain-wall disagreement
  float s0 = spinAt(uv);
  float acc = s0;
  float disagree = 0.0;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      if (i == 0 && j == 0) continue;
      float sn = spinAt(uv + vec2(float(i), float(j)) * texel);
      acc += sn;
      disagree += (sn != s0) ? 1.0 : 0.0;
    }
  }
  float field = acc / 9.0;           // signed, [-1,1]
  float wall = disagree / 8.0;       // fraction of differing neighbours

  // two spin poles: teal (spin -1) ↔ magenta (spin +1)
  vec3 teal    = vec3(0.070, 0.902, 0.784);   // #12e6c8
  vec3 magenta = vec3(1.000, 0.176, 0.584);   // #ff2d95
  float t = field * 0.5 + 0.5;
  vec3 col = mix(teal, magenta, smoothstep(0.15, 0.85, t));

  // near-black substrate; deepen the ordered interior so criticality "blooms"
  col *= 0.30 + 0.70 * abs(field);

  // iridescence: a slow hue shimmer that intensifies toward criticality
  float sh = 0.5 + 0.5 * sin(uv.x * 26.0 + uv.y * 22.0 + uTime * 0.9 + field * 6.2831);
  col += uCrit * 0.22 * sh * vec3(0.55, 0.15, 0.9);          // violet-pink glint
  col += uCrit * 0.16 * (1.0 - sh) * vec3(0.1, 0.75, 0.7);   // teal glint

  // domain walls glow white-hot; the effect peaks at criticality
  float wallGlow = wall * (0.25 + 0.95 * uCrit);
  col += wallGlow * vec3(1.0, 0.98, 0.96);

  // above Tc: fine spatial static (NOT a global flash) — a per-cell sparkle
  if (uHeat > 0.001) {
    float n = fract(sin(dot(floor(uv * uSize), vec2(41.3, 289.1)) + uTime * 3.7) * 43758.5453);
    col += uHeat * 0.35 * (n - 0.5) * vec3(0.9, 0.7, 1.0);
  }

  // gentle vignette
  vec2 d = gl_FragCoord.xy / uOut - 0.5;
  col *= 1.0 - 0.55 * dot(d, d);

  col = pow(clamp(col, 0.0, 1.0), vec3(0.85));   // lift midtones a touch
  frag = vec4(col, 1.0);
}`;

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type);
  if (!sh) throw new Error("shader alloc failed");
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
  if (!p) throw new Error("program alloc failed");
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    throw new Error("link: " + gl.getProgramInfoLog(p));
  }
  return p;
}

/** Global observables read back occasionally from the lattice. */
export interface IsingObservables {
  /** |magnetization| ∈ [0,1] — the order parameter (1 = single frozen domain). */
  mag: number;
  /** nearest-neighbour agreement ∈ [0,1] (a cheap correlation/energy proxy). */
  order: number;
}

export class IsingGL {
  private gl: WebGL2RenderingContext;
  private updateProg: WebGLProgram;
  private renderProg: WebGLProgram;
  private vao: WebGLVertexArrayObject;
  private tex: [WebGLTexture, WebGLTexture];
  private fbo: [WebGLFramebuffer, WebGLFramebuffer];
  private cur = 0; // index of the texture holding the current state
  private frame = 0;
  private readonly size: number;
  private readback: Uint8Array;

  static create(canvas: HTMLCanvasElement, size = 256): IsingGL | null {
    const gl = canvas.getContext("webgl2", { antialias: false, alpha: false });
    if (!gl) return null;
    try {
      return new IsingGL(gl, size);
    } catch {
      return null;
    }
  }

  private constructor(gl: WebGL2RenderingContext, size: number) {
    this.gl = gl;
    this.size = size;
    this.updateProg = link(gl, QUAD_VS, UPDATE_FS);
    this.renderProg = link(gl, QUAD_VS, RENDER_FS);
    this.readback = new Uint8Array(size * size * 4);

    const vao = gl.createVertexArray();
    if (!vao) throw new Error("vao alloc failed");
    this.vao = vao;

    const mk = (): [WebGLTexture, WebGLFramebuffer] => {
      const tex = gl.createTexture();
      const fbo = gl.createFramebuffer();
      if (!tex || !fbo) throw new Error("state alloc failed");
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, size, size, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT); // torus
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
        throw new Error("framebuffer incomplete");
      }
      return [tex, fbo];
    };
    const [t0, f0] = mk();
    const [t1, f1] = mk();
    this.tex = [t0, t1];
    this.fbo = [f0, f1];
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    this.seed(0.5);
  }

  /** (Re)initialise the lattice with random spins. `pUp` ∈ [0,1] is the initial
   *  fraction of +1 spins. Math.random() is fine HERE — this is the one-time
   *  seed, outside the deterministic simulation loop. */
  seed(pUp = 0.5): void {
    const gl = this.gl;
    const n = this.size * this.size;
    const data = new Uint8Array(n * 4);
    for (let i = 0; i < n; i++) {
      const up = Math.random() < pUp ? 255 : 0;
      data[i * 4] = up;
      data[i * 4 + 3] = 255;
    }
    for (const tex of this.tex) {
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, this.size, this.size, gl.RGBA, gl.UNSIGNED_BYTE, data);
    }
    this.cur = 0;
    this.frame = 0;
  }

  /** Advance the simulation by `sweeps` Monte-Carlo sweeps (each = 2 checkerboard
   *  passes) at temperature `temp`. */
  step(temp: number, sweeps: number): void {
    const gl = this.gl;
    gl.useProgram(this.updateProg);
    gl.bindVertexArray(this.vao);
    gl.viewport(0, 0, this.size, this.size);
    gl.uniform2f(gl.getUniformLocation(this.updateProg, "uSize"), this.size, this.size);
    gl.uniform1f(gl.getUniformLocation(this.updateProg, "uTemp"), temp);
    const uFrame = gl.getUniformLocation(this.updateProg, "uFrame");
    const uParity = gl.getUniformLocation(this.updateProg, "uParity");
    const uState = gl.getUniformLocation(this.updateProg, "uState");

    for (let s = 0; s < sweeps; s++) {
      for (let parity = 0; parity < 2; parity++) {
        const src = this.cur;
        const dst = 1 - this.cur;
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo[dst]);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.tex[src]);
        gl.uniform1i(uState, 0);
        gl.uniform1ui(uFrame, this.frame >>> 0);
        gl.uniform1ui(uParity, parity);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        this.cur = dst;
        this.frame++;
      }
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  /** Draw the current spin lattice to the default framebuffer. */
  render(width: number, height: number, crit: number, heat: number, time: number): void {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, width, height);
    gl.useProgram(this.renderProg);
    gl.bindVertexArray(this.vao);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.tex[this.cur]);
    gl.uniform1i(gl.getUniformLocation(this.renderProg, "uState"), 0);
    gl.uniform2f(gl.getUniformLocation(this.renderProg, "uSize"), this.size, this.size);
    gl.uniform2f(gl.getUniformLocation(this.renderProg, "uOut"), width, height);
    gl.uniform1f(gl.getUniformLocation(this.renderProg, "uCrit"), crit);
    gl.uniform1f(gl.getUniformLocation(this.renderProg, "uHeat"), heat);
    gl.uniform1f(gl.getUniformLocation(this.renderProg, "uTime"), time);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
  }

  /** Read back the lattice and compute the order parameters. Moderately
   *  expensive (a GPU→CPU stall) — call every N frames, not every frame. */
  measure(): IsingObservables {
    const gl = this.gl;
    const n = this.size;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo[this.cur]);
    gl.readPixels(0, 0, n, n, gl.RGBA, gl.UNSIGNED_BYTE, this.readback);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    const buf = this.readback;
    let sum = 0;
    let agree = 0;
    const total = n * n;
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const s = buf[(y * n + x) * 4] > 127 ? 1 : -1;
        sum += s;
        const rx = (x + 1) % n;
        const dy = (y + 1) % n;
        const sr = buf[(y * n + rx) * 4] > 127 ? 1 : -1;
        const sd = buf[(dy * n + x) * 4] > 127 ? 1 : -1;
        agree += (s === sr ? 1 : 0) + (s === sd ? 1 : 0);
      }
    }
    return {
      mag: Math.abs(sum) / total,
      order: agree / (total * 2),
    };
  }

  dispose(): void {
    const gl = this.gl;
    try {
      gl.deleteProgram(this.updateProg);
      gl.deleteProgram(this.renderProg);
      gl.deleteVertexArray(this.vao);
      for (const t of this.tex) gl.deleteTexture(t);
      for (const f of this.fbo) gl.deleteFramebuffer(f);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    } catch {
      /* noop */
    }
  }
}
