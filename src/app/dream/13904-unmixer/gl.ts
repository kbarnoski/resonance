// ─────────────────────────────────────────────────────────────────────────────
// gl.ts — WebGL2 dual-field renderer for the un-mixer.
//
// Two interleaved fields make the separation legible:
//   • HARMONIC → smooth horizontal ICE/CYAN ridges (sustained bands), brightness
//     driven by the live harmonic level.
//   • PERCUSSIVE → vertical VIOLET sparks/columns that flash on attacks,
//     brightness + density driven by the live percussive level.
// Solo the harmonic layer and the ridges dominate; solo the percussive and the
// sparks take over. Near-black ground. Cool palette only — no warm/amber.
//
// Attribute-less full-screen triangle (gl_VertexID). Full teardown on dispose().
// ─────────────────────────────────────────────────────────────────────────────

const VERT = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;
out vec4 outColor;
uniform vec2 uRes;
uniform float uTime;
uniform float uHarm;   // 0..~1 live harmonic level
uniform float uPerc;   // 0..~1 live percussive level

float hash(float x) { return fract(sin(x * 127.11) * 43758.5453); }

void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  float t = uTime;

  // ── harmonic ridges (horizontal, cyan) ──────────────────────────────────
  float ridge = 0.0;
  for (int i = 0; i < 6; i++) {
    float fi = float(i);
    float freq = 5.0 + fi * 3.5;
    float ph = t * (0.18 + fi * 0.04) + fi * 1.7;
    float y = uv.y + 0.018 * sin(uv.x * 3.0 + t * 0.25 + fi * 1.3);
    float band = sin(y * freq * 3.14159 + ph);
    float m = smoothstep(0.86, 1.0, band);
    ridge += m * (0.55 / (1.0 + fi * 0.35));
  }
  ridge *= (0.16 + uHarm * 1.7);

  // ── percussive sparks (vertical columns, violet) ────────────────────────
  float cols = 56.0;
  float col = floor(uv.x * cols);
  float seed = hash(col);
  float rate = 1.2 + seed * 4.5;
  float phase = fract(t * rate + seed * 10.0);
  float flash = exp(-phase * 7.0);           // sharp transient decay
  float cx = fract(uv.x * cols) - 0.5;
  float streak = smoothstep(0.42, 0.06, abs(cx));
  float vgrad = 0.45 + 0.55 * sin(uv.y * 22.0 - t * 5.0 * rate + seed * 6.28);
  float spark = flash * streak * max(vgrad, 0.0);
  // second, sparser layer for depth
  float col2 = floor(uv.x * cols * 0.5 + 0.5);
  float seed2 = hash(col2 + 99.0);
  float flash2 = exp(-fract(t * (0.8 + seed2 * 2.0) + seed2 * 5.0) * 5.0);
  spark += 0.5 * flash2 * smoothstep(0.5, 0.1, abs(fract(uv.x * cols * 0.5 + 0.5) - 0.5));
  spark *= (0.1 + uPerc * 2.1);

  vec3 iceCyan = vec3(0.42, 0.86, 1.0);
  vec3 violet  = vec3(0.60, 0.36, 0.99);
  vec3 c = ridge * iceCyan + spark * violet;

  // faint vertical drift haze so black is never dead
  c += vec3(0.015, 0.022, 0.045) * (0.6 + 0.4 * sin(uv.y * 3.0 - t * 0.2));

  // gentle vignette
  vec2 d = uv - 0.5;
  c *= 1.0 - dot(d, d) * 0.7;

  outColor = vec4(c, 1.0);
}`;

export interface DualField {
  render(timeSeconds: number): void;
  setLevels(harm: number, perc: number): void;
  resize(): void;
  dispose(): void;
}

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type);
  if (!sh) throw new Error("shader alloc failed");
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh) ?? "unknown";
    gl.deleteShader(sh);
    throw new Error("shader compile error: " + log);
  }
  return sh;
}

/** Create the renderer, or return null if WebGL2 is unavailable. */
export function createDualField(canvas: HTMLCanvasElement): DualField | null {
  const gl = canvas.getContext("webgl2", {
    antialias: false,
    alpha: false,
    powerPreference: "high-performance",
  });
  if (!gl) return null;
  const glc: WebGL2RenderingContext = gl;

  const vs = compile(gl, gl.VERTEX_SHADER, VERT);
  const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
  const prog = gl.createProgram();
  if (!prog) return null;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(prog) ?? "unknown";
    gl.deleteProgram(prog);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    throw new Error("program link error: " + log);
  }
  const vao = gl.createVertexArray();

  const uRes = gl.getUniformLocation(prog, "uRes");
  const uTime = gl.getUniformLocation(prog, "uTime");
  const uHarm = gl.getUniformLocation(prog, "uHarm");
  const uPerc = gl.getUniformLocation(prog, "uPerc");

  let harm = 0;
  let perc = 0;

  function resize(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.floor(canvas.clientWidth * dpr));
    const h = Math.max(1, Math.floor(canvas.clientHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    glc.viewport(0, 0, canvas.width, canvas.height);
  }
  resize();

  return {
    setLevels(h: number, p: number) {
      harm = h;
      perc = p;
    },
    resize,
    render(timeSeconds: number) {
      glc.useProgram(prog);
      glc.bindVertexArray(vao);
      glc.uniform2f(uRes, canvas.width, canvas.height);
      glc.uniform1f(uTime, timeSeconds);
      glc.uniform1f(uHarm, harm);
      glc.uniform1f(uPerc, perc);
      glc.drawArrays(glc.TRIANGLES, 0, 3);
    },
    dispose() {
      try {
        glc.deleteProgram(prog);
        glc.deleteShader(vs);
        glc.deleteShader(fs);
        if (vao) glc.deleteVertexArray(vao);
        const lose = glc.getExtension("WEBGL_lose_context");
        if (lose) lose.loseContext();
      } catch {
        /* context already gone */
      }
    },
  };
}
