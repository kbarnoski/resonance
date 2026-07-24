// gl.ts — hand-rolled WebGL2 renderer for 2538-driver (no three.js).
// A reactive "equalizer city": a spectrum of glowing violet columns whose
// heights are driven by the live voice envelopes and the arrangement's energy
// scalar, over a receding club floor. Photosensitive-safe: brightness is a
// smoothly-drifting field, the kick contributes only a soft global lift (~2 Hz,
// well under 3 flashes/sec) and the background never approaches a white strobe.

export interface Uniforms {
  time: number;
  energy: number;
  tension: number;
  cutoff: number;
  kick: number;
  sub: number;
  clap: number;
  chat: number;
  ohat: number;
  acid: number;
  step: number;
}

const UNIFORM_NAMES = [
  "uRes",
  "uTime",
  "uEnergy",
  "uTension",
  "uCutoff",
  "uKick",
  "uSub",
  "uClap",
  "uChat",
  "uOhat",
  "uAcid",
  "uStep",
] as const;
type UniformName = (typeof UNIFORM_NAMES)[number];

const VERT = `#version 300 es
in vec2 aPos;
void main(){ gl_Position = vec4(aPos, 0.0, 1.0); }`;

const FRAG = `#version 300 es
precision highp float;
out vec4 frag;
uniform vec2 uRes;
uniform float uTime, uEnergy, uTension, uCutoff;
uniform float uKick, uSub, uClap, uChat, uOhat, uAcid;
uniform float uStep;

float gauss(float x, float c, float w){
  float d = (x - c) / w;
  return exp(-0.5 * d * d);
}
float hash(float n){ return fract(sin(n * 43758.5453123) * 12.9898); }

// Column spectrum height at normalised position x in [0,1].
float spectrum(float x){
  float h = 0.05 + 0.12 * uEnergy;
  h += 0.60 * uKick * gauss(x, 0.10, 0.05);
  h += 0.50 * uSub  * gauss(x, 0.04, 0.045);
  h += 0.42 * uClap * gauss(x, 0.48, 0.10);
  h += 0.55 * uAcid * gauss(x, 0.24 + 0.42 * uCutoff, 0.10);
  h += 0.30 * uChat * gauss(x, 0.80, 0.06);
  h += 0.36 * uOhat * gauss(x, 0.91, 0.07);
  // Living shimmer so the field breathes even when the mix is sparse.
  h += 0.045 * (0.4 + uEnergy) * sin(x * 34.0 + uTime * 2.4);
  return clamp(h, 0.0, 0.98);
}

void main(){
  vec2 uv = gl_FragCoord.xy / uRes;              // 0..1
  vec3 col = vec3(0.0);

  // ---- receding club floor (soft perspective grid) ----
  float horizon = 0.46;
  if(uv.y < horizon){
    float depth = 1.0 / (horizon - uv.y + 0.05);
    float fx = (uv.x - 0.5) * depth * 1.4;
    float fz = depth * 0.5 + uTime * 0.5;
    float gx = smoothstep(0.5, 0.46, abs(fract(fx) - 0.5));
    float gz = smoothstep(0.5, 0.46, abs(fract(fz) - 0.5));
    float grid = max(gx, gz);
    float fog = exp(-depth * 0.09);
    float floorPulse = 0.10 + 0.20 * uEnergy + 0.10 * uKick;
    col += vec3(0.32, 0.20, 0.62) * grid * fog * floorPulse;
  }

  // ---- equalizer city ----
  float N = 56.0;
  float colId = floor(uv.x * N);
  float cx = (colId + 0.5) / N;
  float within = fract(uv.x * N);
  float barMask = smoothstep(0.06, 0.16, within) * smoothstep(0.94, 0.84, within);
  float h = spectrum(cx);

  // Bars grow up from a baseline just under the horizon.
  float floorY = 0.12;
  float top = floorY + h;
  float below = smoothstep(top, top - 0.006, uv.y) * step(floorY, uv.y);
  float heightN = clamp((uv.y - floorY) / max(h, 0.001), 0.0, 1.0);

  vec3 lo = vec3(0.20, 0.09, 0.42);
  vec3 hi = vec3(0.62, 0.42, 0.98);
  vec3 tip = mix(vec3(0.78, 0.66, 1.0), vec3(0.82, 0.34, 0.92), uTension);
  vec3 barCol = mix(lo, hi, heightN);
  col += barCol * below * barMask * (0.55 + 0.45 * uEnergy);

  // Bright VU cap riding the top of each bar.
  float cap = exp(-abs(uv.y - top) * 90.0) * barMask;
  col += tip * cap * (0.6 + 0.4 * uTension);

  // Faint reflection under the baseline.
  float refY = floorY - (uv.y);
  if(uv.y < floorY){
    float rh = clamp((floorY - uv.y) / max(h, 0.001), 0.0, 1.0);
    float rmask = step(floorY - h * 0.4, uv.y);
    col += barCol * rmask * barMask * 0.10 * (1.0 - rh);
  }

  // Horizontal tension beams (kept low-contrast, slow).
  float beam = exp(-abs(fract(uv.y * 6.0 - uTime * 0.35) - 0.5) * 9.0);
  col += vec3(0.30, 0.16, 0.55) * beam * uTension * 0.10;

  // Playhead: a soft glow on the column under the current 16th step.
  float sweepX = (uStep + 0.5) / 16.0;
  col += vec3(0.26, 0.15, 0.52) * exp(-abs(cx - sweepX) * 22.0) * 0.16 * (0.3 + uEnergy);

  // Soft global lift on the kick — a gentle floor-flash, never black↔white.
  col += vec3(0.10, 0.06, 0.20) * uKick * 0.30;

  // Vignette + tone.
  vec2 d = uv - 0.5;
  float vig = 1.0 - dot(d, d) * 0.8;
  col *= vig;
  col = col / (col + 0.7);            // soft filmic knee, caps luminance
  col = pow(col, vec3(0.85));
  frag = vec4(col, 1.0);
}`;

export function hasWebGL2(): boolean {
  if (typeof document === "undefined") return false;
  try {
    return !!document.createElement("canvas").getContext("webgl2");
  } catch {
    return false;
  }
}

export class Renderer {
  private gl: WebGL2RenderingContext;
  private program: WebGLProgram;
  private vao: WebGLVertexArrayObject;
  private locs: Record<UniformName, WebGLUniformLocation | null>;
  private lost = false;

  constructor(canvas: HTMLCanvasElement) {
    const gl = canvas.getContext("webgl2", {
      antialias: true,
      alpha: false,
      premultipliedAlpha: false,
    });
    if (!gl) throw new Error("webgl2 unavailable");
    this.gl = gl;

    const prog = gl.createProgram();
    if (!prog) throw new Error("program alloc failed");
    const vs = this.compile(gl.VERTEX_SHADER, VERT);
    const fs = this.compile(gl.FRAGMENT_SHADER, FRAG);
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(prog) ?? "link failed");
    }
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    this.program = prog;

    const vao = gl.createVertexArray();
    if (!vao) throw new Error("vao alloc failed");
    this.vao = vao;
    gl.bindVertexArray(vao);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 3, -1, -1, 3]),
      gl.STATIC_DRAW,
    );
    const posLoc = gl.getAttribLocation(prog, "aPos");
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    const locs = {} as Record<UniformName, WebGLUniformLocation | null>;
    for (const n of UNIFORM_NAMES) locs[n] = gl.getUniformLocation(prog, n);
    this.locs = locs;
  }

  private compile(type: number, src: string): WebGLShader {
    const gl = this.gl;
    const sh = gl.createShader(type);
    if (!sh) throw new Error("shader alloc failed");
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      throw new Error(gl.getShaderInfoLog(sh) ?? "compile failed");
    }
    return sh;
  }

  render(u: Uniforms, width: number, height: number): void {
    if (this.lost) return;
    const gl = this.gl;
    gl.viewport(0, 0, width, height);
    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);
    const L = this.locs;
    gl.uniform2f(L.uRes, width, height);
    gl.uniform1f(L.uTime, u.time);
    gl.uniform1f(L.uEnergy, u.energy);
    gl.uniform1f(L.uTension, u.tension);
    gl.uniform1f(L.uCutoff, u.cutoff);
    gl.uniform1f(L.uKick, u.kick);
    gl.uniform1f(L.uSub, u.sub);
    gl.uniform1f(L.uClap, u.clap);
    gl.uniform1f(L.uChat, u.chat);
    gl.uniform1f(L.uOhat, u.ohat);
    gl.uniform1f(L.uAcid, u.acid);
    gl.uniform1f(L.uStep, u.step);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
  }

  dispose(): void {
    this.lost = true;
    const gl = this.gl;
    try {
      gl.deleteProgram(this.program);
      gl.deleteVertexArray(this.vao);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    } catch {
      /* ignore */
    }
  }
}
