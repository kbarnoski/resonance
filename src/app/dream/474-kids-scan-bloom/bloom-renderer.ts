/**
 * bloom-renderer.ts
 *
 * WebGL2 renderer for the Scanned Synthesis flower bloom.
 * The outline geometry is rebuilt each frame from r[] (the wavetable),
 * so the shape you SEE is the waveform you HEAR.
 *
 * Two draw passes:
 *   1. Additive glow — bloom filled with a soft radial gradient (uniform-based).
 *   2. Bright rim — the outline itself as a LINE_STRIP, additively blended.
 *
 * All GL resources are tracked in BloomGLState and disposed via disposeGL().
 */

export interface BloomGLState {
  gl: WebGL2RenderingContext;
  fillProg: WebGLProgram;
  rimProg: WebGLProgram;
  vao: WebGLVertexArrayObject;
  vbo: WebGLBuffer;
  N: number;
}

// ── Shader sources ────────────────────────────────────────────────────────────

const FILL_VERT = /* glsl */ `#version 300 es
precision highp float;
in vec2 aPos;           // NDC vertex
uniform vec2 uCenter;   // NDC center of bloom
out vec2 vLocal;        // local offset from center
void main() {
  vLocal = aPos - uCenter;
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`;

const FILL_FRAG = /* glsl */ `#version 300 es
precision highp float;
in  vec2  vLocal;
uniform vec3  uColor;         // warm petal colour
uniform float uRadius;        // bloom base radius in NDC
uniform float uGlow;          // 0..1 extra glow pulse
out vec4 fragColor;
void main() {
  float d = length(vLocal);
  // Radial soft glow — bright at centre, fades beyond bloom edge
  float t = 1.0 - smoothstep(0.0, uRadius * 1.4, d);
  float core = 1.0 - smoothstep(0.0, uRadius * 0.35, d);
  vec3 col = uColor * (t * 0.55 + core * 0.45 + uGlow * 0.15);
  // Additive blend — alpha = luminance
  float a = clamp(t * 0.8 + core * 0.5, 0.0, 1.0);
  fragColor = vec4(col * a, a);
}
`;

const RIM_VERT = /* glsl */ `#version 300 es
precision highp float;
in vec2 aPos;
void main() {
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`;

const RIM_FRAG = /* glsl */ `#version 300 es
precision highp float;
uniform vec3  uRimColor;
uniform float uBrightness;
out vec4 fragColor;
void main() {
  vec3 col = uRimColor * uBrightness;
  fragColor = vec4(col, 1.0);
}
`;

// ── Helpers ───────────────────────────────────────────────────────────────────

function compileShader(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    throw new Error("Shader compile: " + gl.getShaderInfoLog(sh));
  }
  return sh;
}

function linkProgram(gl: WebGL2RenderingContext, vert: string, frag: string): WebGLProgram {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vert);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, frag);
  const prog = gl.createProgram()!;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    throw new Error("Program link: " + gl.getProgramInfoLog(prog));
  }
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  return prog;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * makeBloomGL — create all GL objects.
 * Call once after getting a WebGL2 context.
 */
export function makeBloomGL(canvas: HTMLCanvasElement): BloomGLState | null {
  const gl = canvas.getContext("webgl2", {
    alpha: true,
    premultipliedAlpha: false,
    antialias: true,
  });
  if (!gl) return null;

  const fillProg = linkProgram(gl, FILL_VERT, FILL_FRAG);
  const rimProg  = linkProgram(gl, RIM_VERT,  RIM_FRAG);

  const vao = gl.createVertexArray()!;
  const vbo = gl.createBuffer()!;

  const N = 128;
  // Pre-allocate VBO for up to (N+2) vertices × 2 floats
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, (N + 2) * 2 * 4, gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);

  // Enable additive blending
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE);

  return { gl, fillProg, rimProg, vao, vbo, N };
}

/**
 * drawBloom — render one frame.
 * @param state    GL state from makeBloomGL
 * @param r        Float32Array(128) radial deviations from the worklet
 * @param glowPulse extra brightness pulse 0..1 (e.g. on squeeze)
 * @param petalColor HSL warm colour [r,g,b] 0..1
 */
export function drawBloom(
  state: BloomGLState,
  r: Float32Array,
  glowPulse: number,
  petalColor: [number, number, number],
  time: number,
): void {
  const { gl, fillProg, rimProg, vao, vbo, N } = state;
  const cw = gl.canvas.width;
  const ch = gl.canvas.height;

  gl.viewport(0, 0, cw, ch);
  gl.clearColor(0.04, 0.02, 0.08, 1.0);
  gl.clear(gl.COLOR_BUFFER_BIT);

  // Aspect-corrected base radius ~28% of shorter side
  const aspect = cw / ch;
  const baseR = 0.28;

  // Center in NDC
  const cx = 0.0;
  const cy = 0.0;

  // Build outline vertices in NDC — the wavetable IS the shape
  const verts = new Float32Array((N + 2) * 2);
  // Gentle 5-petal lobe base (visual aid, same period as worklet seed)
  for (let i = 0; i <= N; i++) {
    const ii = i % N;
    const theta = (ii / N) * Math.PI * 2;
    // 5-petal base lobe contributes to visible flower shape
    const lobe = 0.10 * Math.cos(5 * theta + time * 0.3);
    const rad  = baseR + lobe + r[ii] * 0.18;
    // Aspect correction
    verts[i * 2]     = cx + (rad / (aspect > 1 ? aspect : 1)) * Math.cos(theta);
    verts[i * 2 + 1] = cy + (rad * (aspect < 1 ? aspect : 1)) * Math.sin(theta);
  }
  // Close the loop
  verts[N * 2]     = verts[0];
  verts[N * 2 + 1] = verts[1];

  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferSubData(gl.ARRAY_BUFFER, 0, verts);

  // ── Pass 1: filled glow (triangle fan from centre) ──────────────────────
  // Build triangle fan: centre + N+1 outline verts
  const fanVerts = new Float32Array((N + 2) * 2);
  fanVerts[0] = cx;
  fanVerts[1] = cy;
  for (let i = 0; i <= N; i++) {
    fanVerts[(i + 1) * 2]     = verts[i * 2];
    fanVerts[(i + 1) * 2 + 1] = verts[i * 2 + 1];
  }

  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferSubData(gl.ARRAY_BUFFER, 0, fanVerts);
  gl.bindVertexArray(vao);

  gl.useProgram(fillProg);
  const uCenter  = gl.getUniformLocation(fillProg, "uCenter");
  const uColor   = gl.getUniformLocation(fillProg, "uColor");
  const uRadius  = gl.getUniformLocation(fillProg, "uRadius");
  const uGlow    = gl.getUniformLocation(fillProg, "uGlow");
  gl.uniform2f(uCenter, cx, cy);
  gl.uniform3fv(uColor, petalColor);
  gl.uniform1f(uRadius, baseR);
  gl.uniform1f(uGlow, glowPulse);
  gl.drawArrays(gl.TRIANGLE_FAN, 0, N + 2);

  // ── Pass 2: bright additive rim ─────────────────────────────────────────
  // Upload outline verts
  gl.bufferSubData(gl.ARRAY_BUFFER, 0, verts.subarray(0, (N + 1) * 2));
  gl.useProgram(rimProg);
  const uRimColor   = gl.getUniformLocation(rimProg, "uRimColor");
  const uBrightness = gl.getUniformLocation(rimProg, "uBrightness");
  // Rim is brighter version of petal colour + warm white tint
  gl.uniform3f(uRimColor,
    Math.min(1, petalColor[0] * 1.3 + 0.4),
    Math.min(1, petalColor[1] * 1.3 + 0.3),
    Math.min(1, petalColor[2] * 1.3 + 0.5)
  );
  gl.uniform1f(uBrightness, 0.7 + glowPulse * 0.5);
  gl.lineWidth(2.5);
  gl.drawArrays(gl.LINE_STRIP, 0, N + 1);

  gl.bindVertexArray(null);
}

/**
 * resizeGL — call on canvas resize.
 */
export function resizeGL(state: BloomGLState, w: number, h: number): void {
  state.gl.canvas.width  = w;
  state.gl.canvas.height = h;
}

/**
 * disposeGL — free all GPU resources.
 */
export function disposeGL(state: BloomGLState): void {
  const { gl, fillProg, rimProg, vao, vbo } = state;
  gl.deleteProgram(fillProg);
  gl.deleteProgram(rimProg);
  gl.deleteVertexArray(vao);
  gl.deleteBuffer(vbo);
}
