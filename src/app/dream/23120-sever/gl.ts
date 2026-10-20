// ─────────────────────────────────────────────────────────────────────────────
// 23120-sever · gl.ts — GPGPU Gray-Scott reaction-diffusion on raw WebGL2.
//
//   A 2-D simulation surface (NOT a volume, NOT three.js, NOT Canvas2D). Two
//   RGBA16F textures are ping-ponged every frame; a fragment shader runs the
//   Gray-Scott update (Pearson 1993) several sub-steps per frame, reading
//   neighbours with texelFetch.
//
//   The two separated audio layers drive the two coupled chemicals:
//     · HARMONIC rms  → feed/diffusion balance. Sustained energy smooths the
//       feed rate so broad, slow fronts spread (the ringing made visible).
//     · PERCUSSIVE onsets → each attack injects a burst of chemical V at a
//       seeded point, which blooms outward as a spreading ripple.
//
//   The hand SPLIT cleaves the field into two territories: a seam sweeps across
//   x as the hands part, biasing kill-rate so the sustain half and the transient
//   half visibly pull apart. Palette: cool slate / indigo for the sustain bed,
//   pale bone for the transient injections — no violet-phosphor glow.
// ─────────────────────────────────────────────────────────────────────────────

export interface Injection {
  /** 0..1 position in sim space. */
  x: number;
  y: number;
  /** burst strength 0..1 */
  amp: number;
}

export interface Frame {
  dt: number;
  time: number;
  /** harmonic layer rms 0..1 */
  harm: number;
  /** percussive layer rms 0..1 */
  perc: number;
  /** 0 = hands fused, 1 = hands fully apart */
  split: number;
  /** 0..1 — raises harmonic brightness tint (hand height) */
  height: number;
  injections: Injection[];
}

export interface Renderer {
  resize(cssW: number, cssH: number, dpr: number): void;
  frame(f: Frame): void;
  dispose(): void;
}

const QUAD_VS = `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main(){
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

// Gray-Scott update. State: R = u, G = v. Neighbours via texelFetch (exact).
const SIM_FS = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uState;
uniform vec2 uRes;      // sim resolution
uniform float uFeed;
uniform float uKill;
uniform float uDu;
uniform float uDv;
uniform float uSplit;   // 0..1 seam strength
uniform float uSteps;   // dt per substep
out vec4 frag;

vec2 samp(ivec2 p){
  p = clamp(p, ivec2(0), ivec2(uRes) - ivec2(1));
  return texelFetch(uState, p, 0).xy;
}

void main(){
  ivec2 c = ivec2(gl_FragCoord.xy);
  vec2 s = samp(c);
  // 9-point Laplacian.
  vec2 lap = vec2(0.0);
  lap += samp(c + ivec2(-1, 0)) * 0.2;
  lap += samp(c + ivec2( 1, 0)) * 0.2;
  lap += samp(c + ivec2( 0,-1)) * 0.2;
  lap += samp(c + ivec2( 0, 1)) * 0.2;
  lap += samp(c + ivec2(-1,-1)) * 0.05;
  lap += samp(c + ivec2( 1,-1)) * 0.05;
  lap += samp(c + ivec2(-1, 1)) * 0.05;
  lap += samp(c + ivec2( 1, 1)) * 0.05;
  lap += s * -1.0;

  float u = s.x;
  float v = s.y;

  // The seam: a soft vertical band whose kill-rate differs on each side, so the
  // field cleaves into two territories as the hands part.
  float xu = vUv.x;
  float seam = 0.5;
  float side = sign(xu - seam);
  float kill = uKill + side * uSplit * 0.010;
  float feed = uFeed - side * uSplit * 0.006;

  float reaction = u * v * v;
  float du = (uDu * lap.x - reaction + feed * (1.0 - u)) * uSteps;
  float dv = (uDv * lap.y + reaction - (kill + feed) * v) * uSteps;

  u = clamp(u + du, 0.0, 1.0);
  v = clamp(v + dv, 0.0, 1.0);
  frag = vec4(u, v, 0.0, 1.0);
}`;

// Inject a soft gaussian of V (chemical) at seeded points.
const INJECT_FS = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uState;
uniform vec2 uPoints[16]; // xy
uniform float uAmps[16];
uniform int uCount;
out vec4 frag;
void main(){
  vec2 s = texture(uState, vUv).xy;
  float add = 0.0;
  for (int i = 0; i < 16; i++){
    if (i >= uCount) break;
    vec2 d = vUv - uPoints[i];
    float r2 = dot(d, d);
    add += uAmps[i] * exp(-r2 / 0.0006);
  }
  float v = clamp(s.y + add, 0.0, 1.0);
  float u = clamp(s.x - add * 0.5, 0.0, 1.0);
  frag = vec4(u, v, 0.0, 1.0);
}`;

// Present: map (u,v) to cool slate/indigo sustain + pale bone transients.
const PRESENT_FS = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uState;
uniform vec2 uTexel;
uniform float uSplit;
uniform float uHeight;
uniform float uHarm;
out vec4 frag;

void main(){
  // Smooth read (bilinear) + a light cross blur so fronts read as soft tissue.
  vec2 s = texture(uState, vUv).xy;
  vec2 b = vec2(0.0);
  float o = 1.5;
  b += texture(uState, vUv + uTexel * vec2( o, 0.0)).xy;
  b += texture(uState, vUv + uTexel * vec2(-o, 0.0)).xy;
  b += texture(uState, vUv + uTexel * vec2(0.0,  o)).xy;
  b += texture(uState, vUv + uTexel * vec2(0.0, -o)).xy;
  s = mix(s, b * 0.25, 0.35);

  float u = s.x;
  float v = s.y;

  // Deep slate background that lifts slightly with sustained energy.
  vec3 bg = mix(vec3(0.020, 0.028, 0.045), vec3(0.035, 0.050, 0.080), vUv.y);
  bg += vec3(0.010, 0.016, 0.030) * uHarm;

  // Sustain bed: cool slate → indigo, following the u field.
  float bed = smoothstep(0.15, 0.5, u) * (1.0 - smoothstep(0.55, 0.9, v));
  vec3 slate = mix(vec3(0.16, 0.22, 0.34), vec3(0.28, 0.33, 0.58), uHeight);
  vec3 col = bg + slate * bed * (0.45 + 0.7 * uHarm);

  // Transient fronts: where V concentrates → pale bone ridges.
  float front = smoothstep(0.18, 0.42, v);
  float edge = smoothstep(0.42, 0.22, v) * smoothstep(0.18, 0.30, v);
  vec3 bone = vec3(0.88, 0.86, 0.80);
  col += bone * front * 0.55;
  col += bone * edge * 0.9;

  // The seam: a faint cool fissure marks where the two territories part.
  float seamX = 0.5;
  float fissure = smoothstep(0.018, 0.0, abs(vUv.x - seamX)) * uSplit;
  col = mix(col, col * 0.4 + vec3(0.10, 0.14, 0.22), fissure * 0.6);

  // Cool vignette.
  vec2 d = vUv - 0.5;
  float vig = smoothstep(1.1, 0.3, length(d) * 1.4);
  col *= mix(0.6, 1.0, vig);

  frag = vec4(col, 1.0);
}`;

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type);
  if (!sh) throw new Error("createShader failed");
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh) ?? "compile error";
    gl.deleteShader(sh);
    throw new Error(log);
  }
  return sh;
}

function link(gl: WebGL2RenderingContext, vs: string, fs: string): WebGLProgram {
  const v = compile(gl, gl.VERTEX_SHADER, vs);
  const f = compile(gl, gl.FRAGMENT_SHADER, fs);
  const p = gl.createProgram();
  if (!p) throw new Error("createProgram failed");
  gl.attachShader(p, v);
  gl.attachShader(p, f);
  gl.linkProgram(p);
  gl.deleteShader(v);
  gl.deleteShader(f);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(p) ?? "link error";
    throw new Error(log);
  }
  return p;
}

interface FBO {
  tex: WebGLTexture;
  fb: WebGLFramebuffer;
}

function makeFBO(gl: WebGL2RenderingContext, w: number, h: number): FBO {
  const tex = gl.createTexture();
  if (!tex) throw new Error("createTexture failed");
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
  const fb = gl.createFramebuffer();
  if (!fb) throw new Error("createFramebuffer failed");
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return { tex, fb };
}

/** Try WebGL2 + float render targets. Returns null if unsupported. */
export function createRenderer(canvas: HTMLCanvasElement): Renderer | null {
  let gl: WebGL2RenderingContext | null;
  try {
    gl = canvas.getContext("webgl2", {
      antialias: false,
      alpha: false,
      depth: false,
      preserveDrawingBuffer: false,
      powerPreference: "high-performance",
    });
  } catch {
    return null;
  }
  if (!gl) return null;
  if (!gl.getExtension("EXT_color_buffer_float")) return null;

  try {
    return createGLRenderer(canvas, gl);
  } catch {
    return null;
  }
}

function createGLRenderer(canvas: HTMLCanvasElement, gl: WebGL2RenderingContext): Renderer {
  let simW = 256;
  let simH = 256;
  let a = makeFBO(gl, simW, simH);
  let b = makeFBO(gl, simW, simH);

  const quad = gl.createBuffer();
  if (!quad) throw new Error("createBuffer failed");
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);

  const progSim = link(gl, QUAD_VS, SIM_FS);
  const progInject = link(gl, QUAD_VS, INJECT_FS);
  const progPresent = link(gl, QUAD_VS, PRESENT_FS);

  const uSim = {
    state: gl.getUniformLocation(progSim, "uState"),
    res: gl.getUniformLocation(progSim, "uRes"),
    feed: gl.getUniformLocation(progSim, "uFeed"),
    kill: gl.getUniformLocation(progSim, "uKill"),
    du: gl.getUniformLocation(progSim, "uDu"),
    dv: gl.getUniformLocation(progSim, "uDv"),
    split: gl.getUniformLocation(progSim, "uSplit"),
    steps: gl.getUniformLocation(progSim, "uSteps"),
  };
  const uInj = {
    state: gl.getUniformLocation(progInject, "uState"),
    points: gl.getUniformLocation(progInject, "uPoints"),
    amps: gl.getUniformLocation(progInject, "uAmps"),
    count: gl.getUniformLocation(progInject, "uCount"),
  };
  const uPres = {
    state: gl.getUniformLocation(progPresent, "uState"),
    texel: gl.getUniformLocation(progPresent, "uTexel"),
    split: gl.getUniformLocation(progPresent, "uSplit"),
    height: gl.getUniformLocation(progPresent, "uHeight"),
    harm: gl.getUniformLocation(progPresent, "uHarm"),
  };

  function bindQuad(prog: WebGLProgram): void {
    const loc = gl.getAttribLocation(prog, "aPos");
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  }

  // Seed: u = 1, v = 0, with a scattering of v blobs to kick off pattern.
  function seed(): void {
    const px = new Float32Array(simW * simH * 4);
    for (let i = 0; i < simW * simH; i++) {
      px[i * 4] = 1;
      px[i * 4 + 1] = 0;
      px[i * 4 + 3] = 1;
    }
    let s = 0x23120;
    const rnd = () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
    for (let n = 0; n < 24; n++) {
      const cx = Math.floor(rnd() * simW);
      const cy = Math.floor(rnd() * simH);
      const rad = 3 + Math.floor(rnd() * 4);
      for (let yy = -rad; yy <= rad; yy++) {
        for (let xx = -rad; xx <= rad; xx++) {
          const x = cx + xx;
          const y = cy + yy;
          if (x < 0 || y < 0 || x >= simW || y >= simH) continue;
          if (xx * xx + yy * yy > rad * rad) continue;
          px[(y * simW + x) * 4 + 1] = 0.6;
        }
      }
    }
    // HALF_FLOAT upload needs conversion; use RGBA32F staging via a temp
    // texture is overkill — instead upload as FLOAT into the HALF_FLOAT target
    // is invalid, so we convert to Uint16 half-floats.
    const half = new Uint16Array(px.length);
    for (let i = 0; i < px.length; i++) half[i] = floatToHalf(px[i]);
    for (const f of [a, b]) {
      gl.bindTexture(gl.TEXTURE_2D, f.tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, simW, simH, 0, gl.RGBA, gl.HALF_FLOAT, half);
    }
  }

  function resize(cssW: number, cssH: number, dpr: number): void {
    canvas.width = Math.max(1, Math.floor(cssW * dpr));
    canvas.height = Math.max(1, Math.floor(cssH * dpr));
    const aspect = cssW / Math.max(1, cssH);
    const longSide = 260;
    if (aspect >= 1) {
      simW = longSide;
      simH = Math.max(140, Math.round(longSide / aspect));
    } else {
      simH = longSide;
      simW = Math.max(140, Math.round(longSide * aspect));
    }
    gl.deleteTexture(a.tex);
    gl.deleteFramebuffer(a.fb);
    gl.deleteTexture(b.tex);
    gl.deleteFramebuffer(b.fb);
    a = makeFBO(gl, simW, simH);
    b = makeFBO(gl, simW, simH);
    seed();
  }

  const pts = new Float32Array(32);
  const amps = new Float32Array(16);

  function frame(f: Frame): void {
    gl.disable(gl.BLEND);

    // Inject percussive onsets into the current state (a → b), then swap.
    if (f.injections.length > 0) {
      const count = Math.min(16, f.injections.length);
      for (let i = 0; i < count; i++) {
        pts[i * 2] = f.injections[i].x;
        pts[i * 2 + 1] = f.injections[i].y;
        amps[i] = f.injections[i].amp;
      }
      gl.useProgram(progInject);
      gl.viewport(0, 0, simW, simH);
      gl.bindFramebuffer(gl.FRAMEBUFFER, b.fb);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, a.tex);
      gl.uniform1i(uInj.state, 0);
      gl.uniform2fv(uInj.points, pts);
      gl.uniform1fv(uInj.amps, amps);
      gl.uniform1i(uInj.count, count);
      bindQuad(progInject);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      const t = a;
      a = b;
      b = t;
    }

    // Gray-Scott substeps. Harmonic (sustain) energy nudges feed up → broad
    // spreading fronts; the split biases kill/feed per side in the shader.
    const substeps = 10;
    const feed = 0.034 + f.harm * 0.012;
    const kill = 0.061;
    const du = 0.16;
    const dv = 0.08;
    gl.useProgram(progSim);
    gl.uniform2f(uSim.res, simW, simH);
    gl.uniform1f(uSim.feed, feed);
    gl.uniform1f(uSim.kill, kill);
    gl.uniform1f(uSim.du, du);
    gl.uniform1f(uSim.dv, dv);
    gl.uniform1f(uSim.split, f.split);
    gl.uniform1f(uSim.steps, 1.0);
    gl.viewport(0, 0, simW, simH);
    for (let i = 0; i < substeps; i++) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, b.fb);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, a.tex);
      gl.uniform1i(uSim.state, 0);
      bindQuad(progSim);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      const t = a;
      a = b;
      b = t;
    }

    // Present to screen.
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.useProgram(progPresent);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, a.tex);
    gl.uniform1i(uPres.state, 0);
    gl.uniform2f(uPres.texel, 1 / simW, 1 / simH);
    gl.uniform1f(uPres.split, f.split);
    gl.uniform1f(uPres.height, f.height);
    gl.uniform1f(uPres.harm, f.harm);
    bindQuad(progPresent);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  function dispose(): void {
    try {
      gl.deleteTexture(a.tex);
      gl.deleteFramebuffer(a.fb);
      gl.deleteTexture(b.tex);
      gl.deleteFramebuffer(b.fb);
      gl.deleteBuffer(quad);
      gl.deleteProgram(progSim);
      gl.deleteProgram(progInject);
      gl.deleteProgram(progPresent);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    } catch {
      /* context already gone */
    }
  }

  seed();
  return { resize, frame, dispose };
}

// IEEE-754 float32 → half (uint16). Enough precision for a 0..1 sim state.
function floatToHalf(val: number): number {
  const f = new Float32Array(1);
  const i = new Int32Array(f.buffer);
  f[0] = val;
  const x = i[0];
  const sign = (x >> 16) & 0x8000;
  const exp = ((x >> 23) & 0xff) - 127 + 15;
  const mant = x & 0x7fffff;
  if (exp <= 0) return sign;
  if (exp >= 0x1f) return sign | 0x7c00;
  return sign | (exp << 10) | (mant >> 13);
}
