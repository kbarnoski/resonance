// Navier-Stokes "Stable Fluids" GPU simulation
// Jos Stam, "Stable Fluids", SIGGRAPH 1999
// GPU Gems Ch. 38, Mark Harris, "Fast Fluid Dynamics Simulation on the GPU"
// Canonical browser lineage: Pavel Dobryakov's WebGL-Fluid-Simulation
//
// All passes run on ping-pong RGBA float (or half-float) textures.
// Pipeline per frame:
//   advectVelocity → addForces → divergence → Jacobi(pressure) × N → gradientSubtract → advectDye

export interface FluidSim {
  gl: WebGL2RenderingContext;
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
  dyeWidth: number;
  dyeHeight: number;
  step: (dt: number) => void;
  splat: (x: number, y: number, vx: number, vy: number, r: number, g: number, b: number, radius?: number) => void;
  render: () => void;
  destroy: () => void;
}

// ── GLSL source strings ───────────────────────────────────────────────────────

const VERT_SRC = /* glsl */`#version 300 es
precision highp float;
in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

// Bilinear advection (manual, avoids texture border issues)
const ADVECT_SRC = /* glsl */`#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_velocity;
uniform sampler2D u_source;
uniform vec2 u_texelSize;
uniform float u_dt;
uniform float u_dissipation;
out vec4 fragColor;
void main() {
  vec2 vel = texture(u_velocity, v_uv).xy;
  vec2 prevUV = v_uv - vel * u_dt * u_texelSize;
  prevUV = clamp(prevUV, vec2(0.0), vec2(1.0));
  fragColor = u_dissipation * texture(u_source, prevUV);
}`;

// Add force (Gaussian splat) — both velocity splat and dye splat use this
const SPLAT_SRC = /* glsl */`#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_base;
uniform vec2 u_point;   // in UV space
uniform vec3 u_color;
uniform float u_radius;
out vec4 fragColor;
void main() {
  vec2 d = v_uv - u_point;
  float splat = exp(-dot(d, d) / u_radius);
  fragColor = texture(u_base, v_uv) + vec4(u_color * splat, 0.0);
}`;

// Divergence of velocity field
const DIVERGENCE_SRC = /* glsl */`#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_velocity;
uniform vec2 u_texelSize;
out vec4 fragColor;
void main() {
  float L = texture(u_velocity, v_uv - vec2(u_texelSize.x, 0.0)).x;
  float R = texture(u_velocity, v_uv + vec2(u_texelSize.x, 0.0)).x;
  float T = texture(u_velocity, v_uv + vec2(0.0, u_texelSize.y)).y;
  float B = texture(u_velocity, v_uv - vec2(0.0, u_texelSize.y)).y;
  float div = 0.5 * (R - L + T - B);
  fragColor = vec4(div, 0.0, 0.0, 1.0);
}`;

// Jacobi iteration for pressure solve
const JACOBI_SRC = /* glsl */`#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_pressure;
uniform sampler2D u_divergence;
uniform vec2 u_texelSize;
out vec4 fragColor;
void main() {
  float L = texture(u_pressure, v_uv - vec2(u_texelSize.x, 0.0)).x;
  float R = texture(u_pressure, v_uv + vec2(u_texelSize.x, 0.0)).x;
  float T = texture(u_pressure, v_uv + vec2(0.0, u_texelSize.y)).x;
  float B = texture(u_pressure, v_uv - vec2(0.0, u_texelSize.y)).x;
  float div = texture(u_divergence, v_uv).x;
  float pressure = (L + R + T + B - div) * 0.25;
  fragColor = vec4(pressure, 0.0, 0.0, 1.0);
}`;

// Gradient subtraction — makes velocity field divergence-free
const GRADIENT_SUBTRACT_SRC = /* glsl */`#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_pressure;
uniform sampler2D u_velocity;
uniform vec2 u_texelSize;
out vec4 fragColor;
void main() {
  float L = texture(u_pressure, v_uv - vec2(u_texelSize.x, 0.0)).x;
  float R = texture(u_pressure, v_uv + vec2(u_texelSize.x, 0.0)).x;
  float T = texture(u_pressure, v_uv + vec2(0.0, u_texelSize.y)).x;
  float B = texture(u_pressure, v_uv - vec2(0.0, u_texelSize.y)).x;
  vec2 vel = texture(u_velocity, v_uv).xy;
  vel -= 0.5 * vec2(R - L, T - B);
  fragColor = vec4(vel, 0.0, 1.0);
}`;

// Display: tone-map dye to screen (dark background, glowing dye)
const DISPLAY_SRC = /* glsl */`#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_dye;
out vec4 fragColor;
void main() {
  vec3 dye = texture(u_dye, v_uv).rgb;
  // Soft tonemapping: brighter glow for concentrated dye
  vec3 color = 1.0 - exp(-dye * 2.0);
  // Darken near-zero to keep background black
  float lum = dot(color, vec3(0.299, 0.587, 0.114));
  color *= smoothstep(0.01, 0.12, lum);
  fragColor = vec4(color, 1.0);
}`;

// ── GL helpers ────────────────────────────────────────────────────────────────

function compileShader(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const s = gl.createShader(type)!;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    throw new Error(`Shader compile: ${gl.getShaderInfoLog(s)}`);
  }
  return s;
}

function makeProgram(gl: WebGL2RenderingContext, vertSrc: string, fragSrc: string): WebGLProgram {
  const prog = gl.createProgram()!;
  gl.attachShader(prog, compileShader(gl, gl.VERTEX_SHADER, vertSrc));
  gl.attachShader(prog, compileShader(gl, gl.FRAGMENT_SHADER, fragSrc));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    throw new Error(`Program link: ${gl.getProgramInfoLog(prog)}`);
  }
  return prog;
}

interface PingPong {
  read: WebGLFramebuffer;
  write: WebGLFramebuffer;
  readTex: WebGLTexture;
  writeTex: WebGLTexture;
  swap: () => void;
}

function makePingPong(
  gl: WebGL2RenderingContext,
  w: number,
  h: number,
  internalFormat: number,
  format: number,
  type: number
): PingPong {
  function makeTexFB(): [WebGLTexture, WebGLFramebuffer] {
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, w, h, 0, format, type, null);
    const fb = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    return [tex, fb];
  }
  const [readTex, read] = makeTexFB();
  const [writeTex, write] = makeTexFB();
  const pp: PingPong = {
    read, write, readTex, writeTex,
    swap() {
      [pp.read, pp.write] = [pp.write, pp.read];
      [pp.readTex, pp.writeTex] = [pp.writeTex, pp.readTex];
    }
  };
  return pp;
}

// ── Public factory ────────────────────────────────────────────────────────────

export function createFluidSim(canvas: HTMLCanvasElement): FluidSim | null {
  const glOrNull = canvas.getContext('webgl2', {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    preserveDrawingBuffer: false,
  }) as WebGL2RenderingContext | null;

  if (!glOrNull) return null;
  // Reassign to a definitely-non-null binding so closures below type-check cleanly.
  const gl: WebGL2RenderingContext = glOrNull;

  // Check float texture support
  const extFloat = gl.getExtension('EXT_color_buffer_float') ||
                   gl.getExtension('EXT_color_buffer_half_float');
  const useHalf = !gl.getExtension('EXT_color_buffer_float');
  const internalFmt = useHalf ? gl.RGBA16F : gl.RGBA32F;
  const pixelType = useHalf ? gl.HALF_FLOAT : gl.FLOAT;

  if (!extFloat) {
    // Fallback: try RGBA8 (won't look as good but won't crash)
    console.warn('Float textures not available; sim quality reduced');
  }

  const SIM_RES = 128;
  const DYE_RES = 512;

  const simW = SIM_RES;
  const simH = SIM_RES;
  const dyeW = DYE_RES;
  const dyeH = DYE_RES;

  // Compile programs
  const progAdvect = makeProgram(gl, VERT_SRC, ADVECT_SRC);
  const progSplat = makeProgram(gl, VERT_SRC, SPLAT_SRC);
  const progDiv = makeProgram(gl, VERT_SRC, DIVERGENCE_SRC);
  const progJacobi = makeProgram(gl, VERT_SRC, JACOBI_SRC);
  const progGrad = makeProgram(gl, VERT_SRC, GRADIENT_SUBTRACT_SRC);
  const progDisplay = makeProgram(gl, VERT_SRC, DISPLAY_SRC);

  // Fullscreen quad
  const quadBuf = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);

  function bindQuad(prog: WebGLProgram) {
    const loc = gl.getAttribLocation(prog, 'a_pos');
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  }

  function drawQuad() {
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  // Ping-pong buffers
  const velocity = makePingPong(gl, simW, simH, internalFmt, gl.RGBA, pixelType);
  const pressure = makePingPong(gl, simW, simH, internalFmt, gl.RGBA, pixelType);
  const dye = makePingPong(gl, dyeW, dyeH, internalFmt, gl.RGBA, pixelType);
  const divergenceTex = makePingPong(gl, simW, simH, internalFmt, gl.RGBA, pixelType);

  function setTex(prog: WebGLProgram, name: string, tex: WebGLTexture, unit: number) {
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.uniform1i(gl.getUniformLocation(prog, name), unit);
  }

  function runAdvect(source: PingPong, velocityBuf: PingPong, dt: number, dissipation: number, w: number, h: number) {
    gl.useProgram(progAdvect);
    bindQuad(progAdvect);
    setTex(progAdvect, 'u_velocity', velocityBuf.readTex, 0);
    setTex(progAdvect, 'u_source', source.readTex, 1);
    gl.uniform2f(gl.getUniformLocation(progAdvect, 'u_texelSize'), 1/w, 1/h);
    gl.uniform1f(gl.getUniformLocation(progAdvect, 'u_dt'), dt);
    gl.uniform1f(gl.getUniformLocation(progAdvect, 'u_dissipation'), dissipation);
    gl.bindFramebuffer(gl.FRAMEBUFFER, source.write);
    gl.viewport(0, 0, w, h);
    drawQuad();
    source.swap();
  }

  function step(dt: number) {
    // 1. Advect velocity by itself
    runAdvect(velocity, velocity, dt, 0.998, simW, simH);

    // 2. Advect dye by velocity
    runAdvect(dye, velocity, dt, 0.9985, dyeW, dyeH);

    // 3. Divergence
    gl.useProgram(progDiv);
    bindQuad(progDiv);
    setTex(progDiv, 'u_velocity', velocity.readTex, 0);
    gl.uniform2f(gl.getUniformLocation(progDiv, 'u_texelSize'), 1/simW, 1/simH);
    gl.bindFramebuffer(gl.FRAMEBUFFER, divergenceTex.write);
    gl.viewport(0, 0, simW, simH);
    drawQuad();
    divergenceTex.swap();

    // 4. Clear pressure
    gl.bindFramebuffer(gl.FRAMEBUFFER, pressure.read);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindFramebuffer(gl.FRAMEBUFFER, pressure.write);
    gl.clear(gl.COLOR_BUFFER_BIT);

    // 5. Jacobi pressure solve (20 iterations)
    gl.useProgram(progJacobi);
    bindQuad(progJacobi);
    setTex(progJacobi, 'u_divergence', divergenceTex.readTex, 1);
    gl.uniform2f(gl.getUniformLocation(progJacobi, 'u_texelSize'), 1/simW, 1/simH);
    for (let i = 0; i < 20; i++) {
      setTex(progJacobi, 'u_pressure', pressure.readTex, 0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, pressure.write);
      gl.viewport(0, 0, simW, simH);
      drawQuad();
      pressure.swap();
    }

    // 6. Gradient subtract
    gl.useProgram(progGrad);
    bindQuad(progGrad);
    setTex(progGrad, 'u_pressure', pressure.readTex, 0);
    setTex(progGrad, 'u_velocity', velocity.readTex, 1);
    gl.uniform2f(gl.getUniformLocation(progGrad, 'u_texelSize'), 1/simW, 1/simH);
    gl.bindFramebuffer(gl.FRAMEBUFFER, velocity.write);
    gl.viewport(0, 0, simW, simH);
    drawQuad();
    velocity.swap();
  }

  function splat(
    x: number, y: number,
    vx: number, vy: number,
    r: number, g: number, b: number,
    radius = 0.003
  ) {
    const uvX = x / canvas.width;
    const uvY = 1.0 - y / canvas.height;

    // Velocity splat
    gl.useProgram(progSplat);
    bindQuad(progSplat);
    setTex(progSplat, 'u_base', velocity.readTex, 0);
    gl.uniform2f(gl.getUniformLocation(progSplat, 'u_point'), uvX, uvY);
    gl.uniform3f(gl.getUniformLocation(progSplat, 'u_color'), vx * 0.0003, -vy * 0.0003, 0);
    gl.uniform1f(gl.getUniformLocation(progSplat, 'u_radius'), radius * 2.0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, velocity.write);
    gl.viewport(0, 0, simW, simH);
    drawQuad();
    velocity.swap();

    // Dye splat
    setTex(progSplat, 'u_base', dye.readTex, 0);
    gl.uniform2f(gl.getUniformLocation(progSplat, 'u_point'), uvX, uvY);
    gl.uniform3f(gl.getUniformLocation(progSplat, 'u_color'), r, g, b);
    gl.uniform1f(gl.getUniformLocation(progSplat, 'u_radius'), radius);
    gl.bindFramebuffer(gl.FRAMEBUFFER, dye.write);
    gl.viewport(0, 0, dyeW, dyeH);
    drawQuad();
    dye.swap();
  }

  function render() {
    gl.useProgram(progDisplay);
    bindQuad(progDisplay);
    setTex(progDisplay, 'u_dye', dye.readTex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    drawQuad();
  }

  function destroyPP(pp: PingPong) {
    gl.deleteFramebuffer(pp.read);
    gl.deleteFramebuffer(pp.write);
    gl.deleteTexture(pp.readTex);
    gl.deleteTexture(pp.writeTex);
  }

  function destroy() {
    destroyPP(velocity);
    destroyPP(pressure);
    destroyPP(dye);
    destroyPP(divergenceTex);
    gl.deleteBuffer(quadBuf);
    [progAdvect, progSplat, progDiv, progJacobi, progGrad, progDisplay].forEach(p => gl.deleteProgram(p));
    const ext = gl.getExtension('WEBGL_lose_context');
    if (ext) ext.loseContext();
  }

  return {
    gl,
    canvas,
    width: canvas.width,
    height: canvas.height,
    dyeWidth: dyeW,
    dyeHeight: dyeH,
    step,
    splat,
    render,
    destroy,
  };
}
